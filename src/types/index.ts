export interface LLMConfig {
  api_key: string;
  base_url: string;
  model: string;
  max_tokens: number;
  temperature: number;
}

export interface Entry {
  type: "qa" | "note";
  userInput: string;
  assistantOutput: string | null;
  expanded: boolean;
  status?: NodeStatus;
  errorMessage?: string;
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
