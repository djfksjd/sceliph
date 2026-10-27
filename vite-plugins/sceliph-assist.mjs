/**
 * Local bridge from the result viewer command bar to the user's own Claude
 * Code CLI (`claude -p`, their plan). Dev and preview servers only; a static
 * build has no bridge and the viewer says so. Requests must come from the
 * same loopback origin and carry X-Sceliph-Assist, so another site cannot
 * drive the CLI. The CLI runs with no tools, MCP servers or settings, in an
 * empty temporary directory, one request at a time. The reply text goes back
 * unparsed; src/viewer/assist-protocol.ts parses, scopes and validates it.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MODELS = new Set(["haiku", "sonnet", "opus"]);
const LANGUAGES = { ko: "Korean", en: "English", ja: "Japanese", zh: "Simplified Chinese" };
const MAX_BODY = 8_000_000;
const MAX_IR_CHARS = 400_000;

const SYSTEM_PROMPT = [
  "You are the editing assistant inside the Sceliph 3D result viewer. The model on screen is a Sceliph AssemblyIR (schema morphloom.assembly/0.1): a list of rigid components compiled by a deterministic local engine. You see the IR JSON and, when attached, a render of the current view.",
  "Output exactly one JSON object and nothing else: {\"reply\": string, \"changes\": [change, ...]}.",
  "change: {\"op\":\"update\",\"id\":string,\"component\":<the whole new component>} | {\"op\":\"add\",\"component\":<new component with a new unique id>} | {\"op\":\"remove\",\"id\":string}.",
  "Mode chat: answer questions about the model (what it is, its parts, sizes, how to improve it); changes must be [].",
  "Mode edit: make exactly the requested change. When a scope is given, update or remove only components in the scope (add new components only when asked). Keep ids, names, categories, materials and every field you were not asked to change exactly as they are. Never rename an id. Return whole components, not fragments.",
  "reply: one to three short sentences in the requested language saying what you did or answering the question. Do not paste JSON into reply.",
  "component: {\"id\":string,\"name\":string,\"category\":one of \"enclosure\",\"display\",\"logic\",\"power\",\"camera\",\"audio\",\"radio\",\"mechanical\",\"interconnect\",\"materialName\":string,\"detail\":string,\"geometry\":geometry,\"position\":[x,y,z] (optional, mm, centre of the part),\"rotation\":[rx,ry,rz] (optional, radians, XYZ Euler),\"material\":{\"color\":\"#rrggbb\",\"roughness\":0..1 (optional),\"metalness\":0..1 (optional)}}\n\nWorld: millimetres, Y is up, the floor is y = 0. Each geometry is centred on the component position.\ngeometry options:\n- {\"op\":\"roundedBox\",\"size\":[x,y,z],\"radius\":r}  (r at most 0.4 x the smallest size)\n- {\"op\":\"cylinder\",\"radiusTop\":r1,\"radiusBottom\":r2,\"depth\":h,\"radialSegments\":32}  (axis along Y, height h)\n- {\"op\":\"sphere\",\"radius\":r}\n- {\"op\":\"torus\",\"radius\":R,\"tube\":t}  (ring lies in the XY plane; its axis is Z; outer diameter 2(R+t); rotate it for other planes)\n- {\"op\":\"tube\",\"points\":[[x,y,z],...],\"radius\":r}  (swept circle along a smooth curve through the points, relative to the component position; a straight rod or brace needs exactly two points, otherwise the curve bends)\n- {\"op\":\"lathe\",\"profile\":[[r,y],...],\"segments\":48}  (profile radius r >= 0 at height y, relative to the component position, revolved about the vertical Y axis; for vases, lamp bases, turned legs, shades)\n- {\"op\":\"extrude\",\"points\":[[x,y],...],\"depth\":d}  (closed outline in the X-Y plane relative to the component position, extruded along Z by d and centred on it; for shaped panels, brackets, cut-out legs)",
  "Components may also use other geometry ops that already exist in the IR; keep them as they are unless asked, and do not invent new ops.",
].join("\n");

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function sameOrigin(req) {
  const host = req.headers.host ?? "";
  if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host)) return false;
  if (req.headers["x-sceliph-assist"] !== "1") return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("Request too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function userText(request) {
  const ir = JSON.stringify(request.ir);
  const scope = request.scopeIds.length > 0 ? request.scopeIds.join(", ") : "none (the whole model)";
  const history = request.history.slice(-8).map((turn) => `${turn.role}: ${turn.text}`).join("\n");
  return [
    `Mode: ${request.mode}`,
    `Reply language: ${LANGUAGES[request.locale] ?? "English"}`,
    `Model on screen: ${request.ir.name} (${request.ir.components.length} components)${request.snapshot ? ", the attached image is the current view" : ""}.`,
    `Scope (component ids the user selected): ${scope}`,
    history ? `Conversation so far:\n${history}` : "",
    ir.length <= MAX_IR_CHARS ? `Current AssemblyIR JSON:\n${ir}` : `Current AssemblyIR (too large to send whole; scoped components only):\n${JSON.stringify(request.ir.components.filter((component) => request.scopeIds.includes(component.id)))}`,
    `User request: ${request.message}`,
  ].filter(Boolean).join("\n\n");
}

function callClaude(request) {
  return new Promise((resolve, reject) => {
    const workdir = mkdtempSync(join(tmpdir(), "sceliph-assist-"));
    const started = Date.now();
    const child = spawn("claude", [
      "-p", "--model", request.model, "--no-session-persistence", "--strict-mcp-config", "--tools", "", "--setting-sources", "",
      "--system-prompt", SYSTEM_PROMPT, "--input-format", "stream-json", "--output-format", "stream-json", "--verbose",
    ], { cwd: workdir, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), 240_000);
    const finish = () => {
      clearTimeout(timer);
      rmSync(workdir, { recursive: true, force: true });
    };
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => { finish(); reject(error); });
    child.on("close", (code) => {
      finish();
      const result = stdout.split("\n").flatMap((line) => {
        try {
          return [JSON.parse(line)];
        } catch {
          return [];
        }
      }).find((event) => event.type === "result");
      if (!result) {
        reject(new Error(`claude CLI returned no result (exit ${code}): ${stderr.slice(0, 300)}`));
        return;
      }
      resolve({
        text: result.result ?? "",
        record: { modelIds: Object.keys(result.modelUsage ?? {}), costUsd: result.total_cost_usd ?? 0, durationMs: Date.now() - started, isError: result.is_error === true || code !== 0 },
      });
    });
    const content = [];
    const match = typeof request.snapshot === "string" ? /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(request.snapshot) : null;
    if (match) content.push({ type: "image", source: { type: "base64", media_type: "image/png", data: match[1] } });
    content.push({ type: "text", text: userText(request) });
    child.stdin.end(`${JSON.stringify({ type: "user", message: { role: "user", content } })}\n`);
  });
}

function validRequest(value) {
  return value && typeof value === "object"
    && (value.mode === "chat" || value.mode === "edit")
    && MODELS.has(value.model)
    && typeof value.message === "string" && value.message.trim().length > 0 && value.message.length <= 4000
    && value.ir && typeof value.ir === "object" && Array.isArray(value.ir.components)
    && Array.isArray(value.scopeIds) && value.scopeIds.every((id) => typeof id === "string")
    && Array.isArray(value.history);
}

export function sceliphAssist() {
  let busy = false;
  let health;
  const handler = async (req, res, next) => {
    const path = (req.url ?? "").split("?")[0];
    if (path !== "/api/assist" && path !== "/api/assist/health") return next();
    if (!sameOrigin(req)) return json(res, 403, { error: "Same-origin loopback requests only." });
    if (path === "/api/assist/health") {
      if (!health) {
        const probe = spawnSync("claude", ["--version"], { encoding: "utf8", timeout: 15_000 });
        health = probe.status === 0 ? { available: true, version: probe.stdout.trim() } : { available: false, version: null };
      }
      return json(res, 200, health);
    }
    if (req.method !== "POST") return json(res, 405, { error: "POST only." });
    if (busy) return json(res, 429, { error: "Another command is still running." });
    busy = true;
    try {
      const request = JSON.parse(await readBody(req));
      if (!validRequest(request)) return json(res, 400, { error: "Malformed command request." });
      return json(res, 200, await callClaude(request));
    } catch (error) {
      return json(res, 502, { error: error instanceof Error ? error.message : String(error) });
    } finally {
      busy = false;
    }
  };
  return {
    name: "sceliph-assist",
    configureServer(server) { server.middlewares.use(handler); },
    configurePreviewServer(server) { server.middlewares.use(handler); },
  };
}
