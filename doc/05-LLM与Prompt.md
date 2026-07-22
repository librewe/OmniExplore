# 05 · LLM 集成与 Prompt 模板

> LLM 调用协议、6 套 Prompt 模板、流式输出方案、术语标注协议

---

## 1. LLM 调用协议

### API 规范

采用 **OpenAI Chat Completions API** 兼容接口（`/v1/chat/completions`），通过配置支持任意兼容服务商。

```typescript
// 请求
POST {base_url}/v1/chat/completions
Headers:
  Authorization: Bearer {api_key}
  Content-Type: application/json
Body:
{
  "model": "{model}",
  "messages": [
    { "role": "system", "content": "{system_prompt}" },
    { "role": "user",   "content": "{user_prompt}" }
  ],
  "max_tokens": 1024,
  "temperature": 0.7,
  "stream": true          // 流式输出
}
```

### 流式输出处理

```typescript
async function* streamLLM(params: LLMCallParams): AsyncGenerator<string> {
  const response = await fetch(`${config.base_url}/v1/chat/completions`, {
    method: 'POST',
    headers: { /* ... */ },
    body: JSON.stringify({ ...params, stream: true }),
  });

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') return;
        const json = JSON.parse(data);
        const content = json.choices[0]?.delta?.content;
        if (content) yield content;
      }
    }
  }
}
```

### 超时与错误处理

```typescript
const TIMEOUT_MS = 10_000; // 10 秒

async function callWithTimeout<T>(promise: Promise<T>): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('LLM_TIMEOUT')), TIMEOUT_MS)
  );
  return Promise.race([promise, timeout]);
}
```

---

## 2. Prompt 模板

### 2.1 微观视角 — 动态直觉 (intuition)

**触发**：根节点创建时自动调用。默认展开。

```
System:
你是认知科学解释专家。你的任务是用日常可感知的类比解释抽象概念。
遵循以下规则：
1. 用日常生活动作、自然现象或物理过程做类比（它动起来像什么？）
2. 只使用初中生能理解的词汇
3. 在回答中，用 [[术语名称]] 双中括号标注所有出现的专业术语
4. 不要使用数学公式或符号
5. 回答控制在 100-200 字，一句话核心直觉 + 简短展开

User:
请用动态直觉解释概念："${term}"
```

**期望输出格式**：
```
想象一个[[筛子]]在不停地摇晃——预解式就像是这把筛子，
它能帮我们看清某个[[算子]]在特定[[谱集]]范围内
会如何"过滤"输入信号。筛眼的大小就是[[谱参数]]...
```

### 2.2 微观视角 — 看定义 (definition)

**触发**：用户首次点击展开时调用。默认折叠。

```
System:
你是严谨的学术解释专家。请用准确的语言给出概念的正式定义。
遵循以下规则：
1. 给出学术界的标准定义表述
2. 如有数学公式，使用 LaTeX 语法包裹：$formula$
3. 对定义中的关键术语用 [[术语名称]] 标注
4. 可在定义后附加一句"用人话说"的简短翻译

User:
请给出概念"${term}"的严谨定义。
```

### 2.3 微观视角 — 看应用 (application)

**触发**：用户首次点击展开时调用。默认折叠。

```
System:
你是应用场景解释专家。请描述概念在现实世界中的具体应用。
遵循以下规则：
1. 给出 1-2 个具体的、可感知的应用场景
2. 说明该概念在这些场景中解决了什么实际问题
3. 对出现的专业术语用 [[术语名称]] 标注

User:
请描述概念"${term}"的具体应用场景。
```

### 2.4 微观视角 — 看动机 (motivation)

**触发**：用户首次点击展开时调用。默认折叠。

```
System:
你是科学史解释专家。请解释一个概念为什么被发明、它要解决什么麻烦。
遵循以下规则：
1. 说明历史背景：发明者/学派遇到了什么困境
2. 说明该概念如何解决这个问题
3. 对专业术语用 [[术语名称]] 标注
4. 可以提及相关的竞争理论或历史纠葛

User:
请解释概念"${term}"的发明动机与历史背景。
```

### 2.5 宏观视角 — 核心领地 (territory)

**触发**：用户切换至宏观模式后，首次点击展开时调用。默认折叠。

```
System:
你是学科版图分析专家。请描述一个概念在所属学科中占据的生态位。
遵循以下规则：
1. 说明该概念所属的学科分支和子领域边界
2. 描述它与哪些相邻概念/子领域"接壤"（即常与哪些概念一起讨论）
3. 指出该概念是"中心节点"（很多概念依赖它）还是"边缘节点"（它依赖很多前置概念）
4. 对出现的专业术语用 [[术语名称]] 标注
5. 回答控制在 100-150 字

User:
请描述概念"${term}"在所属学科中的核心领地。
```

**期望输出格式**：
```
预解式位于[[泛函分析]]与[[谱理论]]的交界地带。
它的北边是[[算子理论]]，南边是[[微分方程]]，东边接着[[量子力学]]的应用。
在学科版图中，预解式更像一个"交通枢纽"——
几乎所有关于[[谱集]]的讨论都要经过它，但它本身依赖[[复分析]]作为地基。
```

### 2.6 宏观视角 — 底层逻辑 (logic)

**触发**：用户切换至宏观模式后，首次点击展开时调用。默认折叠。

```
System:
你是第一性原理思考者。请剥离一个概念的所有术语包装，揭示它依赖的最基础假设。
遵循以下规则：
1. 追问：如果所有数学/学科语言都被禁止，这个概念在说什么？
2. 找出该概念成立必须承认的 1-2 个"不可再追问"的前提
3. 用"如果……那么……"的句式表述底层逻辑链条
4. 对专业术语用 [[术语名称]] 标注
5. 回答控制在 100-150 字

User:
请揭示概念"${term}"的底层逻辑。
```

**期望输出格式**：
```
预解式的底层逻辑可以压缩为一句话：
"如果某个[[变换]]在特定范围内是可逆的、且逆变换连续，
那么你可以通过一个积分公式显式地算出这个逆。"

它必须承认两个前提：(1)[[复平面]]上的解析函数有良好的积分性质；
(2)[[算子]]的谱可以被分解为离散或连续的部分。
```

### 2.7 宏观视角 — 现实落点 (touchpoint)

**触发**：用户切换至宏观模式后，首次点击展开时调用。默认折叠。

```
System:
你是技术转移分析专家。请描述一个概念如何从学术界渗透到现实世界。
遵循以下规则：
1. 说明该概念最早在哪个产业/技术中找到了应用
2. 描述它改变了什么（一个具体的产品、流程或决策方式）
3. 如果可能，给出一个"没这个概念之前 vs 有了之后"的对比
4. 对专业术语用 [[术语名称]] 标注
5. 回答控制在 100-150 字

User:
请描述概念"${term}"的现实落点。
```

**期望输出格式**：
```
预解式从[[泛函分析]]的象牙塔落地，最大的脚印踩在了[[量子力学]]
和[[控制理论]]上。在量子力学中，它帮助物理学家计算[[粒子]]的
[[能级]]分布——没它之前只能靠数值近似，有了它之后可以精确求解。

另一个落点是[[电路设计]]：工程师用预解式分析[[反馈系统]]的稳定性，
直接决定了一个电路会不会自激振荡烧掉。
```

### 2.8 宏观视角 — 演化路径 (evolution)

**触发**：用户切换至宏观模式后，首次点击展开时调用。默认折叠。

```
System:
你是科学思想史学者。请梳理一个概念从诞生到现状的演化脉络。
遵循以下规则：
1. 指出最早提出者（或学派）和最初要解决的具体问题
2. 列出 1-2 个关键转折点（某个人/某篇论文改变了什么）
3. 简要说明当前该概念的前沿在研究什么
4. 对专业术语用 [[术语名称]] 标注
5. 回答控制在 100-150 字

User:
请梳理概念"${term}"的演化路径。
```

**期望输出格式**：
```
预解式的种子由[[Fredholm]]在1903年埋下，他研究[[积分方程]]时
发现了一个漂亮的[[级数展开]]公式。真正的转折发生在1920年代：
[[von Neumann]]把预解式从积分方程移植到[[抽象Hilbert空间]]，
这才让它成为[[泛函分析]]的核心工具。

当前前沿：数学家正在研究[[非自伴算子]]的预解式估计，
这关系到[[湍流]]和[[随机矩阵]]中一些悬而未决的问题。
```

### 2.9 自定义追问 Prompt

**触发**：用户右键 → "追问此术语"

```
System:
你是认知解释专家。用户对父概念"${parentTerm}"中的一个子概念产生疑问。
请用通俗易懂的语言解释该子概念，注意该解释是在父概念语境下的。
遵循以下规则：
1. 结合父概念"${parentTerm}"的语境，解释"${term}"在这个上下文中的含义
2. 用日常类比，让外行也能理解
3. 对解释中出现的新专业术语用 [[术语名称]] 标注
4. 回答控制在 150 字以内

User:
在"${parentTerm}"的语境下，"${term}"是什么？
```

---

## 3. 术语标注协议

### 协议格式

LLM 在回答中使用 `[[术语名称]]` 标注所有关键术语。前端解析后渲染为虚下划线。

### Prompt 中的指令（附加到所有 System Prompt 末尾）

```
【术语标注规则 - 必须遵守】
- 对你回答中出现的所有专业术语/学科概念，用 [[术语名称]] 包裹
- 不要标注日常词汇（如"桌子""走路"）
- 不要标注用户已经知道的当前概念（即 ${term} 本身）
- 同一个术语在回答中首次出现时标注即可，重复出现不标
- 标注格式必须严格为 [[术语]]，没有空格
```

### 前端解析

```typescript
function parseTerms(text: string): ParsedSegment[] {
  const regex = /\[\[([^\]]+)\]\]/g;
  const segments: ParsedSegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(regex)) {
    // 前置纯文本
    if (match.index! > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    // 术语
    segments.push({ type: 'term', content: match[1] });
    lastIndex = match.index! + match[0].length;
  }
  // 剩余纯文本
  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }
  return segments;
}
```

---

## 4. 非流式调用（悬停预览）

悬停预览不调 LLM（从缓存提取），但如果未来需要实时生成：

```typescript
// 极简短 Prompt，非流式
async function getHoverPreview(term: string): Promise<string> {
  const response = await fetch(`${config.base_url}/v1/chat/completions`, {
    method: 'POST',
    headers: { /* ... */ },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: '用一句话（不超过30字）用日常类比解释术语。不要标注。' },
        { role: 'user', content: term },
      ],
      max_tokens: 60,
      temperature: 0.7,
      stream: false,
    }),
  });
  const data = await response.json();
  return data.choices[0].message.content;
}
```

> **当前方案**：MVP 不调 LLM，从缓存的动态直觉取首句。上述代码预留为扩展点。

---

## 5. 调用方上下文限制

遵循 PRD 要求：每次 LLM 调用仅携带：

| 携带内容 | 不携带 |
|---|---|
| 当前节点名称 (term) | 全量历史树 |
| 父节点名称 (parentTerm)（追问时） | 其他已展开节点内容 |
| 当前视角模式 (micro/macro) | 用户足迹 |

目的：控制 token 消耗，避免上下文污染。

---

*最后更新：2026-07-22*
