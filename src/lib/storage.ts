import fs from "fs/promises";
import path from "path";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ConfigSnapshot {
  generators: Array<{ id: string; name: string; model: string; provider: string }>;
  judges: Array<{ id: string; name: string; model: string; provider: string }>;
}

export interface RevisionData {
  revision: number;
  timestamp: string; // ISO 8601
  url: string;
  prompts: {
    testMethodology: string;
    productRequirements: string;
    judgePrompt: string;
  };
  revisionNotes: string;
  images: string[]; // relative paths to screenshot files (Tier 2, empty for now)
  configSnapshot: ConfigSnapshot;
  generations: {
    [modelId: string]: {
      output: string;
      tokenUsage: { input: number; output: number };
      latencyMs: number;
      langfuseTraceId: string;
    };
  };
  scores: {
    human: {
      [modelId: string]: number | null; // 0-5, null if not scored
    };
    judges: {
      [judgeModelId: string]: {
        [generatorModelId: string]: {
          score: number;
          feedback: string;
          langfuseTraceId: string;
          rawData?: Record<string, unknown>;
        };
      };
    };
  };
}

// ── Path helpers ──────────────────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), "data");

/**
 * Converts an arbitrary URL into a safe filename stem.
 * e.g. "http://localhost:3000/foo" → "localhost-3000-foo"
 */
export function urlToSlug(url: string): string {
  return url
    .replace(/^https?:\/\//, "")    // strip protocol
    .replace(/[^a-zA-Z0-9]+/g, "-") // non-alphanum → dash
    .replace(/^-+|-+$/g, "")        // trim leading/trailing dashes
    .toLowerCase();
}

function slugToFilePath(slug: string): string {
  return path.join(DATA_DIR, `${slug}.json`);
}

// ── Directory setup ───────────────────────────────────────────────────────────

export async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

// ── Read ──────────────────────────────────────────────────────────────────────

/** Returns all revisions for the given URL slug, or null if the file doesn't exist. */
export async function readRevisions(slug: string): Promise<RevisionData[] | null> {
  try {
    const raw = await fs.readFile(slugToFilePath(slug), "utf-8");
    return JSON.parse(raw) as RevisionData[];
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/** Returns a single revision by number, or null if not found. */
export async function readRevision(
  slug: string,
  revision: number
): Promise<RevisionData | null> {
  const revisions = await readRevisions(slug);
  if (!revisions) return null;
  return revisions.find((r) => r.revision === revision) ?? null;
}

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Appends a new revision to the slug's JSON file (creating it if needed).
 * Auto-assigns the next revision number and stamps the timestamp.
 * Returns the assigned revision number.
 */
export async function saveRevision(
  data: Omit<RevisionData, "revision" | "timestamp">
): Promise<number> {
  await ensureDataDir();

  const slug = urlToSlug(data.url);
  const filePath = slugToFilePath(slug);

  const existing = (await readRevisions(slug)) ?? [];
  const revision = existing.length + 1;

  const entry: RevisionData = {
    ...data,
    revision,
    timestamp: new Date().toISOString(),
  };

  existing.push(entry);
  await fs.writeFile(filePath, JSON.stringify(existing, null, 2), "utf-8");

  return revision;
}

// ── Patch ─────────────────────────────────────────────────────────────────────

export interface RevisionPatch {
  generations?: RevisionData["generations"];
  images?: RevisionData["images"];
  scores?: {
    human?: RevisionData["scores"]["human"];
    judges?: RevisionData["scores"]["judges"];
  };
}

/**
 * Deep-merges a patch into an existing revision on disk.
 * Generations and scores are merged (not replaced) so each save point only
 * needs to send the fields it owns.
 */
export async function updateRevision(
  slug: string,
  revision: number,
  patch: RevisionPatch
): Promise<void> {
  await ensureDataDir();

  const revisions = await readRevisions(slug);
  if (!revisions) throw new Error(`No data found for slug: ${slug}`);

  const idx = revisions.findIndex((r) => r.revision === revision);
  if (idx === -1) throw new Error(`Revision ${revision} not found for slug: ${slug}`);

  const existing = revisions[idx];

  revisions[idx] = {
    ...existing,
    ...(patch.generations !== undefined && {
      generations: { ...existing.generations, ...patch.generations },
    }),
    ...(patch.images !== undefined && { images: patch.images }),
    ...(patch.scores !== undefined && {
      scores: {
        human: { ...existing.scores.human, ...(patch.scores.human ?? {}) },
        judges: mergeJudgeScores(existing.scores.judges, patch.scores.judges),
      },
    }),
  };

  await fs.writeFile(slugToFilePath(slug), JSON.stringify(revisions, null, 2), "utf-8");
}

function mergeJudgeScores(
  existing: RevisionData["scores"]["judges"],
  patch: RevisionData["scores"]["judges"] | undefined
): RevisionData["scores"]["judges"] {
  if (!patch) return existing;
  const merged = { ...existing };
  for (const [judgeId, genMap] of Object.entries(patch)) {
    merged[judgeId] = { ...(merged[judgeId] ?? {}), ...genMap };
  }
  return merged;
}

// ── List ──────────────────────────────────────────────────────────────────────

export interface ProductSummary {
  url: string;
  slug: string;
  revisionCount: number;
}

/** Reads the data/ directory and returns a summary of every stored product. */
export async function listProducts(): Promise<ProductSummary[]> {
  await ensureDataDir();

  const entries = await fs.readdir(DATA_DIR);
  const jsonFiles = entries.filter((f) => f.endsWith(".json"));

  const summaries = await Promise.allSettled(
    jsonFiles.map(async (file): Promise<ProductSummary> => {
      const slug = file.replace(/\.json$/, "");
      const raw = await fs.readFile(path.join(DATA_DIR, file), "utf-8");
      const revisions = JSON.parse(raw) as RevisionData[];
      const url = revisions[0]?.url ?? slug;
      return { url, slug, revisionCount: revisions.length };
    })
  );

  return summaries
    .filter((s): s is PromiseFulfilledResult<ProductSummary> => s.status === "fulfilled")
    .map((s) => s.value);
}
