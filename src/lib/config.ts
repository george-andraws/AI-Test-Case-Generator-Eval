export type Provider = "anthropic" | "openai" | "google" | "grok" | "openrouter";

export interface ModelConfig {
  id: string;
  name: string;
  provider: Provider;
  model: string;
  apiKeyEnvVar: string;
  maxTokens: number;
  temperature: number;
  enabled: boolean;
}

export interface LangfuseConfig {
  publicKeyEnvVar: string;
  secretKeyEnvVar: string;
  baseUrl: string;
}

export interface AppConfig {
  generators: ModelConfig[];
  judges: ModelConfig[];
  langfuse: LangfuseConfig;
}

const config: AppConfig = {
  generators: [
    // ── Direct adapters — primary proprietary models ───────────────────────
    {
      id: "claude",
      name: "Claude Haiku 4.5",   // for dev
      // name: "Claude 4 Sonnet", // latest production
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",  // for dev
      // model:  "claude-sonnet-4-20250514", // latest production
      apiKeyEnvVar: "ANTHROPIC_API_KEY",
      maxTokens: 4096,
      temperature: 0.3,
      enabled: false,
    },
    {
      id: "gpt-4.1",
      name: "gpt-4.1",
      provider: "openai",
      model: "gpt-4.1",
      apiKeyEnvVar: "OPENAI_API_KEY",
      maxTokens: 4096,
      temperature: 0.3,
      enabled: false,
    },
    {
      id: "gemini-3.1-flash-lite-preview",
      name: "Gemini 3.1 Flash Lite Preview",
      provider: "google",
      model: "gemini-3.1-flash-lite-preview",
      apiKeyEnvVar: "GOOGLE_API_KEY",
      maxTokens: 4096,
      temperature: 0.3,
      enabled: true,
    },
    {
      id: "xAI-grok",
      name: "Grok 4.2 Reasoning",
      provider: "grok",
      model: "grok-4.20-0309-reasoning",
      apiKeyEnvVar: "XAI_API_KEY",
      maxTokens: 2048,
      temperature: 0.2,
      enabled: false,
    },

    // ── OpenRouter — open source and additional models ─────────────────────
    {
      id: "llama",
      name: "Llama 3.1 70B",
      provider: "openrouter",
      model: "meta-llama/llama-3.1-70b-instruct",
      apiKeyEnvVar: "OPENROUTER_API_KEY",
      maxTokens: 4096,
      temperature: 0.3,
      enabled: true,
    },
    {
      id: "grok",
      name: "Grok 3",
      provider: "openrouter",
      model: "x-ai/grok-3",
      apiKeyEnvVar: "OPENROUTER_API_KEY",
      maxTokens: 4096,
      temperature: 0.3,
      enabled: true,
    },
    {
      id: "mistral",
      name: "Mistral Large",
      provider: "openrouter",
      model: "mistralai/mistral-large",
      apiKeyEnvVar: "OPENROUTER_API_KEY",
      maxTokens: 2949,
      temperature: 0.3,
      enabled: false,
    },
  ],

  judges: [
    {
      id: "claude-judge",
      name: "Claude Haiku 4.5 (Judge)",   // for dev
      // name: "Claude 4 Sonnet (Judge)"", // latest production
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",  // for dev
      // model:  "claude-sonnet-4-20250514", // latest production
      apiKeyEnvVar: "ANTHROPIC_API_KEY",
      maxTokens: 8192,
      temperature: 0.2,
      enabled: false,
    },
    {
      id: "gpt-4.1-judge",
      name: "gpt-4.1 (Judge)",
      provider: "openai",
      model: "gpt-4.1",
      apiKeyEnvVar: "OPENAI_API_KEY",
      maxTokens: 8192,
      temperature: 0.2,
      enabled: false,
    },
    {
      id: "gemini-3.1-flash-lite-preview-judge",
      name: "Gemini 3.1 Flash Lite Preview (Judge)",
      provider: "google",
      model: "gemini-3.1-flash-lite-preview",
      apiKeyEnvVar: "GOOGLE_API_KEY",
      maxTokens: 16384,
      temperature: 0.2,
      enabled: true,
    },
    {
      id: "grok-judge",
      name: "Grok 4.1 Fast Reasoning (Judge)",
      provider: "grok",
      model: "grok-4-1-fast-reasoning",
      apiKeyEnvVar: "XAI_API_KEY",
      maxTokens: 2048,
      temperature: 0.2,
      enabled: true,
    },
    {
      id: "mistral-judge",
      name: "Mistral Large (Judge)",
      provider: "openrouter",
      model: "mistralai/mistral-large",
      apiKeyEnvVar: "OPENROUTER_API_KEY",
      maxTokens: 2949,
      temperature: 0.3,
      enabled: false,
    },
  ],

  langfuse: {
    publicKeyEnvVar: "LANGFUSE_PUBLIC_KEY",
    secretKeyEnvVar: "LANGFUSE_SECRET_KEY",
    baseUrl: "https://us.cloud.langfuse.com",
  },
};

export default config;
