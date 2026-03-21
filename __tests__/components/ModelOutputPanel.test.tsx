/**
 * @jest-environment jest-environment-jsdom
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ModelOutputPanel } from '../../src/app/components/ModelOutputPanel';

// react-markdown uses ESM; stub it out so ts-jest (CommonJS) can handle it
jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}));
jest.mock('remark-gfm', () => ({ __esModule: true, default: () => {} }));

const basePanel = {
  id: 'claude',
  name: 'Claude',
  model: 'claude-sonnet-4-20250514',
  status: 'success' as const,
  output: '# Test Cases\n\n- Case 1\n- Case 2',
  tokenUsage: { input: 100, output: 200 },
  latencyMs: 1500,
  langfuseTraceId: 'trace-abc',
};

const defaultProps = {
  panel: basePanel,
  judgeModels: [],
  judgeResults: {},
  onScoreChange: jest.fn(),
};

// Mock navigator.clipboard
const mockWriteText = jest.fn().mockResolvedValue(undefined);
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: mockWriteText },
  writable: true,
});

describe('ModelOutputPanel copy button', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockWriteText.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('copy button is present when status=success and output exists', () => {
    render(<ModelOutputPanel {...defaultProps} />);
    expect(screen.getByRole('button', { name: /copy output/i })).toBeInTheDocument();
  });

  test('copy button is absent when status=loading', () => {
    const props = { ...defaultProps, panel: { ...basePanel, status: 'loading' as const, output: undefined } };
    render(<ModelOutputPanel {...props} />);
    expect(screen.queryByRole('button', { name: /copy/i })).not.toBeInTheDocument();
  });

  test('copy button is absent when status=success but output is undefined', () => {
    const props = { ...defaultProps, panel: { ...basePanel, output: undefined } };
    render(<ModelOutputPanel {...props} />);
    expect(screen.queryByRole('button', { name: /copy/i })).not.toBeInTheDocument();
  });

  test('clicking copy button calls navigator.clipboard.writeText with raw markdown text', async () => {
    render(<ModelOutputPanel {...defaultProps} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy output/i }));
    });
    expect(mockWriteText).toHaveBeenCalledWith(basePanel.output);
  });

  test('after copying, button label changes to "Copied"', async () => {
    render(<ModelOutputPanel {...defaultProps} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy output/i }));
    });
    expect(screen.getByRole('button', { name: /copied/i })).toBeInTheDocument();
  });

  test('after 2 seconds, button reverts to "Copy output"', async () => {
    render(<ModelOutputPanel {...defaultProps} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy output/i }));
    });
    expect(screen.getByRole('button', { name: /copied/i })).toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    expect(screen.getByRole('button', { name: /copy output/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /copied/i })).not.toBeInTheDocument();
  });

  test('copies raw markdown, not rendered HTML', async () => {
    render(<ModelOutputPanel {...defaultProps} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy output/i }));
    });
    const calledWith = mockWriteText.mock.calls[0][0];
    expect(calledWith).toBe(basePanel.output);
    // raw text, not rendered HTML
    expect(calledWith).toContain('# Test Cases');
    expect(calledWith).not.toContain('<h1>');
  });
});
