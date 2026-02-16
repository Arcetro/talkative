import { spawn } from "node:child_process";
import path from "node:path";
import { ensureInside, tokenizeCommand } from "./utils.js";

const BANNED_PATTERNS = ["rm", "mkfs", "shutdown", "reboot", "dd", "format", ":(){", "sudo"];

function hasDangerousToken(tokens: string[]): boolean {
  return tokens.some((token) => {
    const lower = token.toLowerCase();
    return BANNED_PATTERNS.some((pattern) => lower.includes(pattern));
  });
}

export interface ToolRunResult {
  ok: boolean;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  artifacts: Array<{ type: "file" | "log"; path: string }>;
  metrics: { duration_ms: number; exit_code: number | null };
  error?: { code: string; message: string };
}

export async function runWorkspaceTool(workspaceDir: string, command: string): Promise<ToolRunResult> {
  const tokens = tokenizeCommand(command);
  if (tokens.length === 0) {
    throw new Error("Tool command cannot be empty");
  }

  if (hasDangerousToken(tokens)) {
    throw new Error("Tool command rejected by safety policy");
  }

  const [cmd, ...args] = tokens;
  if (cmd !== "node") {
    throw new Error("Only node-based tools are allowed in this POC");
  }

  if (args.length === 0) {
    throw new Error("Missing script path");
  }

  const scriptPath = ensureInside(workspaceDir, args[0]);
  const ext = path.extname(scriptPath);
  const runtimeArgs: string[] = [];

  if (ext === ".ts") {
    runtimeArgs.push("--import", "tsx", scriptPath);
  } else {
    runtimeArgs.push(scriptPath);
  }

  for (let i = 1; i < args.length; i += 1) {
    const token = args[i];
    const previous = args[i - 1];
    if (previous === "--input" || previous === "--output" || previous === "--file" || previous === "--repo") {
      runtimeArgs.push(ensureInside(workspaceDir, token));
      continue;
    }
    runtimeArgs.push(token);
  }

  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(process.execPath, runtimeArgs, {
      cwd: workspaceDir,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (exitCode) => {
      const duration = Date.now() - startedAt;
      const outputPathIndex = args.findIndex((arg) => arg === "--output");
      const artifacts: Array<{ type: "file" | "log"; path: string }> = [];
      if (outputPathIndex >= 0 && args[outputPathIndex + 1]) {
        artifacts.push({ type: "file", path: ensureInside(workspaceDir, args[outputPathIndex + 1]) });
      }
      if (stdout) artifacts.push({ type: "log", path: "stdout" });
      if (stderr) artifacts.push({ type: "log", path: "stderr" });
      resolve({
        ok: exitCode === 0,
        command,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode,
        artifacts,
        metrics: { duration_ms: duration, exit_code: exitCode },
        error: exitCode === 0 ? undefined : { code: "TOOL_EXIT_NON_ZERO", message: stderr.trim() || "Tool failed" }
      });
    });
  });
}
