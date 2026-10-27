#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { resolveTarget } from '../targets.mjs';

const target = resolveTarget(process.env.EVAL_TARGET);
const REPO_ROOT = target.repoRoot;
const QUESTIONS_PATH = target.questionsFile;
const GT_PATH = target.groundTruthFile;

if (!fs.existsSync(QUESTIONS_PATH)) {
  console.error(`Questions file not found: ${QUESTIONS_PATH}`);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(QUESTIONS_PATH, 'utf-8'));

function getFileInfo(relPath) {
  const fullPath = path.isAbsolute(relPath) ? relPath : path.join(REPO_ROOT, relPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File does not exist: ${fullPath}`);
  }
  const content = fs.readFileSync(fullPath);
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  const lines = content.toString('utf-8').split('\n').length - (content.toString('utf-8').endsWith('\n') ? 1 : 0);
  return { fullPath, hash, lines, content: content.toString('utf-8') };
}

const groundTruth = {
  timestamp: new Date().toISOString(),
  target: target.target,
  repoRoot: REPO_ROOT,
  bulk_reader_gt: {},
  code_writer_gt: {}
};

for (const q of (data.deterministic_bulk_reader || [])) {
  const info = getFileInfo(q.file);
  // Verify that all expected keywords exist in source
  const missing = q.expected_keywords.filter(kw => !info.content.includes(kw));
  if (missing.length > 0) {
    console.warn(`[WARN] Question ${q.id}: keywords [${missing.join(', ')}] not found in ${q.file}`);
  }
  groundTruth.bulk_reader_gt[q.id] = {
    file: q.file,
    fullPath: info.fullPath,
    sha256: info.hash,
    lineCount: info.lines,
    expected_keywords: q.expected_keywords
  };
}

for (const cw of (data.deterministic_code_writer || [])) {
  let refInfo = null;
  if (cw.reference) {
    refInfo = getFileInfo(cw.reference);
  }
  groundTruth.code_writer_gt[cw.id] = {
    reference: cw.reference,
    referenceSha256: refInfo ? refInfo.hash : null,
    target_file: cw.target_file,
    required_patterns: cw.required_patterns
  };
}

fs.mkdirSync(path.dirname(GT_PATH), { recursive: true });
fs.writeFileSync(GT_PATH, JSON.stringify(groundTruth, null, 2));
console.log(`Ground truth generated successfully at ${GT_PATH}`);
