import type { TreeNodeData, ViewMode, NodeStatus, PresetChildDef } from "@/types";
import { PRESET_MICRO, PRESET_MACRO } from "@/lib/constants";

export interface TreeState {
  rootNode: TreeNodeData | null;
  rootTerm: string;
  viewMode: ViewMode;
  selectedNodeId: string | null;
  activeTag: { parentId: string; title: string };
}

export type TreeAction =
  | { type: "SET_ROOT"; rootNode: TreeNodeData }
  | { type: "CLEAR_ROOT" }
  | { type: "TOGGLE_EXPAND"; nodeId: string }
  | { type: "EXPAND_NODE"; nodeId: string }
  | { type: "SET_NODE_STATUS"; nodeId: string; status: NodeStatus; errorMessage?: string }
  | { type: "SET_NODE_CONTENT"; nodeId: string; content: string }
  | { type: "SET_NODE_TITLE"; nodeId: string; title: string }
  | { type: "ADD_CHILD"; parentId: string; child: TreeNodeData }
  | { type: "REMOVE_NODE"; nodeId: string }
  | { type: "SET_VIEW_MODE"; mode: ViewMode }
  | { type: "SET_SELECTED"; nodeId: string | null }
  | { type: "SET_ACTIVE_TAG"; parentId: string; title: string }
  | { type: "REPLACE_NODE"; nodeId: string; node: TreeNodeData }
  | { type: "APPEND_STREAMING"; nodeId: string; chunk: string }
  | { type: "REORDER_CHILDREN"; parentId: string; childIds: string[] };

function findNode(root: TreeNodeData, nodeId: string): TreeNodeData | null {
  if (root.id === nodeId) return root;
  for (const child of root.children) {
    const found = findNode(child, nodeId);
    if (found) return found;
  }
  return null;
}

function updateNode(root: TreeNodeData, nodeId: string, updater: (node: TreeNodeData) => TreeNodeData): TreeNodeData {
  if (root.id === nodeId) return updater({ ...root });
  return {
    ...root,
    children: root.children.map((child) => updateNode(child, nodeId, updater)),
  };
}

function removeNodeFromTree(root: TreeNodeData, nodeId: string): TreeNodeData | null {
  if (root.id === nodeId) return null;
  const newChildren = root.children
    .map((child) => removeNodeFromTree(child, nodeId))
    .filter((c): c is TreeNodeData => c !== null);
  return { ...root, children: newChildren };
}

function getPresetsForMode(mode: ViewMode): PresetChildDef[] {
  return mode === "micro" ? PRESET_MICRO : PRESET_MACRO;
}

function buildPresetChildren(term: string, mode: ViewMode): TreeNodeData[] {
  return getPresetsForMode(mode).map((def) => ({
    id: `preset:${def.key}`,
    type: "preset" as const,
    title: `${def.icon} ${def.label}`,
    term,
    content: null,
    status: "idle" as NodeStatus,
    expanded: false,
    children: [],
    parentId: "root",
  }));
}

export function buildRootNode(term: string, mode: ViewMode): TreeNodeData {
  return {
    id: "root",
    type: "root",
    title: term,
    term,
    content: null,
    status: "done",
    expanded: true,
    children: buildPresetChildren(term, mode),
    parentId: null,
  };
}

export function rebuildPresetChildren(root: TreeNodeData, mode: ViewMode): TreeNodeData {
  const newPresets = getPresetsForMode(mode);
  const existingInquiryRefs = root.children.filter((c) => c.type === "inquiry" || c.type === "reference");
  const oldPresets = root.children.filter((c) => c.type === "preset");

  const newChildren = newPresets.map((def, i) => {
    const existing = root.children.find((c) => c.type === "preset" && c.presetKey === def.key);
    if (existing) return existing;
    const samePosOld = oldPresets[i];
    return {
      id: `preset:${def.key}`,
      type: "preset" as const,
      title: def.label,
      term: root.term,
      content: null,
      status: "idle" as NodeStatus,
      presetKey: def.key,
      expanded: samePosOld?.expanded ?? def.defaultExpanded,
      children: [],
      parentId: root.id,
    };
  });

  return { ...root, children: [...newChildren, ...existingInquiryRefs] };
}

export function treeReducer(state: TreeState, action: TreeAction): TreeState {
  switch (action.type) {
    case "SET_ROOT":
      return { ...state, rootNode: action.rootNode, rootTerm: action.rootNode.term, selectedNodeId: null };

    case "CLEAR_ROOT":
      return { ...state, rootNode: null, rootTerm: "", selectedNodeId: null };

    case "TOGGLE_EXPAND":
      if (!state.rootNode) return state;
      return {
        ...state,
        rootNode: updateNode(state.rootNode, action.nodeId, (node) => ({
          ...node,
          expanded: !node.expanded,
        })),
      };

    case "EXPAND_NODE":
      if (!state.rootNode) return state;
      return {
        ...state,
        rootNode: updateNode(state.rootNode, action.nodeId, (node) => ({
          ...node,
          expanded: true,
        })),
      };

    case "SET_NODE_STATUS":
      if (!state.rootNode) return state;
      return {
        ...state,
        rootNode: updateNode(state.rootNode, action.nodeId, (node) => ({
          ...node,
          status: action.status,
          errorMessage: action.errorMessage,
        })),
      };

    case "SET_NODE_CONTENT":
      if (!state.rootNode) return state;
      return {
        ...state,
        rootNode: updateNode(state.rootNode, action.nodeId, (node) => ({
          ...node,
          content: action.content,
          title: node.type === "inquiry" ? node.title : node.title,
        })),
      };

    case "SET_NODE_TITLE":
      if (!state.rootNode) return state;
      const isRoot = action.nodeId === "root";
      return {
        ...state,
        rootNode: updateNode(state.rootNode, action.nodeId, (node) => ({
          ...node,
          title: action.title,
          ...(isRoot ? { term: action.title } : {}),
        })),
        ...(isRoot ? { rootTerm: action.title } : {}),
      };

    case "ADD_CHILD":
      if (!state.rootNode) return state;
      return {
        ...state,
        rootNode: updateNode(state.rootNode, action.parentId, (node) => ({
          ...node,
          children: [...node.children, { ...action.child, parentId: action.parentId }],
          expanded: true,
        })),
      };

    case "REORDER_CHILDREN":
      if (!state.rootNode) return state;
      return {
        ...state,
        rootNode: updateNode(state.rootNode, action.parentId, (node) => {
          const byId = new Map(node.children.map((c) => [c.id, c]));
          const ordered = action.childIds.map((id) => byId.get(id)!).filter(Boolean);
          const remaining = node.children.filter((c) => !action.childIds.includes(c.id));
          return { ...node, children: [...ordered, ...remaining] };
        }),
      };

    case "REMOVE_NODE":
      if (!state.rootNode) return state;
      return {
        ...state,
        rootNode: removeNodeFromTree(state.rootNode, action.nodeId),
        selectedNodeId: state.selectedNodeId === action.nodeId ? null : state.selectedNodeId,
      };

    case "SET_VIEW_MODE": {
      if (!state.rootNode) return { ...state, viewMode: action.mode };
      const rebuilt = rebuildPresetChildren(state.rootNode, action.mode);
      return { ...state, rootNode: rebuilt, viewMode: action.mode };
    }

    case "SET_SELECTED":
      return { ...state, selectedNodeId: action.nodeId };

    case "SET_ACTIVE_TAG":
      return { ...state, activeTag: { parentId: action.parentId, title: action.title } };

    case "REPLACE_NODE":
      if (!state.rootNode) return state;
      return {
        ...state,
        rootNode: updateNode(state.rootNode, action.nodeId, () => action.node),
      };

    case "APPEND_STREAMING":
      if (!state.rootNode) return state;
      return {
        ...state,
        rootNode: updateNode(state.rootNode, action.nodeId, (node) => ({
          ...node,
          content: (node.content ?? "") + action.chunk,
        })),
      };

    default:
      return state;
  }
}

export function getInitialTreeState(): TreeState {
  return {
    rootNode: null,
    rootTerm: "",
    viewMode: "micro",
    selectedNodeId: null,
    activeTag: { parentId: "", title: "" },
  };
}
