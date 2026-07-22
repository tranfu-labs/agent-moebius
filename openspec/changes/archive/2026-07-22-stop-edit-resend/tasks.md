# 任务：stop-edit-resend

- [x] run-outcome 的 user-stopped 分支增加「改一改重发」入口（键盘可达、含 aria 标签）
- [x] 本轮起点用户消息定位（由停下记录回溯该 run 的触发消息，数据侧实现）
- [x] 正文回填 composer 草稿并走既有草稿持久化（跨切换/重启保留）
- [x] 附件引用克隆回填（消费 cloneMessageAttachmentsToDraft；能力未在 main 时记 known_issues 并只交付正文回填）
- [x] 重发走普通发送链路：新消息、原消息不动、不回滚文件改动
- [x] 确认未给一般历史消息新增任何编辑/重发入口
- [x] 测试：停下→回填→改→重发的外层入口全链路；多成员接力下的起点定位；原消息不变
- [x] spec-delta：为 mc-41 写 Requirement（console-ui 域）
