# OmniExplore 架构文档

> 数据模型、状态管理、数据流与组件结构。任何涉及 Node/Session/Entry 的改动前必读。

## 数据模型：互相归纳

```
Node         =  主题容器：title + Session[]（根 Session 列表）
Session      =  title + Entry[]（根 Session 无 parentSessionId，挂 Node.sessions；子 Session 挂 entry.children）
Entry        =  userInput + assistantOutput + Session[]（children）
```

- Node 是**奇层点（0 层）**，Session 是**偶层点（1 层）**，Entry 是**奇层点（2 层）**，之后交替嵌套。Node 下多个根 Session 平级。
- Node 标题即"概念/主题"——侧栏节点库、导图 term、[[术语]]标注、PDF 绑定、悬停预览、导航历史全部以 Node 标题为单位。
- "聚焦"只用于 Node（`handleFocusNode`）；"选中"用于 Session（`handleSelectSession`）。
- Entry.children 存的是子 Session **对象引用**（非 ID），渲染时直接从树上取。
- Entry 无独立 ID——操作均传递对象引用，就地修改。
- Session.parentSessionId 是反向引用（子→父 Session）。fork 源 entry 通过 `父.entries.findIndex(e => e.children.some(c => c.id === 子.id))` 定位。

## 两个数据视图

| 视图 | 数据 | 用途 |
|---|---|---|
| `nodeRef.current` | 当前聚焦的主题 Node（`Node.sessions` 树） | 中央渲染：NodeView 展开 Node → 根 Session → Entry → 子 Session |
| `nodeList` | `Node[]`，当前工作组全部主题 | 侧栏 `nodeTitles` prop |

> 注意：`nodeRef.current` 始终指向**主题 Node**。根 Session 作为 `node.sessions` 对象嵌套，子 Session 作为 `entry.children` 对象嵌套——绝不做独立顶层记录（否则刷新后数据丢失）。

## 就地修改 + 触发重渲染

所有 handler 对 Node/Session/Entry 做**就地修改**（不创建新对象），然后 `dispatchNode(REPLACE_NODE, node: nodeRef.current!)` 触发 React 重渲染——reducer 返回新 state 对象（`{ ...state }`）但 **node 保持同一对象引用**，NodeView 重渲染时读取已就地修改的数据。因为树上引用共享同一对象，修改自动可见。

> 关键坑（2026-08-14 修复）：早期 `REPLACE_SESSION` 用 `{ ...nodeRef.current }` 浅拷贝创建新根对象，导致侧栏 `nodeList` 快照与内存树对象分离、逐渐过期——连续添加 note 后切走再切回（`handleFocusNode` 用过期 nodeList 对象 `SET_SESSION`）会覆盖丢数据。现在 reducer 一律**保持 node 对象身份不变**，`nodeList` 与内存树永远共享同一对象，从根上消除过期快照问题。target 目标仍统一存 **ID**（`targetSessionIdRef`），通过 `findSessionInTree(id)` 定位对象。

## 上下文传递（已实现）

链式：每个 Entry 构建时携带其前序 Entry 的 user+assistant 作为上下文。消息数组构建规则：
1. system 提示词（仅一次，硬编码"你是一个有帮助的人工智能助手"）
2. 若当前 Session 是 fork（有 `forkBoundary`）：沿 `parentSessionId` 链上溯，每层祖先 Session 的 entries 取到 fork 点为止，且每层 fork 边界标记 `--- fork boundary ---` 插在该层 entries **之前**
3. 当前 Session 的前序 entries（`slice(0, -1)`）
4. 当前 userInput

- `qa` entry 作为 user/assistant 消息对；`note` entry 作为 `[笔记] xxx` user 消息。
- fork 点之后的 entries 不纳入上下文（`findIndex` 定位 fork 源 entry）。

## 核心数据流

```
用户输入节点 → InputBar(无 tag)
  → handleFocusNode → createNode（主题）
    → nodeStore SET_NODE → putNode → NodeView 展开
用户输入上下文 → InputBar(tag)
  → handleCreateEntry → 就地修改 Session.entries
    → 未选中根 Session 时自动建根 Session（标题取输入截断）
    → putNode 持久化 → REPLACE_NODE 重渲染
```

## 组件树

```
layout.tsx
└─ page.tsx  （状态枢纽 ~1680 行）
   ├─ 左侧栏 (可拖拽宽度)
   │   ├─ WorkGroupSwitcher
   │   ├─ 共享搜索框 + Tab(节点|文件)
   │   ├─ NodeLibrary / FilesList
   │   └─ SettingsPanel（设置按钮）
   ├─ 中央 (flex-1)
   │   ├─ 导航栏（← → 按钮 + 返回/前进下拉 + 工作区标题）
   │   ├─ 树面包屑栏（组合 + 簇 > ... 路径）
   │   ├─ NodeView / GuideMapCanvas （二选一，showGuideMap 切换）
   │   ├─ Onboarding （无 Node 时显示）
   │   └─ InputBar （底部固定）
   ├─ 右侧栏 (可拖拽宽度，PDF 时自动扩展至 45%)
   │   ├─ PreviewPanel（树预览）
   │   └─ PDFViewer（PDF 阅读，划词右键聚焦）
   └─ SettingsPanel （Dialog 弹窗）
```

## 状态管理

| Store | 机制 | 用途 |
|---|---|---|
| `nodeStore` | useReducer | 当前 Node 树（Node.sessions 及嵌套 Session/Entry）：增删改、选中、streaming 追加 |
| `configStore` | Zustand | LLM 配置、预设提示词、加号菜单项（localStorage 持久化） |
| page 本地 state | useState/useRef | activeGroupId, showGuideMap, previewNode, navHistory, guideFocusPath, leftWidth/rightWidth, leftCollapsed/rightCollapsed, isResizing, leftTab, storedFiles, activePdf, pdfBoundNode, sidebarSearch... |
| `nodeRef` | useRef | 当前聚焦的主题 Node 的引用（始终最新），handler 直接读取 |
| `nodeList` | useState | 当前工作组的主题 Node 列表（侧栏数据源），组切换时经 `loadNodeList(groupId)` 重载（带竞态序号守卫） |
| `targetSessionIdRef` | useRef | +菜单/点击选中的目标 Session **ID**，Entry 操作优先写入此目标（存 ID 避免浅拷贝引用过时）；未选中 Session 时为 null（输入自动建根 Session） |
| `contextSessionRef` / `contextNodeRef` | useRef | 右键菜单被操作 Session / 主题 Node 的引用 |
| `renameTargetRef` | useRef | inline 重命名目标（`{type:"node",node}` 或 `{type:"session",session}`） |
| `streamingAbortRef` | useRef | 流式 AbortController，新流启动时 abort 旧流 |

> 已删除的遗留 store/ref：`footprintStore`、`treeStore`、`sessionMapRef`、`targetSessionRef`（对象版）、`targetNodeIdRef`（→`targetSessionIdRef`）、`renameNodeRef`（→`renameTargetRef`）。

## 数据流语义（2026-08-13 重构期记录，命名已演进）

以下为 2026-08-13 重构期的最终语义记录。后续 2026-08-17 重构（Node 升级为主题容器）后，`REPLACE_SESSION`→`REPLACE_NODE`、`targetNodeIdRef`→`targetSessionIdRef`、`putSession`→`putNode`——语义相同，以最新代码为准。

```
nodeState.session  = 根 Session（永远）→ 中央 NodeView 递归渲染
entry.children[]   = 子 Session（对象引用）→ NodeView 递归
targetNodeIdRef    = 输入目标 Session ID → findSessionInTree 定位最新对象
REPLACE_SESSION    = 总是 { ...nodeRef.current! }（根 session 浅拷贝触发重渲染）
putSession         = 总是持久化根 session（子 session 嵌套其中）
getAllSessions     = 过滤 parentSessionId + groupId，只返回当前工作组的根 session
```
