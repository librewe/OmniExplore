"use client";

import { useState } from "react";
import { ChevronRight, Check, Circle, Plus, Pencil, Trash2, Network, ArrowLeft } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import type { GuideMapNode } from "@/types";
import { cn } from "@/lib/utils";

interface GuideMapProps {
  guideMap: GuideMapNode | null;
  onNodeClick: (term: string) => void;
  termList: string[];
  currentFocusTerm: string;
  onUpdate: (node: GuideMapNode) => void;
  onBack: () => void;
}

function GuideMapNodeItem({
  node,
  depth,
  onNodeClick,
  termList,
  currentFocusTerm,
  onUpdate,
}: {
  node: GuideMapNode;
  depth: number;
  onNodeClick: (term: string) => void;
  termList: string[];
  currentFocusTerm: string;
  onUpdate: (node: GuideMapNode) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(node.term);
  const [adding, setAdding] = useState(false);
  const [newChildName, setNewChildName] = useState("");
  const hasChildren = node.children.length > 0;
  const isExplored = termList.some((t) => t.toLowerCase() === node.term.toLowerCase());
  const isFocused = currentFocusTerm.toLowerCase() === node.term.toLowerCase();

  const handleRename = () => {
    if (!editName.trim()) return;
    onUpdate({ ...node, term: editName.trim() });
    setEditing(false);
  };

  const handleAddChild = () => {
    if (!newChildName.trim()) return;
    onUpdate({ ...node, children: [...node.children, { term: newChildName.trim(), children: [] }] });
    setNewChildName("");
    setAdding(false);
  };

  return (
    <div className="select-none">
      <div
        className="flex items-center gap-1 py-0.5 group hover:bg-accent/50 rounded px-1 -mx-1"
        style={{ paddingLeft: depth * 20 }}
      >
        {hasChildren ? (
          <button onClick={() => setExpanded(!expanded)} className="shrink-0 p-0.5 rounded hover:bg-accent transition-colors">
            <ChevronRight className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", expanded && "rotate-90")} />
          </button>
        ) : (
          <span className="w-[22px] shrink-0" />
        )}

        {isExplored && <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />}
        {isFocused && <Circle className="w-3 h-3 text-primary fill-primary shrink-0" />}

        {editing ? (
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") setEditing(false); }}
            onBlur={handleRename}
            className="flex-1 h-6 rounded border border-input bg-background px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            autoFocus
          />
        ) : (
          <button
            onClick={() => onNodeClick(node.term)}
            className={cn("text-sm truncate hover:text-primary transition-colors", isFocused && "text-primary font-semibold")}
          >
            {node.term}
          </button>
        )}

        <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 shrink-0 ml-auto transition-opacity">
          <button onClick={(e) => { e.stopPropagation(); setEditing(true); setEditName(node.term); }} className="p-0.5 rounded hover:bg-accent">
            <Pencil className="w-3 h-3 text-muted-foreground" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); setAdding(true); }} className="p-0.5 rounded hover:bg-accent">
            <Plus className="w-3 h-3 text-muted-foreground" />
          </button>
          {depth > 0 && (
            <button onClick={(e) => { e.stopPropagation(); onUpdate({ term: "", children: [] }); }} className="p-0.5 rounded hover:bg-accent">
              <Trash2 className="w-3 h-3 text-destructive" />
            </button>
          )}
        </div>
      </div>

      {adding && (
        <div className="flex items-center gap-1 py-0.5" style={{ paddingLeft: depth * 20 + 22 }}>
          <Input
            value={newChildName}
            onChange={(e) => setNewChildName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAddChild(); if (e.key === "Escape") setAdding(false); }}
            placeholder="新节点名称"
            className="h-6 text-xs"
            autoFocus
          />
        </div>
      )}

      {expanded && node.children.map((child, i) => (
        <GuideMapNodeItem
          key={`${child.term}-${i}`}
          node={child}
          depth={depth + 1}
          onNodeClick={onNodeClick}
          termList={termList}
          currentFocusTerm={currentFocusTerm}
          onUpdate={(updated) => {
            const newChildren = [...node.children];
            const idx = newChildren.indexOf(child);
            if (!updated.term && !updated.children.length) {
              newChildren.splice(idx, 1);
            } else {
              newChildren[idx] = updated;
            }
            onUpdate({ ...node, children: newChildren });
          }}
        />
      ))}
    </div>
  );
}

export function GuideMap({ guideMap, onNodeClick, termList, currentFocusTerm, onUpdate, onBack }: GuideMapProps) {
  if (!guideMap) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Network className="w-12 h-12 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">暂无节点</p>
      </div>
    );
  }

  const hasVirtualRoot = !guideMap.term;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center px-4 py-2 border-b">
        <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span>返回</span>
        </button>
        <div className="flex items-center gap-2 ml-auto">
          <Network className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">导图</span>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4 max-w-2xl mx-auto">
          {hasVirtualRoot ? (
            guideMap.children.map((child, i) => (
              <GuideMapNodeItem
                key={`${child.term}-${i}`}
                node={child}
                depth={0}
                onNodeClick={onNodeClick}
                termList={termList}
                currentFocusTerm={currentFocusTerm}
                onUpdate={(updated) => {
                  const newChildren = [...guideMap.children];
                  if (!updated.term && !updated.children.length) {
                    newChildren.splice(i, 1);
                  } else {
                    newChildren[i] = updated;
                  }
                  onUpdate({ ...guideMap, children: newChildren });
                }}
              />
            ))
          ) : (
            <GuideMapNodeItem
              node={guideMap}
              depth={0}
              onNodeClick={onNodeClick}
              termList={termList}
              currentFocusTerm={currentFocusTerm}
              onUpdate={onUpdate}
            />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
