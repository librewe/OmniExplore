import { create } from "zustand";
import type { LLMConfig } from "@/types";
import { DEFAULT_LLM_CONFIG } from "@/lib/constants";

interface ConfigState {
  config: LLMConfig | null;
  isConfigured: boolean;
  setConfig: (config: LLMConfig) => void;
  clearConfig: () => void;
  getOrCreateConfig: () => LLMConfig;
}

function loadConfig(): LLMConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("llm_config");
    if (raw) return JSON.parse(raw);
  } catch {
    // corrupted data
  }
  return null;
}

function saveConfig(config: LLMConfig) {
  localStorage.setItem("llm_config", JSON.stringify(config));
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  config: null,
  isConfigured: false,

  setConfig: (config) => {
    saveConfig(config);
    set({ config, isConfigured: true });
  },

  clearConfig: () => {
    localStorage.removeItem("llm_config");
    set({ config: null, isConfigured: false });
  },

  getOrCreateConfig: () => {
    const existing = get().config ?? loadConfig();
    if (existing) return existing;
    return { ...DEFAULT_LLM_CONFIG, api_key: "" };
  },
}));

export function initializeConfig() {
  const saved = loadConfig();
  if (saved) {
    useConfigStore.setState({ config: saved, isConfigured: true });
  }
}
