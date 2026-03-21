jest.mock('dotenv', () => ({ config: jest.fn() }));

jest.mock('../../scripts/run-experiment', () => ({
  runExperiment: jest.fn(),
  printSummary: jest.fn(),
}));

jest.mock('../../src/lib/llm', () => ({
  initTracing: jest.fn(),
  flushTracing: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/lib/config', () => ({
  __esModule: true,
  default: {
    generators: [
      { id: 'claude', name: 'Claude Sonnet', provider: 'anthropic', model: 'claude-sonnet' },
      { id: 'gpt', name: 'GPT-4', provider: 'openai', model: 'gpt-4' },
    ],
    judges: [],
    langfuse: {},
  },
}));

import { runResearch, avgJudgeScore } from '../../scripts/run-research';
import type { ResearchProtocol } from '../../scripts/run-research';
import type { ExperimentResult } from '../../scripts/run-experiment';
import { runExperiment } from '../../scripts/run-experiment';

const mockRunExperiment = runExperiment as jest.Mock;

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeResult(judgeScores: ExperimentResult['judgeScores'] = {}): ExperimentResult {
  return { revisionNumber: 1, slug: 'test-com', url: 'http://test.com', generations: {}, judgeScores };
}

const baseProtocol: ResearchProtocol = {
  url: 'http://test.com',
  productRequirements: 'A simple app.',
  judgePrompt: 'Score carefully.',
  revisionNotes: 'Research run',
  variations: [
    { name: 'Baseline', testMethodology: 'Write plain test cases.' },
    { name: 'Gherkin',  testMethodology: 'Write Gherkin scenarios.' },
  ],
};

/** Run a protocol with fake timers, advancing through all timers + microtasks. */
async function runWithFakeTimers(protocol: ResearchProtocol) {
  jest.useFakeTimers();
  try {
    const promise = runResearch(protocol);
    await jest.runAllTimersAsync();
    return await promise;
  } finally {
    jest.useRealTimers();
  }
}

beforeEach(() => {
  mockRunExperiment.mockResolvedValue(makeResult());
});

// ── avgJudgeScore ──────────────────────────────────────────────────────────────

describe('avgJudgeScore', () => {
  test('returns null when judgeScores is empty', () => {
    expect(avgJudgeScore({}, 'claude')).toBeNull();
  });

  test('returns null when no judge scored the target generator', () => {
    const scores = { 'claude-judge': { gpt: { success: true, score: 4 } } };
    expect(avgJudgeScore(scores, 'claude')).toBeNull();
  });

  test('returns the single score when only one judge scored', () => {
    const scores = { 'claude-judge': { claude: { success: true, score: 3 } } };
    expect(avgJudgeScore(scores, 'claude')).toBe(3);
  });

  test('averages correctly across multiple judges', () => {
    const scores = {
      'claude-judge': { claude: { success: true, score: 4 } },
      'gpt-judge':   { claude: { success: true, score: 2 } },
    };
    expect(avgJudgeScore(scores, 'claude')).toBe(3);
  });

  test('ignores entries where score is undefined (parse failed)', () => {
    const scores = {
      'claude-judge': { claude: { success: true, score: 4 } },
      'gpt-judge':   { claude: { success: true, score: undefined } },
    };
    expect(avgJudgeScore(scores, 'claude')).toBe(4);
  });

  test('ignores failed judge entries', () => {
    const scores = {
      'claude-judge': { claude: { success: true,  score: 5 } },
      'gpt-judge':   { claude: { success: false, score: undefined } },
    };
    expect(avgJudgeScore(scores, 'claude')).toBe(5);
  });

  test('returns null when all entries are failures', () => {
    const scores = {
      'claude-judge': { claude: { success: false } },
      'gpt-judge':   { claude: { success: false } },
    };
    expect(avgJudgeScore(scores, 'claude')).toBeNull();
  });
});

// ── runResearch orchestration ──────────────────────────────────────────────────

describe('runResearch', () => {
  test('calls runExperiment once per variation', async () => {
    await runWithFakeTimers(baseProtocol);
    expect(mockRunExperiment).toHaveBeenCalledTimes(2);
  });

  test('each variation receives the protocol-level shared fields', async () => {
    await runWithFakeTimers(baseProtocol);
    for (const call of mockRunExperiment.mock.calls) {
      expect(call[0].url).toBe(baseProtocol.url);
      expect(call[0].productRequirements).toBe(baseProtocol.productRequirements);
      expect(call[0].judgePrompt).toBe(baseProtocol.judgePrompt);
    }
  });

  test('each variation receives its own testMethodology', async () => {
    await runWithFakeTimers(baseProtocol);
    expect(mockRunExperiment.mock.calls[0][0].testMethodology).toBe('Write plain test cases.');
    expect(mockRunExperiment.mock.calls[1][0].testMethodology).toBe('Write Gherkin scenarios.');
  });

  test('revisionNotes defaults to "<protocol.revisionNotes> — <variation.name>"', async () => {
    await runWithFakeTimers(baseProtocol);
    expect(mockRunExperiment.mock.calls[0][0].revisionNotes).toBe('Research run — Baseline');
    expect(mockRunExperiment.mock.calls[1][0].revisionNotes).toBe('Research run — Gherkin');
  });

  test('revisionNotes is just "<variation.name>" when protocol has no revisionNotes', async () => {
    const protocol: ResearchProtocol = { ...baseProtocol, revisionNotes: undefined };
    await runWithFakeTimers(protocol);
    expect(mockRunExperiment.mock.calls[0][0].revisionNotes).toBe('Baseline');
    expect(mockRunExperiment.mock.calls[1][0].revisionNotes).toBe('Gherkin');
  });

  test('variation.revisionNotes overrides the default', async () => {
    const protocol: ResearchProtocol = {
      ...baseProtocol,
      variations: [
        { name: 'Baseline', testMethodology: 'Plain.', revisionNotes: 'Custom note' },
        { name: 'Gherkin',  testMethodology: 'Gherkin.' },
      ],
    };
    await runWithFakeTimers(protocol);
    expect(mockRunExperiment.mock.calls[0][0].revisionNotes).toBe('Custom note');
    expect(mockRunExperiment.mock.calls[1][0].revisionNotes).toBe('Research run — Gherkin');
  });

  test('imagePaths from protocol passed to each variation config', async () => {
    const protocol: ResearchProtocol = { ...baseProtocol, imagePaths: ['screen.png'] };
    await runWithFakeTimers(protocol);
    for (const call of mockRunExperiment.mock.calls) {
      expect(call[0].imagePaths).toEqual(['screen.png']);
    }
  });

  test('returns a VariationSummary for each successful variation', async () => {
    const summaries = await runWithFakeTimers(baseProtocol);
    expect(summaries).toHaveLength(2);
    expect(summaries[0].name).toBe('Baseline');
    expect(summaries[1].name).toBe('Gherkin');
  });

  test('failed variation is skipped but remaining variations still run', async () => {
    mockRunExperiment
      .mockRejectedValueOnce(new Error('Variation 1 crashed'))
      .mockResolvedValueOnce(makeResult());

    const summaries = await runWithFakeTimers(baseProtocol);

    expect(mockRunExperiment).toHaveBeenCalledTimes(2);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].name).toBe('Gherkin');
  });

  test('waits 5 seconds between variations (not after the last)', async () => {
    jest.useFakeTimers();
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

    const promise = runResearch(baseProtocol);
    await jest.runAllTimersAsync();
    await promise;

    jest.useRealTimers();

    const timerDelays = setTimeoutSpy.mock.calls
      .filter((call) => typeof call[1] === 'number')
      .map((call) => call[1]);
    expect(timerDelays).toContain(5000);
    // Only one inter-variation gap for two variations
    expect(timerDelays.filter((d) => d === 5000)).toHaveLength(1);
  });

  test('no delay after the last variation (single-variation protocol)', async () => {
    jest.useFakeTimers();
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

    const protocol: ResearchProtocol = {
      ...baseProtocol,
      variations: [{ name: 'Only', testMethodology: 'Just one.' }],
    };
    const promise = runResearch(protocol);
    await jest.runAllTimersAsync();
    await promise;

    jest.useRealTimers();

    const timerDelays = setTimeoutSpy.mock.calls
      .filter((call) => typeof call[1] === 'number')
      .map((call) => call[1]);
    expect(timerDelays).not.toContain(5000);
  });
});
