#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

type Tx = {
  date: string;
  description: string;
  category: string;
  amount: number;
};

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  return process.argv[i + 1] ?? null;
}

function parseCsv(content: string): Tx[] {
  const lines = content.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length <= 1) return [];

  const rows = lines.slice(1);
  return rows.map((line) => {
    const [date, description, category, amount] = line.split(",").map((value) => value.trim());
    return {
      date,
      description,
      category,
      amount: Number(amount)
    };
  });
}

function main() {
  const inputArg = argValue("--input");
  const outputArg = argValue("--output");
  if (!inputArg || !outputArg) {
    console.error("Missing args. Use --input <csv> --output <json>");
    process.exit(1);
  }

  const inputPath = path.resolve(process.cwd(), inputArg);
  const outputPath = path.resolve(process.cwd(), outputArg);

  const raw = fs.readFileSync(inputPath, "utf8");
  const txs = parseCsv(raw);

  const totalsByCategory: Record<string, number> = {};
  let incomeTotal = 0;
  let expenseTotal = 0;

  txs.forEach((tx) => {
    totalsByCategory[tx.category] = (totalsByCategory[tx.category] ?? 0) + tx.amount;
    if (tx.amount >= 0) incomeTotal += tx.amount;
    else expenseTotal += Math.abs(tx.amount);
  });

  const report = {
    generatedAt: new Date().toISOString(),
    transactions: txs.length,
    totalsByCategory,
    incomeTotal,
    expenseTotal,
    net: incomeTotal - expenseTotal
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`Wrote bookkeeping report to: ${outputPath}`);
}

main();
