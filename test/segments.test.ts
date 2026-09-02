import { describe, expect, it } from "vitest";
import { createEntry, createNode, createSession } from "@/store/nodeStore";
import type { Entry, Session } from "@/types";
import {
  applyForkSplit,
  collectSegmentSummaries,
  findLastSummaryFor,
  findSummaryEntry,
  isForkEntry,
  segmentRange,
} from "@/services/segments";

function qa(text = "qa"): Entry {
  return createEntry("qa", text);
}

function fork(text = "fork"): Entry {
  const e = createEntry("qa", text);
  e.children.push(createSession("child"));
  return e;
}

function summary(text = "summary"): Entry {
  return createEntry("summary", text);
}

describe("isForkEntry", () => {
  it("true when children non-empty, false otherwise", () => {
    expect(isForkEntry(fork())).toBe(true);
    expect(isForkEntry(qa())).toBe(false);
    expect(isForkEntry(summary())).toBe(false);
  });
});

describe("segmentRange", () => {
  it("first segment starts at 0 when no prior fork", () => {
    const e0 = qa();
    const e1 = fork();
    const session = createSession("s");
    session.entries = [e0, e1];
    expect(segmentRange(session, e1)).toEqual({ start: 0, end: 1 });
  });

  it("mid-segment starts after the prior fork entry", () => {
    const e0 = qa();
    const e1 = fork();
    const e2 = summary();
    const e3 = qa();
    const e4 = fork();
    const session = createSession("s");
    session.entries = [e0, e1, e2, e3, e4];
    expect(segmentRange(session, e4)).toEqual({ start: 2, end: 4 });
  });

  it("returns null when forkEntry is not in the session", () => {
    const session = createSession("s");
    session.entries = [qa(), fork()];
    expect(segmentRange(session, qa("foreign"))).toBeNull();
  });
});

describe("findSummaryEntry", () => {
  it("returns the first summary after the given index", () => {
    const session = createSession("s");
    session.entries = [qa(), fork(), summary("s1"), qa(), fork(), summary("s2")];
    expect(findSummaryEntry(session, 1)).toBe(session.entries[2]);
    expect(findSummaryEntry(session, 4)).toBe(session.entries[5]);
    expect(findSummaryEntry(session, 5)).toBeNull();
  });
});

describe("findLastSummaryFor", () => {
  it("returns the summary directly following the fork entry", () => {
    const e1 = fork();
    const e2 = summary();
    const session = createSession("s");
    session.entries = [qa(), e1, e2];
    expect(findLastSummaryFor(session, e1)).toBe(e2);
  });

  it("returns null when no summary follows", () => {
    const e1 = fork();
    const session = createSession("s");
    session.entries = [qa(), e1, qa()];
    expect(findLastSummaryFor(session, e1)).toBeNull();
  });
});

describe("applyForkSplit", () => {
  it("returns null for a normal close (no later fork entry)", () => {
    const e1 = qa();
    const session = createSession("s");
    session.entries = [qa(), e1];
    expect(applyForkSplit(session, e1)).toBeNull();
  });

  it("returns the old summary entry when splitting a later closed segment", () => {
    const e0 = qa();
    const e1 = fork();
    const e2 = summary("old-1");
    const e3 = qa("split point");
    const e4 = fork();
    const e5 = summary("old-2");
    const e6 = qa();
    const session = createSession("s");
    session.entries = [e0, e1, e2, e3, e4, e5, e6];
    expect(applyForkSplit(session, e3)).toBe(e5);
  });

  it("returns null when newForkEntry is already a fork point", () => {
    const e3 = fork();
    const session = createSession("s");
    session.entries = [qa(), fork(), summary(), e3, fork(), summary()];
    expect(applyForkSplit(session, e3)).toBeNull();
  });
});

describe("collectSegmentSummaries", () => {
  it("collects a summary from a root session", () => {
    const s = createSession("root");
    const e = summary("root-summary");
    s.entries = [qa(), e];
    const node = createNode("n");
    node.sessions = [s];
    expect(collectSegmentSummaries(node)).toEqual([
      { sessionId: s.id, entry: e, title: s.title },
    ]);
  });

  it("reaches summaries in nested child sessions", () => {
    const child = createSession("child");
    const childSummary = summary("child-summary");
    child.entries = [childSummary];

    const root = createSession("root");
    const parentEntry = qa();
    parentEntry.children = [child];
    root.entries = [parentEntry];

    const node = createNode("n");
    node.sessions = [root];
    expect(collectSegmentSummaries(node)).toEqual([
      { sessionId: child.id, entry: childSummary, title: child.title },
    ]);
  });

  it("returns an empty array for an empty node", () => {
    expect(collectSegmentSummaries(createNode("n"))).toEqual([]);
  });
});

describe("deep nesting", () => {
  it("collects summaries across grand-child sessions", () => {
    const grand = createSession("grand");
    const grandSummary = summary("grand-summary");
    grand.entries = [grandSummary];

    const child = createSession("child");
    const childEntry = qa();
    childEntry.children = [grand];
    child.entries = [childEntry];

    const root = createSession("root");
    const rootEntry = qa();
    rootEntry.children = [child];
    root.entries = [rootEntry];

    const node = createNode("n");
    node.sessions = [root];
    expect(collectSegmentSummaries(node).map((r) => r.sessionId)).toEqual([grand.id]);
  });
});
