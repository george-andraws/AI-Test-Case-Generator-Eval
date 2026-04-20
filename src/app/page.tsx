"use client";

import { useState, useEffect, useCallback } from "react";
import config from "@/lib/config";
import type { RevisionData } from "@/lib/storage";
import { ModelOutputPanel, type GeneratorPanel } from "./components/ModelOutputPanel";
import { type JudgePanelEntry } from "./components/JudgeScoreSection";
import { ScoringTrends } from "./components/ScoringTrends";
import { ImageUpload, type ImageFile } from "./components/ImageUpload";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FormState {
  testMethodology: string;
  url: string;
  productRequirements: string;
  revisionNotes: string;
  judgePrompt: string;
}

interface ProductSummary {
  url: string;
  slug: string;
  revisionCount: number;
}

type Phase = "idle" | "generating" | "judging" | "done";
type SubmitStatus = "idle" | "submitting" | "done" | "error";

// judgeId → generatorId → entry
type JudgeResultsMap = Record<string, Record<string, JudgePanelEntry>>;

// ── Constants ─────────────────────────────────────────────────────────────────

const EMPTY_FORM: FormState = {
  testMethodology: "",
  url: "",
  productRequirements: "",
  revisionNotes: "",
  judgePrompt: "",
};

// ── Small helpers ─────────────────────────────────────────────────────────────

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700 mb-1.5">
      {children}
    </label>
  );
}

function Textarea({
  id, rows, value, onChange, placeholder, disabled,
}: {
  id: string; rows: number; value: string;
  onChange: (v: string) => void; placeholder: string; disabled?: boolean;
}) {
  return (
    <textarea
      id={id} rows={rows} value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder} disabled={disabled}
      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400 resize-y"
    />
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Page() {
  // ── Form state ────────────────────────────────────────────────────────────
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  // ── Product / revision selectors ─────────────────────────────────────────
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [selectedUrl, setSelectedUrl] = useState<string>("");
  const [revisions, setRevisions] = useState<RevisionData[]>([]);
  const [selectedRevision, setSelectedRevision] = useState<number | "new">("new");

  // ── Generation + judging ─────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>("idle");
  const [panels, setPanels] = useState<GeneratorPanel[]>([]);
  const [judgeResults, setJudgeResults] = useState<JudgeResultsMap>({});

  // ── Image uploads ─────────────────────────────────────────────────────────
  const [images, setImages] = useState<ImageFile[]>([]);
  const [historicImagePaths, setHistoricImagePaths] = useState<string[]>([]);

  // ── Incremental persistence ───────────────────────────────────────────────
  const [currentRevisionId, setCurrentRevisionId] = useState<number | null>(null);

  // ── Score submission ──────────────────────────────────────────────────────
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Human scores as last persisted to disk — used to detect changes for "Update" mode
  const [savedHumanScores, setSavedHumanScores] = useState<Record<string, number | null>>({});

  // ── Judge running ─────────────────────────────────────────────────────────
  const [overwriteExisting, setOverwriteExisting] = useState(false);

  // ── Derived ───────────────────────────────────────────────────────────────
  const enabledGenerators = config.generators.filter((m) => m.enabled);
  const enabledJudges = config.judges.filter((j) => j.enabled);

  const nextRevisionNumber = selectedUrl && revisions.length > 0 ? revisions.length + 1 : 1;

  const successfulPanels = panels.filter((p) => p.status === "success");
  const allScored =
    successfulPanels.length > 0 &&
    successfulPanels.every((p) => p.humanScore !== undefined);

  const canGenerate =
    form.url.trim().length > 0 &&
    (form.testMethodology.trim().length > 0 || form.productRequirements.trim().length > 0) &&
    phase !== "generating" &&
    phase !== "judging";

  const scoresWereSubmitted = Object.values(savedHumanScores).some((v) => v !== null);
  const anyScoreChanged = successfulPanels.some(
    (p) => p.humanScore !== undefined && p.humanScore !== savedHumanScores[p.id]
  );
  const canSubmit = scoresWereSubmitted ? anyScoreChanged : allScored;

  // ── Data fetching ─────────────────────────────────────────────────────────
  const fetchProducts = useCallback(async () => {
    try {
      const res = await fetch("/api/products");
      if (!res.ok) return;
      const data = await res.json();
      setProducts(data.products ?? []);
    } catch { /* non-critical */ }
  }, []);

  const fetchRevisions = useCallback(async (url: string) => {
    try {
      const res = await fetch(`/api/data?url=${encodeURIComponent(url)}`);
      if (res.status === 404) { setRevisions([]); return; }
      if (!res.ok) return;
      setRevisions(await res.json());
    } catch { setRevisions([]); }
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  // When revisions load, default to the latest
  useEffect(() => {
    if (revisions.length > 0) {
      const latest = revisions[revisions.length - 1];
      setSelectedRevision(latest.revision);
      loadRevisionIntoForm(latest);
    } else {
      setSelectedRevision("new");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revisions]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  function loadRevisionIntoForm(rev: RevisionData) {
    setForm({
      testMethodology: rev.prompts.testMethodology,
      url: rev.url,
      productRequirements: rev.prompts.productRequirements,
      revisionNotes: rev.revisionNotes,
      judgePrompt: rev.prompts.judgePrompt,
    });
    setHistoricImagePaths(rev.images);
    setImages([]);
    setSubmitStatus("idle");
    setSubmitError(null);

    const hasGenerations = Object.keys(rev.generations).length > 0;
    if (!hasGenerations) {
      setPanels([]);
      setJudgeResults({});
      setCurrentRevisionId(null);
      setSavedHumanScores({});
      setPhase("idle");
      return;
    }

    // Hydrate panels from stored generations
    const loadedPanels: GeneratorPanel[] = Object.entries(rev.generations).map(([modelId, gen]) => {
      const fromSnapshot = rev.configSnapshot.generators.find((g) => g.id === modelId);
      const fromConfig = config.generators.find((g) => g.id === modelId);
      return {
        id: modelId,
        name: fromSnapshot?.name ?? fromConfig?.name ?? modelId,
        model: fromSnapshot?.model ?? fromConfig?.model ?? modelId,
        status: "success",
        output: gen.output,
        tokenUsage: gen.tokenUsage,
        latencyMs: gen.latencyMs,
        langfuseTraceId: gen.langfuseTraceId,
        humanScore: rev.scores.human[modelId] ?? undefined,
      };
    });
    setPanels(loadedPanels);

    // Hydrate judge results from stored scores
    const loadedJudgeResults: JudgeResultsMap = {};
    for (const [judgeId, genMap] of Object.entries(rev.scores.judges)) {
      loadedJudgeResults[judgeId] = {};
      const judgeSnap = rev.configSnapshot.judges.find((j) => j.id === judgeId);
      for (const [genId, judgeScore] of Object.entries(genMap)) {
        const genSnap = rev.configSnapshot.generators.find((g) => g.id === genId);
        const selfEvaluation = !!(
          judgeSnap && genSnap &&
          judgeSnap.provider === genSnap.provider &&
          judgeSnap.model === genSnap.model
        );
        loadedJudgeResults[judgeId][genId] = {
          status: "success",
          score: judgeScore.score,
          feedback: judgeScore.feedback,
          rawData: judgeScore.rawData,
          langfuseTraceId: judgeScore.langfuseTraceId,
          selfEvaluation,
        };
      }
    }
    setJudgeResults(loadedJudgeResults);

    // Track persisted human scores for "Update" mode detection
    const humanScores: Record<string, number | null> = {};
    for (const [modelId, score] of Object.entries(rev.scores.human)) {
      humanScores[modelId] = score;
    }
    setSavedHumanScores(humanScores);

    setCurrentRevisionId(rev.revision);
    setPhase("done");
  }

  async function handleProductSelect(url: string) {
    setSelectedUrl(url);
    setPhase("idle");
    setPanels([]);
    setJudgeResults({});
    setSubmitStatus("idle");
    setSubmitError(null);
    setSavedHumanScores({});
    setCurrentRevisionId(null);
    setImages([]);
    setHistoricImagePaths([]);
    if (!url) { setForm(EMPTY_FORM); setRevisions([]); setSelectedRevision("new"); return; }
    await fetchRevisions(url);
  }

  function handleRevisionSelect(value: string) {
    if (value === "new") {
      setSelectedRevision("new");
      setForm((prev) => ({ ...EMPTY_FORM, url: prev.url }));
      setImages([]);
      setHistoricImagePaths([]);
      setPanels([]);
      setJudgeResults({});
      setSavedHumanScores({});
      setCurrentRevisionId(null);
      setPhase("idle");
      setSubmitStatus("idle");
      setSubmitError(null);
      return;
    }
    const revNum = parseInt(value, 10);
    const rev = revisions.find((r) => r.revision === revNum);
    if (rev) { setSelectedRevision(revNum); loadRevisionIntoForm(rev); }
  }

  function setField(field: keyof FormState) {
    return (value: string) => setForm((prev) => ({ ...prev, [field]: value }));
  }

  function updateHumanScore(panelId: string, score: number) {
    setPanels((prev) =>
      prev.map((p) => (p.id === panelId ? { ...p, humanScore: score } : p))
    );
    // Allow re-submitting after a previous submit if the user changes a score
    if (submitStatus === "done") setSubmitStatus("idle");
  }

  // ── Image upload helper ───────────────────────────────────────────────────

  async function uploadAndPatchImages(
    url: string,
    revisionId: number,
    imgs: ImageFile[]
  ): Promise<void> {
    const formData = new FormData();
    formData.append("url", url);
    formData.append("revision", String(revisionId));

    for (const img of imgs) {
      const byteString = atob(img.base64);
      const byteArray = new Uint8Array(byteString.length);
      for (let i = 0; i < byteString.length; i++) {
        byteArray[i] = byteString.charCodeAt(i);
      }
      const blob = new Blob([byteArray], { type: img.mimeType });
      formData.append("images", blob, img.name);
    }

    const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
    if (!uploadRes.ok) return;
    const { paths } = await uploadRes.json();
    if (!Array.isArray(paths) || paths.length === 0) return;

    await fetch("/api/data", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, revision: revisionId, images: paths }),
    });
  }

  // ── Generate + judge flow ─────────────────────────────────────────────────

  async function handleGenerate() {
    setPhase("generating");
    setSubmitStatus("idle");
    setSubmitError(null);
    setSavedHumanScores({});
    setJudgeResults({});
    setCurrentRevisionId(null);

    // Reset all panels to loading
    setPanels(
      enabledGenerators.map((m) => ({
        id: m.id, name: m.name, model: m.model,
        status: "loading",
      }))
    );

    // Capture form and image values now so they stay consistent through the async flow
    const capturedForm = form;
    const capturedImages = images;

    // Fire one request per generator model in parallel
    type GenSuccess = {
      model: typeof enabledGenerators[0];
      result: {
        output: string;
        tokenUsage: { input: number; output: number };
        latencyMs: number;
        langfuseTraceId: string;
      };
    };

    const generatorPromises = enabledGenerators.map(async (model): Promise<GenSuccess | null> => {
      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: capturedForm.url,
            testMethodology: capturedForm.testMethodology,
            productRequirements: capturedForm.productRequirements,
            modelId: model.id,
            images: capturedImages.length > 0
              ? capturedImages.map(({ base64, mimeType }) => ({ base64, mimeType }))
              : undefined,
          }),
        });
        const data = await res.json();
        const result = res.ok ? data.results?.[model.id] : null;

        setPanels((prev) =>
          prev.map((p) =>
            p.id !== model.id ? p : result?.success
              ? {
                  ...p, status: "success",
                  output: result.output,
                  tokenUsage: result.tokenUsage,
                  latencyMs: result.latencyMs,
                  langfuseTraceId: result.langfuseTraceId,
                }
              : {
                  ...p, status: "error",
                  error: result?.error ?? data.error ?? "Request failed",
                }
          )
        );

        return result?.success ? { model, result } : null;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setPanels((prev) =>
          prev.map((p) => (p.id === model.id ? { ...p, status: "error", error: message } : p))
        );
        return null;
      }
    });

    const genOutcomes = await Promise.allSettled(generatorPromises);
    const successful = genOutcomes
      .filter((r): r is PromiseFulfilledResult<GenSuccess> =>
        r.status === "fulfilled" && r.value !== null
      )
      .map((r) => r.value);

    if (successful.length === 0) { setPhase("done"); return; }

    // ── Save Point 1: Persist generation results immediately ──────────────
    const generationsForSave: RevisionData["generations"] = {};
    for (const { model, result } of successful) {
      generationsForSave[model.id] = {
        output: result.output,
        tokenUsage: result.tokenUsage,
        latencyMs: result.latencyMs,
        langfuseTraceId: result.langfuseTraceId,
      };
    }

    // Initialize human scores to null for each successful generator
    const initialHumanScores: RevisionData["scores"]["human"] = {};
    for (const { model } of successful) {
      initialHumanScores[model.id] = null;
    }

    let savedRevisionId: number | null = null;
    try {
      const saveRes = await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: capturedForm.url,
          prompts: {
            testMethodology: capturedForm.testMethodology,
            productRequirements: capturedForm.productRequirements,
            judgePrompt: capturedForm.judgePrompt,
          },
          revisionNotes: capturedForm.revisionNotes,
          images: [],
          configSnapshot: {
            generators: enabledGenerators.map(({ id, name, model, provider }) => ({ id, name, model, provider })),
            judges: enabledJudges.map(({ id, name, model, provider }) => ({ id, name, model, provider })),
          },
          generations: generationsForSave,
          scores: { human: initialHumanScores, judges: {} },
        } satisfies Omit<RevisionData, "revision" | "timestamp">),
      });
      if (saveRes.ok) {
        const saveData = await saveRes.json();
        savedRevisionId = saveData.revision ?? null;
        setCurrentRevisionId(savedRevisionId);
        // Refresh so the product selector shows this URL
        setSelectedUrl(capturedForm.url);
        await Promise.allSettled([fetchRevisions(capturedForm.url), fetchProducts()]);

        // Upload images in background; PATCH paths into revision when done
        if (capturedImages.length > 0 && savedRevisionId !== null) {
          uploadAndPatchImages(capturedForm.url, savedRevisionId, capturedImages).catch(() => {});
        }
      }
    } catch { /* non-critical — judging proceeds regardless */ }

    // ── Kick off judging ───────────────────────────────────────────────────
    setPhase("judging");

    // Initialize all judge entries as loading
    setJudgeResults(() => {
      const init: JudgeResultsMap = {};
      for (const judge of enabledJudges) {
        init[judge.id] = {};
        for (const { model } of successful) {
          init[judge.id][model.id] = { status: "loading" };
        }
      }
      return init;
    });

    type JudgePatchEntry = {
      judgeId: string;
      generatorId: string;
      score: number;
      feedback: string;
      rawData?: Record<string, unknown>;
      langfuseTraceId: string;
    };

    // Fire all judge × generator combinations in parallel
    const judgePromises = enabledJudges.flatMap((judge) =>
      successful.map(async ({ model, result }): Promise<JudgePatchEntry | null> => {
        try {
          const res = await fetch("/api/judge", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              judgeId: judge.id,
              url: capturedForm.url,
              productRequirements: capturedForm.productRequirements,
              judgePrompt: capturedForm.judgePrompt,
              generations: { [model.id]: { modelName: model.name, output: result.output } },
              images: capturedImages.length > 0
                ? capturedImages.map(({ base64, mimeType }) => ({ base64, mimeType }))
                : undefined,
            }),
          });
          const data = await res.json();
          const jr = res.ok ? data.results?.[judge.id]?.[model.id] : null;

          setJudgeResults((prev) => ({
            ...prev,
            [judge.id]: {
              ...prev[judge.id],
              [model.id]: jr
                ? {
                    status: jr.success ? "success" : "error",
                    score: jr.score,
                    feedback: jr.feedback,
                    rawData: jr.rawData,
                    selfEvaluation: jr.selfEvaluation,
                    langfuseTraceId: jr.langfuseTraceId,
                    error: jr.error,
                  }
                : { status: "error", error: data.error ?? "Request failed" },
            },
          }));

          if (jr?.success && jr.score !== undefined && jr.langfuseTraceId) {
            return {
              judgeId: judge.id,
              generatorId: model.id,
              score: jr.score,
              feedback: jr.feedback ?? "",
              rawData: jr.rawData,
              langfuseTraceId: jr.langfuseTraceId,
            };
          }
          return null;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          setJudgeResults((prev) => ({
            ...prev,
            [judge.id]: {
              ...prev[judge.id],
              [model.id]: { status: "error", error: message },
            },
          }));
          return null;
        }
      })
    );

    const judgeOutcomes = await Promise.allSettled(judgePromises);

    // ── Save Point 2: Patch judge scores ──────────────────────────────────
    if (savedRevisionId !== null) {
      const judgesScoresPatch: RevisionData["scores"]["judges"] = {};
      for (const outcome of judgeOutcomes) {
        if (outcome.status === "fulfilled" && outcome.value !== null) {
          const { judgeId, generatorId, score, feedback, rawData, langfuseTraceId } = outcome.value;
          if (!judgesScoresPatch[judgeId]) judgesScoresPatch[judgeId] = {};
          judgesScoresPatch[judgeId][generatorId] = { score, feedback, langfuseTraceId, rawData };
        }
      }
      if (Object.keys(judgesScoresPatch).length > 0) {
        fetch("/api/data", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: capturedForm.url,
            revision: savedRevisionId,
            scores: { judges: judgesScoresPatch },
          }),
        }).catch(() => {}); // fire-and-forget, non-critical
      }
    }

    setPhase("done");
  }

  // ── Submit human scores to Langfuse + save to disk ────────────────────────

  async function handleSubmitScores() {
    setSubmitStatus("submitting");
    setSubmitError(null);

    // Build Langfuse scores payload (only successful panels with traceIds)
    const langfuseScores: Record<string, { score: number; langfuseTraceId: string }> = {};
    for (const panel of successfulPanels) {
      if (panel.humanScore !== undefined && panel.langfuseTraceId) {
        langfuseScores[panel.id] = { score: panel.humanScore, langfuseTraceId: panel.langfuseTraceId };
      }
    }

    let langfuseOk = true;
    try {
      const res = await fetch("/api/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scores: langfuseScores }),
      });
      if (!res.ok) langfuseOk = false;
    } catch {
      langfuseOk = false;
    }

    // Build human scores map
    const humanScores: RevisionData["scores"]["human"] = {};
    for (const panel of successfulPanels) {
      humanScores[panel.id] = panel.humanScore ?? null;
    }

    try {
      if (currentRevisionId !== null) {
        // ── Save Point 3: PATCH with human scores only ──────────────────
        await fetch("/api/data", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: form.url,
            revision: currentRevisionId,
            scores: { human: humanScores },
          }),
        });
      } else {
        // ── Fallback: full POST (e.g. loading a past revision) ──────────
        const generations: RevisionData["generations"] = {};
        for (const panel of successfulPanels) {
          if (panel.output && panel.tokenUsage && panel.latencyMs && panel.langfuseTraceId) {
            generations[panel.id] = {
              output: panel.output,
              tokenUsage: panel.tokenUsage,
              latencyMs: panel.latencyMs,
              langfuseTraceId: panel.langfuseTraceId,
            };
          }
        }

        const judgesScores: RevisionData["scores"]["judges"] = {};
        for (const [judgeId, genMap] of Object.entries(judgeResults)) {
          for (const [genId, entry] of Object.entries(genMap)) {
            if (entry.status === "success" && entry.score !== undefined && entry.feedback && entry.langfuseTraceId) {
              if (!judgesScores[judgeId]) judgesScores[judgeId] = {};
              judgesScores[judgeId][genId] = {
                score: entry.score,
                feedback: entry.feedback,
                langfuseTraceId: entry.langfuseTraceId,
                rawData: entry.rawData,
              };
            }
          }
        }

        await fetch("/api/data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: form.url,
            prompts: {
              testMethodology: form.testMethodology,
              productRequirements: form.productRequirements,
              judgePrompt: form.judgePrompt,
            },
            revisionNotes: form.revisionNotes,
            images: [],
            configSnapshot: {
              generators: enabledGenerators.map(({ id, name, model, provider }) => ({ id, name, model, provider })),
              judges: enabledJudges.map(({ id, name, model, provider }) => ({ id, name, model, provider })),
            },
            generations,
            scores: { human: humanScores, judges: judgesScores },
          } satisfies Omit<RevisionData, "revision" | "timestamp">),
        });
      }

      // Refresh products + revisions so trends update
      setSelectedUrl(form.url);
      await Promise.allSettled([fetchRevisions(form.url), fetchProducts()]);
    } catch { /* disk save failed — still show result */ }

    if (langfuseOk) {
      // Update the saved baseline so "anyScoreChanged" resets correctly
      setSavedHumanScores(humanScores);
      setSubmitStatus("done");
    } else {
      setSubmitStatus("error");
      setSubmitError("Scores saved locally but could not be sent to Langfuse.");
    }
  }

  // ── Run judges ────────────────────────────────────────────────────────────

  async function handleRunJudges() {
    setPhase("judging");
    setSubmitStatus("idle");
    setSubmitError(null);

    // Determine which judges to run: enabled judges that don't have scores (or all if overwrite)
    const judgesToRun = enabledJudges.filter((judge) => {
      if (overwriteExisting) return true;
      // Check if any generator panel is missing this judge's score
      return successfulPanels.some((panel) => !judgeResults[judge.id]?.[panel.id] || judgeResults[judge.id][panel.id].status !== "success");
    });

    if (judgesToRun.length === 0) return;

    // Set loading state for judges being run
    setJudgeResults((prev) => {
      const newResults = { ...prev };
      for (const judge of judgesToRun) {
        if (!newResults[judge.id]) newResults[judge.id] = {};
        for (const panel of successfulPanels) {
          if (overwriteExisting || !newResults[judge.id][panel.id] || newResults[judge.id][panel.id].status !== "success") {
            newResults[judge.id][panel.id] = { status: "loading" };
          }
        }
      }
      return newResults;
    });

    // Capture form values
    const capturedForm = form;
    const capturedImages = images;

    // Run judges in parallel for each generator
    const judgePromises = judgesToRun.flatMap((judge) =>
      successfulPanels
        .filter((panel) => overwriteExisting || !judgeResults[judge.id]?.[panel.id] || judgeResults[judge.id][panel.id].status !== "success")
        .map(async (panel): Promise<{ judgeId: string; generatorId: string; result: any }> => {
          try {
            const res = await fetch("/api/judge", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                url: capturedForm.url,
                productRequirements: capturedForm.productRequirements,
                judgePrompt: capturedForm.judgePrompt,
                judgeId: judge.id,
                generations: { [panel.id]: { modelName: panel.name, output: panel.output ?? "" } },
                images: capturedImages.length > 0
                  ? capturedImages.map(({ base64, mimeType }) => ({ base64, mimeType }))
                  : undefined,
              }),
            });
            const data = await res.json();
            const result = res.ok ? data.results?.[judge.id]?.[panel.id] : null;

            setJudgeResults((prev) => ({
              ...prev,
              [judge.id]: {
                ...prev[judge.id],
                [panel.id]: result?.success
                  ? {
                      status: "success",
                      score: result.score,
                      feedback: result.feedback,
                      rawData: result.rawData,
                      selfEvaluation: result.selfEvaluation,
                      langfuseTraceId: result.langfuseTraceId,
                    }
                  : { status: "error", error: result?.error ?? data.error ?? "Request failed" },
              },
            }));

            return { judgeId: judge.id, generatorId: panel.id, result };
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setJudgeResults((prev) => ({
              ...prev,
              [judge.id]: {
                ...prev[judge.id],
                [panel.id]: { status: "error", error: message },
              },
            }));
            return { judgeId: judge.id, generatorId: panel.id, result: null };
          }
        })
    );

    const judgeOutcomes = await Promise.allSettled(judgePromises);

    // Save results if we have a revision
    if (currentRevisionId !== null) {
      const judgesScoresPatch: RevisionData["scores"]["judges"] = {};
      for (const outcome of judgeOutcomes) {
        if (outcome.status === "fulfilled" && outcome.value.result?.success) {
          const { judgeId, generatorId, result } = outcome.value;
          if (!judgesScoresPatch[judgeId]) judgesScoresPatch[judgeId] = {};
          judgesScoresPatch[judgeId][generatorId] = {
            score: result.score,
            feedback: result.feedback,
            langfuseTraceId: result.langfuseTraceId,
            rawData: result.rawData,
          };
        }
      }
      if (Object.keys(judgesScoresPatch).length > 0) {
        fetch("/api/data", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: capturedForm.url,
            revision: currentRevisionId,
            scores: { judges: judgesScoresPatch },
          }),
        }).catch(() => {}); // fire-and-forget
      }
    }

    setPhase("done");
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const isRunning = phase === "generating" || phase === "judging";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-screen-xl px-4 py-10 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Test Case Evaluation Tool</h1>
          <p className="mt-1 text-sm text-gray-500">
            Generate and evaluate test cases across multiple AI models.
          </p>
        </div>

        {/* ── Section 1: Product & Revision Selectors ── */}
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Product &amp; Revision
          </h2>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label htmlFor="product-select">Product</Label>
              <select
                id="product-select"
                value={selectedUrl}
                onChange={(e) => handleProductSelect(e.target.value)}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">New product</option>
                {products.map((p) => (
                  <option key={p.slug} value={p.url}>
                    {p.url} ({p.revisionCount} revision{p.revisionCount !== 1 ? "s" : ""})
                  </option>
                ))}
              </select>
            </div>
            <div className="w-full sm:w-56">
              <Label htmlFor="revision-select">Revision</Label>
              <select
                id="revision-select"
                value={selectedRevision === "new" ? "new" : String(selectedRevision)}
                onChange={(e) => handleRevisionSelect(e.target.value)}
                disabled={!selectedUrl}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
              >
                {selectedUrl && revisions.length > 0 ? (
                  revisions.map((r) => (
                    <option key={r.revision} value={String(r.revision)}>
                      Revision {r.revision}
                      {r.revisionNotes ? ` — ${r.revisionNotes.slice(0, 40)}` : ""}
                    </option>
                  ))
                ) : (
                  <option value="new">New</option>
                )}
              </select>
            </div>
          </div>
          <p className="mt-3 text-xs text-gray-400">
            {currentRevisionId !== null
              ? <>Current session: <span className="font-medium text-gray-600">Revision {currentRevisionId}</span></>
              : <>Next generation will create: <span className="font-medium text-gray-600">Revision {nextRevisionNumber}</span></>
            }
          </p>
        </div>

        {/* ── Section 2: Input Fields ── */}
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-5 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Inputs
          </h2>
          <div className="space-y-6">
            <div>
              <Label htmlFor="testMethodology">Test methodology &amp; direction</Label>
              <Textarea
                id="testMethodology" rows={7} value={form.testMethodology}
                onChange={setField("testMethodology")} disabled={isRunning}
                placeholder="Instructions about test case quality, methodologies (equivalence classes, boundary conditions, pairwise testing), output format, etc."
              />
              <p className="mt-1 text-xs text-gray-400">System prompt sent to generator models.</p>
            </div>
            <div>
              <Label htmlFor="url">Application under test (URL)</Label>
              <input
                id="url" type="text" value={form.url} disabled={isRunning}
                onChange={(e) => setField("url")(e.target.value)}
                placeholder="http://localhost:3000"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
              />
              <p className="mt-1 text-xs text-gray-400">Metadata only — models do not browse this URL.</p>
            </div>
            <div>
              <Label htmlFor="images">Screenshots of application (optional)</Label>
              <ImageUpload
                images={images}
                onChange={setImages}
                historicPaths={historicImagePaths.length > 0 ? historicImagePaths : undefined}
                disabled={isRunning}
              />
              <p className="mt-1 text-xs text-gray-400">
                Included as visual context in every generator and judge call.
              </p>
            </div>
            <div>
              <Label htmlFor="productRequirements">Product requirements</Label>
              <Textarea
                id="productRequirements" rows={8} value={form.productRequirements}
                onChange={setField("productRequirements")} disabled={isRunning}
                placeholder="Paste your business requirements, acceptance criteria, feature descriptions..."
              />
              <p className="mt-1 text-xs text-gray-400">Combined with the URL to form the user message.</p>
            </div>
            <div>
              <Label htmlFor="revisionNotes">Revision notes</Label>
              <Textarea
                id="revisionNotes" rows={2} value={form.revisionNotes}
                onChange={setField("revisionNotes")} disabled={isRunning}
                placeholder="What changed in this version? e.g., 'Added boundary condition guidance to methodology prompt'"
              />
              <p className="mt-1 text-xs text-gray-400">Stored with this revision. Not sent to any model.</p>
            </div>
            <div>
              <Label htmlFor="judgePrompt">LLM-as-judge prompt</Label>
              <Textarea
                id="judgePrompt" rows={4} value={form.judgePrompt}
                onChange={setField("judgePrompt")} disabled={isRunning}
                placeholder="Instructions for judging test case quality. The judge will receive the requirements, the generated test cases, and this prompt."
              />
              <p className="mt-1 text-xs text-gray-400">System prompt sent to judge models.</p>
            </div>
          </div>

          {/* Generate button */}
          <div className="mt-8 border-t border-gray-100 pt-6 flex items-center gap-4">
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isRunning && (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              )}
              {phase === "generating" ? "Generating…" : phase === "judging" ? "Judging…" : "Generate test cases"}
            </button>
            {isRunning && (
              <span className="text-sm text-gray-500">
                {phase === "generating"
                  ? `Running ${enabledGenerators.length} generator models in parallel…`
                  : `Running ${enabledJudges.length} judge models…`}
              </span>
            )}
            {!canGenerate && !isRunning && (
              <span className="text-xs text-gray-400">Enter a URL and at least one prompt field.</span>
            )}
          </div>
        </div>

        {/* ── Section 3: Model Outputs ── */}
        {panels.length > 0 && (
          <div className="mb-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Model Outputs
              </h2>
              {successfulPanels.length > 0 && (
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={overwriteExisting}
                      onChange={(e) => setOverwriteExisting(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    Overwrite existing
                  </label>
                  <button
                    onClick={handleRunJudges}
                    disabled={phase === "judging" || enabledJudges.length === 0}
                    className="inline-flex items-center gap-2 rounded-md bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {phase === "judging" && (
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    )}
                    Run Judges
                  </button>
                </div>
              )}
            </div>

            {/* Full-width grid of panels */}
            <div
              className="grid gap-4 w-full"
              style={{ gridTemplateColumns: `repeat(${panels.length}, minmax(0, 1fr))` }}
            >
              {panels.map((panel) => (
                <ModelOutputPanel
                  key={panel.id}
                  panel={panel}
                  judgeModels={config.judges}
                  judgeResults={
                    Object.fromEntries(
                      config.judges.map((j) => [j.id, judgeResults[j.id]?.[panel.id] ?? { status: "idle" }])
                    ) as Record<string, JudgePanelEntry>
                  }
                  onScoreChange={(score) => updateHumanScore(panel.id, score)}
                />
              ))}
            </div>

            {/* Submit scores */}
            {phase === "done" && successfulPanels.length > 0 && (
              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
                <button
                  onClick={handleSubmitScores}
                  disabled={!canSubmit || submitStatus === "submitting" || submitStatus === "done"}
                  className="inline-flex items-center gap-2 rounded-md bg-green-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {submitStatus === "submitting" && (
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  )}
                  {submitStatus === "done"
                    ? "Scores submitted ✓"
                    : submitStatus === "submitting"
                    ? "Submitting…"
                    : scoresWereSubmitted
                    ? "Update scores in Langfuse"
                    : "Submit scores to Langfuse"}
                </button>

                {scoresWereSubmitted && submitStatus === "idle" && (
                  <p className="text-xs text-gray-500">
                    ✓ Previously submitted
                    {!anyScoreChanged && " — change a score to update"}
                  </p>
                )}
                {!scoresWereSubmitted && !allScored && submitStatus === "idle" && (
                  <p className="text-xs text-gray-400">
                    Score all {successfulPanels.length} model output{successfulPanels.length !== 1 ? "s" : ""} to enable.
                  </p>
                )}
                {submitStatus === "error" && submitError && (
                  <p className="text-sm text-amber-600">{submitError}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Section 4: Scoring Trends ── */}
        <ScoringTrends
          revisions={revisions}
          generatorModels={enabledGenerators}
          judgeModels={enabledJudges}
        />

      </div>
    </div>
  );
}
