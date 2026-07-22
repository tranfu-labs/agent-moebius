# console-ui spec delta：stop-edit-resend

## Requirement: mc-41 改一改重发入口只属于用户停下记录
Source: docs/product/pages/main-conversation.md#停下

系统 MUST 只在 `user-stopped` 的「你让这一步停下了」系统记录旁提供键盘可达且可访问名称明确的「改一改重发」入口。系统 MUST NOT 在其他运行结果或一般用户、Agent 历史消息旁显示该入口。

### Scenario: 停下记录与普通历史同时存在
- GIVEN 时间线同时包含一条 `user-stopped` 系统记录、普通历史消息和卡住记录
- WHEN 用户查看并用键盘遍历时间线操作
- THEN 只有 `user-stopped` 系统记录旁存在一个「改一改重发」入口

## Requirement: mc-41 回填使用停下轮次最近的用户消息
Source: docs/product/pages/main-conversation.md#停下

系统 MUST 从被操作的 `user-stopped` 记录向前定位同一会话最近一条用户消息作为本轮起点，并把该消息正文回填到当前会话草稿。系统 MUST NOT 把接力中的 Agent 消息或其他会话消息当作回填起点。

### Scenario: 多成员接力中停下
- GIVEN 一条用户消息先触发开发成员、随后由开发成员接力给测试成员且测试步骤被用户停下
- WHEN 用户激活该停下记录旁的「改一改重发」
- THEN 输入框回填接力开始前最近一条用户消息的正文

## Requirement: mc-41 附件以新草稿引用按原顺序回填
Source: docs/product/pages/main-conversation.md#停下

系统 MUST 把本轮起点用户消息的附件按原顺序克隆为当前会话草稿的新引用，并让正文与附件共同遵循既有草稿持久化。系统 MUST NOT 修改原消息附件引用、复制托管 blob 内容或直接改写附件表绕过克隆能力。

### Scenario: 回填带附件的停下轮次
- GIVEN 本轮起点用户消息按顺序包含两个托管附件且当前步骤已被用户停下
- WHEN 用户激活「改一改重发」并切换会话后返回
- THEN 输入框恢复原正文且附件草稿包含两个顺序不变的新引用
- AND 原消息仍引用原 attachment ids 和原 blobs

## Requirement: mc-41 重发追加新消息且保留原消息
Source: docs/product/pages/main-conversation.md#停下

系统 MUST 让修改后的草稿通过既有发送入口追加为一条新的用户消息并开启新一轮。系统 MUST NOT 修改或删除作为回填来源的原用户消息，也 MUST NOT 为重发消息写入特殊分叉或重跑标记。

### Scenario: 修改正文后重发
- GIVEN 「改一改重发」已把原消息正文和附件引用回填到输入框
- WHEN 用户修改正文并使用普通发送按钮提交
- THEN 时间线追加一条包含修改后正文的新用户消息
- AND 原用户消息的正文、附件和时间线位置保持不变

## Requirement: mc-41 回填与重发不回滚工作空间文件
Source: docs/product/pages/main-conversation.md#停下

系统 MUST 在回填和重发期间保留停下前已经产生的工作空间文件状态。系统 MUST NOT 因激活「改一改重发」或提交新消息而执行文件恢复、工作空间重建、reset、checkout、merge 或 rebase。

### Scenario: 停下前已有文件改动
- GIVEN 被停下的步骤已经在工作空间产生文件改动
- WHEN 用户依次激活「改一改重发」、修改草稿并发送
- THEN 工作空间中停下前的文件改动仍然存在

## Requirement: mc-41 不提供历史消息编辑或分叉入口
Source: docs/product/pages/main-conversation.md#停下

系统 MUST 把「改一改重发」保持为 `user-stopped` 系统记录上的草稿回填动作。系统 MUST NOT 提供历史消息原地编辑、从任意历史消息分叉、或从任意历史消息重跑的入口。

### Scenario: 浏览一般历史消息
- GIVEN 时间线包含多条已发送的用户与 Agent 历史消息且没有对应的 `user-stopped` 记录操作
- WHEN 用户查看历史消息可用操作
- THEN 不存在编辑、分叉、重发或重跑历史消息的入口
