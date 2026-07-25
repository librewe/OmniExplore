"use client";

import { useState, useCallback } from "react";
import { DndContext, DragOverlay, type DragStartEvent, type DragEndEvent } from "@dnd-kit/core";
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
  onDragEnd: (sourceId: string, targetId: string) => void;
  editingNodeId: string | null;
  renamingNodeId: string | null;
  onEditingChange: (nodeId: string, value: string) => void;
  onEditSubmit: (nodeId: string) => void;
  onRenameSubmit: (nodeId: string, title: string) => void;
  onSelectionContextMenu: (e: React.MouseEvent, selectedText: string, nodeId: string) => void;
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
  termPreview,
  termPreviewAnchor,
  termPreviewTerm,
  onTermPreviewClose,
  plusItems,
}: RecursiveTreeProps) {
  const [contextNodeId, setContextNodeId] = useState<string | null>(null);
  const [contextPos, setContextPos] = useState({ x: 0, y: 0 });
  const [dragNode, setDragNode] = useState<TreeNodeData | null>(null);

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

  const handleDragEndLocal = useCallback((event: DragEndEvent) => {
    setDragNode(null);
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onDragEnd(active.id as string, over.id as string);
    }
  }, [onDragEnd]);

  const [hoverTerm, setHoverTerm] = useState<string | null>(null);
  const [hoverAnchor, setHoverAnchor] = useState<DOMRect | null>(null);

  const handleTermHover = useCallback((e: React.MouseEvent, term: string) => {
    setHoverTerm(term);
    setHoverAnchor((e.target as HTMLElement).getBoundingClientRect());
  }, []);

  const handleTermLeave = useCallback(() => {
    setHoverTerm(null);
    setHoverAnchor(null);
  }, []);

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEndLocal}>
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
            onTermLeave={handleTermLeave}
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
            onClose={handleTermLeave}
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
