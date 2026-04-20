jest.mock('dotenv', () => ({ config: jest.fn() }));

jest.mock('../../scripts/run-experiment', () => ({
  runExperiment: jest.fn(),
  runJudgeOnly: jest.fn(),
  printSummary: jest.fn(),
  resolvePrompt: jest.fn((v: string) => v),
}));

jest.mock('../../src/lib/llm', () => ({
  initTracing: jest.fn(),
  flushTracing: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/lib/config', () => ({
  __esModule: true,
  default: {
    generators: [
      { id: 'claude', name: 'Claude Sonnet', provider: 'anthropic', model: 'claude-sonnet', enabled: false },
      { id: 'gpt', name: 'GPT-4', provider: 'openai', model: 'gpt-4', enabled: true },
      { id: 'gemini', name: 'Gemini Pro', provider: 'google', model: 'gemini-pro', enabled: true },
      { id: 'llama', name: 'Llama 70B', provider: 'openrouter', model: 'meta-llama/llama-70b', enabled: true },
    ],
    judges: [
      { id: 'claude-judge', name: 'Claude Judge', provider: 'anthropic', model: 'claude-sonnet', enabled: false },
      { id: 'gpt-judge', name: 'GPT-4 Judge', provider: 'openai', model: 'gpt-4', enabled: true },
    ],
    langfuse: {},
  },
}));

import { runResearch, avgJudgeScore, printDryRunResearch, printComparisonTable } from '../../scripts/run-research';
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

// ── printDryRunResearch ────────────────────────────────────────────────────────

describe('printDryRunResearch', () => {
  let logs: string[];

  beforeEach(() => {
    logs = [];
    jest.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const original: ResearchProtocol = {
    url: 'http://test.com',
    productRequirements: 'file:research/prompts/requirements.md',
    judgePrompt: 'inline judge instructions',
    variations: [
      { name: 'M1-baseline', testMethodology: 'file:research/prompts/method-v1.md' },
      { name: 'M2-gherkin',  testMethodology: 'Write Gherkin scenarios.' },
    ],
  };

  const resolved: ResearchProtocol = {
    ...original,
    productRequirements: 'a'.repeat(500),
    variations: [
      { name: 'M1-baseline', testMethodology: 'b'.repeat(300) },
      { name: 'M2-gherkin',  testMethodology: 'Write Gherkin scenarios.' },
    ],
  };

  test('prints dry-run header', () => {
    printDryRunResearch(original, resolved);
    expect(logs).toEqual(expect.arrayContaining([
      expect.stringContaining('DRY RUN — no API calls will be made'),
    ]));
  });

  test('prints URL', () => {
    printDryRunResearch(original, resolved);
    expect(logs.some((l) => l.includes('http://test.com'))).toBe(true);
  });

  test('prints file: fields as "loaded from <path> (N chars)"', () => {
    printDryRunResearch(original, resolved);
    expect(logs.some((l) => l.includes('loaded from research/prompts/requirements.md (500 chars)'))).toBe(true);
    expect(logs.some((l) => l.includes('loaded from research/prompts/method-v1.md (300 chars)'))).toBe(true);
  });

  test('prints inline fields as "inline (N chars)"', () => {
    printDryRunResearch(original, resolved);
    const judgeLen = original.judgePrompt.length;
    expect(logs.some((l) => l.includes(`inline (${judgeLen} chars)`))).toBe(true);
  });

  test('prints each variation name', () => {
    printDryRunResearch(original, resolved);
    expect(logs.some((l) => l.includes('M1-baseline'))).toBe(true);
    expect(logs.some((l) => l.includes('M2-gherkin'))).toBe(true);
  });

  test('prints methodology preview truncated at 200 chars with ellipsis', () => {
    printDryRunResearch(original, resolved);
    const previewLine = logs.find((l) => l.includes('Preview:') && l.includes('M1') === false && l.includes('b'));
    expect(previewLine).toBeDefined();
    // resolved.variations[0].testMethodology is 300 b's — preview should be 200 + ellipsis
    expect(previewLine).toContain('b'.repeat(200));
    expect(previewLine).toContain('…');
  });

  test('prints methodology preview without ellipsis when under 200 chars', () => {
    printDryRunResearch(original, resolved);
    const previewLine = logs.find((l) => l.includes('Write Gherkin scenarios.'));
    expect(previewLine).toBeDefined();
    expect(previewLine).not.toContain('…');
  });

  test('prints generator model names (only enabled ones)', () => {
    printDryRunResearch(original, resolved);
    expect(logs.some((l) => l.includes('GPT-4'))).toBe(true);
    expect(logs.some((l) => l.includes('Gemini Pro'))).toBe(true);
    expect(logs.some((l) => l.includes('Llama 70B'))).toBe(true);
    // Claude is disabled, should not appear
    expect(logs.some((l) => l.includes('Claude Sonnet'))).toBe(false);
  });

  test('prints judge model names (only enabled ones)', () => {
    printDryRunResearch(original, resolved);
    expect(logs.some((l) => l.includes('GPT-4 Judge'))).toBe(true);
    // Claude Judge is disabled, should not appear
    expect(logs.some((l) => l.includes('Claude Judge'))).toBe(false);
  });

  test('prints count of enabled generators vs total', () => {
    printDryRunResearch(original, resolved);
    expect(logs.some((l) => l.includes('Generator Models (3 enabled of 4 total)'))).toBe(true);
  });

  test('prints count of enabled judges vs total', () => {
    printDryRunResearch(original, resolved);
    expect(logs.some((l) => l.includes('Judge Models (1 enabled of 2 total)'))).toBe(true);
  });

  test('prints correct summary counts: 2 variations × 3 enabled models = 6 generator runs', () => {
    printDryRunResearch(original, resolved);
    expect(logs.some((l) => l.includes('2 variations') && l.includes('3 models') && l.includes('6'))).toBe(true);
  });

  test('prints correct judge evaluations: 6 outputs × 1 judge = 6', () => {
    printDryRunResearch(original, resolved);
    expect(logs.some((l) => l.includes('6 generator outputs') && l.includes('1 judge') && l.includes('6'))).toBe(true);
  });

  test('prints correct total API calls (6 gen + 6 judge = 12)', () => {
    printDryRunResearch(original, resolved);
    expect(logs.some((l) => l.includes('Total API calls') && l.includes('12'))).toBe(true);
  });

  test('filters disabled generators from output', () => {
    printDryRunResearch(original, resolved);
    const generatorSection = logs.join('\n');
    // Should only include enabled generators
    expect(generatorSection).toMatch(/GPT-4.*Gemini Pro.*Llama 70B/s);
    // Should not include disabled Claude
    const disabledGeneratorIndex = generatorSection.indexOf('Claude Sonnet');
    const generatorHeaderIndex = generatorSection.indexOf('Generator Models');
    expect(disabledGeneratorIndex === -1 || disabledGeneratorIndex < generatorHeaderIndex).toBe(true);
  });

  test('filters disabled judges from output', () => {
    printDryRunResearch(original, resolved);
    const judgeSection = logs.join('\n');
    // Should only include enabled judges
    expect(judgeSection).toContain('GPT-4 Judge');
    // Claude Judge should not appear in judges section
    const judgeHeaderIndex = judgeSection.indexOf('Judge Models');
    expect(judgeSection.substring(judgeHeaderIndex)).not.toContain('Claude Judge');
  });

  test('excludes disabled models from generator count calculation', () => {
    printDryRunResearch(original, resolved);
    // With 3 enabled generators and 2 variations, should be 6 runs (not 8)
    expect(logs.some((l) => l.includes('Generator runs') && l.includes('6'))).toBe(true);
  });

  test('excludes disabled judges from judge count calculation', () => {
    printDryRunResearch(original, resolved);
    // With 1 enabled judge and 6 generator outputs, should be 6 evaluations (not 12)
    expect(logs.some((l) => l.includes('Judge evaluations') && l.includes('6'))).toBe(true);
  });
});

// ── printComparisonTable ───────────────────────────────────────────────────────

describe('printComparisonTable', () => {
  let logs: string[];

  beforeEach(() => {
    logs = [];
    jest.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('only includes enabled generators as columns', () => {
    const summaries = [
      {
        name: 'M1-baseline',
        result: {
          judgeScores: {
            'gpt-judge': {
              gpt: { success: true, score: 4 },
              gemini: { success: true, score: 3 },
              llama: { success: true, score: 3 },
              claude: { success: true, score: 2 }, // disabled generator
            },
          },
        },
      },
    ];
    printComparisonTable(summaries);
    const output = logs.join('\n');
    // Should contain enabled generators as columns
    expect(output).toMatch(/GPT-4/);
    expect(output).toMatch(/Gemini/);
    expect(output).toMatch(/Llama/);
    // Should not contain disabled Claude as a column
    expect(output).not.toMatch(/Claude Sonnet/);
  });

  test('best-per-generator only shows enabled generators', () => {
    const summaries = [
      {
        name: 'M1-baseline',
        result: {
          judgeScores: {
            'gpt-judge': {
              gpt: { success: true, score: 4 },
              gemini: { success: true, score: 3 },
              llama: { success: true, score: 2 },
              claude: { success: true, score: 5 }, // disabled, highest but shouldn't appear
            },
          },
        },
      },
      {
        name: 'M2-gherkin',
        result: {
          judgeScores: {
            'gpt-judge': {
              gpt: { success: true, score: 3 },
              gemini: { success: true, score: 4 },
              llama: { success: true, score: 3 },
              claude: { success: true, score: 1 },
            },
          },
        },
      },
    ];
    printComparisonTable(summaries);
    const output = logs.join('\n');
    // Should show best variation for enabled generators
    expect(output).toMatch(/Best variation per generator:/);
    expect(output).toContain('GPT-4');
    expect(output).toContain('Gemini');
    expect(output).toContain('Llama');
    // Should not mention Claude
    expect(output).not.toMatch(/Claude Sonnet.*avg/);
  });
});
