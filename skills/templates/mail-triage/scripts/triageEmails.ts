#!/usr/bin/env node
/**
 * POC email triage script
 * Usage:
 *   node triageEmails.ts --input ./emails.json --output ./triage.json
 */
import fs from "node:fs";
import path from "node:path";

type Email = {
  id: string;
  from: string;
  subject: string;
  snippet?: string;
  date?: string;
};

type Category = "billing" | "work" | "personal" | "spam";

function argValue(flag: string) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  return process.argv[i + 1] ?? null;
}

function textOf(e: Email) {
  return `${e.from} ${e.subject} ${e.snippet ?? ""}`.toLowerCase();
}

function scoreCategory(t: string): Record<Category, number> {
  const s: Record<Category, number> = { billing: 0, work: 0, personal: 0, spam: 0 };

  // billing
  if (/(invoice|receipt|factura|pago|payment|subscription|vencimiento)/.test(t)) s.billing += 3;

  // work
  if (/(pr\b|merge|deploy|incident|ticket|sprint|roadmap|meeting|standup)/.test(t)) s.work += 3;

  // personal
  if (/(cumple|asado|familia|plan|finde|viaje|amigo|mamá|papá)/.test(t)) s.personal += 2;

  // spam
  if (/(winner|prize|claim now|verify account|password expired|urgent|limited time)/.test(t)) s.spam += 3;
  if (/(free money|crypto giveaway|airdrop)/.test(t)) s.spam += 3;

  return s;
}

function pickCategory(scores: Record<Category, number>): { category: Category; confidence: number } {
  const entries = Object.entries(scores) as Array<[Category, number]>;
  entries.sort((a, b) => b[1] - a[1]);
  const [bestCat, bestScore] = entries[0];
  const secondScore = entries[1]?.[1] ?? 0;

  const confidence =
    bestScore <= 0 ? 0.2 : Math.max(0.35, Math.min(0.95, 0.5 + (bestScore - secondScore) * 0.15));

  return { category: bestCat, confidence };
}

function suggestAction(category: Category): string {
  switch (category) {
    case "billing":
      return "needs_review_and_record";
    case "work":
      return "needs_reply_or_task";
    case "personal":
      return "read_or_reply";
    case "spam":
      return "ignore_or_block";
  }
}

function main() {
  const input = argValue("--input");
  const output = argValue("--output");
  if (!input || !output) {
    console.error("Missing args. Use: --input <file> --output <file>");
    process.exit(1);
  }

  const inputPath = path.resolve(process.cwd(), input);
  const outPath = path.resolve(process.cwd(), output);

  const raw = fs.readFileSync(inputPath, "utf-8");
  const emails: Email[] = JSON.parse(raw);

  const items = emails.map((e) => {
    const t = textOf(e);
    const scores = scoreCategory(t);
    const { category, confidence } = pickCategory(scores);
    return {
      id: e.id,
      from: e.from,
      subject: e.subject,
      category,
      confidence,
      action: suggestAction(category),
    };
  });

  const totals = items.reduce(
    (acc, it) => {
      acc[it.category] += 1;
      return acc;
    },
    { billing: 0, work: 0, personal: 0, spam: 0 }
  );

  const report = {
    generatedAt: new Date().toISOString(),
    totals,
    items,
  };

  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf-8");
  console.log(`Wrote triage report to: ${outPath}`);
}

main();
