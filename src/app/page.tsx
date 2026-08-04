"use client";

import { useEffect, useReducer, useState, useCallback, useRef } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TermListContext } from "@/lib/TermListContext";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { WorkGroupSwitcher } from "@/components/WorkGroupSwitcher";
import { RecursiveTree } from "@/components/RecursiveTree";
import { InputBar } from "@/components/InputBar";
import { SettingsPanel } from "@/components/SettingsPanel";
import { PreviewPanel } from "@/components/PreviewPanel";
import { GuideMapCanvas, buildBreadcrumbItems } from "@/components/GuideMapCanvas";
import { TermLibrary } from "@/components/TermLibrary";
import { FilesList } from "@/components/FilesList";
import { PDFViewer } from "@/components/PDFViewer";
import { Onboarding } from "@/components/Onboarding";
import { treeReducer, getInitialTreeState, buildRootNode } from "@/store/treeStore";
import { footprintReducer, initialState as initialFootprint } from "@/store/footprintStore";
import { initializeConfig, useConfigStore } from "@/store/configStore";
import { getConceptNode, getConceptNodeByTerm, putConceptNode, deleteConceptNode, getAllWorkGroups, putWorkGroup, deleteWorkGroup as deleteWG, getAllFiles, putFile, deleteFile } from "@/services/cache";
import { streamLLM, LLMError } from "@/services/llm";
import { getPresetPrompt, inquiryPrompt } from "@/services/prompts";
import { extractTitle, cn } from "@/lib/utils";
import { Layers, ChevronRight, Search, Plus } from "lucide-react";
import { DEFAULT_INQUIRY_TEMPLATES, DEFAULT_SELECTION_TEMPLATES, getPresetPrefix } from "@/lib/constants";
import type {
  TreeNodeData,
  ConceptNode,
  WorkGroup,
  GuideMapNode,
  PlusMenuItem,
  CustomQA,
  StoredFile,
} from "@/types";
import SparkMD5 from "spark-md5";

function buildDefaultPlusMenu(): PlusMenuItem[] {
  return DEFAULT_INQUIRY_TEMPLATES.map((t, i) => ({
    id: `default_${i}`,
    label: t,
    prompt: t,
  }));
}

function buildCustomQA(template: {
  id: string;
  type: "inquiry" | "reference";
  term: string;
  question: string;
  answer: string;
  parent_node_id: string;
}): CustomQA {
  return {
    ...template,
    created_at: Date.now(),
  };
}

export default function Home() {
  type NavEntry =
    | { type: "tree"; term: string }
    | { type: "guideMap"; pathStr: string; focusPath: number[] };

  function navEntryLabel(e: NavEntry): string {
    return e.type === "tree" ? e.term : `[导图] ${e.pathStr}`;
  }
  function navEntryEq(a: NavEntry, b: NavEntry): boolean {
    if (!a || !b) return false;
    if (a.type !== b.type) return false;
    if (a.type === "tree" && b.type === "tree") return a.term === b.term;
    if (a.type === "guideMap" && b.type === "guideMap") return a.pathStr === b.pathStr;
    return false;
  }

  const isInitialized = useRef(false);

  const [treeState, dispatchTree] = useReducer(treeReducer, getInitialTreeState());
  const [footprint, dispatchFootprint] = useReducer(footprintReducer, initialFootprint);

  const config = useConfigStore((s) => s.config);
  const isConfigured = useConfigStore((s) => s.isConfigured);

  const [workGroups, setWorkGroups] = useState<WorkGroup[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [termList, setTermList] = useState<string[]>([]);
  const [allTerms, setAllTerms] = useState<string[]>([]);

  useEffect(() => {
    const all = new Set<string>();
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("term_list_")) {
        try {
          const terms: string[] = JSON.parse(localStorage.getItem(key) || "[]");
          terms.forEach((t) => all.add(t));
        } catch {}
      }
    }
    setAllTerms(Array.from(all));
  }, [termList]);
  const [plusMenuItems, setPlusMenuItems] = useState<PlusMenuItem[]>([]);
  const [selectionMenuItems, setSelectionMenuItems] = useState<PlusMenuItem[]>([]);
  const [recentInputs, setRecentInputs] = useState<string[]>([]);

  const [showGuideMap, setShowGuideMap] = useState(false);
  const [fillValue, setFillValue] = useState<string>("");
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [renamingNodeId, setRenamingNodeId] = useState<string | null>(null);
  const [navHistory, setNavHistory] = useState<NavEntry[]>([]);
  const [navIndex, setNavIndex] = useState(-1);
  const [backOpen, setBackOpen] = useState(false);
  const [fwdOpen, setFwdOpen] = useState(false);
  const skipHistoryRef = useRef(false);
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
  const [leftTab, setLeftTab] = useState<"terms" | "files">("terms");
  const [storedFiles, setStoredFiles] = useState<StoredFile[]>([]);
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [activePdf, setActivePdf] = useState<StoredFile | null>(null);
  const [pdfBoundTerm, setPdfBoundTerm] = useState<string | null>(null);
  const pdfBoundRef = useRef<string | null>(null);
  useEffect(() => { pdfBoundRef.current = pdfBoundTerm; }, [pdfBoundTerm]);
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
      if (boundName && termList.some((t) => t.toLowerCase() === boundName.toLowerCase())) {
        setPdfBoundTerm(boundName);
      } else if (termList.some((t) => t.toLowerCase() === termName.toLowerCase())) {
        setPdfBoundTerm(termName);
        pdfBindingsRef.current.set(activePdf.name, termName);
        saveBindings();
      } else {
        setPdfBoundTerm(null);
      }
    } else {
      hadPdfRef.current = false;
      setRightWidth(prevRightRef.current);
      setPdfBoundTerm(null);
    }
  }, [activePdf, termList]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(t);
  }, [toast]);

  const streamingMapRef = useRef<Map<string, AbortController>>(new Map());
  const expandedNodesRef = useRef<Map<string, Set<string>>>(new Map());

  const saveExpandedState = useCallback(() => {
    if (!treeState.rootNode) return;
    const set = new Set<string>();
    function collect(n: TreeNodeData) {
      if (n.expanded) set.add(n.id);
      n.children.forEach(collect);
    }
    collect(treeState.rootNode);
    expandedNodesRef.current.set(treeState.rootTerm, set);
  }, [treeState.rootNode, treeState.rootTerm]);

  const restoreExpandedState = useCallback((term: string) => {
    const set = expandedNodesRef.current.get(term);
    if (!set) return;
    set.forEach((id) => dispatchTree({ type: "EXPAND_NODE", nodeId: id }));
  }, []);

  const activeGroup = workGroups.find((g) => g.id === activeGroupId);

  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    initializeConfig();

    getAllWorkGroups().then((groups) => {
      if (groups.length === 0) {
        const defaultGroup: WorkGroup = {
          id: crypto.randomUUID(),
          name: "默认",
          root_term_ids: [],
          guide_map: null,
          created_at: Date.now(),
          updated_at: Date.now(),
        };
        putWorkGroup(defaultGroup).then(() => {
          setWorkGroups([defaultGroup]);
          setActiveGroupId(defaultGroup.id);
          const t = localStorage.getItem(`term_list_${defaultGroup.id}`);
          if (t) { try { setTermList(JSON.parse(t)); } catch {} }
        });
      } else {
        setWorkGroups(groups);
        setActiveGroupId(groups[0].id);
        const t = localStorage.getItem(`term_list_${groups[0].id}`);
        if (t) { try { setTermList(JSON.parse(t)); } catch {} }
      }
    });

    getAllFiles().then(setStoredFiles);

    const savedTerms = localStorage.getItem(`term_list_${activeGroupId || "default"}`);
    if (savedTerms) {
      try { setTermList(JSON.parse(savedTerms)); } catch {}
    } else {
      setTermList([]);
    }

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

  const savePlusMenu = useCallback((items: PlusMenuItem[]) => {
    setPlusMenuItems(items);
    localStorage.setItem("plus_menu_items", JSON.stringify(items));
  }, []);

  const saveSelectionMenu = useCallback((items: PlusMenuItem[]) => {
    setSelectionMenuItems(items);
    localStorage.setItem("selection_menu_items", JSON.stringify(items));
  }, []);

  const termListKey = `term_list_${activeGroupId || "default"}`;

  const saveTermList = useCallback((terms: string[]) => {
    setTermList(terms);
    localStorage.setItem(termListKey, JSON.stringify(terms));
    if (activeGroupId) {
      const group = workGroups.find((g) => g.id === activeGroupId);
      if (group?.guide_map) {
        const filterTerms = (n: GuideMapNode): GuideMapNode | null => {
          if (n.term && !n._group && !terms.some((t) => t.toLowerCase() === n.term.toLowerCase())) return null;
          const filtered = n.children.map(filterTerms).filter((c): c is GuideMapNode => c !== null);
          return { ...n, children: filtered };
        };
        const result = filterTerms(group.guide_map);
        if (result) {
          group.guide_map = result;
          group.updated_at = Date.now();
          putWorkGroup(group).then(() => {
            setWorkGroups((prev) => prev.map((g) => (g.id === activeGroupId ? { ...group } : g)));
          });
        }
      }
    }
  }, [termListKey, activeGroupId, workGroups]);

  const addToTermList = useCallback(
    (term: string) => {
      const lower = term.toLowerCase();
      setTermList((prev) => {
        if (prev.some((t) => t.toLowerCase() === lower)) return prev;
        const next = [...prev, term];
        localStorage.setItem(termListKey, JSON.stringify(next));
        return next;
      });
    },
    [termListKey]
  );

  const addRecentInput = useCallback((text: string) => {
    setRecentInputs((prev) => {
      const next = [text, ...prev.filter((t) => t !== text)].slice(0, 20);
      localStorage.setItem("input_history", JSON.stringify(next));
      return next;
    });
  }, []);

  const findNode = useCallback(
    (nodeId: string): TreeNodeData | null => {
      if (!treeState.rootNode) return null;
      function search(n: TreeNodeData): TreeNodeData | null {
        if (n.id === nodeId) return n;
        for (const child of n.children) {
          const found = search(child);
          if (found) return found;
        }
        return null;
      }
      return search(treeState.rootNode);
    },
    [treeState.rootNode]
  );

  const handleSelect = useCallback((nodeId: string | null) => {
    dispatchTree({ type: "SET_SELECTED", nodeId });
    if (nodeId && treeState.rootNode) {
      const n = findNode(nodeId);
      if (n && n.type !== "root") {
        dispatchTree({ type: "SET_ACTIVE_TAG", parentId: nodeId, title: n.title });
      }
    }
  }, [treeState.rootNode, findNode]);

  const handleStream = useCallback(
    async (
      nodeId: string,
      config: import("@/types").LLMConfig,
      systemPrompt: string,
      userPrompt: string,
      onDoneContent: (content: string) => void
    ) => {
      if (!config) return;
      dispatchTree({ type: "SET_NODE_STATUS", nodeId, status: "loading" });
      const abort = new AbortController();
      streamingMapRef.current.set(nodeId, abort);

      try {
        let fullContent = "";
        const generator = streamLLM(config, systemPrompt, userPrompt);
        dispatchTree({ type: "SET_NODE_STATUS", nodeId, status: "streaming" });

        for await (const chunk of generator) {
          fullContent += chunk;
          dispatchTree({ type: "APPEND_STREAMING", nodeId, chunk });
        }

        dispatchTree({ type: "SET_NODE_STATUS", nodeId, status: "done" });
        onDoneContent(fullContent);
      } catch (err) {
        console.error("[OmniExplore] LLM stream error:", err);
        const message =
          err instanceof LLMError
            ? err.message
            : "网络连接失败";
        dispatchTree({
          type: "SET_NODE_STATUS",
          nodeId,
          status: "error",
          errorMessage: message,
        });
      } finally {
        streamingMapRef.current.delete(nodeId);
      }
    },
    []
  );

  const persistNodeToDB = useCallback(
    async (term: string, update: Partial<ConceptNode>) => {
      const id = SparkMD5.hash(term.toLowerCase());
      const existing = await getConceptNode(id);
      const node: ConceptNode = existing ?? {
        id,
        term,
        micro_intuition: null,
        micro_definition: null,
        micro_application: null,
        micro_motivation: null,
        macro_territory: null,
        macro_logic: null,
        macro_touchpoint: null,
        macro_evolution: null,
        custom_qa: [],
        created_at: Date.now(),
        updated_at: Date.now(),
      };
      Object.assign(node, update, { updated_at: Date.now() });
      await putConceptNode(node);

      if (activeGroupId) {
        const group = await (await import("@/services/cache")).getWorkGroup(activeGroupId);
        if (group && !group.root_term_ids.includes(id)) {
          group.root_term_ids.push(id);
          await putWorkGroup(group);
          setWorkGroups((prev) =>
            prev.map((g) => (g.id === activeGroupId ? group : g))
          );
        }
      }
    },
    [activeGroupId]
  );

  const handleFocusTerm = useCallback(
    async (term: string) => {
      if (!term.trim()) return;
      if (term === treeState.rootTerm) return;
      saveExpandedState();
      addRecentInput(term);
      addToTermList(term);

        if (!skipHistoryRef.current) {
          const entry: NavEntry = { type: "tree", term };
          navPushedRef.current = false;
          setNavHistory((prev) => {
            const next = prev.slice(0, navIndex + 1);
            if (next.length === 0 || !navEntryEq(next[next.length - 1], entry)) { next.push(entry); navPushedRef.current = true; }
            return next;
          });
          setNavIndex((prev) => navPushedRef.current ? prev + 1 : prev);
        }
      skipHistoryRef.current = false;

      dispatchFootprint({ type: "APPEND", term, nodeId: SparkMD5.hash(term.toLowerCase()) });

      const id = SparkMD5.hash(term.toLowerCase());
      const cached = await getConceptNode(id);
      const isNew = !cached;

      const rootNode = buildRootNode(term, "micro");
      dispatchTree({ type: "SET_ROOT", rootNode });
      dispatchTree({ type: "SET_ACTIVE_TAG", parentId: "root", title: term });
      setShowGuideMap(false);
      ensureGuideMap();

      if (isNew) {
        const group = workGroups.find((g) => g.id === activeGroupId);
        if (group?.guide_map) {
          const lower = term.toLowerCase();
          const exists = group.guide_map.children.some((c) => c.term.toLowerCase() === lower);
          if (!exists) {
            group.guide_map = { ...group.guide_map, children: [...group.guide_map.children, { term, children: [] }] };
            group.updated_at = Date.now();
            putWorkGroup(group);
            setWorkGroups((prev) => prev.map((g) => (g.id === activeGroupId ? { ...group } : g)));
          }
        }
      }

      if (cached?.custom_qa) {
        for (const qa of cached.custom_qa) {
          const childNode: TreeNodeData = {
            id: qa.id, type: qa.type,
            title: qa.type === "reference" ? (qa.answer ? extractTitle(qa.answer) : "空节点") : qa.question,
            term, content: qa.answer || "", status: "done", expanded: false, children: [], parentId: qa.parent_node_id,
          };
          dispatchTree({ type: "ADD_CHILD", parentId: qa.parent_node_id, child: childNode });
        }
      }

      const presetFields: Array<{ nodeId: string; field: keyof ConceptNode; presetKey: string }> = [
        { nodeId: "preset:micro_intuition", field: "micro_intuition", presetKey: "micro_intuition" },
        { nodeId: "preset:micro_definition", field: "micro_definition", presetKey: "micro_definition" },
        { nodeId: "preset:micro_application", field: "micro_application", presetKey: "micro_application" },
        { nodeId: "preset:micro_motivation", field: "micro_motivation", presetKey: "micro_motivation" },
      ];
      for (const pf of presetFields) {
        if (cached?.[pf.field]) {
          const prefix = getPresetPrefix(pf.presetKey);
          const val = cached[pf.field] as string;
          const display = val.startsWith(prefix.trim()) ? val : prefix + val;
          dispatchTree({ type: "SET_NODE_CONTENT", nodeId: pf.nodeId, content: display });
          dispatchTree({ type: "SET_NODE_TITLE", nodeId: pf.nodeId, title: extractTitle(display) });
          dispatchTree({ type: "SET_NODE_STATUS", nodeId: pf.nodeId, status: "done" });
        }
      }

      restoreExpandedState(term);

      const id2 = SparkMD5.hash(term.toLowerCase());
      const pcached = await getConceptNode(id2);
      if (pcached) {
        setPreviewTitle(term);
        const plines: string[] = [];
        const ppresets = [
          { icon: "🌳", label: "动态直觉", field: "micro_intuition" },
          { icon: "📐", label: "看定义", field: "micro_definition" },
          { icon: "🔧", label: "看应用", field: "micro_application" },
          { icon: "📜", label: "看动机", field: "micro_motivation" },
        ];
        for (const p of ppresets) {
          const val = pcached[p.field as keyof ConceptNode] as string | null;
          plines.push(`  ${p.icon} ${p.label}${val ? "" : " (未生成)"}`);
          const sub = pcached.custom_qa.filter((qa) => qa.parent_node_id === `preset:${p.field}`);
          for (const qa of sub) plines.push(`    ${qa.type === "inquiry" ? "💬" : "📖"} ${qa.question || extractTitle(qa.answer) || "空节点"}`);
        }
        const rootSub = pcached.custom_qa.filter((qa) => qa.parent_node_id === "root");
        for (const qa of rootSub) plines.push(`  ${qa.type === "inquiry" ? "💬" : "📖"} ${qa.question || extractTitle(qa.answer) || "空节点"}`);
        setPreviewContent(plines.join("\n"));
      }

      if (!config) return;

      if (!cached?.micro_intuition) {
        const prompt = getPresetPrompt("micro_intuition", term);
        if (prompt) {
          handleStream("preset:micro_intuition", config, prompt.system, prompt.user, (content) => {
            const prefix = getPresetPrefix("micro_intuition");
            const fullContent = prefix + content;
            dispatchTree({ type: "SET_NODE_CONTENT", nodeId: "preset:micro_intuition", content: fullContent });
            dispatchTree({ type: "SET_NODE_TITLE", nodeId: "preset:micro_intuition", title: extractTitle(fullContent) || "动态直觉" });
            persistNodeToDB(term, { micro_intuition: fullContent });
          });
        }
      }

    },
    [addRecentInput, addToTermList, config, handleStream, persistNodeToDB, saveExpandedState, restoreExpandedState]
  );

  const handleToggleExpand = useCallback(
    async (nodeId: string) => {
      const node = findNode(nodeId);
      if (!node) return;

      const isExpanding = !node.expanded;

      if (!isExpanding) {
        dispatchTree({ type: "TOGGLE_EXPAND", nodeId });
        return;
      }

      dispatchTree({ type: "EXPAND_NODE", nodeId });

      if (node.type === "preset" && node.content === null && node.presetKey && config) {
        const term = node.term;
        const id = SparkMD5.hash(term.toLowerCase());
        const cached = await getConceptNode(id);

        const fieldMap: Record<string, keyof ConceptNode> = {
          micro_intuition: "micro_intuition",
          micro_definition: "micro_definition",
          micro_application: "micro_application",
          micro_motivation: "micro_motivation",
          macro_territory: "macro_territory",
          macro_logic: "macro_logic",
          macro_touchpoint: "macro_touchpoint",
          macro_evolution: "macro_evolution",
        };

        const field = fieldMap[node.presetKey];
        if (field && cached?.[field]) {
          const prefix = getPresetPrefix(node.presetKey);
          const val = cached[field] as string;
          const content = val.startsWith(prefix.trim()) ? val : prefix + val;
          dispatchTree({ type: "SET_NODE_CONTENT", nodeId, content });
          dispatchTree({ type: "SET_NODE_STATUS", nodeId, status: "done" });
          return;
        }

        const prompt = getPresetPrompt(node.presetKey, term);
        if (prompt) {
          handleStream(nodeId, config, prompt.system, prompt.user, (content) => {
            const prefix = getPresetPrefix(node.presetKey || "");
            const fullContent = prefix + content;
            dispatchTree({ type: "SET_NODE_CONTENT", nodeId, content: fullContent });
            dispatchTree({ type: "SET_NODE_TITLE", nodeId, title: extractTitle(fullContent) || node.title });
            persistNodeToDB(term, { [field]: fullContent });
          });
        }
      }
    },
    [findNode, config, handleStream, persistNodeToDB]
  );

  const handleCreateChild = useCallback(
    async (text: string) => {
      const parentId = treeState.activeTag.parentId || "root";
      const childId = `qa_${Date.now()}`;
      const childNode: TreeNodeData = {
        id: childId,
        type: "inquiry",
        title: text,
        term: treeState.rootTerm,
        content: null,
        status: "loading" as const,
        expanded: true,
        children: [],
        parentId,
      };
      dispatchTree({ type: "ADD_CHILD", parentId, child: childNode });

      if (config) {
        const parentIdActual = treeState.activeTag.parentId;
        const parentNode = parentIdActual && parentIdActual !== "root" ? findNode(parentIdActual) : treeState.rootNode;
        const parentTerm = parentNode?.term || treeState.rootTerm;

        const ancestors: string[] = [];
        let ancestorId = parentNode?.parentId;
        while (ancestorId) {
          const an = findNode(ancestorId);
          if (an) {
            ancestors.unshift(an.term || an.title);
            ancestorId = an.parentId;
          } else {
            break;
          }
        }

        const { system, user } = inquiryPrompt(parentTerm, treeState.rootTerm, text, ancestors);
        handleStream(childId, config, system, user, (content) => {
          const fullContent = text + "\n" + content;
          dispatchTree({ type: "SET_NODE_CONTENT", nodeId: childId, content: fullContent });
          dispatchTree({ type: "SET_NODE_TITLE", nodeId: childId, title: extractTitle(fullContent) || text });
          const term = treeState.rootTerm;
          const id = SparkMD5.hash(term.toLowerCase());
          getConceptNode(id).then((existing) => {
            const qa = buildCustomQA({
              id: childId,
              type: "inquiry",
              term,
              question: text,
              answer: content,
              parent_node_id: parentId,
            });
            const updated: ConceptNode = existing
              ? { ...existing, custom_qa: [...existing.custom_qa, qa], updated_at: Date.now() }
              : {
                  id,
                  term,
                  micro_intuition: null,
                  micro_definition: null,
                  micro_application: null,
                  micro_motivation: null,
                  macro_territory: null,
                  macro_logic: null,
                  macro_touchpoint: null,
                  macro_evolution: null,
                  custom_qa: [qa],
                  created_at: Date.now(),
                  updated_at: Date.now(),
                };
            putConceptNode(updated);
          });
        });
      }
    },
    [treeState, config, handleStream, findNode]
  );

  const handleTermDoubleClick = useCallback(
      (term: string) => {
        handleFocusTerm(term);
      },
      [handleFocusTerm]
    );

  const handleTermContextMenu = useCallback(
    (e: React.MouseEvent, term: string) => {
      const menu = document.createElement("div");
      menu.className = "fixed z-50 min-w-[180px] rounded-md border bg-popover p-1 shadow-md";
      menu.style.left = `${e.clientX}px`;
      menu.style.top = `${e.clientY}px`;

      const focusBtn = document.createElement("button");
      focusBtn.className = "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent";
      focusBtn.innerHTML = "<span>🎯</span> <span>聚焦</span>";
      focusBtn.onclick = () => { menu.remove(); handleFocusTerm(term); };
      menu.appendChild(focusBtn);

      const inquireBtn = document.createElement("button");
      inquireBtn.className = "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent";
      inquireBtn.innerHTML = "<span>💬</span> <span>追问</span>";
      inquireBtn.onclick = () => {
        menu.remove();
        setFillValue(`${term}？`);
      };
      menu.appendChild(inquireBtn);

      selectionMenuItems.forEach((item) => {
        const btn = document.createElement("button");
        btn.className = "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent";
        btn.innerHTML = `<span>💬</span> <span>${item.label}</span>`;
        btn.onclick = () => {
          menu.remove();
          const rootTerm = treeState.rootTerm;
          const label = item.prompt
            .replace(/\$\{selected\}/g, term)
            .replace(/\$\{root\}/g, rootTerm);
          setFillValue(label);
        };
        menu.appendChild(btn);
      });

      document.body.appendChild(menu);
      const close = (ev: MouseEvent) => {
        if (!menu.contains(ev.target as Node)) { menu.remove(); document.removeEventListener("click", close); }
      };
      setTimeout(() => document.addEventListener("click", close), 0);
    },
    [handleFocusTerm, selectionMenuItems, treeState.rootTerm]
  );

  const handleSelectionContextMenu = useCallback(
    (e: React.MouseEvent, selectedText: string, nodeId: string) => {
      const menu = document.createElement("div");
      menu.className = "fixed z-50 min-w-[180px] rounded-md border bg-popover p-1 shadow-md";
      menu.style.left = `${e.clientX}px`;
      menu.style.top = `${e.clientY}px`;

      const focusBtn = document.createElement("button");
      focusBtn.className = "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent";
      focusBtn.innerHTML = "<span>🎯</span> <span>聚焦</span>";
      focusBtn.onclick = () => { menu.remove(); handleFocusTerm(selectedText); };
      menu.appendChild(focusBtn);

      const inquireBtn = document.createElement("button");
      inquireBtn.className = "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent";
      inquireBtn.innerHTML = "<span>💬</span> <span>追问</span>";
      inquireBtn.onclick = () => {
        menu.remove();
        dispatchTree({ type: "SET_ACTIVE_TAG", parentId: nodeId, title: findNode(nodeId)?.title || "" });
        setFillValue(`${selectedText}？`);
      };
      menu.appendChild(inquireBtn);

      selectionMenuItems.forEach((item) => {
        const btn = document.createElement("button");
        btn.className = "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent";
        btn.innerHTML = `<span>💬</span> <span>${item.label}</span>`;
        btn.onclick = () => {
          menu.remove();
          const node = findNode(nodeId);
          const rootTerm = treeState.rootTerm;
          const label = item.prompt
            .replace(/\$\{selected\}/g, selectedText)
            .replace(/\$\{root\}/g, rootTerm);
          dispatchTree({ type: "SET_ACTIVE_TAG", parentId: nodeId, title: node?.title || "" });
          setFillValue(label);
        };
        menu.appendChild(btn);
      });

      document.body.appendChild(menu);
      const close = (ev: MouseEvent) => {
        if (!menu.contains(ev.target as Node)) { menu.remove(); document.removeEventListener("click", close); }
      };
      setTimeout(() => document.addEventListener("click", close), 0);
    },
    [handleFocusTerm, selectionMenuItems, findNode, treeState.rootTerm]
  );

  const handleTermHover = useCallback(
    async (e: React.MouseEvent, term: string) => {
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      setHoverTermPreviewAnchor(rect);
      setHoverTermPreviewTerm(term);
      try {
        const id = SparkMD5.hash(term.toLowerCase());
        const node = (await getConceptNode(id)) ?? (await getConceptNodeByTerm(term));
        if (node) {
          const raw =
            node.micro_intuition ||
            node.micro_definition ||
            node.micro_application ||
            node.micro_motivation ||
            node.custom_qa?.find((q) => q.answer)?.answer;
          const preview = raw ? raw.replace(/^[^\n]*\n/, "").slice(0, 120) : null;
          setHoverTermPreview(preview);
        } else {
          setHoverTermPreview(null);
        }
      } catch {
        setHoverTermPreview(null);
      }
    },
    []
  );

  const handleTermLeave = useCallback(() => {
    setHoverTermPreview(null);
    setHoverTermPreviewAnchor(null);
  }, []);

  const handlePlusSelect = useCallback(
    (parentId: string, promptTemplate: string) => {
      const parentNode = findNode(parentId);
      if (!parentNode) return;

      const label = promptTemplate.replace(/\$\{term\}/g, parentNode.term);
      dispatchTree({ type: "SET_ACTIVE_TAG", parentId, title: parentNode.title });
      setFillValue(label);
    },
    [findNode]
  );

  const handleCreateEmptyChild = useCallback(
    (parentId: string) => {
      const childId = `ref_${Date.now()}`;
      const childNode: TreeNodeData = {
        id: childId,
        type: "reference",
        title: "空节点",
        term: treeState.rootTerm,
        content: "",
        status: "done",
        expanded: true,
        children: [],
        parentId,
      };
      dispatchTree({ type: "ADD_CHILD", parentId, child: childNode });

      const term = treeState.rootTerm;
      const id = SparkMD5.hash(term.toLowerCase());
      getConceptNode(id).then((existing) => {
        const qa: CustomQA = {
          id: childId,
          type: "reference",
          term,
          question: "",
          answer: "",
          parent_node_id: parentId,
          created_at: Date.now(),
        };
        const updated: ConceptNode = existing
          ? { ...existing, custom_qa: [...existing.custom_qa, qa], updated_at: Date.now() }
          : {
              id, term,
              micro_intuition: null, micro_definition: null, micro_application: null, micro_motivation: null,
              macro_territory: null, macro_logic: null, macro_touchpoint: null, macro_evolution: null,
              custom_qa: [qa],
              created_at: Date.now(), updated_at: Date.now(),
            };
        putConceptNode(updated);
      });
    },
    [treeState.rootTerm]
  );

  const handleCreateReference = useCallback(
    (parentId: string) => {
      const childId = `ref_${Date.now()}`;
      const childNode: TreeNodeData = {
        id: childId,
        type: "reference",
        title: "参考",
        term: treeState.rootTerm,
        content: "",
        status: "done",
        expanded: true,
        children: [],
        parentId,
      };
      dispatchTree({ type: "ADD_CHILD", parentId, child: childNode });
    },
    [treeState.rootTerm]
  );

  const handleRefresh = useCallback(
    async (nodeId: string) => {
      const node = findNode(nodeId);
      if (!node || !config) return;

      if (node.type === "preset" && node.presetKey) {
        const prompt = getPresetPrompt(node.presetKey, node.term);
        if (prompt) {
          dispatchTree({ type: "SET_NODE_CONTENT", nodeId, content: "" });
          dispatchTree({ type: "SET_NODE_STATUS", nodeId, status: "loading" });
          handleStream(nodeId, config, prompt.system, prompt.user, (content) => {
            const field = node.presetKey as keyof ConceptNode;
            persistNodeToDB(node.term, { [field]: content });
          });
        }
      } else if (node.type === "inquiry") {
        const parentNode = findNode(node.parentId || "root");
        const parentTerm = parentNode?.term || node.term;
        const { system, user } = inquiryPrompt(parentTerm, node.term, node.title);
        dispatchTree({ type: "SET_NODE_CONTENT", nodeId, content: "" });
        dispatchTree({ type: "SET_NODE_STATUS", nodeId, status: "loading" });
        handleStream(nodeId, config, system, user, (content) => {});
      }
    },
    [findNode, config, handleStream, persistNodeToDB]
  );

  const handleRename = useCallback(
    (nodeId: string) => {
      setRenamingNodeId(nodeId);
    },
    []
  );

  const handleRenameSubmit = useCallback(
    (nodeId: string, newTitle: string) => {
      if (!newTitle.trim()) { setRenamingNodeId(null); return; }
      const node = findNode(nodeId);
      if (node && node.type === "root") {
        const newTerm = newTitle.trim();
        if (node.term.toLowerCase() !== newTerm.toLowerCase() && termList.some((t) => t.toLowerCase() === newTerm.toLowerCase())) {
          setToast(`"${newTerm}" 已存在`);
          setRenamingNodeId(null);
          return;
        }
      }
      dispatchTree({ type: "SET_NODE_TITLE", nodeId, title: newTitle.trim() });
      if (node && node.type === "root" && node.term !== newTitle.trim()) {
        const oldTerm = node.term;
        const oldId = SparkMD5.hash(oldTerm.toLowerCase());
        const newTerm = newTitle.trim();
        const newId = SparkMD5.hash(newTerm.toLowerCase());
        setPreviewTitle(newTerm);
        if (pdfBoundTerm === oldTerm) setPdfBoundTerm(newTerm);
        getConceptNode(oldId).then(async (existing) => {
          if (existing) {
            existing.term = newTerm;
            existing.id = newId;
            putConceptNode(existing);
            if (oldId !== newId) deleteConceptNode(oldId);
          }
          setTermList((prev) => {
            const next = prev.map((t) => t.toLowerCase() === node.term.toLowerCase() ? newTerm : t);
            localStorage.setItem(termListKey, JSON.stringify(next));
            return next;
          });
          const group = workGroups.find((g) => g.id === activeGroupId);
          if (group?.guide_map) {
            const updateTerm = (n: GuideMapNode): GuideMapNode => ({
              ...n,
              term: n.term.toLowerCase() === node.term.toLowerCase() ? newTerm : n.term,
              children: n.children.map(updateTerm),
            });
            group.guide_map = updateTerm(group.guide_map);
            group.updated_at = Date.now();
            putWorkGroup(group);
            setWorkGroups((prev) => prev.map((g) => (g.id === activeGroupId ? { ...group } : g)));
          }
        });
      }
      setRenamingNodeId(null);
    },
    [findNode, termListKey, termList, activeGroupId, workGroups]
  );

  const handleDelete = useCallback(
    (nodeId: string) => {
      if (!confirm("确定要删除此节点？")) return;
      const node = findNode(nodeId);
      if (node && (node.type === "inquiry" || node.type === "reference")) {
        const term = node.term;
        const id = SparkMD5.hash(term.toLowerCase());
        getConceptNode(id).then((existing) => {
          if (existing) {
            existing.custom_qa = existing.custom_qa.filter((qa) => qa.id !== nodeId);
            existing.updated_at = Date.now();
            putConceptNode(existing);
          }
        });
      }
      dispatchTree({ type: "REMOVE_NODE", nodeId });
    },
    [findNode]
  );

  const handleDragEnd = useCallback(
    (sourceId: string, targetId: string, position: "before" | "inside" | "after") => {
      const s = findNode(sourceId);
      const t = findNode(targetId);
      if (!s || !t || sourceId === targetId) return;
      function isDesc(p: TreeNodeData, cid: string): boolean {
        if (p.id === cid) return true;
        return p.children.some((c) => isDesc(c, cid));
      }
      if (isDesc(s, targetId)) return;

      const id = SparkMD5.hash(s.term.toLowerCase());
      getConceptNode(id).then((existing) => {
        if (!existing) return;
        if (position === "inside") {
          dispatchTree({ type: "REMOVE_NODE", nodeId: sourceId });
          dispatchTree({ type: "ADD_CHILD", parentId: targetId, child: { ...s, parentId: targetId } });
          const qa = existing.custom_qa.find((q) => q.id === sourceId);
          if (qa) { qa.parent_node_id = targetId; existing.updated_at = Date.now(); putConceptNode(existing); }
        } else {
          const newParentId = t.parentId!;
          if (s.parentId === newParentId) {
            const srcIdx = existing.custom_qa.findIndex((q) => q.id === sourceId);
            const tgtIdx = existing.custom_qa.findIndex((q) => q.id === targetId);
            if (srcIdx !== -1 && tgtIdx !== -1) {
              const [moved] = existing.custom_qa.splice(srcIdx, 1);
              const newTgtIdx = existing.custom_qa.findIndex((q) => q.id === targetId);
              existing.custom_qa.splice(position === "before" ? newTgtIdx : newTgtIdx + 1, 0, moved);
              existing.updated_at = Date.now();
              putConceptNode(existing);
            }
          } else {
            const srcIdx = existing.custom_qa.findIndex((q) => q.id === sourceId);
            if (srcIdx !== -1) {
              const [moved] = existing.custom_qa.splice(srcIdx, 1);
              moved.parent_node_id = newParentId;
              let beforeCount = 0;
              for (const q of existing.custom_qa) {
                if (q.parent_node_id === newParentId) {
                  if (q.id === targetId) { if (position === "after") beforeCount++; break; }
                  beforeCount++;
                }
              }
              let insertAt = existing.custom_qa.length;
              let count = 0;
              for (let i = 0; i < existing.custom_qa.length; i++) {
                if (existing.custom_qa[i].parent_node_id === newParentId) {
                  if (count === beforeCount) { insertAt = i; break; }
                  count++;
                }
              }
              existing.custom_qa.splice(insertAt, 0, moved);
              existing.updated_at = Date.now();
              putConceptNode(existing);
            }
            dispatchTree({ type: "REMOVE_NODE", nodeId: sourceId });
            dispatchTree({ type: "ADD_CHILD", parentId: newParentId, child: { ...s, parentId: newParentId } });
          }
          const parentNode = findNode(newParentId);
          if (parentNode) {
            const childIds = parentNode.children.map((c) => c.id);
            const filtered = childIds.filter((cid) => cid !== sourceId);
            const ins = filtered.indexOf(targetId);
            if (ins !== -1) {
              filtered.splice(position === "before" ? ins : ins + 1, 0, sourceId);
              dispatchTree({ type: "REORDER_CHILDREN", parentId: newParentId, childIds: filtered });
            }
          }
        }
      });
    },
    [findNode]
  );

  const handleTitleDoubleClick = useCallback(
    (nodeId: string) => {
      handleRename(nodeId);
    },
    [handleRename]
  );

  const handleEditContent = useCallback(
    (nodeId: string) => {
      const node = findNode(nodeId);
      if (!node) return;
      if (!node.expanded) {
        dispatchTree({ type: "EXPAND_NODE", nodeId });
      }
      if (!node.content) {
        dispatchTree({ type: "SET_NODE_CONTENT", nodeId, content: "" });
        dispatchTree({ type: "SET_NODE_STATUS", nodeId, status: "done" });
      }
      setEditingNodeId(nodeId);
    },
    [findNode]
  );

  const handleEditingChange = useCallback(
    (nodeId: string, value: string) => {
      dispatchTree({ type: "SET_NODE_CONTENT", nodeId, content: value });
    },
    []
  );

  const handleEditSubmit = useCallback(
    (nodeId: string) => {
      const node = findNode(nodeId);
      if (node?.content) {
        dispatchTree({ type: "SET_NODE_TITLE", nodeId, title: extractTitle(node.content) });
      }
      if (node && (node.type === "inquiry" || node.type === "reference")) {
        const id = SparkMD5.hash(node.term.toLowerCase());
        getConceptNode(id).then((existing) => {
          if (existing) {
            const qa = existing.custom_qa.find((q: { id: string; answer?: string }) => q.id === nodeId);
            if (qa) {
              qa.answer = node.content ?? "";
              existing.updated_at = Date.now();
              putConceptNode(existing);
            }
          }
        });
      }
      setEditingNodeId(null);
    },
    [findNode]
  );

  const handleContentDoubleClick = useCallback(
    (nodeId: string) => {
      const node = findNode(nodeId);
      if (!node) return;
      const newContent = prompt("编辑内容", node.content || "");
      if (newContent !== null) {
        dispatchTree({ type: "SET_NODE_CONTENT", nodeId, content: newContent });
        dispatchTree({ type: "SET_NODE_STATUS", nodeId, status: "done" });
        dispatchTree({ type: "SET_NODE_TITLE", nodeId, title: extractTitle(newContent) });
      }
    },
    [findNode]
  );

  const handleViewToggle = useCallback(
    (mode: "micro" | "macro") => {
      dispatchTree({ type: "SET_VIEW_MODE", mode });
    },
    []
  );

  const handleFootprintNavigate = useCallback(
    (index: number) => {
      const node = footprint.nodes[index];
      if (!node) return;
      dispatchFootprint({ type: "NAVIGATE", index });
      handleFocusTerm(node.term);
    },
    [footprint.nodes, handleFocusTerm]
  );

  const handleWorkGroupSelect = useCallback(
    (groupId: string) => {
      navStoreRef.current.set(activeGroupId || "default", { history: navHistory, index: navIndex });
      const stored = navStoreRef.current.get(groupId) || { history: [], index: -1 };
      setNavHistory(stored.history);
      setNavIndex(stored.index);
      setActiveGroupId(groupId);
      dispatchTree({ type: "CLEAR_ROOT" });
      dispatchFootprint({ type: "CLEAR" });
      setShowGuideMap(false);
      setPreviewTitle("");
      setPreviewContent(null);
      const saved = localStorage.getItem(`term_list_${groupId}`);
      setTermList(saved ? (() => { try { return JSON.parse(saved); } catch { return []; } })() : []);
    },
    [activeGroupId, navHistory, navIndex]
  );

  const handleWorkGroupCreate = useCallback(
    async (name: string) => {
      const group: WorkGroup = {
        id: crypto.randomUUID(),
        name,
        root_term_ids: [],
        guide_map: null,
        created_at: Date.now(),
        updated_at: Date.now(),
      };
      await putWorkGroup(group);
      setWorkGroups((prev) => [...prev, group]);
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
      await deleteWG(id);
      setWorkGroups((prev) => prev.filter((g) => g.id !== id));
      if (activeGroupId === id) {
        const remaining = workGroups.filter((g) => g.id !== id);
        setActiveGroupId(remaining[0]?.id || null);
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

  const ensureGuideMap = useCallback(async () => {
    if (!activeGroupId) return;
    const group = workGroups.find((g) => g.id === activeGroupId);
    if (!group) return;
    if (!group.guide_map) {
      group.guide_map = { term: "", children: [] };
      group.updated_at = Date.now();
      await putWorkGroup(group);
      setWorkGroups((prev) => prev.map((g) => (g.id === activeGroupId ? { ...group } : g)));
    }
    if (treeState.rootTerm && group.guide_map) {
      const lower = treeState.rootTerm.toLowerCase();
      const exists = group.guide_map.children.some((c) => c.term.toLowerCase() === lower);
      if (!exists) {
        group.guide_map = { ...group.guide_map, children: [...group.guide_map.children, { term: treeState.rootTerm, children: [] }] };
        group.updated_at = Date.now();
        putWorkGroup(group);
        setWorkGroups((prev) => prev.map((g) => (g.id === activeGroupId ? { ...group } : g)));
      }
    }
  }, [activeGroupId, workGroups, treeState.rootTerm]);

  const lastMapClickRef = useRef<{ term: string; time: number } | null>(null);
  const [guideFocusPath, setGuideFocusPath] = useState<number[]>([]);

  const handleGuideMapNodeClick = useCallback(
    async (term: string, nodePath?: number[]) => {
      const now = Date.now();
      const last = lastMapClickRef.current;
      if (last && last.term === term && now - last.time < 600) {
        const parentPath = nodePath ? nodePath.slice(0, -1) : guideFocusPath;
        setGuideFocusPath(parentPath);
        handleFocusTerm(term);
        setShowGuideMap(false);
        lastMapClickRef.current = null;
      } else {
        lastMapClickRef.current = { term, time: now };
        setPreviewTitle(term);

        const id = SparkMD5.hash(term.toLowerCase());
        const cached = await getConceptNode(id);
        if (cached) {
          const lines: string[] = [];
          const presets = [
            { icon: "🌳", label: "动态直觉", field: "micro_intuition" },
            { icon: "📐", label: "看定义", field: "micro_definition" },
            { icon: "🔧", label: "看应用", field: "micro_application" },
            { icon: "📜", label: "看动机", field: "micro_motivation" },
          ];
          for (const p of presets) {
            const val = cached[p.field as keyof ConceptNode] as string | null;
            lines.push(`  ${p.icon} ${p.label}${val ? "" : " (未生成)"}`);
            const subQAs = cached.custom_qa.filter((qa) => qa.parent_node_id === `preset:${p.field}`);
            for (const qa of subQAs) {
              lines.push(`    ${qa.type === "inquiry" ? "💬" : "📖"} ${qa.question || extractTitle(qa.answer) || "空节点"}`);
            }
          }
          const rootQAs = cached.custom_qa.filter((qa) => qa.parent_node_id === "root");
          for (const qa of rootQAs) {
            lines.push(`  ${qa.type === "inquiry" ? "💬" : "📖"} ${qa.question || extractTitle(qa.answer) || "空节点"}`);
          }
          setPreviewContent(lines.join("\n"));
        } else {
          setPreviewContent(null);
        }
      }
    },
    [handleFocusTerm, guideFocusPath]
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
        if (treeState.rootNode) {
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
          skipHistoryRef.current = true;
          setNavIndex(navIndex - 1);
          const entry = navHistory[navIndex - 1];
          if (!entry) return;
          if (entry.type === "tree") {
            setShowGuideMap(false);
            handleFocusTerm(entry.term);
          } else {
            setShowGuideMap(true);
            setGuideFocusPath(entry.focusPath);
          }
        }
        if (e.altKey && e.key === "ArrowRight" && navIndex < navHistory.length - 1) {
          e.preventDefault();
          skipHistoryRef.current = true;
          setNavIndex(navIndex + 1);
          const entry = navHistory[navIndex + 1];
          if (!entry) return;
          if (entry.type === "tree") {
            setShowGuideMap(false);
            handleFocusTerm(entry.term);
        } else {
          setShowGuideMap(true);
          setGuideFocusPath(entry.focusPath);
        }
      }
    },
    [showGuideMap, treeState.rootNode, ensureGuideMap, navHistory, navIndex, handleFocusTerm, guideFocusPath]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const hasRoot = !!treeState.rootNode;

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

  return (
    <TermListContext.Provider value={termList}>
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen overflow-hidden">
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
                dispatchTree({ type: "CLEAR_ROOT" });
                dispatchFootprint({ type: "CLEAR" });
                dispatchTree({ type: "SET_ACTIVE_TAG", parentId: "root", title: "" });
                setShowGuideMap(false);
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
                placeholder={leftTab === "terms" ? "搜索节点…" : "搜索文件…"}
                className="w-full h-8 rounded-md border border-input bg-transparent pl-8 pr-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>
          <div className="flex items-center gap-4 px-4 pb-1.5 shrink-0">
            <button onClick={() => setLeftTab("terms")} className={cn("text-[13px] font-semibold", leftTab === "terms" ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>节点</button>
            <button onClick={() => setLeftTab("files")} className={cn("text-[13px] font-semibold", leftTab === "files" ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>文件</button>
          </div>
          <div className="flex-1 overflow-hidden px-4">
            {leftTab === "terms" ? (
            <TermLibrary
              terms={termList}
              currentTerm={treeState.rootTerm}
              search={leftTab === "terms" ? sidebarSearch : undefined}
              onTermClick={handleFocusTerm}
              onTermDelete={(term) => {
                saveTermList(termList.filter((t) => t !== term));
                if (activePdf && term.toLowerCase() === activePdf.name.replace(/\.[^.]+$/, "").toLowerCase()) {
                  setPdfBoundTerm(null);
                  pdfBindingsRef.current.delete(activePdf.name);
                  saveBindings();
                }
                if (treeState.rootTerm === term) {
                  dispatchTree({ type: "CLEAR_ROOT" });
                  dispatchFootprint({ type: "CLEAR" });
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
              onTermRename={(oldTerm, newTerm) => {
                if (!newTerm || oldTerm === newTerm) return;
                saveTermList(termList.map((t) => t === oldTerm ? newTerm : t));
                if (treeState.rootTerm === oldTerm) {
        if (pdfBoundRef.current === oldTerm) {
          setPdfBoundTerm(newTerm);
          pdfBindingsRef.current.forEach((v, k) => { if (v === oldTerm) pdfBindingsRef.current.set(k, newTerm); });
          saveBindings();
        }
                  setPreviewTitle(newTerm);
                  const oldId = SparkMD5.hash(oldTerm.toLowerCase());
                  const newId = SparkMD5.hash(newTerm.toLowerCase());
                  getConceptNode(oldId).then(async (existing) => {
                    if (existing) {
                      existing.term = newTerm;
                      existing.id = newId;
                      putConceptNode(existing);
                      if (oldId !== newId) deleteConceptNode(oldId);
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
                  });
                  dispatchTree({ type: "SET_NODE_TITLE", nodeId: "root", title: newTerm });
                }
              }}
              onNewTerm={() => {
                dispatchTree({ type: "CLEAR_ROOT" });
                dispatchFootprint({ type: "CLEAR" });
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
                if (!treeState.rootTerm) {
                  const bound = pdfBindingsRef.current.get(file.name);
                  handleFocusTerm(bound || file.name.replace(/\.[^.]+$/, ""));
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
              termList={allTerms}
              onTermDelete={(term) => saveTermList(termList.filter((t) => t !== term))}
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
                <Popover open={backOpen} onOpenChange={setBackOpen}>
                  <PopoverTrigger asChild>
                    <button
                      disabled={navIndex <= 0}
                      className="p-0.5 rounded hover:bg-accent disabled:opacity-30 transition-colors"
                      title="Alt+← 后退"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 max-h-60 overflow-auto" align="start">
                    {navHistory.slice(0, navIndex).filter(e => !navEntryEq(e, navHistory[navIndex])).reverse().map((entry, i) => (
                      <button
                        key={`${navEntryLabel(entry)}-${i}`}
                        className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent truncate"
                        onClick={() => {
                          setBackOpen(false);
                          skipHistoryRef.current = true;
                          setNavIndex(navIndex - 1 - i);
                          if (entry.type === "tree") {
                            setShowGuideMap(false);
                            handleFocusTerm(entry.term);
                          } else {
                            setShowGuideMap(true);
                            setGuideFocusPath(entry.focusPath);
                          }
                        }}
                      >
                        {navEntryLabel(entry)}
                      </button>
                    ))}
                    {navIndex <= 0 && (
                      <p className="px-2 py-4 text-sm text-muted-foreground text-center">无历史</p>
                    )}
                  </PopoverContent>
                </Popover>
                <Popover open={fwdOpen} onOpenChange={setFwdOpen}>
                  <PopoverTrigger asChild>
                    <button
                      disabled={navIndex >= navHistory.length - 1}
                      className="p-0.5 rounded hover:bg-accent disabled:opacity-30 transition-colors"
                      title="Alt+→ 前进"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 max-h-60 overflow-auto" align="start">
                    {navHistory.slice(navIndex + 1).map((entry, i) => (
                      <button
                        key={`${navEntryLabel(entry)}-${i}`}
                        className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent truncate"
                        onClick={() => {
                          setFwdOpen(false);
                          skipHistoryRef.current = true;
                          setNavIndex(navIndex + 1 + i);
                          if (entry.type === "tree") {
                            setShowGuideMap(false);
                            handleFocusTerm(entry.term);
                          } else {
                            setShowGuideMap(true);
                            setGuideFocusPath(entry.focusPath);
                          }
                        }}
                      >
                        {navEntryLabel(entry)}
                      </button>
                    ))}
                    {navIndex >= navHistory.length - 1 && (
                      <p className="px-2 py-4 text-sm text-muted-foreground text-center">已是最新</p>
                    )}
                  </PopoverContent>
                </Popover>
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
              {!showGuideMap && treeState.rootTerm && (
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
                  >根</button>
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
                  <span className="text-xs font-medium">{treeState.rootTerm}</span>
                </div>
              )}
              {showGuideMap ? (
              <GuideMapCanvas
                guideMap={activeGroup?.guide_map ?? null}
                initialFocusPath={guideFocusPath}
                  onNodeClick={handleGuideMapNodeClick}
                termList={termList}
                currentFocusTerm={treeState.rootTerm}
                onUpdate={handleGuideMapUpdate}
                onBack={() => {
                  setShowGuideMap(false);
                  if (treeState.rootTerm) {
                    setPreviewTitle(treeState.rootTerm);
                    const id = SparkMD5.hash(treeState.rootTerm.toLowerCase());
                    getConceptNode(id).then((pcached) => {
                      if (pcached) {
                        const plines: string[] = [];
                        const ppresets = [
                          { icon: "🌳", label: "动态直觉", field: "micro_intuition" as const },
                          { icon: "📐", label: "看定义", field: "micro_definition" as const },
                          { icon: "🔧", label: "看应用", field: "micro_application" as const },
                          { icon: "📜", label: "看动机", field: "micro_motivation" as const },
                        ];
                        for (const p of ppresets) {
                          const val = pcached[p.field] as string | null;
                          plines.push(`  ${p.icon} ${p.label}${val ? "" : " (未生成)"}`);
                          const sub = pcached.custom_qa.filter((qa) => qa.parent_node_id === `preset:${p.field}`);
                          for (const qa of sub) plines.push(`    ${qa.type === "inquiry" ? "💬" : "📖"} ${qa.question || extractTitle(qa.answer) || "空节点"}`);
                        }
                        const rootSub = pcached.custom_qa.filter((qa) => qa.parent_node_id === "root");
                        for (const qa of rootSub) plines.push(`  ${qa.type === "inquiry" ? "💬" : "📖"} ${qa.question || extractTitle(qa.answer) || "空节点"}`);
                        setPreviewContent(plines.join("\n"));
                      }
                    });
                  }
                }}
                onNavigate={handleGuideMapNavigate}
                onFocusPathChange={setGuideFocusPath}
                  onRebuild={async (scopePath: number[]) => {
                  if (!activeGroupId) return;
                  const group = workGroups.find((g) => g.id === activeGroupId);
                  if (!group?.guide_map) return;
                  if (scopePath.length === 0) {
                    group.guide_map = { term: "", children: termList.map((t) => ({ term: t, children: [] as GuideMapNode[] })) };
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
            ) : hasRoot ? (
              <RecursiveTree
                rootNode={treeState.rootNode}
                selectedNodeId={treeState.selectedNodeId}
                onToggleExpand={handleToggleExpand}
                onSelect={handleSelect}
                onTermDoubleClick={handleTermDoubleClick}
                onTermContextMenu={handleTermContextMenu}
                onPlusSelect={handlePlusSelect}
                onCreateEmptyChild={handleCreateEmptyChild}
                onEditContent={handleEditContent}
                onRename={handleRename}
                onDelete={handleDelete}
                onDragEnd={handleDragEnd}
                editingNodeId={editingNodeId}
                renamingNodeId={renamingNodeId}
                onEditingChange={handleEditingChange}
                onEditSubmit={handleEditSubmit}
                onRenameSubmit={handleRenameSubmit}
                onSelectionContextMenu={handleSelectionContextMenu}
                onTermHover={handleTermHover}
                onTermLeave={handleTermLeave}
                onFileLink={handleFileLink}
                termPreview={hoverTermPreview}
                termPreviewAnchor={hoverTermPreviewAnchor}
                termPreviewTerm={hoverTermPreviewTerm}
                onTermPreviewClose={handleTermLeave}
                plusItems={plusMenuItems}
              />
            ) : (
              <Onboarding
                recentTerms={recentInputs}
                onTermClick={handleFocusTerm}
                onSubmit={handleFocusTerm}
              />
            )}

              <InputBar
                tagLabel={showGuideMap ? "在当前层级新增节点" : treeState.activeTag.title}
                tagPrefix={showGuideMap ? "" : undefined}
                fillValue={fillValue}
              onFocus={(text) => { setFillValue(""); handleFocusTerm(text); }}
              onCreateChild={(text) => {
                setFillValue("");
                if (showGuideMap) {
                  handleAddGuideMapNode(text, guideFocusPath);
                } else {
                  handleCreateChild(text);
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
            boundTermExists={pdfBoundTerm !== null}
            onCreateBoundTerm={() => {
              const termName = activePdf.name.replace(/\.[^.]+$/, "");
              handleFocusTerm(termName);
              setPdfBoundTerm(termName);
              pdfBindingsRef.current.set(activePdf.name, termName);
              saveBindings();
            }}
            onSelectionContextMenu={(e, sel) => handleSelectionContextMenu(e as any, sel, "root")}
          />
        ) : (
        <PreviewPanel
          termName={previewTitle}
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
    </TooltipProvider>
    </TermListContext.Provider>
  );
}
