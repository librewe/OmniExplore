"use client";

import { useEffect, useReducer, useState, useCallback, useRef } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WorkGroupSwitcher } from "@/components/WorkGroupSwitcher";
import { RecursiveTree } from "@/components/RecursiveTree";
import { InputBar } from "@/components/InputBar";
import { SettingsPanel } from "@/components/SettingsPanel";
import { PreviewPanel } from "@/components/PreviewPanel";
import { GuideMap } from "@/components/GuideMap";
import { TermLibrary } from "@/components/TermLibrary";
import { Onboarding } from "@/components/Onboarding";
import { treeReducer, getInitialTreeState, buildRootNode } from "@/store/treeStore";
import { footprintReducer, initialState as initialFootprint } from "@/store/footprintStore";
import { initializeConfig, useConfigStore } from "@/store/configStore";
import { getConceptNode, putConceptNode, getAllWorkGroups, putWorkGroup, deleteWorkGroup as deleteWG } from "@/services/cache";
import { streamLLM, LLMError } from "@/services/llm";
import { getPresetPrompt, inquiryPrompt } from "@/services/prompts";
import { extractTitle } from "@/lib/utils";
import { DEFAULT_INQUIRY_TEMPLATES, getPresetPrefix } from "@/lib/constants";
import type {
  TreeNodeData,
  ConceptNode,
  WorkGroup,
  GuideMapNode,
  PlusMenuItem,
  CustomQA,
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
  const [recentInputs, setRecentInputs] = useState<string[]>([]);

  const [showGuideMap, setShowGuideMap] = useState(false);
  const [fillValue, setFillValue] = useState<string>("");
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [renamingNodeId, setRenamingNodeId] = useState<string | null>(null);
  const [navHistory, setNavHistory] = useState<string[]>([]);
  const [navIndex, setNavIndex] = useState(-1);
  const skipHistoryRef = useRef(false);
  const navStoreRef = useRef<Map<string, { history: string[]; index: number }>>(new Map());

  const [previewTitle, setPreviewTitle] = useState("");
  const [previewContent, setPreviewContent] = useState<string | null>(null);

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

  const termListKey = `term_list_${activeGroupId || "default"}`;

  const saveTermList = useCallback((terms: string[]) => {
    setTermList(terms);
    localStorage.setItem(termListKey, JSON.stringify(terms));
  }, [termListKey]);

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
        setNavHistory((prev) => { const next = prev.slice(0, navIndex + 1); next.push(term); return next; });
        setNavIndex((prev) => prev + 1);
      }
      skipHistoryRef.current = false;

      dispatchFootprint({ type: "APPEND", term, nodeId: SparkMD5.hash(term.toLowerCase()) });

      const id = SparkMD5.hash(term.toLowerCase());
      const cached = await getConceptNode(id);

      const rootNode = buildRootNode(term, "micro");
      dispatchTree({ type: "SET_ROOT", rootNode });
      dispatchTree({ type: "SET_ACTIVE_TAG", parentId: "root", title: term });
      setShowGuideMap(false);
      ensureGuideMap();

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
        const rootNode = findNode(parentId);
        const parentTerm = rootNode?.term || treeState.rootTerm;
        const { system, user } = inquiryPrompt(parentTerm, treeState.rootTerm, text);
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
      menu.className = "fixed z-50 min-w-[180px] rounded-md border bg-popover p-1 shadow-md animate-in fade-in-0 zoom-in-95";
      menu.style.left = `${e.clientX}px`;
      menu.style.top = `${e.clientY}px`;
      menu.innerHTML = `
        <button class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent" data-action="focus">
          <span>🎯</span> <span>设为焦点</span>
        </button>
      `;

      document.body.appendChild(menu);

      menu.querySelector("[data-action='focus']")?.addEventListener("click", () => {
        menu.remove();
        handleFocusTerm(term);
      });

      const close = (ev: MouseEvent) => {
        if (!menu.contains(ev.target as Node)) {
          menu.remove();
          document.removeEventListener("click", close);
        }
      };
      setTimeout(() => document.addEventListener("click", close), 0);
    },
    [handleFocusTerm]
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

      plusMenuItems.forEach((item) => {
        const btn = document.createElement("button");
        btn.className = "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent";
        btn.innerHTML = `<span>${item.label}</span>`;
        btn.onclick = () => {
          menu.remove();
          const node = findNode(nodeId);
          const label = item.prompt.replace(/\$\{term\}/g, selectedText);
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
    [handleFocusTerm, plusMenuItems, findNode]
  );

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
      if (newTitle.trim()) {
        dispatchTree({ type: "SET_NODE_TITLE", nodeId, title: newTitle.trim() });
      }
      setRenamingNodeId(null);
    },
    []
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
    (sourceId: string, targetId: string) => {
      const s = findNode(sourceId);
      const t = findNode(targetId);
      if (!s || !t || sourceId === targetId) return;
      function isDesc(p: TreeNodeData, cid: string): boolean {
        if (p.id === cid) return true;
        return p.children.some((c) => isDesc(c, cid));
      }
      if (isDesc(s, targetId)) return;
      dispatchTree({ type: "REMOVE_NODE", nodeId: sourceId });
      dispatchTree({ type: "ADD_CHILD", parentId: targetId, child: { ...s, parentId: targetId } });
      getConceptNode(SparkMD5.hash(s.term.toLowerCase())).then((existing) => {
        if (existing) {
          const qa = existing.custom_qa.find((q) => q.id === sourceId);
          if (qa) { qa.parent_node_id = targetId; existing.updated_at = Date.now(); putConceptNode(existing); }
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

  const ensureGuideMap = useCallback(async () => {
    if (!treeState.rootTerm || !activeGroupId) return;
    const group = workGroups.find((g) => g.id === activeGroupId);
    if (!group) return;
    if (!group.guide_map) {
      group.guide_map = { term: treeState.rootTerm, children: [] };
    } else {
      const exists = (n: GuideMapNode): boolean =>
        n.term === treeState.rootTerm || n.children.some(exists);
      if (!exists(group.guide_map)) {
        if (group.guide_map.term) {
          group.guide_map = { term: "", children: [group.guide_map, { term: treeState.rootTerm, children: [] }] };
        } else {
          group.guide_map.children.push({ term: treeState.rootTerm, children: [] });
        }
      }
    }
    group.updated_at = Date.now();
    await putWorkGroup(group);
    setWorkGroups((prev) => prev.map((g) => (g.id === activeGroupId ? { ...group } : g)));
  }, [treeState.rootTerm, activeGroupId, workGroups]);

  const lastMapClickRef = useRef<{ term: string; time: number } | null>(null);

  const handleGuideMapNodeClick = useCallback(
    async (term: string) => {
      const now = Date.now();
      const last = lastMapClickRef.current;
      if (last && last.term === term && now - last.time < 600) {
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
    [handleFocusTerm]
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
        if (!showGuideMap && treeState.rootNode) {
          ensureGuideMap();
          setShowGuideMap(true);
        } else if (showGuideMap) {
          setShowGuideMap(false);
        }
      }
      if (e.altKey && e.key === "ArrowLeft" && navIndex > 0) {
        e.preventDefault();
        skipHistoryRef.current = true;
        setNavIndex(navIndex - 1);
        handleFocusTerm(navHistory[navIndex - 1]);
      }
      if (e.altKey && e.key === "ArrowRight" && navIndex < navHistory.length - 1) {
        e.preventDefault();
        skipHistoryRef.current = true;
        setNavIndex(navIndex + 1);
        handleFocusTerm(navHistory[navIndex + 1]);
      }
    },
    [showGuideMap, treeState.rootNode, ensureGuideMap, navHistory, navIndex, handleFocusTerm]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const hasRoot = !!treeState.rootNode;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen overflow-hidden">
        <aside className="w-72 shrink-0 border-r bg-background flex flex-col">
          <div className="px-4 py-2 border-b">
            <span className="font-bold text-base">🌳 OmniExplore</span>
          </div>
          <WorkGroupSwitcher
            groups={workGroups}
            activeGroupId={activeGroupId}
            onSelect={handleWorkGroupSelect}
            onCreate={handleWorkGroupCreate}
          />
          <div className="flex-1 overflow-hidden">
            <TermLibrary
              terms={termList}
              currentTerm={treeState.rootTerm}
              onTermClick={handleFocusTerm}
              onTermDelete={(term) => saveTermList(termList.filter((t) => t !== term))}
              onTermRename={(oldTerm, newTerm) => {
                if (!newTerm || oldTerm === newTerm) return;
                saveTermList(termList.map((t) => t === oldTerm ? newTerm : t));
                if (treeState.rootTerm === oldTerm) {
                  handleFocusTerm(newTerm);
                }
              }}
              onNewTerm={() => {
                dispatchTree({ type: "CLEAR_ROOT" });
                dispatchFootprint({ type: "CLEAR" });
              }}
            />
          </div>
          <div className="border-t p-1.5">
            <SettingsPanel
              termList={allTerms}
              onTermDelete={(term) => saveTermList(termList.filter((t) => t !== term))}
              plusMenuItems={plusMenuItems}
              onPlusMenuItemsChange={savePlusMenu}
            />
          </div>
        </aside>

        <main className="flex-1 flex flex-col min-w-0 border-r">
          <header className="flex items-center px-4 py-2 border-b shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-0.5">
                <button
                  disabled={navIndex <= 0}
                  onClick={() => { if (navIndex > 0) { skipHistoryRef.current = true; setNavIndex(navIndex - 1); handleFocusTerm(navHistory[navIndex - 1]); } }}
                  className="p-0.5 rounded hover:bg-accent disabled:opacity-30 transition-colors"
                  title="Alt+← 后退"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
                </button>
                <button
                  disabled={navIndex >= navHistory.length - 1}
                  onClick={() => { if (navIndex < navHistory.length - 1) { skipHistoryRef.current = true; setNavIndex(navIndex + 1); handleFocusTerm(navHistory[navIndex + 1]); } }}
                  className="p-0.5 rounded hover:bg-accent disabled:opacity-30 transition-colors"
                  title="Alt+→ 前进"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                </button>
              </div>
              <span className="font-semibold text-base">{activeGroup?.name || "OmniExplore"}</span>
              {showGuideMap && (
                <span className="text-xs text-muted-foreground bg-accent rounded px-2 py-0.5">
                  导图模式 · Esc 返回
                </span>
              )}
            </div>
          </header>

          <div className="flex-1 flex flex-col min-h-0">
            {showGuideMap ? (
              <GuideMap
                guideMap={activeGroup?.guide_map ?? null}
                onNodeClick={handleGuideMapNodeClick}
                termList={termList}
                currentFocusTerm={treeState.rootTerm}
                onUpdate={handleGuideMapUpdate}
                onBack={() => setShowGuideMap(false)}
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
                termPreview={null}
                termPreviewAnchor={null}
                termPreviewTerm=""
                onTermPreviewClose={() => {}}
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
                tagLabel={showGuideMap ? "在当前图层新增根节点" : treeState.activeTag.title}
                tagPrefix={showGuideMap ? "" : undefined}
                fillValue={fillValue}
              onFocus={(text) => { setFillValue(""); handleFocusTerm(text); }}
              onCreateChild={(text) => { setFillValue(""); handleCreateChild(text); }}
            />
          </div>
        </main>

        <PreviewPanel
          termName={previewTitle}
          content={previewContent}
          onTermDoubleClick={handleTermDoubleClick}
          onTermContextMenu={handleTermContextMenu}
        />
      </div>
    </TooltipProvider>
  );
}
