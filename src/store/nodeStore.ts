import type { Node, Session, Entry, NodeStatus } from "@/types";

export interface NodeState {
  /** 当前聚焦的主题 Node */
  node: Node | null;
  selectedEntry: Entry | null;
  selectedSession: Session | null;
  activeTag: { sessionId: string; title: string };
}

export type NodeAction =
  | { type: "SET_NODE"; node: Node }
  | { type: "CLEAR_NODE" }
  | { type: "SET_ENTRY_STATUS"; entry: Entry; status: NodeStatus; errorMessage?: string }
  | { type: "SET_STREAMING_CONTENT"; entry: Entry; content: string }
  | { type: "SET_ENTRY_SUMMARY"; entry: Entry; content: string }
  | { type: "SET_ENTRY_SUMMARY_STATUS"; entry: Entry; status: NodeStatus; errorMessage?: string }
  | { type: "SET_SELECTED_ENTRY"; entry: Entry | null }
  | { type: "SET_SELECTED_SESSION"; session: Session | null }
  | { type: "SET_ACTIVE_TAG"; sessionId: string; title: string }
  | { type: "RENAME_NODE"; title: string }
  | { type: "REPLACE_NODE"; node: Node };

export function nodeReducer(state: NodeState, action: NodeAction): NodeState {
  switch (action.type) {
    case "SET_NODE":
      return { ...state, node: action.node, selectedEntry: null };
    case "CLEAR_NODE":
      return { ...state, node: null, selectedEntry: null, selectedSession: null, activeTag: { sessionId: "", title: "" } };
    case "SET_ENTRY_STATUS":
      if (!state.node) return state;
      action.entry.status = action.status;
      if (action.errorMessage !== undefined) action.entry.errorMessage = action.errorMessage;
      return { ...state };
    case "SET_STREAMING_CONTENT":
      if (!state.node) return state;
      action.entry.assistantOutput = action.content;
      return { ...state };
    case "SET_ENTRY_SUMMARY":
      if (!state.node) return state;
      action.entry.userInput = action.content;
      return { ...state };
    case "SET_ENTRY_SUMMARY_STATUS":
      if (!state.node) return state;
      action.entry.summaryStatus = action.status;
      if (action.errorMessage !== undefined) action.entry.errorMessage = action.errorMessage;
      return { ...state };
    case "SET_SELECTED_ENTRY":
      return { ...state, selectedEntry: action.entry };
    case "SET_SELECTED_SESSION":
      return { ...state, selectedSession: action.session };
    case "SET_ACTIVE_TAG":
      return { ...state, activeTag: { sessionId: action.sessionId, title: action.title } };
    case "RENAME_NODE":
      if (!state.node) return state;
      state.node.title = action.title;
      state.node.updated_at = Date.now();
      return { ...state };
    case "REPLACE_NODE":
      return { ...state, node: action.node };
    default:
      return state;
  }
}

export function getInitialNodeState(): NodeState {
  return { node: null, selectedEntry: null, selectedSession: null, activeTag: { sessionId: "", title: "" } };
}

export function createNode(title: string, groupId?: string): Node {
  return { id: crypto.randomUUID(), title, sessions: [], groupId, created_at: Date.now(), updated_at: Date.now() };
}

export function createSession(title: string, groupId?: string): Session {
  return { id: crypto.randomUUID(), title, entries: [], groupId, created_at: Date.now(), updated_at: Date.now() };
}

export function createEntry(type: "qa" | "note" | "summary", userInput: string): Entry {
  return { type, userInput, assistantOutput: null, expanded: false, children: [], created_at: Date.now() };
}
