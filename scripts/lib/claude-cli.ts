import { spawn } from 'node:child_process';

export interface ClaudeCallRecord { modelIds: string[]; costUsd: number; durationMs: number; isError: boolean }

/**
 * One image (or several, in order) + text turn through the local Claude Code CLI (`claude -p`, the
 * user's own plan) with no tools, MCP servers, setting sources or session
 * persistence, run in an empty working directory.
 */
export function callClaudeWithImage(options: { model: string; systemPrompt: string; workdir: string; image: Buffer; mediaType: 'image/png' | 'image/jpeg'; extraImages?: Buffer[]; text: string; timeoutMs?: number }): Promise<{ text: string; record: ClaudeCallRecord }> {
  return new Promise((resolvePromise, reject) => {
    const started = Date.now();
    const child = spawn('claude', [
      '-p', '--model', options.model, '--no-session-persistence', '--strict-mcp-config', '--tools', '', '--setting-sources', '',
      '--system-prompt', options.systemPrompt, '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
    ], { cwd: options.workdir, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), options.timeoutMs ?? 300_000);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      type Reply = { type?: string; result?: string; is_error?: boolean; total_cost_usd?: number; modelUsage?: Record<string, unknown> };
      const reply = stdout.split('\n').flatMap((entry): Reply[] => {
        try {
          return [JSON.parse(entry) as Reply];
        } catch {
          return [];
        }
      }).find((event) => event.type === 'result');
      if (!reply) {
        reject(new Error(`claude CLI returned no result (exit ${code}): ${stderr.slice(0, 400)} ${stdout.slice(-400)}`));
        return;
      }
      resolvePromise({
        text: reply.result ?? '',
        record: { modelIds: Object.keys(reply.modelUsage ?? {}), costUsd: reply.total_cost_usd ?? 0, durationMs: Date.now() - started, isError: reply.is_error === true || code !== 0 },
      });
    });
    child.stdin.end(`${JSON.stringify({
      type: 'user',
      message: { role: 'user', content: [
        ...[options.image, ...(options.extraImages ?? [])].map((image) => ({ type: 'image', source: { type: 'base64', media_type: options.mediaType, data: image.toString('base64') } })),
        { type: 'text', text: options.text },
      ] },
    })}\n`);
  });
}
