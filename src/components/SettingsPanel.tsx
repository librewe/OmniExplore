"use client";

import { useState, useCallback, useEffect } from "react";
import { Settings, Trash2, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { testConnection } from "@/services/llm";
import { loadCustomPresetPrompts, saveCustomPresetPrompts } from "@/services/prompts";
import { defaultPrompt, intuitionPrompt, definitionPrompt, applicationPrompt, motivationPrompt, loadInquirySystemPrompt, saveInquirySystemPrompt } from "@/services/prompts";
import { useConfigStore } from "@/store/configStore";
import { DEFAULT_LLM_CONFIG, DEFAULT_INQUIRY_SYSTEM_PROMPT } from "@/lib/constants";
import type { LLMConfig } from "@/types";
import { cn } from "@/lib/utils";

interface SettingsPanelProps {
  nodeTitles: string[];
  onNodeDelete: (title: string) => void;
  plusMenuItems: Array<{ id: string; label: string; prompt: string }>;
  onPlusMenuItemsChange: (items: Array<{ id: string; label: string; prompt: string }>) => void;
  selectionMenuItems: Array<{ id: string; label: string; prompt: string }>;
  onSelectionMenuItemsChange: (items: Array<{ id: string; label: string; prompt: string }>) => void;
}

export function SettingsPanel({
  nodeTitles,
  onNodeDelete,
  plusMenuItems,
  onPlusMenuItemsChange,
  selectionMenuItems,
  onSelectionMenuItemsChange,
}: SettingsPanelProps) {
  const { config, isConfigured, setConfig } = useConfigStore();
  const [open, setOpen] = useState(false);

  const [apiKey, setApiKey] = useState(config?.api_key || "");
  const [baseUrl, setBaseUrl] = useState(config?.base_url || DEFAULT_LLM_CONFIG.base_url);
  const [model, setModel] = useState(config?.model || DEFAULT_LLM_CONFIG.model);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saved, setSaved] = useState(false);

  const [nodeSearch, setNodeSearch] = useState("");

  const [editingMenuItem, setEditingMenuItem] = useState<string | null>(null);
  const [editMenuLabel, setEditMenuLabel] = useState("");
  const [editMenuPrompt, setEditMenuPrompt] = useState("");
  const [newMenuLabel, setNewMenuLabel] = useState("");
  const [newMenuPrompt, setNewMenuPrompt] = useState("");
  const [editingSelItem, setEditingSelItem] = useState<string | null>(null);
  const [editSelLabel, setEditSelLabel] = useState("");
  const [editSelPrompt, setEditSelPrompt] = useState("");
  const [newSelLabel, setNewSelLabel] = useState("");
  const [newSelPrompt, setNewSelPrompt] = useState("");
  const [presetOverrides, setPresetOverrides] = useState<Record<string, { system: string; user: string }>>({});
  const [editingPreset, setEditingPreset] = useState<string | null>(null);
  const [editPresetSystem, setEditPresetSystem] = useState("");
  const [editPresetUser, setEditPresetUser] = useState("");

  const [inquirySystemPrompt, setInquirySystemPrompt] = useState(
    loadInquirySystemPrompt() || DEFAULT_INQUIRY_SYSTEM_PROMPT
  );
  const [inquirySaved, setInquirySaved] = useState(false);

  const handleSave = useCallback(() => {
    const cfg: LLMConfig = {
      api_key: apiKey,
      base_url: baseUrl,
      model,
    };
    setConfig(cfg);
    localStorage.setItem("llm_config", JSON.stringify(cfg));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [apiKey, baseUrl, model, setConfig]);

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    const cfg: LLMConfig = { api_key: apiKey, base_url: baseUrl, model };
    const result = await testConnection(cfg);
    setTestResult(result);
    setTesting(false);
  }, [apiKey, baseUrl, model]);

  useEffect(() => { setPresetOverrides(loadCustomPresetPrompts()); }, [open]);

  const handleSavePreset = useCallback((key: string) => {
    const updated = { ...presetOverrides, [key]: { system: editPresetSystem, user: editPresetUser } };
    setPresetOverrides(updated);
    saveCustomPresetPrompts(updated);
    setEditingPreset(null);
  }, [presetOverrides, editPresetSystem, editPresetUser]);

  const handleDeletePreset = useCallback((key: string) => {
    const updated = { ...presetOverrides };
    delete updated[key];
    setPresetOverrides(updated);
    saveCustomPresetPrompts(updated);
  }, [presetOverrides]);

  const PRESET_LABELS: Record<string, string> = {
    default: "⚡ Default",
    micro_intuition: "🌳 动态直觉",
    micro_definition: "📐 看定义",
    micro_application: "🔧 看应用",
    micro_motivation: "📜 看动机",
  };

  const PRESET_DEFAULTS: Record<string, { system: string; user: string }> = {
    default: defaultPrompt("${node}"),
    micro_intuition: intuitionPrompt("${node}"),
    micro_definition: definitionPrompt("${node}"),
    micro_application: applicationPrompt("${node}"),
    micro_motivation: motivationPrompt("${node}"),
  };

  const getDefaultFor = (key: string) => PRESET_DEFAULTS[key] || { system: "", user: "" };

  const filteredNodes = nodeSearch
    ? nodeTitles.filter((t) => t.toLowerCase().includes(nodeSearch.toLowerCase()))
    : nodeTitles;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
          <Settings className="w-4 h-4" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-[680px] p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle>设置</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="llm" className="flex h-[520px]">
          <TabsList className="flex flex-col h-full w-32 shrink-0 rounded-none border-r bg-muted/50 p-2 gap-1 justify-start">
            <TabsTrigger value="llm" className="w-full justify-start text-sm">LLM 连接</TabsTrigger>
            <TabsTrigger value="presets" className="w-full justify-start text-sm">预设提示词</TabsTrigger>
            <TabsTrigger value="templates" className="w-full justify-start text-sm">新建菜单</TabsTrigger>
            <TabsTrigger value="selmenu" className="w-full justify-start text-sm">划词菜单</TabsTrigger>
            <TabsTrigger value="terms" className="w-full justify-start text-sm">节点库</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-auto">
            <TabsContent value="llm" className="p-6 m-0">
              <div className="space-y-4">
                <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3 text-xs text-yellow-800 dark:bg-yellow-500/10 dark:border-yellow-500/30 dark:text-yellow-200">
                  API Key 将明文存储在浏览器本地，请勿在公共设备上使用。
                </div>

                <div>
                  <label className="text-sm font-medium">API Key</label>
                  <Input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Base URL</label>
                  <Input
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://api.deepseek.com"
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Model</label>
                  <Input
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="deepseek-v4-flash"
                    className="mt-1"
                  />
                </div>

                {testResult && (
                  <div className={cn(
                    "rounded-md p-3 text-sm",
                    testResult.ok ? "bg-green-50 text-green-800 border border-green-200 dark:bg-green-500/10 dark:text-green-200 dark:border-green-500/30" : "bg-red-50 text-red-800 border border-red-200 dark:bg-red-500/10 dark:text-red-200 dark:border-red-500/30"
                  )}>
                    {testResult.message}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button onClick={handleTest} variant="outline" disabled={testing || !apiKey}>
                    {testing ? "测试中…" : "测试连接"}
                  </Button>
                  <Button onClick={handleSave}>{saved ? "已保存 ✓" : "保存"}</Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="presets" className="p-6 m-0">
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">自定义预设问题的提示词。{"${node}"} 在运行时替换为主题名称。</p>
                {["default", "micro_intuition", "micro_definition", "micro_application", "micro_motivation"].map((key) => {
                  const override = presetOverrides[key];
                  return (
                    <div key={key} className="border rounded-md p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">{PRESET_LABELS[key] || key}</span>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => {
                            setEditingPreset(key);
                            const def = getDefaultFor(key);
                            setEditPresetSystem(override?.system || def.system);
                            setEditPresetUser(override?.user || def.user);
                          }}>编辑</Button>
                          {override && (
                            <Button size="sm" variant="ghost" onClick={() => handleDeletePreset(key)}>
                              <Trash2 className="w-3.5 h-3.5 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </div>
                      {editingPreset === key ? (
                        <div className="space-y-2">
                          <div>
                            <label className="text-xs text-muted-foreground">System Prompt</label>
                            <textarea
                              value={editPresetSystem}
                              onChange={(e) => setEditPresetSystem(e.target.value)}
                              className="w-full h-20 rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring resize-y"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground">User Prompt（{"${node}"} = 主题名称）</label>
                            <textarea
                              value={editPresetUser}
                              onChange={(e) => setEditPresetUser(e.target.value)}
                              className="w-full h-16 rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring resize-y"
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleSavePreset(key)}>保存</Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingPreset(null)}>取消</Button>
                          </div>
                        </div>
                      ) : override ? (
                        <p className="text-xs text-muted-foreground truncate max-w-[300px]">System: {override.system.slice(0, 60)}...</p>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">使用默认提示词</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </TabsContent>

            <TabsContent value="templates" className="p-6 m-0">
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  配置 + 菜单中的追问模板。{'${node}'} 占位符在运行时替换为主题名称。
                </p>

                {plusMenuItems.map((item) => (
                  <div key={item.id} className="border rounded-md p-3">
                    {editingMenuItem === item.id ? (
                      <div className="space-y-2">
                        <Input
                          value={editMenuLabel}
                          onChange={(e) => setEditMenuLabel(e.target.value)}
                          placeholder="菜单名称"
                          className="text-sm"
                        />
                        <Input
                          value={editMenuPrompt}
                          onChange={(e) => setEditMenuPrompt(e.target.value)}
                          placeholder={"提示词（用 ${node} 占位）"}
                          className="text-sm"
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => {
                            const updated = plusMenuItems.map((x) =>
                              x.id === item.id ? { ...x, label: editMenuLabel, prompt: editMenuPrompt } : x
                            );
                            onPlusMenuItemsChange(updated);
                            setEditingMenuItem(null);
                          }}>
                            保存
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingMenuItem(null)}>
                            取消
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{item.label}</p>
                          <p className="text-xs text-muted-foreground truncate">{item.prompt}</p>
                        </div>
                        <div className="flex gap-1 shrink-0 ml-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingMenuItem(item.id);
                              setEditMenuLabel(item.label);
                              setEditMenuPrompt(item.prompt);
                            }}
                          >
                            编辑
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              onPlusMenuItemsChange(plusMenuItems.filter((x) => x.id !== item.id));
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                <Separator />

                <div className="space-y-2">
                  <p className="text-sm font-medium">新建模板</p>
                  <Input
                    value={newMenuLabel}
                    onChange={(e) => setNewMenuLabel(e.target.value)}
                    placeholder="菜单名称"
                    className="text-sm"
                  />
                  <Input
                    value={newMenuPrompt}
                    onChange={(e) => setNewMenuPrompt(e.target.value)}
                    placeholder="提示词（用 {term} 占位）"
                    className="text-sm"
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      if (!newMenuLabel.trim()) return;
                      const newItem = {
                        id: `menu_${Date.now()}`,
                        label: newMenuLabel.trim(),
                        prompt: newMenuPrompt.trim() || "${term}",
                      };
                      onPlusMenuItemsChange([...plusMenuItems, newItem]);
                      setNewMenuLabel("");
                      setNewMenuPrompt("");
                    }}
                  >
                    添加
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="selmenu" className="p-6 m-0">
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  配置划词右键菜单中的追问模板。{"${selected}"} 替换为选中文本，{"${node}"} 替换为当前节点。
                </p>

                {selectionMenuItems.map((item) => (
                  <div key={item.id} className="border rounded-md p-3">
                    {editingSelItem === item.id ? (
                      <div className="space-y-2">
                        <Input
                          value={editSelLabel}
                          onChange={(e) => setEditSelLabel(e.target.value)}
                          placeholder="菜单名称"
                          className="text-sm"
                        />
                        <Input
                          value={editSelPrompt}
                          onChange={(e) => setEditSelPrompt(e.target.value)}
                          placeholder={"提示词（用 ${selected} / ${node} 占位）"}
                          className="text-sm"
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => {
                            const updated = selectionMenuItems.map((x) =>
                              x.id === item.id ? { ...x, label: editSelLabel, prompt: editSelPrompt } : x
                            );
                            onSelectionMenuItemsChange(updated);
                            setEditingSelItem(null);
                          }}>
                            保存
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingSelItem(null)}>
                            取消
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{item.label}</p>
                          <p className="text-xs text-muted-foreground truncate">{item.prompt}</p>
                        </div>
                        <div className="flex gap-1 shrink-0 ml-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingSelItem(item.id);
                              setEditSelLabel(item.label);
                              setEditSelPrompt(item.prompt);
                            }}
                          >
                            编辑
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              onSelectionMenuItemsChange(selectionMenuItems.filter((x) => x.id !== item.id));
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                <Separator />

                <div className="space-y-2">
                  <p className="text-sm font-medium">新建模板</p>
                  <Input
                    value={newSelLabel}
                    onChange={(e) => setNewSelLabel(e.target.value)}
                    placeholder="菜单名称"
                    className="text-sm"
                  />
                  <Input
                    value={newSelPrompt}
                    onChange={(e) => setNewSelPrompt(e.target.value)}
                    placeholder={"提示词（用 ${selected} / ${node} 占位）"}
                    className="text-sm"
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      if (!newSelLabel.trim()) return;
                      const newItem = {
                        id: `sel_${Date.now()}`,
                        label: newSelLabel.trim(),
                        prompt: newSelPrompt.trim() || "这里的${selected}指什么？",
                      };
                      onSelectionMenuItemsChange([...selectionMenuItems, newItem]);
                      setNewSelLabel("");
                      setNewSelPrompt("");
                    }}
                  >
                    添加
                  </Button>
                </div>

                <Separator />

                <div className="space-y-2">
                  <p className="text-sm font-medium">追问 System Prompt</p>
                  <p className="text-xs text-muted-foreground">
                    追问时的系统提示词。{'${parentTerm}'} = 父术语，{'${childTerm}'} = 子术语。
                    自动追加术语标注规则。
                  </p>
                  <textarea
                    value={inquirySystemPrompt}
                    onChange={(e) => setInquirySystemPrompt(e.target.value)}
                    className="w-full h-32 rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring resize-y"
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      saveInquirySystemPrompt(inquirySystemPrompt);
                      setInquirySaved(true);
                      setTimeout(() => setInquirySaved(false), 2000);
                    }}
                  >
                    {inquirySaved ? "已保存 ✓" : "保存"}
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="terms" className="p-6 m-0">
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={nodeSearch}
                    onChange={(e) => setNodeSearch(e.target.value)}
                    placeholder="搜索节点…"
                    className="pl-8 text-sm"
                  />
                </div>
                {filteredNodes.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">暂无节点</p>
                ) : (
                  <div className="space-y-1">
                    {filteredNodes.map((term) => (
                      <div key={term} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-accent">
                        <span className="text-sm">{term}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onNodeDelete(term)}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
