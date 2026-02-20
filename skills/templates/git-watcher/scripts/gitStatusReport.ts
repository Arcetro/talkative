#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { writeSkillReport } from "../../../lib/skillReport.js";

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  return process.argv[i + 1] ?? null;
}

function safeExec(repoPath: string, args: string[]): string | null {
  try {
    return execFileSync("git", ["-C", repoPath, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return null;
  }
}

function main() {
  const repoArg = argValue("--repo") ?? ".";
  const outputArg = argValue("--output");
  if (!outputArg) {
    console.error("Missing --output <file>");
    process.exit(1);
  }

  const repoPath = path.resolve(process.cwd(), repoArg);
  const outPath = path.resolve(process.cwd(), outputArg);

  const branch = safeExec(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const porcelain = safeExec(repoPath, ["status", "--porcelain"]);

  const changedFiles = porcelain
    ? porcelain
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => ({ code: line.slice(0, 2).trim(), path: line.slice(3).trim() }))
    : [];

  const data = {
    repoPath,
    isGitRepo: Boolean(branch || porcelain),
    branch: branch ?? "unknown",
    isDirty: changedFiles.length > 0,
    changedFiles
  };

  writeSkillReport(outPath, "git-watcher", data, {
    metrics: { changedFileCount: changedFiles.length }
  });
}

main();
