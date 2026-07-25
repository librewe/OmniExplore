import type { ParsedSegment } from "@/types";

export function parseTerms(text: string): ParsedSegment[] {
  const regex = /\[\[([^\]]+)\]\]/g;
  const segments: ParsedSegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(regex)) {
    if (match.index! > lastIndex) {
      segments.push({ type: "text", content: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: "term", content: match[1] });
    lastIndex = match.index! + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", content: text.slice(lastIndex) });
  }

  return segments;
}

export function annotateTerms(text: string, termList: string[]): string {
  if (!termList.length) return text;

  const sorted = [...termList].sort((a, b) => b.length - a.length);
  let result = text;

  for (const term of sorted) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(?<!\\[\\[)${escaped}(?!\\]\\])`, "gi");
    result = result.replace(regex, `[[${term}]]`);
  }

  return result;
}
