#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveTarget } from '../targets.mjs';

const target = resolveTarget(process.env.EVAL_TARGET);
const TASKS_PATH = target.tasksFile;
const SESSIONS_DIR = target.sessionsDir;
const GRADED_PATH = target.e2eGradedFile;
const SUMMARY_PATH = target.e2eSummaryFile;
const JUDGE_MODEL = process.env.PARENT_MODEL || 'custom:Mimo-V2.6-Pro-0';

if (!fs.existsSync(TASKS_PATH)) {
  console.error(`Tasks file not found: ${TASKS_PATH}`);
  process.exit(1);
}

if (!fs.existsSync(SESSIONS_DIR)) {
  console.error(`Sessions dir not found: ${SESSIONS_DIR}`);
  process.exit(1);
}

const tasks = JSON.parse(fs.readFileSync(TASKS_PATH, 'utf-8'));
const sessionFiles = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));

console.log(`Found ${sessionFiles.length} session result files in ${SESSIONS_DIR} [${target.target}].`);

function runJudge(prompt) {
  const res = spawnSync('droid', [
    'exec',
    '-m', JUDGE_MODEL,
    '--only-tools', '',
    prompt
  ], {
    encoding: 'utf-8',
    timeout: 180000
  });
  return res.stdout || '';
}

const sessionsByConfig = {
  baseline: [],
  shunt: []
};

const taskMap = new Map();
for (const t of tasks) taskMap.set(t.id, t);

for (const file of sessionFiles) {
  const filePath = path.join(SESSIONS_DIR, file);
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (data.config === 'baseline') sessionsByConfig.baseline.push(data);
    else if (data.config === 'shunt') sessionsByConfig.shunt.push(data);
  } catch (err) {}
}

console.log(`Baseline sessions: ${sessionsByConfig.baseline.length}`);
console.log(`Shunt sessions: ${sessionsByConfig.shunt.length}`);

// Grade each session:
// 1. Checklist facts coverage
// 2. Delegation correctness (did it delegate when recommended? did it avoid when not?)
// 3. Context pollution metrics (tokens, large reads into parent)
function evaluateSession(session) {
  const task = taskMap.get(session.task_id);
  if (!task) return null;

  const facts = task.facts_checklist || [];
  const text = (session.final_answer || '').toLowerCase();
  const matchedFacts = facts.filter(f => text.includes(f.toLowerCase()));
  const factsAccuracy = facts.length > 0 ? matchedFacts.length / facts.length : 1;

  // Delegation correctness
  let delegationCorrect = true;
  if (task.category === 'delegate-yes') {
    // Should delegate or be blocked by hook
    delegationCorrect = session.task_delegations_count > 0 || session.hook_blocks_count > 0;
  } else if (task.category === 'delegate-no' || task.category === 'control-small') {
    // Should NOT delegate
    delegationCorrect = session.task_delegations_count === 0;
  }

  return {
    task_id: session.task_id,
    run_num: session.run_num,
    config: session.config,
    category: task.category,
    wall_time_ms: session.wall_time_ms,
    input_tokens: session.usage?.input_tokens || 0,
    output_tokens: session.usage?.output_tokens || 0,
    cache_read_tokens: session.usage?.cache_read_input_tokens || 0,
    total_tokens: (session.usage?.input_tokens || 0) + (session.usage?.output_tokens || 0),
    read_calls_count: session.read_calls_count || 0,
    hook_blocks_count: session.hook_blocks_count || 0,
    task_delegations_count: session.task_delegations_count || 0,
    facts_accuracy: factsAccuracy,
    matched_facts: matchedFacts,
    total_facts: facts.length,
    delegation_correct: delegationCorrect
  };
}

const evaluatedBaseline = sessionsByConfig.baseline.map(evaluateSession).filter(Boolean);
const evaluatedShunt = sessionsByConfig.shunt.map(evaluateSession).filter(Boolean);

function aggregateMetrics(evalList) {
  const count = evalList.length;
  if (count === 0) return {};

  const sumInput = evalList.reduce((acc, s) => acc + s.input_tokens, 0);
  const sumOutput = evalList.reduce((acc, s) => acc + s.output_tokens, 0);
  const sumTotal = evalList.reduce((acc, s) => acc + s.total_tokens, 0);
  const sumTime = evalList.reduce((acc, s) => acc + s.wall_time_ms, 0);
  const sumRead = evalList.reduce((acc, s) => acc + s.read_calls_count, 0);
  const sumBlocks = evalList.reduce((acc, s) => acc + s.hook_blocks_count, 0);
  const sumDelegations = evalList.reduce((acc, s) => acc + s.task_delegations_count, 0);
  const sumFactsAcc = evalList.reduce((acc, s) => acc + s.facts_accuracy, 0);
  const sumDelegationCorrect = evalList.reduce((acc, s) => acc + (s.delegation_correct ? 1 : 0), 0);

  // Group by category
  const byCategory = {};
  for (const s of evalList) {
    if (!byCategory[s.category]) {
      byCategory[s.category] = { count: 0, total_tokens: 0, wall_time_ms: 0, facts_acc: 0, delegation_correct: 0 };
    }
    const c = byCategory[s.category];
    c.count++;
    c.total_tokens += s.total_tokens;
    c.wall_time_ms += s.wall_time_ms;
    c.facts_acc += s.facts_accuracy;
    if (s.delegation_correct) c.delegation_correct++;
  }

  for (const k of Object.keys(byCategory)) {
    const c = byCategory[k];
    c.avg_tokens = Math.round(c.total_tokens / c.count);
    c.avg_wall_time_s = Number((c.wall_time_ms / c.count / 1000).toFixed(1));
    c.facts_accuracy = Number((c.facts_acc / c.count).toFixed(4));
    c.delegation_correctness = Number((c.delegation_correct / c.count).toFixed(4));
  }

  return {
    sessions_count: count,
    avg_input_tokens: Math.round(sumInput / count),
    avg_output_tokens: Math.round(sumOutput / count),
    avg_total_tokens: Math.round(sumTotal / count),
    avg_wall_time_s: Number((sumTime / count / 1000).toFixed(1)),
    avg_read_calls: Number((sumRead / count).toFixed(2)),
    total_hook_blocks: sumBlocks,
    total_delegations: sumDelegations,
    overall_facts_accuracy: Number((sumFactsAcc / count).toFixed(4)),
    delegation_correctness_rate: Number((sumDelegationCorrect / count).toFixed(4)),
    by_category: byCategory
  };
}

const baselineAgg = aggregateMetrics(evaluatedBaseline);
const shuntAgg = aggregateMetrics(evaluatedShunt);

// Calculate A/B comparison deltas
const comparison = {
  target: target.target,
  timestamp: new Date().toISOString(),
  sessions_baseline: baselineAgg.sessions_count || 0,
  sessions_shunt: shuntAgg.sessions_count || 0,
  token_reduction_pct: baselineAgg.avg_total_tokens > 0 
    ? Number((((baselineAgg.avg_total_tokens - shuntAgg.avg_total_tokens) / baselineAgg.avg_total_tokens) * 100).toFixed(2))
    : 0,
  wall_time_change_pct: baselineAgg.avg_wall_time_s > 0
    ? Number((((shuntAgg.avg_wall_time_s - baselineAgg.avg_wall_time_s) / baselineAgg.avg_wall_time_s) * 100).toFixed(2))
    : 0,
  accuracy_delta: Number(((shuntAgg.overall_facts_accuracy || 0) - (baselineAgg.overall_facts_accuracy || 0)).toFixed(4)),
  baseline: baselineAgg,
  shunt: shuntAgg
};

fs.mkdirSync(path.dirname(SUMMARY_PATH), { recursive: true });
fs.writeFileSync(SUMMARY_PATH, JSON.stringify(comparison, null, 2));
fs.writeFileSync(GRADED_PATH, JSON.stringify({ baseline: evaluatedBaseline, shunt: evaluatedShunt }, null, 2));

console.log('\n=== E2E A/B Comparison Summary ===');
console.log(`Target: ${target.target}`);
console.log(`Baseline Avg Tokens: ${baselineAgg.avg_total_tokens || 0} | Shunt Avg Tokens: ${shuntAgg.avg_total_tokens || 0} (Reduction: ${comparison.token_reduction_pct}%)`);
console.log(`Baseline Avg Wall Time: ${baselineAgg.avg_wall_time_s || 0}s | Shunt Avg Wall Time: ${shuntAgg.avg_wall_time_s || 0}s`);
console.log(`Baseline Facts Accuracy: ${((baselineAgg.overall_facts_accuracy || 0) * 100).toFixed(1)}% | Shunt Facts Accuracy: ${((shuntAgg.overall_facts_accuracy || 0) * 100).toFixed(1)}%`);
console.log(`Baseline Delegation Correctness: ${((baselineAgg.delegation_correctness_rate || 0) * 100).toFixed(1)}% | Shunt Delegation Correctness: ${((shuntAgg.delegation_correctness_rate || 0) * 100).toFixed(1)}%`);
console.log(`Total Hook Blocks in Shunt: ${shuntAgg.total_hook_blocks || 0}`);
console.log(`Results saved to ${SUMMARY_PATH}`);
