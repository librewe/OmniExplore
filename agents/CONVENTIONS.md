# OmniExplore 行为契约

> 新增功能或改 UI 行为前逐条核对；新约定实装后回写本文件。本文件只收行为约定，不重复结构描述。

## 输入与提交

- InputBar 的 tag 来自 `nodeState.activeTag.title`：选中 Session 时显示其标题，否则显示当前 Node 标题。
- 提交判定：`tagLabel || forceCreate ? onCreateChild : onFocus`。无 tag 无 forceCreate 时回车是聚焦 Node，不是提交。
- 输入框为多行自适应 textarea：回车 / Ctrl(⌘)+回车发送，Shift+回车插入换行，内容超高自动滚动（上限 180px）；输入法组合中（isComposing）回车不触发提交。
- 输入框草稿与追加目标绑定：InputBar 以追加目标身份作 `key`（导图=guideFocusPath、外层=Node id、内层/整树=activeTag 的 sessionId），节点/会话/工作组/视图切换时 remount 清空本地草稿；同步在各目标切换点清 `fillValue`，防程序化填充（划词追问/加号预设）残留到新目标。
- 初始空态（Onboarding）不渲染底部输入栏，由其自带居中输入框承担聚焦 Node；Onboarding 文案「输入概念，按回车探索…」。
- 外层目录视图隐藏 tag，placeholder 为「在「{Node名}」下开始对话」，并传 `forceCreate=true` 让回车创建新根 Session。
- 内层与整树视图显示 tag；导图模式 tag 文案为「在当前层级新增节点」。
- 外层目录中新建根 Session 后自动进入内层查看流式回答：`setShowTOC(false)` + `setInnerSessionId(s.id)`。

## 新建与会话

- Node 顶行加号无菜单，点击直接创建根 Session「新会话」并立即进入 inline 重命名。
- 根 Session 行加号为五预设：Default + 动态直觉/看定义/看应用/看动机，system 与 user 配套。点击经 `presetSystemRef` 记录 system，发送时一次性使用。user 模板用 `${node}` 占位，发送前替换为当前 Node 标题。
- 一般 Session 行加号用 `plusMenuItems`，默认「精简概括一点」「介绍更多」，可在设置中自定义。模板用 `${node}`，`${term}` 兼容旧配置，点击时替换为当前 Node 标题后填入输入框。
- 行内「新增上下文」固定常驻。
- 加号按钮常驻显示，不随 hover 隐藏；PlusMenu 悬停即展开，移出 120ms 延迟关闭，菜单自身 hover 取消关闭。其余行操作 fork/撤回/copy 保持 hover 显隐。
- fork 命名按 `(分支#N)` 顺序编号；fork 后自动展开，并自动选中 fork 出的子 Session。
- fork 后滚动定位到新分支（对 `.tree-node-selected` 做 scrollIntoView）：fork 出的子 Session 渲染在源 entry 内容之下，源内容较长时可能位于视口外。

## 选中与追加语义

- 聚焦 Node 时默认选中首个根 Session；无 Session 时回落 Node 级。
- 点空白或内容区不取消选中；点 Session 标题始终选中，无 toggle。取消的唯一入口是 Node 顶行，经 `handleSelectSession(null)` 清 `targetSessionIdRef` 并回退 tag 到 node。
- 选中 Session 时其内容末尾渲染淡色提示线，带「将追加到这里」微标签；提示线仅在内层树视图显示，外层目录不显示。
- `selectedEntry` 与 `selectedSession` 独立共存，互不清空。渲染层 entry 高亮优先，session 标题仅在无选中 entry 时高亮。
- 点 entry 时同步选中所属 Session，追加目标跟随；点 Session 标题时清 entry。

## 划词与右键

- 划词 mouseup 自动弹出菜单，默认模板「简单介绍」「指什么」「为什么」。`${selected}` 替换选中文本，`${root}`/`${node}` 替换当前 Node 标题。
- 点击菜单项后从源 entry fork 出分支 Session 并填入输入框。
- 无 entry 上下文的 PDF 划词回退到当前 Node 主题；未选中 Session 时提交自动建根 Session。
- 内容区、PDF、术语标注均恢复浏览器默认右键行为，不拦截。
- 防重弹：菜单与对应文本存 ref，mouseup 先于 click 触发，同文本直接忽略并交由 click 关闭菜单。菜单位置取 `getRangeAt(0).getBoundingClientRect()`，非鼠标坐标。

## 导航与视图

- 聚焦 Node 默认落外层目录；点 Session 标题或段摘要进内层对应根 Session。
- 内层 Esc 退回外层目录并重置 `targetSessionIdRef` 与 tag；组合视图沿面包屑退出。Esc 循环只在组合视图与外层之间生效。
- 外层目录为根 Session 卡片列表：`mb-2 rounded-lg border bg-card/40 p-2`，标题 `text-base font-semibold`，段摘要 `text-sm leading-relaxed text-muted-foreground`，不显示会话条数。递归子 Session 保持紧凑列表，不做卡片套卡片。
- 默认展开所有根 Session 卡片第一层，子分支保持折叠；`key={node.id}` 切换节点时重挂载重置展开态。
- 目录/整树视图滚动容器用 `[scrollbar-gutter:stable]` 防内容跳动；导图用 Radix ScrollArea 不占布局。
- 视图容器 padding：外层目录与组合视图 `pt-4 pr-4 pb-24`；内层去掉 `pt-4` 防 sticky 首行展开/收起时顶部空隙跳变。
- 导图虚拟根为 `{term:"", children:[]}`，无 term 时渲染 children 平级。面包屑仅导图模式显示。

## 渲染与行操作

- Entry 标题无论折叠与否截断首行 30 字符；note 空内容显示占位文本「(双击或右键编辑)」。
- 仅末位未响应 entry 可编辑：`isEditable = isLast && !assistantOutput`。
- 撤回即编辑语义：textarea 以 `defaultValue` 复原 userInput，Ctrl+Enter 保存、Esc 取消、Ctrl+Z 原生 redo。
- summary 的标题行固定为「📝 段摘要」，不显示截断内容，有箭头可折叠。生成中强制展开，完成后尊重手动折叠。内容区显示完整摘要文本。
- summary 渲染位置在 fork entry 的 children 之前：fork entry 内容区之后、分支之前；map 中 summary 不独立渲染，避免重复。
- summary 行不参与粘滞滚动：作为 fork entry 的内容附属行随内容滚走，避免与所属 entry 同 rank 同 top 吸顶时盖在其粘滞行之上。
- summary 支持编辑与重新生成；用户编辑过即 `summaryEdited=true`，AI 重新生成不得覆盖。
- reasoning 渲染为可折叠「思考过程」块，默认收起，流式中显示 spinner。
- 用户输入块样式 `rounded-lg bg-muted/50 px-3 py-2`：无左竖线、无头像图标，避免与选中态左线混淆。
- 长内容内部滚动：qa 与 note 的 entry 级内容块在输出完成后若超过视口高度 60%，限高 60vh 并在块内滚动。用户提问块、思考过程与回答正文位于同一滚动区内整体滚动，段摘要与编辑态不参与。流式期间不设限自然增高，完成时若仍超出再套限高并将内部滚动锚到回答顶部。
- 长块内部滚动区滚到顶或底后，剩余滚轮交还外层树容器，依赖浏览器原生滚动级联，不做 JS 拦截。
- entry 内容内部滚动位置以 entry 对象身份瞬时记忆，树与目录容器滚动位置以视图槽位瞬时记忆。视图切换、entry 折叠重开、会话收起重开与节点切换再返回均还原，仅存内存不落持久化。

## Markdown 与术语渲染

- 字号层级：正文 16px。标题与表格不小于正文：h1 `text-xl`、h2 `text-lg`、h3 `text-[17px]`、h4/h5 `text-base`、h6 `text-sm`；table `text-sm`；行内 code `text-[13px]`。标题与表格禁用 `text-xs`。
- remark-math 只认 `$`/`$$`。`MarkdownRenderer` 渲染前经 `normalizeMathDelimiters` 将 `\[...\]`→`$$...$$`、`\(...\)`→`$...$`，只匹配 `\` 前缀括号，不误伤 `[1]` 引用与 `\$` 转义。
- 术语保护区域 `encodeFreeTerms.protectedRegions` 必须覆盖 markdown 链接、行内/块级数学公式与代码，否则私有区占位符破坏 KaTeX 与代码原文。保护正则：`$...$`/`$$...$$`/`\(...\)`/`\[...\]`/行内 code/代码块。
- 公式定界符的转义发生在渲染前归一化阶段，因此 `\(...\)`/`\[...\]` 必须在注入阶段就纳入保护。
- 正文统一 `text-base`，行距 `leading-[1.8]` 必须放在 `cn()` 末位。tailwind-merge 同组冲突后者覆盖前者，`leading-[1.8]` 前置会被 `text-*` 覆盖删除。正确姿势：`cn("text-base", className, "leading-[1.8]")`。
- 层级靠字重而非字号：Node semibold → Session medium → Entry regular。辅助信息 `text-xs`。
- 内容容器 `max-w-3.5xl`，左右内容内缩 20px。
- 树/目录 sticky 行的行秩从 Node=0 起连续计数，`top = 行秩 × 30px`；选中态实色背景，粘滞行背景用 CSS 变量与 `color-mix` 祖先高亮。内层（单一根 Session 工作区）不渲染 Node 顶行，且根 Session 行不参与粘滞：其标题常驻顶部导航栏（header 内层显示根 Session 名而非 Node 标题），根 Session 之下各后代行的行秩相对其重新从 0 起算（`stickyRankOffset=2`）；整树视图维持 Node 顶行 + 根 Session 行的原始粘滞阶梯。

## 流式

- 连接超时 30s 仅覆盖建连阶段，收到响应头即清除，流式过程无总体超时（防长回复被腰斩）。
- 空闲看门狗：建连后每收到一帧 SSE 数据重置；网关静默挂起超过 30s 中止并抛「请求超时」，避免 entry 永久停在 streaming。
- `SET_STREAMING_CONTENT` 累积式整值设值，非增量追加，防 SSE 重复。
- `streamLLMChat` 的 yield 是结构化 chunk `{ content?, reasoning? }`；解析 `delta.reasoning_content` 或 `delta.reasoning` 后分别累积到 `entry.reasoning` 与 `assistantOutput`。改动 yield 形态需同步两个调用方。
- `streamLLMChat` 第三参接受外部 `AbortSignal`：中止会真正取消底层 fetch 并静默结束生成器（不抛错），调用方把 entry 置 done 保留部分内容。
- 自动打断：新流启动经 `streamingAbortRef` abort 旧流，旧流 fetch 被取消、entry 置 done 保留部分内容；打断不再是 error 路径，旧 entry 不会遗留为永久 streaming（思考过程无限转圈）。
- 摘要生成只消费 `chunk.content`。

## LLM 配置

- SettingsPanel 仅暴露 API Key / Base URL / Model 三字段。
- `max_tokens` 发送时兜底默认配置值；`temperature` 不再发送，部分模型不支持该参数。
- `enableThinking` 默认 true。`buildThinkingParam` 按 base_url 判断网关格式：DeepSeek 官方/智谱原生/Kimi K2.x 发 `thinking:{type:"enabled"}`；阿里百炼与 QwenCloud 发 `enable_thinking:true`；其余默认发 `thinking.type`，不强行附加避免网关报错。
- thinking 模式下 `max_tokens` 与 reasoning 共享预算；`temperature` 等采样参数被静默忽略；带 `tools` 时必须回传历史 `reasoning_content`，否则 400。

## 悬停预览

- HoverPreview `pointer-events-none` 防卡滞，悬停术语显示对应 Node 首行摘要。
- 摘要取首个根 Session 的首个 entry 首行。显示延迟 80ms，点击任意处关闭。

## PDF

- pdfjs-dist 锁定 4.x 当前 4.10.38，勿升 5.x/6.x。
- worker 走 CDN，版本号随主库自动跟随；升级后确认 CDN 有对应版本。
- PDF 划词走 SelectionMenu，无右键菜单。

## 组合视图

- `GuideMapNode.nodeId` 仅叶子持有，绑定主题 Node ID。构造与增查删改一律按 nodeId 语义操作，nodeId 是定位的唯一匹配方式，无 term 回退。
- 构造点按标题在 nodeList 查找绑定；查不到则为导图自由节点，nodeId 留空。
- 拖拽组合后叶子 nodeId 随对象保留在分组 children 内，分组本身无 nodeId；`findNodeByNodeId` 可穿过分组递归定位。
- 旧导图数据无 nodeId，重建后全量绑定生效。

## 主题与工作组

- ThemeMenu 三态：亮/暗/跟随系统，localStorage `theme` 持久化，layout.tsx 内联脚本首帧防闪。
- 节点库、组合视图、导航历史按工作组隔离；Node 归属 `groupId`，根 Session 继承。切换工作组时重置内层、target 与 guideFocusPath 并重载 nodeList。
- 工作组重命名与删除的 handler 已实现但未接线，UI 无入口。

## 未实现需求

- 流式排队等待，替代自动打断：检测到上下文链依赖进行中的旧流时等待其完成再启动新流，避免半截回答进上下文。涉及单槽 abort ref 改 Map、等待态 UI、新 entry 创建时机后移。
- 用户手动中止流式：提供中止按钮或快捷键，中断后 entry 置 done 保留部分内容。
- 工作组重命名/删除 UI 入口。
- 撤销/重做、反向链接、浏览器插件等规划项。
- tsconfig 未开启 `noUnusedLocals`，死代码需手动核查。

## 已知限制

- `page.tsx` 过长，约 1978 行，未来拆分为 custom hooks 或独立 handler 模块。
- 未做移动端适配。
