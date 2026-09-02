export interface LLMConfig {
  api_key: string;
  base_url: string;
  model: string;
  /** 是否请求模型思考过程（reasoning）。默认 true；请求体按模型格式附带 thinking 触发参数 */
  enableThinking?: boolean;
}

/**
 * Node = 主题（顶层容器）。Node 下可容纳多个根 Session，每个根 Session 再展开 entries/子 Session。
 * Node 是侧栏/导图/术语标注/PDF 绑定的基本单位；Node 标题即"概念/主题"。
 */
export interface Node {
  id: string;
  title: string;
  /** 根 Session 列表（平级，无 parentSessionId）。 */
  sessions: Session[];
  /** 所属工作组 ID。 */
  groupId?: string;
  created_at: number;
  updated_at: number;
}

export interface Entry {
  /**
   * qa = 问答对；note = 用户笔记；summary = 段摘要（段闭合时生成、置于段尾，不进入上下文传递）。
   */
  type: "qa" | "note" | "summary";
  userInput: string;
  assistantOutput: string | null;
  /** 模型思考过程（仅 qa 使用；DeepSeek reasoning_content / OpenAI reasoning 流式累积） */
  reasoning?: string;
  expanded: boolean;
  status?: NodeStatus;
  errorMessage?: string;
  /** summary 生成生命周期状态（仅 summary 使用；idle/loading/streaming/done/error） */
  summaryStatus?: NodeStatus;
  /** 用户手动编辑过摘要时为 true，AI 重新生成不得覆盖（仅 summary 使用） */
  summaryEdited?: boolean;
  children: Session[];
  created_at: number;
}

export interface Session {
  id: string;
  title: string;
  entries: Entry[];
  /** 所属工作组 ID。仅根 Session 有意义；子 Session 通过嵌套继承归属。 */
  groupId?: string;
  /** 反向引用：子 Session → 父 Session（fork 自父 Session 的某个 entry）。Entry 无独立 ID，fork 点 entry 通过 findIndex 在父 Session.entries 中定位。 */
  parentSessionId?: string;
  forkBoundary?: string;
  created_at: number;
  updated_at: number;
}

export interface WorkGroup {
  id: string;
  name: string;
  guide_map: GuideMapNode | null;
  created_at: number;
  updated_at: number;
}

export interface GuideMapNode {
  term: string;
  children: GuideMapNode[];
  _group?: boolean;
  /** 绑定的主题 Node ID（仅叶子节点；分组/虚拟根/导图自由节点无此字段）。用于精确查找"当前节点在导图中的位置"，消除同名 term 歧义 */
  nodeId?: string;
}

export type NodeStatus = "idle" | "loading" | "streaming" | "done" | "error";

export interface ParsedSegment {
  type: "text" | "term";
  content: string;
}

export interface PlusMenuItem {
  id: string;
  label: string;
  prompt: string;
}

export interface StoredFile {
  id: string;
  name: string;
  size: number;
  type: string;
  data: string;
  created_at: number;
}
