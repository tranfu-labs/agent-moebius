# 任务：agent-handoff-closing-protocol

- [x] `agents/ceo.md`：新增「交棒完整性裁决（第 0 检查）」节，置于业务场景之前；含收尾行语法定义与裁决规则表
- [x] `agents/ceo.md`：「code-verified：识别发起需求角色」第 3 条真人分支收窄（无等待真人行时 append 裸写请真人验收）
- [x] `agents/ceo.md`：「qa 交棒兜底」真人分支同步收窄
- [x] `agents/ceo.md`：补完「持续推进」残段（两个条件各给动作）
- [x] `agents/dev.md`：加统一输出骨架节（收编「验收语句」「验收证据」为角色专属节）；首轮阶段全流程限定合法枚举
- [x] `agents/qa.md`：加统一输出骨架节；`mention 协议` 节收敛为引用交棒行语法
- [x] `agents/product-manager.md`：加统一输出骨架节；`context-loaded` / `problem-framed` / `scope-locked` 三个非法枚举值 → `in-progress`，「交互方式」节同步改写
- [x] `agents/dev-manager.md`：加统一输出骨架节
- [x] `agents/hermes-user.md`：加统一输出骨架节
- [x] 验证：grep 确认六个文件的收尾行语法措辞逐字一致；`## 下一步` 骨架在五个角色文件均存在
- [x] 验证：跑现有测试套件（59 文件 / 556 用例全过），无断言引用被改的提示词文本
- [ ] 运行观察（异步，归档后跟踪）：tranfucom#10 下一轮 CEO 触发应对"QA 通过无交棒"append 请真人验收，而非 no_change

## 勘误（归档后同日精简，见提交记录）

- [x] `agents/ceo.md`：「qa 交棒兜底」与第 0 裁决双事实源 → 收缩为指针，路由规则并入第 0 裁决规则 2（含 QA 不通过 → dev）
- [x] 六个文件："栏位缺失"措辞收窄为"收尾行缺失"——机械红线只压收尾行，结论/依据为结构要求由角色自律
- [x] 五个角色文件：骨架块删除专属节占位行（与块外说明二留一，位置信息并入说明行）
- [x] `agents/dev.md`：删除已成反面教材的旧「正确示例」与三个阶段 metadata 格式块（约 33 行）；stage marker"最后一行"三处重复收敛为骨架单源；修 NERVER 错拼
- [x] `openspec/specs/github-issue-runner/spec.md` T7 节同步以上措辞
