"use client";

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronRight,
  Circle,
  Plus,
  Pencil,
  Trash2,
  Network,
  ArrowLeft,
  FolderOpen,
  Layers,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import type { GuideMapNode } from "@/types";
import { cn } from "@/lib/utils";

type NodePath = number[];

function pathToId(path: NodePath): string {
  return path.length === 0 ? "--root--" : path.map((n) => `c${n}`).join("-");
}

function idToPath(id: string): NodePath {
  if (id === "--root--" || !id) return [];
  return id.split("-").map((seg) => parseInt(seg.slice(1), 10));
}

function cloneTree(tree: GuideMapNode): GuideMapNode {
  return structuredClone(tree);
}

function getNodeByPath(root: GuideMapNode, path: NodePath): GuideMapNode | null {
  if (!root) return null;
  if (path.length === 0) return root;
  const list = root.term === "" ? root.children : [root];
  let current: GuideMapNode | undefined = list[path[0]];
  if (!current) return null;
  for (let i = 1; i < path.length; i++) {
    current = current.children[path[i]];
    if (!current) return null;
  }
  return current;
}

export function buildBreadcrumbItems(
  guideMap: GuideMapNode | null,
  focusPath: NodePath
): { label: string; path: NodePath }[] {
  if (!guideMap || focusPath.length === 0) return [];
  const items: { label: string; path: NodePath }[] = [];
  const startAt = guideMap.term === "" ? 0 : -1;
  if (startAt === -1) items.push({ label: guideMap.term, path: [] });
  for (let i = 0; i < focusPath.length; i++) {
    const node = getNodeByPath(guideMap, focusPath.slice(0, i + 1));
    items.push({ label: node?.term ?? "?", path: focusPath.slice(0, i + 1) });
  }
  return items;
}

function removeNodeByPath(tree: GuideMapNode, path: NodePath): { tree: GuideMapNode; removed: GuideMapNode | null } {
  const newTree = cloneTree(tree);
  if (path.length === 0) return { tree: newTree, removed: null };

  function remove(node: GuideMapNode, depth: number): GuideMapNode | null {
    if (depth === path.length - 1) {
      return node.children.splice(path[depth], 1)[0] ?? null;
    }
    const child = node.children[path[depth]];
    if (!child) return null;
    return remove(child, depth + 1);
  }

  if (newTree.term === "") {
    if (path.length === 1) {
      const removed = newTree.children.splice(path[0], 1)[0] ?? null;
      return { tree: newTree, removed };
    }
    const child = newTree.children[path[0]];
    if (!child) return { tree: newTree, removed: null };
    const removed = remove(child, 1);
    return { tree: newTree, removed };
  }

  const removed = remove(newTree, 0);
  return { tree: newTree, removed };
}

function insertAsChild(tree: GuideMapNode, parentPath: NodePath, node: GuideMapNode): GuideMapNode {
  const newTree = cloneTree(tree);
  if (parentPath.length === 0) {
    if (newTree.term === "") { newTree.children.push(node); }
    else { newTree.children.push(node); }
    return newTree;
  }
  const target = getNodeByPath(newTree, parentPath);
  if (target) { target.children.push(node); }
  return newTree;
}

function insertAsSibling(tree: GuideMapNode, parentPath: NodePath, atIndex: number, node: GuideMapNode): GuideMapNode {
  const newTree = cloneTree(tree);
  if (parentPath.length === 0) {
    if (newTree.term === "") { newTree.children.splice(atIndex, 0, node); }
    else { newTree.children.splice(atIndex, 0, node); }
    return newTree;
  }
  const parent = getNodeByPath(newTree, parentPath);
  if (parent) { parent.children.splice(atIndex, 0, node); }
  return newTree;
}

function replaceAtPath(tree: GuideMapNode, path: NodePath, newNode: GuideMapNode): GuideMapNode {
  const newTree = cloneTree(tree);
  if (path.length === 0) return newTree;
  if (newTree.term === "" && path.length === 1) {
    newTree.children[path[0]] = newNode;
    return newTree;
  }
  const parentPath = path.slice(0, -1);
  const idx = path[path.length - 1];
  const parent = getNodeByPath(newTree, parentPath);
  if (parent && parent.children[idx]) {
    parent.children[idx] = newNode;
  }
  return newTree;
}

interface GuideMapCanvasProps {
  guideMap: GuideMapNode | null;
  initialFocusPath?: NodePath;
  onNodeClick: (term: string, nodePath?: NodePath) => void;
  termList: string[];
  currentFocusTerm: string;
  onUpdate: (node: GuideMapNode) => void;
  onBack: () => void;
  onRebuild?: (scopePath: NodePath) => void;
  onFocusPathChange?: (path: NodePath) => void;
  onNavigate?: (focusPath: NodePath, pathStr: string) => void;
}

export function GuideMapCanvas({
  guideMap,
  initialFocusPath,
  onNodeClick,
  termList,
  currentFocusTerm,
  onUpdate,
  onBack,
  onRebuild,
  onFocusPathChange,
  onNavigate,
}: GuideMapCanvasProps) {
  const [focusPath, setFocusPath] = useState<NodePath>([]);
  const didRestoreRef = useRef(false);
  const focusPathRef = useRef<NodePath>([]);
  useEffect(() => { focusPathRef.current = focusPath; }, [focusPath]);

  useEffect(() => {
    if (!didRestoreRef.current) {
      didRestoreRef.current = true;
      if (initialFocusPath && initialFocusPath.length > 0) {
        setFocusPath(initialFocusPath);
      }
      return;
    }
    const ip = initialFocusPath ?? [];
    if (ip.length !== focusPathRef.current.length || ip.some((v, i) => v !== focusPathRef.current[i])) {
      setFocusPath(ip);
    }
  }, [initialFocusPath]);
  const navigatedRef = useRef(false);
  useEffect(() => {
    if (!navigatedRef.current) { navigatedRef.current = true; return; }
    if (!onNavigate) return;
    const parts: string[] = ["根"];
    if (focusPath.length > 0 && guideMap) {
      for (let i = 0; i < focusPath.length; i++) {
        const node = getNodeByPath(guideMap, focusPath.slice(0, i + 1));
        parts.push(node?.term || "?");
      }
    }
    onNavigate(focusPath, parts.join(">"));
  }, [focusPath]);

  useEffect(() => {
    if (!guideMap || focusPath.length === 0) return;
    for (let len = focusPath.length; len >= 0; len--) {
      const testPath = focusPath.slice(0, len);
      if (testPath.length === 0) { setFocusPath([]); return; }
      const node = getNodeByPath(guideMap, testPath);
      if (node) {
        if (testPath.length !== focusPath.length) setFocusPath(testPath);
        return;
      }
    }
    setFocusPath([]);
  }, [guideMap, focusPath]);
  const [selectedPath, setSelectedPath] = useState<NodePath | null>(null);
  const selectedPathRef = useRef<NodePath | null>(null);
  const [editingNodePath, setEditingNodePath] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [addingToPath, setAddingToPath] = useState<string | null>(null);
  const [newChildText, setNewChildText] = useState("");
  const [dragNode, setDragNode] = useState<{ term: string } | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const focusedNode = useMemo(() => {
    if (!guideMap || focusPath.length === 0) return guideMap;
    return getNodeByPath(guideMap, focusPath);
  }, [guideMap, focusPath]);

  const breadcrumb = useMemo(() => buildBreadcrumbItems(guideMap, focusPath), [guideMap, focusPath]);

  const visibleNodes = useMemo((): GuideMapNode[] => {
    if (!guideMap) return [];
    if (focusPath.length === 0) {
      return guideMap.term === "" ? guideMap.children : [guideMap];
    }
    return focusedNode?.children ?? [];
  }, [guideMap, focusedNode, focusPath]);

  const handleFocus = useCallback((newPath: NodePath) => {
    setFocusPath(newPath);
    setSelectedPath(null);
    selectedPathRef.current = null;
    onFocusPathChange?.(newPath);
  }, [onFocusPathChange]);

  const handleESC = useCallback(() => {
    if (focusPath.length > 0) {
      setFocusPath(focusPath.slice(0, -1));
    } else {
      onBack();
    }
  }, [focusPath, onBack]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleESC();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [handleESC]);

  const handleStartEdit = useCallback((path: NodePath, text: string) => {
    setEditingNodePath(pathToId(path));
    setEditText(text);
    setAddingToPath(null);
  }, []);

  const handleCommitEdit = useCallback(() => {
    if (!guideMap || !editingNodePath || !editText.trim()) {
      setEditingNodePath(null);
      return;
    }
    const targetPath = idToPath(editingNodePath);
    const newTree = cloneTree(guideMap);
    const node = getNodeByPath(newTree, targetPath);
    if (node) node.term = editText.trim();
    onUpdate(newTree);
    setEditingNodePath(null);
  }, [guideMap, editingNodePath, editText, onUpdate]);

  const handleStartAdd = useCallback((path: NodePath) => {
    setAddingToPath(pathToId(path));
    setNewChildText("");
    setEditingNodePath(null);
  }, []);

  const handleCommitAdd = useCallback(() => {
    if (!guideMap || !addingToPath) {
      setAddingToPath(null);
      return;
    }
    if (!newChildText.trim()) {
      setAddingToPath(null);
      return;
    }
    const targetPath = idToPath(addingToPath);
    const newTree = insertAsChild(guideMap, targetPath, { term: newChildText.trim(), children: [] });
    onUpdate(newTree);
    setAddingToPath(null);
  }, [guideMap, addingToPath, newChildText, onUpdate]);

  const handleUpdateNode = useCallback(
    (path: NodePath, updated: GuideMapNode | null) => {
      if (!guideMap) return;
      const { tree } = removeNodeByPath(guideMap, path);
      if (!updated) { onUpdate(tree); return; }
      const parentPath = path.length > 0 ? path.slice(0, -1) : [];
      onUpdate(insertAsChild(tree, parentPath, updated));
    },
    [guideMap, onUpdate]
  );

  const handleDissolveGroup = useCallback(
    (path: NodePath) => {
      if (!guideMap) return;
      const node = getNodeByPath(guideMap, path);
      if (!node || node.children.length === 0) return;
      const { tree } = removeNodeByPath(guideMap, path);
      let result = tree;
      for (const child of [...node.children].reverse()) {
        result = insertAsSibling(result, path.slice(0, -1), path.length > 0 ? path[path.length - 1] : 0, child);
      }
      onUpdate(result);
    },
    [guideMap, onUpdate]
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const path = idToPath(event.active.id as string);
      const node = guideMap ? getNodeByPath(guideMap, path) : null;
      if (node) setDragNode({ term: node.term });
    },
    [guideMap]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setDragNode(null);
      if (!guideMap) return;
      const { active, over } = event;
      const sourcePath = idToPath(active.id as string);

      if (!over || active.id === over.id) {
        if (!over && guideMap) {
          const { tree: afterRemove, removed } = removeNodeByPath(guideMap, sourcePath);
          if (removed) {
            const target = getNodeByPath(afterRemove, focusPath);
            const dup = target?.children?.some((c) => c.term.toLowerCase() === removed.term.toLowerCase() && !c._group);
            if (!dup) onUpdate(insertAsChild(afterRemove, focusPath, removed));
            else onUpdate(afterRemove);
          }
        }
        return;
      }

      const targetId = over.id as string;

      if (targetId === "canvas-root") {
        const { tree: afterRemove, removed } = removeNodeByPath(guideMap, sourcePath);
        if (removed) {
          const target = getNodeByPath(afterRemove, focusPath);
          const dup = target?.children?.some((c) => c.term.toLowerCase() === removed.term.toLowerCase() && !c._group);
          if (!dup) onUpdate(insertAsChild(afterRemove, focusPath, removed));
          else onUpdate(afterRemove);
        }
        return;
      }

      let targetPath = idToPath(targetId);
      const sourceIsAncestor = sourcePath.length < targetPath.length &&
        sourcePath.every((v, i) => targetPath[i] === v);
      if (sourceIsAncestor) return;

      const targetNode = getNodeByPath(guideMap, targetPath);
      const { tree: afterRemove, removed } = removeNodeByPath(guideMap, sourcePath);
      if (!removed) return;

      const srcParent = sourcePath.slice(0, -1);
      const tgtParent = targetPath.slice(0, -1);
      const sameParent = srcParent.length === tgtParent.length && srcParent.every((v, i) => v === tgtParent[i]);
      const srcIdx = sourcePath[sourcePath.length - 1];
      const tgtIdx = targetPath[targetPath.length - 1];
      if (sameParent && srcIdx < tgtIdx) {
        targetPath = [...tgtParent, tgtIdx - 1];
      }

      if (targetNode && targetNode.children.length === 0 && targetNode.term !== "" && !targetNode._group) {
        const newNode: GuideMapNode = { term: targetNode.term, children: [targetNode, removed], _group: true };
        onUpdate(replaceAtPath(afterRemove, targetPath, newNode));
      } else {
        onUpdate(insertAsChild(afterRemove, targetPath, removed));
      }
    },
    [guideMap, onUpdate, focusPath]
  );

  const handleNodeClick = useCallback(
    (path: NodePath, term: string, hasChildren: boolean) => {
      const id = pathToId(path);
      const now = Date.now();
      const isAlreadySelected = selectedPathRef.current !== null && pathToId(selectedPathRef.current) === id;

      const lastTime = lastClickMapRef.current.get(id);
      if (lastTime && now - lastTime < 500) {
          if (hasChildren) {
            handleFocus(path);
          } else {
            onNodeClick(term, path);
          }
        lastClickMapRef.current.set(id, 0);
        return;
      }

      if (isAlreadySelected && hasChildren) {
        handleFocus(path);
        lastClickMapRef.current.set(id, now);
        return;
      }

        setSelectedPath(path);
        selectedPathRef.current = path;
        onNodeClick(term, path);
      lastClickMapRef.current.set(id, now);
    },
    [onNodeClick, handleFocus]
  );

  const lastClickMapRef = useRef<Map<string, number>>(new Map());
  const { setNodeRef: setCanvasDropRef, isOver: isCanvasOver } = useDroppable({ id: "canvas-root" });

  if (!guideMap) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center px-4 py-2 border-b">
          <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" /><span>返回</span>
          </button>
        </div>
        <div className="flex flex-col items-center justify-center flex-1 gap-4">
          <Network className="w-12 h-12 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">暂无节点</p>
        </div>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex flex-col h-full">
        <div className="flex items-center px-4 py-2 border-b shrink-0">
          <div className="flex items-center gap-2">
            <button onClick={handleESC} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors" title={focusPath.length > 0 ? "ESC 返回上层" : "返回树视图"}>
              <ArrowLeft className="w-4 h-4" />
              <span className="text-xs">{focusPath.length > 0 ? "上层" : "返回"}</span>
            </button>
          </div>

          <div className="flex items-center gap-0.5 ml-3">
              <button onClick={() => setFocusPath([])} className={cn("text-xs px-1 py-0.5 rounded transition-colors", focusPath.length === 0 ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground")}>根</button>
              {breadcrumb.map((item, i) => (
                <div key={i} className="flex items-center gap-0.5">
                  <ChevronRight className="w-3 h-3 text-muted-foreground" />
                  <button onClick={() => setFocusPath(item.path)} className={cn("text-xs px-1 py-0.5 rounded transition-colors max-w-[120px] truncate", i === breadcrumb.length - 1 ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground")}>{item.label}</button>
                </div>
              ))}
            </div>

          <div className="flex items-center gap-2 ml-auto">
            {onRebuild && (
              <button onClick={() => onRebuild(focusPath)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors" title="从术语库重建">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 2v6h-6M3 12a9 9 0 0115.36-6.36L21 8M3 22v-6h6M21 12a9 9 0 01-15.36 6.36L3 16"/></svg>
                <span>重建</span>
              </button>
            )}
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="relative min-h-[300px] p-6 h-full">
            <div ref={setCanvasDropRef}
            className={cn("absolute inset-0 z-0", isCanvasOver && "bg-primary/5 rounded-xl")}
            onMouseDown={() => { setSelectedPath(null); selectedPathRef.current = null; }}
          />
            {visibleNodes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 gap-3 pointer-events-auto">
                <FolderOpen className="w-10 h-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">{focusPath.length > 0 ? "此分组下暂无节点" : "在输入框输入术语名创建图节点"}</p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-4 justify-start items-start relative z-10 pointer-events-none">
                {visibleNodes.map((node, i) => {
                  const cardPath = focusPath.length > 0 ? [...focusPath, i] : guideMap.term === "" ? [i] : [];
                  return (
                    <NodeCard
                      key={pathToId(cardPath)}
                      node={node}
                      path={cardPath}
                      depth={0}
                      selectedPathId={selectedPath ? pathToId(selectedPath) : null}
                      termList={termList}
                      currentFocusTerm={currentFocusTerm}
                      onNodeClick={handleNodeClick}
                      onUpdateNode={handleUpdateNode}
                      onDissolveGroup={handleDissolveGroup}
                      onEnterFocus={handleFocus}
                      editingNodePath={editingNodePath}
                      editText={editText}
                      onStartEdit={handleStartEdit}
                      onEditChange={setEditText}
                      onCommitEdit={handleCommitEdit}
                      addingToPath={addingToPath}
                      newChildText={newChildText}
                      onStartAdd={handleStartAdd}
                      onNewChildChange={setNewChildText}
                      onCommitAdd={handleCommitAdd}
                    />
                  );
                })}
              </div>
            )}

            {isCanvasOver && (
              <div className="flex items-center justify-center mt-6 p-4 border-2 border-dashed border-primary/40 rounded-xl bg-primary/5">
                <p className="text-sm text-primary/70">释放到此处以移出分组</p>
              </div>
          )}
          </div>
        </ScrollArea>

        <DragOverlay dropAnimation={null}>
          {dragNode ? (
            <div className="bg-popover border rounded-xl px-3 py-2 text-sm shadow-lg font-medium">
              {dragNode.term}
            </div>
          ) : null}
        </DragOverlay>
      </div>
    </DndContext>
  );
}

function NodeCard({
  node, path, depth, selectedPathId, termList, currentFocusTerm,
  onNodeClick, onUpdateNode, onDissolveGroup, onEnterFocus,
  editingNodePath, editText, onStartEdit, onEditChange, onCommitEdit,
  addingToPath, newChildText, onStartAdd, onNewChildChange, onCommitAdd,
}: {
  node: GuideMapNode; path: NodePath; depth: number;   selectedPathId: string | null;
  termList: string[]; currentFocusTerm: string;
  onNodeClick: (path: NodePath, term: string, hasChildren: boolean) => void;
  onUpdateNode: (path: NodePath, updated: GuideMapNode | null) => void;
  onDissolveGroup: (path: NodePath) => void;
  onEnterFocus: (path: NodePath) => void;
  editingNodePath: string | null; editText: string;
  onStartEdit: (path: NodePath, text: string) => void;
  onEditChange: (text: string) => void; onCommitEdit: () => void;
  addingToPath: string | null; newChildText: string;
  onStartAdd: (path: NodePath) => void;
  onNewChildChange: (text: string) => void; onCommitAdd: () => void;
}) {
  const id = pathToId(path);
  const hasChildren = node.children.length > 0;
  const isGroup = !!node._group || hasChildren || node.term === "";
  const isFocused = currentFocusTerm.toLowerCase() === node.term.toLowerCase();
  const isEditing = editingNodePath === id;
  const isAdding = addingToPath === id;
  const isSelected = selectedPathId === id;
  const [cardHovered, setCardHovered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => {
      if (cardRef.current?.matches(":hover")) setCardHovered(true);
    });
  }, []);

  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({ id, disabled: isEditing });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id });

  const dragStyle = transform ? { transform: CSS.Translate.toString(transform), zIndex: 50 } : undefined;

  return (
    <div
      ref={cardRef}
      data-card
      className={cn("relative select-none w-fit pointer-events-auto", isDragging && "opacity-30")}
      onMouseEnter={() => setCardHovered(true)}
      onMouseLeave={() => setCardHovered(false)}
    >
      <div ref={setDragRef} {...listeners} {...attributes} style={dragStyle} className="cursor-grab active:cursor-grabbing">
        <div
          ref={setDropRef}
          className={cn(
            "rounded-xl border-2 transition-colors duration-150",
            depth === 0 ? "min-w-[140px] max-w-[280px]" : "min-w-[120px] max-w-[220px]",
            isOver && !isDragging ? "border-primary bg-primary/5 shadow-lg shadow-primary/10" : "border-border bg-card hover:border-muted-foreground/30 hover:shadow-sm",
            isGroup && "border-dashed",
            isSelected && "ring-2 ring-primary/40"
          )}
          onClick={(e) => { if (!isEditing) { e.stopPropagation(); onNodeClick(path, node.term, isGroup); } }}
        >
          <div className="flex items-center gap-1.5 px-3 py-2">
            <Layers className="w-3 h-3 text-muted-foreground/50 shrink-0" />
            {isFocused && !isGroup && <Circle className="w-3 h-3 text-primary fill-primary shrink-0" />}

            {isEditing ? (
              <input
                value={editText}
                onChange={(e) => onEditChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") onCommitEdit(); }}
                onBlur={() => onCommitEdit()}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 h-6 rounded border border-input bg-background px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                autoFocus
              />
            ) : (
              <span className={cn("text-sm font-medium truncate flex-1", isFocused && "text-primary")}>
                {node.term || node.children[0]?.term || "空组"}
                {!node.term && node.children.length === 0 && "（空）"}
              </span>
            )}

            <div
              className="flex gap-0.5 shrink-0 transition-opacity ml-auto"
              style={{ opacity: cardHovered ? 1 : 0 }}
            >
              {isGroup && (
                <button onClick={(e) => { e.stopPropagation(); onStartEdit(path, node.term); }} className="p-0.5 rounded hover:bg-accent transition-colors" title="重命名"><Pencil className="w-3 h-3 text-muted-foreground" /></button>
              )}
              {isGroup && (
                <button onClick={(e) => { e.stopPropagation(); onStartAdd(path); }} className="p-0.5 rounded hover:bg-accent transition-colors" title="添加子节点"><Plus className="w-3 h-3 text-muted-foreground" /></button>
              )}
              {isGroup ? (
                hasChildren ? (
                  <button onClick={(e) => { e.stopPropagation(); onDissolveGroup(path); }} className="p-0.5 rounded hover:bg-accent transition-colors" title="解散分组"><Trash2 className="w-3 h-3 text-destructive" /></button>
                ) : (
                  <button onClick={(e) => { e.stopPropagation(); onUpdateNode(path, null); }} className="p-0.5 rounded hover:bg-accent transition-colors" title="删除"><Trash2 className="w-3 h-3 text-destructive" /></button>
                )
              ) : (
                <button onClick={(e) => { e.stopPropagation(); onUpdateNode(path, null); }} className="p-0.5 rounded hover:bg-accent transition-colors" title="删除"><Trash2 className="w-3 h-3 text-destructive" /></button>
              )}
              {isGroup && (
                <button onClick={(e) => { e.stopPropagation(); onEnterFocus(path); }} className="p-0.5 rounded hover:bg-accent transition-colors" title="聚焦此分组"><FolderOpen className="w-3 h-3 text-muted-foreground" /></button>
              )}
            </div>
          </div>

          {isAdding && (
            <div className="px-3 pb-2" onClick={(e) => e.stopPropagation()}>
              <Input value={newChildText} onChange={(e) => onNewChildChange(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") onCommitAdd(); if (e.key === "Escape") onCommitAdd(); }} onBlur={() => onCommitAdd()} placeholder="新节点名称" className="h-7 text-xs" autoFocus />
            </div>
          )}

          {hasChildren && (
            <div className="px-2 pb-2 flex flex-wrap gap-2">
              {node.children.map((child, i) => (
                <NodeCard
                  key={pathToId([...path, i])}
                  node={child} path={[...path, i]} depth={depth + 1}
                  selectedPathId={selectedPathId}
                  termList={termList} currentFocusTerm={currentFocusTerm}
                  onNodeClick={onNodeClick} onUpdateNode={onUpdateNode} onDissolveGroup={onDissolveGroup} onEnterFocus={onEnterFocus}
                  editingNodePath={editingNodePath} editText={editText}
                  onStartEdit={onStartEdit} onEditChange={onEditChange} onCommitEdit={onCommitEdit}
                  addingToPath={addingToPath} newChildText={newChildText}
                  onStartAdd={onStartAdd} onNewChildChange={onNewChildChange} onCommitAdd={onCommitAdd}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
