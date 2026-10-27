#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { resolveTarget } from '../targets.mjs';

const target = resolveTarget(process.env.EVAL_TARGET);
const REPO_ROOT = target.repoRoot;
const EVALS_ROOT = target.evalsRoot;
const CORPUS_PATH = target.corpusFile;
const is9router = target.isDefault;

function getFileInfo(filePath) {
  if (!fs.existsSync(filePath)) {
    return { exists: false, lines: 0, hash: null };
  }
  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) {
    return { exists: true, isDirectory: true, lines: 0, hash: null };
  }
  const content = fs.readFileSync(filePath);
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  const lines = content.toString('utf-8').split('\n').length - (content.toString('utf-8').endsWith('\n') ? 1 : 0);
  return { exists: true, isDirectory: false, lines, hash };
}

if (!fs.existsSync(target.fixtureMapFile)) {
  console.error(`Fixture map not found: ${target.fixtureMapFile}`);
  process.exit(1);
}

const fixtureMap = JSON.parse(fs.readFileSync(target.fixtureMapFile, 'utf-8'));

function resolveFixturePath(relOrPath) {
  if (relOrPath.startsWith('hooks/fixtures/')) {
    return path.join(EVALS_ROOT, relOrPath);
  }
  return path.join(REPO_ROOT, relOrPath);
}

const fSmall = resolveFixturePath(fixtureMap.small || fixtureMap.small_139);
const fSmallBoundary = resolveFixturePath(fixtureMap.small_boundary || fixtureMap.small_349);
const fExact350 = resolveFixturePath(fixtureMap.exact_350);
const fMediumBoundary = resolveFixturePath(fixtureMap.medium_boundary || fixtureMap.medium_351);
const fMedium = resolveFixturePath(fixtureMap.medium || fixtureMap.medium_354);
const fLarge = resolveFixturePath(fixtureMap.large || fixtureMap.large_1683);
const fLarge2 = resolveFixturePath(fixtureMap.large_2 || fixtureMap.large_1998);
const fNumber = resolveFixturePath(fixtureMap.number_file);
const fMissing = resolveFixturePath(fixtureMap.missing_file);
const fDir = resolveFixturePath(fixtureMap.directory);

const FIXTURES = {
  small: fSmall,
  small_boundary: fSmallBoundary,
  exact_350: fExact350,
  medium_boundary: fMediumBoundary,
  medium: fMedium,
  large: fLarge,
  large_2: fLarge2,
  number_file: fNumber,
  missing_file: fMissing,
  directory: fDir
};

const fixtureInfo = {};
for (const [key, p] of Object.entries(FIXTURES)) {
  fixtureInfo[key] = { path: p, ...getFileInfo(p) };
}

const cases = [];

// 1. Read: Full file reads across all buckets (<350, =350, 351-500, >1500)
cases.push({
  id: is9router ? 'read-small-139-full' : `read-small-${fixtureInfo.small.lines}-full`,
  hook: 'check-file-size',
  category: 'read-bucket-small',
  description: is9router
    ? 'Read full file under 350 lines (139 lines) -> pass'
    : `Read full file under 350 lines (${fixtureInfo.small.lines} lines) -> pass`,
  input: {
    cwd: REPO_ROOT,
    tool_name: 'Read',
    tool_input: { file_path: FIXTURES.small }
  },
  expected: { exitCode: 0 },
  metadata: { target: FIXTURES.small, ...fixtureInfo.small }
});

cases.push({
  id: is9router ? 'read-small-349-full' : `read-small-${fixtureInfo.small_boundary.lines}-full`,
  hook: 'check-file-size',
  category: 'read-bucket-small',
  description: is9router
    ? 'Read full file boundary 349 lines -> pass'
    : `Read full file boundary ${fixtureInfo.small_boundary.lines} lines -> pass`,
  input: {
    cwd: REPO_ROOT,
    tool_name: 'Read',
    tool_input: { file_path: FIXTURES.small_boundary }
  },
  expected: { exitCode: 0 },
  metadata: { target: FIXTURES.small_boundary, ...fixtureInfo.small_boundary }
});

cases.push({
  id: 'read-exact-350-full',
  hook: 'check-file-size',
  category: 'read-bucket-exact-350',
  description: 'Read full file boundary exactly 350 lines -> pass (strict > 350)',
  input: {
    cwd: REPO_ROOT,
    tool_name: 'Read',
    tool_input: { file_path: FIXTURES.exact_350 }
  },
  expected: { exitCode: 0 },
  metadata: { target: FIXTURES.exact_350, ...fixtureInfo.exact_350 }
});

cases.push({
  id: is9router ? 'read-medium-351-full' : `read-medium-${fixtureInfo.medium_boundary.lines}-full`,
  hook: 'check-file-size',
  category: 'read-bucket-351-500',
  description: is9router
    ? 'Read full file boundary 351 lines -> block (strict > 350)'
    : `Read full file boundary ${fixtureInfo.medium_boundary.lines} lines -> block (strict > 350)`,
  input: {
    cwd: REPO_ROOT,
    tool_name: 'Read',
    tool_input: { file_path: FIXTURES.medium_boundary }
  },
  expected: {
    exitCode: 2,
    stderrContains: `File is ${fixtureInfo.medium_boundary.lines} lines (threshold: 350)`
  },
  metadata: { target: FIXTURES.medium_boundary, ...fixtureInfo.medium_boundary }
});

cases.push({
  id: is9router ? 'read-medium-354-full' : `read-medium-${fixtureInfo.medium.lines}-full`,
  hook: 'check-file-size',
  category: 'read-bucket-351-500',
  description: is9router
    ? 'Read full file 354 lines -> block'
    : `Read full file ${fixtureInfo.medium.lines} lines -> block`,
  input: {
    cwd: REPO_ROOT,
    tool_name: 'Read',
    tool_input: { file_path: FIXTURES.medium }
  },
  expected: {
    exitCode: 2,
    stderrContains: `File is ${fixtureInfo.medium.lines} lines (threshold: 350)`
  },
  metadata: { target: FIXTURES.medium, ...fixtureInfo.medium }
});

cases.push({
  id: is9router ? 'read-large-1683-full' : `read-large-${fixtureInfo.large.lines}-full`,
  hook: 'check-file-size',
  category: 'read-bucket-gt-1500',
  description: is9router
    ? 'Read full file 1683 lines -> block'
    : `Read full file ${fixtureInfo.large.lines} lines -> block`,
  input: {
    cwd: REPO_ROOT,
    tool_name: 'Read',
    tool_input: { file_path: FIXTURES.large }
  },
  expected: {
    exitCode: 2,
    stderrContains: `File is ${fixtureInfo.large.lines} lines (threshold: 350)`
  },
  metadata: { target: FIXTURES.large, ...fixtureInfo.large }
});

cases.push({
  id: is9router ? 'read-large-1998-full' : `read-large-${fixtureInfo.large_2.lines}-full`,
  hook: 'check-file-size',
  category: 'read-bucket-gt-1500',
  description: is9router
    ? 'Read full file 1998 lines -> block'
    : `Read full file ${fixtureInfo.large_2.lines} lines -> block`,
  input: {
    cwd: REPO_ROOT,
    tool_name: 'Read',
    tool_input: { file_path: FIXTURES.large_2 }
  },
  expected: {
    exitCode: 2,
    stderrContains: `File is ${fixtureInfo.large_2.lines} lines (threshold: 350)`
  },
  metadata: { target: FIXTURES.large_2, ...fixtureInfo.large_2 }
});

// 2. Read: Targeted reads (offset/limit > 0) -> exempt (pass)
cases.push({
  id: 'read-targeted-limit-only',
  hook: 'check-file-size',
  category: 'read-targeted',
  description: 'Read targeted with limit: 50 on large file -> pass',
  input: {
    cwd: REPO_ROOT,
    tool_name: 'Read',
    tool_input: { file_path: FIXTURES.large, limit: 50 }
  },
  expected: { exitCode: 0 },
  metadata: { target: FIXTURES.large, ...fixtureInfo.large }
});

cases.push({
  id: 'read-targeted-offset-only',
  hook: 'check-file-size',
  category: 'read-targeted',
  description: 'Read targeted with offset: 100 on large file -> pass',
  input: {
    cwd: REPO_ROOT,
    tool_name: 'Read',
    tool_input: { file_path: FIXTURES.large, offset: 100 }
  },
  expected: { exitCode: 0 },
  metadata: { target: FIXTURES.large, ...fixtureInfo.large }
});

cases.push({
  id: 'read-targeted-offset-and-limit',
  hook: 'check-file-size',
  category: 'read-targeted',
  description: 'Read targeted with offset: 10, limit: 30 on large file -> pass',
  input: {
    cwd: REPO_ROOT,
    tool_name: 'Read',
    tool_input: { file_path: FIXTURES.large_2, offset: 10, limit: 30 }
  },
  expected: { exitCode: 0 },
  metadata: { target: FIXTURES.large_2, ...fixtureInfo.large_2 }
});

// 3. Read: offset: 0 / limit: 0 on file > 350 -> NOT targeted, must block
cases.push({
  id: 'read-zero-offset-no-limit',
  hook: 'check-file-size',
  category: 'read-zero-params',
  description: is9router
    ? 'Read with offset: 0 on 1683 lines -> block (offset 0 is full read)'
    : `Read with offset: 0 on ${fixtureInfo.large.lines} lines -> block (offset 0 is full read)`,
  input: {
    cwd: REPO_ROOT,
    tool_name: 'Read',
    tool_input: { file_path: FIXTURES.large, offset: 0 }
  },
  expected: {
    exitCode: 2,
    stderrContains: `File is ${fixtureInfo.large.lines} lines (threshold: 350)`
  },
  metadata: { target: FIXTURES.large, ...fixtureInfo.large }
});

cases.push({
  id: 'read-zero-limit-no-offset',
  hook: 'check-file-size',
  category: 'read-zero-params',
  description: is9router
    ? 'Read with limit: 0 on 1683 lines -> block (limit 0 is not positive)'
    : `Read with limit: 0 on ${fixtureInfo.large.lines} lines -> block (limit 0 is not positive)`,
  input: {
    cwd: REPO_ROOT,
    tool_name: 'Read',
    tool_input: { file_path: FIXTURES.large, limit: 0 }
  },
  expected: {
    exitCode: 2,
    stderrContains: `File is ${fixtureInfo.large.lines} lines (threshold: 350)`
  },
  metadata: { target: FIXTURES.large, ...fixtureInfo.large }
});

// 4. Read: Missing file or directory -> pass through (let tool handle error)
cases.push({
  id: 'read-nonexistent-file',
  hook: 'check-file-size',
  category: 'read-edge-cases',
  description: 'Read nonexistent file -> pass through',
  input: {
    cwd: REPO_ROOT,
    tool_name: 'Read',
    tool_input: { file_path: FIXTURES.missing_file }
  },
  expected: { exitCode: 0 },
  metadata: { target: FIXTURES.missing_file, exists: false }
});

cases.push({
  id: 'read-directory',
  hook: 'check-file-size',
  category: 'read-edge-cases',
  description: 'Read directory path -> pass through',
  input: {
    cwd: REPO_ROOT,
    tool_name: 'Read',
    tool_input: { file_path: FIXTURES.directory }
  },
  expected: { exitCode: 0 },
  metadata: { target: FIXTURES.directory, isDirectory: true }
});

// 5. Read: Path resolution (relative, ~)
const largeRel = path.relative(REPO_ROOT, FIXTURES.large);
cases.push({
  id: 'read-relative-path',
  hook: 'check-file-size',
  category: 'read-path-resolution',
  description: 'Read relative path resolved against cwd on large file -> block',
  input: {
    cwd: REPO_ROOT,
    tool_name: 'Read',
    tool_input: { file_path: largeRel }
  },
  expected: {
    exitCode: 2,
    stderrContains: `File is ${fixtureInfo.large.lines} lines (threshold: 350)`
  },
  metadata: { target: FIXTURES.large, ...fixtureInfo.large }
});

// 6. Bash: cat / head / tail / less / more on files > 350 lines -> block
for (const cmd of ['cat', 'head', 'tail', 'less', 'more']) {
  cases.push({
    id: `bash-${cmd}-large-file`,
    hook: 'check-bash-read',
    category: 'bash-commands',
    description: is9router
      ? `Execute ${cmd} on 1683 line file -> block`
      : `Execute ${cmd} on ${fixtureInfo.large.lines} line file -> block`,
    input: {
      cwd: REPO_ROOT,
      tool_name: 'Execute',
      tool_input: { command: `${cmd} "${FIXTURES.large}"` }
    },
    expected: {
      exitCode: 2,
      stderrContains: `File is ${fixtureInfo.large.lines} lines (threshold: 350)`
    },
    metadata: { target: FIXTURES.large, ...fixtureInfo.large }
  });
}

// 7. Bash: head -n 5 f (flag value disambiguation)
cases.push({
  id: 'bash-head-flag-value-disambiguation',
  hook: 'check-bash-read',
  category: 'bash-flags',
  description: 'head -n 5 <path>: 5 is flag value, path is large file -> block',
  input: {
    cwd: REPO_ROOT,
    tool_name: 'Execute',
    tool_input: { command: `head -n 5 ${FIXTURES.large}` }
  },
  expected: {
    exitCode: 2,
    stderrContains: `File is ${fixtureInfo.large.lines} lines (threshold: 350)`
  },
  metadata: { target: FIXTURES.large, ...fixtureInfo.large }
});

// 8. Bash: compound command "cd x && cat big"
cases.push({
  id: 'bash-compound-command',
  hook: 'check-bash-read',
  category: 'bash-compound',
  description: 'Compound command "cd x && cat big" -> block',
  input: {
    cwd: REPO_ROOT,
    tool_name: 'Execute',
    tool_input: { command: `cd /tmp && cat ${FIXTURES.large}` }
  },
  expected: {
    exitCode: 2,
    stderrContains: `File is ${fixtureInfo.large.lines} lines (threshold: 350)`
  },
  metadata: { target: FIXTURES.large, ...fixtureInfo.large }
});

// 9. Bash: Pipe and redirect (tradeoff: passes through unblocked)
cases.push({
  id: 'bash-pipe-tradeoff',
  hook: 'check-bash-read',
  category: 'bash-tradeoffs',
  description: is9router
    ? 'cat big | grep "export" -> pass (tradeoff: pipe is targeted)'
    : 'cat big | grep "function" -> pass (tradeoff: pipe is targeted)',
  input: {
    cwd: REPO_ROOT,
    tool_name: 'Execute',
    tool_input: { command: `cat ${FIXTURES.large} | grep "${is9router ? 'export' : 'function'}"` }
  },
  expected: { exitCode: 0 },
  metadata: { tradeoff: 'known-limitation', target: FIXTURES.large }
});

cases.push({
  id: 'bash-redirect-tradeoff',
  hook: 'check-bash-read',
  category: 'bash-tradeoffs',
  description: 'cat big > /tmp/out -> pass (tradeoff: redirection write)',
  input: {
    cwd: REPO_ROOT,
    tool_name: 'Execute',
    tool_input: { command: `cat ${FIXTURES.large} > /tmp/out.txt` }
  },
  expected: { exitCode: 0 },
  metadata: { tradeoff: 'known-limitation', target: FIXTURES.large }
});

// 10. Bash: file literally named a number (e.g. 5) -> pass (tradeoff: treated as flag value)
cases.push({
  id: 'bash-number-file-tradeoff',
  hook: 'check-bash-read',
  category: 'bash-tradeoffs',
  description: 'cat 5 where 5 is a file with 400 lines -> pass (tradeoff: number skipped as flag value)',
  input: {
    cwd: path.dirname(FIXTURES.number_file),
    tool_name: 'Execute',
    tool_input: { command: 'cat 5' }
  },
  expected: { exitCode: 0 },
  metadata: { tradeoff: 'known-limitation', target: FIXTURES.number_file }
});

// 11. Environment variable: SHUNT_MIN_LINES overrides
cases.push({
  id: 'read-override-threshold-100',
  hook: 'check-file-size',
  category: 'env-override',
  description: is9router
    ? 'SHUNT_MIN_LINES=100 on 139-line file -> block'
    : `SHUNT_MIN_LINES=100 on ${fixtureInfo.small.lines}-line file -> block`,
  env: { SHUNT_MIN_LINES: '100' },
  input: {
    cwd: REPO_ROOT,
    tool_name: 'Read',
    tool_input: { file_path: FIXTURES.small }
  },
  expected: {
    exitCode: 2,
    stderrContains: `File is ${fixtureInfo.small.lines} lines (threshold: 100)`
  },
  metadata: { target: FIXTURES.small, ...fixtureInfo.small }
});

cases.push({
  id: 'read-override-threshold-2000',
  hook: 'check-file-size',
  category: 'env-override',
  description: is9router
    ? 'SHUNT_MIN_LINES=2000 on 1683-line file -> pass'
    : `SHUNT_MIN_LINES=2000 on ${fixtureInfo.large.lines}-line file -> pass`,
  env: { SHUNT_MIN_LINES: '2000' },
  input: {
    cwd: REPO_ROOT,
    tool_name: 'Read',
    tool_input: { file_path: FIXTURES.large }
  },
  expected: { exitCode: 0 },
  metadata: { target: FIXTURES.large, ...fixtureInfo.large }
});

cases.push({
  id: 'read-invalid-threshold-fallback',
  hook: 'check-file-size',
  category: 'env-override',
  description: is9router
    ? 'SHUNT_MIN_LINES="invalid" -> fallback to 350 -> block on 1683 lines'
    : `SHUNT_MIN_LINES="invalid" -> fallback to 350 -> block on ${fixtureInfo.large.lines} lines`,
  env: { SHUNT_MIN_LINES: 'invalid' },
  input: {
    cwd: REPO_ROOT,
    tool_name: 'Read',
    tool_input: { file_path: FIXTURES.large }
  },
  expected: {
    exitCode: 2,
    stderrContains: `File is ${fixtureInfo.large.lines} lines (threshold: 350)`
  },
  metadata: { target: FIXTURES.large, ...fixtureInfo.large }
});

// Write to corpus path
const jsonlContent = cases.map(c => JSON.stringify(c)).join('\n') + '\n';
fs.writeFileSync(CORPUS_PATH, jsonlContent);
console.log(`Successfully generated ${cases.length} cases in ${CORPUS_PATH}`);
