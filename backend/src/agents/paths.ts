import { existsSync } from "node:fs";
import path from "node:path";

function resolveBackendRoot(): string {
  const cwd = process.cwd();
  if (existsSync(path.join(cwd, "src")) && existsSync(path.join(cwd, "package.json"))) {
    return cwd;
  }

  const nested = path.join(cwd, "backend");
  if (existsSync(path.join(nested, "src")) && existsSync(path.join(nested, "package.json"))) {
    return nested;
  }

  return cwd;
}

export const BACKEND_ROOT = resolveBackendRoot();
export const REPO_ROOT = path.resolve(BACKEND_ROOT, "..");
export const DATA_ROOT = process.env.TALKATIVE_DATA_ROOT
  ? path.resolve(process.env.TALKATIVE_DATA_ROOT)
  : path.join(BACKEND_ROOT, "data");
export const AGENTS_DATA_DIR = path.join(DATA_ROOT, "agents");
export const AGENTS_REGISTRY_FILE = path.join(DATA_ROOT, "agents.json");
export const WORKSPACE_ROOT = path.join(REPO_ROOT, "workspace");
export const SKILL_TEMPLATES_ROOT = path.join(REPO_ROOT, "skills", "templates");
