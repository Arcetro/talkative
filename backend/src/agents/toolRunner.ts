import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
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
  /** Populated when the output file is a valid SkillReportEnvelope. */
  skillReport?: {
    skillName: string;
    ok: boolean;
    generatedAt: string;
    metrics?: Record<string, unknown>;
    error?: { code: string; message: string };
  };
}

/**
 * Attempt to read and parse an output file as a SkillReportEnvelope.
 * Returns extracted metadata on success, undefined on any failure.
 * This is intentionally lenient — old scripts that don't use the
 * envelope simply return undefined and everything works as before.
 */
async function tryParseSkillReport(
  filePath: string
): Promise<ToolRunResult["skillReport"] | undefined> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.skillName === "string" &&
      typeof parsed.ok === "boolean" &&
      typeof parsed.generatedAt === "string"
    ) {
      return {
        skillName: parsed.skillName,
        ok: parsed.ok,
        generatedAt: parsed.generatedAt,
        ...(parsed.metrics ? { metrics: parsed.metrics } : {}),
        ...(parsed.error ? { error: parsed.error } : {})
      };
    }
  } catch {
    // File missing, not JSON, or not an envelope — all fine.
  }
  return undefined;
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
      let outputFilePath: string | undefined;
      if (outputPathIndex >= 0 && args[outputPathIndex + 1]) {
        outputFilePath = ensureInside(workspaceDir, args[outputPathIndex + 1]);
        artifacts.push({ type: "file", path: outputFilePath });
      }
      if (stdout) artifacts.push({ type: "log", path: "stdout" });
      if (stderr) artifacts.push({ type: "log", path: "stderr" });

      const buildResult = async (): Promise<ToolRunResult> => {
        const skillReport = outputFilePath
          ? await tryParseSkillReport(outputFilePath)
          : undefined;

        // If the process exited 0 but the skill self-reported failure,
        // trust the skill's assessment.
        const effectiveOk = skillReport
          ? skillReport.ok && exitCode === 0
          : exitCode === 0;

        const effectiveError = !effectiveOk
          ? skillReport?.error ?? (exitCode !== 0
            ? { code: "TOOL_EXIT_NON_ZERO", message: stderr.trim() || "Tool failed" }
            : { code: "SKILL_REPORTED_FAILURE", message: "Skill reported ok:false" })
          : undefined;

        return {
          ok: effectiveOk,
          command,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode,
          artifacts,
          metrics: { duration_ms: duration, exit_code: exitCode },
          error: effectiveError,
          skillReport
        };
      };

      buildResult().then(resolve);
    });
  });
}
