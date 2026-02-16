import { promises as fs } from "node:fs";
import path from "node:path";
import { AgentSkill } from "./types.js";
import { parseFrontmatter } from "./utils.js";

export async function loadAgentSkills(workspaceDir: string): Promise<AgentSkill[]> {
  const skillsRoot = path.join(workspaceDir, "skills");

  try {
    const entries = await fs.readdir(skillsRoot, { withFileTypes: true });
    const skills: AgentSkill[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillDir = path.join(skillsRoot, entry.name);
      const skillMdPath = path.join(skillDir, "SKILL.md");

      try {
        const skillMd = await fs.readFile(skillMdPath, "utf8");
        const meta = parseFrontmatter(skillMd);
        skills.push({
          id: entry.name,
          name: meta.name ?? entry.name,
          description: meta.description ?? "No description",
          path: skillDir
        });
      } catch {
        // Ignore folders without a readable SKILL.md.
      }
    }

    return skills;
  } catch {
    return [];
  }
}
