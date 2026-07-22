# 提案：local-console-managed-attachments

## 需求基线

产品事实源锚点：`docs/product/pages/main-conversation.md#带附件的输入框与时间线`、`docs/product/pages/main-conversation.md#输入框`、`docs/product/pages/main-conversation.md#添加与发送附件`、`docs/product/pages/main-conversation.md#指标与验收`。

| 文件 | 小节 | 变更 | 状态 |
| --- | --- | --- | --- |
| `docs/product/pages/main-conversation.md` | 页面结构 · 带附件的输入框与时间线 | 增加右下角「＋」、拖拽、剪贴板图片、图片缩略图与普通文件卡片 | 已写入（本 change 落盘） |
| `docs/product/pages/main-conversation.md` | 输入框 | 把正文与附件共同定义为可恢复草稿 | 已写入（本 change 落盘） |
| `docs/product/pages/main-conversation.md` | 添加与发送附件 | 明确托管副本、原子发送、Codex 图片输入、普通文件清单与安全边界 | 已写入（本 change 落盘） |
| `docs/product/pages/main-conversation.md` | 指标与验收 | 增加入口、纯附件、多附件、恢复、失败、运行副本和路径安全验收 | 已写入（本 change 落盘） |

## 背景

当前本地操作台只有 `body: string`：输入框不能选择、拖拽或粘贴图片，`session_messages` 和本地 API 没有附件元数据，运行链路也没有向已有的 `CodexRunOptions.imagePaths` 传值。用户只能把文件放进项目后在正文里写路径；原文件移动、删除或工作空间切换后，这种路径提示不再可靠，也没有历史预览和失败重试保障。

Codex CLI 的公开实现给出了图片附件的基线语义：同一输入可携带多个 `LocalImage`，允许没有文字的纯图片输入，剪贴板图片会落为 PNG 临时文件，执行参数使用可重复的 `--image`。local image 在 rollout 中会变成编码后的图片内容，但 UI history event 仍可能保留原路径用于编辑历史，因此 Codex 并没有替本项目提供完整的应用托管生命周期。CLI 当前也没有普通文件的同类 `UserInput` 变体，因此本项目必须明确区分“Codex 原生图片输入”和“通过受控本地路径交给 Agent 的普通文件”。

## 提案

为本地会话新增应用托管附件能力：

- 在 composer 右下角增加「＋」，通过系统文件选择器选择多个文件；同时支持拖拽文件和粘贴剪贴板图片。
- 图片以缩略图呈现，其他文件以文件名、类型、大小卡片呈现；支持纯附件消息和多附件消息，不增加任意的固定 10 个数量上限。
- 文件加入草稿后流式复制到数据根下的托管附件目录，SQLite 把不可变托管 blob 元数据与草稿/消息有序引用分开保存，不保存或返回原始绝对路径。
- 首条消息创建与普通消息发送都在一个 SQLite 事务中写入正文、消息和有序附件引用；附件未准备完成或失败时不写半条消息。同一托管 blob 可以通过不同引用被原消息和后续“改一改重发”草稿共同使用，不移动或改写原消息归属。
- 每次运行把当前 prompt 范围内的托管附件复制到 `runDir/input-attachments/`。PNG、JPEG、GIF、WebP 作为 `imagePaths` 传给 Codex；普通文件通过带消息来源、文件名、类型、大小和受控运行路径的清单写入本地 prompt。
- 时间线和草稿恢复只消费结构化附件元数据；renderer 只加载由托管原件派生的有界缩略图，不读取完整原件，保持 Markdown 对 `file:`、`data:` 和自定义协议的禁用。

## 影响

受影响模块：

- `packages/console-ui`：附件入口、拖拽/粘贴、草稿附件状态、图片缩略图、普通文件卡片与时间线附件呈现。
- `desktop/src/console-page`：附件草稿同步、上传/重试/移除、首条消息和普通发送编排、跨重启恢复。
- `src/local-console`：附件 API、托管文件 adapter、消息类型、prompt manifest、运行前安全副本与 Codex `imagePaths`。
- `src/sqlite-state.ts` / `src/sqlite-state-worker.ts`：不可变附件 blob、草稿/消息 refs 和原子写命令。
- `src/config.ts`：托管附件根和与 Codex 高位输入护栏对齐的本地安全上限。

保持不变：

- GitHub issue 媒体下载、release artifact 发布和 GitHub runner SQLite 不参与本地附件链路。
- 用户/Agent Markdown 的 URL 白名单不放宽；结构化附件不是 Markdown 图片。
- 普通文件不伪装成 Codex CLI 原生附件，也不自动复制进项目或 worktree。
- 既有 local-console 诊断 DTO 中的 `runDir` 字段不在本 change 内重构；新增附件 DTO、预览响应和附件日志不得携带原始路径、托管路径或本轮附件副本路径。
- 本 change 不实现 PRD 中另一项“停下后改一改重发”的按钮和运行控制；但附件存储与 API 会提供受归属校验的引用克隆能力，供该交互复用同一托管 blob。
- 本 change 不增加云端文件库、文件夹上传或远程 URL 抓取。

## 验收语句

1. 「＋」、文件拖拽和剪贴板图片粘贴产生同一种有序附件草稿；图片与普通文件使用各自的结构化呈现。
2. 纯附件、多附件、首条消息和已有会话发送都可用；正文与全部附件归属原子提交，失败不产生半条消息。
3. 原文件在添加后移动或删除，草稿恢复、历史预览、重试和重新运行仍使用应用托管副本。
4. PNG、JPEG、GIF、WebP 进入 Codex `imagePaths`；普通文件只通过本轮受控副本和 prompt 清单供 Agent 读取。
5. 新增附件 DTO、结构化附件界面、预览响应和附件日志不暴露原始路径、托管路径或本轮附件副本路径，Markdown 本地 URL 安全规则保持不变。
6. 已发送附件的托管 blob 可通过新的草稿引用安全复用，原消息引用保持不变；跨 session 或无权来源不能克隆附件引用。
