# github-issue-runner 规格

## 域定位
`github-issue-runner` 负责把 GitHub Issue 的新增事件转成一次本地脚本执行：常驻进程按配置扫描目标 GitHub Issue 来源，识别尚未处理的 issue，并以受控输入把 issue 数据交给本地脚本。

## 业务规则
- MUST 作为常驻进程运行，并按可配置间隔轮询目标 GitHub Issue 来源；默认间隔是否为 5 分钟仍需确认。
- MUST 只对新增且未处理的 issue 触发本地脚本；同一个 issue 在后续轮询中不能重复触发。
- MUST 至少能向本地脚本提供 issue 编号、链接、标题和 body。
- MUST 把 issue 内容当作不可信外部输入处理，MUST NOT 将 title/body 直接拼接进 shell 命令。
- MUST 从环境变量或外部配置读取 GitHub token、目标仓库/查询条件、本地脚本路径和轮询间隔；MUST NOT 把密钥写入仓库。
- MUST 记录每次处理的 issue 标识、本地脚本退出状态和失败原因，便于追溯。
- MUST 明确本地脚本失败后的状态策略；当前 TODO: 需人工确认失败时是否重试、跳过或进入人工处理队列。

## 场景
### 场景 1：轮询发现新 issue
Given 常驻脚本正在运行，且目标 GitHub 来源出现一个此前未处理的 issue
When 下一次轮询获取到该 issue
Then 系统调用本地脚本一次，并向脚本提供该 issue 的编号、链接、标题和 body

### 场景 2：重复轮询不重复执行
Given 某个 issue 已经触发过本地脚本并被记录为已处理
When 后续轮询仍然返回该 issue
Then 系统不再为该 issue 调用本地脚本

### 场景 3：issue body 作为数据传入
Given issue body 中包含换行、引号、反引号或 shell 特殊字符
When 系统调用本地脚本
Then issue body 只能作为受控数据传入，不能改变实际执行的命令结构

### 场景 4：本地脚本执行失败
Given 本地脚本返回非 0 退出码或超时
When 系统记录该次处理结果
Then 系统保留 issue 标识、失败状态和错误摘要；后续是否重试为 TODO: 需人工确认

## 可验证行为
- 当前仓库尚无可运行命令，自动化验证入口为 TODO: 需人工确认。
- 新增运行时代码后，应使用模拟 GitHub Issue 响应验证：新增 issue 触发一次、已处理 issue 不重复触发。
- 新增运行时代码后，应使用包含 shell 特殊字符的 issue body 验证：本地脚本收到原始内容，命令结构不被注入改变。
- 新增运行时代码后，应验证失败路径：本地脚本非 0 退出码会被记录，且状态策略符合本规格。
