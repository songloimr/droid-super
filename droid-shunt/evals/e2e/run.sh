#!/usr/bin/env bash
# Runner for e2e A/B benchmark between baseline (shunt uninstalled) and shunt (shunt installed)
# Supports concurrency via background jobs and queue management

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EVALS_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PLUGIN_ROOT="$(cd "${EVALS_DIR}/.." && pwd)"

EVAL_TARGET="${EVAL_TARGET:-9router-next}"
TARGET_REPO=$(node "${EVALS_DIR}/targets.mjs" "${EVAL_TARGET}" repoRoot)
TASKS_FILE=$(node "${EVALS_DIR}/targets.mjs" "${EVAL_TARGET}" tasksFile)
RESULTS_DIR=$(node "${EVALS_DIR}/targets.mjs" "${EVAL_TARGET}" resultsDir)
SESSIONS_DIR=$(node "${EVALS_DIR}/targets.mjs" "${EVAL_TARGET}" sessionsDir)

mkdir -p "${RESULTS_DIR}" "${SESSIONS_DIR}"

MODE="${1:---smoke}"
CONCURRENCY="${EVAL_CONCURRENCY:-4}"
PARENT_MODEL="${PARENT_MODEL:-custom:Mimo-V2.6-Pro-0}"
EVAL_RUNS="${EVAL_RUNS:-3}"

# Clean up legacy settings file if present
rm -f "/tmp/9router-eval-settings-disable.json"

# Trap handler to ensure plugin is always reinstalled on exit
restore_plugin() {
  echo "[TRAP] Ensuring droid-shunt plugin is restored..."
  droid plugin install droid-shunt@droid-super --scope user >/dev/null 2>&1 || true
}
trap restore_plugin EXIT INT TERM

# Compute target safety baseline
compute_manifest() {
  local out_file="$1"
  (cd "${TARGET_REPO}" && find . -type f ! -name ".DS_Store" | LC_ALL=C sort | while IFS= read -r f; do
    shasum -a 256 "$f"
  done) > "${out_file}"
}

IS_GIT_TARGET=0
if git -C "${TARGET_REPO}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  IS_GIT_TARGET=1
  INITIAL_GIT_STATUS=$(git -C "${TARGET_REPO}" status --short --branch)
  echo "=== Target repo initial status (git) ==="
  echo "${INITIAL_GIT_STATUS}"
  echo "========================================"
else
  INITIAL_MANIFEST="${RESULTS_DIR}/target_manifest_initial.txt"
  echo "=== Target is not a git repo. Computing sha256 manifest ==="
  compute_manifest "${INITIAL_MANIFEST}"
  echo "Manifest written to ${INITIAL_MANIFEST} ($(wc -l < "${INITIAL_MANIFEST}" | tr -d ' ') files)"
  echo "=========================================================="
fi

check_safety() {
  if [ "${IS_GIT_TARGET}" -eq 1 ]; then
    local cur_status
    cur_status=$(git -C "${TARGET_REPO}" status --short --branch)
    if [ "${cur_status}" != "${INITIAL_GIT_STATUS}" ]; then
      echo "ERROR: Target repo status changed! Aborting!"
      restore_plugin
      exit 99
    fi
  else
    local cur_manifest="${RESULTS_DIR}/.target_manifest_${config}_${task_id}_${run_num}_${BASHPID:-$$}.txt"
    compute_manifest "${cur_manifest}"
    if ! cmp -s "${INITIAL_MANIFEST}" "${cur_manifest}"; then
      echo "ERROR: Target directory manifest changed! Aborting!"
      diff -u "${INITIAL_MANIFEST}" "${cur_manifest}" || true
      rm -f "${cur_manifest}"
      restore_plugin
      exit 99
    fi
    rm -f "${cur_manifest}"
  fi
}

run_single() {
  local task_id="$1"
  local run_num="$2"
  local config="$3"
  local prompt="$4"
  local out_file="${SESSIONS_DIR}/${config}_${task_id}_run${run_num}.json"

  if [ -f "${out_file}" ] && [ -s "${out_file}" ]; then
    echo "[SKIP] ${config} ${task_id} run ${run_num}"
    return 0
  fi

  echo "[START] ${config} ${task_id} run ${run_num}..."
  local start_time
  start_time=$(python3 -c 'import time; print(int(time.time() * 1000))')
  local tmp_stream="/tmp/droid_eval_${config}_${task_id}_${run_num}_${BASHPID:-$$}.jsonl"

  set +e
  droid exec \
    --auto high \
    -m "${PARENT_MODEL}" \
    --cwd "${TARGET_REPO}" \
    --output-format stream-json \
    "${prompt}" > "${tmp_stream}" 2>&1
  local exit_code=$?
  set -e

  local end_time
  end_time=$(python3 -c 'import time; print(int(time.time() * 1000))')
  local wall_time_ms=$((end_time - start_time))

  node -e '
    const fs = require("fs");
    const streamPath = process.argv[1];
    const outPath = process.argv[2];
    const meta = JSON.parse(process.argv[3]);

    let lines = [];
    if (fs.existsSync(streamPath)) {
      lines = fs.readFileSync(streamPath, "utf-8").trim().split("\n").filter(Boolean);
    }

    let completion = null;
    let toolCalls = [];
    let toolResults = [];
    let assistantMessages = [];
    let readCalls = 0;
    let hookBlocks = 0;
    let taskDelegations = 0;
    let finalAnswer = "";

    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.type === "completion") completion = obj;
        if (obj.type === "tool_call") {
          toolCalls.push(obj);
          if (obj.toolName === "Read" || obj.toolId === "Read") readCalls++;
          if (obj.toolName === "Task" || obj.toolId === "Task") taskDelegations++;
        }
        if (obj.type === "tool_result") {
          toolResults.push(obj);
          const errStr = String(obj.error?.message || obj.error || obj.text || "");
          if (errStr.includes("threshold: 350") || (obj.isError && errStr.includes("threshold:"))) {
            hookBlocks++;
          }
        }
        if (obj.type === "message" && obj.role === "assistant") {
          assistantMessages.push(obj.text || "");
          finalAnswer = obj.text || finalAnswer;
        }
      } catch (err) {}
    }

    const usage = completion && completion.usage ? completion.usage : {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0
    };

    const sessionResult = {
      ...meta,
      exit_code: meta.exit_code,
      wall_time_ms: meta.wall_time_ms,
      usage,
      read_calls_count: readCalls,
      hook_blocks_count: hookBlocks,
      task_delegations_count: taskDelegations,
      num_turns: completion ? completion.numTurns : assistantMessages.length,
      final_answer: completion && completion.finalText ? completion.finalText : finalAnswer
    };

    fs.mkdirSync(require("path").dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(sessionResult, null, 2));
  ' "${tmp_stream}" "${out_file}" "{\"task_id\":\"${task_id}\",\"run_num\":${run_num},\"config\":\"${config}\",\"target\":\"${EVAL_TARGET}\",\"wall_time_ms\":${wall_time_ms},\"exit_code\":${exit_code},\"parent_model\":\"${PARENT_MODEL}\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"

  rm -f "${tmp_stream}"
  echo "[DONE] ${config} ${task_id} run ${run_num} in $((wall_time_ms / 1000))s"

  # Validate safety invariant
  check_safety
}

export -f run_single
export -f check_safety
export -f compute_manifest
export -f restore_plugin
export SESSIONS_DIR
export RESULTS_DIR
export TARGET_REPO
export PARENT_MODEL
export EVAL_TARGET
export IS_GIT_TARGET
export INITIAL_GIT_STATUS="${INITIAL_GIT_STATUS:-}"
export INITIAL_MANIFEST="${INITIAL_MANIFEST:-}"

if [ "${MODE}" = "--smoke" ]; then
  echo "=== Running Smoke Test: 1 Task x 1 Run x 2 Configs [${EVAL_TARGET}] ==="
  SMOKE_PROMPT=$(jq -r '.[0].prompt' "${TASKS_FILE}")
  SMOKE_TASK_ID=$(jq -r '.[0].id' "${TASKS_FILE}")

  echo ">>> Phase B (Baseline, uninstall plugin) <<<"
  droid plugin uninstall droid-shunt@droid-super --scope user || true
  run_single "${SMOKE_TASK_ID}" 1 "baseline" "${SMOKE_PROMPT}"

  echo ">>> Phase A (Shunt, reinstall plugin) <<<"
  droid plugin install droid-shunt@droid-super --scope user
  run_single "${SMOKE_TASK_ID}" 1 "shunt" "${SMOKE_PROMPT}"

  echo "=== Smoke test completed successfully ==="
  exit 0
fi

if [ "${MODE}" = "--all" ]; then
  TASKS_COUNT=$(jq 'length' "${TASKS_FILE}")
  echo "=== Running Full E2E Benchmark: ${TASKS_COUNT} Tasks x ${EVAL_RUNS} Runs x 2 Configs ($((TASKS_COUNT * EVAL_RUNS * 2)) sessions) [${EVAL_TARGET}] ==="
  echo "Concurrency: ${CONCURRENCY}"

  echo ">>> PHASE B: Baseline (Plugin uninstalled) <<<"
  droid plugin uninstall droid-shunt@droid-super --scope user || true
  for run in $(seq 1 "${EVAL_RUNS}"); do
    for i in $(seq 0 $((TASKS_COUNT - 1))); do
      tid=$(jq -r ".[$i].id" "${TASKS_FILE}")
      p=$(jq -r ".[$i].prompt" "${TASKS_FILE}")
      run_single "${tid}" "${run}" "baseline" "${p}" &
      while [ "$(jobs -r | wc -l)" -ge "${CONCURRENCY}" ]; do
        sleep 1
      done
    done
  done
  wait

  echo ">>> PHASE A: Shunt (Plugin installed) <<<"
  droid plugin install droid-shunt@droid-super --scope user
  for run in $(seq 1 "${EVAL_RUNS}"); do
    for i in $(seq 0 $((TASKS_COUNT - 1))); do
      tid=$(jq -r ".[$i].id" "${TASKS_FILE}")
      p=$(jq -r ".[$i].prompt" "${TASKS_FILE}")
      run_single "${tid}" "${run}" "shunt" "${p}" &
      while [ "$(jobs -r | wc -l)" -ge "${CONCURRENCY}" ]; do
        sleep 1
      done
    done
  done
  wait

  echo "=== All $((TASKS_COUNT * EVAL_RUNS * 2)) sessions finished ==="
fi
