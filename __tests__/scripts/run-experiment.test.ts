// Prevent dotenv from touching real env files during tests
jest.mock('dotenv', () => ({ config: jest.fn() }));

// Mock fs/promises for image-loading tests; default to no-op
jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
}));

// Mock sync fs for resolvePrompt tests
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));

jest.mock('../../src/lib/config', () => ({
  __esModule: true,
  default: {
    generators: [
      {
        id: 'claude',
        name: 'Claude Sonnet',
        provider: 'anthropic',
        model: 'claude-sonnet',
        apiKeyEnvVar: 'ANTHROPIC_API_KEY',
        maxTokens: 4096,
        temperature: 0.3,
      },
      {
        id: 'gpt',
        name: 'GPT-4',
        provider: 'openai',
        model: 'gpt-4',
        apiKeyEnvVar: 'OPENAI_API_KEY',
        maxTokens: 4096,
        temperature: 0.3,
      },
    ],
    judges: [
      {
        // Same provider+model as the claude generator → self-evaluation
        id: 'claude-judge',
        name: 'Claude Judge',
        provider: 'anthropic',
        model: 'claude-sonnet',
        apiKeyEnvVar: 'ANTHROPIC_API_KEY',
        maxTokens: 8192,
        temperature: 0.2,
      },
      {
        // Different model from gpt generator (gpt-4 vs gpt-4-judge) → not self-eval
        id: 'gpt-judge',
        name: 'GPT Judge',
        provider: 'openai',
        model: 'gpt-4-judge',
        apiKeyEnvVar: 'OPENAI_API_KEY',
        maxTokens: 8192,
        temperature: 0.2,
      },
    ],
    langfuse: {
      publicKeyEnvVar: 'LANGFUSE_PUBLIC_KEY',
      secretKeyEnvVar: 'LANGFUSE_SECRET_KEY',
      baseUrl: 'https://us.cloud.langfuse.com',
    },
  },
}));

jest.mock('../../src/lib/llm', () => ({
  callLLM: jest.fn(),
  initTracing: jest.fn(),
  flushTracing: jest.fn().mockResolvedValue(undefined),
  scoreTrace: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/lib/storage', () => ({
  urlToSlug: jest.fn((url: string) =>
    url.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-|-$/g, '')
  ),
  saveRevision: jest.fn().mockResolvedValue(1),
  updateRevision: jest.fn().mockResolvedValue(undefined),
}));

import { runExperiment, runJudgeOnly, resolvePrompt, promptDesc, printDryRunExperiment } from '../../scripts/run-experiment';
import type { ExperimentConfig } from '../../scripts/run-experiment';
import type { RevisionData } from '../../src/lib/storage';
import { callLLM, scoreTrace } from '../../src/lib/llm';
import { saveRevision, updateRevision } from '../../src/lib/storage';

const mockCallLLM = callLLM as jest.Mock;
const mockSaveRevision = saveRevision as jest.Mock;
const mockUpdateRevision = updateRevision as jest.Mock;
const mockScoreTrace = scoreTrace as jest.Mock;

// call index layout:  0=claude-gen, 1=gpt-gen, 2=claude-judge×claude, 3=claude-judge×gpt,
//                     4=gpt-judge×claude, 5=gpt-judge×gpt
const genResponse = (traceId: string) => ({
  text: '## Test Cases\n\n1. Login test\n2. Logout test',
  model: 'claude-sonnet',
  provider: 'anthropic' as const,
  tokenUsage: { input: 100, output: 200 },
  latencyMs: 1500,
  traceId,
});

const judgeResponse = (traceId: string) => ({
  text: '{"score": 4, "feedback": "Good coverage"}',
  model: 'claude-sonnet',
  provider: 'anthropic' as const,
  tokenUsage: { input: 50, output: 30 },
  latencyMs: 500,
  traceId,
});

const baseConfig: ExperimentConfig = {
  url: 'http://test.example.com',
  testMethodology: 'You are a QA engineer. Generate comprehensive test cases.',
  productRequirements: 'A simple task management app.',
  judgePrompt: 'Score the test cases from 0 to 5.',
  revisionNotes: 'Test run',
};

beforeEach(() => {
  mockCallLLM
    .mockResolvedValueOnce(genResponse('gen-claude'))
    .mockResolvedValueOnce(genResponse('gen-gpt'))
    .mockResolvedValueOnce(judgeResponse('judge-claude-claude'))
    .mockResolvedValueOnce(judgeResponse('judge-claude-gpt'))
    .mockResolvedValueOnce(judgeResponse('judge-gpt-claude'))
    .mockResolvedValueOnce(judgeResponse('judge-gpt-gpt'));
  mockSaveRevision.mockResolvedValue(1);
  mockUpdateRevision.mockResolvedValue(undefined);
  mockScoreTrace.mockResolvedValue(undefined);
});

// ── Save point ─────────────────────────────────────────────────────────────────

describe('saveRevision', () => {
  test('called once with correct url, prompts, and revisionNotes', async () => {
    await runExperiment(baseConfig);
    expect(mockSaveRevision).toHaveBeenCalledTimes(1);
    expect(mockSaveRevision).toHaveBeenCalledWith(
      expect.objectContaining({
        url: baseConfig.url,
        prompts: {
          testMethodology: baseConfig.testMethodology,
          productRequirements: baseConfig.productRequirements,
          judgePrompt: baseConfig.judgePrompt,
        },
        revisionNotes: baseConfig.revisionNotes,
      })
    );
  });

  test('configSnapshot includes all generators and judges from config', async () => {
    await runExperiment(baseConfig);
    const { configSnapshot } = mockSaveRevision.mock.calls[0][0];
    expect(configSnapshot.generators).toHaveLength(2);
    expect(configSnapshot.judges).toHaveLength(2);
    expect(configSnapshot.generators[0]).toMatchObject({ id: 'claude', provider: 'anthropic' });
    expect(configSnapshot.judges[0]).toMatchObject({ id: 'claude-judge' });
  });

  test('human scores initialised as null for each generator', async () => {
    await runExperiment(baseConfig);
    const { scores } = mockSaveRevision.mock.calls[0][0];
    expect(scores.human).toEqual({ claude: null, gpt: null });
    expect(scores.judges).toEqual({});
  });

  test('only successful generations included in saved revision', async () => {
    mockCallLLM
      .mockReset()
      .mockRejectedValueOnce(new Error('Claude API down'))
      .mockResolvedValueOnce(genResponse('gen-gpt'))
      .mockResolvedValue(judgeResponse('j'));

    await runExperiment(baseConfig);

    const { generations } = mockSaveRevision.mock.calls[0][0];
    expect(Object.keys(generations)).not.toContain('claude');
    expect(Object.keys(generations)).toContain('gpt');
  });

  test('revision saved even when all generators fail (empty generations)', async () => {
    mockCallLLM.mockReset().mockRejectedValue(new Error('All APIs down'));

    await runExperiment(baseConfig);

    expect(mockSaveRevision).toHaveBeenCalledTimes(1);
    const { generations } = mockSaveRevision.mock.calls[0][0];
    expect(Object.keys(generations)).toHaveLength(0);
  });
});

// ── Return value ───────────────────────────────────────────────────────────────

describe('return value', () => {
  test('revisionNumber comes from saveRevision', async () => {
    mockSaveRevision.mockResolvedValue(7);
    const result = await runExperiment(baseConfig);
    expect(result.revisionNumber).toBe(7);
  });

  test('slug is derived from the url', async () => {
    const result = await runExperiment(baseConfig);
    expect(result.slug).toBe('test-example-com');
  });

  test('generations record has an entry for each generator', async () => {
    const result = await runExperiment(baseConfig);
    expect(result.generations['claude'].success).toBe(true);
    expect(result.generations['gpt'].success).toBe(true);
  });

  test('failed generator recorded with success=false and error message', async () => {
    mockCallLLM
      .mockReset()
      .mockRejectedValueOnce(new Error('Rate limited'))
      .mockResolvedValueOnce(genResponse('gen-gpt'))
      .mockResolvedValue(judgeResponse('j'));

    const result = await runExperiment(baseConfig);
    expect(result.generations['claude'].success).toBe(false);
    expect(result.generations['claude'].error).toContain('Rate limited');
  });

  test('judgeScores is empty when all generators fail', async () => {
    mockCallLLM.mockReset().mockRejectedValue(new Error('All down'));
    const result = await runExperiment(baseConfig);
    expect(result.judgeScores).toEqual({});
  });
});

// ── Judging ────────────────────────────────────────────────────────────────────

describe('judging', () => {
  test('2 generators × 2 judges = 6 total callLLM calls', async () => {
    await runExperiment(baseConfig);
    expect(mockCallLLM).toHaveBeenCalledTimes(6);
  });

  test('judges only run for generators with successful output', async () => {
    mockCallLLM
      .mockReset()
      .mockRejectedValueOnce(new Error('Claude failed'))
      .mockResolvedValueOnce(genResponse('gen-gpt'))
      .mockResolvedValue(judgeResponse('j'));

    await runExperiment(baseConfig);
    // 2 gen calls + 1 surviving generator × 2 judges = 4
    expect(mockCallLLM).toHaveBeenCalledTimes(4);
  });

  test('judge failure handled gracefully — other judges still succeed', async () => {
    mockCallLLM
      .mockReset()
      .mockResolvedValueOnce(genResponse('gen-claude'))
      .mockResolvedValueOnce(genResponse('gen-gpt'))
      .mockRejectedValueOnce(new Error('Judge crash')) // claude-judge×claude fails
      .mockResolvedValue(judgeResponse('j'));           // remaining 3 judges succeed

    const result = await runExperiment(baseConfig);
    expect(result.judgeScores['claude-judge']['claude'].success).toBe(false);
    expect(result.judgeScores['claude-judge']['gpt'].success).toBe(true);
    expect(result.judgeScores['gpt-judge']['claude'].success).toBe(true);
  });

  test('self-evaluation detected: same provider + model → selfEvaluation=true', async () => {
    const result = await runExperiment(baseConfig);
    // claude-judge (anthropic/claude-sonnet) judging claude gen (anthropic/claude-sonnet)
    expect(result.judgeScores['claude-judge']['claude'].selfEvaluation).toBe(true);
  });

  test('not self-evaluation: same provider, different model', async () => {
    const result = await runExperiment(baseConfig);
    // gpt-judge (openai/gpt-4-judge) judging gpt gen (openai/gpt-4) — different model
    expect(result.judgeScores['gpt-judge']['gpt'].selfEvaluation).toBe(false);
  });

  test('not self-evaluation: different provider', async () => {
    const result = await runExperiment(baseConfig);
    // claude-judge (anthropic) judging gpt gen (openai)
    expect(result.judgeScores['claude-judge']['gpt'].selfEvaluation).toBe(false);
  });

  test('parsed score and feedback returned in judgeScores', async () => {
    const result = await runExperiment(baseConfig);
    expect(result.judgeScores['claude-judge']['claude'].score).toBe(4);
    expect(result.judgeScores['claude-judge']['claude'].feedback).toBe('Good coverage');
  });

  test('unparseable judge response → score=undefined, feedback=raw text', async () => {
    mockCallLLM
      .mockReset()
      .mockResolvedValueOnce(genResponse('gen-claude'))
      .mockResolvedValueOnce(genResponse('gen-gpt'))
      .mockResolvedValue({
        text: 'Just prose, no JSON.',
        model: 'some-model',
        provider: 'anthropic' as const,
        tokenUsage: { input: 50, output: 30 },
        latencyMs: 500,
        traceId: 'j',
      });

    const result = await runExperiment(baseConfig);
    expect(result.judgeScores['claude-judge']['claude'].score).toBeUndefined();
    expect(result.judgeScores['claude-judge']['claude'].feedback).toBe('Just prose, no JSON.');
  });
});

// ── updateRevision ─────────────────────────────────────────────────────────────

describe('updateRevision', () => {
  test('called with judge scores patch after judging succeeds', async () => {
    await runExperiment(baseConfig);
    expect(mockUpdateRevision).toHaveBeenCalledTimes(1);
    expect(mockUpdateRevision).toHaveBeenCalledWith(
      'test-example-com',
      1,
      expect.objectContaining({
        scores: expect.objectContaining({
          judges: expect.objectContaining({
            'claude-judge': expect.objectContaining({ claude: expect.any(Object) }),
            'gpt-judge': expect.objectContaining({ claude: expect.any(Object) }),
          }),
        }),
      })
    );
  });

  test('NOT called when no judge scores have a parseable score', async () => {
    mockCallLLM
      .mockReset()
      .mockResolvedValueOnce(genResponse('gen-claude'))
      .mockResolvedValueOnce(genResponse('gen-gpt'))
      .mockResolvedValue({
        text: 'prose only',
        model: 'm',
        provider: 'anthropic' as const,
        tokenUsage: { input: 1, output: 1 },
        latencyMs: 100,
        traceId: 'j',
      });

    await runExperiment(baseConfig);
    expect(mockUpdateRevision).not.toHaveBeenCalled();
  });

  test('NOT called when all judges fail', async () => {
    mockCallLLM
      .mockReset()
      .mockResolvedValueOnce(genResponse('gen-claude'))
      .mockResolvedValueOnce(genResponse('gen-gpt'))
      .mockRejectedValue(new Error('Judge API down'));

    await runExperiment(baseConfig);
    expect(mockUpdateRevision).not.toHaveBeenCalled();
  });
});

// ── scoreTrace ─────────────────────────────────────────────────────────────────

describe('scoreTrace', () => {
  test('called once per successful judge score (4 total for 2×2)', async () => {
    await runExperiment(baseConfig);
    expect(mockScoreTrace).toHaveBeenCalledTimes(4);
  });

  test('called with correct traceId, value, and source', async () => {
    await runExperiment(baseConfig);
    expect(mockScoreTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: 'judge-claude-claude',
        value: 4,
        source: 'llm_judge',
      })
    );
  });

  test('NOT called for failed judge calls', async () => {
    mockCallLLM
      .mockReset()
      .mockResolvedValueOnce(genResponse('gen-claude'))
      .mockResolvedValueOnce(genResponse('gen-gpt'))
      .mockRejectedValueOnce(new Error('Failed'))
      .mockResolvedValue(judgeResponse('j'));

    await runExperiment(baseConfig);
    // 1 failure + 3 successes
    expect(mockScoreTrace).toHaveBeenCalledTimes(3);
  });

  test('NOT called when judge response has no parseable score', async () => {
    mockCallLLM
      .mockReset()
      .mockResolvedValueOnce(genResponse('gen-claude'))
      .mockResolvedValueOnce(genResponse('gen-gpt'))
      .mockResolvedValue({
        text: 'no json here',
        model: 'm',
        provider: 'anthropic' as const,
        tokenUsage: { input: 1, output: 1 },
        latencyMs: 100,
        traceId: 'j',
      });

    await runExperiment(baseConfig);
    expect(mockScoreTrace).not.toHaveBeenCalled();
  });
});

// ── Prompt assembly ────────────────────────────────────────────────────────────

describe('prompt assembly', () => {
  test('generator systemPrompt is testMethodology', async () => {
    await runExperiment(baseConfig);
    const genCall = mockCallLLM.mock.calls[0][0];
    expect(genCall.systemPrompt).toBe(baseConfig.testMethodology);
  });

  test('generator userPrompt contains url and productRequirements', async () => {
    await runExperiment(baseConfig);
    const genCall = mockCallLLM.mock.calls[0][0];
    expect(genCall.userPrompt).toContain(baseConfig.url);
    expect(genCall.userPrompt).toContain(baseConfig.productRequirements);
  });

  test('generator userPrompt has no screenshot note when no images', async () => {
    await runExperiment(baseConfig);
    const genCall = mockCallLLM.mock.calls[0][0];
    expect(genCall.userPrompt).not.toContain('Screenshots');
  });

  test('judge systemPrompt is judgePrompt', async () => {
    await runExperiment(baseConfig);
    // First judge call is index 2 (after 2 generators)
    const judgeCall = mockCallLLM.mock.calls[2][0];
    expect(judgeCall.systemPrompt).toBe(baseConfig.judgePrompt);
  });

  test('judge userPrompt contains url, productRequirements, and generation output', async () => {
    await runExperiment(baseConfig);
    const judgeCall = mockCallLLM.mock.calls[2][0];
    expect(judgeCall.userPrompt).toContain(baseConfig.url);
    expect(judgeCall.userPrompt).toContain(baseConfig.productRequirements);
    expect(judgeCall.userPrompt).toContain(genResponse('gen-claude').text);
  });

  test('judge userPrompt includes 0–5 scoring rubric', async () => {
    await runExperiment(baseConfig);
    const judgeCall = mockCallLLM.mock.calls[2][0];
    expect(judgeCall.userPrompt).toContain('Score the test cases from 0 to 5');
    expect(judgeCall.userPrompt).toContain('Completely unusable');
  });

  test('judge userPrompt instructs JSON-only response format', async () => {
    await runExperiment(baseConfig);
    const judgeCall = mockCallLLM.mock.calls[2][0];
    expect(judgeCall.userPrompt).toContain('Respond in this exact JSON format');
  });

  test('generator userPrompt includes screenshot note when images present', async () => {
    const mockFs = jest.requireMock('fs/promises');
    mockFs.readFile.mockResolvedValue(Buffer.from('fake-image'));

    await runExperiment({ ...baseConfig, imagePaths: ['screenshot.png'] });

    const genCall = mockCallLLM.mock.calls[0][0];
    expect(genCall.userPrompt).toContain('Screenshots of the application UI are attached');
  });

  test('judge userPrompt includes screenshot note when images present', async () => {
    const mockFs = jest.requireMock('fs/promises');
    mockFs.readFile.mockResolvedValue(Buffer.from('fake-image'));

    await runExperiment({ ...baseConfig, imagePaths: ['screenshot.png'] });

    const judgeCall = mockCallLLM.mock.calls[2][0];
    expect(judgeCall.userPrompt).toContain('Screenshots of the application are attached');
  });
});

// ── Image handling ─────────────────────────────────────────────────────────────

describe('image handling', () => {
  test('images NOT passed to callLLM when imagePaths is empty', async () => {
    await runExperiment({ ...baseConfig, imagePaths: [] });
    for (const call of mockCallLLM.mock.calls) {
      expect(call[0].images).toBeUndefined();
    }
  });

  test('images NOT passed to callLLM when imagePaths is absent', async () => {
    await runExperiment(baseConfig);
    for (const call of mockCallLLM.mock.calls) {
      expect(call[0].images).toBeUndefined();
    }
  });

  test('images loaded from disk and passed to all callLLM calls', async () => {
    const mockFs = jest.requireMock('fs/promises');
    mockFs.readFile.mockResolvedValue(Buffer.from('img-bytes'));

    await runExperiment({ ...baseConfig, imagePaths: ['shot.png'] });

    for (const call of mockCallLLM.mock.calls) {
      expect(call[0].images).toHaveLength(1);
      expect(call[0].images[0].mimeType).toBe('image/png');
      expect(call[0].images[0].base64).toBe(Buffer.from('img-bytes').toString('base64'));
    }
  });

  test('JPEG and WebP extensions resolve to correct MIME types', async () => {
    const mockFs = jest.requireMock('fs/promises');
    mockFs.readFile.mockResolvedValue(Buffer.from('data'));

    await runExperiment({ ...baseConfig, imagePaths: ['a.jpg', 'b.webp'] });

    const genCall = mockCallLLM.mock.calls[0][0];
    expect(genCall.images[0].mimeType).toBe('image/jpeg');
    expect(genCall.images[1].mimeType).toBe('image/webp');
  });
});

// ── runJudgeOnly ───────────────────────────────────────────────────────────────

const sourceRevision: RevisionData = {
  revision: 5,
  timestamp: '2025-01-01T00:00:00.000Z',
  url: 'http://test.example.com',
  prompts: {
    testMethodology: 'Original methodology',
    productRequirements: 'A simple task management app.',
    judgePrompt: 'Old judge prompt',
  },
  revisionNotes: 'Original run',
  images: [],
  configSnapshot: {
    generators: [
      { id: 'claude', name: 'Claude Sonnet', provider: 'anthropic', model: 'claude-sonnet' },
      { id: 'gpt',    name: 'GPT-4',         provider: 'openai',    model: 'gpt-4'         },
    ],
    judges: [
      { id: 'old-judge', name: 'Old Judge', provider: 'anthropic', model: 'old-model' },
    ],
  },
  generations: {
    claude: {
      output: 'Claude test cases output',
      tokenUsage: { input: 100, output: 200 },
      latencyMs: 1500,
      langfuseTraceId: 'orig-trace-claude',
    },
    gpt: {
      output: 'GPT test cases output',
      tokenUsage: { input: 80, output: 180 },
      latencyMs: 1200,
      langfuseTraceId: 'orig-trace-gpt',
    },
  },
  scores: {
    human: { claude: null, gpt: null },
    judges: {},
  },
};

const judgeOnlyConfig: ExperimentConfig = {
  url: 'http://test.example.com',
  testMethodology: 'Original methodology',
  productRequirements: 'A simple task management app.',
  judgePrompt: 'New improved judge prompt',
  revisionNotes: 'Re-judge of revision 5 with updated judge configuration',
};

describe('runJudgeOnly', () => {
  beforeEach(() => {
    // Only judge calls — 2 generators × 2 judges = 4 calls
    mockCallLLM
      .mockResolvedValueOnce(judgeResponse('j-claude-claude'))
      .mockResolvedValueOnce(judgeResponse('j-claude-gpt'))
      .mockResolvedValueOnce(judgeResponse('j-gpt-claude'))
      .mockResolvedValueOnce(judgeResponse('j-gpt-gpt'));
    mockSaveRevision.mockResolvedValue(6);
    mockUpdateRevision.mockResolvedValue(undefined);
    mockScoreTrace.mockResolvedValue(undefined);
  });

  test('does NOT call callLLM for generation — only judge calls', async () => {
    await runJudgeOnly(judgeOnlyConfig, sourceRevision);
    // 2 generators × 2 judges = 4 calls (no gen calls)
    expect(mockCallLLM).toHaveBeenCalledTimes(4);
    const roles = mockCallLLM.mock.calls.map((c: any[]) => c[0].traceContext?.role);
    expect(roles.every((r: string) => r === 'judge')).toBe(true);
  });

  test('saveRevision called with generator outputs copied from source revision', async () => {
    await runJudgeOnly(judgeOnlyConfig, sourceRevision);
    const { generations } = mockSaveRevision.mock.calls[0][0];
    expect(generations).toEqual(sourceRevision.generations);
  });

  test('saveRevision called with judgePrompt from expConfig (not source revision)', async () => {
    await runJudgeOnly(judgeOnlyConfig, sourceRevision);
    const { prompts } = mockSaveRevision.mock.calls[0][0];
    expect(prompts.judgePrompt).toBe('New improved judge prompt');
  });

  test('saveRevision called with revisionNotes from expConfig', async () => {
    await runJudgeOnly(judgeOnlyConfig, sourceRevision);
    expect(mockSaveRevision).toHaveBeenCalledWith(
      expect.objectContaining({ revisionNotes: judgeOnlyConfig.revisionNotes })
    );
  });

  test('configSnapshot uses source generators and current config judges', async () => {
    await runJudgeOnly(judgeOnlyConfig, sourceRevision);
    const { configSnapshot } = mockSaveRevision.mock.calls[0][0];
    // Generators from source revision
    expect(configSnapshot.generators).toEqual(sourceRevision.configSnapshot.generators);
    // Judges from current appConfig (claude-judge and gpt-judge)
    expect(configSnapshot.judges).toHaveLength(2);
    expect(configSnapshot.judges[0].id).toBe('claude-judge');
  });

  test('judge userPrompt uses the new judgePrompt as systemPrompt', async () => {
    await runJudgeOnly(judgeOnlyConfig, sourceRevision);
    for (const call of mockCallLLM.mock.calls) {
      expect(call[0].systemPrompt).toBe('New improved judge prompt');
    }
  });

  test('judge userPrompt contains source generation output', async () => {
    await runJudgeOnly(judgeOnlyConfig, sourceRevision);
    const allUserPrompts = mockCallLLM.mock.calls.map((c: any[]) => c[0].userPrompt);
    expect(allUserPrompts.some((p: string) => p.includes('Claude test cases output'))).toBe(true);
    expect(allUserPrompts.some((p: string) => p.includes('GPT test cases output'))).toBe(true);
  });

  test('self-evaluation detected using source revision generator provider/model', async () => {
    // claude generator: anthropic/claude-sonnet; claude-judge: anthropic/claude-sonnet → self-eval
    const result = await runJudgeOnly(judgeOnlyConfig, sourceRevision);
    expect(result.judgeScores['claude-judge']['claude'].selfEvaluation).toBe(true);
  });

  test('returns revisionNumber from saveRevision', async () => {
    mockSaveRevision.mockResolvedValue(6);
    const result = await runJudgeOnly(judgeOnlyConfig, sourceRevision);
    expect(result.revisionNumber).toBe(6);
  });

  test('returns generations keyed by source generator IDs', async () => {
    const result = await runJudgeOnly(judgeOnlyConfig, sourceRevision);
    expect(result.generations['claude'].success).toBe(true);
    expect(result.generations['claude'].output).toBe('Claude test cases output');
    expect(result.generations['gpt'].success).toBe(true);
  });

  test('updateRevision called with new judge scores', async () => {
    await runJudgeOnly(judgeOnlyConfig, sourceRevision);
    expect(mockUpdateRevision).toHaveBeenCalledTimes(1);
    expect(mockUpdateRevision).toHaveBeenCalledWith(
      'test-example-com',
      6,
      expect.objectContaining({ scores: expect.objectContaining({ judges: expect.any(Object) }) })
    );
  });

  test('scoreTrace called for each successful judge score', async () => {
    await runJudgeOnly(judgeOnlyConfig, sourceRevision);
    expect(mockScoreTrace).toHaveBeenCalledTimes(4);
  });

  test('returns empty judgeScores when source revision has no outputs', async () => {
    const emptySource: RevisionData = {
      ...sourceRevision,
      generations: {},
      scores: { human: {}, judges: {} },
    };
    const result = await runJudgeOnly(judgeOnlyConfig, emptySource);
    expect(result.judgeScores).toEqual({});
    expect(mockCallLLM).not.toHaveBeenCalled();
  });
});

// ── resolvePrompt ──────────────────────────────────────────────────────────────

import { existsSync, readFileSync } from 'fs';

const mockExistsSync = existsSync as jest.Mock;
const mockReadFileSync = readFileSync as jest.Mock;

describe('resolvePrompt', () => {
  test('returns inline string unchanged', () => {
    expect(resolvePrompt('just a plain prompt')).toBe('just a plain prompt');
  });

  test('returns empty string unchanged', () => {
    expect(resolvePrompt('')).toBe('');
  });

  test('reads file contents when value starts with "file:"', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('file contents here');

    const result = resolvePrompt('file:research/prompts/methodology.md');
    expect(result).toBe('file contents here');
  });

  test('calls readFileSync with utf-8 encoding', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('content');

    resolvePrompt('file:some/path.md');
    expect(mockReadFileSync).toHaveBeenCalledWith(expect.any(String), 'utf-8');
  });

  test('resolves file path relative to process.cwd()', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('content');

    resolvePrompt('file:research/prompts/test.md');
    const resolvedPath = mockReadFileSync.mock.calls[0][0] as string;
    expect(resolvedPath).toContain('research/prompts/test.md');
    expect(resolvedPath.startsWith('/')).toBe(true);
  });

  test('throws with full resolved path when file does not exist', () => {
    mockExistsSync.mockReturnValue(false);

    expect(() => resolvePrompt('file:missing/file.md')).toThrow(
      /Prompt file not found:.*missing\/file\.md/
    );
  });

  test('does not call readFileSync when file does not exist', () => {
    mockExistsSync.mockReturnValue(false);

    try { resolvePrompt('file:nope.md'); } catch { /* expected */ }
    expect(mockReadFileSync).not.toHaveBeenCalled();
  });

  test('inline string starting with "file" but not "file:" is returned as-is', () => {
    expect(resolvePrompt('files are good')).toBe('files are good');
    expect(mockExistsSync).not.toHaveBeenCalled();
  });
});

// ── promptDesc ─────────────────────────────────────────────────────────────────

describe('promptDesc', () => {
  test('file: prefix formats as "loaded from <path> (N chars)"', () => {
    expect(promptDesc('file:research/prompts/foo.md', 'hello world')).toBe(
      'loaded from research/prompts/foo.md (11 chars)'
    );
  });

  test('inline string formats as "inline (N chars)"', () => {
    expect(promptDesc('plain text prompt', 'plain text prompt')).toBe(
      'inline (17 chars)'
    );
  });

  test('char count reflects resolved content length, not original', () => {
    expect(promptDesc('file:any.md', 'abc')).toBe('loaded from any.md (3 chars)');
  });

  test('empty inline string', () => {
    expect(promptDesc('', '')).toBe('inline (0 chars)');
  });
});

// ── printDryRunExperiment ──────────────────────────────────────────────────────

describe('printDryRunExperiment', () => {
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

  const original: ExperimentConfig = {
    url: 'http://example.com',
    testMethodology: 'file:prompts/methodology.md',
    productRequirements: 'inline requirements text',
    judgePrompt: 'file:prompts/judge.md',
    revisionNotes: 'test run',
  };

  const resolved: ExperimentConfig = {
    ...original,
    testMethodology: 'x'.repeat(50),  // 50 chars
    judgePrompt: 'y'.repeat(30),       // 30 chars
  };

  test('prints dry-run header', () => {
    printDryRunExperiment(original, resolved);
    expect(logs).toEqual(expect.arrayContaining([
      expect.stringContaining('DRY RUN — no API calls will be made'),
    ]));
  });

  test('prints URL', () => {
    printDryRunExperiment(original, resolved);
    expect(logs.some((l) => l.includes('http://example.com'))).toBe(true);
  });

  test('prints file: fields as "loaded from <path> (N chars)"', () => {
    printDryRunExperiment(original, resolved);
    expect(logs.some((l) => l.includes('loaded from prompts/methodology.md (50 chars)'))).toBe(true);
    expect(logs.some((l) => l.includes('loaded from prompts/judge.md (30 chars)'))).toBe(true);
  });

  test('prints inline field as "inline (N chars)"', () => {
    printDryRunExperiment(original, resolved);
    const reqLen = original.productRequirements.length;
    expect(logs.some((l) => l.includes(`inline (${reqLen} chars)`))).toBe(true);
  });

  test('prints all generator model names', () => {
    printDryRunExperiment(original, resolved);
    expect(logs.some((l) => l.includes('Claude Sonnet'))).toBe(true);
    expect(logs.some((l) => l.includes('GPT-4'))).toBe(true);
  });

  test('prints all judge model names', () => {
    printDryRunExperiment(original, resolved);
    expect(logs.some((l) => l.includes('Claude Judge'))).toBe(true);
    expect(logs.some((l) => l.includes('GPT Judge'))).toBe(true);
  });

  test('prints correct generator call count (2)', () => {
    printDryRunExperiment(original, resolved);
    expect(logs.some((l) => l.includes('Generator calls') && l.includes('2'))).toBe(true);
  });

  test('prints correct judge evaluation count (2 outputs × 2 judges = 4)', () => {
    printDryRunExperiment(original, resolved);
    expect(logs.some((l) => l.includes('2 outputs') && l.includes('2 judges') && l.includes('4'))).toBe(true);
  });

  test('prints correct total API calls (2 gen + 4 judge = 6)', () => {
    printDryRunExperiment(original, resolved);
    expect(logs.some((l) => l.includes('Total:') && l.includes('6'))).toBe(true);
  });
});
