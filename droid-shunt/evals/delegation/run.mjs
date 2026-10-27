#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveTarget } from '../targets.mjs';

const target = resolveTarget(process.env.EVAL_TARGET);
const EVALS_ROOT = target.evalsRoot;
const PLUGIN_ROOT = target.pluginRoot;
const REPO_ROOT = target.repoRoot;
const QUESTIONS_PATH = target.questionsFile;
const RESULTS_PATH = target.delegationResultsFile;

const DROID_MODEL = process.env.DROID_MODEL || 'custom:gemini-3.7-flash-high-0';

function resolveDroidPrompt(pluginRoot, droidName) {
  const activePath = path.join(pluginRoot, 'droids', `${droidName}.md`);
  if (fs.existsSync(activePath)) {
    return activePath;
  }
  const disabledPath = path.join(pluginRoot, 'droids', `${droidName}.md.disabled`);
  if (fs.existsSync(disabledPath)) {
    return disabledPath;
  }
  console.error(`Neither ${activePath} nor ${disabledPath} exists.`);
  process.exit(1);
}

const BULK_READER_SYS_PROMPT = resolveDroidPrompt(PLUGIN_ROOT, 'bulk-reader');
const CODE_WRITER_SYS_PROMPT = resolveDroidPrompt(PLUGIN_ROOT, 'code-writer');

if (!fs.existsSync(QUESTIONS_PATH)) {
  console.error(`Questions file not found: ${QUESTIONS_PATH}`);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(QUESTIONS_PATH, 'utf-8'));

function runBulkReader(prompt) {
  const start = process.hrtime.bigint();
  const res = spawnSync('droid', [
    'exec',
    '-m', DROID_MODEL,
    '--append-system-prompt-file', BULK_READER_SYS_PROMPT,
    '--auto', 'medium',
    '--only-tools', 'Read,Grep,Glob,LS',
    prompt
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    timeout: 300000 // 5 min timeout
  });
  const end = process.hrtime.bigint();
  const durationMs = Number(end - start) / 1e6;

  return {
    exitCode: res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
    durationMs
  };
}

function runCodeWriter(prompt) {
  const start = process.hrtime.bigint();
  const res = spawnSync('droid', [
    'exec',
    '-m', DROID_MODEL,
    '--append-system-prompt-file', CODE_WRITER_SYS_PROMPT,
    '--auto', 'medium',
    '--only-tools', 'Read,Grep,Glob,LS,Create,Edit',
    prompt
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    timeout: 300000 // 5 min timeout
  });
  const end = process.hrtime.bigint();
  const durationMs = Number(end - start) / 1e6;

  return {
    exitCode: res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
    durationMs
  };
}

let results = {
  timestamp: new Date().toISOString(),
  target: target.target,
  model: DROID_MODEL,
  autonomy: 'medium',
  bulk_reader_results: [],
  code_writer_results: [],
  rubric_results: []
};

if (fs.existsSync(RESULTS_PATH)) {
  try {
    const existing = JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf-8'));
    results = {
      ...results,
      ...existing,
      autonomy: existing.autonomy || 'medium'
    };
  } catch {}
}

function saveResults() {
  fs.mkdirSync(path.dirname(RESULTS_PATH), { recursive: true });
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));
}

console.log(`--- Running Deterministic Bulk-Reader Tests (${(data.deterministic_bulk_reader || []).length} tasks) [${target.target}] ---`);
for (const q of (data.deterministic_bulk_reader || [])) {
  if (results.bulk_reader_results.some(r => r.id === q.id)) {
    console.log(`Skipping [${q.id}] (already done)`);
    continue;
  }
  process.stdout.write(`Running [${q.id}]... `);
  const fullFilePath = path.isAbsolute(q.file) ? q.file : path.join(REPO_ROOT, q.file);
  const prompt = `Read ${fullFilePath} and answer the following question concisely:\n${q.question}`;
  const out = runBulkReader(prompt);
  console.log(`done (${(out.durationMs / 1000).toFixed(1)}s, exit: ${out.exitCode})`);
  results.bulk_reader_results.push({
    id: q.id,
    file: q.file,
    question: q.question,
    expected_keywords: q.expected_keywords,
    response: out.stdout.trim(),
    durationMs: out.durationMs,
    exitCode: out.exitCode
  });
  saveResults();
}

console.log(`\n--- Running Deterministic Code-Writer Tests (${(data.deterministic_code_writer || []).length} tasks) [${target.target}] ---`);
for (const cw of (data.deterministic_code_writer || [])) {
  if (results.code_writer_results.some(r => r.id === cw.id)) {
    console.log(`Skipping [${cw.id}] (already done)`);
    continue;
  }
  process.stdout.write(`Running [${cw.id}]... `);
  const targetAbs = path.isAbsolute(cw.target_file) ? cw.target_file : path.join(PLUGIN_ROOT, cw.target_file);
  const refAbs = cw.reference ? (path.isAbsolute(cw.reference) ? cw.reference : path.join(REPO_ROOT, cw.reference)) : '';
  const prompt = `Reference file: ${refAbs}\nTarget path: ${targetAbs}\nInstructions: ${cw.prompt}`;
  const out = runCodeWriter(prompt);
  console.log(`done (${(out.durationMs / 1000).toFixed(1)}s, exit: ${out.exitCode})`);
  results.code_writer_results.push({
    id: cw.id,
    target_file: cw.target_file,
    target_abs: targetAbs,
    required_patterns: cw.required_patterns,
    response: out.stdout.trim(),
    durationMs: out.durationMs,
    exitCode: out.exitCode
  });
  saveResults();
}

console.log(`\n--- Running Rubric Bulk-Reader Tests (${(data.rubric_evaluation || []).length} tasks) [${target.target}] ---`);
for (const r of (data.rubric_evaluation || [])) {
  if (results.rubric_results.some(res => res.id === r.id)) {
    console.log(`Skipping [${r.id}] (already done)`);
    continue;
  }
  process.stdout.write(`Running [${r.id}]... `);
  const fullFilePath = path.isAbsolute(r.file) ? r.file : path.join(REPO_ROOT, r.file);
  const prompt = `Read ${fullFilePath} and answer the following question concisely:\n${r.question}`;
  const out = runBulkReader(prompt);
  console.log(`done (${(out.durationMs / 1000).toFixed(1)}s, exit: ${out.exitCode})`);
  results.rubric_results.push({
    id: r.id,
    file: r.file,
    question: r.question,
    rubric: r.rubric,
    response: out.stdout.trim(),
    durationMs: out.durationMs,
    exitCode: out.exitCode
  });
  saveResults();
}

saveResults();
console.log(`\nDelegation raw results written to ${RESULTS_PATH}`);
