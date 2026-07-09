# 线框：local-console-t4-desktop-operator-console

基线：[docs/wireframes/pages/observer.md](../../../docs/wireframes/pages/observer.md)。本 change 用本地对话操作台取代桌面主窗口的状态页主导地位；`openspec/changes/conversation-console/wireframes.md` 是已确认的设计输入，但归档回流仍以 `docs/wireframes/pages/console.md` 为目标事实源。

## pages/console.md

### T4 主视图：一个本地项目，多会话，运行中

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Moebius                       1 运行中 · 0 等你            [诊断] [新会话] │
├────────────────────┬──────────────────────────────────────┬────────────────┤
│ ▾ agent-moebius     │ 会话: 本地 T4 验收                 运行中│ 运行详情       │
│  »  本地 T4 验收    │                                      │ runDir          │
│     失败构造验证    │ ┌ 你 · 14:02 ─────────────────────┐ │ /tmp/.../run-1  │
│     卡住状态验证    │ │ dev 帮我验证本地操作台直播       │ │                │
│     空白会话        │ └──────────────────────────────────┘ │ 最近输出        │
│  已完成 (2)        │                                      │ running tests... │
│                    │ ┌ 开发 · 运行中 00:43 ─── [中断] ┐ │                │
│                    │ │ 正在运行 · stdout.jsonl 已更新   │ │ 状态           │
│                    │ │ runDir: /tmp/agent-moebius...    │ │ running        │
│                    │ │ 最近输出: running tests...       │ │                │
│                    │ └──────────────────────────────────┘ │ 错误记录       │
│                    │                                      │ 无              │
│                    ├──────────────────────────────────────┤                │
│                    │ [ 输入消息，选择一个角色交棒... ][发送]│                │
└────────────────────┴──────────────────────────────────────┴────────────────┘
```

要点：
- 左侧保持项目到会话两层；T4 只有一个本地项目，但 UI 结构不退化为单列表。
- 中栏单时间线混排 user / agent / system；运行中消息是时间线内活动块。
- 右侧显示 runDir、最近输出、状态和错误记录；没有产物时不放空产物区。
- 运行块在 stdout/jsonl 暂无可读文本时必须显示非空概括，例如“正在运行，等待输出”。
- runDir tail 读取超时或失败时仍显示非空概括，并可在详情里显示 tail diagnostic；不得拖垮轮询。

### 点击中断后

```text
┌ 开发 · 已中断 · 14:03 ───────────────────────────────┐
│ 用户已中断本轮运行。                                │
│ runDir: /tmp/agent-moebius-local-...                 │
│ 状态: interrupted                                    │
└──────────────────────────────────────────────────────┘

[ 输入消息，选择一个角色交棒... ][发送]
发消息会开启新一轮运行。
```

要点：
- 中断是中性事实，不渲染为错误失败。
- 输入框恢复可用，下一条消息能继续处理。

### Codex 失败记录

```text
┌ 系统 · 本地错误 · 14:08 ─────────────────────────────┐
│ Codex 运行失败: exit-code-1                          │
│ runDir: /tmp/agent-moebius-local-...                 │
│ stderr: fake codex failed for acceptance             │
└──────────────────────────────────────────────────────┘

右侧错误记录
  14:08  exit-code-1
  runDir /tmp/agent-moebius-local-...
```

要点：
- 失败必须落成 timeline/system message 和右侧错误记录，不能只出现在日志或控制台。
- fake Codex 非零退出和 spawn error 都走错误失败分支；用户中断不进入错误记录。

### 运行卡住记录

```text
┌ 系统 · 运行卡住 · 14:12 ─────────────────────────────┐
│ Codex 运行卡住: idle-timeout:300000ms                │
│ runDir: /tmp/agent-moebius-local-...                 │
│ 状态: stuck                                          │
└──────────────────────────────────────────────────────┘

右侧状态
  卡住
  reason idle-timeout:300000ms
  runDir /tmp/agent-moebius-local-...
```

要点：
- 卡住不同于错误失败，也不同于用户中断；刷新后仍可见 reason/runDir。
- stale running 修复同样落成可见卡住记录，避免页面永久 running。

### 诊断入口

```text
[诊断] 菜单
  打开状态页
  打开观察页
  打开数据目录
```

要点：status / observer 保留为辅助诊断入口，不再是主窗口默认体验。
