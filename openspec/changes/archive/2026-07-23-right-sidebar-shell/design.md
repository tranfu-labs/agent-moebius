# 设计：right-sidebar-shell

## 本 change 负责的验收落点

（从验收落点表抄来，实现时逐条对着落点改，NEVER 接到名字相近的现有状态上凑合）

| 验收 | 落点 | 现状 |
| --- | --- | --- |
| #1 默认关闭 + 开关持久化 | `desktop/src/console-page/right-sidebar-preference.ts`（新增，对照 `sidebar-preference.ts` 的全局键范式） | 落点不存在，需新建 |
| #2 标签条随对话切换 + 重启恢复 | `right-sidebar-tabs-store.ts`（新增，对照 `draft-store.ts` 的 `draft:${sessionId}`）+ `app.tsx` 切换对话时重挂 | 落点不存在，需新建 |
| #7 非 git 类型选择只剩项目文件 + 说明 | `right-sidebar.tsx` 类型选择渲染，读 `workspace-resolution.ts` 的 `isGitRepository`（evidence-outlets 已透传 is-git 门） | is-git 信号已存在，裁剪逻辑新建 |
| #15 点击去重 / 加号不去重 | `right-sidebar.tsx` 标签模型的 sourceKey + open 分支 | 落点不存在，需新建 |
| #16 每标签可关 + 关最后一个留空白 | `right-sidebar.tsx` closeTab reducer 兜底分支 | 落点不存在，需新建 |
| #17 加号只给两种类型，不出现终端 / 预览 / 浏览器 | `right-sidebar-tabs.ts` 标签类型枚举 + 类型选择白名单 | 落点不存在，需新建 |
| #18 空白标签说明成员输出 / 子任务从主对话区点开 | `right-sidebar.tsx` 空白标签引导文案 | 落点不存在，需新建 |
| #19 有新内容不自动切换当前标签 | `right-sidebar.tsx` 标签条 activeTab 不被内容更新改写 | 落点不存在，需新建 |
| #23 窄窗覆盖 + 独立关闭 + 恢复滚动位 | `right-sidebar.tsx` 窄窗覆盖态，复用 `sub-session-panel.tsx` 的 `left-0 w-full` + `parentScrollTopRef` 范式 | 覆盖范式已存在，右栏套用 |

## 本 change 承接的规则句（从规则句绑定表抄来）

- **R12/R15「类型选择只有改动与项目文件两种，这条边界写死；终端、预览、浏览器不得从这里长出来」**：`TabType` 枚举会同时物化于 ①枚举定义 ②类型选择渲染 ③空白标签变身分派 ④标签条图标 / 标题映射 ⑤持久化白名单——**五处都只认这两种可见类型**，任何一处放开都穿过验收 #17。
- **R2/R48「开关与宽度持久化」**：右栏宽度要求跨重启保留，而左栏 `sidebarWidth` 当前是纯内存 `useState`（重启丢）——**不能照抄左栏**，须新增持久化键。
- **R4「标签属于对话、不跨对话携带、但跨重启保留」**：标签条按 `sessionId` 键存，切对话换一份，不跨对话携带。
- **R6/R7「点击去重 / 加号不去重」**、**R8「关最后一个标签留空白不收起」**、**R9「无常驻标签」**、**R42「新内容不抢焦点」**、**R33/R34「右上角按钮任何时候可用、开合不影响会话区滚动 / 草稿 / 推进」**、**R44「窄窗覆盖给回到会话区的出口」**：全部落在 `right-sidebar.tsx` 的标签模型与容器行为里。
- **R1/R45（只读约束的容器面）**：本片只搭骨架，空白标签与标签条不得挂任何写操作 handler；内容标签的只读 / 例外由各自 change 承接。

## PRD 失语项与本片默认取值（记录，供 loop 审计与用户裁决对照）

- **标签持久化事实源**：PRD 说标签「与未发送的草稿同理」，草稿走 localStorage → 本片默认 localStorage 范式（非会话 jsonl 事实）。这是失语项（「标签属于对话」也可能想随会话事实持久化），本片按 localStorage 落，若用户裁决改走事实源再调。
- **标签类型枚举全集 vs 可见子集**：枚举含改动 / 项目文件 / 过程 / 子任务 / 空白五种；类型选择只暴露改动 / 项目文件两种。这是两个集合，本片在 `right-sidebar-tabs.ts` 里显式分开，防止实现者把「枚举成员」误当「可选类型」。

## 方案

关键决策：

1. **右侧栏是 `<main>` 的同级第三区，不是 `SubSessionPanel` 的升级**。evidence-outlets 的 `OperatorEvidenceView` 单视图降级被本片整体替换：`onOpenEvidence` 不再渲染单面板，而是「意图→标签条上打开 / 聚焦一个标签」。子任务的 `SubSessionPanel` 由后续 ⑤ 接管，本片先让子任务意图落成一个占位子任务标签。
2. **内容标签用分派表挂载，不写死渲染**。容器按 `tab.type` 分派到内容组件；改动 / 项目文件 / 过程 / 子任务四类内容组件本片给**空占位**（渲染「此标签内容由后续片实现」），③④⑤ 各自替换自己那一类。这条缝是三个后续 change 能并行的关键——它们各改各的内容组件，不互相改容器。
3. **持久化分两层键**：全局键（开关、宽度）用 `right-sidebar-preference.ts`；按对话键（标签条数组 + 选中项）用 `right-sidebar-tabs-store.ts` 的 `tabs:${sessionId}`。序列化只认标签类型白名单，反序列化时丢弃未知类型（向前兼容后续 change 增补的类型标记）。
4. **is-git 信号从 evidence-outlets 已有的通道取**：类型选择裁剪读 `workspace-resolution.ts` 派生的 `isGitRepository`（已随会话上下文下发），不自己判仓库。
5. **窄窗覆盖复用 `SubSessionPanel` 的现成形态**（`left-0 w-full` 覆盖 + 独立关闭 + `parentScrollTopRef` 恢复滚动位），避免另造一套覆盖逻辑。

## 权衡

- **不下沉到主进程 SQLite**：标签条是结构化数组，比单条草稿复杂，但 PRD 明确类比草稿（localStorage）。升格到 SQLite 是更重的决策，本版不做，留失语项。代价：标签条与附件草稿（走 SQLite）持久化位置不一致，可接受。
- **占位空槽 vs 一次做全**：把内容留给后续 change，本片交付的是「可开合、可加标签、可选类型、可持久化的空右侧栏」——它单独可演示、可验证，是三个内容 change 的稳定宿主。代价是本片单独看没有「证据内容」，但这正是垂直切片的边界。

## 风险

- **`operator-console.tsx` 是 ③④⑤ 的共享写点**：本片必须把内容分派缝设计干净（按类型 switch / 注册表），否则三个后续 change 会在容器里互相踩。缓解：分派缝一次定死，内容组件各自独立文件，后续 change 只替换自己的内容组件不改容器结构。
- **替换 evidence-outlets 单视图降级**：`onOpenEvidence` 的现有接线（`sub-session-panel` 单视图）要平滑切走，不能让主对话区的结果卡片 [查看] / 完整输出入口点了没反应。缓解：切换时四类意图都要能落成对应标签（内容即便是占位也要能打开）。
- **持久化脏数据**：旧版本 / 别的 change 写的标签条 JSON 可能含未知类型。反序列化必须容错（丢弃未知项而非崩溃）。
