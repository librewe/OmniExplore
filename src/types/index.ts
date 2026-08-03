export interface LLMConfig {
  api_key: string;
  base_url: string;
  model: string;
  max_tokens: number;
  temperature: number;
}

export interface CustomQA {
  id: string;
  type: "inquiry" | "reference";
  term: string;
  question: string;
  answer: string;
  parent_node_id: string;
  created_at: number;
}

export interface ConceptNode {
  id: string;
  term: string;
  micro_intuition: string | null;
  micro_definition: string | null;
  micro_application: string | null;
  micro_motivation: string | null;
  macro_territory: string | null;
  macro_logic: string | null;
  macro_touchpoint: string | null;
  macro_evolution: string | null;
  custom_qa: CustomQA[];
  created_at: number;
  updated_at: number;
}

export interface WorkGroup {
  id: string;
  name: string;
  root_term_ids: string[];
  guide_map: GuideMapNode | null;
  created_at: number;
  updated_at: number;
}

export interface GuideMapNode {
  term: string;
  children: GuideMapNode[];
  _group?: boolean;
}

export interface PathNode {
  term: string;
  node_id: string;
  timestamp: number;
}

export interface CognitionPath {
  nodes: PathNode[];
  current_index: number;
}

export type ViewMode = "micro" | "macro";

export type InputMode = "focus" | "inquiry";

export type NodeStatus = "idle" | "loading" | "streaming" | "done" | "error";

export interface PresetChildDef {
  key: string;
  icon: string;
  label: string;
  defaultExpanded: boolean;
  autoGenerate: boolean;
}

export interface ParsedSegment {
  type: "text" | "term";
  content: string;
}

export interface TreeNodeData {
  id: string;
  type: "root" | "preset" | "inquiry" | "reference";
  title: string;
  term: string;
  content: string | null;
  status: NodeStatus;
  errorMessage?: string;
  presetKey?: string;
  expanded: boolean;
  children: TreeNodeData[];
  parentId: string | null;
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
