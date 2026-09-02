import type { Entry, Session } from "@/types";

/**
 * 构建发送给 LLM 的消息数组。
 *
 * 注意：调用方（handleCreateEntry）在调用前已将当前输入对应的 Entry 追加到
 * session.entries 末尾；本函数用 `slice(0, -1)` 回放"当前 Entry 之前"的历史条目。
 */

export function isSummaryEntry(e: Entry): boolean {
  return e.type === "summary";
}

/**
 * 组装 fork 祖先链上下文（沿 parentSessionId 上溯到根/摘要种子）。
 * 供 buildMessages 与 summary 生成共用——summary 也必须"到根"，否则总结缺失上下文。
 */
export function buildForkChain(
  session: Session,
  resolveSession: (id: string) => Session | undefined,
  messages: { role: string; content: string }[]
): void {
  if (!session.forkBoundary) return;
  // 沿 parentSessionId 链上溯；每层找 fork 源 entry。
  // 若某层 fork 源是 summary：该层之上的祖先被摘要折叠，子会话只继承该摘要作种子（不再上溯）；
  // 但 summary 之下的中间祖先层（chain）仍按各自 fork 点重放（继承其到 fork 点的上下文）。
  type AncestorEntry = { session: Session; upToIndex: number };
  const chain: AncestorEntry[] = [];
  let seedText: string | null = null;
  let cursor: Session | undefined = session;
  while (cursor?.parentSessionId) {
    const parent = resolveSession(cursor.parentSessionId);
    if (!parent) break;
    const forkedIdx = parent.entries.findIndex(e =>
      e.children.some(c => c.id === cursor!.id)
    );
    const forkSource = forkedIdx >= 0 ? parent.entries[forkedIdx] : undefined;
    if (forkSource && isSummaryEntry(forkSource)) {
      seedText = forkSource.userInput;
      break;
    }
    chain.unshift({ session: parent, upToIndex: forkedIdx >= 0 ? forkedIdx : parent.entries.length - 1 });
    cursor = parent;
  }
  const replayChain = () => {
    for (const { session: ancestor, upToIndex } of chain) {
      if (ancestor.forkBoundary) {
        messages.push({ role: "system", content: ancestor.forkBoundary });
      }
      for (let i = 0; i <= upToIndex; i++) {
        const pe = ancestor.entries[i];
        if (isSummaryEntry(pe)) continue;
        if (pe.type === "qa" && pe.userInput) {
          messages.push({ role: "user", content: pe.userInput });
          if (pe.assistantOutput) messages.push({ role: "assistant", content: pe.assistantOutput });
        } else if (pe.type === "note" && pe.userInput) {
          messages.push({ role: "user", content: `[笔记] ${pe.userInput}` });
        }
      }
    }
  };
  if (seedText !== null) {
    messages.push({ role: "user", content: `[摘要] ${seedText}` });
    replayChain();
    // 直接 fork 自 summary（无中间层）时种子即全部上下文，不推当前会话 forkBoundary；
    // 存在中间层（summary 派生会话再 fork）时按普通 fork 会话语义带边界标记。
    if (chain.length > 0) {
      messages.push({ role: "system", content: session.forkBoundary });
    }
  } else {
    replayChain();
    messages.push({ role: "system", content: session.forkBoundary });
  }
}

export function buildMessages(
  session: Session,
  systemPrompt: string,
  userInput: string,
  resolveSession: (id: string) => Session | undefined
): { role: string; content: string }[] {
  const messages: { role: string; content: string }[] = [
    { role: "system", content: systemPrompt },
  ];
  buildForkChain(session, resolveSession, messages);
  for (const pe of session.entries.slice(0, -1)) {
    if (isSummaryEntry(pe)) continue;
    if (pe.type === "qa" && pe.userInput) {
      messages.push({ role: "user", content: pe.userInput });
      if (pe.assistantOutput) messages.push({ role: "assistant", content: pe.assistantOutput });
    } else if (pe.type === "note" && pe.userInput) {
      messages.push({ role: "user", content: `[笔记] ${pe.userInput}` });
    }
  }
  messages.push({ role: "user", content: userInput });
  return messages;
}
