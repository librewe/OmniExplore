# OmniExplore 架构文档

> 当前结构的描述：数据模型、状态管理、数据操作、导航视图、消息上下文、段摘要、文件职责、组件树与持久化。改数据/结构/状态时按涉及范围读相关小节；与 src/ 不符以代码为准并回写。

## 数据模型

核心类型定义于 `src/types/index.ts`。

```
Node      = 主题容器：id + title + sessions + groupId?
Session   = 会话：id + title + entries + parentSessionId? + forkBoundary?
Entry     = 单条记录：type + userInput + assistantOutput? + children
```

| 类型 | 关键字段 |
|---|---|
| `Node` | `id`, `title`, `sessions: Session[]`, `groupId?`, `created_at`, `updated_at` |
| `Session` | `id`, `title`, `entries: Entry[]`, `groupId?`, `parentSessionId?`, `forkBoundary?`, `created_at`, `updated_at` |
| `Entry` | `type: "qa"\|"note"\|"summary"`, `userInput`, `assistantOutput: string\|null`, `reasoning?`, `expanded`, `status?`, `errorMessage?`, `children: Session[]`, `created_at` |

语义：

- 层级按序交替：Node 0 层 → 根 Session 1 层 → Entry 2 层 → 子 Session 3 层，依此类推。
- 根 Session 挂 `Node.sessions`，平级多个；子 Session 挂 `entry.children`。Entry.children 存子 Session **对象引用**，Entry 无独立 ID。
- `Session.parentSessionId` 是子→父反向引用。fork 源 entry 无 ID，通过 `父.entries.findIndex(e => e.children.some(c => c.id === 子.id))` 定位。
- 三个 type：`qa` 问答对、`note` 用户笔记、`summary` 段摘要。summary 的 `userInput` 存摘要文本，`summaryStatus` 管生成生命周期，`summaryEdited` 标记用户手动编辑，AI 重新生成不得覆盖。
- `reasoning` 仅 qa 使用，流式累积模型思考过程。
- Node 标题即主题，贯穿侧栏、组合视图、[[术语]] 标注、PDF 绑定与导航历史。

## 状态管理

| Store | 机制 | 内容 |
|---|---|---|
| `nodeStore` | useReducer | `NodeState`：`node` 当前聚焦 Node、`selectedEntry`、`selectedSession`、`activeTag {sessionId, title}` |
| `configStore` | Zustand | LLM 配置、预设提示词、菜单项，localStorage 持久化 |
| 页面本地 | useState/useRef | 见下方分类清单 |

nodeReducer action 全集：

| Action | 行为 |
|---|---|
| `SET_NODE` / `CLEAR_NODE` | 设定/清空聚焦 Node 与选中态 |
| `SET_ENTRY_STATUS` | 就地写 `entry.status` / `errorMessage` 后返回新 state |
| `SET_STREAMING_CONTENT` | 就地累积写 `entry.assistantOutput`，整值设值非增量追加 |
| `SET_ENTRY_SUMMARY` / `SET_ENTRY_SUMMARY_STATUS` | 就地写 summary 的 `userInput` 与 `summaryStatus` |
| `SET_SELECTED_ENTRY` / `SET_SELECTED_SESSION` | 写入选中态，两者互不清空，由渲染层决定高亮优先级 |
| `SET_ACTIVE_TAG` | 写 `activeTag`，InputBar tag 的数据源 |
| `RENAME_NODE` | 就地改 `node.title` 并刷新 `updated_at` |
| `REPLACE_NODE` | 以传入 node 替换当前 node，触发整树重渲染 |

除 `SET_NODE`/`REPLACE_NODE`/`CLEAR_NODE` 外，所有 action 对传入对象**就地改字段**后返回新 state 外壳，node 对象身份不变。

页面本地状态按职责分类：

| 组 | 条目 |
|---|---|
| 数据源 | `workGroups`、`activeGroupId`、`nodeList`、`plusMenuItems`、`selectionMenuItems`、`recentInputs`。`nodeList` 为当前工作组 Node[]，组切换经 `loadNodeList(groupId)` 重载并带竞态守卫 |
| 视图 | `showGuideMap`、`showTOC`、`innerSessionId`、`leftWidth/rightWidth`、`leftCollapsed/rightCollapsed`、`leftTab` |
| 导航 | `navHistory`/`navIndex`，每工作组独立栈存 `navStoreRef`；`guideFocusPath` |
| 选中与目标 | `targetSessionIdRef` 目标 Session ID；`contextSessionRef`/`contextNodeRef` 右键菜单目标；`renameTargetRef` inline 重命名目标；`presetSystemRef` 五预设 system 一次性传递 |
| 编辑与预览 | `editingEntry`、`renamingNodeId`、`fillValue`、`previewTitle`/`previewContent`、`hoverTermPreview*` 三件套 |
| 输入草稿 | InputBar 内部 value 以追加目标身份作 `key`（导图=guideFocusPath、外层=Node id、内层=activeTag 的 sessionId），目标变化 remount 清空本地草稿；`fillValue` 仅程序化填充（划词追问/加号预设）时非空，各目标切换点同步清空防残留；`forkScrollTick` 触发 fork 后对 `.tree-node-selected` 滚动定位 |
| 滚动位置记忆 | `src/services/scrollMemory.ts` 模块级仅存内存：长 entry 内容滚动盒的 scrollTop 以 entry 对象为键存 WeakMap，NodeView 内容块挂载时恢复；树/TOC 容器 scrollTop 以视图槽位字符串为键存 Map，page.tsx 的 ScrollingPane 在挂载或槽位切换时恢复。长块在流式转 done 的首次限高时锚到内容顶部 |
| 流式 | `streamingAbortRef`：AbortController，新流启动时 abort 旧流并真正取消其底层 fetch，旧 entry 置 done 保留部分内容 |
| PDF | `storedFiles`、`activePdf`、`pdfBoundNode`/`pdfBoundNodeRef`、`pdfBindingsRef`；绑定持久化到 localStorage `pdf_bindings` |

## 数据操作

数据操作必须遵守三连规则。

1. **就地修改**：handler 直接修改树上对象的字段，不创建新的 Node/Session/Entry。
2. **REPLACE_NODE 触发重渲染**：修改后 `dispatchNode(REPLACE_NODE, node)`。reducer 返回新 state 外壳但 node 保持同一对象引用。`nodeState.node` 与 `nodeList` 中的对应对象来自同一缓存读入，恒为同一引用——就地修改自动同步树视图与侧栏。禁止对 node 做浅拷贝重建，那会切断该共享，重新聚焦时以过期快照覆盖最新数据。
3. **目标存 ID**：需要定位 Session 时用 `targetSessionIdRef` 存 ID，使用时经 `findSessionInTree(id)` 在当前最新树取对象，避免引用过期。

## 导航与视图

中央区域按优先级四态渲染：

```
showGuideMap → GuideMapCanvas  组合视图
showTOC && node → SessionTOC  外层会话目录
node → NodeView                内层工作区
否则 → Onboarding
```


- 聚焦 Node 后 `showTOC=true` 默认落外层会话目录。目录中根 Session 卡片展示段摘要。
- 点击根 Session 进入内层：`setInnerSessionId(根.id)` + 选中该 Session。点击任意深度子 Session/摘要时先 `findRootSessionOf` 上溯到所属根、`expandPathToSession` 就地展开路径、再进内层。
- NodeView 以 `focusedSessionId=innerSessionId` 只渲染单一根 Session 工作区，不渲染 Node 顶行、不堆叠其他根 Session。
- Esc 语义与重置行为见 CONVENTIONS「导航与视图」。切工作组或删节点时重置 `innerSessionId`。
- 导航历史 `NavEntry` 联合类型：tree/session/guideMap，每工作组独立。返回/前进为按钮 + Alt+←/→，无下拉。`applyNavEntry` 统一回放：tree 落外层目录、session 回内层对应 Session、guideMap 回组合视图。侧栏节点点击与导航回放分别以 `silent` 控制是否推历史。

## 消息上下文构建

`src/services/contextBuilder.ts`。调用方在构建前已将当前输入对应 Entry 追加到 `session.entries` 末尾，函数用 `slice(0, -1)` 回放历史。

`buildMessages(session, systemPrompt, userInput, resolveSession)` 顺序：

1. system 一次，硬编码"你是一个有帮助的人工智能助手。"
2. fork 祖先链：若 Session 有 `forkBoundary`，沿 `parentSessionId` 上溯。每层祖先的 entries 取到 fork 点为止，该层 `forkBoundary` 以 system 消息插在本层 entries 之前。
3. 当前 Session 的前序 entries。
4. 当前 userInput。

消息映射：`qa` 为 user/assistant 消息对；`note` 为 `[The user puts a note here] xxx` user 消息；`summary` 条目在回放中跳过。Entry→消息由 `appendEntryMessages` 实现，会话/祖先区间回放由 `appendSessionMessages` 实现，普通问答与段摘要共用。

祖先链折叠：沿链上溯时若某层 fork 源是 summary，则该层之上的祖先被摘要折叠，只以 `[摘要] 种子` user 消息继承，不再上溯。种子之后有中间祖先层时按普通 fork 语义带边界标记重放。

## 段摘要体系

`src/services/segments.ts` 为段几何纯函数。

- 段 = 同一 `session.entries` 中上一个 fork 点之后到当前 fork entry 的连续区间。fork entry 即 `children.length > 0` 的 Entry。
- summary 紧跟其所属 fork entry 之后生成，生成后置于该位置。
- 段摘要只消费模型流式输出的 `content`，不消费 reasoning。
- summary 不进入上下文传递；仅当作为某子会话的 fork 源时折叠为 `[摘要]` 种子。
- 摘要请求上下文 = 祖先链 + 当前 session 前缀（跳过 summary），与同会话普通问答同构以命中上下文缓存；目标段由 `summaryPrompt(anchor)` 引用段内首个非 summary 条目的开头文本锚定，不在消息流插入边界标记。
- `collectSegmentSummaries(node)` 递归收集全部 summary 供外层目录展示。

## 文件职责

| 文件 | 职责 |
|---|---|
| `src/app/page.tsx` | 主组件：全部 handler、状态、快捷键、生命周期、上下文构建 |
| `src/app/layout.tsx` | 根布局：主题初始化与首帧防闪 |
| `src/components/SessionTOC.tsx` | 外层会话目录：根 Session 卡片、递归段摘要、跳转内层 |
| `src/components/NodeView.tsx` | 内层工作区：单一根 Session 树、折叠/展开、fork、行内操作、编辑 |
| `src/components/NodeLibrary.tsx` | 节点库侧栏：按内容更新时间降序排列、搜索、增删改、聚焦 |
| `src/components/GuideMapCanvas.tsx` | 组合视图：DnD 拖拽组合、面包屑、图节点递归渲染 |
| `src/components/InputBar.tsx` | tag 驱动输入框与 Enter 逻辑 |
| `src/components/SettingsPanel.tsx` | 设置对话框 |
| `src/components/FilesList.tsx` / `PDFViewer.tsx` | 文件列表、PDF 阅读与页面绑定 |
| `src/components/MarkdownRenderer.tsx` / `TermText.tsx` / `HoverPreview.tsx` | Markdown 渲染、[[术语]] 标注、悬停预览 |
| `src/components/ContextMenu.tsx` / `PlusMenu.tsx` / `ThemeMenu.tsx` / `PreviewPanel.tsx` / `Onboarding.tsx` / `WorkGroupSwitcher.tsx` | 右键菜单、加号菜单、主题三态、预览面板、空态引导、工作组切换 |
| `src/store/nodeStore.ts` | Node/Session/Entry reducer 与 create 工厂 |
| `src/store/configStore.ts` | Zustand：LLM 配置、预设提示词、菜单项 |
| `src/services/cache.ts` | IndexedDB CRUD 与数据迁移 |
| `src/services/contextBuilder.ts` | fork 祖先链与消息数组构建，段摘要共用 |
| `src/services/segments.ts` | 段几何纯函数 |
| `src/services/scrollMemory.ts` | 长 entry 内容滚动盒与树/目录容器 scrollTop 的瞬时记忆，仅存内存 |
| `src/services/llm.ts` | SSE 流式调用，消息数组版含 reasoning |
| `src/services/prompts.ts` | 预设提示词 |
| `src/services/termParser.ts` | [[术语]] 占位符编码与自由术语匹配 |
| `src/types/index.ts` | 全部类型定义 |
| `src/lib/constants.ts` / `NodeListContext.ts` / `utils.ts` | 默认配置与常量、节点列表 Context、cn 工具 |
| `src/components/ui/` | shadcn/ui 基元 |

## 组件树

```
src/app/layout.tsx  根布局：主题初始化与首帧防闪
└─ src/app/page.tsx  状态枢纽：全部 handler/状态/快捷键/生命周期
   ├─ 左侧栏  可拖拽宽度
   │   ├─ WorkGroupSwitcher
   │   ├─ Tab 切换 节点|文件 与搜索框
   │   ├─ NodeLibrary / FilesList
   │   └─ SettingsPanel
   ├─ 中央  flex-1 滚动容器 [scrollbar-gutter:stable]
   │   ├─ 导航栏：后退/前进 + 语境按钮 目录/组合/返回 + node 名 + 面板折叠钮
   │   ├─ GuideMapCanvas   showGuideMap 时
   │   ├─ SessionTOC       showTOC 且有 node 时
   │   ├─ NodeView         有 node 时
   │   ├─ Onboarding       无 node 时
   │   └─ InputBar  主列底部固定输入栏（各视图统一承载，避免滚动区 gutter 宽度差导致居中位移）
   ├─ 右侧栏  可拖拽宽度，默认折叠，PDF 打开自动展开至 45%
   │   ├─ PreviewPanel  树预览
   │   └─ PDFViewer  PDF 阅读与页面绑定
   └─ 弹层：SettingsPanel / ContextMenu / PlusMenu / ThemeMenu / HoverPreview
```

## 持久化

- IndexedDB stores：`nodes` 存 Node 顶层记录，嵌套保存根 Session 与子 Session；`work_groups` 存工作组；`files` 存 PDF 等文件；`sessions` 仅迁移用，历史遗留。
- 根 Session 与子 Session 一律随 Node 顶层记录嵌套持久化，绝无独立顶层记录。
- localStorage：`active_group_id` 最近工作组、`plus_menu_items`、`selection_menu_items`、`pdf_bindings`、`theme`。
- `migrateData()` 启动时执行一次，幂等，处理旧字段名重命名与根 Session 到 Node 的包装迁移。
