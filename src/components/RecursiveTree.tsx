"use client";

import { useState, useCallback, useRef } from "react";
import { DndContext, DragOverlay, type DragStartEvent, type DragEndEvent, type DragMoveEvent } from "@dnd-kit/core";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TreeNode } from "./TreeNode";
import { HoverPreview } from "./HoverPreview";
import type { TreeNodeData } from "@/types";

interface RecursiveTreeProps {
  rootNode: TreeNodeData | null;
  selectedNodeId: string | null;
  onToggleExpand: (nodeId: string) => void;
  onSelect: (nodeId: string | null) => void;
  onTermDoubleClick: (term: string) => void;
  onTermContextMenu: (e: React.MouseEvent, term: string) => void;
  onPlusSelect: (parentId: string, prompt: string) => void;
  onCreateEmptyChild: (parentId: string) => void;
  onEditContent: (nodeId: string) => void;
  onRename: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onDragEnd: (sourceId: string, targetId: string, position: "before" | "inside" | "after") => void;
  editingNodeId: string | null;
  renamingNodeId: string | null;
  onEditingChange: (nodeId: string, value: string) => void;
  onEditSubmit: (nodeId: string) => void;
  onRenameSubmit: (nodeId: string, title: string) => void;
  onSelectionContextMenu: (e: React.MouseEvent, selectedText: string, nodeId: string) => void;
  onTermHover?: (e: React.MouseEvent, term: string) => void;
  onTermLeave?: () => void;
  onFileLink?: (filename: string) => void;
  termPreview: string | null;
  termPreviewAnchor: DOMRect | null;
  termPreviewTerm: string;
  onTermPreviewClose: () => void;
  plusItems: Array<{ id: string; label: string; prompt: string }>;
}

export function RecursiveTree({
  rootNode,
  selectedNodeId,
  onToggleExpand,
  onSelect,
  onTermDoubleClick,
  onTermContextMenu,
  onPlusSelect,
  onCreateEmptyChild,
  onEditContent,
  onRename,
  onDelete,
  onDragEnd,
  editingNodeId,
  renamingNodeId,
  onEditingChange,
  onEditSubmit,
  onRenameSubmit,
  onSelectionContextMenu,
  onTermHover,
  onTermLeave,
  onFileLink,
  termPreview,
  termPreviewAnchor,
  termPreviewTerm,
  onTermPreviewClose,
  plusItems,
}: RecursiveTreeProps) {
  const [contextNodeId, setContextNodeId] = useState<string | null>(null);
  const [contextPos, setContextPos] = useState({ x: 0, y: 0 });
  const [dragNode, setDragNode] = useState<TreeNodeData | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{ type: "inside"; nodeId: string } | { type: "between"; neighborId: string; before: boolean } | null>(null);
  const dropIndicatorRef = useRef<{ type: "inside"; nodeId: string } | { type: "between"; neighborId: string; before: boolean } | null>(null);
  const nodeElsRef = useRef<Map<string, HTMLElement>>(new Map());

  const registerNodeRect = useCallback((id: string, el: HTMLElement | null) => {
    if (el) { nodeElsRef.current.set(id, el); }
    else { nodeElsRef.current.delete(id); }
  }, []);

  const handleNodeContextMenu = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      setContextPos({ x: e.clientX, y: e.clientY });
      setContextNodeId(nodeId);
    },
    []
  );

  const closeContext = useCallback(() => setContextNodeId(null), []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const id = event.active.id as string;
    function find(n: TreeNodeData): TreeNodeData | null {
      if (n.id === id) return n;
      for (const c of n.children) { const f = find(c); if (f) return f; }
      return null;
    }
    if (rootNode) setDragNode(find(rootNode));
  }, [rootNode]);

  const handleDragMove = useCallback((event: DragMoveEvent) => {
    const activator = event.activatorEvent as MouseEvent | undefined;
    const py = activator ? activator.clientY + (event.delta?.y ?? 0) : (event.active.rect.current.translated?.top ?? 0) + (event.active.rect.current.translated?.height ?? 0) / 2;
    if (!py) { setDropIndicator(null); dropIndicatorRef.current = null; return; }
    const entries = Array.from(nodeElsRef.current.entries())
      .filter(([id]) => id !== event.active.id)
      .map(([id, el]) => ({ id, rect: el.getBoundingClientRect() }))
      .sort((a, b) => a.rect.top - b.rect.top);
    if (entries.length === 0) { setDropIndicator(null); dropIndicatorRef.current = null; return; }

    const TOLERANCE = 6;
    for (const e of entries) {
      if (py > e.rect.top + TOLERANCE && py < e.rect.bottom - TOLERANCE) {
        dropIndicatorRef.current = { type: "inside", nodeId: e.id };
        setDropIndicator({ type: "inside", nodeId: e.id });
        return;
      }
    }

    if (py < entries[0].rect.top + TOLERANCE) {
      dropIndicatorRef.current = { type: "between", neighborId: entries[0].id, before: true };
      setDropIndicator({ type: "between", neighborId: entries[0].id, before: true });
      return;
    }
    if (py > entries[entries.length - 1].rect.bottom - TOLERANCE) {
      dropIndicatorRef.current = { type: "between", neighborId: entries[entries.length - 1].id, before: false };
      setDropIndicator({ type: "between", neighborId: entries[entries.length - 1].id, before: false });
      return;
    }
    for (let i = 0; i < entries.length - 1; i++) {
      const zoneTop = entries[i].rect.bottom - TOLERANCE;
      const zoneBottom = entries[i + 1].rect.top + TOLERANCE;
      if (py > zoneTop && py < zoneBottom) {
        dropIndicatorRef.current = { type: "between", neighborId: entries[i + 1].id, before: true };
        setDropIndicator({ type: "between", neighborId: entries[i + 1].id, before: true });
        return;
      }
    }
    setDropIndicator(null); dropIndicatorRef.current = null;
  }, []);

  const handleDragEndLocal = useCallback((event: DragEndEvent) => {
    setDragNode(null);
    setDropIndicator(null);
    const ind = dropIndicatorRef.current;
    dropIndicatorRef.current = null;
    const { active } = event;
    if (!ind || active.id === (ind.type === "inside" ? ind.nodeId : ind.neighborId)) return;
    if (ind.type === "inside") {
      onDragEnd(active.id as string, ind.nodeId, "inside");
    } else {
      onDragEnd(active.id as string, ind.neighborId, ind.before ? "before" : "after");
    }
  }, [onDragEnd]);

  const [hoverTerm, setHoverTerm] = useState<string | null>(null);
  const [hoverAnchor, setHoverAnchor] = useState<DOMRect | null>(null);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const handleTermHover = useCallback((e: React.MouseEvent, term: string) => {
    clearTimeout(leaveTimerRef.current);
    setHoverTerm(term);
    setHoverAnchor((e.target as HTMLElement).getBoundingClientRect());
    onTermHover?.(e, term);
  }, [onTermHover]);

  const handleTermLeaveLocal = useCallback(() => {
    leaveTimerRef.current = setTimeout(() => {
      setHoverTerm(null);
      setHoverAnchor(null);
      onTermLeave?.();
    }, 200);
  }, [onTermLeave]);

  return (
    <DndContext onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEndLocal}>
      <ScrollArea className="flex-1">
        <div className="p-4 max-w-2xl mx-auto relative">
          {rootNode ? (
          <TreeNode
            node={rootNode}
            depth={0}
            selectedNodeId={selectedNodeId}
            onToggleExpand={onToggleExpand}
            onSelect={onSelect}
            onNodeContextMenu={handleNodeContextMenu}
            onSelectionContextMenu={onSelectionContextMenu}
            onTermDoubleClick={onTermDoubleClick}
            onTermContextMenu={onTermContextMenu}
            onTermHover={handleTermHover}
            onTermLeave={handleTermLeaveLocal}
            onFileLink={onFileLink}
            onPlusSelect={onPlusSelect}
            onCreateEmptyChild={onCreateEmptyChild}
            onEditContent={onEditContent}
            onDelete={onDelete}
            onRename={onRename}
            contextNodeId={contextNodeId}
            contextPos={contextPos}
            onCloseContext={closeContext}
            plusItems={plusItems}
            editingNodeId={editingNodeId}
            renamingNodeId={renamingNodeId}
            onEditingChange={onEditingChange}
            onEditSubmit={onEditSubmit}
            onRenameSubmit={onRenameSubmit}
            dropIndicator={dropIndicator}
            registerNodeRect={registerNodeRect}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            输入一个概念开始探索
          </div>
        )}

        {hoverTerm && (
          <HoverPreview
            term={hoverTerm}
            preview={termPreview}
            anchorRect={hoverAnchor}
            onClose={handleTermLeaveLocal}
            onMouseEnter={() => clearTimeout(leaveTimerRef.current)}
            onMouseLeave={handleTermLeaveLocal}
          />
        )}
      </div>
    </ScrollArea>
    <DragOverlay>
      {dragNode ? (
        <div className="bg-popover border rounded-md px-3 py-1.5 text-sm shadow-lg opacity-90">
          {dragNode.title}
        </div>
      ) : null}
    </DragOverlay>
  </DndContext>
  );
}
