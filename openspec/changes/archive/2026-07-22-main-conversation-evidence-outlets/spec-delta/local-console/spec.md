# local-console delta：main-conversation-evidence-outlets

本 delta 为会话新增「对话基线提交」与「对话级改动计数」两条 Requirement，均为新增，不替换既有条目。

## Requirement: #22 对话基线提交在会话诞生时记录为事实
Source: docs/product/pages/main-conversation.md#区域与信息

系统 MUST 在会话随首条消息创建时，通过每会话 jsonl 事实写漏斗持久化该对话开始时项目所在的提交，作为「这段对话改了什么」的唯一基线；SQLite MUST NOT 成为该基线的唯一事实源；迁移 MUST 幂等；既有会话缺少基线时 MUST 降级为「改动不可用」。系统 MUST NOT 在事后从当前 HEAD 推导基线，MUST NOT 因缺少基线使会话不可用或阻塞运行。

### Scenario: 会话诞生时记录基线
- GIVEN 用户在一个 Git 项目下发出第一条消息
- WHEN 会话被创建
- THEN 该会话持久化了此刻项目所在的提交作为基线

### Scenario: 既有会话缺基线时降级
- GIVEN 升级前创建的会话没有基线提交
- WHEN 读取该会话的改动计数
- THEN 返回「不可用」，会话其余能力不受影响

## Requirement: #22 对话级改动计数覆盖两种工作空间
Source: docs/product/pages/main-conversation.md#区域与信息

系统 MUST 以对话基线提交为起点统计这段对话期间发生改动的文件数，默认工作空间统计项目文件夹、独立工作空间统计隔离副本，两者口径一致且都包含已提交与未提交的改动；项目文件夹不是 Git 仓库时 MUST 返回不可用；会话快照 MUST 下发计数及其是否可用，前端不得自行推导。系统 MUST NOT 区分改动来自团队成员还是用户本人，MUST NOT 只在特定验证标记存在时才产出计数，MUST NOT 在本变更中新增改动文件清单路由。

### Scenario: 默认工作空间统计项目文件夹
- GIVEN 一段使用默认工作空间的会话，其基线之后项目文件夹有 2 个文件发生改动（含未提交）
- WHEN 读取该会话的改动计数
- THEN 计数为 2

### Scenario: 独立工作空间统计隔离副本
- GIVEN 一段使用独立工作空间的会话，其隔离副本相对基线有 3 个文件发生改动
- WHEN 读取该会话的改动计数
- THEN 计数为 3，且不受项目文件夹自身改动影响

### Scenario: 非 Git 项目返回不可用
- GIVEN 一段会话的项目文件夹不是 Git 仓库
- WHEN 读取该会话的改动计数
- THEN 返回不可用，而不是 0

### Scenario: 会话快照只下发计数事实
- GIVEN 一段已有对话基线的 Git 会话
- WHEN 客户端读取会话快照
- THEN 快照包含改动计数及可用性，不包含改动文件清单或清单路由
