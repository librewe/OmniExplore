export const PRESET_MICRO: PresetChildDef[] = [
  { key: "micro_intuition", icon: "🌳", label: "动态直觉", defaultExpanded: true, autoGenerate: true },
  { key: "micro_definition", icon: "📐", label: "看定义", defaultExpanded: false, autoGenerate: false },
  { key: "micro_application", icon: "🔧", label: "看应用", defaultExpanded: false, autoGenerate: false },
  { key: "micro_motivation", icon: "📜", label: "看动机", defaultExpanded: false, autoGenerate: false },
];

export const PRESET_MACRO: PresetChildDef[] = [
  { key: "macro_territory", icon: "🗺️", label: "核心领地", defaultExpanded: false, autoGenerate: false },
  { key: "macro_logic", icon: "🧱", label: "底层逻辑", defaultExpanded: false, autoGenerate: false },
  { key: "macro_touchpoint", icon: "🏭", label: "现实落点", defaultExpanded: false, autoGenerate: false },
  { key: "macro_evolution", icon: "🕰️", label: "演化路径", defaultExpanded: false, autoGenerate: false },
];

const ALL_PRESETS = [...PRESET_MICRO, ...PRESET_MACRO];
export function getPresetPrefix(presetKey: string): string {
  const def = ALL_PRESETS.find((p) => p.key === presetKey);
  return def ? `${def.icon} ${def.label}\n` : "";
}

export const DEFAULT_INQUIRY_TEMPLATES = [
  "${term}是什么？",
  "${term}为什么重要？",
  "${term}和其他概念有什么关系？",
];

export const DEFAULT_LLM_CONFIG = {
  base_url: "https://api.openai.com/v1",
  model: "gpt-4o",
  max_tokens: 1024,
  temperature: 0.7,
};

export const MAX_FOOTPRINT = 50;
export const MAX_INPUT_HISTORY = 20;
export const STREAMING_TIMEOUT_MS = 30_000;
export const HOVER_PREVIEW_DELAY_MS = 200;

import type { PresetChildDef } from "@/types";
