import type { Entry, Node, Session } from "@/types";

/**
 * 段几何逻辑（纯函数）。段 = 同一 Session.entries 中，上一个 fork 点（不含）
 * 到当前 fork entry（含）的连续区间；fork entry 即 children.length > 0 的 Entry；
 * 闭合段的 summary 紧跟在其 fork entry 之后（同一 session，下一索引）。
 */

export function isForkEntry(e: Entry): boolean {
  return e.children.length > 0;
}

export interface SegmentRange {
  start: number;
  end: number;
}

export function segmentRange(session: Session, forkEntry: Entry): SegmentRange | null {
  const end = session.entries.indexOf(forkEntry);
  if (end === -1) return null;

  let start = 0;
  for (let i = end - 1; i >= 0; i--) {
    if (isForkEntry(session.entries[i])) {
      start = i + 1;
      break;
    }
  }
  return { start, end };
}

export function findSummaryEntry(session: Session, afterIndex: number): Entry | null {
  for (let i = afterIndex + 1; i < session.entries.length; i++) {
    if (session.entries[i].type === "summary") return session.entries[i];
  }
  return null;
}

export function findLastSummaryFor(session: Session, forkEntry: Entry): Entry | null {
  const idx = session.entries.indexOf(forkEntry);
  if (idx === -1) return null;
  const next = session.entries[idx + 1];
  return next && next.type === "summary" ? next : null;
}

export function applyForkSplit(session: Session, newForkEntry: Entry): Entry | null {
  if (isForkEntry(newForkEntry)) return null;

  const idx = session.entries.indexOf(newForkEntry);
  if (idx === -1) return null;

  for (let i = idx + 1; i < session.entries.length; i++) {
    const candidate = session.entries[i];
    if (isForkEntry(candidate)) {
      return findLastSummaryFor(session, candidate);
    }
  }
  return null;
}

export interface SegmentSummaryRef {
  sessionId: string;
  entry: Entry;
  title: string;
}

export function collectSegmentSummaries(node: Node): SegmentSummaryRef[] {
  const results: SegmentSummaryRef[] = [];

  const walk = (session: Session): void => {
    for (const entry of session.entries) {
      if (entry.type === "summary") {
        results.push({ sessionId: session.id, entry, title: session.title });
      }
      for (const child of entry.children) walk(child);
    }
  };

  for (const session of node.sessions) walk(session);
  return results;
}
