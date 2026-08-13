# OmniExplore

> 沿概念根系递归追问，Learn from scratch.

一个本地优先的认知考古工具——沿知识树递归探索概念，从术语出发逐层展开理解。

## 截图

（待补充）

## 功能概览

| 模块 | 描述 |
|---|---|
| **知识树** | 以术语（根节点）为起点，通过追问/引用子节点递归展开的概念树 |
| **导图** | 多术语平级集合视图，按 Esc 进入，支持节点组合与层级 |
| **术语库** | 按工作组管理术语，内容中自动标注可点击跳转 |
| **预设提示词** | 4 个微观维度预设 + 自定义，一键填充到输入框 |
| **LLM 流式问答** | 支持 OpenAI 兼容 API（ChatGLM、DeepSeek 等），SSE 流式输出 |
| **拖拽排序** | 子节点任意拖拽改变归属，防止循环引用 |
| **导航历史** | 每工作组独立历史栈，Alt+←/→ 前进后退 |
| **预览面板** | 右侧常驻面板，导图点击节点预览内容 |

## 技术栈

| 层 | 选型 |
|---|---|
| 框架 | Next.js 14 (App Router, Static Export) |
| 语言 | TypeScript (strict) |
| 样式 | Tailwind CSS + shadcn/ui |
| 状态 | Zustand + useReducer |
| 持久化 | IndexedDB (idb) + localStorage |
| 拖拽 | @dnd-kit |
| LLM | fetch + SSE 流式解析（自研，零依赖） |

## 项目结构

```
src/
├── app/                    # Next.js App Router
│   ├── layout.tsx
│   └── page.tsx            # 主页面（状态枢纽 + 所有 handler）
├── components/             # UI 组件
│   ├── ui/                 # shadcn/ui 基元（button/input/dialog/tabs…）
│   ├── InputBar.tsx        # tag 驱动输入框
│   ├── NodeView.tsx        # 递归 Node 树（Session + Entry）
│   ├── NodeLibrary.tsx     # 左侧节点列表
│   ├── GuideMapCanvas.tsx  # 组合视图（DnD 拖拽）
│   ├── ContextMenu.tsx     # 右键菜单
│   ├── PlusMenu.tsx        # 加号下拉菜单
│   ├── SettingsPanel.tsx   # 设置弹窗
│   ├── PreviewPanel.tsx    # 右侧预览面板
│   ├── PDFViewer.tsx       # PDF 阅读器
│   ├── FilesList.tsx       # 文件列表
│   ├── MarkdownRenderer.tsx # Markdown 渲染
│   ├── TermText.tsx        # 术语标注文本
│   ├── WorkGroupSwitcher.tsx
│   └── Onboarding.tsx
├── store/
│   ├── nodeStore.ts        # Node(Session/Entry) reducer
│   └── configStore.ts      # Zustand（LLM 配置 + 预设项）
├── services/
│   ├── cache.ts            # IndexedDB CRUD
│   ├── llm.ts              # SSE 流式 LLM 调用
│   ├── prompts.ts          # 预设提示词管理
│   └── termParser.ts       # [[术语]] 解析
├── types/
│   └── index.ts            # 全部类型定义
└── lib/
    ├── constants.ts        # 预设定义、默认配置
    ├── NodeListContext.ts   # 节点列表 Context
    └── utils.ts            # cn() 工具函数
```

## 开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建静态站点
npm run build
# 输出到 out/
```

## 配置

LLM 连接在设置面板中配置：

| 字段 | 示例 |
|---|---|
| API Key | `sk-xxx...` |
| Base URL | `https://open.bigmodel.cn/api/paas/v4/` |
| Model | `glm-4-flash` |

预设提示词的菜单标签和 prompt 模板同样在设置中可编辑。模板中使用 `${term}` 作为占位符，发送时自动替换。

## License

Private use.
