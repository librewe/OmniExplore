import type { Entry } from "@/types";

// 运行期瞬时滚动记忆：Entry 无独立 ID，长回答内部 scrollTop 以对象身份为键；
// 树/目录容器 scrollTop 以视图槽位字符串为键。仅存内存，不落持久化，模块级跨组件挂载存活。
const entryScrolls = new WeakMap<Entry, number>();

export function rememberEntryScroll(entry: Entry, top: number): void {
  entryScrolls.set(entry, top);
}

export function readEntryScroll(entry: Entry): number {
  return entryScrolls.get(entry) ?? 0;
}

const treeScrolls = new Map<string, number>();

export function rememberTreeScroll(slot: string, top: number): void {
  treeScrolls.set(slot, top);
}

export function readTreeScroll(slot: string): number {
  return treeScrolls.get(slot) ?? 0;
}
