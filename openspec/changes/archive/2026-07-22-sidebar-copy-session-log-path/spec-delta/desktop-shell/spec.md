# desktop-shell spec delta：sidebar-copy-session-log-path

## Requirement: 对话菜单只提供归档与复制记录路径
Source: docs/product/pages/main-left-sidebar.md#复制对话记录路径

系统 MUST 在每个对话菜单中提供“归档”和“复制对话记录路径”两个操作。系统 MUST NOT 在当前侧栏范围内加入第三个对话操作或把复制操作放入项目菜单。

### Scenario: 打开对话菜单
- GIVEN 侧边栏存在一段用户发起的对话
- WHEN 用户打开该对话的菜单
- THEN 菜单项恰好为“归档”和“复制对话记录路径”

## Requirement: 复制动作把事实日志稳定路径写入系统剪贴板
Source: docs/product/pages/main-left-sidebar.md#复制对话记录路径

系统 MUST 由桌面主进程查询目标 session 的内部事实日志路径并直接写入系统剪贴板。系统 MUST NOT 让 renderer 自行拼接记录路径或把路径作为 IPC 结果返回展示层。

### Scenario: 复制现有对话记录路径
- GIVEN 目标 session 的 jsonl 事实日志存在且可读
- WHEN renderer 经受控 IPC 触发“复制对话记录路径”
- THEN 系统剪贴板内容为该 session 的绝对 jsonl 路径

## Requirement: 同一对话重复复制得到同一路径
Source: docs/product/pages/main-left-sidebar.md#复制对话记录路径

系统 MUST 在对话继续推进和应用运行期间保持同一 session 的复制路径稳定。系统 MUST NOT 为复制动作生成导出快照或临时路径。

### Scenario: 对话推进后再次复制
- GIVEN 同一 session 已复制过记录路径且随后又追加了消息或运行事实
- WHEN 用户再次触发“复制对话记录路径”
- THEN 第二次写入剪贴板的路径与第一次相同且该文件包含后来追加的事实

## Requirement: 复制失败不改写剪贴板
Source: docs/product/pages/main-left-sidebar.md#复制对话记录路径

系统 MUST 在记录服务未就绪、记录文件不可用或系统剪贴板写入失败时给出可理解的失败说明。系统 MUST NOT 在路径查询或文件可用性校验失败后调用剪贴板写入。

### Scenario: 记录文件不可用
- GIVEN 系统剪贴板已有内容且目标 session 的事实日志不存在或不可读
- WHEN 用户触发“复制对话记录路径”
- THEN 界面显示复制失败说明且剪贴板保留原有内容

## Requirement: 路径值不进入界面文案与常驻状态
Source: docs/product/pages/main-left-sidebar.md#复制对话记录路径

系统 MUST 在成功时只显示“路径已复制”并在失败时只显示不含路径的说明。系统 MUST NOT 把事实日志路径加入界面文案、renderer 可展示状态、会话列表 DTO 或详情 DTO。

### Scenario: 成功和失败反馈均不泄露路径
- GIVEN 底层成功取得路径或失败异常文本包含本机路径
- WHEN 对话菜单完成复制动作并渲染反馈
- THEN 成功反馈为“路径已复制”且失败反馈不包含本机路径
