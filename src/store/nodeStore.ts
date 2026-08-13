import type { Session, Entry, NodeStatus } from "@/types";

export interface NodeState {
  session: Session | null;
  selectedEntry: Entry | null;
  selectedSession: Session | null;
  activeTag: { sessionId: string; title: string };
}

export type NodeAction =
  | { type: "SET_SESSION"; session: Session }
  | { type: "CLEAR_SESSION" }
  | { type: "ADD_ENTRY"; entry: Entry }
  | { type: "REMOVE_ENTRY"; entry: Entry }
  | { type: "UPDATE_ENTRY"; entry: Entry; updates: Partial<Entry> }
  | { type: "TOGGLE_ENTRY_EXPAND"; entry: Entry }
  | { type: "SET_ENTRY_STATUS"; entry: Entry; status: NodeStatus; errorMessage?: string }
  | { type: "APPEND_STREAMING"; entry: Entry; chunk: string }
  | { type: "SET_STREAMING_CONTENT"; entry: Entry; content: string }
  | { type: "SET_SELECTED_ENTRY"; entry: Entry | null }
  | { type: "SET_SELECTED_SESSION"; session: Session | null }
  | { type: "SET_ACTIVE_TAG"; sessionId: string; title: string }
  | { type: "RENAME_SESSION"; title: string }
  | { type: "REPLACE_SESSION"; session: Session };

export function nodeReducer(state: NodeState, action: NodeAction): NodeState {
  switch (action.type) {
    case "SET_SESSION":
      return { ...state, session: action.session, selectedEntry: null };
    case "CLEAR_SESSION":
      return { ...state, session: null, selectedEntry: null, activeTag: { sessionId: "", title: "" } };
    case "ADD_ENTRY":
      if (!state.session) return state;
      return { ...state, session: { ...state.session, entries: [...state.session.entries, action.entry], updated_at: Date.now() } };
    case "REMOVE_ENTRY":
      if (!state.session) return state;
      return { ...state, session: { ...state.session, entries: state.session.entries.filter(e => e !== action.entry), updated_at: Date.now() }, selectedEntry: state.selectedEntry === action.entry ? null : state.selectedEntry };
    case "UPDATE_ENTRY":
      if (!state.session) return state;
      Object.assign(action.entry, action.updates);
      return { ...state, session: { ...state.session, updated_at: Date.now() } };
    case "TOGGLE_ENTRY_EXPAND":
      if (!state.session) return state;
      action.entry.expanded = !action.entry.expanded;
      return { ...state, session: { ...state.session, updated_at: Date.now() } };
    case "SET_ENTRY_STATUS":
      if (!state.session) return state;
      action.entry.status = action.status;
      if (action.errorMessage !== undefined) action.entry.errorMessage = action.errorMessage;
      return { ...state, session: { ...state.session, updated_at: Date.now() } };
    case "APPEND_STREAMING":
      if (!state.session) return state;
      action.entry.assistantOutput = (action.entry.assistantOutput ?? "") + action.chunk;
      return { ...state, session: { ...state.session, updated_at: Date.now() } };
    case "SET_STREAMING_CONTENT":
      if (!state.session) return state;
      action.entry.assistantOutput = action.content;
      return { ...state, session: { ...state.session, updated_at: Date.now() } };
    case "SET_SELECTED_ENTRY":
      return { ...state, selectedEntry: action.entry, selectedSession: null };
    case "SET_SELECTED_SESSION":
      return { ...state, selectedSession: action.session, selectedEntry: null };
    case "SET_ACTIVE_TAG":
      return { ...state, activeTag: { sessionId: action.sessionId, title: action.title } };
    case "RENAME_SESSION":
      if (!state.session) return state;
      return { ...state, session: { ...state.session, title: action.title, updated_at: Date.now() } };
    case "REPLACE_SESSION":
      return { ...state, session: action.session };
    default:
      return state;
  }
}

export function getInitialNodeState(): NodeState {
  return { session: null, selectedEntry: null, selectedSession: null, activeTag: { sessionId: "", title: "" } };
}

export function createSession(title: string, groupId?: string): Session {
  return { id: crypto.randomUUID(), title, entries: [], groupId, created_at: Date.now(), updated_at: Date.now() };
}

export function createEntry(type: "qa" | "note", userInput: string): Entry {
  return { type, userInput, assistantOutput: null, expanded: false, children: [], created_at: Date.now() };
}
