import { describe, expect, it } from "vitest";
import { buildMessages } from "@/services/contextBuilder";
import type { Session, Entry } from "@/types";

function qaEntry(userInput: string, assistantOutput: string | null = null, children: Session[] = []): Entry {
  return { type: "qa", userInput, assistantOutput, expanded: false, status: "done", children, created_at: 0 };
}

function noteEntry(userInput: string, children: Session[] = []): Entry {
  return { type: "note", userInput, assistantOutput: null, expanded: false, status: "done", children, created_at: 0 };
}

function summaryEntry(userInput: string, children: Session[] = []): Entry {
  return { type: "summary", userInput, assistantOutput: null, expanded: false, status: "done", children, created_at: 0 };
}

function makeSession(entries: Entry[], opts: Partial<Session> = {}): Session {
  return {
    id: opts.id ?? "s",
    title: opts.title ?? "session",
    entries,
    parentSessionId: opts.parentSessionId,
    forkBoundary: opts.forkBoundary,
    groupId: opts.groupId,
    created_at: 0,
    updated_at: 0,
  };
}

// 生产路径中 handleCreateEntry 会先把当前输入的 Entry 追加到 session.entries，
// 再调用 buildMessages；函数内部 `slice(0, -1)` 据此回放"当前 Entry 之前"的历史。
// 此 helper 复现该约定：把当前输入作为最后一个 Entry 追加。
function sessionWithInput(prior: Entry[], currentText: string, opts: Partial<Session> = {}): Session {
  const current: Entry = { type: "qa", userInput: currentText, assistantOutput: null, expanded: false, status: "loading", children: [], created_at: 0 };
  return makeSession([...prior, current], opts);
}

const noopResolve = () => undefined;

describe("buildMessages", () => {
  it("plain session with no prior entries -> [system, userInput]", () => {
    const session = sessionWithInput([], "hello");
    expect(buildMessages(session, "SYS", "hello", noopResolve)).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "hello" },
    ]);
  });

  it("prior qa entry -> user/assistant pair before final input", () => {
    const session = sessionWithInput([qaEntry("Q1", "A1")], "hello");
    expect(buildMessages(session, "SYS", "hello", noopResolve)).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "Q1" },
      { role: "assistant", content: "A1" },
      { role: "user", content: "hello" },
    ]);
  });

  it("note entry -> prefixed user message", () => {
    const session = sessionWithInput([noteEntry("my note")], "hello");
    expect(buildMessages(session, "SYS", "hello", noopResolve)).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "[The user puts a note here] my note" },
      { role: "user", content: "hello" },
    ]);
  });

  it("forked session: ancestor chain replay order", () => {
    const child = sessionWithInput([qaEntry("child prior Q", "child prior A")], "final Q", {
      id: "child",
      parentSessionId: "parent",
      forkBoundary: "--- fork boundary ---",
    });
    const parent = makeSession([qaEntry("ancestor Q", "ancestor A", [child])], {
      id: "parent",
      forkBoundary: "--- ancestor boundary ---",
    });
    const resolve = (id: string) => (id === "parent" ? parent : undefined);
    expect(buildMessages(child, "SYS", "final Q", resolve)).toEqual([
      { role: "system", content: "SYS" },
      { role: "system", content: "--- ancestor boundary ---" },
      { role: "user", content: "ancestor Q" },
      { role: "assistant", content: "ancestor A" },
      { role: "system", content: "--- fork boundary ---" },
      { role: "user", content: "child prior Q" },
      { role: "assistant", content: "child prior A" },
      { role: "user", content: "final Q" },
    ]);
  });

  it("ancestor entries after the fork index are not included (upToIndex slicing)", () => {
    const child = sessionWithInput([], "final Q", {
      id: "child",
      parentSessionId: "parent",
      forkBoundary: "--- fork boundary ---",
    });
    const parent = makeSession(
      [
        qaEntry("before Q", "before A", [child]),
        qaEntry("after Q", "after A"),
      ],
      { id: "parent" }
    );
    const resolve = (id: string) => (id === "parent" ? parent : undefined);
    expect(buildMessages(child, "SYS", "final Q", resolve)).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "before Q" },
      { role: "assistant", content: "before A" },
      { role: "system", content: "--- fork boundary ---" },
      { role: "user", content: "final Q" },
    ]);
  });

  it("fork source is a summary entry -> seed only, no ancestor replay or fork boundaries", () => {
    const child = sessionWithInput([], "final Q", {
      id: "child",
      parentSessionId: "parent",
      forkBoundary: "--- fork boundary ---",
    });
    const parent = makeSession([summaryEntry("seed summary text", [child])], {
      id: "parent",
      forkBoundary: "--- ancestor boundary ---",
    });
    const resolve = (id: string) => (id === "parent" ? parent : undefined);
    expect(buildMessages(child, "SYS", "final Q", resolve)).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "[摘要] seed summary text" },
      { role: "user", content: "final Q" },
    ]);
  });

  it("summary entries in the current session are skipped", () => {
    const session = sessionWithInput(
      [qaEntry("Q1", "A1"), summaryEntry("sum ignored"), noteEntry("my note")],
      "hello"
    );
    expect(buildMessages(session, "SYS", "hello", noopResolve)).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "Q1" },
      { role: "assistant", content: "A1" },
      { role: "user", content: "[The user puts a note here] my note" },
      { role: "user", content: "hello" },
    ]);
  });

  it("fork source is a note -> full inheritance including note prefix", () => {
    const child = sessionWithInput([qaEntry("child prior Q", "child prior A")], "final Q", {
      id: "child",
      parentSessionId: "parent",
      forkBoundary: "--- fork boundary ---",
    });
    const parent = makeSession([noteEntry("ancestor note", [child])], {
      id: "parent",
      forkBoundary: "--- ancestor boundary ---",
    });
    const resolve = (id: string) => (id === "parent" ? parent : undefined);
    expect(buildMessages(child, "SYS", "final Q", resolve)).toEqual([
      { role: "system", content: "SYS" },
      { role: "system", content: "--- ancestor boundary ---" },
      { role: "user", content: "[The user puts a note here] ancestor note" },
      { role: "system", content: "--- fork boundary ---" },
      { role: "user", content: "child prior Q" },
      { role: "assistant", content: "child prior A" },
      { role: "user", content: "final Q" },
    ]);
  });

  it("summary entries earlier in ancestor replay are skipped (never replay)", () => {
    const child = sessionWithInput([], "final Q", {
      id: "child",
      parentSessionId: "parent",
      forkBoundary: "--- fork boundary ---",
    });
    const forkEntry = qaEntry("fork Q", "fork A", [child]);
    const parent = makeSession(
      [qaEntry("early Q", "early A"), summaryEntry("early summary"), forkEntry],
      { id: "parent" }
    );
    const resolve = (id: string) => (id === "parent" ? parent : undefined);
    expect(buildMessages(child, "SYS", "final Q", resolve)).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "early Q" },
      { role: "assistant", content: "early A" },
      { role: "user", content: "fork Q" },
      { role: "assistant", content: "fork A" },
      { role: "system", content: "--- fork boundary ---" },
      { role: "user", content: "final Q" },
    ]);
  });

  it("grandchild forked from qa inside a summary-seeded session keeps intermediate chain (regression: seed must not drop intermediate layers)", () => {
    // 场景：A = [qa, summary(S1)]，S1 派生出 D（种子继承）；D 内继续问答 D1，再从 D1 (qa) fork 出 E。
    // E 的上下文 = [摘要 S1] + D 到 D1 的重放 + E 自身前序，而非只丢出种子。
    const E = sessionWithInput([], "final Q", {
      id: "E",
      parentSessionId: "D",
      forkBoundary: "--- fork boundary ---",
    });
    // D 的 entries：D1 是 qa 且已 fork（children=[E]）；其前序有 D0 的问答
    const D = makeSession(
      [
        qaEntry("D0 Q", "D0 A"),
        qaEntry("D1 Q", "D1 A", [E]),
      ],
      { id: "D", parentSessionId: "A", forkBoundary: "--- fork boundary ---" }
    );
    // A 的 entries：A1 qa 之后是 summary S1（children=[D]，即 D 是从摘要派生的）
    const A = makeSession(
      [
        qaEntry("A1 Q", "A1 A"),
        summaryEntry("seed-text", [D]),
      ],
      { id: "A", forkBoundary: "--- ancestor boundary ---" }
    );
    const resolve = (id: string) => (id === "D" ? D : id === "A" ? A : undefined);
    expect(buildMessages(E, "SYS", "final Q", resolve)).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "[摘要] seed-text" },
      { role: "system", content: "--- fork boundary ---" },
      { role: "user", content: "D0 Q" },
      { role: "assistant", content: "D0 A" },
      { role: "user", content: "D1 Q" },
      { role: "assistant", content: "D1 A" },
      { role: "system", content: "--- fork boundary ---" },
      { role: "user", content: "final Q" },
    ]);
  });
});
