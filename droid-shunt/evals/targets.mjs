import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const EVALS_ROOT = path.dirname(__filename);
const PLUGIN_ROOT = path.dirname(EVALS_ROOT);

export function resolveTarget(targetName = process.env.EVAL_TARGET || '9router-next') {
  const isDefault = targetName === '9router-next';

  let repoRoot;
  if (process.env.TARGET_REPO) {
    repoRoot = process.env.TARGET_REPO;
  } else if (isDefault) {
    repoRoot = '/Users/songloimr/GithubProjects/9router-next';
  } else {
    repoRoot = path.join(EVALS_ROOT, targetName);
  }

  const fixtureMapFile = isDefault
    ? path.join(EVALS_ROOT, 'hooks/fixture-maps/9router-next.json')
    : path.join(EVALS_ROOT, `hooks/fixture-maps/${targetName}.json`);

  const corpusFile = isDefault
    ? path.join(EVALS_ROOT, 'hooks/corpus.jsonl')
    : path.join(EVALS_ROOT, `hooks/corpus.${targetName}.jsonl`);

  const questionsFile = isDefault
    ? path.join(EVALS_ROOT, 'delegation/questions.json')
    : path.join(EVALS_ROOT, `delegation/questions.${targetName}.json`);

  const groundTruthFile = isDefault
    ? path.join(EVALS_ROOT, 'delegation/ground-truth.json')
    : path.join(EVALS_ROOT, `delegation/ground-truth.${targetName}.json`);

  const tasksFile = isDefault
    ? path.join(EVALS_ROOT, 'e2e/tasks.json')
    : path.join(EVALS_ROOT, `e2e/tasks.${targetName}.json`);

  const resultsDir = isDefault
    ? path.join(EVALS_ROOT, 'results')
    : path.join(EVALS_ROOT, `results/${targetName}`);

  const sessionsDir = isDefault
    ? path.join(EVALS_ROOT, 'results/sessions')
    : path.join(EVALS_ROOT, `results/${targetName}/sessions`);

  const hooksResultsFile = isDefault
    ? path.join(EVALS_ROOT, 'results/hooks-latest.json')
    : path.join(EVALS_ROOT, `results/${targetName}/hooks-latest.json`);

  const delegationResultsFile = isDefault
    ? path.join(EVALS_ROOT, 'results/delegation-latest.json')
    : path.join(EVALS_ROOT, `results/${targetName}/delegation-latest.json`);

  const delegationGradedFile = isDefault
    ? path.join(EVALS_ROOT, 'results/delegation-graded.json')
    : path.join(EVALS_ROOT, `results/${targetName}/delegation-graded.json`);

  const e2eSummaryFile = isDefault
    ? path.join(EVALS_ROOT, 'results/e2e-summary.json')
    : path.join(EVALS_ROOT, `results/${targetName}/e2e-summary.json`);

  const e2eGradedFile = isDefault
    ? path.join(EVALS_ROOT, 'results/e2e-graded.json')
    : path.join(EVALS_ROOT, `results/${targetName}/e2e-graded.json`);

  return {
    target: targetName,
    isDefault,
    evalsRoot: EVALS_ROOT,
    pluginRoot: PLUGIN_ROOT,
    repoRoot,
    fixtureMapFile,
    corpusFile: process.env.CORPUS_PATH || corpusFile,
    questionsFile: process.env.QUESTIONS_PATH || questionsFile,
    groundTruthFile: process.env.GT_PATH || groundTruthFile,
    tasksFile: process.env.TASKS_FILE || tasksFile,
    resultsDir,
    sessionsDir: process.env.SESSIONS_DIR || sessionsDir,
    hooksResultsFile: process.env.HOOKS_RESULTS_PATH || hooksResultsFile,
    delegationResultsFile: process.env.DELEGATION_RESULTS_PATH || delegationResultsFile,
    delegationGradedFile: process.env.DELEGATION_GRADED_PATH || delegationGradedFile,
    e2eSummaryFile: process.env.E2E_SUMMARY_PATH || e2eSummaryFile,
    e2eGradedFile: process.env.E2E_GRADED_PATH || e2eGradedFile
  };
}

if (process.argv[1] && process.argv[1].endsWith('targets.mjs')) {
  const target = resolveTarget(process.argv[2] || process.env.EVAL_TARGET);
  const prop = process.argv[3];
  if (prop && target[prop] !== undefined) {
    console.log(target[prop]);
  } else {
    console.log(JSON.stringify(target, null, 2));
  }
}

export default resolveTarget;
