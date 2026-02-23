import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { REPO_ROOT } from "../agents/paths.js";
import { NodeHost } from "./types.js";

const execFileAsync = promisify(execFile);
const SSH_TIMEOUT_MS = Number(process.env.FLEET_SSH_TIMEOUT_MS ?? 15000);
const SSH_RETRIES = Math.max(0, Number(process.env.FLEET_SSH_RETRIES ?? 2));

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function ensureSkillsExist(skills: string[]): Promise<void> {
  for (const skill of skills) {
    const src = path.join(REPO_ROOT, "skills", "templates", skill);
    try {
      await fs.access(src);
    } catch {
      throw new Error(`Skill template not found: ${skill}`);
    }
  }
}

async function readStatusJson(filePath: string): Promise<{ tenant_id?: string; agent_id?: string; status?: string } | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as { tenant_id?: string; agent_id?: string; status?: string };
  } catch {
    return null;
  }
}

async function withRetries<T>(label: string, fn: (attempt: number) => Promise<T>): Promise<{ value: T; attempts: number }> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= SSH_RETRIES + 1; attempt += 1) {
    try {
      const value = await fn(attempt);
      return { value, attempts: attempt };
    } catch (error) {
      lastError = error as Error;
      if (attempt > SSH_RETRIES) break;
      await new Promise((resolve) => setTimeout(resolve, Math.min(1500, 250 * attempt)));
    }
  }
  throw new Error(`${label} failed after ${SSH_RETRIES + 1} attempt(s): ${lastError?.message ?? "unknown error"}`);
}

async function runRemoteCommand(input: {
  sshKeyPath: string;
  port: number;
  user: string;
  host: string;
  command: string;
}): Promise<{ stdout: string; stderr: string; attempts: number }> {
  const run = await withRetries("ssh command", async () =>
    execFileAsync(
      "ssh",
      [
        "-i",
        input.sshKeyPath,
        "-p",
        String(input.port),
        "-o",
        "BatchMode=yes",
        "-o",
        `ConnectTimeout=${Math.max(3, Math.floor(SSH_TIMEOUT_MS / 1000))}`,
        `${input.user}@${input.host}`,
        input.command
      ],
      { timeout: SSH_TIMEOUT_MS }
    )
  );
  return { ...run.value, attempts: run.attempts };
}

export async function provisionAgentOnNode(input: {
  node: NodeHost;
  agent_id: string;
  tenant_id: string;
  skills: string[];
}): Promise<{ mode: string; remote_dir: string; status_path: string; reused: boolean; attempts: number }> {
  await ensureSkillsExist(input.skills);

  const baseDir = input.node.base_path ?? "~/.agentd";
  const remoteDir = path.posix.join(baseDir, input.agent_id);
  const statusFile = path.posix.join(remoteDir, "status.json");

  if (input.node.mode === "local") {
    const targetDir = path.resolve(String(baseDir).replace(/^~\//, `${process.env.HOME ?? "/tmp"}/`), input.agent_id);
    const statusPath = path.join(targetDir, "status.json");
    const current = await readStatusJson(statusPath);
    if (current?.status === "provisioned" && current.tenant_id === input.tenant_id && current.agent_id === input.agent_id) {
      return { mode: "local", remote_dir: targetDir, status_path: statusPath, reused: true, attempts: 1 };
    }

    await ensureDir(targetDir);
    await ensureDir(path.join(targetDir, "skills"));
    await ensureDir(path.join(targetDir, "inputs"));
    await ensureDir(path.join(targetDir, "outputs"));

    for (const skill of input.skills) {
      const src = path.join(REPO_ROOT, "skills", "templates", skill);
      const dst = path.join(targetDir, "skills", skill);
      await fs.mkdir(dst, { recursive: true });
      await fs.cp(src, dst, { recursive: true, force: true });
    }

    const daemonScript = path.join(targetDir, "node-daemon.sh");
    await fs.writeFile(
      daemonScript,
      ['#!/usr/bin/env bash', 'echo "agent daemon running" > daemon.log'].join("\n"),
      "utf8"
    );
    await fs.chmod(daemonScript, 0o755);
    await fs.writeFile(
      path.join(targetDir, "config.json"),
      JSON.stringify({ tenant_id: input.tenant_id, agent_id: input.agent_id, heartbeatMinutes: 30 }, null, 2),
      "utf8"
    );
    await fs.writeFile(path.join(targetDir, "HEARTBEAT.md"), "# Heartbeat Tasks\n", "utf8");

    await fs.writeFile(
      statusPath,
      JSON.stringify(
        {
          tenant_id: input.tenant_id,
          agent_id: input.agent_id,
          status: "provisioned",
          updated_at: new Date().toISOString()
        },
        null,
        2
      ),
      "utf8"
    );

    return { mode: "local", remote_dir: targetDir, status_path: statusPath, reused: false, attempts: 1 };
  }

  const host = input.node.ssh_host;
  const user = input.node.ssh_user;
  const port = input.node.ssh_port ?? 22;
  if (!host || !user) {
    throw new Error("Node missing ssh_host or ssh_user");
  }

  const sshKeyPath = process.env.FLEET_SSH_KEY_PATH;
  if (!sshKeyPath) {
    throw new Error("FLEET_SSH_KEY_PATH env var is required for SSH provisioning");
  }
  try {
    await fs.access(sshKeyPath);
  } catch {
    throw new Error(`FLEET_SSH_KEY_PATH not found: ${sshKeyPath}`);
  }

  const precheck = await runRemoteCommand({
    sshKeyPath,
    port,
    user,
    host,
    command: "echo precheck-ok"
  });

  const existingStatus = await runRemoteCommand({
    sshKeyPath,
    port,
    user,
    host,
    command: `[ -f ${statusFile} ] && cat ${statusFile} || true`
  });
  try {
    const parsed = existingStatus.stdout.trim() ? (JSON.parse(existingStatus.stdout.trim()) as { tenant_id?: string; agent_id?: string; status?: string }) : null;
    if (parsed?.status === "provisioned" && parsed.tenant_id === input.tenant_id && parsed.agent_id === input.agent_id) {
      return {
        mode: "ssh",
        remote_dir: remoteDir,
        status_path: statusFile,
        reused: true,
        attempts: Math.max(precheck.attempts, existingStatus.attempts)
      };
    }
  } catch {
    // Non-JSON status payload is treated as non-idempotent state; continue provisioning.
  }

  const mkdirResult = await runRemoteCommand({
    sshKeyPath,
    port,
    user,
    host,
    command: `mkdir -p ${remoteDir}/skills ${remoteDir}/inputs ${remoteDir}/outputs`
  });

  let maxAttempts = Math.max(precheck.attempts, existingStatus.attempts, mkdirResult.attempts);

  for (const skill of input.skills) {
    const src = path.join(REPO_ROOT, "skills", "templates", skill);
    const scpResult = await withRetries("scp skill copy", () =>
      execFileAsync(
        "scp",
        ["-i", sshKeyPath, "-P", String(port), "-r", src, `${user}@${host}:${remoteDir}/skills/`],
        { timeout: SSH_TIMEOUT_MS }
      )
    );
    maxAttempts = Math.max(maxAttempts, scpResult.attempts);
  }

  const payload = JSON.stringify(
    { tenant_id: input.tenant_id, agent_id: input.agent_id, status: "provisioned", updated_at: new Date().toISOString() },
    null,
    2
  ).replace(/"/g, '\\"');
  const configPayload = JSON.stringify(
    { tenant_id: input.tenant_id, agent_id: input.agent_id, heartbeatMinutes: 30 },
    null,
    2
  ).replace(/"/g, '\\"');

  const writeResult = await runRemoteCommand({
    sshKeyPath,
    port,
    user,
    host,
    command: `printf \"${payload}\" > ${statusFile} && printf \"${configPayload}\" > ${remoteDir}/config.json && printf \"# Heartbeat Tasks\\n\" > ${remoteDir}/HEARTBEAT.md`
  });

  maxAttempts = Math.max(maxAttempts, writeResult.attempts);
  return { mode: "ssh", remote_dir: remoteDir, status_path: statusFile, reused: false, attempts: maxAttempts };
}
