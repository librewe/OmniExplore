# AGENTS.md

> OmniExplore — 模型对话交互优化原型，以原地缩进的对话分支为设计特色。纯前端 Next.js SPA，静态导出，无后端。更详细的知识分存于 [agents/](agents/) 与 [doc/](doc/)。

## 模型速览
用户围绕主题 Node 组织会话：Node 下建立根 Session，与 LLM 的问答以 Entry 为单位追加；任一 Entry 可 fork 出子 Session 递归追问，Node、Session、Entry 奇偶层交替嵌套，形成嵌套会话树。
```
Node = 主题容器：title + 根 Session[]
Session = 根 Session 或子 Session：title + Entry[]
Entry = 问答/笔记：userInput + assistantOutput + 子 Session[]
```
导航则采用双层模型：聚焦 Node 后默认进入外层会话目录，点入根 Session 进入内层工作区逐条阅读与追问；Esc 由内层逐层退回外层。组合视图横向组织多个主题，支持拖拽组合。

- 完整字段、状态与数据流见 [ARCHITECTURE](agents/ARCHITECTURE.md)

## 文档地图

| 文档 | 内容 | 何时读 |
|---|---|---|
| [agents/ARCHITECTURE.md](agents/ARCHITECTURE.md) | 当前结构真相源：数据模型、状态与 ref、数据流、组件树 | 改动数据/结构/状态前 |
| [agents/CONVENTIONS.md](agents/CONVENTIONS.md) | 行为契约：交互、渲染、消息上下文、流式、配置 | 新增功能或改 UI 行为前 |
| [agents/HISTORY.md](agents/HISTORY.md) | 决策历史归档，只读 | 日常开发无需读 |
| [doc/](doc/) | 产品与研究文档，非运行约定 | 研究定位类问题 |

## 构建与验证

```bash
npm run dev          # 开发服务器
npm run typecheck    # 类型检查，日常验证主力
npm test             # Vitest 单元测试
npm run check        # 提交前一键门禁：typecheck + test + lint
npm run build        # 静态构建到 out/，仅交付前运行，勿与 dev 并行
```

验证分层：LSP 诊断 → `npm run typecheck` → `npm test` → `npm run build`。涉及数据/类型改动跑 typecheck；涉及 contextBuilder/segments 等纯逻辑改动补跑 test；build 仅在涉及打包产物时运行。

## 开发工作流

1. **先探索**：改数据读 ARCHITECTURE；改交互核对 CONVENTIONS
2. **按模块规划**：页面逻辑在 page.tsx，组件在 components/，纯逻辑在 services/；小步可逆修改优先
3. **安全实现**：TypeScript strict，禁止 `as any`/`@ts-ignore`/`@ts-expect-error`
4. **本质修复**：先建立正确行为模型，再沿数据流追根因，检查接口语义是否充分等，避免条件式打补丁修复
5. **闭环**：实现完成后将新约定回写 agents/ 文档

## 文件索引

| 文件 | 职责 |
|---|---|
| `src/app/page.tsx` | 主组件：全部 handler、状态、快捷键、生命周期、上下文构建 |
| `src/app/layout.tsx` | 根布局：主题初始化与首帧防闪 |
| `src/components/SessionTOC.tsx` | 外层会话目录：根 Session 卡片、递归段摘要、跳转内层 |
| `src/components/NodeView.tsx` | 内层工作区：单一根 Session 树、折叠/展开、fork、行内操作、编辑 |
| `src/components/NodeLibrary.tsx` | 节点库侧栏：搜索、增删改、聚焦 |
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

## 其他规则

- 未经明确请求不 commit
- 禁止在代码文件里撰写非必要的注释
- 回写 CONVENTION 时避免使用括号夹注