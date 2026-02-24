import { BudgetReport, SectionBudget } from "./types.js";

/**
 * Factor #3 — Context Budget Manager
 *
 * Assigns token budgets per section, truncates each independently,
 * and redistributes unused tokens to sections that need more space.
 *
 * Default weights (customizable):
 *   prompt: 30%, user_message: 25%, events: 30%, errors: 15%
 */

export interface BudgetWeights {
  prompt: number;
  user_message: number;
  events: number;
  errors: number;
}

export const DEFAULT_WEIGHTS: BudgetWeights = {
  prompt: 0.30,
  user_message: 0.25,
  events: 0.30,
  errors: 0.15,
};

export interface Section {
  name: keyof BudgetWeights;
  content: string;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function truncateToTokens(text: string, maxTokens: number): { text: string; truncated: boolean } {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return { text, truncated: false };
  return {
    text: `${text.slice(0, maxChars)}\n[TRUNCATED]`,
    truncated: true,
  };
}

/**
 * Allocate budgets and truncate each section independently.
 *
 * Pass 1: Allocate proportional budgets from weights.
 * Pass 2: Sections under budget donate surplus to an overflow pool.
 * Pass 3: Sections over budget receive from the overflow pool (proportional to need).
 */
export function allocateAndTruncate(
  sections: Section[],
  totalBudget: number,
  weights: BudgetWeights = DEFAULT_WEIGHTS
): { results: { name: string; text: string }[]; report: BudgetReport } {
  // Pass 1: initial allocation
  const allocations = sections.map((s) => ({
    name: s.name,
    content: s.content,
    rawTokens: estimateTokens(s.content),
    allocated: Math.floor(totalBudget * (weights[s.name] ?? 0.25)),
  }));

  // Pass 2: collect surplus from under-budget sections
  let surplus = 0;
  const needsMore: typeof allocations = [];

  for (const a of allocations) {
    if (a.rawTokens < a.allocated) {
      surplus += a.allocated - a.rawTokens;
      a.allocated = a.rawTokens; // shrink to actual usage
    } else if (a.rawTokens > a.allocated) {
      needsMore.push(a);
    }
  }

  // Pass 3: redistribute surplus proportional to need
  if (surplus > 0 && needsMore.length > 0) {
    const totalNeed = needsMore.reduce((sum, a) => sum + (a.rawTokens - a.allocated), 0);
    for (const a of needsMore) {
      const need = a.rawTokens - a.allocated;
      const share = Math.floor(surplus * (need / totalNeed));
      a.allocated += share;
    }
  }

  // Truncate each section to its final budget
  const sectionBudgets: SectionBudget[] = [];
  const results: { name: string; text: string }[] = [];

  for (const a of allocations) {
    const { text, truncated } = truncateToTokens(a.content, a.allocated);
    results.push({ name: a.name, text });
    sectionBudgets.push({
      name: a.name,
      allocated: a.allocated,
      used: estimateTokens(text),
      truncated,
    });
  }

  const totalUsed = sectionBudgets.reduce((sum, s) => sum + s.used, 0);

  return {
    results,
    report: {
      total_budget: totalBudget,
      total_used: totalUsed,
      sections: sectionBudgets,
    },
  };
}
