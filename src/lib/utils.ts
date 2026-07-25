import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + "...";
}

export function extractTitle(content: string): string {
  const firstLine = content.trim().split("\n")[0] || "";
  return truncate(firstLine, 15) || "未命名";
}

export function ensureError(value: unknown): Error {
  if (value instanceof Error) return value;
  return new Error(String(value));
}
