# AGENTS.md

> OmniExplore — 本地优先的认知考古工具。开发起点 2026-07-26，由 Sisyphus (OhMyOpenCode) 迭代构建。
> 2026-08-19 — 文档重构：本文件精简为枢纽，详细知识拆分至 [agents/](agents/) 目录。

## 项目定位

本地优先的认知考古工具。纯前端 SPA（Next.js 静态导出），无后端，无 auth。用户创建 Node（主题）→ 在 Node 下创建根 Session → 添加 Entry（上下文节点）→ 追问 LLM → Entry 可 fork 出子 Session → 递归展开。按 Esc 进入组合视图。左侧栏支持**节点**和**文件**两个 tab。

## 核心架构速查（改动 Node/Session/Entry 数据前必读）

### 数据模型：互相归纳

```
Node      = 主题容器：title + Session[]（根 Session 列表）
Session   = title + Entry[]（根 Session 无 parentSessionId，挂 Node.sessions；子 Session 挂 entry.children）
Entry     = userInput + assistantOutput + Session[]（children）
```

- Node 奇层点（0 层）→ Session 偶层点（1 层）→ Entry 奇层点（2 层），交替嵌套
- Node 标题即"概念/主题"——侧栏节点库、导图 term、[[术语]]标注、PDF 绑定、悬停预览、导航历史全部以 Node 标题为单位
- "聚焦"只用于 Node（`handleFocusNode`）；"选中"用于 Session（`handleSelectSession`）
- Entry.children 存子 Session **对象引用**（非 ID）；Entry 无独立 ID——操作均传对象引用，就地修改

### 就地修改 + 触发重渲染（最关键的坑）

所有 handler 对 Node/Session/Entry **就地修改**（不创建新对象），然后 `dispatchNode(REPLACE_NODE, node: nodeRef.current!)` 触发重渲染。reducer 返回 `{ ...state }` 新 state 但 **node 保持同一对象引用**——`nodeList` 与内存树永远共享同一对象。若浅拷贝创建新 node 对象，侧栏快照与内存树分离，切走再切回会**覆盖丢数据**（2026-08-14 修复的坑）。

- 目标 Session 统一存 **ID**（`targetSessionIdRef`），经 `findSessionInTree(id)` 在最新树定位对象
- 持久化只写 **Node 顶层记录**（根 Session 作 `node.sessions`、子 Session 作 `entry.children` 嵌套）——绝不做独立顶层记录（否则刷新后数据丢失）

### 上下文传递（已实现）

每个 Entry 构建时携带前序 Entry 上下文，消息数组规则：system 一次（硬编码"你是一个有帮助的人工智能助手"）→ fork 祖先链（沿 `parentSessionId` 上溯，每层 entries 取到 fork 点，`--- fork boundary ---` 插每层 entries 前）→ 当前 Session 前序 entries → 当前输入。`qa` 作消息对，`note` 作 `[笔记] xxx`。祖先链逻辑在 `buildForkChain`（contextBuilder.ts 导出），**`buildMessages` 与段摘要生成共用**——`summarizeSegment` 组装摘要消息时先 `buildForkChain` 上溯到根/摘要种子，再拼段内容（`segment.start..end`）+ summaryPrompt，保证子 Session 总结不缺父上下文。

## Agent 文档

| 文档 | 内容 | 何时读 |
|---|---|---|
| [agents/ARCHITECTURE.md](agents/ARCHITECTURE.md) | 完整数据模型、两个数据视图、就地修改模式、状态管理表、核心数据流、组件树 | 改动涉及数据/结构/状态时 |
| [agents/CONVENTIONS.md](agents/CONVENTIONS.md) | 关键约定全集（~30 条黄金规则）、未实现需求、已知限制 | 新增功能/UI 交互前逐条核对 |
| [agents/HISTORY.md](agents/HISTORY.md) | 用户输入历史（决策上下文档案） | 日常开发**无需**阅读 |

## 构建与验证

```bash
npm run dev          # 开发服务器
npm run build        # 静态构建 → out/（仅交付前跑；与 dev 共享 .next/，勿并行）
npm run typecheck    # 快速类型检查（tsc --noEmit，实测 ~4-8s，日常验证主力）
npm test             # Vitest 单元测试（test/ 目录，涉及 services 逻辑改动后跑）
npm run test:watch   # vitest 监听模式（开发 services 时用）
npm run check        # 提交前一键门禁：typecheck + test + lint 全过
```

- **日常验证分层**：LSP 诊断（实时，覆盖绝大部分类型错误）→ `npm run typecheck`（秒级，确定性兜底）→ `npm test`（涉及 services/纯逻辑改动）→ `npm run build`（分钟级，仅交付前/涉及打包产物改动）
- **提交前**：`npm run check` 一条命令全过（typecheck + test + lint）
- 涉及数据/类型改动用 `npm run typecheck` 验证即可；涉及 `contextBuilder`/`segments` 等纯逻辑改动补跑 `npm test`；仅路由、静态资源、next 配置类改动才需要完整 build

## 开发工作流

1. **先探索**：改动 Node/Session/Entry 数据 → 读 [ARCHITECTURE.md](agents/ARCHITECTURE.md)；新增交互 → 核对 [CONVENTIONS.md](agents/CONVENTIONS.md)
2. **按模块规划**：页面逻辑在 page.tsx，组件在 components/，服务在 services/；小步可逆修改优先于大重构
3. **安全实现**：严格遵守就地修改 + REPLACE_NODE、TypeScript strict、既有约定；禁止 `as any`/`@ts-ignore`
4. **非补丁式修复**：修复前先建立"正确行为模型"（预期语义）再沿数据流追根因，区分实现 bug / API 语义不充分 / 设计取舍；调用侧出现 if/补偿/特判逻辑来绕过问题，往往是底层 API 语义没表达充分；若正确行为模型涉及歧义术语或多重解释（如"节点"在树视图与导图视图语义不同），先向用户说明对齐，不自行假设
5. **本地验证**：按「构建与验证」分层执行——LSP 诊断 → `tsc --noEmit`（秒级）；`npm run build` 仅交付前/涉及打包产物时跑
6. **闭环**：实现完成后将新增约定/结构变化回写 agents/ 文档

## 文件索引

| 文件 | 行数 | 职责 |
|---|---|---|
| `src/app/page.tsx` | ~1680 | 主组件：全部 handler、状态、事件、快捷键、生命周期、上下文构建、PDF 集成 |
| `src/components/NodeView.tsx` | ~314 | 主题 Node 包装层 + 递归 Session 树：Node 顶行（+直接建根 Session）、Session/Entry 渲染、折叠/展开、fork、右键菜单、选中高亮、编辑 |
| `src/components/NodeLibrary.tsx` | ~113 | 节点列表（侧栏）：搜索、增删改、组合视图 +号 |
| `src/lib/NodeListContext.ts` | 9 | 节点列表 React Context（`useNodeList`） |
| `src/components/GuideMapCanvas.tsx` | ~697 | 组合视图：DnD 拖拽组合、面包屑、图节点递归渲染、termCount 保护 |
| `src/components/InputBar.tsx` | ~104 | tag 驱动输入框 + Ctrl+Enter/Enter 逻辑 |
| `src/components/SettingsPanel.tsx` | ~557 | 设置 Dialog |
| `src/components/FilesList.tsx` | ~115 | 文件列表：拖拽上传、搜索、删除、点击打开 PDF |
| `src/components/PDFViewer.tsx` | ~172 | PDF 阅读器：页码导航、Ctrl+滚轮缩放、文本层、右键聚焦菜单 |
| `src/components/MarkdownRenderer.tsx` | ~169 | Markdown 渲染，支持文件链接 + 术语占位符解码（`[[术语]]` 不破坏表格/标题等块级结构） |
| `src/components/TermText.tsx` | ~44 | 术语标注文本渲染（`[[术语]]` 链接/高亮） |
| `src/components/HoverPreview.tsx` | ~58 | 术语悬停预览（pointer-events-none 防卡滞） |
| `src/components/ContextMenu.tsx` | 59 | 右键菜单组件（ContextMenu + ContextMenuContent） |
| `src/components/PlusMenu.tsx` | ~93 | 加号下拉菜单 |
| `src/components/ThemeMenu.tsx` | ~97 | 主题菜单：亮/暗/跟随系统三态切换 |
| `src/components/PreviewPanel.tsx` | ~34 | 右侧树预览面板 |
| `src/components/Onboarding.tsx` | ~57 | 初始界面（无 Node 时） |
| `src/components/WorkGroupSwitcher.tsx` | ~122 | 工作组切换/创建 |
| `src/store/nodeStore.ts` | ~69 | Node(Session/Entry) reducer + createNode/createSession/createEntry |
| `src/store/configStore.ts` | ~54 | Zustand：LLM 配置、预设提示词、加号菜单项 |
| `src/services/cache.ts` | ~172 | IndexedDB CRUD（nodes + files + work_groups stores）+ migrateData 数据迁移 |
| `src/services/llm.ts` | ~134 | SSE 流式 LLM 调用（`streamLLM` + `streamLLMChat` 消息数组版） |
| `src/services/prompts.ts` | ~94 | 预设提示词管理（Default + 4 个微观测度） |
| `src/services/termParser.ts` | ~51 | 术语占位符编码（`[[术语]]`→私有区字符，避免拆分 markdown 块结构）+ 自由术语匹配 |
| `src/types/index.ts` | ~82 | 所有类型定义（Node, Session, Entry, GuideMapNode, StoredFile 等） |
| `src/lib/constants.ts` | ~27 | 预设定义、默认配置 |
| `src/lib/utils.ts` | 11 | `cn()` 工具函数 |

> 已删除的文件：`TreeNode.tsx`、`RecursiveTree.tsx`、`GuideMap.tsx`、`FootprintPanel.tsx`、`TermLibrary.tsx`（→NodeLibrary）、`TermListContext.ts`（→NodeListContext）、`ViewToggle.tsx`、`treeStore.ts`、`footprintStore.ts`、`useConceptNode.ts`。

## 关键规则

- TypeScript strict —— 禁止 `as any`、`@ts-ignore`、`@ts-expect-error`
- 数据操作必须**就地修改 + REPLACE_NODE**（node 身份不变）；target 存 ID 经 `findSessionInTree` 定位
- 持久化只写 Node 顶层记录；绝不创建独立 Session/Entry 顶层记录
- 未经明确请求不 commit
- 用户输入历史归档于 [agents/HISTORY.md](agents/HISTORY.md)，不追加回本文件
