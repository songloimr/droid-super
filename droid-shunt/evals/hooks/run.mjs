#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveTarget } from '../targets.mjs';

const target = resolveTarget(process.env.EVAL_TARGET);
const EVALS_ROOT = target.evalsRoot;
const PLUGIN_ROOT = target.pluginRoot;
const HOOKS_DIR = path.join(PLUGIN_ROOT, 'hooks');
const CORPUS_PATH = target.corpusFile;
const RESULTS_PATH = target.hooksResultsFile;

const args = process.argv.slice(2);
const isSelfCheck = args.includes('--self-check');

if (!fs.existsSync(CORPUS_PATH)) {
  console.error(`Error: Corpus not found at ${CORPUS_PATH}. Run gen-corpus.mjs first.`);
  process.exit(1);
}

const corpusLines = fs.readFileSync(CORPUS_PATH, 'utf-8').trim().split('\n').filter(Boolean);
const cases = corpusLines.map(line => JSON.parse(line));

console.log(`Loaded ${cases.length} test cases from corpus (${target.target}).`);

function runHook(hookName, inputJson, envOverrides = {}) {
  const hookScript = path.join(HOOKS_DIR, hookName);
  const start = process.hrtime.bigint();
  const res = spawnSync(hookScript, [], {
    input: JSON.stringify(inputJson),
    env: { ...process.env, ...envOverrides },
    encoding: 'utf-8'
  });
  const end = process.hrtime.bigint();
  const latencyMs = Number(end - start) / 1e6;

  return {
    exitCode: res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
    latencyMs
  };
}

const caseResults = [];
let passCount = 0;
let failCount = 0;

// Confusion Matrix:
// Positive = Shunt Block (exitCode == 2)
// Negative = Pass through (exitCode == 0)
let tp = 0; // expected block, got block
let fp = 0; // expected pass, got block
let tn = 0; // expected pass, got pass
let fn = 0; // expected block, got pass

const categoryStats = {};

for (const testCase of cases) {
  const res = runHook(testCase.hook, testCase.input, testCase.env || {});

  const expectedExit = testCase.expected.exitCode;
  const exitMatch = res.exitCode === expectedExit;

  let stderrMatch = true;
  if (testCase.expected.stderrContains) {
    stderrMatch = res.stderr.includes(testCase.expected.stderrContains);
  }

  const passed = exitMatch && stderrMatch;
  if (passed) {
    passCount++;
  } else {
    failCount++;
  }

  // Confusion matrix update
  if (expectedExit === 2) {
    if (res.exitCode === 2) tp++;
    else fn++;
  } else if (expectedExit === 0) {
    if (res.exitCode === 0) tn++;
    else fp++;
  }

  const cat = testCase.category || 'other';
  if (!categoryStats[cat]) {
    categoryStats[cat] = { total: 0, passed: 0, failed: 0 };
  }
  categoryStats[cat].total++;
  if (passed) categoryStats[cat].passed++;
  else categoryStats[cat].failed++;

  caseResults.push({
    id: testCase.id,
    hook: testCase.hook,
    category: testCase.category,
    description: testCase.description,
    expectedExit,
    actualExit: res.exitCode,
    stderrExpected: testCase.expected.stderrContains || null,
    stderrActual: res.stderr.trim(),
    passed,
    latencyMs: res.latencyMs,
    tradeoff: testCase.metadata?.tradeoff || null
  });
}

// Latency benchmark for representative cases (N=50 each)
console.log('Running latency benchmarks (N=50 per representative case)...');
const repCases = [
  cases.find(c => c.id === 'read-small-139-full' || c.category === 'read-bucket-small'),
  cases.find(c => c.id === 'read-large-1683-full' || c.category === 'read-bucket-gt-1500' || c.category === 'read-bucket-large'),
  cases.find(c => c.id === 'read-targeted-offset-and-limit'),
  cases.find(c => c.id === 'bash-cat-large-file'),
  cases.find(c => c.id === 'bash-pipe-tradeoff')
].filter(Boolean);

const latencyResults = {};

for (const rep of repCases) {
  const samples = [];
  for (let i = 0; i < 50; i++) {
    const res = runHook(rep.hook, rep.input, rep.env || {});
    samples.push(res.latencyMs);
  }
  samples.sort((a, b) => a - b);
  const min = samples[0];
  const max = samples[samples.length - 1];
  const median = samples[Math.floor(samples.length / 2)];
  const p95 = samples[Math.floor(samples.length * 0.95)];
  latencyResults[rep.id] = {
    hook: rep.hook,
    description: rep.description,
    samplesCount: samples.length,
    minMs: Number(min.toFixed(3)),
    medianMs: Number(median.toFixed(3)),
    p95Ms: Number(p95.toFixed(3)),
    maxMs: Number(max.toFixed(3))
  };
}

const precision = (tp + fp) > 0 ? tp / (tp + fp) : 1;
const recall = (tp + fn) > 0 ? tp / (tp + fn) : 1;
const f1 = (precision + recall) > 0 ? (2 * precision * recall) / (precision + recall) : 1;
const accuracy = cases.length > 0 ? (tp + tn) / cases.length : 1;

const summary = {
  timestamp: new Date().toISOString(),
  target: target.target,
  totalCases: cases.length,
  passCount,
  failCount,
  accuracy: Number(accuracy.toFixed(4)),
  precision: Number(precision.toFixed(4)),
  recall: Number(recall.toFixed(4)),
  f1: Number(f1.toFixed(4)),
  confusionMatrix: { tp, fp, tn, fn },
  categoryStats,
  latencyBenchmarks: latencyResults,
  caseResults
};

fs.mkdirSync(path.dirname(RESULTS_PATH), { recursive: true });
fs.writeFileSync(RESULTS_PATH, JSON.stringify(summary, null, 2));
console.log(`Results saved to ${RESULTS_PATH}`);
console.log(`\n--- Summary ---`);
console.log(`Total: ${cases.length} | Passed: ${passCount} | Failed: ${failCount}`);
console.log(`Accuracy: ${(accuracy * 100).toFixed(2)}% | Precision: ${(precision * 100).toFixed(2)}% | Recall: ${(recall * 100).toFixed(2)}% | F1: ${(f1 * 100).toFixed(2)}%`);
console.log(`Confusion Matrix: TP=${tp}, FP=${fp}, TN=${tn}, FN=${fn}`);

if (isSelfCheck) {
  console.log('\n--- Self-Check: Validating Known Limitations / Tradeoffs ---');
  const tradeoffCases = caseResults.filter(c => c.tradeoff === 'known-limitation');
  let selfCheckPassed = true;
  for (const tc of tradeoffCases) {
    if (!tc.passed || tc.actualExit !== 0) {
      console.error(`FAIL: Tradeoff case ${tc.id} expected pass (0) but got ${tc.actualExit}`);
      selfCheckPassed = false;
    } else {
      console.log(`PASS [Tradeoff]: ${tc.id} (${tc.description}) passed through as documented.`);
    }
  }
  if (!selfCheckPassed) {
    process.exit(2);
  }
}

if (failCount > 0) {
  console.error(`\nFailed cases:`);
  for (const c of caseResults.filter(c => !c.passed)) {
    console.error(`- [${c.id}] Expected exit ${c.expectedExit}, got ${c.actualExit}. Stderr: ${c.stderrActual}`);
  }
  process.exit(1);
}

console.log('\nAll hook evaluation tests passed successfully!');
