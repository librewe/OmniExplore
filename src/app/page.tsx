"use client";

import { useEffect, useReducer, useState, useCallback, useRef, useMemo } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NodeListContext } from "@/lib/NodeListContext";
import { WorkGroupSwitcher } from "@/components/WorkGroupSwitcher";
import { InputBar } from "@/components/InputBar";
import { SettingsPanel } from "@/components/SettingsPanel";
import { PreviewPanel } from "@/components/PreviewPanel";
import { ThemeMenu } from "@/components/ThemeMenu";
import { GuideMapCanvas, buildBreadcrumbItems, findNodePath } from "@/components/GuideMapCanvas";
import { NodeLibrary } from "@/components/NodeLibrary";
import { FilesList } from "@/components/FilesList";
import { PDFViewer } from "@/components/PDFViewer";
import { Onboarding } from "@/components/Onboarding";
import { ContextMenu } from "@/components/ContextMenu";
import { HoverPreview } from "@/components/HoverPreview";
import { initializeConfig, useConfigStore } from "@/store/configStore";
import { getAllWorkGroups, putWorkGroup, deleteWorkGroup as deleteWG, getAllFiles, putFile, deleteFile, getAllNodes, putNode, deleteNode, migrateData } from "@/services/cache";
import { streamLLMChat, LLMError } from "@/services/llm";
import { cn } from "@/lib/utils";
import { Layers, ChevronRight, Search, Plus, Pencil, Trash2, Copy, GitBranch, ArrowLeft } from "lucide-react";
import { DEFAULT_PLUS_TEMPLATES, DEFAULT_SELECTION_TEMPLATES } from "@/lib/constants";
import { defaultPrompt, intuitionPrompt, definitionPrompt, applicationPrompt, motivationPrompt, loadCustomPresetPrompts } from "@/services/prompts";
import type {
  WorkGroup,
  GuideMapNode,
  PlusMenuItem,
  StoredFile,
  Node,
} from "@/types";
import { NodeView } from "@/components/NodeView";
import { nodeReducer, getInitialNodeState, createNode, createSession, createEntry } from "@/store/nodeStore";
import type { Session, Entry } from "@/types";

function buildDefaultPlusMenu(): PlusMenuItem[] {
  return DEFAULT_PLUS_TEMPLATES.map((t, i) => ({
    id: `default_${i}`,
    label: t.label,
    prompt: t.prompt,
  }));
}

const ROOT_PRESET_LABELS: Record<string, string> = {
  default: "Default",
  micro_intuition: "动态直觉",
  micro_definition: "看定义",
  micro_application: "看应用",
  micro_motivation: "看动机",
};

const ROOT_PRESET_DEFAULTS: Record<string, { system: string; user: string }> = {
  default: defaultPrompt("${node}"),
  micro_intuition: intuitionPrompt("${node}"),
  micro_definition: definitionPrompt("${node}"),
  micro_application: applicationPrompt("${node}"),
  micro_motivation: motivationPrompt("${node}"),
};

const rootPlusMenuItems: PlusMenuItem[] = Object.keys(ROOT_PRESET_LABELS).map((k) => ({
  id: `root_${k}`,
  label: ROOT_PRESET_LABELS[k],
  prompt: ROOT_PRESET_DEFAULTS[k].user,
}));

/** 树视图与组合视图共用的导图路径面包屑（簇 > 层级 > …） */
function GuideBreadcrumb({
  map,
  path,
  onRoot,
  onNavigate,
}: {
  map: GuideMapNode | null;
  path: number[];
  onRoot: () => void;
  onNavigate: (p: number[]) => void;
}) {
  const items = buildBreadcrumbItems(map, path);
  return (
    <>
      <button
        onClick={onRoot}
        className={cn(
          "text-xs px-1 py-0.5 rounded transition-colors ml-2 max-w-[120px] truncate shrink-0",
          path.length === 0 ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground"
        )}
      >簇</button>
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-0.5">
          <ChevronRight className="w-4 h-4 text-muted-foreground mx-0.5 shrink-0" />
          <button
            onClick={() => onNavigate(item.path)}
            className={cn(
              "text-xs px-1 py-0.5 rounded transition-colors max-w-[120px] truncate",
              i === items.length - 1 ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground"
            )}
          >{item.label}</button>
        </span>
      ))}
    </>
  );
}

export default function Home() {
  type NavEntry =
    | { type: "tree"; term: string }
    | { type: "guideMap"; pathStr: string; focusPath: number[] };

  function navEntryEq(a: NavEntry, b: NavEntry): boolean {
    if (!a || !b) return false;
    if (a.type !== b.type) return false;
    if (a.type === "tree" && b.type === "tree") return a.term === b.term;
    if (a.type === "guideMap" && b.type === "guideMap") return a.pathStr === b.pathStr;
    return false;
  }

  const isInitialized = useRef(false);

  const [nodeState, dispatchNode] = useReducer(nodeReducer, getInitialNodeState());
  const [nodeList, setNodeList] = useState<Node[]>([]);
  const nodeRef = useRef<Node | null>(null);
  nodeRef.current = nodeState.node;
  const targetSessionIdRef = useRef<string | null>(null);

  const findSessionInTree = useCallback((id: string): Session | undefined => {
    const node = nodeRef.current;
    if (!node) return undefined;
    function search(session: Session): Session | undefined {
      for (const e of session.entries) {
        for (const c of e.children) {
          if (c.id === id) return c;
          const found = search(c);
          if (found) return found;
        }
      }
      return undefined;
    }
    for (const s of node.sessions) {
      if (s.id === id) return s;
      const found = search(s);
      if (found) return found;
    }
    return undefined;
  }, []);
  const [contextTarget, setContextTarget] = useState<{ type: "node"; id: string } | { type: "session"; id: string } | { type: "entry"; entry: Entry } | null>(null);
  const [contextPos, setContextPos] = useState({ x: 0, y: 0 });
  const closeContext = useCallback(() => { setContextTarget(null); contextSessionRef.current = null; contextNodeRef.current = null; }, []);
  const contextSessionRef = useRef<Session | null>(null);
  const contextNodeRef = useRef<Node | null>(null);
  const renameTargetRef = useRef<{ type: "node"; node: Node } | { type: "session"; session: Session } | null>(null);
  const [renamingNodeId, setRenamingNodeId] = useState<string | null>(null);
  const streamingAbortRef = useRef<AbortController | null>(null);
  const presetSystemRef = useRef<string | null>(null);

  const config = useConfigStore((s) => s.config);
  const isConfigured = useConfigStore((s) => s.isConfigured);

  const [workGroups, setWorkGroups] = useState<WorkGroup[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [plusMenuItems, setPlusMenuItems] = useState<PlusMenuItem[]>([]);
  const [selectionMenuItems, setSelectionMenuItems] = useState<PlusMenuItem[]>([]);
  const [recentInputs, setRecentInputs] = useState<string[]>([]);

  const [showGuideMap, setShowGuideMap] = useState(false);
  const [fillValue, setFillValue] = useState<string>("");
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [navHistory, setNavHistory] = useState<NavEntry[]>([]);
  const [navIndex, setNavIndex] = useState(-1);
  const navStoreRef = useRef<Map<string, { history: NavEntry[]; index: number }>>(new Map());
  const navIndexRef = useRef(-1);
  useEffect(() => { navIndexRef.current = navIndex; }, [navIndex]);
  const navPushedRef = useRef(false);

  const [previewTitle, setPreviewTitle] = useState("");
  const [leftWidth, setLeftWidth] = useState(288);
  const [rightWidth, setRightWidth] = useState(288);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(true);
  const [hoverTermPreview, setHoverTermPreview] = useState<string | null>(null);
  const [hoverTermPreviewTerm, setHoverTermPreviewTerm] = useState("");
  const [hoverTermPreviewAnchor, setHoverTermPreviewAnchor] = useState<DOMRect | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [leftTab, setLeftTab] = useState<"nodes" | "files">("nodes");
  const [storedFiles, setStoredFiles] = useState<StoredFile[]>([]);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [activePdf, setActivePdf] = useState<StoredFile | null>(null);
  const [pdfBoundNode, setPdfBoundNode] = useState<string | null>(null);
  const pdfBoundNodeRef = useRef<string | null>(null);
  useEffect(() => { pdfBoundNodeRef.current = pdfBoundNode; }, [pdfBoundNode]);
  const pdfBindingsRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const saved = localStorage.getItem("pdf_bindings");
    if (saved) {
      try { pdfBindingsRef.current = new Map(JSON.parse(saved)); } catch {}
    }
  }, []);

  const saveBindings = useCallback(() => {
    localStorage.setItem("pdf_bindings", JSON.stringify([...pdfBindingsRef.current.entries()]));
  }, []);
  const prevRightRef = useRef(288);
  const prevRightCollapsedRef = useRef(true);
  const hadPdfRef = useRef(false);

  useEffect(() => {
    if (activePdf) {
      if (!hadPdfRef.current) {
        prevRightRef.current = rightWidth;
        prevRightCollapsedRef.current = rightCollapsed;
        hadPdfRef.current = true;
        setRightCollapsed(false);
        setRightWidth(Math.max(400, window.innerWidth * 0.45));
      }
      const termName = activePdf.name.replace(/\.[^.]+$/, "");
      const boundName = pdfBindingsRef.current.get(activePdf.name);
      if (boundName && nodeList.some((s) => s.title.toLowerCase() === boundName.toLowerCase())) {
        setPdfBoundNode(boundName);
      } else if (nodeList.some((s) => s.title.toLowerCase() === termName.toLowerCase())) {
        setPdfBoundNode(termName);
        pdfBindingsRef.current.set(activePdf.name, termName);
        saveBindings();
      } else {
        setPdfBoundNode(null);
      }
    } else {
      hadPdfRef.current = false;
      setRightWidth(prevRightRef.current);
      setRightCollapsed(prevRightCollapsedRef.current);
      setPdfBoundNode(null);
    }
  }, [activePdf, nodeList]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(t);
  }, [toast]);

  const activeGroup = workGroups.find((g) => g.id === activeGroupId);

  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    initializeConfig();

    migrateData().then(() => getAllWorkGroups()).then((groups) => {
      if (groups.length === 0) {
        const defaultGroup: WorkGroup = {
          id: crypto.randomUUID(),
          name: "默认",
          guide_map: null,
          created_at: Date.now(),
          updated_at: Date.now(),
        };
        putWorkGroup(defaultGroup).then(() => {
          setWorkGroups([defaultGroup]);
          setActiveGroupId(defaultGroup.id);
        });
      } else {
        setWorkGroups(groups);
        const saved = localStorage.getItem("active_group_id");
        setActiveGroupId(saved && groups.some((g) => g.id === saved) ? saved : groups[0].id);
      }
    });

    getAllFiles().then(setStoredFiles);

    const savedMenu = localStorage.getItem("plus_menu_items");
    if (savedMenu) {
      try { setPlusMenuItems(JSON.parse(savedMenu)); } catch {}
    } else {
      setPlusMenuItems(buildDefaultPlusMenu());
    }

    const savedSelMenu = localStorage.getItem("selection_menu_items");
    if (savedSelMenu) {
      try { setSelectionMenuItems(JSON.parse(savedSelMenu)); } catch {}
    } else {
      setSelectionMenuItems(DEFAULT_SELECTION_TEMPLATES);
    }

    const savedHistory = localStorage.getItem("input_history");
    if (savedHistory) {
      try { setRecentInputs(JSON.parse(savedHistory)); } catch {}
    }
  }, []);

  useEffect(() => {
    if (!activeGroupId && workGroups.length > 0) {
      setActiveGroupId(workGroups[0].id);
    }
  }, [workGroups, activeGroupId]);

  const nodeListLoadSeqRef = useRef(0);
  const loadNodeList = useCallback(async (groupId: string) => {
    const seq = ++nodeListLoadSeqRef.current;
    const nodes = await getAllNodes(groupId);
    if (seq !== nodeListLoadSeqRef.current) return;
    const normSession = (s: Session): Session => ({
      ...s,
      entries: s.entries.map(e => ({ ...e, children: (e.children || []).map(normSession) })),
    });
    const normalized = nodes.map(n => ({ ...n, sessions: n.sessions.map(normSession) }));
    setNodeList(normalized);
  }, []);

  useEffect(() => {
    if (activeGroupId) loadNodeList(activeGroupId);
  }, [activeGroupId, loadNodeList]);

  const savePlusMenu = useCallback((items: PlusMenuItem[]) => {
    setPlusMenuItems(items);
    localStorage.setItem("plus_menu_items", JSON.stringify(items));
  }, []);

  const saveSelectionMenu = useCallback((items: PlusMenuItem[]) => {
    setSelectionMenuItems(items);
    localStorage.setItem("selection_menu_items", JSON.stringify(items));
  }, []);

  const handlePlusSelect = useCallback((item: PlusMenuItem, nodeTitle: string) => {
    if (item.id.startsWith("root_")) {
      const key = item.id.slice(5);
      const overrides = loadCustomPresetPrompts();
      const preset = overrides[key] || ROOT_PRESET_DEFAULTS[key];
      presetSystemRef.current = preset.system;
      setFillValue(preset.user.replace(/\$\{node\}/g, nodeTitle).replace(/\$\{term\}/g, nodeTitle));
    } else {
      presetSystemRef.current = null;
      setFillValue(item.prompt.replace(/\$\{node\}/g, nodeTitle).replace(/\$\{term\}/g, nodeTitle));
    }
  }, []);

  const addRecentInput = useCallback((text: string) => {
    setRecentInputs((prev) => {
      const next = [text, ...prev.filter((t) => t !== text)].slice(0, 20);
      localStorage.setItem("input_history", JSON.stringify(next));
      return next;
    });
  }, []);

  // 子 Session 加号菜单 = Default（简单介绍${node}）+ 用户自定义项
  const subPlusMenuItems = useMemo<PlusMenuItem[]>(
    () => [{ id: "sub_default", label: "Default", prompt: "简单介绍${node}" }, ...plusMenuItems],
    [plusMenuItems]
  );

  const ensureGuideMap = useCallback(async (title?: string) => {
    if (!activeGroupId) return;
    const group = workGroups.find((g) => g.id === activeGroupId);
    if (!group) return;
    if (!group.guide_map) {
      group.guide_map = { term: "", children: [] };
      group.updated_at = Date.now();
      await putWorkGroup(group);
      setWorkGroups((prev) => prev.map((g) => (g.id === activeGroupId ? { ...group } : g)));
    }
    const currentTitle = title ?? nodeState.node?.title;
    if (currentTitle && group.guide_map) {
      const lower = currentTitle.toLowerCase();
      // 存在性检查递归整棵导图（含嵌套组内节点），避免把组内已有节点重复添加到根层
      const existsInTree = (n: GuideMapNode): boolean =>
        (!!n.term && n.term.toLowerCase() === lower) || n.children.some(existsInTree);
      const exists = group.guide_map.children.some(existsInTree);
      if (!exists) {
        group.guide_map = { ...group.guide_map, children: [...group.guide_map.children, { term: currentTitle, children: [] }] };
        group.updated_at = Date.now();
        putWorkGroup(group);
        setWorkGroups((prev) => prev.map((g) => (g.id === activeGroupId ? { ...group } : g)));
      }
    }
  }, [activeGroupId, workGroups, nodeState.node?.title]);

  const buildNodePreview = useCallback((node: Node): string => {
    const lines: string[] = [];
    for (const s of node.sessions) {
      const first = s.entries[0];
      if (first) lines.push(`  💬 ${first.userInput.split('\n')[0].slice(0, 30)}`);
    }
    return lines.join("\n");
  }, []);

  const handleFocusNode = useCallback(async (title: string, silent = false) => {
    if (!title.trim()) return;
    const existing = nodeList.find(n => n.title.toLowerCase() === title.trim().toLowerCase());
    if (existing) {
      targetSessionIdRef.current = null;
      dispatchNode({ type: "SET_NODE", node: existing });
      dispatchNode({ type: "SET_ACTIVE_TAG", sessionId: existing.id, title: existing.title });
      setShowGuideMap(false);
      setPreviewTitle(existing.title);
      // Push nav history（导航触发 silent=true 时不推，避免污染历史）
      if (!silent) {
        const entry: NavEntry = { type: "tree", term: existing.title };
        setNavHistory((prev) => {
          const next = prev.slice(0, navIndex + 1);
          if (next.length === 0 || !navEntryEq(next[next.length - 1], entry)) { next.push(entry); }
          return next;
        });
        setNavIndex((prev) => prev + 1);
      }
      setPreviewContent(buildNodePreview(existing));
      return;
    }
    const node = createNode(title.trim(), activeGroupId ?? undefined);
    targetSessionIdRef.current = null;
    dispatchNode({ type: "SET_NODE", node });
    dispatchNode({ type: "SET_ACTIVE_TAG", sessionId: node.id, title: node.title });
    await putNode(node);
    setNodeList((prev) => [...prev.filter(n => n.id !== node.id), node]);
    addRecentInput(title);
    setShowGuideMap(false);
    setPreviewTitle(node.title);
    setPreviewContent(null);
    // Push nav history（导航触发 silent=true 时不推）
    if (!silent) {
      const entry: NavEntry = { type: "tree", term: title };
      setNavHistory((prev) => {
        const next = prev.slice(0, navIndex + 1);
        next.push(entry);
        return next;
      });
      setNavIndex((prev) => prev + 1);
    }
    // Add to guide map
    ensureGuideMap(title.trim());
    // Set preview content from root sessions
    setPreviewContent(buildNodePreview(node));
  }, [nodeList, addRecentInput, navIndex, ensureGuideMap, activeGroupId, buildNodePreview]);

  const handleStreamEntry = useCallback(
    async (entry: Entry, config: import("@/types").LLMConfig, messages: { role: string; content: string }[]) => {
      // Abort any previous stream
      streamingAbortRef.current?.abort();
      const abort = new AbortController();
      streamingAbortRef.current = abort;
      dispatchNode({ type: "SET_ENTRY_STATUS", entry, status: "loading" });
      try {
        let accumulated = "";
        const generator = streamLLMChat(config, messages);
        dispatchNode({ type: "SET_ENTRY_STATUS", entry, status: "streaming" });
        for await (const chunk of generator) {
          if (abort.signal.aborted) break;
          accumulated += chunk;
          dispatchNode({ type: "SET_STREAMING_CONTENT", entry, content: accumulated });
        }
        // abort（新流打断旧流）也置 done，避免旧 entry 图标永远停留"加载中"
        dispatchNode({ type: "SET_ENTRY_STATUS", entry, status: "done" });
        return accumulated;
      } catch (err) {
        if (abort.signal.aborted) return null;
        console.error("[OmniExplore] LLM stream error:", err);
        const message = err instanceof LLMError ? err.message : "网络连接失败";
        dispatchNode({ type: "SET_ENTRY_STATUS", entry, status: "error", errorMessage: message });
        return null;
      } finally {
        if (streamingAbortRef.current === abort) streamingAbortRef.current = null;
      }
    },
    []
  );

  const createRootSession = useCallback(async (title: string): Promise<Session | null> => {
    const node = nodeRef.current;
    if (!node) return null;
    const session = createSession(title || "未命名", node.groupId);
    node.sessions = [...node.sessions, session];
    node.updated_at = Date.now();
    await putNode(node);
    dispatchNode({ type: "REPLACE_NODE", node });
    targetSessionIdRef.current = session.id;
    dispatchNode({ type: "SET_ACTIVE_TAG", sessionId: session.id, title: session.title });
    return session;
  }, []);

  const handleCreateRootSession = useCallback(async () => {
    const session = await createRootSession("未命名");
    if (session) {
      renameTargetRef.current = { type: "session", session };
      setRenamingNodeId(session.id);
    }
  }, [createRootSession]);

  const handleCreateEntry = useCallback(async (userInput: string) => {
    const text = userInput.trim();
    if (!text) return;
    let s: Session | null | undefined = findSessionInTree(targetSessionIdRef.current ?? "");
    if (!s) {
      // 未选中根 Session：自动新建根 Session（标题取输入截断），输入视为追加到 node
      const node = nodeRef.current;
      if (!node) return;
      const title = text.split("\n")[0].slice(0, 30) || "未命名";
      s = await createRootSession(title);
      if (!s) return;
    }
    setFillValue("");
    const systemPrompt = presetSystemRef.current ?? "你是一个有帮助的人工智能助手。";
    presetSystemRef.current = null;
    const entry = createEntry("qa", text);
    entry.status = "loading";
    entry.expanded = true;
    s.entries = [...s.entries, entry];
    s.updated_at = Date.now();
    dispatchNode({ type: "REPLACE_NODE", node: nodeRef.current! });
    await putNode(nodeRef.current!);
    if (config && isConfigured) {
      const messages: { role: string; content: string }[] = [
        { role: "system", content: systemPrompt },
      ];
      if (s.forkBoundary) {
        // Walk up parentSessionId chain; for each ancestor, find which entry was forked from
        type AncestorEntry = { session: Session; upToIndex: number };
        const chain: AncestorEntry[] = [];
        let cursor: Session | undefined = s;
        while (cursor?.parentSessionId) {
          const parent = findSessionInTree(cursor.parentSessionId);
          if (!parent) break;
          const forkedIdx = parent.entries.findIndex(e =>
            e.children.some(c => c.id === cursor!.id)
          );
          chain.unshift({ session: parent, upToIndex: forkedIdx >= 0 ? forkedIdx : parent.entries.length - 1 });
          cursor = parent;
        }
        for (const { session: ancestor, upToIndex } of chain) {
          if (ancestor.forkBoundary) {
            messages.push({ role: "system", content: ancestor.forkBoundary });
          }
          for (let i = 0; i <= upToIndex; i++) {
            const pe = ancestor.entries[i];
            if (pe.type === "qa" && pe.userInput) {
              messages.push({ role: "user", content: pe.userInput });
              if (pe.assistantOutput) messages.push({ role: "assistant", content: pe.assistantOutput });
            } else if (pe.type === "note" && pe.userInput) {
              messages.push({ role: "user", content: `[笔记] ${pe.userInput}` });
            }
          }
        }
        messages.push({ role: "system", content: s.forkBoundary });
      }
      for (const pe of s.entries.slice(0, -1)) {
        if (pe.type === "qa" && pe.userInput) {
          messages.push({ role: "user", content: pe.userInput });
          if (pe.assistantOutput) messages.push({ role: "assistant", content: pe.assistantOutput });
        } else if (pe.type === "note" && pe.userInput) {
          messages.push({ role: "user", content: `[笔记] ${pe.userInput}` });
        }
      }
      messages.push({ role: "user", content: text });
      console.log("[OmniExplore] messages:", messages.map(m => `${m.role}: ${m.content.slice(0, 60)}`));
      await handleStreamEntry(entry, config, messages);
      s.updated_at = Date.now();
      await putNode(nodeRef.current!);
      dispatchNode({ type: "REPLACE_NODE", node: nodeRef.current! });
    } else {
      // 未配置 LLM：不发起请求，清除 loading 态（须持久化，否则刷新后该 entry 永远显示"加载中"）
      entry.status = "done";
      dispatchNode({ type: "REPLACE_NODE", node: nodeRef.current! });
      await putNode(nodeRef.current!);
    }
  }, [config, isConfigured, handleStreamEntry, findSessionInTree, createRootSession]);

  const handleToggleEntryExpand = useCallback(async (session: Session, entry: Entry) => {
    entry.expanded = !entry.expanded;
    session.updated_at = Date.now();
    await putNode(nodeRef.current!);
    dispatchNode({ type: "REPLACE_NODE", node: nodeRef.current! });
  }, []);

  const handleSelectEntry = useCallback((entry: Entry | null) => { dispatchNode({ type: "SET_SELECTED_ENTRY", entry }); }, []);
  const handleSelectSession = useCallback((session: Session | null) => {
    dispatchNode({ type: "SET_SELECTED_SESSION", session });
    if (session) {
      dispatchNode({ type: "SET_ACTIVE_TAG", sessionId: session.id, title: session.title });
      targetSessionIdRef.current = session.id;
    } else {
      targetSessionIdRef.current = null;
      const node = nodeRef.current;
      if (node) dispatchNode({ type: "SET_ACTIVE_TAG", sessionId: node.id, title: node.title });
    }
  }, []);

  const handleCreateEmptyEntry = useCallback(async () => {
    const s = findSessionInTree(targetSessionIdRef.current ?? "") || nodeRef.current?.sessions[0];
    if (!s) return;
    const entry = createEntry("note", "");
    entry.expanded = true;
    s.entries = [...s.entries, entry];
    s.updated_at = Date.now();
    dispatchNode({ type: "REPLACE_NODE", node: nodeRef.current! });
    await putNode(nodeRef.current!);
    setEditingEntry(entry);
  }, [findSessionInTree]);

  const handleDeleteEntry = useCallback(async (session: Session, entry: Entry) => {
    session.entries = session.entries.filter(e => e !== entry);
    session.updated_at = Date.now();
    await putNode(nodeRef.current!);
    dispatchNode({ type: "REPLACE_NODE", node: nodeRef.current! });
  }, []);

  const handleForkEntry = useCallback(async (session: Session, entry: Entry) => {
    const forkNum = entry.children.length + 1;
    const child = createSession(`${session.title} (分支#${forkNum})`, session.groupId);
    child.parentSessionId = session.id;
    child.forkBoundary = "--- fork boundary ---";
    entry.children = [...entry.children, child];
    entry.expanded = true;
    session.updated_at = Date.now();
    dispatchNode({ type: "REPLACE_NODE", node: nodeRef.current! });
    await putNode(nodeRef.current!);
  }, []);

  const handleSessionContextMenu = useCallback((e: React.MouseEvent, session: Session) => { e.preventDefault(); contextSessionRef.current = session; setContextTarget({ type: "session", id: session.id }); setContextPos({ x: e.clientX, y: e.clientY }); }, []);
  const handleNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => { e.preventDefault(); contextNodeRef.current = node; setContextTarget({ type: "node", id: node.id }); setContextPos({ x: e.clientX, y: e.clientY }); }, []);
  const handleEntryContextMenu = useCallback((e: React.MouseEvent, session: Session, entry: Entry) => { e.preventDefault(); contextSessionRef.current = session; setContextTarget({ type: "entry", entry }); setContextPos({ x: e.clientX, y: e.clientY }); }, []);

  const handleRenameSession = useCallback((session: Session) => { renameTargetRef.current = { type: "session", session }; setRenamingNodeId(session.id); }, []);
  const handleRenameNode = useCallback((node: Node) => { renameTargetRef.current = { type: "node", node }; setRenamingNodeId(node.id); }, []);

  const removeFromGuideMap = useCallback((title: string) => {
    if (!activeGroupId || !title) return;
    const group = workGroups.find((g) => g.id === activeGroupId);
    if (!group?.guide_map) return;
    const removeFrom = (n: GuideMapNode): GuideMapNode => ({
      ...n,
      children: n.children.filter((c) => c.term.toLowerCase() !== title.toLowerCase()).map(removeFrom),
    });
    const cleaned = removeFrom(group.guide_map);
    if (JSON.stringify(cleaned) !== JSON.stringify(group.guide_map)) {
      group.guide_map = cleaned;
      group.updated_at = Date.now();
      putWorkGroup(group);
      setWorkGroups((prev) => prev.map((g) => (g.id === activeGroupId ? { ...group } : g)));
    }
  }, [activeGroupId, workGroups]);

  const handleDeleteNodeFromMenu = useCallback(async (targetId: string) => {
    const target = contextTarget;
    if (!target) return;
    if (target.type === "node") {
      const n = contextNodeRef.current;
      if (!n) return;
      await deleteNode(n.id);
      setNodeList(prev => prev.filter(x => x.id !== n.id));
      removeFromGuideMap(n.title);
      if (nodeState.node?.id === n.id) {
        dispatchNode({ type: "CLEAR_NODE" });
        setPreviewTitle(""); setPreviewContent(null);
      }
      closeContext();
      return;
    }
    const s = contextSessionRef.current;
    if (!s) return;
    if (s.parentSessionId) {
      const root = nodeRef.current;
      if (root && removeChildNode(root, s.id)) {
        root.updated_at = Date.now();
        await putNode(root);
        dispatchNode({ type: "REPLACE_NODE", node: root });
      }
    } else {
      const root = nodeRef.current;
      if (root) {
        root.sessions = root.sessions.filter(x => x.id !== s.id);
        root.updated_at = Date.now();
        await putNode(root);
        dispatchNode({ type: "REPLACE_NODE", node: root });
      }
    }
    if (targetSessionIdRef.current === s.id) targetSessionIdRef.current = null;
    if (nodeState.activeTag.sessionId === s.id) {
      const node = nodeRef.current;
      if (node) dispatchNode({ type: "SET_ACTIVE_TAG", sessionId: node.id, title: node.title });
    }
    closeContext();
  }, [nodeState.node, nodeState.activeTag.sessionId, contextTarget, closeContext, removeFromGuideMap]);

  function removeChildNode(node: Node, childId: string): boolean {
    const rootIdx = node.sessions.findIndex(s => s.id === childId);
    if (rootIdx >= 0) { node.sessions.splice(rootIdx, 1); return true; }
    function search(session: Session): boolean {
      for (const e of session.entries) {
        const idx = e.children.findIndex(c => c.id === childId);
        if (idx >= 0) { e.children.splice(idx, 1); return true; }
        for (const c of e.children) { if (search(c)) return true; }
      }
      return false;
    }
    for (const s of node.sessions) { if (search(s)) return true; }
    return false;
  }

  const updateGuideMapTerm = useCallback((oldTerm: string, newTerm: string) => {
    if (!activeGroupId || !oldTerm || oldTerm === newTerm) return;
    const group = workGroups.find((g) => g.id === activeGroupId);
    if (!group?.guide_map) return;
    const updateTerm = (n: GuideMapNode): GuideMapNode => ({
      ...n,
      term: n.term.toLowerCase() === oldTerm.toLowerCase() ? newTerm : n.term,
      children: n.children.map(updateTerm),
    });
    const next = updateTerm(group.guide_map);
    if (JSON.stringify(next) !== JSON.stringify(group.guide_map)) {
      group.guide_map = next;
      group.updated_at = Date.now();
      putWorkGroup(group);
      setWorkGroups((prev) => prev.map((g) => (g.id === activeGroupId ? { ...group } : g)));
    }
  }, [activeGroupId, workGroups]);

  const handleNodeRenameSubmit = useCallback(async (targetId: string, title: string) => {
    if (!title.trim()) { setRenamingNodeId(null); return; }
    const target = renameTargetRef.current;
    if (!target) { setRenamingNodeId(null); return; }
    const newTitle = title.trim();
    if (target.type === "node") {
      const n = target.node;
      const oldTitle = n.title;
      if (oldTitle === newTitle) { setRenamingNodeId(null); return; }
      n.title = newTitle;
      n.updated_at = Date.now();
      await putNode(n);
      setNodeList(prev => prev.map(x => x.id === n.id ? n : x));
      if (nodeState.node?.id === n.id) {
        dispatchNode({ type: "RENAME_NODE", title: newTitle });
        dispatchNode({ type: "SET_ACTIVE_TAG", sessionId: n.id, title: newTitle });
        updateGuideMapTerm(oldTitle, newTitle);
        if (pdfBoundNodeRef.current === oldTitle) {
          setPdfBoundNode(newTitle);
          pdfBindingsRef.current.forEach((v, k) => { if (v === oldTitle) pdfBindingsRef.current.set(k, newTitle); });
          saveBindings();
        }
        setPreviewTitle(newTitle);
      }
    } else {
      const s = target.session;
      s.title = newTitle;
      s.updated_at = Date.now();
      await putNode(nodeRef.current!);
      dispatchNode({ type: "REPLACE_NODE", node: nodeRef.current! });
      if (targetSessionIdRef.current === s.id) {
        dispatchNode({ type: "SET_ACTIVE_TAG", sessionId: s.id, title: newTitle });
      }
    }
    setRenamingNodeId(null);
  }, [nodeState.node, updateGuideMapTerm]);

  const findSessionForEntry = useCallback((entry: Entry): Session | undefined => {
    const node = nodeRef.current;
    if (!node) return undefined;
    function search(s: Session): Session | undefined {
      if (s.entries.includes(entry)) return s;
      for (const e of s.entries) {
        for (const c of e.children) {
          const found = search(c);
          if (found) return found;
        }
      }
      return undefined;
    }
    for (const s of node.sessions) {
      const found = search(s);
      if (found) return found;
    }
    return undefined;
  }, []);

  // 划词追问：先从原 entry 分支，再追加到分支 session 并回答
  const handleSelectionAsk = useCallback(async (question: string, entry: Entry | null) => {
    if (!entry) {
      const node = nodeRef.current;
      if (node && !targetSessionIdRef.current) {
        dispatchNode({ type: "SET_ACTIVE_TAG", sessionId: node.id, title: node.title });
      }
      setFillValue(question);
      return;
    }
    const host = findSessionForEntry(entry);
    if (!host) return;
    const forkNum = entry.children.length + 1;
    const child = createSession(`${host.title} (分支#${forkNum})`, host.groupId);
    child.parentSessionId = host.id;
    child.forkBoundary = "--- fork boundary ---";
    entry.children = [...entry.children, child];
    entry.expanded = true;
    host.updated_at = Date.now();
    await putNode(nodeRef.current!);
    dispatchNode({ type: "REPLACE_NODE", node: nodeRef.current! });
    targetSessionIdRef.current = child.id;
    dispatchNode({ type: "SET_ACTIVE_TAG", sessionId: child.id, title: child.title });
    setFillValue(question);
  }, [findSessionForEntry]);

  const handleSelectionContextMenu = useCallback(
    (e: React.MouseEvent, selectedText: string, entry: Entry | null) => {
      const menu = document.createElement("div");
      menu.className = "fixed z-50 min-w-[180px] rounded-md border bg-popover p-1 shadow-md";
      menu.style.left = `${e.clientX}px`;
      menu.style.top = `${e.clientY}px`;

      const focusBtn = document.createElement("button");
      focusBtn.className = "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent";
      focusBtn.innerHTML = "<span>🎯</span> <span>聚焦</span>";
      focusBtn.onclick = () => { menu.remove(); handleFocusNode(selectedText); };
      menu.appendChild(focusBtn);

      selectionMenuItems.forEach((item) => {
        const btn = document.createElement("button");
        btn.className = "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent";
        btn.innerHTML = `<span>💬</span> <span>${item.label}</span>`;
        btn.onclick = () => {
          menu.remove();
          const rootTerm = nodeState.node?.title ?? "";
          const label = item.prompt
            .replace(/\$\{selected\}/g, selectedText)
            .replace(/\$\{root\}/g, rootTerm)
            .replace(/\$\{node\}/g, rootTerm);
          handleSelectionAsk(label, entry);
        };
        menu.appendChild(btn);
      });

      document.body.appendChild(menu);
      const close = (ev: MouseEvent) => {
        if (!menu.contains(ev.target as HTMLElement)) { menu.remove(); document.removeEventListener("click", close); }
      };
      setTimeout(() => document.addEventListener("click", close), 0);
    },
    [handleFocusNode, selectionMenuItems, nodeState.node?.title, handleSelectionAsk]
  );

  const handleTermHover = useCallback(
    (e: React.MouseEvent, term: string) => {
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      setHoverTermPreviewAnchor(rect);
      setHoverTermPreviewTerm(term);
      const node = nodeList.find(s => s.title.toLowerCase() === term.toLowerCase());
      setHoverTermPreview(node ? node.title : null);
    },
    [nodeList]
  );

  const handleTermLeave = useCallback(() => {
    setHoverTermPreview(null);
    setHoverTermPreviewAnchor(null);
  }, []);

  const handleEditingChange = useCallback((session: Session, entry: Entry, value: string) => {
    entry.userInput = value;
  }, []);
  const handleEditSubmit = useCallback(async (session: Session, entry: Entry) => {
    setEditingEntry(null);
    session.updated_at = Date.now();
    await putNode(nodeRef.current!);
    dispatchNode({ type: "REPLACE_NODE", node: nodeRef.current! });
  }, []);

  const handleWorkGroupSelect = useCallback(
    (groupId: string) => {
      if (groupId === activeGroupId) return;
      navStoreRef.current.set(activeGroupId || "default", { history: navHistory, index: navIndex });
      const stored = navStoreRef.current.get(groupId) || { history: [], index: -1 };
      setNavHistory(stored.history);
      setNavIndex(stored.index);
      setActiveGroupId(groupId);
      localStorage.setItem("active_group_id", groupId);
      targetSessionIdRef.current = null;
      setGuideFocusPath([]);
      dispatchNode({ type: "CLEAR_NODE" });
      setShowGuideMap(false);
      setPreviewTitle("");
      setPreviewContent(null);
    },
    [activeGroupId, navHistory, navIndex]
  );

  const handleWorkGroupCreate = useCallback(
    async (name: string) => {
      const group: WorkGroup = {
        id: crypto.randomUUID(),
        name,
        guide_map: null,
        created_at: Date.now(),
        updated_at: Date.now(),
      };
      await putWorkGroup(group);
      setWorkGroups((prev) => [...prev, group]);
      localStorage.setItem("active_group_id", group.id);
      targetSessionIdRef.current = null;
      setGuideFocusPath([]);
      dispatchNode({ type: "CLEAR_NODE" });
      setShowGuideMap(false);
      setPreviewTitle("");
      setPreviewContent(null);
      setActiveGroupId(group.id);
    },
    []
  );

  const handleWorkGroupRename = useCallback(
    async (id: string, name: string) => {
      const group = workGroups.find((g) => g.id === id);
      if (!group) return;
      const updated = { ...group, name, updated_at: Date.now() };
      await putWorkGroup(updated);
      setWorkGroups((prev) => prev.map((g) => (g.id === id ? updated : g)));
    },
    [workGroups]
  );

  const handleWorkGroupDelete = useCallback(
    async (id: string) => {
      const groupNodes = await getAllNodes(id);
      await Promise.all(groupNodes.map((n) => deleteNode(n.id)));
      await deleteWG(id);
      setWorkGroups((prev) => prev.filter((g) => g.id !== id));
      if (activeGroupId === id) {
        const remaining = workGroups.filter((g) => g.id !== id);
        localStorage.removeItem("active_group_id");
        targetSessionIdRef.current = null;
        setGuideFocusPath([]);
        dispatchNode({ type: "CLEAR_NODE" });
        setPreviewTitle("");
        setPreviewContent(null);
        if (remaining[0]) {
          setActiveGroupId(remaining[0].id);
        } else {
          setNodeList([]);
          setActiveGroupId(null);
        }
      }
    },
    [activeGroupId, workGroups]
  );

  const handleAddGuideMapNode = useCallback(
    async (term: string, path: number[] = []) => {
      if (!activeGroupId || !term.trim()) return;
      const group = workGroups.find((g) => g.id === activeGroupId);
      if (!group) return;
      const newChild: GuideMapNode = { term: term.trim(), children: [] };
      const newTree = group.guide_map ? structuredClone(group.guide_map) : { term: "", children: [] as GuideMapNode[] };

      let added = false;
      if (path.length === 0) {
        const lower = term.trim().toLowerCase();
        const exists = newTree.children.some((c) => c.term.toLowerCase() === lower);
        if (!exists) {
          newTree.children.push(newChild);
          added = true;
        }
      } else {
        let parent: GuideMapNode;
        if (newTree.term === "") {
          parent = newTree.children[path[0]];
          for (let i = 1; i < path.length && parent; i++) parent = parent.children[path[i]];
        } else {
          parent = newTree;
          for (let i = 0; i < path.length && parent; i++) parent = parent.children[path[i]];
        }
        if (parent) {
          const lower = term.trim().toLowerCase();
          const exists = parent.children.some((c) => c.term.toLowerCase() === lower);
          if (!exists) {
            parent.children.push(newChild);
            added = true;
          }
        }
      }
      if (added) {
        group.guide_map = newTree;
        group.updated_at = Date.now();
        await putWorkGroup(group);
        setWorkGroups((prev) => prev.map((g) => (g.id === activeGroupId ? { ...group } : g)));
      } else {
        setToast(`"${term.trim()}" 已存在于当前图层`);
      }
    },
    [activeGroupId, workGroups]
  );

  const lastMapClickRef = useRef<{ term: string; time: number } | null>(null);
  const [guideFocusPath, setGuideFocusPath] = useState<number[]>([]);

  const handleGuideMapNodeClick = useCallback(
    async (term: string, nodePath?: number[]) => {
      const now = Date.now();
      const last = lastMapClickRef.current;
      if (last && last.term === term && now - last.time < 600) {
        const parentPath = nodePath ? nodePath.slice(0, -1) : guideFocusPath;
        setGuideFocusPath(parentPath);
        handleFocusNode(term);
        setShowGuideMap(false);
        lastMapClickRef.current = null;
      } else {
        lastMapClickRef.current = { term, time: now };
        setPreviewTitle(term);

        const n = nodeList.find(x => x.title.toLowerCase() === term.toLowerCase());
        if (n) {
          setPreviewContent(buildNodePreview(n));
        } else {
          setPreviewContent(null);
        }
      }
    },
    [handleFocusNode, guideFocusPath, buildNodePreview]
  );

  const handleGuideMapNavigate = useCallback((focusPath: number[], pathStr: string) => {
      const entry: NavEntry = { type: "guideMap", pathStr, focusPath };
      const idx = navIndexRef.current;
      navPushedRef.current = false;
      setNavHistory((prev) => {
        const next = prev.slice(0, idx + 1);
        if (next.length > 0 && navEntryEq(next[next.length - 1], entry)) return prev;
        next.push(entry);
        navPushedRef.current = true;
        return next;
      });
      setNavIndex((prev) => navPushedRef.current ? prev + 1 : prev);
    }, []);

  const handleFileLink = useCallback(
    (filename: string) => {
      const file = storedFiles.find((f) => f.name === filename);
      if (file) setActivePdf(file);
    },
    [storedFiles]
  );

  const handleGuideMapUpdate = useCallback(
    async (node: GuideMapNode) => {
      if (!activeGroupId) return;
      const group = workGroups.find((g) => g.id === activeGroupId);
      if (!group) return;
      group.guide_map = node;
      group.updated_at = Date.now();
      await putWorkGroup(group);
      setWorkGroups((prev) => prev.map((g) => (g.id === activeGroupId ? { ...group } : g)));
    },
    [activeGroupId, workGroups]
  );

  const handleGuideMapHeaderEsc = useCallback(() => {
    if (guideFocusPath.length > 0) {
      setGuideFocusPath(guideFocusPath.slice(0, -1));
    } else {
      setShowGuideMap(false);
    }
  }, [guideFocusPath]);

  const handleGuideMapRebuild = useCallback(async (scopePath: number[]) => {
    if (!activeGroupId) return;
    const group = workGroups.find((g) => g.id === activeGroupId);
    if (!group?.guide_map) return;
    if (scopePath.length === 0) {
      group.guide_map = { term: "", children: nodeList.map(n => n.title).map((t) => ({ term: t, children: [] as GuideMapNode[] })) };
    } else {
      let node: GuideMapNode | undefined;
      if (group.guide_map.term === "") {
        node = group.guide_map.children[scopePath[0]];
        for (let i = 1; i < scopePath.length && node; i++) node = node.children[scopePath[i]];
      } else {
        node = group.guide_map;
        for (let i = 0; i < scopePath.length && node; i++) node = node.children[scopePath[i]];
      }
      if (node) {
        const terms: string[] = [];
        const seen = new Set<string>();
        const collect = (n: GuideMapNode): void => {
          if (n.children.length > 0 || n.term === "") {
            n.children.forEach(collect);
          } else if (n.term && !seen.has(n.term.toLowerCase())) {
            seen.add(n.term.toLowerCase());
            terms.push(n.term);
          }
        };
        node.children.forEach(collect);
        node.children = terms.map((t) => ({ term: t, children: [] as GuideMapNode[] }));
        group.guide_map = JSON.parse(JSON.stringify(group.guide_map));
      }
    }
    group.updated_at = Date.now();
    await putWorkGroup(group);
    setWorkGroups((prev) => prev.map((g) => (g.id === activeGroupId ? { ...group } : g)));
  }, [activeGroupId, workGroups, nodeList]);

  // 当前树节点在导图中的位置（树视图面包屑与 Esc 循环回退的目标）
  const currentNodeGuidePath = useMemo<number[]>(() => {
    const title = nodeState.node?.title;
    if (!title) return [];
    return findNodePath(activeGroup?.guide_map ?? null, title) ?? [];
  }, [activeGroup?.guide_map, nodeState.node?.title]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // 编辑/重命名输入控件内按 Esc 只做本地取消，不触发视图切换；最下方输入框不阻止（Esc 正常切换）
        const t = e.target as HTMLElement | null;
        if (t && !t.classList.contains("omni-input-bar") && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
        if (showGuideMap) return;
        if (nodeState.node) {
            const entry: NavEntry = { type: "guideMap", pathStr: "根", focusPath: guideFocusPath };
            navPushedRef.current = false;
            setNavHistory((prev) => {
              const next = prev.slice(0, navIndex + 1);
              if (next.length === 0 || !navEntryEq(next[next.length - 1], entry)) { next.push(entry); navPushedRef.current = true; }
              return next;
            });
            setNavIndex((prev) => navPushedRef.current ? prev + 1 : prev);
          ensureGuideMap();
          setShowGuideMap(true);
        }
      }
        if (e.altKey && e.key === "ArrowLeft" && navIndex > 0) {
          e.preventDefault();
          setNavIndex(navIndex - 1);
          const entry = navHistory[navIndex - 1];
          if (!entry) return;
          if (entry.type === "tree") {
            setShowGuideMap(false);
            handleFocusNode(entry.term, true);
          } else {
            setShowGuideMap(true);
            setGuideFocusPath(entry.focusPath);
          }
        }
        if (e.altKey && e.key === "ArrowRight" && navIndex < navHistory.length - 1) {
          e.preventDefault();
          setNavIndex(navIndex + 1);
          const entry = navHistory[navIndex + 1];
          if (!entry) return;
          if (entry.type === "tree") {
            setShowGuideMap(false);
            handleFocusNode(entry.term, true);
          } else {
            setShowGuideMap(true);
            setGuideFocusPath(entry.focusPath);
          }
        }
    },
    [showGuideMap, nodeState.node, ensureGuideMap, navHistory, navIndex, handleFocusNode, guideFocusPath]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const [isResizing, setIsResizing] = useState(false);
  const handleResizeStart = useCallback(
    (side: "left" | "right") => (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      const startX = e.clientX;
      const minW = side === "left" ? 180 : 200;
      const maxW = side === "left" ? 400 : 500;
      const startW = side === "left" ? leftWidth : rightWidth;
      const onMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startX;
        const newW = Math.min(maxW, Math.max(minW, side === "left" ? startW + delta : startW - delta));
        if (side === "left") setLeftWidth(newW);
        else setRightWidth(newW);
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        setIsResizing(false);
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [leftWidth, rightWidth]
  );

  const hoverNode = hoverTermPreview ? nodeList.find((n) => n.title === hoverTermPreview) : null;
  const hoverPreviewLine = hoverNode?.sessions?.[0]?.entries?.[0]?.userInput?.split("\n")[0].slice(0, 30) ?? null;

  const inputBar = (
    <InputBar
      tagLabel={showGuideMap ? "在当前层级新增节点" : nodeState.activeTag.title}
      tagPrefix={showGuideMap ? "" : undefined}
      fillValue={fillValue}
      wide={rightCollapsed}
      onFocus={(text) => { setFillValue(""); handleFocusNode(text); }}
      onCreateChild={(text) => {
        setFillValue("");
        if (showGuideMap) {
          handleAddGuideMapNode(text, guideFocusPath);
        } else if (nodeState.node) {
          handleCreateEntry(text);
        } else {
          handleFocusNode(text);
        }
      }}
    />
  );

  const nodeTitles = useMemo(() => nodeList.map(n => n.title), [nodeList]);

  return (
    <NodeListContext.Provider value={nodeTitles}>
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen overflow-hidden">
        {contextTarget && (() => {
          const isSession = contextTarget.type === "session";
          const s = contextSessionRef.current;
          const entries = s?.entries ?? [];
          const isLast = entries.length > 0 && entries[entries.length - 1] === (contextTarget as { type: "entry"; entry: Entry }).entry;
          const editable = !isSession && isLast && !("entry" in contextTarget ? contextTarget.entry.assistantOutput : true);
          const nodeItems = [
            { icon: <Plus className="w-4 h-4" />, label: "新建根会话", onClick: () => { handleCreateRootSession(); closeContext(); } },
            { icon: <Pencil className="w-4 h-4" />, label: "重命名", onClick: () => { const n = contextNodeRef.current; if (n) handleRenameNode(n); closeContext(); } },
            { icon: <Trash2 className="w-4 h-4" />, label: "删除", onClick: () => { handleDeleteNodeFromMenu((contextTarget as { type: "node"; id: string }).id); }, danger: true },
          ];
          const sessionItems = [
            { icon: <Plus className="w-4 h-4" />, label: "新增上下文", onClick: () => { const s = contextSessionRef.current; if (s) { const entry = createEntry("note", ""); entry.expanded = true; s.entries = [...s.entries, entry]; s.updated_at = Date.now(); putNode(nodeRef.current!); dispatchNode({ type: "REPLACE_NODE", node: nodeRef.current! }); setEditingEntry(entry); } closeContext(); } },
            { icon: <Pencil className="w-4 h-4" />, label: "重命名", onClick: () => { const s = contextSessionRef.current; if (s) handleRenameSession(s); closeContext(); } },
            { icon: <Trash2 className="w-4 h-4" />, label: "删除", onClick: () => { handleDeleteNodeFromMenu((contextTarget as { type: "session"; id: string }).id); }, danger: true },
          ];
          const entryItems: any[] = [];
          if (editable) {
            entryItems.push({ icon: <Pencil className="w-4 h-4" />, label: "编辑", onClick: () => { setEditingEntry((contextTarget as { type: "entry"; entry: Entry }).entry); closeContext(); } });
          }
          entryItems.push(
            { icon: <Copy className="w-4 h-4" />, label: "复制", onClick: () => { const e = (contextTarget as { type: "entry"; entry: Entry }).entry; navigator.clipboard.writeText((e.userInput || "") + (e.assistantOutput ? "\n\n" + e.assistantOutput : "")); closeContext(); } },
            { icon: <GitBranch className="w-4 h-4" />, label: "从此处分支", onClick: () => { const s2 = contextSessionRef.current; if (s2) handleForkEntry(s2, (contextTarget as { type: "entry"; entry: Entry }).entry); closeContext(); } },
            { icon: <Trash2 className="w-4 h-4" />, label: "删除", onClick: () => { const s2 = contextSessionRef.current; if (s2) handleDeleteEntry(s2, (contextTarget as { type: "entry"; entry: Entry }).entry); closeContext(); }, danger: true },
          );
          return (
          <ContextMenu
            x={contextPos.x}
            y={contextPos.y}
            onClose={closeContext}
            items={isSession ? sessionItems : (contextTarget.type === "node" ? nodeItems : entryItems)}
          />
          );
        })()}
            <aside style={{ width: leftCollapsed ? 0 : leftWidth }} className={cn("shrink-0 bg-background flex flex-col overflow-hidden", !isResizing && "transition-[width] duration-300 ease-in-out", !leftCollapsed && "border-r")}>
              <div className="px-4 py-2 border-b flex items-center justify-between shrink-0">
                <span className="font-bold text-base">🌳 OmniExplore</span>
                <button
                  onClick={() => setLeftCollapsed(true)}
                  className="p-0.5 rounded hover:bg-accent text-muted-foreground"
                  title="收起侧栏"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="3"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
                </button>
              </div>
          <WorkGroupSwitcher
            groups={workGroups}
            activeGroupId={activeGroupId}
            onSelect={handleWorkGroupSelect}
            onCreate={handleWorkGroupCreate}
          />
          <div className="px-3 pt-2 shrink-0">
            <button
              onClick={() => {
                targetSessionIdRef.current = null;
                dispatchNode({ type: "CLEAR_NODE" });
                setShowGuideMap(false);
                setPreviewTitle("");
                setPreviewContent(null);
                setSidebarSearch("");
                setFillValue("");
              }}
              className="w-full flex items-center justify-center gap-1 rounded-md border border-dashed border-muted-foreground/30 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>新建节点</span>
            </button>
          </div>
          <div className="px-3 py-2 shrink-0">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={sidebarSearch}
                onChange={(e) => setSidebarSearch(e.target.value)}
                placeholder={leftTab === "nodes" ? "搜索节点…" : "搜索文件…"}
                className="w-full h-8 rounded-md border border-input bg-transparent pl-8 pr-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>
          <div className="flex items-center gap-4 px-4 pb-1.5 shrink-0">
            <button onClick={() => setLeftTab("nodes")} className={cn("text-[13px] font-semibold", leftTab === "nodes" ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>节点</button>
            <button onClick={() => setLeftTab("files")} className={cn("text-[13px] font-semibold", leftTab === "files" ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>文件</button>
          </div>
          <div className="flex-1 overflow-hidden px-4">
            {leftTab === "nodes" ? (
            <NodeLibrary
              nodeTitles={nodeList.map(n => n.title)}
              currentNodeTitle={nodeState.node?.title ?? ""}
              search={leftTab === "nodes" && sidebarSearch ? sidebarSearch : undefined}
              onNodeClick={(term) => {
                handleFocusNode(term);
              }}
              onNodeDelete={(term) => {
                const n = nodeList.find(x => x.title === term);
                if (n) { deleteNode(n.id); setNodeList(prev => prev.filter(x => x.id !== n.id)); }
                if (activePdf && term.toLowerCase() === activePdf.name.replace(/\.[^.]+$/, "").toLowerCase()) {
                  setPdfBoundNode(null);
                  pdfBindingsRef.current.delete(activePdf.name);
                  saveBindings();
                }
                if (nodeState.node?.title === term) {
                  dispatchNode({ type: "CLEAR_NODE" });
                  targetSessionIdRef.current = null;
                  setPreviewTitle("");
                  setPreviewContent(null);
                }
                removeFromGuideMap(term);
              }}
              onNodeRename={(oldTerm, newTerm) => {
                if (!newTerm || oldTerm === newTerm) return;
                const n = nodeList.find(x => x.title === oldTerm);
                const isCurrent = nodeState.node?.title === oldTerm;
                if (n) {
                  n.title = newTerm;
                  n.updated_at = Date.now();
                  putNode(n);
                  setNodeList(prev => prev.map(x => x.id === n.id ? n : x));
                }
                updateGuideMapTerm(oldTerm, newTerm);
                if (isCurrent) {
        if (pdfBoundNodeRef.current === oldTerm) {
          setPdfBoundNode(newTerm);
          pdfBindingsRef.current.forEach((v, k) => { if (v === oldTerm) pdfBindingsRef.current.set(k, newTerm); });
          saveBindings();
        }
                  setPreviewTitle(newTerm);
                  dispatchNode({ type: "RENAME_NODE", title: newTerm });
                  dispatchNode({ type: "SET_ACTIVE_TAG", sessionId: nodeState.node!.id, title: newTerm });
                }
              }}
              showGuideMap={showGuideMap}
              onAddToGuideMap={showGuideMap ? (term) => {
                (async () => {
                  if (!activeGroupId) return;
                  const group = workGroups.find((g) => g.id === activeGroupId);
                  if (!group) return;
                  if (!group.guide_map) {
                    group.guide_map = { term: "", children: [] };
                  }
                  const path = guideFocusPath;
                  const newChild: GuideMapNode = { term: term.trim(), children: [] };
                  const newTree = structuredClone(group.guide_map);

                  let added = false;
                  if (path.length === 0) {
                    const lower = term.trim().toLowerCase();
                    const exists = newTree.children.some((c) => c.term.toLowerCase() === lower);
                    if (!exists) {
                      newTree.children.push(newChild);
                      added = true;
                    }
                  } else {
                    const parent = newTree.term === "" && path.length === 1
                      ? newTree.children[path[0]]
                      : (() => {
                          let n: GuideMapNode = newTree.term === "" ? newTree.children[path[0]] : newTree;
                          for (let i = newTree.term === "" ? 1 : 0; i < path.length; i++) {
                            n = n.children[path[i]];
                          }
                          return n;
                        })();
                    if (parent) {
                      const lower = term.trim().toLowerCase();
                      const exists = parent.children.some((c) => c.term.toLowerCase() === lower);
                      if (!exists) {
                        parent.children.push(newChild);
                        added = true;
                      }
                    }
                  }
                  if (added) {
                    group.guide_map = newTree;
                    group.updated_at = Date.now();
                    await putWorkGroup(group);
                    setWorkGroups((prev) => prev.map((g) => (g.id === activeGroupId ? { ...group } : g)));
                  } else {
                    setToast(`"${term.trim()}" 已存在于当前图层`);
                  }
                })();
              } : undefined}
            />
            ) : (
            <FilesList
              files={storedFiles}
              onFileClick={(file) => {
                setActivePdf(file);
                if (!nodeState.node?.title) {
                  const bound = pdfBindingsRef.current.get(file.name);
                  handleFocusNode(bound || file.name.replace(/\.[^.]+$/, ""));
                }
              }}
              search={leftTab === "files" ? sidebarSearch : undefined}
              onUpload={async (f) => { await putFile(f); setStoredFiles((prev) => [...prev, f]); }}
              onDelete={async (id) => { await deleteFile(id); setStoredFiles((prev) => prev.filter((f) => f.id !== id)); }}
            />
            )}
          </div>
          <div className="border-t p-1.5 flex items-center gap-1">
            <SettingsPanel
                nodeTitles={nodeList.map(n => n.title)}
                onNodeDelete={(term) => {
                  const n = nodeList.find(x => x.title === term);
                  if (n) { deleteNode(n.id); setNodeList(prev => prev.filter(x => x.id !== n.id)); }
                  if (nodeState.node?.title === term) {
      dispatchNode({ type: "CLEAR_NODE" });
      targetSessionIdRef.current = null;
                    setPreviewTitle("");
                    setPreviewContent(null);
                  }
                  removeFromGuideMap(term);
                }}
              plusMenuItems={plusMenuItems}
              onPlusMenuItemsChange={savePlusMenu}
              selectionMenuItems={selectionMenuItems}
              onSelectionMenuItemsChange={saveSelectionMenu}
            />
            <ThemeMenu />
          </div>
            </aside>
        {!leftCollapsed && (
            <div
              className="w-1 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 shrink-0 transition-colors"
              onMouseDown={handleResizeStart("left")}
            />
        )}
        {leftCollapsed && (
          <div className="w-10 shrink-0 border-r bg-background flex flex-col items-center py-2 gap-3 transition-all duration-300 ease-in-out">
            <button
              onClick={() => setLeftCollapsed(false)}
              className="p-0.5 rounded hover:bg-accent text-muted-foreground"
              title="展开侧栏"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="3"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
            </button>
          </div>
        )}

        <main className="flex-1 flex flex-col min-w-0">
          <header className="flex items-center px-4 py-2 border-b shrink-0">
            <div className="flex items-center gap-3 flex-1">
              <div className="flex items-center gap-0.5">
                <button
                  disabled={navIndex <= 0}
                  onClick={() => {
                    if (navIndex <= 0) return;
                    setNavIndex(navIndex - 1);
                    const entry = navHistory[navIndex - 1];
                    if (!entry) return;
                    if (entry.type === "tree") {
                      setShowGuideMap(false);
                      handleFocusNode(entry.term, true);
                    } else {
                      setShowGuideMap(true);
                      setGuideFocusPath(entry.focusPath);
                    }
                  }}
                  className="p-0.5 rounded hover:bg-accent disabled:opacity-30 transition-colors"
                  title="Alt+← 后退"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
                </button>
                <button
                  disabled={navIndex >= navHistory.length - 1}
                  onClick={() => {
                    if (navIndex >= navHistory.length - 1) return;
                    setNavIndex(navIndex + 1);
                    const entry = navHistory[navIndex + 1];
                    if (!entry) return;
                    if (entry.type === "tree") {
                      setShowGuideMap(false);
                      handleFocusNode(entry.term, true);
                    } else {
                      setShowGuideMap(true);
                      setGuideFocusPath(entry.focusPath);
                    }
                  }}
                  className="p-0.5 rounded hover:bg-accent disabled:opacity-30 transition-colors"
                  title="Alt+→ 前进"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                </button>
              </div>
              <span className="font-semibold text-base shrink-0">{activeGroup?.name || "OmniExplore"}</span>
              {!showGuideMap && nodeState.node && (
                <div className="flex items-center min-w-0 ml-2">
                  <button
                    onClick={() => { ensureGuideMap(); setShowGuideMap(true); }}
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    title="进入组合视图"
                  >
                    <Layers className="w-4 h-4" />
                    <span className="text-xs">组合</span>
                  </button>
                  <GuideBreadcrumb
                    map={activeGroup?.guide_map ?? null}
                    path={currentNodeGuidePath}
                    onRoot={() => { ensureGuideMap(); setGuideFocusPath([]); setShowGuideMap(true); }}
                    onNavigate={(p) => { ensureGuideMap(); setGuideFocusPath(p); setShowGuideMap(true); }}
                  />
                  <ChevronRight className="w-4 h-4 text-muted-foreground mx-0.5 shrink-0" />
                  <span className="text-xs font-medium truncate">{nodeState.node?.title ?? ""}</span>
                </div>
              )}
              {showGuideMap && (
                <div className="flex items-center min-w-0 ml-2">
                  <button
                    onClick={handleGuideMapHeaderEsc}
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    title={guideFocusPath.length > 0 ? "ESC 返回上层" : "返回树视图"}
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span className="text-xs">{guideFocusPath.length > 0 ? "上层" : "返回"}</span>
                  </button>
                  {activeGroup?.guide_map && (
                    <>
                      <GuideBreadcrumb
                        map={activeGroup.guide_map}
                        path={guideFocusPath}
                        onRoot={() => { ensureGuideMap(); setGuideFocusPath([]); }}
                        onNavigate={(p) => setGuideFocusPath(p)}
                      />
                      <button
                        onClick={() => handleGuideMapRebuild(guideFocusPath)}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors ml-2 shrink-0"
                        title="从节点库重建"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 2v6h-6M3 12a9 9 0 0115.36-6.36L21 8M3 22v-6h6M21 12a9 9 0 01-15.36 6.36L3 16"/></svg>
                        <span>重建</span>
                      </button>
                    </>
                  )}
                </div>
              )}
              <div className="flex-1" />
              <button
                onClick={() => setRightCollapsed(!rightCollapsed)}
                className="p-0.5 rounded hover:bg-accent text-muted-foreground"
                title={rightCollapsed ? "展开预览面板" : "收起预览面板"}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {rightCollapsed
                    ? <><rect x="3" y="3" width="18" height="18" rx="3"/><line x1="15" y1="3" x2="15" y2="21"/></>
                    : <><rect x="3" y="3" width="18" height="18" rx="3"/><line x1="15" y1="3" x2="15" y2="21"/></>
                  }
                </svg>
              </button>
            </div>
          </header>

          <div className="flex-1 flex flex-col min-h-0">
              {showGuideMap ? (
              <div className="flex-1 min-h-0 max-w-4xl mx-auto w-full">
              <GuideMapCanvas
                guideMap={activeGroup?.guide_map ?? null}
                initialFocusPath={guideFocusPath}
                  onNodeClick={handleGuideMapNodeClick}
                termList={nodeList.map(n => n.title)}
                currentFocusTerm={nodeState.node?.title ?? ""}
                onUpdate={handleGuideMapUpdate}
                onBack={() => {
                  setShowGuideMap(false);
                  if (nodeState.node?.title) {
                    setPreviewTitle(nodeState.node.title);
                    const n = nodeList.find(x => x.title.toLowerCase() === nodeState.node!.title.toLowerCase());
                    if (n) {
                      setPreviewContent(buildNodePreview(n));
                    } else {
                      setPreviewContent(null);
                    }
                  }
                }}
                onNavigate={handleGuideMapNavigate}
                onFocusPathChange={setGuideFocusPath}
                onRebuild={handleGuideMapRebuild}
              />
              </div>
            ) : nodeState.node ? (
              <div className="flex-1 overflow-auto" onClick={() => handleSelectSession(null)}>
                <div className="flex flex-col min-h-full">
                  <div className="flex-1">
                    <div className="max-w-4xl mx-auto pt-4 pr-4 pb-24">
                      <NodeView key={nodeState.node.id} node={nodeState.node}
                        selectedEntry={nodeState.selectedEntry}
                        selectedSession={nodeState.selectedSession}
                        onSelectNode={() => handleSelectSession(null)}
                        onSelectSession={handleSelectSession}
                        onToggleExpand={handleToggleEntryExpand} onSelect={handleSelectEntry}
                        onSessionContextMenu={handleSessionContextMenu} onNodeContextMenu={handleNodeContextMenu} onEntryContextMenu={handleEntryContextMenu}
                        onSelectionContextMenu={handleSelectionContextMenu}
                        onTermDoubleClick={handleFocusNode} onTermHover={handleTermHover} onTermLeave={handleTermLeave} onFileLink={handleFileLink}
                        onPlusSelect={handlePlusSelect} onCreateEmptyEntry={handleCreateEmptyEntry}
                        onCreateRootSession={handleCreateRootSession}
                        onNodeFocus={(session, title) => {
                          dispatchNode({ type: "SET_ACTIVE_TAG", sessionId: session.id, title });
                          targetSessionIdRef.current = session.id;
                        }}
                        onEditEntry={(session, entry) => setEditingEntry(entry)} onDeleteEntry={handleDeleteEntry} onForkEntry={handleForkEntry}
                        onRenameSession={handleRenameSession} onRenameNode={handleRenameNode} onDeleteNode={handleDeleteNodeFromMenu}
                        plusItems={subPlusMenuItems} rootPlusItems={rootPlusMenuItems} editingEntry={editingEntry} renamingNodeId={renamingNodeId}
                        onEditingChange={handleEditingChange} onEditSubmit={handleEditSubmit} onNodeRenameSubmit={handleNodeRenameSubmit}
                      />
                    </div>
                  </div>
                  <div className="sticky bottom-0 z-50 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {inputBar}
                  </div>
                </div>
              </div>
            ) : (
              <Onboarding
                recentTerms={recentInputs}
                onTermClick={handleFocusNode}
                onSubmit={handleFocusNode}
              />
            )}

            {showGuideMap || !nodeState.node ? inputBar : null}
          </div>
        </main>

        {!rightCollapsed && !activePdf && (
            <div
              className="w-1 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 shrink-0 transition-colors"
              onMouseDown={handleResizeStart("right")}
            />
        )}
            <div style={{ width: rightCollapsed ? 0 : rightWidth }} className={cn("shrink-0", !isResizing && "transition-[width] duration-300 ease-in-out", !activePdf && "overflow-hidden")}>
        {activePdf ? (
          <PDFViewer data={activePdf.data} fileName={activePdf.name} onClose={() => setActivePdf(null)}
            boundNodeExists={pdfBoundNode !== null}
            onCreateBoundNode={() => {
              const termName = activePdf.name.replace(/\.[^.]+$/, "");
              handleFocusNode(termName);
              setPdfBoundNode(termName);
              pdfBindingsRef.current.set(activePdf.name, termName);
              saveBindings();
            }}
            onSelectionContextMenu={(e, sel) => handleSelectionContextMenu(e as any, sel, null)}
          />
        ) : (
        <PreviewPanel
          nodeName={previewTitle}
          content={previewContent}
        />
        )}
            </div>
      </div>
        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-md bg-foreground text-background text-sm shadow-lg transition-opacity duration-200">
            {toast}
          </div>
        )}
        {hoverTermPreview && hoverTermPreviewAnchor && (
          <HoverPreview
            term={hoverTermPreviewTerm}
            preview={hoverPreviewLine ?? hoverTermPreview}
            anchorRect={hoverTermPreviewAnchor}
            onClose={handleTermLeave}
          />
        )}
    </TooltipProvider>
    </NodeListContext.Provider>
  );
}
