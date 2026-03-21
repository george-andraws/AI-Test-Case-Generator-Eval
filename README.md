This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

Add .env.local file with API keys:
```bash
# Generator / Judge API keys
ANTHROPIC_API_KEY=""
OPENAI_API_KEY=""
GOOGLE_API_KEY=""

# Langfuse observability
LANGFUSE_PUBLIC_KEY=""
LANGFUSE_SECRET_KEY=""
```

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

---

## Decision Log

### Session 1 — 2026-03-19: Initial Build

**Goal:** Build a local dev tool that sends product requirements to multiple LLMs simultaneously, collects their generated test cases side-by-side, scores them (both manually and via LLM-as-judge), and sends everything to Langfuse for observability.

---

#### Architecture Overview

The tool is a Next.js 16 (App Router, TypeScript, Tailwind) application that runs locally. It has no user authentication and no cloud deployment — it's purely a local research and comparison tool.

**Key layers:**

- **`src/lib/config.ts`** — Single source of truth for all model definitions. Generators and judges are both `ModelConfig` objects with provider, model ID, API key env var, maxTokens, and temperature. Separating generators from judges allows the same model (e.g., Gemini) to serve both roles with different parameters.

- **`src/lib/llm/`** — Provider-agnostic LLM abstraction. A single `callLLM(req)` function routes to Anthropic, OpenAI, or Google adapters based on `provider`. Every call automatically creates an OTEL span that is exported to Langfuse via `LangfuseSpanProcessor`. The `traceId` (OTEL hex) returned by `callLLM` is used downstream to attach human scores to the correct trace.

- **`src/instrumentation.ts`** — Next.js instrumentation hook that initializes the OTEL SDK once on server startup.

- **API routes:**
  - `/api/generate` — Calls one generator model per request (client fires all in parallel)
  - `/api/judge` — Calls one judge × all generators per request; parses JSON from response with markdown-fence fallback
  - `/api/scores` — Attaches human scores to Langfuse traces via `LangfuseClient`
  - `/api/data` — Read/write revision history from `data/<url-slug>.json`
  - `/api/products` — Lists all products (URL slugs) in the data directory

- **File-based persistence** — Each product URL maps to a JSON file in `data/`. Each submission appends a new `RevisionData` entry with auto-incremented revision number. The schema stores prompts, generations (output + token usage + latency + traceId), human scores, judge scores, and a `configSnapshot` so historical data stays interpretable if the model config changes later.

---

#### UI Design Decisions

The UI is organized into four sections rendered on a single page:

1. **Product & Revision selector** — Dropdown of previously evaluated products loaded from `data/`. Selecting a product loads its revision history and pre-populates the form with the latest revision's prompts. This makes it easy to iterate on prompt wording across runs.

2. **Inputs** — Test methodology (system prompt), application URL, product requirements (user prompt), revision notes, and judge prompt. The URL is metadata only — models do not browse it.

3. **Model outputs** — Side-by-side panels, one per generator model. Each panel shows a loading skeleton, then the generated test cases in a monospace `<pre>` block, latency, token usage, a 0–5 human score selector, and expandable judge scores per judge model. **Key decision:** the client fires one fetch per generator in parallel rather than one server-side batch, so each panel updates independently as results come in rather than waiting for the slowest model.

4. **Scoring Trends** — Recharts line chart (human scores over revisions) and grouped bar chart (human vs. judge scores by revision). Only rendered when ≥ 2 revisions exist. Also shows per-judge agreement rate (% of scores within ±1 of human).

---

#### LLM-as-Judge Design

Each judge evaluates every generator's output independently. The judge is given the product requirements, the generated test cases, and a user-supplied judge prompt as the system message. It responds with a JSON object `{ score: 0-5, feedback: "..." }`. A three-tier JSON parser handles raw JSON, markdown-fenced JSON, and first-`{...}`-block extraction as fallbacks.

**Self-evaluation flagging:** when a judge model and generator model are the same provider+model (e.g., Gemini judging Gemini), the result is tagged `selfEvaluation: true` and shown with a badge in the UI — a useful signal when interpreting results.

---

### Session 2 — 2026-03-20

**Focus:** Debugging and fixing three categories of issues after the initial build: hydration errors, Langfuse tracing not working, and Gemini judge output truncation.

---

#### Hydration Mismatch (Browser Extension Noise)

A browser extension was injecting `data-arp=""` onto the `<html>` element before React hydrated, causing a persistent console error in Next.js 16 / React 19. The fix (`suppressHydrationWarning` on `<html>`) was already in place from the previous session, but in React 19 the dev overlay logs these mismatches more aggressively than before even when suppressed. **Decision:** Accept this as a dev-only cosmetic warning. It has no impact on functionality or production builds, and there is no further action to take.

---

#### Gemini Judge Output Truncation

Gemini 2.5 Flash was returning truncated JSON (e.g., `"feedback": "Th`) when judging Claude or GPT-4.1 outputs — but not when judging its own outputs. **Root cause:** `gemini-2.5-flash` uses a built-in "thinking" mode that consumes output tokens from the same `maxOutputTokens` budget. The judge models were set to 2048 output tokens, leaving almost nothing for the actual JSON response after thinking consumed its share. The self-evaluation case was shorter to reason about, so it didn't manifest there.

**Fix:** Increased judge `maxTokens` from 2048 to 8192 (Anthropic/OpenAI) and 16384 (Google) in `src/lib/config.ts`. **Lesson:** Models with extended thinking require a significantly larger output token budget than equivalent non-thinking models, especially when the output format is strictly constrained (JSON).

---

#### Langfuse Traces Not Appearing

Scores were visible in Langfuse but OTEL traces were not. This pointed to the `LangfuseClient` (used for scores) working correctly while the OTEL span pipeline was broken.

**Three bugs were found and fixed:**

1. **Spans not flushed before response returned.** Next.js API routes send the HTTP response and can recycle the worker before the OTEL exporter finishes its async export. The test script (`scripts/test-llm.ts`) worked because it called `flushTracing()` / `sdk.shutdown()` which blocks until all exports complete. The fix was adding `flushSpans()` — a non-destructive flush that calls `processor.forceFlush()` — at the end of `/api/generate` and `/api/judge`. Note: `NodeSDK` does not expose `forceFlush()` directly; the reference must be kept on the `LangfuseSpanProcessor` instance itself.

2. **SDK not initialized before first request.** `src/instrumentation.ts` was supposed to initialize the OTEL SDK once on startup, but it was unreliable under Turbopack hot-reloads (module state can be cleared). The fix was making `getTracer()` lazily call `initTracing()` if `_sdk` is null — the same pattern already used by `getLangfuseClient()` for scores. This means tracing is self-initializing on first use, making `instrumentation.ts` non-critical.

3. **Trace input/output fields null or "undefined" in Langfuse.** Two attribute issues: (a) `langfuse.observation.output` was set to a raw string (`response.text`), but Langfuse's OTEL endpoint JSON-parses attribute values — a plain text string fails to parse and is dropped. Fix: wrap with `JSON.stringify(response.text)`. (b) The observation type was never declared, so Langfuse defaulted to SPAN (not GENERATION), which uses different input/output field mapping. Fix: add `span.setAttribute("langfuse.observation.type", "GENERATION")`.

**Key finding on the dual `@opentelemetry/api` packages:** Next.js bundles its own copy of `@opentelemetry/api` (v1.6.0) alongside the project's top-level install (v1.9.0). Both use `Symbol.for('opentelemetry.js.api.1')` on the Node.js `global` object to share a registry, and the compatibility check in v1.6.0 accepts v1.9.0 as compatible (same major, higher minor). So both instances correctly share the same registered tracer provider. This was initially suspected as the root cause but ruled out after inspecting the bundled source.

---

### Session 3 — 2026-03-21

**Focus:** Two independent workstreams — adding a comprehensive Jest test suite, and restructuring data persistence from a single all-at-once save to three incremental save points.

---

#### Jest Test Suite (88 tests, 10 files)

The codebase had no automated tests. A full suite was added under `__tests__/` covering all major concerns without modifying any existing source files.

**Setup decisions:**

- `jest.config.ts` + `tsconfig.test.json`: The project's main `tsconfig.json` uses `"moduleResolution": "bundler"`, which is incompatible with `ts-jest`. A separate `tsconfig.test.json` overrides to `"module": "CommonJS"` and `"moduleResolution": "node"`. This avoids touching the production TS config.
- `moduleNameMapper`: Maps `@/*` path aliases so tests can import from `@/lib/...` the same way source files do.
- `clearMocks: true`: Resets all mock state between tests automatically.

**Test files and what they cover:**

| File | Tests | What it covers |
|---|---|---|
| `__tests__/lib/config.test.ts` | 10 | Field presence, valid providers, no duplicate IDs, temperature/maxToken ranges |
| `__tests__/lib/storage.test.ts` | 15 | `urlToSlug` purity, file creation, revision numbering, `listProducts`, isolation via `process.cwd` spy + `jest.resetModules()` |
| `__tests__/lib/judge-parsing.test.ts` | 7 | Three-tier JSON parser via mocked judge route: raw JSON, markdown-fenced JSON, first-`{...}`-block fallback |
| `__tests__/lib/self-evaluation.test.ts` | 3 | `selfEvaluation` flag: same provider+model → true, same provider/diff model → false, diff provider → false |
| `__tests__/lib/prompt-assembly.test.ts` | 12 | Generator and judge prompt format via mocked routes |
| `__tests__/api/generate.test.ts` | 10 | 200/400 responses, partial failure, response shape |
| `__tests__/api/judge.test.ts` | 10 | 200/400, self-eval detection, partial failure, unparseable response |
| `__tests__/api/data.test.ts` | 10 | GET/POST/PATCH revision handling, 404, validation |
| `__tests__/api/products.test.ts` | 3 | Empty/populated list, response shape |
| `__tests__/lib/llm/router.test.ts` | 8 | Provider routing, unknown provider error, field pass-through |

**Key testing challenges:**

- **Storage isolation**: Each storage test needs an isolated temp directory. The `DATA_DIR` constant is module-level, so `jest.spyOn(process, 'cwd').mockReturnValue(tmpDir)` combined with `jest.resetModules()` + dynamic `require()` in `beforeEach` gives each test a fresh module instance pointing to its own directory.
- **`__esModule: true` on config mocks**: Without it, `ts-jest`'s `esModuleInterop` wraps the default export in an extra `{ default: ... }` layer, making `config.judges` inaccessible. All config mocks need `__esModule: true`.
- **`req.nextUrl` on GET test requests**: Next.js `NextRequest` exposes `nextUrl` as a read-only `URL` instance. Test helpers must add it via `Object.defineProperty` — standard property assignment is silently ignored.

---

#### Incremental Data Persistence

**Problem:** The original flow only saved data when the user clicked "Submit scores." If the page was refreshed or closed after generation but before scoring, all results were lost. Generations and judge scores — which can take 30+ seconds to complete — were ephemeral until the final button click.

**Solution:** Three save points, each writing only what it knows at that moment using a new `PATCH /api/data` endpoint that deep-merges into the existing revision.

**Save Point 1 — After generation completes:** A full `POST /api/data` is fired immediately, creating the revision on disk with all generation outputs (text, token counts, latency, trace IDs) and null human scores. The returned revision number is stored in `currentRevisionId` React state. The product/revision selector refreshes right away so the new revision appears in the UI.

**Save Point 2 — After judging completes:** Judge results are collected from the settled promises (not from React state, which may still be updating) and a `PATCH /api/data` fires to merge judge scores into the already-saved revision. This is fire-and-forget — a failure here doesn't block the user.

**Save Point 3 — On human score submit:** If `currentRevisionId` is set, only human scores are PATCHed (the revision already has everything else). If it's null (e.g., disk error at Save Point 1, or re-running against a loaded historical revision), a full `POST` is sent as a fallback. The Langfuse score submission is unchanged.

**Key implementation decisions:**

- **`updateRevision()` uses deep-merge, not replace**: Generations and scores are spread-merged at each level so Save Point 2 doesn't clobber anything written by Save Point 1, and vice versa. Judge scores are merged at two levels: `judges[judgeId][generatorId]`.
- **Judge scores sent to Langfuse immediately**: `scoreTrace` is now called inside `/api/judge` after results are assembled, rather than waiting for the human submit. This means judge scores appear in Langfuse as soon as judging finishes, independent of whether the user ever submits human scores.
- **`capturedForm` snapshot**: `handleGenerate` captures the form values at invocation time (`const capturedForm = form`) so that even if the user edits the form while generation/judging is running, the saved revision reflects what was submitted.
- **UI hint update**: The "Next generation will create: Revision N" hint changes to "Current session: Revision N" once a revision is saved, giving the user confirmation that data is already persisted.
