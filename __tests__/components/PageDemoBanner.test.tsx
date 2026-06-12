/**
 * @jest-environment jest-environment-jsdom
 */
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import Page from "../../src/app/page";

jest.mock("@/lib/config", () => ({
  __esModule: true,
  default: {
    generators: [],
    judges: [],
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
});
