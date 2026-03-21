# QE Test Case Eval Tool

A local dev tool for generating and evaluating test cases using multiple LLMs simultaneously. Send product requirements (and optional screenshots) to Claude, GPT-4.1, and Gemini at once, score their outputs side-by-side, and track quality trends over time. All observability flows through Langfuse.

---

## Setup

**1. Clone and install**

```bash
npm install
```

**2. Create `.env.local`** in the project root with your API keys:

```bash
# Generator / Judge models
ANTHROPIC_API_KEY=""
OPENAI_API_KEY=""
GOOGLE_API_KEY=""

# Langfuse observability (https://langfuse.com)
LANGFUSE_PUBLIC_KEY=""
LANGFUSE_SECRET_KEY=""
```

All keys are optional — if a key is missing, that model's panel will show an error and the rest will still run.

**3. Start the dev server**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Usage

### Generating test cases

1. **Select or enter a product URL** — this is used as the unique identifier for a product. It's metadata only; no model browses it.
2. **Attach screenshots** (optional) — drag-and-drop or click to add up to 10 PNG/JPG/WebP images (5 MB each). Images are sent to every generator and judge as visual context.
3. **Fill in the prompts:**
   - *Test methodology* — the system prompt. Describe your testing approach, format preferences, coverage expectations.
   - *Product requirements* — the user prompt. Paste the feature spec or user stories you want test cases for.
   - *Revision notes* — a short label for this run (e.g. "added edge cases to requirements").
   - *Judge prompt* — instructions to the LLM judges on how to score (e.g. "Score 0–5 based on coverage and specificity").
4. Click **Generate test cases**. Each model runs in parallel — panels update independently as results arrive.
5. Click **Run judges** to score each generator's output with all three judge models.
6. Set a **Human score** (0–5) for each panel.
7. Click **Submit human scores** to persist everything and send scores to Langfuse.

Data is saved incrementally — generation results are written to disk immediately after step 4, judge scores after step 5. You won't lose work if you close the tab before submitting.

---

### Reviewing history

Use the **Product** dropdown at the top to load a previously evaluated product. Select a **Revision** to pre-populate the form with that run's prompts and view its stored outputs and scores. The **Scoring Trends** section (visible once ≥ 2 revisions exist) shows:

- Human scores over revisions per model
- Human vs. judge score comparison by revision
- Per-judge agreement rate (% of scores within ±1 of human)

---

### Copying output

Each model panel has a clipboard icon in the top-right corner of the header. Click it to copy the raw markdown text to your clipboard. The icon briefly turns into a checkmark to confirm the copy.

---

## Models

**Generators** (temperature 0.3, 4096 output tokens)

| Name | Provider | Model ID |
|---|---|---|
| Claude 4 Sonnet | Anthropic | `claude-sonnet-4-20250514` |
| GPT-4.1 | OpenAI | `gpt-4.1` |
| Gemini 3.1 Flash Lite Preview | Google | `gemini-3.1-flash-lite-preview` |

**Judges** (temperature 0.2, higher token limits to handle extended thinking)

| Name | Provider | Model ID |
|---|---|---|
| Claude 4 Sonnet (Judge) | Anthropic | `claude-sonnet-4-20250514` |
| GPT-4.1 (Judge) | OpenAI | `gpt-4.1` |
| Gemini 3.1 Flash Lite Preview (Judge) | Google | `gemini-3.1-flash-lite-preview` |

To add or swap models, edit `src/lib/config.ts`. No other changes needed.

**Self-evaluation:** when a judge model and a generator model are the same provider+model, the judge score panel is tagged with a "Self-eval" badge — useful context when interpreting results.

---

## Data storage

All data is stored locally in the `data/` directory (gitignored):

```
data/
  <url-slug>.json          # revision history for each product URL
  images/
    <url-slug>/
      rev-1-screenshot-1.png
      ...
```

Each revision record stores: prompts, generation outputs (text, token usage, latency, Langfuse trace ID), human scores, judge scores, a config snapshot, and image paths.

There is no database, no authentication, and no cloud dependency beyond the LLM and Langfuse APIs.

---

## Running tests

```bash
npm test
```

138 tests across 12 suites covering: storage, LLM routing, API routes (generate, judge, data, upload, products), config validation, judge response parsing, self-evaluation detection, prompt assembly, and the copy-button UI component.

---

## Tech stack

- **Next.js 16** (App Router, TypeScript)
- **Tailwind CSS v4** + `@tailwindcss/typography`
- **Recharts** — scoring trend charts
- **react-markdown** + **remark-gfm** — rendered markdown in output panels
- **Anthropic, OpenAI, Google GenAI SDKs** — LLM calls
- **OpenTelemetry** + **Langfuse** — tracing and observability
- **Jest** + **ts-jest** + **Testing Library** — test suite
