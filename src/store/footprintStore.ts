import type { CognitionPath, PathNode } from "@/types";
import { MAX_FOOTPRINT } from "@/lib/constants";

export type FootprintAction =
  | { type: "APPEND"; term: string; nodeId: string }
  | { type: "NAVIGATE"; index: number }
  | { type: "CLEAR" };

const initialState: CognitionPath = {
  nodes: [],
  current_index: -1,
};

export function footprintReducer(
  state: CognitionPath,
  action: FootprintAction
): CognitionPath {
  switch (action.type) {
    case "APPEND": {
      const newNode: PathNode = {
        term: action.term,
        node_id: action.nodeId,
        timestamp: Date.now(),
      };
      let nodes = [...state.nodes, newNode];
      if (nodes.length > MAX_FOOTPRINT) {
        nodes = nodes.slice(nodes.length - MAX_FOOTPRINT);
      }
      return { nodes, current_index: nodes.length - 1 };
    }

    case "NAVIGATE": {
      if (action.index < 0 || action.index >= state.nodes.length) return state;
      return {
        nodes: state.nodes.slice(0, action.index + 1),
        current_index: action.index,
      };
    }

    case "CLEAR":
      return initialState;

    default:
      return state;
  }
}

export { initialState };
