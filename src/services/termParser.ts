export const TERM_EXPLICIT_START = "\uE000";
export const TERM_EXPLICIT_END = "\uE001";
export const TERM_FREE_START = "\uE002";
export const TERM_FREE_END = "\uE003";

const EXPLICIT_RE = /\[\[([^\]]+)\]\]/g;

export function encodeTerms(text: string): string {
  return text.replace(EXPLICIT_RE, (_m, term: string) => `${TERM_EXPLICIT_START}${term}${TERM_EXPLICIT_END}`);
}

function encodeFreeTerms(text: string, termList: string[]): string {
  if (!termList.length) return text;
  const sorted = [...termList].sort((a, b) => b.length - a.length);
  const escaped = sorted.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const regex = new RegExp(`(${escaped.join("|")})`, "gi");
  const mdLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

  const protectedRegions: { start: number; end: number }[] = [];
  for (const m of text.matchAll(mdLinkRegex)) {
    protectedRegions.push({ start: m.index!, end: m.index! + m[0].length });
  }
  // 数学公式（$...$ / $$...$$ / \(...\) / \[...\]）与代码（`code` / ```fence```）内部不做术语匹配——
  // 否则注入的私有区占位符会破坏 KaTeX 解析或代码原文；\(...\)/\[...\] 为 LaTeX 标准定界，
  // 渲染前由 MarkdownRenderer.normalizeMathDelimiters 归一化，注入阶段必须先保护
  for (const m of text.matchAll(/\$\$[^]*?\$\$|\$[^$\n]+\$|\\\([^]*?\\\)|\\\[[^]*?\\\]|```[^]*?```|`[^`\n]+`/g)) {
    protectedRegions.push({ start: m.index!, end: m.index! + m[0].length });
  }

  function isProtected(idx: number): boolean {
    return protectedRegions.some((r) => idx >= r.start && idx < r.end);
  }

  let out = "";
  let lastIndex = 0;
  for (const match of text.matchAll(regex)) {
    if (isProtected(match.index!)) continue;
    out += text.slice(lastIndex, match.index);
    out += `${TERM_FREE_START}${match[0]}${TERM_FREE_END}`;
    lastIndex = match.index! + match[0].length;
  }
  out += text.slice(lastIndex);
  return out;
}

export function encodeWithTermList(text: string, termList: string[]): string {
  if (!termList.length) return encodeTerms(text);
  let result = "";
  let lastIndex = 0;
  for (const m of text.matchAll(EXPLICIT_RE)) {
    result += encodeFreeTerms(text.slice(lastIndex, m.index!), termList);
    result += `${TERM_EXPLICIT_START}${m[1]}${TERM_EXPLICIT_END}`;
    lastIndex = m.index! + m[0].length;
  }
  result += encodeFreeTerms(text.slice(lastIndex), termList);
  return result;
}
