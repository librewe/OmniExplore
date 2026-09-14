const TERM_ANNOTATION_RULE = `
【术语标注规则 - 必须遵守】
- 对你回答中出现的所有专业术语/学科概念，用 [[术语名称]] 包裹
- 不要标注日常词汇
- 不要标注用户已提问的当前概念本身
- 同一个术语在回答中首次出现时标注即可，重复出现不标
- 标注格式必须严格为 [[术语]]，没有空格
`;

export const DEFAULT_SYSTEM_PROMPT = "你是一个有帮助的人工智能助手。";

export function defaultPrompt(node: string): { system: string; user: string } {
  return {
    system: DEFAULT_SYSTEM_PROMPT,
    user: `简单介绍${node}`,
  };
}

export function intuitionPrompt(term: string): { system: string; user: string } {
  return {
    system: `你是认知科学解释专家。你的任务是用日常可感知的类比解释抽象概念。
遵循以下规则：
1. 用日常生活动作、自然现象或物理过程做类比，但必须准确清晰
2. 在保证精确的情况下，尽量只使用非相关专业大学生能理解的词汇
3. 先不要使用数学公式或符号，如有必要，使用最少
4. 回答控制在 100-200 字，核心直觉 + 简短展开
5. 如果语义不明或疑似输入有问题无法解释，请向用户表达
${TERM_ANNOTATION_RULE}`,
    user: `请用动态直觉解释概念："${term}"`,
  };
}

export function definitionPrompt(term: string): { system: string; user: string } {
  return {
    system: `你是严谨的学术解释专家。请用准确的语言给出概念的正式定义。
遵循以下规则：
1. 给出学术界的标准定义表述
2. 如有数学公式，使用 LaTeX 语法包裹：$formula$
3. 对定义中的关键术语用 [[术语名称]] 标注
4. 可在定义后附加一句"用人话说"的简短翻译
${TERM_ANNOTATION_RULE}`,
    user: `请给出概念"${term}"的严谨定义。`,
  };
}

export function applicationPrompt(term: string): { system: string; user: string } {
  return {
    system: `你是应用场景解释专家。请描述概念的具体下游应用，例如作为计算工具或者其他。
遵循以下规则：
1. 给出所给概念的具体的、可感知的应用场景
2. 说明该概念在这些场景中解决了什么实际问题
${TERM_ANNOTATION_RULE}`,
    user: `请描述概念"${term}"的具体应用场景。`,
  };
}

export function motivationPrompt(term: string): { system: string; user: string } {
  return {
    system: `你是科学史解释专家。请解释一个概念为什么被发明、它要解决什么麻烦。
遵循以下规则：
1. 说明历史背景：发明者/学派遇到了什么困境
2. 说明该概念如何解决这个问题
3. 可以提及相关的竞争理论或历史纠葛
4. 保持回答精简，不要过于冗长
${TERM_ANNOTATION_RULE}`,
    user: `请解释概念"${term}"的发明动机与历史背景。`,
  };
}

/**
 * 段摘要的总结指令。
 * 作为消息数组的**最后一条 user 消息**追加在对话内容之后（而非 system），
 * 使 system + 对话前序与同会话的普通问答请求前缀一致，可命中上下文缓存；
 * 目标段由指令中引用的起点文本锚定，语言跟随对话内容，不预设场景。
 */
export function summaryPrompt(anchor?: string): string {
  return anchor
    ? `请总结自「${anchor}」一处起至此的对话片段内容（30-80字），用于目录导航。直接输出摘要正文。`
    : `请总结全部对话内容（30-80字），用于目录导航。直接输出摘要正文。`;
}

export function loadInquirySystemPrompt(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem("inquiry_system_prompt");
  } catch { return null; }
}

export function saveInquirySystemPrompt(prompt: string) {
  localStorage.setItem("inquiry_system_prompt", prompt);
}

interface PresetPromptOverride {
  system: string;
  user: string;
}

export function loadCustomPresetPrompts(): Record<string, PresetPromptOverride> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem("preset_prompts");
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export function saveCustomPresetPrompts(data: Record<string, PresetPromptOverride>) {
  localStorage.setItem("preset_prompts", JSON.stringify(data));
}
