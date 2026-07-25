const TERM_ANNOTATION_RULE = `
【术语标注规则 - 必须遵守】
- 对你回答中出现的所有专业术语/学科概念，用 [[术语名称]] 包裹
- 不要标注日常词汇
- 不要标注用户已提问的当前概念本身
- 同一个术语在回答中首次出现时标注即可，重复出现不标
- 标注格式必须严格为 [[术语]]，没有空格
`;

export function intuitionPrompt(term: string): { system: string; user: string } {
  return {
    system: `你是认知科学解释专家。你的任务是用日常可感知的类比解释抽象概念。
遵循以下规则：
1. 用日常生活动作、自然现象或物理过程做类比
2. 只使用初中生能理解的词汇
3. 不要使用数学公式或符号
4. 回答控制在 100-200 字，一句话核心直觉 + 简短展开
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
    system: `你是应用场景解释专家。请描述概念在现实世界中的具体应用。
遵循以下规则：
1. 给出 1-2 个具体的、可感知的应用场景
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
${TERM_ANNOTATION_RULE}`,
    user: `请解释概念"${term}"的发明动机与历史背景。`,
  };
}

export function territoryPrompt(term: string): { system: string; user: string } {
  return {
    system: `你是学科版图分析专家。请描述一个概念在所属学科中占据的生态位。
遵循以下规则：
1. 说明该概念所属的学科分支和子领域边界
2. 描述它与哪些相邻概念/子领域"接壤"
3. 指出该概念是"中心节点"还是"边缘节点"
4. 回答控制在 100-150 字
${TERM_ANNOTATION_RULE}`,
    user: `请描述概念"${term}"在所属学科中的核心领地。`,
  };
}

export function logicPrompt(term: string): { system: string; user: string } {
  return {
    system: `你是第一性原理思考者。请剥离一个概念的所有术语包装，揭示它依赖的最基础假设。
遵循以下规则：
1. 追问：如果所有数学/学科语言都被禁止，这个概念在说什么？
2. 找出该概念成立必须承认的 1-2 个"不可再追问"的前提
3. 用"如果……那么……"的句式表述底层逻辑链条
4. 回答控制在 100-150 字
${TERM_ANNOTATION_RULE}`,
    user: `请揭示概念"${term}"的底层逻辑。`,
  };
}

export function touchpointPrompt(term: string): { system: string; user: string } {
  return {
    system: `你是技术转移分析专家。请描述一个概念如何从学术界渗透到现实世界。
遵循以下规则：
1. 说明该概念最早在哪个产业/技术中找到了应用
2. 描述它改变了什么（一个具体的产品、流程或决策方式）
3. 如果可能，给出一个"没这个概念之前 vs 有了之后"的对比
4. 回答控制在 100-150 字
${TERM_ANNOTATION_RULE}`,
    user: `请描述概念"${term}"的现实落点。`,
  };
}

export function evolutionPrompt(term: string): { system: string; user: string } {
  return {
    system: `你是科学思想史学者。请梳理一个概念从诞生到现状的演化脉络。
遵循以下规则：
1. 指出最早提出者（或学派）和最初要解决的具体问题
2. 列出 1-2 个关键转折点
3. 简要说明当前该概念的前沿在研究什么
4. 回答控制在 100-150 字
${TERM_ANNOTATION_RULE}`,
    user: `请梳理概念"${term}"的演化路径。`,
  };
}

export function inquiryPrompt(
  parentTerm: string,
  childTerm: string,
  question: string
): { system: string; user: string } {
  return {
    system: `你是认知解释专家。用户对父概念"${parentTerm}"中的一个子概念产生疑问。
请用通俗易懂的语言解释，注意在父概念语境下。
遵循以下规则：
1. 结合父概念"${parentTerm}"的语境，解释"${childTerm}"在这个上下文中的含义
2. 用日常类比，让外行也能理解
3. 回答控制在 150 字以内
${TERM_ANNOTATION_RULE}`,
    user: `在"${parentTerm}"的语境下，${question}`,
  };
}

export function guideMapGenPrompt(term: string): { system: string; user: string } {
  return {
    system: `你是学科体系构建专家。请为一个概念构建教材目录式的知识坐标。
输出严格 JSON 树结构，每层 3-8 个子节点。
遵循以下规则：
1. 从学科顶层逐步细化到该概念所在的子领域
2. 包含同级相关概念（兄弟节点）
3. 层级不超过 4 层
仅返回 JSON，不要其他文字。格式：{"term":"...", "children":[...]}`,
    user: `请为概念"${term}"构建知识坐标。`,
  };
}

const PROMPT_FNS: Record<string, (term: string) => { system: string; user: string }> = {
  micro_intuition: intuitionPrompt,
  micro_definition: definitionPrompt,
  micro_application: applicationPrompt,
  micro_motivation: motivationPrompt,
  macro_territory: territoryPrompt,
  macro_logic: logicPrompt,
  macro_touchpoint: touchpointPrompt,
  macro_evolution: evolutionPrompt,
};

export function getPresetPrompt(
  presetKey: string,
  term: string
): { system: string; user: string } | null {
  const custom = loadCustomPresetPrompts()[presetKey];
  if (custom) {
    return {
      system: custom.system,
      user: custom.user.replace(/\$\{term\}/g, term),
    };
  }
  const fn = PROMPT_FNS[presetKey];
  return fn ? fn(term) : null;
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
