"use client";

import { createContext, useContext } from "react";

export const NodeListContext = createContext<string[]>([]);

export function useNodeList() {
  return useContext(NodeListContext);
}
