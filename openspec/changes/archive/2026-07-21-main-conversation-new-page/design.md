# 设计：main-conversation-new-page

## 方案

### 会话诞生时刻后移

当前 `state-sync.ts` 把 `create-session` 建模成一个独立的 selection mutation：拿 token → `POST /sessions` → `commitSelection` → `refresh` → 放 token。改造后「创建」不再是用户可触发的动作，它变成发送首条消息的副产品：

```
新对话页（无 sessionId）
  └ 用户选项目 / 选团队 / 写草稿 —— 全部只在 renderer，不发任何请求
  └ 点发送
       └ 单个 mutation token 内：
            POST /sessions { projectId, agentTeam, initialMessage }
              └ runtime 同一事务：INSERT session（title = deriveTitle(body)）
                                 + INSERT 首条 user message
                                 + 触发本轮路由
            commitSelection({ projectId, sessionId })
            refresh(...)
            清除 draft:new
```

关键约束：**创建与首条消息必须原子**。若分两次请求，中途失败会留下一段空白会话——正是 PRD 要消除的东西。因此 `initialMessage` 走请求体而非后续调用。

子会话创建路径（`POST /child-sessions`）不带 `initialMessage`，行为不变；`normalizeTitle` 的「新会话」缺省只服务这条路径。

### 标题规则独立成纯函数

`src/local-console/title.ts` 导出 `deriveSessionTitle(body: string): string`，负责：折叠连续空白、只取首行、按显示宽度截断、全空白或全符号时的兜底。它不感知 SQLite 也不感知 HTTP，因此可以直接单测边界条件。

PRD 明确「标题在发出第一条消息时确定，之后不随对话内容变化」，所以这个函数只在 INSERT 时调用一次，不存在重算路径。

### 草稿落 renderer 本地

`draft-store.ts` 提供 `read(key)` / `write(key, value)` / `clear(key)`，key 为 `draft:new` 或 `draft:<sessionId>`。新对话页写前者，已有会话写后者。会话创建成功后清 `draft:new`——注意顺序：先 `commitSelection` 再清草稿，避免创建成功但选中失败时草稿已丢。

`draft:new` 只有一份，不按项目分。理由：PRD 描述的是「这个页面还没有任何消息时的样子」，页面只有一个，草稿也只有一份；按项目分会让用户在项目间切换时看到草稿忽隐忽现。

### 发送禁用的原因要说出来

PRD 只写「发送禁用」，没写用户怎么知道为什么。设计上把原因作为一行常驻文本贴在输入框下方，而不是禁用按钮的 tooltip——这是**必须先解决才能往下走**的阻塞，藏在悬停后面等于让用户对着灰按钮猜。

### 组件拆分范围

只拆本片碰到的那块：把新对话页从 `operator-console.tsx` 摘成独立组件，把新对话页的状态从 `app.tsx` 摘进 `new-conversation.ts`。不顺手重构 `operator-console.tsx` 的其余部分，也不动 `app.tsx` 里与本片无关的 30 余个 callback。

## 权衡

**草稿落 renderer 本地存储 vs 落 SQLite。** 选了前者。落 SQLite 能让草稿与会话数据同源，但新对话页此时**没有会话主体**，需要为它单独建一张 drafts 表，并回答「草稿何时清理」「用户永远不发送时留多久」这类本片不需要回答的问题。renderer 本地存储的代价是换机器不跟随——这是本地桌面应用，不构成问题。

**创建与首条消息合并成一个请求 vs 保留两次调用。** 选了合并。两次调用的写法更贴合现有 API 形状，但中途失败会留下空白会话，而「点开又退出产生的空白对话数量，目标为零」是 PRD 的产品指标之一。合并后 `POST /sessions` 的语义略微变宽（可选带首条消息），换取时序上的原子性。

**顶部进入不预选项目 vs 预选上次使用的项目。** PRD 已经拍板不预选，并给了理由：项目在发出第一条消息后永久锁定，替用户猜一个会让一次没看清的点击变成一段归属错误且无法纠正的对话。实现不得为了少一次点击而违背它。团队则相反——PRD 允许预选，因为它随时能改。

## 风险

- **选择态 mutation 模型改动的波及面**。`state-sync.ts` 的 `beginMutation` / `finishMutation` 与周期 refresh 的 lease 抢占逻辑（`console-ui/spec.md` 的 `Selection mutation serialization`）是 B/C/D 共用地基。缓解：`createSessionWithFirstMessage` 仍然只占一个 token，不改变 lease 语义，只改变 token 内做的事；`operator-console.test.tsx` 现有的 mutation 序列化回归用例保持绿。
- **删除 `NewConversationDialog` 会撞现有测试**。`operator-console.test.tsx`（1371 行）里有针对该弹窗的用例。缓解：这些用例连同弹窗一起重写为新对话页的用例，不保留死代码。
- **`POST /sessions` 语义变宽可能被子会话路径误用**。缓解：`initialMessage` 为可选字段，不传时走原路径；在 spec-delta 中显式写明子会话创建 MUST NOT 依赖它。
- **回滚思路**：本片改动集中在 renderer + 一个 HTTP 字段 + 一个纯函数，SQLite schema 不变（标题写的是既有 `title` 列）。回滚只需恢复弹窗组件与 `createSession`，无数据迁移需要倒回。
