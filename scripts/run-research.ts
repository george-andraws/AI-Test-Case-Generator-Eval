/**
 * Runs multiple experiment variations sequentially from a research protocol file.
 *
 * Usage:
 *   npm run research <path-to-research.json>
 *
 * Each variation overrides testMethodology (and optionally revisionNotes) while
 * sharing the URL, productRequirements, judgePrompt, and imagePaths from the
 * protocol root. Variations run one at a time with a 5-second pause between
 * them to avoid rate-limit bursts.
 *
 * A comparison summary table is printed at the end showing average judge scores
 * per variation per generator.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import fs from "fs/promises";
import path from "path";

import appConfig from "../src/lib/config";
import { initTracing, flushTracing } from "../src/lib/llm";
import { readRevision, urlToSlug } from "../src/lib/storage";
import { runExperiment, runJudgeOnly, printSummary, resolvePrompt } from "./run-experiment";
import type { ExperimentConfig, ExperimentResult } from "./run-experiment";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ResearchVariation {
  name: string;
  testMethodology: string;
  /** Overrides the protocol-level revisionNotes when set. */
  revisionNotes?: string;
}

export interface ResearchProtocol {
  url: string;
  productRequirements: string;
  judgePrompt: string;
  /** Default revision notes prefix; variation name is appended automatically. */
  revisionNotes?: string;
  imagePaths?: string[];
  variations: ResearchVariation[];
}

// ── Comparison summary ─────────────────────────────────────────────────────────

export interface VariationSummary {
  name: string;
  result: ExperimentResult;
}

export function avgJudgeScore(
  judgeScores: ExperimentResult["judgeScores"],
  generatorId: string
): number | null {
  const scores: number[] = [];
  for (const genMap of Object.values(judgeScores)) {
    const r = genMap[generatorId];
    if (r?.success && r.score !== undefined) {
      scores.push(r.score);
    }
  }
  if (scores.length === 0) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

export function printComparisonTable(summaries: VariationSummary[]): void {
  const W = 62;
  const heavy = "═".repeat(W);
  const light = "─".repeat(W);

  console.log(`\n${heavy}`);
  console.log("  RESEARCH COMPARISON — Average judge scores per variation");
  console.log(`  (scores 0–5, averaged across all judges)`);
  console.log(heavy);

  // Column headers: one per enabled generator
  const enabledGens = appConfig.generators.filter((g) => g.enabled);
  const genCols = enabledGens.map((g) => g.name.substring(0, 9).padStart(10));
  console.log(`${"Variation".padEnd(32)} ${genCols.join(" ")}`);
  console.log(light);

  for (const { name, result } of summaries) {
    const cols = enabledGens.map((gen) => {
      const avg = avgJudgeScore(result.judgeScores, gen.id);
      if (avg === null) return "-".padStart(10);
      return avg.toFixed(1).padStart(10);
    });
    const label = name.length > 31 ? name.substring(0, 28) + "…" : name;
    console.log(`${label.padEnd(32)} ${cols.join(" ")}`);
  }

  console.log("");

  // Best-per-generator callout
  if (summaries.length > 1) {
    console.log("  Best variation per generator:");
    for (const gen of enabledGens) {
      let best: { name: string; avg: number } | null = null;
      for (const { name, result } of summaries) {
        const avg = avgJudgeScore(result.judgeScores, gen.id);
        if (avg !== null && (best === null || avg > best.avg)) {
          best = { name, avg };
        }
      }
      if (best) {
        console.log(`    ${gen.name}: ${best.name} (avg ${best.avg.toFixed(1)})`);
      }
    }
    console.log("");
  }
}

// ── Core orchestration ─────────────────────────────────────────────────────────

export async function runResearch(protocol: ResearchProtocol): Promise<VariationSummary[]> {
  console.log(`\nResearch protocol loaded.`);
  console.log(`URL:        ${protocol.url}`);
  console.log(`Variations: ${protocol.variations.map((v) => v.name).join(", ")}`);
  console.log(`Total runs: ${protocol.variations.length}\n`);

  const summaries: VariationSummary[] = [];

  for (let i = 0; i < protocol.variations.length; i++) {
    const variation = protocol.variations[i];
    const isLast = i === protocol.variations.length - 1;

    console.log(`${"─".repeat(62)}`);
    console.log(`Variation ${i + 1}/${protocol.variations.length}: ${variation.name}`);
    console.log("─".repeat(62));

    const expConfig: ExperimentConfig = {
      url: protocol.url,
      productRequirements: protocol.productRequirements,
      judgePrompt: protocol.judgePrompt,
      testMethodology: variation.testMethodology,
      revisionNotes:
        variation.revisionNotes ??
        `${protocol.revisionNotes ? protocol.revisionNotes + " — " : ""}${variation.name}`,
      imagePaths: protocol.imagePaths,
    };

    try {
      const result = await runExperiment(expConfig);
      printSummary(result);
      summaries.push({ name: variation.name, result });
    } catch (err) {
      console.error(
        `Variation "${variation.name}" failed: ${err instanceof Error ? err.message : err}`
      );
    }

    if (!isLast) {
      process.stdout.write("\nWaiting 5 seconds before next variation… ");
      await new Promise((resolve) => setTimeout(resolve, 5000));
      console.log("continuing.\n");
    }
  }

  if (summaries.length > 0) {
    printComparisonTable(summaries);
  }

  return summaries;
}

// ── CLI entry point ────────────────────────────────────────────────────────────

function promptDesc(original: string, resolved: string): string {
  return original.startsWith("file:")
    ? `loaded from ${original.slice(5)} (${resolved.length} chars)`
    : `inline (${resolved.length} chars)`;
}

export function printDryRunResearch(
  originalProtocol: ResearchProtocol,
  resolvedProtocol: ResearchProtocol
): void {
  const W = 62;
  const line = "─".repeat(W);
  console.log(`\n${line}`);
  console.log("DRY RUN — no API calls will be made");
  console.log(line);
  console.log(`URL: ${resolvedProtocol.url}`);
  console.log(`Product Requirements: ${promptDesc(originalProtocol.productRequirements, resolvedProtocol.productRequirements)}`);
  console.log(`Judge Prompt:         ${promptDesc(originalProtocol.judgePrompt, resolvedProtocol.judgePrompt)}`);

  const enabledGens = appConfig.generators.filter((g) => g.enabled);
  const enabledJudges = appConfig.judges.filter((j) => j.enabled);
  console.log(`\nGenerator Models (${enabledGens.length} enabled of ${appConfig.generators.length} total):`);
  for (const g of enabledGens) console.log(`  • ${g.name}`);

  console.log(`\nJudge Models (${enabledJudges.length} enabled of ${appConfig.judges.length} total):`);
  for (const j of enabledJudges) console.log(`  • ${j.name}`);

  console.log(`\nVariations (${resolvedProtocol.variations.length}):`);
  for (let i = 0; i < resolvedProtocol.variations.length; i++) {
    const orig = originalProtocol.variations[i];
    const resolved = resolvedProtocol.variations[i];
    console.log(`\n  [${i + 1}] ${resolved.name}`);
    console.log(`      Methodology: ${promptDesc(orig.testMethodology, resolved.testMethodology)}`);
    const preview = resolved.testMethodology.slice(0, 200).replace(/\n/g, " ");
    const ellipsis = resolved.testMethodology.length > 200 ? "…" : "";
    console.log(`      Preview: "${preview}${ellipsis}"`);
  }

  const N = resolvedProtocol.variations.length;
  const M = enabledGens.length;
  const J = enabledJudges.length;
  const genRuns = N * M;
  const judgeEvals = genRuns * J;
  console.log("\nSummary:");
  console.log(`  Total variations:   ${N}`);
  console.log(`  Generator runs:     ${N} variations × ${M} models = ${genRuns}`);
  console.log(`  Judge evaluations:  ${genRuns} generator outputs × ${J} judge models = ${judgeEvals}`);
  console.log(`  Total API calls:    ${genRuns + judgeEvals}`);
  console.log("");
}

async function main() {
  const args = process.argv.slice(2);

  // Support both positional ("npm run research <path>") and
  // named-flag ("npm run research -- --config <path> [--judge-only --source-revision N]") syntax.
  const configFlagIdx = args.indexOf("--config");
  const judgeOnly = args.includes("--judge-only");
  const dryRun = args.includes("--dry-run");
  const sourceRevFlagIdx = args.indexOf("--source-revision");

  const protocolPath =
    configFlagIdx !== -1 ? args[configFlagIdx + 1] : args.find((a) => !a.startsWith("--"));

  if (!protocolPath) {
    console.error("Usage: npm run research <path-to-research.json> [--dry-run]");
    process.exit(1);
  }

  if (judgeOnly && sourceRevFlagIdx === -1) {
    console.error("Error: --judge-only requires --source-revision <number>");
    process.exit(1);
  }

  const sourceRevision =
    sourceRevFlagIdx !== -1 ? parseInt(args[sourceRevFlagIdx + 1], 10) : undefined;

  if (!dryRun) initTracing();

  let protocol: ResearchProtocol;
  try {
    const raw = await fs.readFile(path.resolve(protocolPath), "utf-8");
    protocol = JSON.parse(raw) as ResearchProtocol;
  } catch (err) {
    console.error(`Failed to load research protocol: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  const originalProtocol: ResearchProtocol = {
    ...protocol,
    variations: protocol.variations.map((v) => ({ ...v })),
  };

  try {
    protocol.productRequirements = resolvePrompt(protocol.productRequirements);
    protocol.judgePrompt = resolvePrompt(protocol.judgePrompt);
    for (const v of protocol.variations) {
      v.testMethodology = resolvePrompt(v.testMethodology);
    }
  } catch (err) {
    console.error(`Failed to load prompt file: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  if (dryRun) {
    printDryRunResearch(originalProtocol, protocol);
    process.exit(0);
  }

  if (judgeOnly) {
    const slug = urlToSlug(protocol.url);
    const sourceRevisionData = await readRevision(slug, sourceRevision!);

    if (!sourceRevisionData) {
      console.error(`Error: Revision ${sourceRevision} not found for URL ${protocol.url}`);
      process.exit(1);
    }

    if (Object.keys(sourceRevisionData.generations).length === 0) {
      console.error(`Error: Revision ${sourceRevision} has no generator outputs`);
      process.exit(1);
    }

    const expConfig: ExperimentConfig = {
      url: protocol.url,
      productRequirements: protocol.productRequirements,
      judgePrompt: protocol.judgePrompt,
      testMethodology: sourceRevisionData.prompts.testMethodology,
      revisionNotes: `Re-judge of revision ${sourceRevision} with updated judge configuration`,
      imagePaths: protocol.imagePaths,
    };

    const result = await runJudgeOnly(expConfig, sourceRevisionData);
    printSummary(result);
  } else {
    if (!protocol.variations?.length) {
      console.error("Research protocol must have at least one variation.");
      process.exit(1);
    }

    await runResearch(protocol);
  }

  process.stdout.write("Flushing traces to Langfuse… ");
  await flushTracing();
  console.log("done.\n");
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
