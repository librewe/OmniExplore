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

function matchFreeTerms(text: string, termList: string[]): ParsedSegment[] {
  if (!termList.length) return [{ type: "text", content: text }];
  const sorted = [...termList].sort((a, b) => b.length - a.length);
  const escaped = sorted.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const regex = new RegExp(`(${escaped.join("|")})`, "gi");
  const mdLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

  const protectedRegions: { start: number; end: number }[] = [];
  for (const m of text.matchAll(mdLinkRegex)) {
    protectedRegions.push({ start: m.index!, end: m.index! + m[0].length });
  }

  function isProtected(idx: number): boolean {
    return protectedRegions.some((r) => idx >= r.start && idx < r.end);
  }

  const segments: ParsedSegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(regex)) {
    if (isProtected(match.index!)) continue;
    if (match.index! > lastIndex) {
      segments.push({ type: "text", content: text.slice(lastIndex, match.index!) });
    }
    segments.push({ type: "term", content: match[0] });
    lastIndex = match.index! + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", content: text.slice(lastIndex) });
  }

  return segments;
}

export function parseWithTermList(text: string, termList: string[]): ParsedSegment[] {
  if (!termList.length) return parseTerms(text);
  const afterBracket = parseTerms(text);
  const result: ParsedSegment[] = [];
  for (const seg of afterBracket) {
    if (seg.type === "term") {
      result.push(seg);
    } else {
      result.push(...matchFreeTerms(seg.content, termList));
    }
  }
  return result;
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
