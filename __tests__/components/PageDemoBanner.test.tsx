/**
 * @jest-environment jest-environment-jsdom
 */
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import Page from "../../src/app/page";

type MockModelConfig = Record<string, unknown>;

function getMockConfig(): { generators: MockModelConfig[]; judges: MockModelConfig[] } {
  return (globalThis as unknown as { __pageDemoBannerMockConfig: { generators: MockModelConfig[]; judges: MockModelConfig[] } })
    .__pageDemoBannerMockConfig;
}

jest.mock("@/lib/config", () => ({
  __esModule: true,
  default: {
    get generators() {
      return (globalThis as unknown as { __pageDemoBannerMockConfig?: { generators: MockModelConfig[] } })
        .__pageDemoBannerMockConfig?.generators ?? [];
    },
    get judges() {
      return (globalThis as unknown as { __pageDemoBannerMockConfig?: { judges: MockModelConfig[] } })
        .__pageDemoBannerMockConfig?.judges ?? [];
    },
  },
}));

jest.mock("../../src/app/components/ImageUpload", () => ({
  ImageUpload: () => <div data-testid="image-upload" />,
}));

jest.mock("../../src/app/components/ModelOutputPanel", () => ({
  ModelOutputPanel: () => <div data-testid="model-output-panel" />,
}));

jest.mock("../../src/app/components/JudgeScoreSection", () => ({
  JudgeScoreSection: () => <div data-testid="judge-score-section" />,
}));

jest.mock("../../src/app/components/ScoringTrends", () => ({
  ScoringTrends: () => <div data-testid="scoring-trends" />,
}));

describe("Page demo banner", () => {
  beforeEach(() => {
    (globalThis as unknown as { __pageDemoBannerMockConfig: { generators: MockModelConfig[]; judges: MockModelConfig[] } })
      .__pageDemoBannerMockConfig = { generators: [], judges: [] };
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/products") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ products: [] }),
        } as Response);
      }
      if (url === "/api/runtime") {
        return Promise.resolve(
          {
            ok: true,
            status: 200,
            json: async () => ({ langfuseAvailable: false, langfuseDefaultEnabled: false }),
          } as Response
        );
      }
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response);
    }) as jest.Mock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("shows a demo notice with a link to the full GitHub repo", async () => {
    render(<Page />);

    expect(screen.getByText(/Demo version:/i)).toBeInTheDocument();
    expect(screen.getByText(/keeps anonymous session data for one week/i)).toBeInTheDocument();

    const repoLink = screen.getByRole("link", { name: /view the full tool on github/i });
    expect(repoLink).toHaveAttribute(
      "href",
      "https://github.com/george-andraws/AI-Test-Case-Generator-Eval"
    );
    expect(repoLink).toHaveAttribute("target", "_blank");
    expect(repoLink).toHaveAttribute("rel", "noopener noreferrer");

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/products"));
  });

  test("does not run judges automatically after generation completes", async () => {
    getMockConfig().generators = [
      {
        id: "generator-a",
        name: "Generator A",
        provider: "openrouter",
        model: "provider/generator-a",
        enabled: true,
      },
    ];
    getMockConfig().judges = [
      {
        id: "judge-a",
        name: "Judge A",
        provider: "openrouter",
        model: "provider/judge-a",
        enabled: true,
      },
    ];

    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/products") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ products: [] }),
        } as Response);
      }
      if (url === "/api/runtime") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ langfuseAvailable: false, langfuseDefaultEnabled: false }),
        } as Response);
      }
      if (url === "/api/generate") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            results: {
              "generator-a": {
                success: true,
                output: "Generated test cases",
                tokenUsage: { input: 10, output: 20 },
                latencyMs: 100,
                langfuseTraceId: "trace-generator",
              },
            },
          }),
        } as Response);
      }
      if (url === "/api/data" && init?.method === "POST") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, revision: 1 }),
        } as Response);
      }
      if (url.startsWith("/api/data?")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ([]),
        } as Response);
      }
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response);
    }) as jest.Mock;

    render(<Page />);

    fireEvent.change(screen.getByLabelText(/Application under test/i), {
      target: { value: "https://example.com" },
    });
    fireEvent.change(screen.getByLabelText(/Product requirements/i), {
      target: { value: "Users can sign in and view reports." },
    });

    fireEvent.click(screen.getByRole("button", { name: /generate test cases/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /run judges/i })).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /generate test cases/i })).toBeEnabled();
    expect(global.fetch).toHaveBeenCalledWith("/api/generate", expect.any(Object));
    expect(global.fetch).not.toHaveBeenCalledWith("/api/judge", expect.any(Object));
  });
});
