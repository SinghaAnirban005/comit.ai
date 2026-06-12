import Conf from "conf";

export interface GitWiseConfig {
  groqApiKey?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  autoCommit?: boolean;
}

const DEFAULT_CONFIG: Partial<GitWiseConfig> = {
  model: "llama-3.3-70b-versatile",
  maxTokens: 256,
  temperature: 0.4,
  autoCommit: false,
};

const store = new Conf<GitWiseConfig>({
  projectName: "comit.ai",
  defaults: DEFAULT_CONFIG as GitWiseConfig,
  schema: {
    groqApiKey: {
      type: "string",
    },
    model: {
      type: "string",
      default: DEFAULT_CONFIG.model,
    },
    maxTokens: {
      type: "number",
      default: DEFAULT_CONFIG.maxTokens,
    },
    temperature: {
      type: "number",
      minimum: 0,
      maximum: 2,
      default: DEFAULT_CONFIG.temperature,
    },
    autoCommit: {
      type: "boolean",
      default: DEFAULT_CONFIG.autoCommit,
    },
  },
});

export function getApiKey(): string | undefined {
  if (process.env["GROQ_API_KEY"]) {
    return process.env["GROQ_API_KEY"];
  }
  return store.get("groqApiKey");
}

export function saveApiKey(apiKey: string): void {
  store.set("groqApiKey", apiKey.trim());
}

export function getConfig(): Required<GitWiseConfig> {
  return {
    groqApiKey: getApiKey() ?? "",
    model: store.get("model") ?? (DEFAULT_CONFIG.model as string),
    maxTokens: store.get("maxTokens") ?? (DEFAULT_CONFIG.maxTokens as number),
    temperature:
      store.get("temperature") ?? (DEFAULT_CONFIG.temperature as number),
    autoCommit:
      store.get("autoCommit") ?? (DEFAULT_CONFIG.autoCommit as boolean),
  };
}

export function saveConfig(partial: Partial<GitWiseConfig>): void {
  for (const [key, value] of Object.entries(partial)) {
    if (value !== undefined) {
      store.set(key as keyof GitWiseConfig, value);
    }
  }
}

export function resetConfig(includeApiKey = false): void {
  if (includeApiKey) {
    store.clear();
  } else {
    const apiKey = store.get("groqApiKey");
    store.clear();
    if (apiKey) store.set("groqApiKey", apiKey);
  }
  saveConfig(DEFAULT_CONFIG);
}

export function getConfigPath(): string {
  return store.path;
}

export function clearApiKey(): void {
  store.delete("groqApiKey");
}

export function getDisplayConfig(): Record<string, string> {
  const config = getConfig();
  const apiKey = config.groqApiKey;
  const maskedKey = apiKey
    ? `${apiKey.slice(0, 6)}${"*".repeat(Math.max(0, apiKey.length - 10))}${apiKey.slice(-4)}`
    : "(not set)";

  return {
    "API Key": maskedKey,
    Model: config.model,
    "Max Tokens": String(config.maxTokens),
    Temperature: String(config.temperature),
    "Auto Commit": String(config.autoCommit),
    "Config File": getConfigPath(),
  };
}
