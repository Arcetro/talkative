import { promises as fs } from "node:fs";
import path from "node:path";

export function ensureInside(baseDir: string, maybePath: string): string {
  const resolved = path.resolve(baseDir, maybePath);
  const normalizedBase = path.resolve(baseDir) + path.sep;
  if (!(resolved + path.sep).startsWith(normalizedBase) && resolved !== path.resolve(baseDir)) {
    throw new Error(`Path escapes workspace boundary: ${maybePath}`);
  }
  return resolved;
}

export async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function parseFrontmatter(content: string): Record<string, string> {
  if (!content.startsWith("---")) return {};
  const end = content.indexOf("\n---", 3);
  if (end < 0) return {};
  const body = content.slice(3, end).trim();
  const lines = body.split("\n");
  const out: Record<string, string> = {};

  lines.forEach((line) => {
    const idx = line.indexOf(":");
    if (idx < 0) return;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^"|"$/g, "");
    if (key) out[key] = value;
  });

  return out;
}

export function tokenizeCommand(command: string): string[] {
  const tokens = command.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  return tokens.map((token) => token.replace(/^"|"$/g, "").replace(/^'|'$/g, ""));
}
