/**
 * Prompt template interpolation — Factor #2 (Prompt Engineering).
 *
 * Supports {{variable_name}} placeholders with optional defaults:
 *   {{agent_name}}           — required, fails if missing
 *   {{agent_name|Unnamed}}   — uses "Unnamed" if not provided
 *
 * Variables are case-sensitive and must be alphanumeric + underscores.
 */

const VAR_PATTERN = /\{\{(\w+)(?:\|([^}]*))?\}\}/g;

/**
 * Extract all variable names from a template.
 * Returns unique names in order of first appearance.
 */
export function extractVariables(template: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  let match: RegExpExecArray | null;

  // Reset lastIndex for safety
  const re = new RegExp(VAR_PATTERN.source, "g");
  while ((match = re.exec(template)) !== null) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      result.push(name);
    }
  }
  return result;
}

/**
 * Check which variables are required (no default) and missing from the values dict.
 */
export function findMissingVariables(template: string, values: Record<string, string>): string[] {
  const missing: string[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  const re = new RegExp(VAR_PATTERN.source, "g");
  while ((match = re.exec(template)) !== null) {
    const name = match[1];
    const hasDefault = match[2] !== undefined;
    if (!hasDefault && !(name in values) && !seen.has(name)) {
      seen.add(name);
      missing.push(name);
    }
  }
  return missing;
}

export interface InterpolateResult {
  text: string;
  substitutions: number;
  missing: string[];
}

/**
 * Interpolate a template with provided values.
 *
 * - Variables with values get replaced.
 * - Variables with defaults use the default when value is missing.
 * - Variables without defaults and without values are left as-is
 *   and reported in `missing`.
 */
export function interpolate(template: string, values: Record<string, string>): InterpolateResult {
  let substitutions = 0;
  const missing: string[] = [];
  const seen = new Set<string>();

  const text = template.replace(VAR_PATTERN, (original, name: string, fallback: string | undefined) => {
    if (name in values) {
      substitutions++;
      return values[name];
    }
    if (fallback !== undefined) {
      substitutions++;
      return fallback;
    }
    if (!seen.has(name)) {
      seen.add(name);
      missing.push(name);
    }
    return original;
  });

  return { text, substitutions, missing };
}
