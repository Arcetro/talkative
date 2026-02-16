import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { REPO_ROOT } from "../agents/paths.js";
import { NodeHost } from "./types.js";

const execFileAsync = promisify(execFile);

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function provisionAgentOnNode(input: {
  node: NodeHost;
  agent_id: string;
  tenant_id: string;
  skills: string[];
}): Promise<{ mode: string; remote_dir: string; status_path: string }> {
  const baseDir = input.node.base_path ?? "~/.agentd";
  const remoteDir = path.posix.join(baseDir, input.agent_id);
  const statusFile = path.posix.join(remoteDir, "status.json");

  if (input.node.mode === "local") {
    const targetDir = path.resolve(String(baseDir).replace(/^~\//, `${process.env.HOME ?? "/tmp"}/`), input.agent_id);
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

    const statusPath = path.join(targetDir, "status.json");
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

    return { mode: "local", remote_dir: targetDir, status_path: statusPath };
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

  await execFileAsync("ssh", [
    "-i",
    sshKeyPath,
    "-p",
    String(port),
    `${user}@${host}`,
    `mkdir -p ${remoteDir}/skills ${remoteDir}/inputs ${remoteDir}/outputs`
  ]);

  for (const skill of input.skills) {
    const src = path.join(REPO_ROOT, "skills", "templates", skill);
    await execFileAsync("scp", ["-i", sshKeyPath, "-P", String(port), "-r", src, `${user}@${host}:${remoteDir}/skills/`]);
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

  await execFileAsync("ssh", [
    "-i",
    sshKeyPath,
    "-p",
    String(port),
    `${user}@${host}`,
    `printf \"${payload}\" > ${statusFile} && printf \"${configPayload}\" > ${remoteDir}/config.json && printf \"# Heartbeat Tasks\\n\" > ${remoteDir}/HEARTBEAT.md`
  ]);

  return { mode: "ssh", remote_dir: remoteDir, status_path: statusFile };
}
