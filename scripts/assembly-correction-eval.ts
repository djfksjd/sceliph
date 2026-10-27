/**
 * Measures LLM→AssemblyIR first-try and corrected success with the execution
 * feedback loop, using the local Claude Code CLI (`claude -p`, the user's own
 * plan) as the generator. Each call runs in an empty working directory with
 * no tools, no MCP servers, no setting sources and no session persistence, so
 * project files cannot leak into the prompt. All candidates are kept.
 *
 *   npx vite-node scripts/assembly-correction-eval.ts -- --tasks tasks.json --model haiku \
 *     --workdir EMPTY_DIR --output OUT_DIR [--max-rounds 3]
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runAssemblyCorrectionLoop, type AssemblyRequirements } from '../src/engine/assembly-feedback';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const tasksPath = resolve(argument('tasks')!);
const tasksBytes = readFileSync(tasksPath);
const suite = JSON.parse(tasksBytes.toString('utf8')) as { guide: string; tasks: Array<{ id: string; request: string; requirements: AssemblyRequirements }> };
const model = argument('model')!;
if (!/^[a-z0-9.-]{2,40}$/.test(model)) throw new Error('--model must be a CLI model alias.');
const workdir = resolve(argument('workdir')!);
if (!existsSync(workdir) || readdirSync(workdir).length > 0) throw new Error('--workdir must be an existing empty directory.');
const outputDir = resolve(argument('output')!);
if (existsSync(join(outputDir, 'results.json'))) throw new Error('Output already contains results; choose a fresh directory.');
const maxRounds = Number(argument('max-rounds') ?? 3);
mkdirSync(outputDir, { recursive: true });

interface CallRecord { round: number; modelIds: string[]; costUsd: number; durationMs: number; isError: boolean }

function callClaude(prompt: string): Promise<{ text: string; record: Omit<CallRecord, 'round'> }> {
  return new Promise((resolvePromise, reject) => {
    const started = Date.now();
    const child = spawn('claude', [
      '-p', '--model', model, '--no-session-persistence', '--strict-mcp-config',
      '--tools', '', '--setting-sources', '', '--system-prompt', suite.guide, '--output-format', 'json',
    ], { cwd: workdir, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), 240_000);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      try {
        const reply = JSON.parse(stdout) as { result?: string; is_error?: boolean; total_cost_usd?: number; modelUsage?: Record<string, unknown> };
        resolvePromise({
          text: reply.result ?? '',
          record: { modelIds: Object.keys(reply.modelUsage ?? {}), costUsd: reply.total_cost_usd ?? 0, durationMs: Date.now() - started, isError: reply.is_error === true || code !== 0 },
        });
      } catch {
        reject(new Error(`claude CLI returned no JSON (exit ${code}): ${stderr.slice(0, 400)}`));
      }
    });
    child.stdin.end(prompt);
  });
}

const results = [];
for (const task of suite.tasks) {
  const calls: CallRecord[] = [];
  const { best, rounds } = await runAssemblyCorrectionLoop(async (prompt, round) => {
    const { text, record } = await callClaude(prompt);
    calls.push({ round, ...record });
    return text;
  }, task.request, task.requirements, maxRounds);
  const summary = {
    id: task.id,
    firstTryPass: rounds[0]!.feedback.pass,
    finalPass: best.feedback.pass,
    passRound: rounds.findIndex((round) => round.feedback.pass),
    roundsUsed: rounds.length,
    scores: rounds.map((round) => round.feedback.score),
    stages: rounds.map((round) => round.feedback.stage),
    issueCounts: rounds.map((round) => round.feedback.issues.length),
    costUsd: calls.reduce((sum, call) => sum + call.costUsd, 0),
    modelIds: [...new Set(calls.flatMap((call) => call.modelIds))],
  };
  results.push(summary);
  writeFileSync(join(outputDir, `${task.id}.json`), `${JSON.stringify({ summary, calls, rounds }, null, 1)}\n`);
  console.log(JSON.stringify(summary));
}
const passed = (key: 'firstTryPass' | 'finalPass') => results.filter((item) => item[key]).length;
writeFileSync(join(outputDir, 'results.json'), `${JSON.stringify({
  schema: 'sceliph.llm-correction-eval/0.1',
  tasksSha256: createHash('sha256').update(tasksBytes).digest('hex'),
  modelAlias: model,
  modelIds: [...new Set(results.flatMap((item) => item.modelIds))],
  maxRounds,
  firstTryPass: `${passed('firstTryPass')}/${results.length}`,
  finalPass: `${passed('finalPass')}/${results.length}`,
  totalCostUsd: results.reduce((sum, item) => sum + item.costUsd, 0),
  results,
}, null, 1)}\n`);
console.log(`first-try ${passed('firstTryPass')}/${results.length}, after feedback ${passed('finalPass')}/${results.length}`);
