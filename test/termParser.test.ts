import { describe, expect, it } from "vitest";
import {
  TERM_EXPLICIT_END,
  TERM_EXPLICIT_START,
  TERM_FREE_END,
  TERM_FREE_START,
  encodeWithTermList,
} from "@/services/termParser";

function wrap(term: string): string {
  return `${TERM_FREE_START}${term}${TERM_FREE_END}`;
}

describe("encodeWithTermList free-term matching", () => {
  it("does not match an ASCII term inside a longer word", () => {
    expect(encodeWithTermList("World", ["RL"])).toBe("World");
    expect(encodeWithTermList("worldly", ["RL"])).toBe("worldly");
  });

  it("matches a standalone ASCII term, case-insensitively", () => {
    expect(encodeWithTermList("RL", ["RL"])).toBe(wrap("RL"));
    expect(encodeWithTermList("rl", ["RL"])).toBe(wrap("rl"));
  });

  it("matches an ASCII term adjacent to CJK text", () => {
    expect(encodeWithTermList("强化RL模型", ["RL"])).toBe(`强化${wrap("RL")}模型`);
  });

  it("still substring-matches a CJK term", () => {
    expect(encodeWithTermList("强化学习很重要", ["学习"])).toBe(`强化${wrap("学习")}很重要`);
  });

  it("prefers the longest term", () => {
    expect(encodeWithTermList("强化学习", ["学习", "强化学习"])).toBe(wrap("强化学习"));
  });

  it("skips protected regions", () => {
    expect(encodeWithTermList("`RL`", ["RL"])).toBe("`RL`");
    expect(encodeWithTermList("$RL$", ["RL"])).toBe("$RL$");
  });

  it("keeps explicit annotations intact alongside free terms", () => {
    expect(encodeWithTermList("[[RL]] 与 RL", ["RL"])).toBe(
      `${TERM_EXPLICIT_START}RL${TERM_EXPLICIT_END} 与 ${wrap("RL")}`
    );
  });
});
