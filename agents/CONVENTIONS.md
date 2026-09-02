# OmniExplore 关键约定

> 全部历史踩坑得出的黄金规则。新增功能/UI 交互前逐条核对；新约定实装后回写本文件。

## 关键约定

- **节点占位符**：plus 菜单模板用 `${node}`（点击时替换为当前主题标题再填充输入框，`${term}` 兼容旧配置）；划词菜单用 `${selected}`（选中文本）和 `${root}`/`${node}`（当前主题名）
- **IndexedDB**：`nodes` store 存主题 Node 对象（含嵌套根 Session/Entry/children，仅 Node 顶层记录）；`work_groups` store 存工作组；`files` store 存 PDF 等文件；`sessions` store 仅迁移用（历史遗留）
- **localStorage**：`active_group_id` 存最近激活工作组（刷新恢复），`plus_menu_items` 存 +菜单，`selection_menu_items` 存划词菜单，`pdf_bindings` 存 PDF→节点绑定
- **SSE 超时**：仅连接超时 30s，流式无总体超时
- **Entry 类型**：`qa`（输入框/模板触发 LLM）、`note`（空上下文，用户笔记）
- **Entry 标题**：无论折叠/展开均截断首行 30 字符（省略号按首行长度判断）；note 空内容显示"(双击或右键编辑)"
- **note 渲染**：note 与 qa 内容统一走 TermText（markdown 渲染 + 术语标注）；文本段经 MarkdownRenderer inline 渲染、节点库术语自由匹配 + 显式 `[[术语]]` 均标注
- **术语匹配保护区域**：`encodeFreeTerms` 的 `protectedRegions` 除 markdown 链接外，**必须包含行内/块级数学公式与代码**——否则术语注入私有区占位符会破坏 KaTeX 解析或代码原文（2026-09-01 修复）。保护正则覆盖：`$...$`/`$$...$$`/`\(...\)`/`\[...\]`/`` `code` ``/```` ```fence``` ````。⚠️ **`\(...\)`/`\[...\]` 必须在注入阶段就保护**——它们渲染前由 `MarkdownRenderer.normalizeMathDelimiters` 转成 `$...$`/`$$...$$`，若注入阶段不保护，公式内术语先被污染、归一化后 KaTeX 仍报错（跨模块时序耦合）
- **markdown 字号层级**：正文 16px（TermText `text-base/[1.8]`）。MarkdownRenderer 内标题/表格字号必须 **>= 正文**（Notion 风格递减但不下穿）：h1=`text-xl`(20) > h2=`text-lg`(18) > h3=`text-[17px]` > h4/h5=`text-base`(16) > h6=`text-sm`(14)；table=`text-sm`(14)；行内 code=`text-[13px]`。⚠️ 勿用 `text-xs`(12) 于标题/表格——会小于正文；行内 code 保持略小于正文
- **公式渲染**：remark-math 只认 `$`/`$$`，**不认 LaTeX 标准定界 `\(...\)`/`\[...\]`**（主流 LLM 常输出后者）。`MarkdownRenderer` 渲染前经 `normalizeMathDelimiters` 归一化：`\[...\]`→`$$...$$`、`\(...\)`→`$...$`（仅匹配 `\` 前缀方/圆括号，不误伤 `[1]` 引用与 `\$` 转义）；termParser 的 `protectedRegions` 覆盖公式/代码，防止私有区占位符注入破坏 KaTeX
- **层级粘滞滚动**：Session/Entry 行 `position: sticky`，行秩连续计数（Node=0→根 Session=1→entry=2→子 Session=3…），`top = 行秩 × 28px`（ROW_H 须小于行高约 30px 以覆盖阶梯缝隙，防止透出内容）；选中态实色背景
- **滚动条防抖动**：主内容区滚动容器（TOC 视图 / 树视图）用 `[scrollbar-gutter:stable]` 永久预留滚动条槽位——否则 `scrollbar-width: thin` 的经典滚动条出现/消失会改变 content-box 宽度，导致 `max-w-3.5xl mx-auto` 内容左右跳动 ~4px。左栏（左对齐非居中）无需此设置；导图用 Radix ScrollArea overlay 滚动条不占布局
- **选中/追加目标语义**：聚焦 Node 时**默认选中首个根 Session**（无 Session 回落 Node 级）；**点空白/内容区不取消选中**；**点 Session 标题始终选中**（无 toggle 取消，双击会误触发重命名——取消唯一入口是 Node 顶行 `handleSelectSession(null)`，清 `targetSessionIdRef` + activeTag 回 node）。选中 Session 内容末尾渲染**淡色提示线**（`h-px` + `将追加到这里` 微标签，缩进 20 对齐内容区）——**提示线只在内层树视图显示**（外层 TOC 是导航层无明确追加目标，外层输入创建新根 Session 由"自动进内层"逻辑承接）。⚠️ `selectedEntry` 与 `selectedSession` **独立共存互不清空**（reducer 两 action 都不清对方）；渲染层 **entry 优先高亮、session 标题抑制高亮**（`selectedSession===session && !selectedEntry`）保证视觉唯一；`handleSelectEntry` 点 entry 时同步 session（追加目标跟随），`handleSelectSession` 点 session 时清 entry（回到 session 高亮）
- **System prompt**：硬编码 `"你是一个有帮助的人工智能助手"`，不暴露给用户编辑
- **组合视图虚拟根**：`{term:"", children:[...]}`；GuideMapCanvas 检测 `!guideMap.term` 渲染 children 平级
- **tag**：InputBar 的 `tagLabel` 来自 `nodeState.activeTag.title`——选中 Session 时为 Session 标题，否则为当前主题标题（"追加到 {主题}"）；未选中 Session 时输入直接提交视为追加到 node，自动新建根 Session（标题取输入截断）
- **新建菜单（+）**：主题 Node 的 + **无菜单**，点击直接创建根 Session（"新会话"并立即 inline 重命名）；根 Session 用**五预设**（Default + 动态直觉/看定义/看应用/看动机，system+user 配套，user 模板 `${node}` 发送前替换为主题名）；一般 Session 用 plusMenuItems（默认"精简概括一点"/"介绍更多"，可设置中自定义）；"新增上下文"固定常驻
- **划词菜单**：**划词（mouseup）自动弹出**（聚焦 + 自定义模板，默认"简单介绍"/"指什么"/"为什么"，`${selected}` 替换选中文本、`${root}` 替换当前主题名）；点击后从源 entry fork 出分支 Session 并填充输入框；**右键不再拦截**（内容区/PDF/术语标注均恢复浏览器默认右键行为）。防重弹：`selectionMenuRef` + `selectionMenuTextRef` 持有当前菜单及对应文本，点击外部关闭时 mouseup 先于 click 触发，同文本直接忽略、交由随后的 click 关闭；位置取 `getRangeAt(0).getBoundingClientRect()`（非鼠标坐标）
- **预设 system prompt**：五预设点击时经 `presetSystemRef` 记录对应 system，`handleCreateEntry` 发送时一次性使用（Default 与一般会话均用"你是一个有帮助的人工智能助手"）
- **导航历史**：`NavEntry[]` 联合类型（tree/session/guideMap），每工作组独立；返回/前进按钮 + Alt+←/→ 直接跳转（无下拉列表）；侧栏节点点击经 `handleFocusNode` 推历史（可退回），导航触发时传 `silent=true` 跳过推历史避免污染；`applyNavEntry` 统一回放：tree→落外层 TOC、session→回内层该 Session、guideMap→组合视图
- **双层导航（任务四）**：**外层 = 会话目录**（`showTOC=true` 渲染 SessionTOC：根 Session 列表，可展开显示递归段摘要，全折叠即导航）；**内层 = 单一根 Session 工作区**（`innerSessionId` 指定渲染哪个根 Session，NodeView `focusedSessionId` prop——不渲染 Node 顶行、不堆叠其他根 Session，sticky 行秩整体减 1：`stickyRankOffset`）。聚焦 Node（`handleFocusNode`）默认落外层 TOC；外层点击 Session 标题/段摘要 → `setInnerSessionId` + 选中该 Session 进内层；**内层按 Esc 退回外层**（组合视图↔树 的 Esc 循环只发生在外层），Esc 退回时**重置 `targetSessionIdRef` + `SET_ACTIVE_TAG` 回 node 级**（否则 tag 残留内层 Session，输入会错误追加到该 Session）。切工作组/删节点时重置 `innerSessionId`。**header 布局**：左侧前进/后退按钮 + 竖线分隔 + 功能按钮（内层「目录」/外层「组合」/导图「返回」）+ 竖线分隔 + **node 名（`text-base font-semibold`）**；**外层 TOC 不显示导图面包屑**（无导图上下文，`currentNodeGuidePath` 已删）；仅导图模式显示 GuideBreadcrumb。**视图容器 padding 统一**：外层 TOC/组合视图 `pt-4 pr-4 pb-24`，内层（sticky 首行贴顶）`pr-4 pb-24` 去 pt-4 防展开/收起顶部空隙跳变。⚠️ **内层 `focusedSessionId` 必须是根 Session**（NodeView 只在 `node.sessions` 顶层查找）——TOC 点击任意深度子 Session/摘要时，经 `findRootSessionOf` 上溯到所属根、`expandPathToSession` 就地展开父 entry 路径、`setInnerSessionId(根id)`；导航历史回放 `applyNavEntry` 的 session 分支同样处理
- **术语悬停预览**：HoverPreview 组件（`pointer-events-none` 防卡滞），悬停标注术语显示主题首行摘要（首个根 Session 的首个 entry 首行）；80ms 显示延迟，点击任意处关闭
- **工作组隔离**：节点库/导图/导航历史均按工作组隔离；主题归属 `Node.groupId`（根 Session 嵌套继承）；切换组时重置 target/guideFocusPath 并重载 nodeList
- **数据迁移**：`migrateData()` 于启动时执行——旧 `parentEntryId`→`parentSessionId`、清 `Entry.sessionId`、无归属根 Session 补首个工作组 ID；根 Session → 主题 Node 包装（仅当 nodes store 为空时执行，同标题根 Session 合并为一个 Node，**合并键含 `groupId`** 防跨组合并，幂等）
- **LLM 配置**：SettingsPanel 仅暴露 API Key / Base URL / Model 三字段；`max_tokens`/`temperature` 已从 UI 移除——`LLMConfig` 中二者为**可选**（旧 localStorage 配置兼容），`llm.ts` 发送时 `max_tokens` 兜底 `DEFAULT_LLM_CONFIG.max_tokens`，`temperature` **不再发送**（部分模型不支持该参数）
- **thinking/reasoning 触发**：`LLMConfig.enableThinking?`（默认 true）控制请求 thinking 参数。`buildThinkingParam` 按 base_url 判断网关格式：DeepSeek 官方/智谱原生/Kimi K2.x → `thinking: {type:"enabled"}`；阿里百炼/QwenCloud（dashscope/aliyuncs）→ `enable_thinking: true`；其他默认发 `thinking.type`（不强行加避免不兼容网关报错）。响应解析：`delta.reasoning_content ?? delta.reasoning` → `entry.reasoning`（NodeView 折叠块展示）。⚠️ thinking 模式下 `max_tokens` 与 reasoning 共享预算（太小会耗尽致 content 空）；`temperature` 等采样参数被静默忽略；带 `tools` 时须回传历史 reasoning_content 否则 400
- **深色主题**：ThemeMenu 三态（亮/暗/跟随系统），localStorage `theme` 持久化，layout.tsx 内联脚本首帧防闪（匹配 `prefers-color-scheme`）；NodeView 粘滞行背景用 CSS 变量（`hsl(var(--background))`）+ `color-mix` 祖先高亮；切换时挂 `theme-fade-overlay` 淡入过渡
- **ESC 行为**：组合视图中沿面包屑退出，根层回树视图
- **面包屑**："簇"代替"根"
- **数据操作模式**：handler 对树上 Node/Session/Entry **就地修改**，然后 `dispatchNode(REPLACE_NODE, { ...nodeRef.current! })` 触发重渲染
- **根 Session**：无独立顶层 IndexedDB 记录（作为 `node.sessions` 对象直接嵌套）；子 Session 作为 `entry.children` 对象直接嵌套
- **流式**：`SET_STREAMING_CONTENT` 累积式设值（非增量追加），避免 SSE 重复
- **编辑**：仅末位未响应 entry 可编辑（`isEditable = isLast && !assistantOutput`）；Escape 还原快照
- **fork 命名**：`(分支#N)` 顺序编号；fork 后自动展开
- **划词追问**：从源 entry fork 出子 Session（`parentSessionId` + `forkBoundary`），追加到分支并回答；无 entry 上下文（PDF 划词）时回退到当前主题（未选中 Session 则提交时自动建根 Session）
- **流式自动打断（现状，计划重构为排队等待）**：`streamingAbortRef` 新流启动时 abort 旧流；旧流被中断后其 entry **也置 `done`**（部分内容保留），避免图标永远停留"加载中"。缺点：旧流残留半截回答、浪费已消耗额度、依赖它的新流上下文残缺——计划改为等待而非打断（见未实现需求）
- **右侧栏默认折叠**：`rightCollapsed` 初始 `true`（`prevRightCollapsedRef` 同步），PDF 打开自动展开、关闭恢复折叠前状态
- **pdfjs-dist**：锁定 4.x（当前 4.10.38）。4.0.379 构建产物含 top-level await 触发 Next build 警告（4.3.136+ 已移除，4.10.38 构建干净）；worker 走 CDN（`cdnjs.../pdf.js/${_pdfjs.version}/pdf.worker.min.mjs`），版本自动跟随主库，升级后确认 CDN 有对应版本；勿升 5.x/6.x（API 破坏性变更）
- **导图 nodeId 绑定**：`GuideMapNode.nodeId?` 仅**叶子**持有（绑定主题 Node ID）；构造点（ensureGuideMap / handleAddGuideMapNode / onAddToGuideMap / rebuild）按标题查 nodeList 绑定，查不到（导图自由节点）留空；拖拽组合后原叶子 nodeId 随对象保留在分组 children 内，**分组本身无 nodeId**；`findNodeByNodeId` 可穿过分组递归精确定位。**nodeId 是定位的唯一匹配方式（无 term 回退）**——旧导图数据无 nodeId，重建导图后全量绑定生效。**导图增查删改一律按 nodeId 语义**：ensureGuideMap 存在性检查按 nodeId（同名自由节点不影响绑定节点添加）、removeFromGuideMap/updateGuideMapTerm 按 nodeId 递归操作（自由节点不受牵连）、handleGuideMapNodeClick 反向预览优先 nodeId 回退 term
- **思考过程（reasoning）**：`Entry.reasoning?` 可选字段，仅 qa 使用——`llm.ts` 的 `streamLLMChat` yield **结构化 chunk** `{ content?, reasoning? }`（解析 `delta.reasoning_content`[DeepSeek] / `delta.reasoning`[OpenAI]），`handleStreamEntry` 就地累积到 `entry.reasoning` 并随 `SET_STREAMING_CONTENT` 重渲染；NodeView 渲染可折叠"思考过程"块（`showReasoning` 本地 state，默认收起，流式中显示 spinner）。摘要生成（`summarizeSegment`）只消费 `chunk.content`。改 `streamLLMChat` 的 yield 形态需同步这两个调用方
- **外层 TOC 输入跳转**：`handleCreateEntry` 在外层 TOC（`showTOC`）模式下新建根 Session 后自动 `setShowTOC(false)` + `setInnerSessionId(s.id)` 进内层看流式回答；依赖数组含 `showTOC`。内层 Esc 退回外层逻辑不变
- **行内操作显隐**：加号（Node 顶行 + Session 行 PlusMenu）**常驻**显示（不 hover 隐藏），**PlusMenu 悬停即展开菜单**（`onMouseEnter` 打开、`onMouseLeave` 120ms 延迟关闭，portal 菜单自身 `onMouseEnter` 取消关闭——保持按钮→菜单过渡连续性；点击仍可 toggle）；fork/撤回/copy 等其他行操作保持 `opacity-0 group-hover:opacity-100`。**行内按钮尺寸统一 `h-5 w-5`**（与 PlusMenu 的 `h-5 w-5` 一致，勿用 `p-0.5`——否则视觉偏小）。按钮分组：非 summary 显示「撤回(Undo2 图标，复原输入重新提交)/copy/fork」，summary 显示「编辑摘要/重新生成/fork」**无 copy**；流式中不显示撤回。**fork 后自动选中 fork 出的子 Session**（`handleForkEntry` 末尾调 `handleSelectSession(child)`，追加目标跟随）。撤回 = 编辑语义（textarea defaultValue 复原 userInput，Ctrl+Enter 保存、Esc 取消、Ctrl+Z 原生 redo）。用户输入块 = `rounded-lg bg-muted/50 px-3 py-2` 淡背景（**无左竖线、无 🧑/🤖 图标**——竖线会与选中态 `tree-node-selected` 的 inset 左线混淆）；正文统一 `text-base`（16px，层次靠字重：Node semibold → Session medium → Entry regular）、**行距 `leading-[1.8]` 必须放在 `cn()` 最后一位**（⚠️ tailwind-merge v2 冲突消解是"后者覆盖前者"：`leading-[1.8]` 若在前会被 `text-base`/`text-sm` 覆盖删除——`text-*` 内嵌 line-height 与 `leading-*` 同冲突组；`text-base/[1.8]` 组合语法也会被调用方传的 `text-base` 同组覆盖。正确姿势：`cn("text-base", className, "leading-[1.8]")`，外层 className 在中间、leading 殿后），内容区左右对称内缩（`paddingLeft/Right: 20`），辅助信息 `text-xs`；树视图/TOC 内容容器 `max-w-3.5xl`（tailwind.config 扩展，默认无此档）；输入框为悬浮式（渐变背景 + `bg-card/90` 毛玻璃圆角容器 + 阴影，焦点 ring，`h-9` 非长条、宽度 `max-w-2xl` 窄于内容区、底部 `pb-6` 留一行字），tag 浅蓝 `bg-accent text-accent-foreground`
- **InputBar 双层导航行为**：外层 TOC（`showTOC=true`）**隐藏 tag**（`tagLabel=""`）且 placeholder 换为「在「{Node名}」下开始对话」，传 `forceCreate=true` 保证无 tag 时回车仍走 `onCreateChild`（创建会话）而非 `onFocus`（跳转新 node）；内层显示 `activeTag.title` tag；导图模式 tag「在当前层级新增节点」不变。`forceCreate` 判断：`tagLabel || forceCreate ? onCreateChild : onFocus`
- **SessionTOC 卡片化**：根 Session（depth=0）渲染为卡片容器（`mb-2 rounded-lg border bg-card/40 p-2 hover:border-primary/30`），标题 `text-base font-semibold`，段摘要 `text-sm leading-relaxed text-muted-foreground`（**无会话条数**）；递归子 Session（depth>0）保持紧凑列表样式，不做卡片套卡片；跳转（`onSelectSession`/`onEnterSummary`）与递归展开逻辑不变。**默认展开所有根 Session 卡片第一层**（`expandedIds` 惰性初始化为 `node.sessions` 全部 id，depth=0 显示段摘要；子分支保持折叠；组件 `key={node.id}` 切换节点时重挂载重置展开态）
- **summary 树视图渲染**：summary entry 的标题行固定为「📝 段摘要」（**不显示截断内容**，否则与展开后的完整内容重复）；**有箭头可折叠/展开**（生成中 loading/streaming 强制展开，error 态强制展开，完成后尊重用户手动折叠）；内容区显示完整总结。**渲染位置**：作为 fork entry 的 children 第一个元素（`nextSummary` 条件 `entry.children.length>0 && entries[idx+1].type==="summary"`）——**段摘要显示在子 Session 之前**（fork entry 内容区之后、分支之前）；map 中 `entry.type==="summary"` 时 `return null` 跳过独立渲染避免重复。⚠️ summary 与 fork entry 同 depth 时 sticky 行秩相同，滚动时后渲染者覆盖（既有同层 entry 行为）。创建逻辑 `summarizeSegment`：`splice(forkIdx+1)` 紧跟 fork entry，`findLastSummaryFor` 防重复生成

## 未实现的需求（来自 简化需求.md）

- 后续规划全部（撤销/重做、反向链接、浏览器插件等）
- **LLM 中止（用户手动打断）**：目前仅新流启动时自动 abort 旧流，用户无法主动停止正在进行的流式输出——需在流式过程中提供中止按钮/快捷键（如 Esc 或 entry 行内停止按钮），中断后 entry 置 `done` 保留部分内容
- **流式排队等待（重构，替代自动打断）**：现状新流启动时 abort 旧流，导致旧流残留半截回答、浪费已消耗额度、依赖它的新流上下文残缺。改为**等待而非打断**：新流发起前检测是否有流在跑——若新流的上下文链（同 Session 前序 entries / fork 祖先链）依赖旧流，则等待旧流自然完成后自动启动，保证上下文含完整答案；跨 Session/Node 的独立流可并行。涉及：`streamingAbortRef` 单槽 → `Map<entryId, AbortController>`、等待态 UI 提示（如"等待当前回答完成"）、新 entry 创建时机后移到旧流完成之后（否则其上下文仍会冻结半截旧答案）
- 工作组重命名/删除：`handleWorkGroupRename`/`handleWorkGroupDelete`（删组连带删组内节点）已实现但**未接线**——WorkGroupSwitcher 仅支持切换/创建，无重命名/删除入口，留待后续
- tsconfig 未开启 `noUnusedLocals`，死代码需手动核查（建议后续开启使 build 自动报未使用项）

## 已知限制

- `page.tsx` 过长（~1680 行），未来应拆分为 custom hooks 或独立 handler 模块
- 未做移动端适配
- **导图节点多重存在歧义（已解决）**：节点标题可在导图多处存在（如同名分组 + 同名叶子、跨层重复）。通过 `nodeId` 绑定解决——`currentNodeGuidePath` 仅按 `findNodeByNodeId` 精确匹配，无 term 回退。旧导图数据无 nodeId（面包屑仅显示"簇"），重建导图后全量绑定生效
