export const DEFAULT_PLUS_TEMPLATES: { label: string; prompt: string }[] = [
  { label: "精简概括一点", prompt: "精简概括一下${term}的核心要点" },
  { label: "介绍更多", prompt: "关于${term}，再展开介绍一下" },
];

export const DEFAULT_INQUIRY_SYSTEM_PROMPT = `你是认知解释专家。用户对父概念"\${parentTerm}"中的一个子概念产生疑问。
请用通俗易懂的语言解释，注意在父概念语境下。
遵循以下规则：
1. 结合父概念"\${parentTerm}"的语境，解释"\${childTerm}"在这个上下文中的含义
2. 用日常类比，让外行也能理解
3. 回答控制在 150 字以内`;

export const DEFAULT_SELECTION_TEMPLATES = [
  { id: "sel_default_intro", label: "简单介绍", prompt: "简单介绍${selected}" },
  { id: "sel_default_0", label: "指什么", prompt: "这里的${selected}指什么？" },
  { id: "sel_default_why", label: "为什么", prompt: "为什么${selected}？" },
];

export const DEFAULT_LLM_CONFIG = {
  base_url: "https://api.openai.com/v1",
  model: "gpt-4o",
  max_tokens: 1024,
  temperature: 0.7,
};

export const STREAMING_TIMEOUT_MS = 30_000;
export const HOVER_PREVIEW_DELAY_MS = 200;
