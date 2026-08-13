"use client";

import { useEffect, useReducer, useState, useCallback, useRef } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NodeListContext } from "@/lib/NodeListContext";
import { WorkGroupSwitcher } from "@/components/WorkGroupSwitcher";
import { InputBar } from "@/components/InputBar";
import { SettingsPanel } from "@/components/SettingsPanel";
import { PreviewPanel } from "@/components/PreviewPanel";
import { GuideMapCanvas, buildBreadcrumbItems } from "@/components/GuideMapCanvas";
import { NodeLibrary } from "@/components/NodeLibrary";
import { FilesList } from "@/components/FilesList";
import { PDFViewer } from "@/components/PDFViewer";
import { Onboarding } from "@/components/Onboarding";
import { ContextMenu } from "@/components/ContextMenu";
import { HoverPreview } from "@/components/HoverPreview";
import { initializeConfig, useConfigStore } from "@/store/configStore";
import { getAllWorkGroups, putWorkGroup, deleteWorkGroup as deleteWG, getAllFiles, putFile, deleteFile, migrateData } from "@/services/cache";
import { streamLLMChat, LLMError } from "@/services/llm";
import { cn } from "@/lib/utils";
import { Layers, ChevronRight, Search, Plus, Pencil, Trash2, Copy, GitBranch } from "lucide-react";
import { DEFAULT_PLUS_TEMPLATES, DEFAULT_SELECTION_TEMPLATES } from "@/lib/constants";
import { intuitionPrompt, definitionPrompt, applicationPrompt, motivationPrompt, loadCustomPresetPrompts } from "@/services/prompts";
import type {
  WorkGroup,
  GuideMapNode,
  PlusMenuItem,
  StoredFile,
} from "@/types";
import { NodeView } from "@/components/NodeView";
import { nodeReducer, getInitialNodeState, createSession, createEntry } from "@/store/nodeStore";
import { putSession, deleteSession, getAllSessions } from "@/services/cache";
import type { Session, Entry } from "@/types";

function buildDefaultPlusMenu(): PlusMenuItem[] {
  return DEFAULT_PLUS_TEMPLATES.map((t, i) => ({
    id: `default_${i}`,
    label: t.label,
    prompt: t.prompt,
  }));
}

const ROOT_PRESET_LABELS: Record<string, string> = {
  micro_intuition: "动态直觉",
  micro_definition: "看定义",
  micro_application: "看应用",
  micro_motivation: "看动机",
};

const ROOT_PRESET_DEFAULTS: Record<string, { system: string; user: string }> = {
  micro_intuition: intuitionPrompt("${term}"),
  micro_definition: definitionPrompt("${term}"),
  micro_application: applicationPrompt("${term}"),
  micro_motivation: motivationPrompt("${term}"),
};

const rootPlusMenuItems: PlusMenuItem[] = Object.keys(ROOT_PRESET_LABELS).map((k) => ({
  id: `root_${k}`,
  label: ROOT_PRESET_LABELS[k],
  prompt: ROOT_PRESET_DEFAULTS[k].user,
}));

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
  const [nodeList, setNodeList] = useState<Session[]>([]);
  const nodeRef = useRef(nodeState.session);
  nodeRef.current = nodeState.session;
  const targetNodeIdRef = useRef<string | null>(null);

  const findSessionInTree = useCallback((id: string): Session | undefined => {
    const root = nodeRef.current;
    if (!root) return undefined;
    if (root.id === id) return root;
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
    return search(root);
  }, []);
  const [contextTarget, setContextTarget] = useState<{ type: "session"; id: string } | { type: "entry"; entry: Entry } | null>(null);
  const [contextPos, setContextPos] = useState({ x: 0, y: 0 });
  const closeContext = useCallback(() => { setContextTarget(null); contextNodeRef.current = null; }, []);
  const contextNodeRef = useRef<Session | null>(null);
  const renameNodeRef = useRef<Session | null>(null);
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
  const [rightCollapsed, setRightCollapsed] = useState(false);
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
  const hadPdfRef = useRef(false);

  useEffect(() => {
    if (activePdf) {
      if (!hadPdfRef.current) {
        prevRightRef.current = rightWidth;
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
    const sessions = await getAllSessions(groupId);
    if (seq !== nodeListLoadSeqRef.current) return;
    const normalized = sessions.map(s => ({
      ...s,
      entries: s.entries.map(e => ({ ...e, children: e.children || [] })),
    }));
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

  const handlePlusSelect = useCallback((item: PlusMenuItem, sessionTitle: string) => {
    if (item.id.startsWith("root_")) {
      const key = item.id.slice(5);
      const overrides = loadCustomPresetPrompts();
      const preset = overrides[key] || ROOT_PRESET_DEFAULTS[key];
      presetSystemRef.current = preset.system;
      setFillValue(preset.user.replace(/\$\{term\}/g, sessionTitle));
    } else {
      presetSystemRef.current = null;
      setFillValue(item.prompt.replace(/\$\{term\}/g, sessionTitle));
    }
  }, []);

  const addRecentInput = useCallback((text: string) => {
    setRecentInputs((prev) => {
      const next = [text, ...prev.filter((t) => t !== text)].slice(0, 20);
      localStorage.setItem("input_history", JSON.stringify(next));
      return next;
    });
  }, []);

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
    const currentTitle = title ?? nodeState.session?.title;
    if (currentTitle && group.guide_map) {
      const lower = currentTitle.toLowerCase();
      const exists = group.guide_map.children.some((c) => c.term.toLowerCase() === lower);
      if (!exists) {
        group.guide_map = { ...group.guide_map, children: [...group.guide_map.children, { term: currentTitle, children: [] }] };
        group.updated_at = Date.now();
        putWorkGroup(group);
        setWorkGroups((prev) => prev.map((g) => (g.id === activeGroupId ? { ...group } : g)));
      }
    }
  }, [activeGroupId, workGroups, nodeState.session?.title]);

  const handleFocusNode = useCallback(async (title: string, silent = false) => {
    if (!title.trim()) return;
    const existing = nodeList.find(s => s.title.toLowerCase() === title.trim().toLowerCase() && !s.parentSessionId);
    if (existing) {
      targetNodeIdRef.current = existing.id;
      dispatchNode({ type: "SET_SESSION", session: existing });
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
      // Set preview content
      const plines: string[] = [];
      for (const e of existing.entries) {
        plines.push(`  💬 ${e.userInput.split('\n')[0].slice(0, 30)}`);
      }
      setPreviewContent(plines.join("\n"));
      return;
    }
    const session = createSession(title.trim(), activeGroupId ?? undefined);
    targetNodeIdRef.current = session.id;
    dispatchNode({ type: "SET_SESSION", session });
    dispatchNode({ type: "SET_ACTIVE_TAG", sessionId: session.id, title: session.title });
    await putSession(session);
    setNodeList((prev) => [...prev.filter(s => s.id !== session.id), session]);
    addRecentInput(title);
    setShowGuideMap(false);
    setPreviewTitle(session.title);
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
    // Set preview content from entries
    const plines: string[] = [];
    for (const e of session.entries) {
      plines.push(`  💬 ${e.userInput.split('\n')[0].slice(0, 30)}`);
    }
    setPreviewContent(plines.join("\n"));
  }, [nodeList, addRecentInput, navIndex, ensureGuideMap, activeGroupId]);

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
        if (!abort.signal.aborted) {
          dispatchNode({ type: "SET_ENTRY_STATUS", entry, status: "done" });
        }
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

  const handleCreateEntry = useCallback(async (userInput: string) => {
    const s = findSessionInTree(targetNodeIdRef.current ?? "") || nodeRef.current;
    if (!s || !userInput.trim()) return;
    setFillValue("");
    const systemPrompt = presetSystemRef.current ?? "你是一个有帮助的人工智能助手。";
    presetSystemRef.current = null;
    const entry = createEntry("qa", userInput.trim());
    entry.status = "loading";
    entry.expanded = true;
    s.entries = [...s.entries, entry];
    s.updated_at = Date.now();
    dispatchNode({ type: "REPLACE_SESSION", session: { ...nodeRef.current! } });
    await putSession(nodeRef.current!);
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
      messages.push({ role: "user", content: userInput.trim() });
      console.log("[OmniExplore] messages:", messages.map(m => `${m.role}: ${m.content.slice(0, 60)}`));
      await handleStreamEntry(entry, config, messages);
      s.updated_at = Date.now();
      await putSession(nodeRef.current!);
      dispatchNode({ type: "REPLACE_SESSION", session: { ...nodeRef.current! } });
    }
  }, [config, isConfigured, handleStreamEntry, findSessionInTree]);

  const handleToggleEntryExpand = useCallback(async (session: Session, entry: Entry) => {
    entry.expanded = !entry.expanded;
    session.updated_at = Date.now();
    await putSession(nodeRef.current!);
    dispatchNode({ type: "REPLACE_SESSION", session: { ...nodeRef.current! } });
  }, []);

  const handleSelectEntry = useCallback((entry: Entry | null) => { dispatchNode({ type: "SET_SELECTED_ENTRY", entry }); }, []);
  const handleSelectSession = useCallback((session: Session | null) => {
    dispatchNode({ type: "SET_SELECTED_SESSION", session });
    if (session) {
      dispatchNode({ type: "SET_ACTIVE_TAG", sessionId: session.id, title: session.title });
      targetNodeIdRef.current = session.id;
    }
  }, []);

  const handleCreateEmptyEntry = useCallback(async () => {
    const s = findSessionInTree(targetNodeIdRef.current ?? "") || nodeRef.current;
    if (!s) return;
    const entry = createEntry("note", "");
    s.entries = [...s.entries, entry];
    s.updated_at = Date.now();
    dispatchNode({ type: "REPLACE_SESSION", session: { ...nodeRef.current! } });
    await putSession(nodeRef.current!);
  }, [findSessionInTree]);

  const handleDeleteEntry = useCallback(async (session: Session, entry: Entry) => {
    session.entries = session.entries.filter(e => e !== entry);
    session.updated_at = Date.now();
    await putSession(nodeRef.current!);
    dispatchNode({ type: "REPLACE_SESSION", session: { ...nodeRef.current! } });
  }, []);

  const handleForkEntry = useCallback(async (session: Session, entry: Entry) => {
    const forkNum = entry.children.length + 1;
    const child = createSession(`${session.title} (分支#${forkNum})`, session.groupId);
    child.parentSessionId = session.id;
    child.forkBoundary = "--- fork boundary ---";
    entry.children = [...entry.children, child];
    entry.expanded = true;
    session.updated_at = Date.now();
    dispatchNode({ type: "REPLACE_SESSION", session: { ...nodeRef.current! } });
    await putSession(nodeRef.current!);
  }, []);

  const handleNodeContextMenu = useCallback((e: React.MouseEvent, session: Session) => { e.preventDefault(); contextNodeRef.current = session; setContextTarget({ type: "session", id: session.id }); setContextPos({ x: e.clientX, y: e.clientY }); }, []);
  const handleEntryContextMenu = useCallback((e: React.MouseEvent, session: Session, entry: Entry) => { e.preventDefault(); contextNodeRef.current = session; setContextTarget({ type: "entry", entry }); setContextPos({ x: e.clientX, y: e.clientY }); }, []);

  const handleRenameNode = useCallback((session: Session) => { renameNodeRef.current = session; setRenamingNodeId(session.id); }, []);

  const handleDeleteNodeFromMenu = useCallback(async (sessionId: string) => {
    const s = contextNodeRef.current;
    if (!s) return;
    await deleteSession(s.id);
    if (s.parentSessionId) {
      const root = nodeRef.current;
      if (root && removeChildNode(root, s.id)) {
        root.updated_at = Date.now();
        await putSession(root);
        dispatchNode({ type: "REPLACE_SESSION", session: { ...root } });
      }
    } else {
      setNodeList(prev => prev.filter(x => x.id !== s.id));
    }
    if (nodeState.session?.id === s.id) {
      dispatchNode({ type: "CLEAR_SESSION" });
      setPreviewTitle(""); setPreviewContent(null);
    }
    closeContext();
  }, [nodeState.session, closeContext]);

  function removeChildNode(session: Session, childId: string): boolean {
    for (const e of session.entries) {
      const idx = e.children.findIndex(c => c.id === childId);
      if (idx >= 0) { e.children.splice(idx, 1); return true; }
      for (const c of e.children) { if (removeChildNode(c, childId)) return true; }
    }
    return false;
  }

  const handleNodeRenameSubmit = useCallback(async (sessionId: string, title: string) => {
    if (!title.trim()) { setRenamingNodeId(null); return; }
    const s = renameNodeRef.current || nodeRef.current;
    if (!s) { setRenamingNodeId(null); return; }
    s.title = title.trim();
    s.updated_at = Date.now();
    await putSession(nodeRef.current!);
    if (s.parentSessionId) {
      dispatchNode({ type: "REPLACE_SESSION", session: { ...nodeRef.current! } });
    } else {
      setNodeList(prev => prev.map(x => x.id === s.id ? { ...x, title: title.trim() } : x));
      if (nodeState.session?.id === s.id) dispatchNode({ type: "RENAME_SESSION", title: title.trim() });
    }
    setRenamingNodeId(null);
  }, [nodeState.session]);

  const findSessionForEntry = useCallback((entry: Entry): Session | undefined => {
    const root = nodeRef.current;
    if (!root) return undefined;
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
    return search(root);
  }, []);

  // 划词追问：先从原 entry 分支，再追加到分支 session 并回答
  const handleSelectionAsk = useCallback(async (question: string, entry: Entry | null) => {
    if (!entry) {
      const s = nodeRef.current;
      if (s) {
        targetNodeIdRef.current = s.id;
        dispatchNode({ type: "SET_ACTIVE_TAG", sessionId: s.id, title: s.title });
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
    await putSession(nodeRef.current!);
    dispatchNode({ type: "REPLACE_SESSION", session: { ...nodeRef.current! } });
    targetNodeIdRef.current = child.id;
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
          const rootTerm = nodeState.session?.title ?? "";
          const label = item.prompt
            .replace(/\$\{selected\}/g, selectedText)
            .replace(/\$\{root\}/g, rootTerm);
          handleSelectionAsk(label, entry);
        };
        menu.appendChild(btn);
      });

      document.body.appendChild(menu);
      const close = (ev: MouseEvent) => {
        if (!menu.contains(ev.target as Node)) { menu.remove(); document.removeEventListener("click", close); }
      };
      setTimeout(() => document.addEventListener("click", close), 0);
    },
    [handleFocusNode, selectionMenuItems, nodeState.session?.title, handleSelectionAsk]
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
    await putSession(nodeRef.current!);
    dispatchNode({ type: "REPLACE_SESSION", session: { ...nodeRef.current! } });
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
      targetNodeIdRef.current = null;
      setGuideFocusPath([]);
      dispatchNode({ type: "CLEAR_SESSION" });
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
      targetNodeIdRef.current = null;
      setGuideFocusPath([]);
      dispatchNode({ type: "CLEAR_SESSION" });
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
      const groupSessions = await getAllSessions(id);
      await Promise.all(groupSessions.map((s) => deleteSession(s.id)));
      await deleteWG(id);
      setWorkGroups((prev) => prev.filter((g) => g.id !== id));
      if (activeGroupId === id) {
        const remaining = workGroups.filter((g) => g.id !== id);
        localStorage.removeItem("active_group_id");
        targetNodeIdRef.current = null;
        setGuideFocusPath([]);
        dispatchNode({ type: "CLEAR_SESSION" });
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

        const s = nodeList.find(n => n.title.toLowerCase() === term.toLowerCase());
        if (s) {
          const lines: string[] = [];
          for (const entry of s.entries) {
            const firstLine = entry.userInput.split('\n')[0].slice(0, 30);
            lines.push(`  💬 ${firstLine}`);
          }
          setPreviewContent(lines.join("\n"));
        } else {
          setPreviewContent(null);
        }
      }
    },
    [handleFocusNode, guideFocusPath]
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

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showGuideMap) return;
        if (nodeState.session) {
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
    [showGuideMap, nodeState.session, ensureGuideMap, navHistory, navIndex, handleFocusNode, guideFocusPath]
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

  const hoverNode = hoverTermPreview ? nodeList.find((s) => s.title === hoverTermPreview) : null;
  const hoverPreviewLine = hoverNode?.entries?.[0]?.userInput?.split("\n")[0].slice(0, 30) ?? null;

  return (
    <NodeListContext.Provider value={nodeList.map(s => s.title)}>
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen overflow-hidden">
        {contextTarget && (() => {
          const isSession = contextTarget.type === "session";
          const s = contextNodeRef.current;
          const entries = s?.entries ?? [];
          const isLast = entries.length > 0 && entries[entries.length - 1] === (contextTarget as { type: "entry"; entry: Entry }).entry;
          const editable = !isSession && isLast && !("entry" in contextTarget ? contextTarget.entry.assistantOutput : true);
          const sessionItems = [
            { icon: <Plus className="w-4 h-4" />, label: "新增上下文", onClick: () => { const s = contextNodeRef.current; if (s) { s.entries = [...s.entries, createEntry("note", "")]; s.updated_at = Date.now(); putSession(nodeRef.current!); dispatchNode({ type: "REPLACE_SESSION", session: { ...nodeRef.current! } }); } closeContext(); } },
            { icon: <Pencil className="w-4 h-4" />, label: "重命名", onClick: () => { const s = contextNodeRef.current; if (s) handleRenameNode(s); closeContext(); } },
            { icon: <Trash2 className="w-4 h-4" />, label: "删除", onClick: () => { handleDeleteNodeFromMenu((contextTarget as { type: "session"; id: string }).id); }, danger: true },
          ];
          const entryItems: any[] = [];
          if (editable) {
            entryItems.push({ icon: <Pencil className="w-4 h-4" />, label: "编辑", onClick: () => { setEditingEntry((contextTarget as { type: "entry"; entry: Entry }).entry); closeContext(); } });
          }
          entryItems.push(
            { icon: <Copy className="w-4 h-4" />, label: "复制", onClick: () => { const e = (contextTarget as { type: "entry"; entry: Entry }).entry; navigator.clipboard.writeText((e.userInput || "") + (e.assistantOutput ? "\n\n" + e.assistantOutput : "")); closeContext(); } },
            { icon: <GitBranch className="w-4 h-4" />, label: "从此处分支", onClick: () => { const s2 = contextNodeRef.current; if (s2) handleForkEntry(s2, (contextTarget as { type: "entry"; entry: Entry }).entry); closeContext(); } },
            { icon: <Trash2 className="w-4 h-4" />, label: "删除", onClick: () => { const s2 = contextNodeRef.current; if (s2) handleDeleteEntry(s2, (contextTarget as { type: "entry"; entry: Entry }).entry); closeContext(); }, danger: true },
          );
          return (
          <ContextMenu
            x={contextPos.x}
            y={contextPos.y}
            onClose={closeContext}
            items={isSession ? sessionItems : entryItems}
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
                targetNodeIdRef.current = null;
                dispatchNode({ type: "CLEAR_SESSION" });
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
              nodeTitles={nodeList.filter(s => !s.parentSessionId).map(s => s.title)}
              currentNodeTitle={nodeState.session?.title ?? ""}
              search={leftTab === "nodes" && sidebarSearch ? sidebarSearch : undefined}
              onNodeClick={(term) => {
                handleFocusNode(term);
              }}
              onNodeDelete={(term) => {
                const s = nodeList.find(x => x.title === term);
                if (s) { deleteSession(s.id); setNodeList(prev => prev.filter(x => x.id !== s.id)); }
                if (activePdf && term.toLowerCase() === activePdf.name.replace(/\.[^.]+$/, "").toLowerCase()) {
                  setPdfBoundNode(null);
                  pdfBindingsRef.current.delete(activePdf.name);
                  saveBindings();
                }
                if (nodeState.session?.title === term) {
                  dispatchNode({ type: "CLEAR_SESSION" });
                  setPreviewTitle("");
                  setPreviewContent(null);
                }
                const group = workGroups.find((g) => g.id === activeGroupId);
                if (group?.guide_map) {
                  const removeFrom = (n: GuideMapNode): GuideMapNode => ({
                    ...n,
                    children: n.children.filter((c) => c.term.toLowerCase() !== term.toLowerCase()).map(removeFrom),
                  });
                  const cleaned = removeFrom(group.guide_map);
                  if (JSON.stringify(cleaned) !== JSON.stringify(group.guide_map)) {
                    group.guide_map = cleaned;
                    group.updated_at = Date.now();
                    putWorkGroup(group);
                    setWorkGroups((prev) => prev.map((g) => (g.id === activeGroupId ? { ...group } : g)));
                  }
                }
              }}
              onNodeRename={(oldTerm, newTerm) => {
                if (!newTerm || oldTerm === newTerm) return;
                if (nodeState.session?.title === oldTerm) {
        if (pdfBoundNodeRef.current === oldTerm) {
          setPdfBoundNode(newTerm);
          pdfBindingsRef.current.forEach((v, k) => { if (v === oldTerm) pdfBindingsRef.current.set(k, newTerm); });
          saveBindings();
        }
                  setPreviewTitle(newTerm);
                  const s = nodeList.find(n => n.title === oldTerm);
                  if (s) {
                    s.title = newTerm;
                    s.updated_at = Date.now();
                    putSession(s);
                    setNodeList(prev => prev.map(n => n.id === s.id ? { ...n, title: newTerm } : n));
                  }
                  const group = workGroups.find((g) => g.id === activeGroupId);
                  if (group?.guide_map) {
                    const updateTerm = (n: GuideMapNode): GuideMapNode => ({
                      ...n, term: n.term.toLowerCase() === oldTerm.toLowerCase() ? newTerm : n.term,
                      children: n.children.map(updateTerm),
                    });
                    group.guide_map = updateTerm(group.guide_map);
                    group.updated_at = Date.now();
                    putWorkGroup(group);
                    setWorkGroups((prev) => prev.map((g) => (g.id === activeGroupId ? { ...group } : g)));
                  }
                  dispatchNode({ type: "RENAME_SESSION", title: newTerm });
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
                if (!nodeState.session?.title) {
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
          <div className="border-t p-1.5">
            <SettingsPanel
                nodeTitles={nodeList.filter(s => !s.parentSessionId).map(s => s.title)}
                onNodeDelete={(term) => {
                  const s = nodeList.find(x => x.title === term);
                  if (s) { deleteSession(s.id); setNodeList(prev => prev.filter(x => x.id !== s.id)); }
                  if (nodeState.session?.title === term) {
      dispatchNode({ type: "CLEAR_SESSION" });
      targetNodeIdRef.current = null;
                    setPreviewTitle("");
                    setPreviewContent(null);
                  }
                }}
              plusMenuItems={plusMenuItems}
              onPlusMenuItemsChange={savePlusMenu}
              selectionMenuItems={selectionMenuItems}
              onSelectionMenuItemsChange={saveSelectionMenu}
            />
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
              <span className="font-semibold text-base">{activeGroup?.name || "OmniExplore"}</span>
              {showGuideMap && (
                <span className="text-xs text-muted-foreground bg-accent rounded px-2 py-0.5">
                  组合视图 · Esc 返回
                </span>
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

          <div className="flex-1 flex flex-col min-h-0 max-w-3xl mx-auto w-full">
              {!showGuideMap && nodeState.session && (
                <div className="flex items-center px-4 py-2 border-b shrink-0">
                  <button
                    onClick={() => { ensureGuideMap(); setShowGuideMap(true); }}
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    title="进入组合视图"
                  >
                    <Layers className="w-4 h-4" />
                    <span className="text-xs">组合</span>
                  </button>
                  <button
                    onClick={() => { ensureGuideMap(); setShowGuideMap(true); setGuideFocusPath([]); }}
                    className="text-xs px-1 py-0.5 rounded text-muted-foreground hover:text-foreground transition-colors ml-3 max-w-[120px] truncate"
                  >簇</button>
                  {buildBreadcrumbItems(activeGroup?.guide_map ?? null, guideFocusPath).map((item, i) => (
                    <span key={i} className="flex items-center gap-0.5">
                      <ChevronRight className="w-4 h-4 text-muted-foreground mx-0.5" />
                      <button
                        onClick={() => { ensureGuideMap(); setShowGuideMap(true); setGuideFocusPath(item.path); }}
                        className="text-xs px-1 py-0.5 rounded text-muted-foreground hover:text-foreground transition-colors max-w-[120px] truncate"
                      >{item.label}</button>
                    </span>
                  ))}
                  <ChevronRight className="w-4 h-4 text-muted-foreground mx-0.5" />
                  <span className="text-xs font-medium">{nodeState.session?.title ?? ""}</span>
                </div>
              )}
              {showGuideMap ? (
              <GuideMapCanvas
                guideMap={activeGroup?.guide_map ?? null}
                initialFocusPath={guideFocusPath}
                  onNodeClick={handleGuideMapNodeClick}
                termList={nodeList.filter(s => !s.parentSessionId).map(s => s.title)}
                currentFocusTerm={nodeState.session?.title ?? ""}
                onUpdate={handleGuideMapUpdate}
                onBack={() => {
                  setShowGuideMap(false);
                  if (nodeState.session?.title) {
                    setPreviewTitle(nodeState.session.title);
                    const s = nodeList.find(n => n.title.toLowerCase() === nodeState.session!.title.toLowerCase());
                    if (s) {
                      const plines: string[] = [];
                      for (const entry of s.entries) {
                        const firstLine = entry.userInput.split('\n')[0].slice(0, 30);
                        plines.push(`  💬 ${firstLine}`);
                      }
                      setPreviewContent(plines.join("\n"));
                    } else {
                      setPreviewContent(null);
                    }
                  }
                }}
                onNavigate={handleGuideMapNavigate}
                onFocusPathChange={setGuideFocusPath}
                  onRebuild={async (scopePath: number[]) => {
                  if (!activeGroupId) return;
                  const group = workGroups.find((g) => g.id === activeGroupId);
                  if (!group?.guide_map) return;
                  if (scopePath.length === 0) {
                    group.guide_map = { term: "", children: nodeList.filter(s => !s.parentSessionId).map(s => s.title).map((t) => ({ term: t, children: [] as GuideMapNode[] })) };
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
                }}
              />
            ) : nodeState.session ? (
              <div className="flex-1 overflow-auto" onClick={() => handleSelectSession(null)}><div className="p-4">
                <NodeView session={nodeState.session} depth={0}
                  selectedEntry={nodeState.selectedEntry}
                  selectedSession={nodeState.selectedSession}
                  onSelectSession={handleSelectSession}
                  onToggleExpand={handleToggleEntryExpand} onSelect={handleSelectEntry}
                  onNodeContextMenu={handleNodeContextMenu} onEntryContextMenu={handleEntryContextMenu}
                  onSelectionContextMenu={handleSelectionContextMenu}
                  onTermDoubleClick={handleFocusNode} onTermHover={handleTermHover} onTermLeave={handleTermLeave} onFileLink={handleFileLink}
                  onPlusSelect={handlePlusSelect} onCreateEmptyEntry={handleCreateEmptyEntry}
                  onNodeFocus={(session, title) => {
                    dispatchNode({ type: "SET_ACTIVE_TAG", sessionId: session.id, title });
                    targetNodeIdRef.current = session.id;
                  }}
                  onEditEntry={(session, entry) => setEditingEntry(entry)} onDeleteEntry={handleDeleteEntry} onForkEntry={handleForkEntry}
                  onRenameNode={handleRenameNode} onDeleteNode={handleDeleteNodeFromMenu}
                  contextTarget={contextTarget} contextPos={contextPos} onCloseContext={closeContext}
                  plusItems={plusMenuItems} rootPlusItems={rootPlusMenuItems} editingEntry={editingEntry} renamingNodeId={renamingNodeId}
                  onEditingChange={handleEditingChange} onEditSubmit={handleEditSubmit} onNodeRenameSubmit={handleNodeRenameSubmit}
                />
              </div></div>
            ) : (
              <Onboarding
                recentTerms={recentInputs}
                onTermClick={handleFocusNode}
                onSubmit={handleFocusNode}
              />
            )}

              <InputBar
                tagLabel={showGuideMap ? "在当前层级新增节点" : nodeState.activeTag.title}
                tagPrefix={showGuideMap ? "" : undefined}
                fillValue={fillValue}
              onFocus={(text) => { setFillValue(""); handleFocusNode(text); }}
              onCreateChild={(text) => {
                setFillValue("");
                if (showGuideMap) {
                  handleAddGuideMapNode(text, guideFocusPath);
                } else if (nodeState.session) {
                  handleCreateEntry(text);
                } else {
                  handleFocusNode(text);
                }
              }}
            />
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
