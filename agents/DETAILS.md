# OmniExplore 实现细节档案

> 自 AGENTS.md / CONVENTIONS.md 精简时归档的实现级细节与精确取值。需要精确参数、防坑原由或完整交互语义时查阅；日常开发无需通读。

## 输入与提交

- 输入框为多行自适应 textarea，内容超高自动滚动，上限 180px。
- 草稿 key 绑定：导图=guideFocusPath、外层=Node id、内层=activeTag 的 sessionId。
- 空态 Onboarding 文案「输入概念，按回车探索…」。
- 外层目录 placeholder「在「{Node名}」下开始对话」并传 `forceCreate=true`。
- 起始模式切换按钮在输入栏底部左侧（原占位文案处），向上弹 dropdown，两项 Ask / From scratch；From scratch 时 textarea placeholder 改为「写下一条笔记…」。模式状态存 InputBar 内部，仅 `showModeSwitch`（`showTOC && !showGuideMap`）时渲染，靠 inputKey remount 在切 Node/离开外层时重置。
- 内层 tag 文案为当前 Session 标题；导图 tag 文案「在当前层级新增节点」。
- 外层新建根 Session 后自动进内层：`setShowTOC(false)` + `setInnerSessionId(s.id)`。

## 新建与会话

- 根 Session 行加号五预设：Default + 动态直觉/看定义/看应用/看动机，system 经 `presetSystemRef` 一次性使用。
- 一般 Session 行加号用 `plusMenuItems`，默认「精简概括一点」「介绍更多」；`${term}` 兼容旧配置。
- 行内「新增上下文」固定常驻；fork/撤回/copy 保持 hover 显隐。
- fork 命名按 `(分支#N)` 顺序编号；fork 后自动展开、选中并滚动定位到新分支（对 `.tree-node-selected` 做 scrollIntoView）。

## 选中与追加

- 选中 Session 时内容末尾渲染淡色提示线带「将追加到这里」微标签，仅内层树视图显示。

## 划词与右键

- 划词 mouseup 自动弹出菜单，默认模板「简单介绍」「指什么」「为什么」；点击后从源 entry fork 分支并填入输入框。
- 防重弹：菜单元素与对应文本存 ref，同文本直接忽略；菜单位置取 `getRangeAt(0).getBoundingClientRect()` 而非鼠标坐标。
- 菜单按基本菜单行为关闭：点击外部、滚动捕获、右键、Esc、窗口尺寸变化；划词仅主键 mouseup 触发；笔记/段摘要编辑双击（`detail>=2`）时跳过弹菜单。
- 无 entry 上下文的 PDF 划词回退到当前 Node 主题。

## 渲染与行操作

- Entry 标题折叠与否均截断首行 30 字符；note 空内容显示「(双击或右键编辑)」。
- 仅笔记与段摘要可双击编辑：`isEditable = entry.type === "note"`；标题行与内容区双击一致，命中 `.term-underline` 时让位。提问不参与双击编辑，须经撤回或右键「编辑」。
- 撤回即编辑：textarea 以 `defaultValue` 复原 userInput，Ctrl+Enter 保存、Esc 取消、Ctrl+Z 原生 redo。
- 编辑框挂载与输入时按 `scrollHeight` 自动增高，上限 `EDITOR_MAX_H=360px`，超出转框内滚动；样式 `resize-none overflow-hidden`。
- summary 标题行固定「📝 段摘要」，有箭头可折叠，map 中不独立渲染避免重复。
- summary 生成指示由 `summaryStatus` 驱动而非内容是否为空；终态无内容显示「（空摘要）」。
- summary 支持编辑与重新生成，`summaryEdited=true` 后 AI 重新生成不得覆盖。
- reasoning 渲染为可折叠「思考过程」块，默认收起，流式中显示 spinner。
- 用户输入块样式 `rounded-lg bg-muted/50 px-3 py-2`：无左竖线、无头像图标，避免与选中态左线混淆。
- 长内容内部滚动：内容块输出完成后若超视口高度 60% 则限高 60vh 块内滚动；流式期间不设限自然增高，完成时仍超出再套限高并将内部滚动锚到回答顶部。

## 字号与排版

- 字号层级：正文 16px；h1 `text-xl`、h2 `text-lg`、h3 `text-[17px]`、h4/h5 `text-base`、h6 `text-sm`；table `text-sm`；行内 code `text-[13px]`；标题与表格禁用 `text-xs`。
- 正文统一 `text-base`，行距 `leading-[1.8]` 必须放 `cn()` 末位：tailwind-merge 同组冲突后者覆盖前者，前置会被 `text-*` 覆盖删除。正确姿势 `cn("text-base", className, "leading-[1.8]")`。
- 层级靠字重而非字号：Node semibold → Session medium → Entry regular；辅助信息 `text-xs`。
- 内容容器 `max-w-3.5xl`，左右内容内缩 20px。

## 粘滞滚动

- sticky 行行秩从 Node=0 起连续计数，`top = 行秩 × 30px`；选中态实色背景，粘滞行背景用 CSS 变量与 `color-mix` 祖先高亮。
- 根 Session 行不参与粘滞，其后代行秩相对其从 0 重算（`stickyRankOffset=2`）。

## Markdown 与术语

- remark-math 只认 `$`/`$$`。渲染前经 `normalizeMathDelimiters` 将 `\[...\]`→`$$...$$`、`\(...\)`→`$...$`，只匹配 `\` 前缀括号，不误伤 `[1]` 引用与 `\$` 转义。
- 术语保护区域 `encodeFreeTerms.protectedRegions` 覆盖：markdown 链接、`$...$`/`$$...$$`/`\(...\)`/`\[...\]`、行内 code、代码块。公式定界符转义发生在渲染前归一化阶段，故 `\(...\)`/`\[...\]` 必须在注入阶段即纳入保护。
- 术语聚焦由 `onTermClick` 单击触发：`window.getSelection()` 非折叠（拖选）时跳过，让位划词；双击术语因首击已聚焦，不再单独处理。

## 流式

- 连接超时 30s 仅覆盖建连阶段，收到响应头即清除，流式过程无总体超时。
- 空闲看门狗：每收到一帧 SSE 重置；网关静默挂起超 30s 中止并抛「请求超时」。
- `SET_STREAMING_CONTENT` 累积式整值设值，非增量追加，防 SSE 重复。
- `streamLLMChat` yield 结构化 chunk `{ content?, reasoning? }`，解析 `delta.reasoning_content` 或 `delta.reasoning` 后分别累积到 `entry.reasoning` 与 `assistantOutput`，改动 yield 形态需同步两个调用方。
- 第三参接受外部 `AbortSignal`：中止真正取消底层 fetch 并静默结束生成器，调用方把 entry 置 done 保留部分内容。
- 自动打断：新流启动经 `streamingAbortRef` abort 旧流，旧 entry 置 done 保留部分内容，不是 error 路径。
- 摘要生成只消费 `chunk.content`。
- 摘要终态必须在 `putNode` 前同步写到 entry：dispatch 是异步的，等 React flush 时持久化已发生，否则 IndexedDB 停在 streaming，刷新后内容在却永久转圈；读回时非终态 `summaryStatus` 按生成已中断归一。

## LLM 配置

- SettingsPanel 仅暴露 API Key / Base URL / Model。
- `max_tokens` 发送时兜底默认配置值；`temperature` 不再发送。
- `enableThinking` 默认 true。`buildThinkingParam` 按 base_url 判断网关格式：DeepSeek 官方/智谱原生/Kimi K2.x 发 `thinking:{type:"enabled"}`；阿里百炼与 QwenCloud 发 `enable_thinking:true`；其余默认发 `thinking.type`，不强行附加避免网关报错。
- thinking 模式 `max_tokens` 与 reasoning 共享预算，采样参数静默忽略；带 `tools` 时必须回传历史 `reasoning_content`，否则 400。

## 悬停预览与 PDF

- HoverPreview `pointer-events-none` 防卡滞；摘要取首个根 Session 的首个 entry 首行，显示延迟 80ms，点击任意处关闭。
- pdfjs-dist 锁定 4.x 当前 4.10.38，勿升 5.x/6.x；worker 走 CDN，版本号随主库自动跟随，升级后确认 CDN 有对应版本。
- PDF 划词走 SelectionMenu，无右键菜单。

## 组合视图与工作组

- `GuideMapNode.nodeId` 仅叶子持有；`findNodeByNodeId` 可穿过分组递归定位；旧导图数据无 nodeId，重建后全量绑定生效。
- 节点库、组合视图、导航历史按工作组隔离；切换工作组时重置内层、target 与 guideFocusPath 并重载 nodeList。
- 工作组重命名与删除的 handler 已实现但未接线，UI 无入口。
- localStorage 键：`theme`、`active_group_id`、`plus_menu_items`、`selection_menu_items`、`pdf_bindings`。

## 领域模型速览

- 用户围绕主题 Node 组织会话：Node 下建立根 Session，问答以 Entry 为单位追加；任一 Entry 可 fork 出子 Session 递归追问，Node、Session、Entry 奇偶层交替嵌套，形成嵌套会话树。
- 导航双层模型：聚焦 Node 默认进入外层会话目录，点入根 Session 进入内层工作区逐条阅读与追问；Esc 由内层逐层退回外层。组合视图横向组织多个主题，支持拖拽组合。

## 开发取向

- 小步可逆修改优先，避免大爆炸式重构。
- 注意区别：修复问题和实现新需求。修复问题走本质修复：先建立正确行为模型，再沿数据流追根因，检查接口语义是否充分，避免条件式打补丁。但实现新需求不然，遇到问题可以咨询用户，明确范围和要求。
- 实现完成后将新约定回写 agents/ 文档，保持文档与代码一致。
