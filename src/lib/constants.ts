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

export const DEFAULT_INQUIRY_SYSTEM_PROMPT = `你是认知解释专家。用户对父概念"\${parentTerm}"中的一个子概念产生疑问。
请用通俗易懂的语言解释，注意在父概念语境下。
遵循以下规则：
1. 结合父概念"\${parentTerm}"的语境，解释"\${childTerm}"在这个上下文中的含义
2. 用日常类比，让外行也能理解
3. 回答控制在 150 字以内`;

export const DEFAULT_SELECTION_TEMPLATES = [
  { id: "sel_default_0", label: "指什么", prompt: "这里的${selected}指什么？" },
  { id: "sel_default_1", label: "和${root}的关系", prompt: "${selected}和${root}有什么关系？" },
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
