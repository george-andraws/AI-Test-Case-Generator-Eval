export type Provider = "anthropic" | "openai" | "google";

export interface ModelConfig {
  id: string;
  name: string;
  provider: Provider;
  model: string;
  apiKeyEnvVar: string;
  maxTokens: number;
  temperature: number;
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
    {
      id: "claude",
      name: "Claude 4 Sonnet",
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      apiKeyEnvVar: "ANTHROPIC_API_KEY",
      maxTokens: 4096,
      temperature: 0.3,
    },
    {
      id: "gpt-4.1",
      name: "gpt-4.1",
      provider: "openai",
      model: "gpt-4.1",
      apiKeyEnvVar: "OPENAI_API_KEY",
      maxTokens: 4096,
      temperature: 0.3,
    },
    {
      id: "gemini-3.1-flash-lite-preview",
      name: "Gemini 3.1 Flash Lite Preview",
      provider: "google",
      model: "gemini-3.1-flash-lite-preview",
      apiKeyEnvVar: "GOOGLE_API_KEY",
      maxTokens: 4096,
      temperature: 0.3,
    },
  ],

  judges: [
    {
      id: "claude-judge",
      name: "Claude 4 Sonnet (Judge)",
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      apiKeyEnvVar: "ANTHROPIC_API_KEY",
      maxTokens: 8192,
      temperature: 0.2,
    },
    {
      id: "gpt-4.1-judge",
      name: "gpt-4.1 (Judge)",
      provider: "openai",
      model: "gpt-4.1",
      apiKeyEnvVar: "OPENAI_API_KEY",
      maxTokens: 8192,
      temperature: 0.2,
    },
    {
      id: "gemini-3.1-flash-lite-preview-judge",
      name: "Gemini 3.1 Flash Lite Preview (Judge)",
      provider: "google",
      model: "gemini-3.1-flash-lite-preview",
      apiKeyEnvVar: "GOOGLE_API_KEY",
      maxTokens: 16384,
      temperature: 0.2,
    },
  ],

  langfuse: {
    publicKeyEnvVar: "LANGFUSE_PUBLIC_KEY",
    secretKeyEnvVar: "LANGFUSE_SECRET_KEY",
    baseUrl: "https://us.cloud.langfuse.com",
  },
};

export default config;
