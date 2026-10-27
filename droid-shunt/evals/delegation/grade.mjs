#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveTarget } from '../targets.mjs';

const target = resolveTarget(process.env.EVAL_TARGET);
const RESULTS_RAW = target.delegationResultsFile;
const GT_PATH = target.groundTruthFile;
const GRADED_PATH = target.delegationGradedFile;
const JUDGE_MODEL = process.env.PARENT_MODEL || 'custom:Mimo-V2.6-Pro-0';

if (!fs.existsSync(RESULTS_RAW)) {
  console.error(`Error: Results not found at ${RESULTS_RAW}. Run delegation/run.mjs first.`);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(RESULTS_RAW, 'utf-8'));
const gt = fs.existsSync(GT_PATH) ? JSON.parse(fs.readFileSync(GT_PATH, 'utf-8')) : null;

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

console.log(`--- Grading Deterministic Bulk-Reader Results [${target.target}] ---`);
let brPass = 0;
const brGraded = [];
for (const br of (raw.bulk_reader_results || [])) {
  const expectedKw = br.expected_keywords || [];
  // At least one keyword match or all required keywords
  const matched = expectedKw.filter(kw => br.response.toLowerCase().includes(kw.toLowerCase()));
  const passed = expectedKw.length > 0 ? matched.length === expectedKw.length : true;
  if (passed) brPass++;
  brGraded.push({
    id: br.id,
    passed,
    matchedKeywords: matched,
    expectedKeywords: expectedKw,
    responseSnippet: br.response.slice(0, 150)
  });
}
const brAccuracy = brGraded.length > 0 ? brPass / brGraded.length : 1;
console.log(`Bulk-Reader Accuracy: ${brPass}/${brGraded.length} (${(brAccuracy * 100).toFixed(1)}%)`);

console.log(`\n--- Grading Deterministic Code-Writer Results [${target.target}] ---`);
let cwPass = 0;
const cwGraded = [];
for (const cw of (raw.code_writer_results || [])) {
  let fileExists = false;
  let syntaxPass = false;
  let patternsPass = false;
  let content = '';

  if (fs.existsSync(cw.target_abs)) {
    fileExists = true;
    content = fs.readFileSync(cw.target_abs, 'utf-8');
    // Check syntax via node --check
    const chk = spawnSync('node', ['--check', cw.target_abs], { encoding: 'utf-8' });
    syntaxPass = chk.status === 0;

    const matchedPatterns = (cw.required_patterns || []).filter(p => content.includes(p));
    patternsPass = matchedPatterns.length === (cw.required_patterns || []).length;
  }

  const passed = fileExists && syntaxPass && patternsPass;
  if (passed) cwPass++;

  cwGraded.push({
    id: cw.id,
    target_abs: cw.target_abs,
    fileExists,
    syntaxPass,
    patternsPass,
    passed,
    contentSnippet: content.slice(0, 150)
  });
}
const cwAccuracy = cwGraded.length > 0 ? cwPass / cwGraded.length : 1;
console.log(`Code-Writer Accuracy: ${cwPass}/${cwGraded.length} (${(cwAccuracy * 100).toFixed(1)}%)`);

console.log(`\n--- Grading Rubric Bulk-Reader Results via Judge LLM [${target.target}] ---`);
let rubricScoreTotal = 0;
const rubricGraded = [];

let cachedGraded = null;
if (fs.existsSync(GRADED_PATH)) {
  try {
    cachedGraded = JSON.parse(fs.readFileSync(GRADED_PATH, 'utf-8'));
  } catch {}
}

for (const r of (raw.rubric_results || [])) {
  const existing = cachedGraded?.rubricDetails?.find(item => item.id === r.id);
  if (existing && existing.score) {
    console.log(`Skipping [${r.id}] (already judged: ${existing.score}/5)`);
    rubricScoreTotal += existing.score;
    rubricGraded.push(existing);
    continue;
  }

  process.stdout.write(`Judging [${r.id}]... `);
  const judgePrompt = `You are an expert code review evaluator. Evaluate the following response based on the given rubric.
Question: ${r.question}
Rubric criteria: ${r.rubric}
Response from assistant:
${r.response}

Evaluate on a scale of 1 to 5:
5 = Fully meets all rubric criteria with high precision and technical accuracy.
4 = Meets criteria well with minor omitted details.
3 = Partially meets criteria but misses important concepts.
2 = Poor response, misses core criteria.
1 = Completely incorrect or irrelevant.

Respond ONLY with valid JSON on the last line:
{"score": <number 1-5>, "rationale": "<brief explanation>"}`;

  const judgeOut = runJudge(judgePrompt);
  let parsed = { score: 3, rationale: 'Judge parsing fallback' };
  try {
    const jsonMatch = judgeOut.match(/\{[\s\S]*"score"[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.warn(`Warning: failed to parse judge json: ${e.message}`);
  }
  process.stdout.write(`score: ${parsed.score}/5\n`);
  rubricScoreTotal += parsed.score;
  rubricGraded.push({
    id: r.id,
    score: parsed.score,
    rationale: parsed.rationale,
    rubric: r.rubric,
    responseSnippet: r.response.slice(0, 150)
  });

  // Intermediate save
  fs.mkdirSync(path.dirname(GRADED_PATH), { recursive: true });
  fs.writeFileSync(GRADED_PATH, JSON.stringify({
    timestamp: new Date().toISOString(),
    target: target.target,
    judgeModel: JUDGE_MODEL,
    bulkReaderAccuracy: Number(brAccuracy.toFixed(4)),
    codeWriterAccuracy: Number(cwAccuracy.toFixed(4)),
    rubricDetails: rubricGraded
  }, null, 2));
}
const avgRubricScore = rubricGraded.length > 0 ? rubricScoreTotal / rubricGraded.length : 0;
console.log(`Average Rubric Score: ${avgRubricScore.toFixed(2)}/5.0`);

const gradedSummary = {
  timestamp: new Date().toISOString(),
  target: target.target,
  judgeModel: JUDGE_MODEL,
  bulkReaderAccuracy: Number(brAccuracy.toFixed(4)),
  codeWriterAccuracy: Number(cwAccuracy.toFixed(4)),
  avgRubricScore: Number(avgRubricScore.toFixed(2)),
  bulkReaderDetails: brGraded,
  codeWriterDetails: cwGraded,
  rubricDetails: rubricGraded
};

fs.mkdirSync(path.dirname(GRADED_PATH), { recursive: true });
fs.writeFileSync(GRADED_PATH, JSON.stringify(gradedSummary, null, 2));
console.log(`\nGraded delegation summary written to ${GRADED_PATH}`);
