/**
 * @jest-environment jest-environment-jsdom
 */
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  JudgeScoreSection,
  formatAdjustedWeight,
} from '../../src/app/components/JudgeScoreSection';
import type { JudgePanelEntry } from '../../src/app/components/JudgeScoreSection';

// Mock config
jest.mock('../../src/lib/config', () => ({
  judges: [
    { id: 'gpt-judge', name: 'GPT Judge', enabled: true },
    { id: 'claude-judge', name: 'Claude Judge', enabled: false },
  ],
}));

describe('formatAdjustedWeight', () => {
  test('formats whole-number percentages correctly', () => {
    expect(formatAdjustedWeight(21.1)).toBe('21.1%');
    expect(formatAdjustedWeight(5)).toBe('5.0%');
  });

  test('formats decimal values as percentages correctly', () => {
    expect(formatAdjustedWeight(0.2110)).toBe('21.1%');
    expect(formatAdjustedWeight(0.158)).toBe('15.8%');
  });

  test('returns N/A for null or undefined values', () => {
    expect(formatAdjustedWeight(null)).toBe('N/A');
    expect(formatAdjustedWeight(undefined)).toBe('N/A');
  });
});

const judgeModel = {
  id: 'gpt-judge',
  name: 'GPT Judge',
  provider: 'openai' as const,
  model: 'gpt-4.1',
  apiKeyEnvVar: 'OPENAI_API_KEY',
  maxTokens: 8192,
  temperature: 0.2,
  enabled: true,
};

const disabledJudgeModel = {
  id: 'claude-judge',
  name: 'Claude Judge',
  provider: 'anthropic' as const,
  model: 'claude-3.5-sonnet',
  apiKeyEnvVar: 'ANTHROPIC_API_KEY',
  maxTokens: 8192,
  temperature: 0.2,
  enabled: false,
};

function makeEntry(overrides: Partial<JudgePanelEntry> = {}): JudgePanelEntry {
  return {
    status: 'success',
    score: 4,
    feedback: 'Good coverage overall.',
    ...overrides,
  };
}

function renderSection(entry: JudgePanelEntry) {
  return render(
    <JudgeScoreSection
      judgeModels={[judgeModel]}
      results={{ 'gpt-judge': entry }}
    />
  );
}

// ── Basic rendering ────────────────────────────────────────────────────────────

describe('JudgeScoreSection basic rendering', () => {
  test('renders nothing when judgeModels is empty', () => {
    const { container } = render(
      <JudgeScoreSection judgeModels={[]} results={{}} />
    );
    expect(container.firstChild).toBeNull();
  });

  test('shows score and judge name in Tier 1', () => {
    renderSection(makeEntry());
    expect(screen.getByText(/4\/5/)).toBeInTheDocument();
    expect(screen.getByText('GPT Judge')).toBeInTheDocument();
  });

  test('shows spinner when status=loading', () => {
    const { container } = renderSection(makeEntry({ status: 'loading', score: undefined, feedback: undefined }));
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  test('shows "error" badge and error message when status=error', () => {
    renderSection(makeEntry({ status: 'error', score: undefined, feedback: undefined, error: 'Request failed' }));
    expect(screen.getByText('error')).toBeInTheDocument();
    expect(screen.getByText('Request failed')).toBeInTheDocument();
  });

  test('shows "error" badge without message when error field is absent', () => {
    renderSection(makeEntry({ status: 'error', score: undefined, feedback: undefined }));
    expect(screen.getByText('error')).toBeInTheDocument();
    expect(screen.queryByTitle('')).not.toBeInTheDocument();
  });

  test('shows dash when status=idle', () => {
    renderSection(makeEntry({ status: 'idle', score: undefined, feedback: undefined }));
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  test('shows "(self)" in red when selfEvaluation=true', () => {
    renderSection(makeEntry({ selfEvaluation: true }));
    const selfBadge = screen.getByText('(self)');
    expect(selfBadge).toBeInTheDocument();
    expect(selfBadge).toHaveClass('text-red-500');
  });

  test('does not show "(self)" when selfEvaluation=false', () => {
    renderSection(makeEntry({ selfEvaluation: false }));
    expect(screen.queryByText('(self)')).not.toBeInTheDocument();
  });

  test('shows "pending" for enabled judge with no score', () => {
    render(
      <JudgeScoreSection
        judgeModels={[judgeModel]}
        results={{ 'gpt-judge': { status: 'idle' } }}
      />
    );
    expect(screen.getByText('pending')).toBeInTheDocument();
  });

  test('shows "disabled" for disabled judge with no score', () => {
    render(
      <JudgeScoreSection
        judgeModels={[disabledJudgeModel]}
        results={{ 'claude-judge': { status: 'idle' } }}
      />
    );
    expect(screen.getByText('disabled')).toBeInTheDocument();
    expect(screen.getByText('Claude Judge')).toHaveClass('text-gray-400');
  });

  test('shows "(disabled)" for disabled judge with existing score', () => {
    render(
      <JudgeScoreSection
        judgeModels={[disabledJudgeModel]}
        results={{ 'claude-judge': makeEntry() }}
      />
    );
    expect(screen.getByText('(disabled)')).toBeInTheDocument();
    expect(screen.getByText(/4\/5/)).toBeInTheDocument();
  });

  test('renders all judges including disabled ones', () => {
    render(
      <JudgeScoreSection
        judgeModels={[judgeModel, disabledJudgeModel]}
        results={{
          'gpt-judge': { status: 'idle' },
          'claude-judge': makeEntry()
        }}
      />
    );
    expect(screen.getByText('GPT Judge')).toBeInTheDocument();
    expect(screen.getByText('Claude Judge')).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
    expect(screen.getByText('(disabled)')).toBeInTheDocument();
  });
});

// ── Tier 2: feedback ──────────────────────────────────────────────────────────

describe('Tier 2 feedback expansion', () => {
  test('feedback is hidden until chevron is clicked', () => {
    renderSection(makeEntry());
    expect(screen.queryByText('Good coverage overall.')).not.toBeInTheDocument();
  });

  test('clicking chevron expands feedback', () => {
    renderSection(makeEntry());
    fireEvent.click(screen.getByTitle('Expand feedback'));
    expect(screen.getByText('Good coverage overall.')).toBeInTheDocument();
  });

  test('clicking chevron again collapses feedback', () => {
    renderSection(makeEntry());
    fireEvent.click(screen.getByTitle('Expand feedback'));
    fireEvent.click(screen.getByTitle('Collapse feedback'));
    expect(screen.queryByText('Good coverage overall.')).not.toBeInTheDocument();
  });

  test('no chevron when feedback is absent', () => {
    renderSection(makeEntry({ feedback: undefined }));
    expect(screen.queryByTitle('Expand feedback')).not.toBeInTheDocument();
  });
});

// ── Tier 3: detailed evaluation ───────────────────────────────────────────────

describe('Tier 3 detailed evaluation', () => {
  const detailedRawData = {
    score: 3,
    feedback: 'Decent coverage.',
    weighted_total: 2.8,
    dimensions: {
      Coverage: { score: 3, adjusted_weight: 0.4, evidence: 'Covers login flow' },
      'Error Handling': { score: null, adjusted_weight: 0.2, evidence: '' },
    },
    applicability: {
      'Error Handling': { applicable: false, reason: 'No error scenarios in requirements' },
    },
    strengths: ['Clear step descriptions'],
    critical_gaps: ['Missing boundary tests'],
    recommendations: ['Add empty-input tests'],
    overall_vs_weighted_delta: 'Score is 0.2 above weighted',
  };

  function renderDetailed() {
    return renderSection(makeEntry({ score: 3, feedback: 'Decent coverage.', rawData: detailedRawData }));
  }

  function openTier2() {
    fireEvent.click(screen.getByTitle('Expand feedback'));
  }

  function openTier3() {
    fireEvent.click(screen.getByText('Detailed evaluation'));
  }

  test('Tier 3 toggle not rendered when no detailed data present', () => {
    renderSection(makeEntry());
    fireEvent.click(screen.getByTitle('Expand feedback'));
    expect(screen.queryByText('Detailed evaluation')).not.toBeInTheDocument();
  });

  test('Tier 3 toggle is rendered when dimensions are present', () => {
    renderDetailed();
    openTier2();
    expect(screen.getByText('Detailed evaluation')).toBeInTheDocument();
  });

  test('Tier 3 content is hidden until toggle is clicked', () => {
    renderDetailed();
    openTier2();
    expect(screen.queryByText('Dimensions')).not.toBeInTheDocument();
  });

  test('clicking Tier 3 toggle reveals dimensions section', () => {
    renderDetailed();
    openTier2();
    openTier3();
    expect(screen.getByText('Dimensions')).toBeInTheDocument();
    expect(screen.getByText('Coverage')).toBeInTheDocument();
    expect(screen.getByText('Error Handling')).toBeInTheDocument();
  });

  test('weighted_total shown next to score in Tier 1', () => {
    renderDetailed();
    expect(screen.getByText(/weighted: 2\.8/)).toBeInTheDocument();
  });

  test('strengths rendered in green box', () => {
    renderDetailed();
    openTier2();
    openTier3();
    expect(screen.getByText('Strengths')).toBeInTheDocument();
    expect(screen.getByText('• Clear step descriptions')).toBeInTheDocument();
  });

  test('critical_gaps rendered in red box', () => {
    renderDetailed();
    openTier2();
    openTier3();
    expect(screen.getByText('Critical gaps')).toBeInTheDocument();
    expect(screen.getByText('• Missing boundary tests')).toBeInTheDocument();
  });

  test('recommendations rendered', () => {
    renderDetailed();
    openTier2();
    openTier3();
    expect(screen.getByText('Recommendations')).toBeInTheDocument();
    expect(screen.getByText('• Add empty-input tests')).toBeInTheDocument();
  });

  test('overall_vs_weighted_delta shown at bottom', () => {
    renderDetailed();
    openTier2();
    openTier3();
    expect(screen.getByText('Score is 0.2 above weighted')).toBeInTheDocument();
  });

  test('dimension adjusted_weight values render with correct percentage formatting and N/A handling', () => {
    const rawData = {
      score: 4,
      feedback: 'Coverage details.',
      dimensions: {
        'Coverage breadth': { score: 4, adjusted_weight: 21.1, evidence: '' },
        'Coverage depth': { score: 3, adjusted_weight: 0.158, evidence: '' },
        'Requirement traceability': { score: null, adjusted_weight: null, evidence: '' },
      },
    };

    renderSection(makeEntry({ score: 4, feedback: 'Coverage details.', rawData }));
    openTier2();
    openTier3();

    expect(screen.getByText('21.1%')).toBeInTheDocument();
    expect(screen.getByText('15.8%')).toBeInTheDocument();

    const naWeight = screen.getAllByText('N/A').find((node) => node.classList.contains('text-gray-400'));
    expect(naWeight).toBeDefined();
  });

  // ── Applicability shapes ────────────────────────────────────────────────────

  test('applicability as object {applicable, reason} — does not crash React', () => {
    // This was the reported runtime error: rendering an object directly as a child
    expect(() => {
      renderDetailed();
      openTier2();
      openTier3();
    }).not.toThrow();
  });

  test('applicability object shape — reason string is shown for N/A dimension', () => {
    renderDetailed();
    openTier2();
    openTier3();
    expect(screen.getByText('No error scenarios in requirements')).toBeInTheDocument();
  });

  test('applicability as plain string — still renders correctly', () => {
    const withStringApplicability = {
      ...detailedRawData,
      applicability: { 'Error Handling': 'Not applicable here' },
    };
    renderSection(makeEntry({ rawData: withStringApplicability, feedback: 'Decent.' }));
    fireEvent.click(screen.getByTitle('Expand feedback'));
    fireEvent.click(screen.getByText('Detailed evaluation'));
    expect(screen.getByText('Not applicable here')).toBeInTheDocument();
  });

  // ── Evidence expansion ──────────────────────────────────────────────────────

  test('evidence is hidden until its row chevron is clicked', () => {
    renderDetailed();
    openTier2();
    openTier3();
    expect(screen.queryByText('Covers login flow')).not.toBeInTheDocument();
  });

  test('clicking evidence chevron reveals evidence text', () => {
    renderDetailed();
    openTier2();
    openTier3();
    fireEvent.click(screen.getByTitle('Show evidence'));
    expect(screen.getByText('Covers login flow')).toBeInTheDocument();
  });
});
