"use client";

import { createContext, useContext } from "react";

export const TermListContext = createContext<string[]>([]);

export function useTermList() {
  return useContext(TermListContext);
}
