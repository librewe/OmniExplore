# AGENTS.md

> OmniExplore — 纯前端 Next.js SPA 原型：Node/Session/Entry 嵌套会话树，双层导航与组合视图，无后端。结构事实见 [agents/ARCHITECTURE.md](agents/ARCHITECTURE.md)，交互契约见 [agents/CONVENTIONS.md](agents/CONVENTIONS.md)，实现细节见 [agents/DETAILS.md](agents/DETAILS.md)，完整早期历史见 [agents/HISTORY.md](agents/HISTORY.md)。

## 指令优先级

- 用户当前请求优先于本文件与 agents/ 文档、技能文件的通用指引，冲突以用户请求为准。若某请求与已有实现存在严重冲突，向用户确认实际意图。

## 按需阅读

| 改动类型 | 查阅 |
|---|---|
| 数据/结构/状态 | ARCHITECTURE 相关小节 |
| 交互/渲染/流式/配置 | CONVENTIONS 对应小节 |
| 精确取值/防坑原由 | DETAILS 相关小节 |
| 文件职责、组件树 | ARCHITECTURE「文件职责」小节 |
| 产品与研究定位 | doc/ |

## 构建与验证

```bash
npm run dev       # 开发服务器
npm run typecheck # 类型检查
npm test          # Vitest
npm run check     # 门禁：typecheck + test + lint
npm run build     # 静态导出 out/，勿与 dev 并行
```

验证与改动风险匹配：数据/类型改动跑 typecheck，纯逻辑改动补跑相关 test，build 仅在打包产物变更时。小改动不扩大验证范围。

## 边界与项目规则

- 对用户输入指代或意图逻辑不清楚不理解的地方可以向用户提问。基本操作批准或代码实现细节除外。
- 未经明确请求不 commit。
- TypeScript strict，禁止 `as any`/`@ts-ignore`/`@ts-expect-error`。
- 禁止在代码文件撰写非必要注释；新约定实装后回写 agents/ 文档，避免使用括号夹注补充式的说明，保持文档clean。