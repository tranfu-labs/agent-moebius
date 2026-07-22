# 字符图：main-conversation-streamdown-markdown

基线：`docs/wireframes/pages/console.md`（历史版式参考）。当前页面事实以 `docs/product/pages/main-conversation.md#页面结构` 与 `#区域与信息` 为准；归档时只回流页面 PRD，不再向历史 Wireframe 制造第二事实源。

## pages/main-conversation.md

### 已完成的用户与 Agent Markdown

```text
│ 你                                                   10:08 │
│ ## 目标                                                    │
│                                                           │
│ - [x] 保留现有会话                                        │
│ - [ ] 增加 Markdown                                       │
│                                                           │
│ | 能力       | 状态 |                                     │
│ |------------|------|                                     │
│ | Streamdown | 已定 |                                     │
│                                                           │
│ 开发                                                 10:09 │
│ 已接入 `MarkdownMessage`，示例：                           │
│ ┌─ typescript ─────────────────────── [复制] [下载] ────┐ │
│ │ const mode: "static" | "streaming" = "static";      │ │
│ └───────────────────────────────────────────────────────┘ │
│                                                           │
│ $$                                                        │
│ E = mc^2                                                  │
│ $$                                                        │
```

正文仍在同一条无卡片时间线中；表格、代码和宽内容只在自身容器横向滚动。

### 运行中只更新同一条记录

```text
时间点 A
│ 开发                                              [停下] │
│ 我先检查消息事件和现有 renderer。                         │
│                                      [完整输出 →]         │

                 ↓ 同一 runId、同一 DOM 行原地替换

时间点 B
│ 开发                                              [停下] │
│ ## 检查结果                                               │
│                                                           │
│ - JSONL 有 8 个事件                                       │
│ - 主时间线仍只有 1 条活动记录                             │
│                                      [完整输出 →]         │

                 ↓ run 完成，临时记录由最终消息接管

时间点 C
│ 开发                                                     │
│ ## 检查结果                                               │
│                                                           │
│ 已完成 Markdown 接入；历史中只留下这一条最终回复。        │
│                                      [完整输出 →]         │
```

### 安全外链

```text
│ 参考：[Streamdown 文档 ↗]                                 │
│                                                           │
│        ┌──────────────────────────────────────┐           │
│        │ 即将打开外部链接                     │           │
│        │ https://streamdown.ai/docs           │           │
│        │                                      │           │
│        │             [复制链接] [取消] [打开] │           │
│        └──────────────────────────────────────┘           │
```

确认后的链接由 Electron 主进程交给系统浏览器；Markdown 不能直接导航当前窗口，也不能打开 `file:`、`data:` 或自定义协议。
