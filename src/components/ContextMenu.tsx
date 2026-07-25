"use client";

import { Focus, Plus, Pencil, Trash2, ChevronDown, ChevronUp } from "lucide-react";

interface MenuItem {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}

export function ContextMenuContent({ items, onClose }: { items: MenuItem[]; onClose?: () => void }) {
  return (
    <div className="min-w-[180px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95">
      {items.map((item, i) => (
        <button
          key={i}
          disabled={item.disabled}
          onClick={(e) => {
            e.stopPropagation();
            item.onClick();
            onClose?.();
          }}
          className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors ${
            item.disabled
              ? "opacity-50 cursor-not-allowed"
              : item.danger
              ? "text-destructive hover:bg-destructive/10 focus:bg-destructive/10"
              : "hover:bg-accent focus:bg-accent"
          }`}
        >
          <span className="w-4 h-4 shrink-0">{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

export function nodeMenuItems(
  expanded: boolean,
  onEdit: () => void,
  onToggleExpand: () => void,
  onCreateEmpty: () => void,
  onDelete: () => void
): MenuItem[] {
  return [
    { icon: <Plus className="w-4 h-4" />, label: "新增空子节点", onClick: onCreateEmpty },
    { icon: <Pencil className="w-4 h-4" />, label: "编辑", onClick: onEdit },
    {
      icon: expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />,
      label: expanded ? "收起" : "展开",
      onClick: onToggleExpand,
    },
    { icon: <Trash2 className="w-4 h-4" />, label: "删除", onClick: onDelete, danger: true },
  ];
}

export function rootMenuItems(
  onRename: () => void,
  onCreateEmpty: () => void
): MenuItem[] {
  return [
    { icon: <Plus className="w-4 h-4" />, label: "新增空子节点", onClick: onCreateEmpty },
    { icon: <Pencil className="w-4 h-4" />, label: "重命名", onClick: onRename },
  ];
}

export function selectionMenuItems(
  onFocus: () => void,
  customItems: { label: string; prompt: string }[],
  onCreateFromSelection: (prompt: string) => void
): MenuItem[] {
  return [
    { icon: <Focus className="w-4 h-4" />, label: "聚焦", onClick: onFocus },
    ...customItems.map((item) => ({
      icon: <Plus className="w-4 h-4" />,
      label: item.label,
      onClick: () => onCreateFromSelection(item.prompt),
    })),
  ];
}
