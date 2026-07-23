# local-console delta：right-sidebar-change-project-files

本 delta 为 `local-console` 域新增右侧栏改动清单、行级对比与项目文件读取的行为规格。**新增** Requirement，不替换 evidence-outlets 已登记的基线与计数条目。

## Requirement: 累计改动清单沿用对话基线并包含增删行数
Source: docs/product/pages/main-right-sidebar.md#改动标签

系统 MUST 以会话 `baselineCommit` 为起点，为直接项目文件夹与独立工作空间返回口径一致的累计改动文件清单、每文件新增行数和删除行数，并保留既有 `fileCount` 语义。系统 MUST NOT 从当前 HEAD 重新推导基线，也 MUST NOT 把非 Git 项目返回为可用的零改动。

### Scenario: 两种工作空间读取累计清单
- GIVEN 直接工作空间与独立工作空间会话都在各自对话基线后产生已提交及未提交改动
- WHEN 客户端通过各自 session-scoped HTTP 路由读取改动
- THEN 两个响应都只包含各自工作空间相对对话基线的改动文件、增删行数与匹配的 fileCount

## Requirement: 验收 #8 选中文件返回逐行变化事实
Source: docs/product/pages/main-right-sidebar.md#改动标签

系统 MUST 把所选改动文件的 unified diff 解析为新增、删除、未改动行及其旧新行号；未跟踪文本文件 MUST 作为逐行新增返回。系统 MUST NOT 把 diff patch 原文交给 renderer 自行猜测，也 MUST NOT 省略未改动上下文。

### Scenario: 读取含增删的文本文件
- GIVEN 文件相对对话基线包含一行删除、一行新增与未改动上下文
- WHEN 客户端请求该文件内容
- THEN 响应按顺序包含 `deletion`、`addition`、`unchanged` 行及可用的旧新行号

## Requirement: 验收 #9 改动清单与项目文件树分开读取
Source: docs/product/pages/main-right-sidebar.md#项目文件标签

系统 MUST 让改动路由仅返回改动文件，并让项目文件路由返回当前工作空间中除 Git 内部元数据外的完整文件树；项目文件条目 MUST 标明是否存在累计改动。系统 MUST NOT 把未改动文件混入改动清单。

### Scenario: 项目同时存在改动与未改动文件
- GIVEN 当前工作空间包含一个改动文件和一个未改动文件
- WHEN 客户端分别读取累计改动和项目文件树
- THEN 改动响应只有改动文件，项目文件响应包含两个文件且分别标明 changed 真值

## Requirement: 文件读取失败返回可显示原因
Source: docs/product/pages/main-right-sidebar.md#选择文件

系统 MUST 对超出大小上限、非文本、缺失、非普通文件、越出工作空间和工作空间不可用分别返回稳定原因与空行数组。系统 MUST NOT 静默返回空白内容，也 MUST NOT 通过符号链接或路径穿越读取工作空间外的文件。

### Scenario: 请求二进制与越界文件
- GIVEN 当前项目包含一个二进制文件且请求还包含一个 `../` 越界路径
- WHEN 客户端读取两个路径
- THEN 响应分别返回 `binary-file` 与 `outside-workspace`，且都不包含文件内容

## Requirement: 项目文件与改动读取通道保持只读
Source: docs/product/pages/main-right-sidebar.md#弹层与危险操作

系统 MUST 只通过 GET 路由提供改动清单、项目树和文件内容。系统 MUST NOT 因任何读取请求修改文件、执行还原、暂存、提交、推送、切分支或创建分支。

### Scenario: 连续读取同一文件
- GIVEN 工作空间中的文件已有确定内容与 Git 状态
- WHEN 客户端连续请求项目树和同一文件内容
- THEN 两次读取后文件字节与 Git 状态保持不变
