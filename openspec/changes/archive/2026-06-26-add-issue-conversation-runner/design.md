# 设计：add-issue-conversation-runner

## 方案

### 模块切分
```
src/
  config.ts          # 硬编码常量（REPO/ISSUE/INTERVAL/AGENT_MD_PATH/TMP_ROOT/STATE_DIR/CODEX_ARGS）
  conversation.ts    # 纯函数：countMessages / shouldRespond / buildPrompt — 主要单测对象
  state.ts           # .state/<key>.json 的原子读写（tmp + rename）
  github.ts          # spawn 调用 gh CLI：fetchIssueWithComments / postComment
  codex.ts           # spawn 调用 codex --json，stdout/stderr 落盘，提取最终 assistant 文本
  log.ts             # 单行 JSON 结构化日志
  runner.ts          # 常驻 main：启动立即跑一轮，setInterval 轮询，串联各模块

tests/
  conversation.test.ts
  codex.test.ts      # 用 fixture 测 extractFinalAssistant
  state.test.ts
```

### 核心逻辑（runner.ts）
```
启动: log{event:start, config}; tick(); setInterval(tick, INTERVAL_MS)

tick():
  try:
    issue   = await github.fetchIssueWithComments()       # gh issue view ... --json body,comments
    count   = countMessages(issue.comments.length)        # 1 + N
    state   = await state.read()                          # { maxRespondedCount: number }
    if not shouldRespond(count, state.maxRespondedCount): # 奇数 && count > maxResponded
      log{event:skip, count, maxResponded}; return
    runDir  = mkRunDir()                                  # /tmp/moebius-<ISO>-c<count>/
    log{event:trigger, count, runDir}                     # ← runDir 必须打印
    agentMd = await readFile(AGENT_MD)
    prompt  = buildPrompt(agentMd, issue.body, issue.comments.map(c => c.body))
    result  = await codex.run({prompt, runDir})           # spawn codex，stdout/stderr 落 runDir
    if not result.ok:
      log{event:codex-failed, runDir, reason: result.reason}; return  # 不发评论、不推进状态
    await github.postComment(result.finalText)            # gh issue comment ... --body-file -
    await state.write({maxRespondedCount: count})
    log{event:commented, count, runDir}
  catch e:
    log{event:cycle-error, error: String(e)}
```

### Shell 注入防护（满足 AGENTS.md MUST NOT）
- 全部走 `child_process.spawn(cmd, args[], opts)`，**禁用** `exec` / `execSync` / `shell:true`。
- prompt 作为 codex 的最后一个 argv 项传入；评论 body 用 `gh ... --body-file -` 走 stdin。
- 没有任何外部输入进入 shell 解析。

### codex --json 输出解析
- 边流边把每行 stdout 追加写到 `${runDir}/stdout.jsonl`。
- 进程退出（code 0）后读 jsonl，逐行 `JSON.parse`：
  - 坏行（非 JSON）→ 跳过、不抛。
  - 收集所有看起来像「assistant 消息」的事件（兼容 `type` 为 `agent_message` / `assistant_message` / `message`，文本字段为 `message` / `content` / `text`）。
  - 真实运行确认 `codex-cli 0.130.0` 会输出 `{"type":"item.completed","item":{"type":"agent_message","text":"..."}}`；解析器必须递归检查 `item` / `data` 里的嵌套消息，否则会误判为 `no-final-message`。
  - 取最后一条的文本即为 `finalText`；一条都没找到 → `{ ok: false, reason: 'no-final-message' }`。
- `extractFinalAssistant(lines: string[]): string | null` 作为纯函数 export 到 `codex.ts`，由 `tests/codex.test.ts` 测。

### 真实运行修复记录
- 第一次真实运行目录：`/tmp/moebius-2026-06-26T15:35:17.148Z-c1`。
- 现象：codex 已产出 `item.completed` / `item.type=agent_message` / `item.text`，但旧解析器只看顶层 `type`，runner 记录 `event:codex-failed`、`reason:no-final-message`，未发评论、未推进状态。
- 修复：`extractFinalAssistant` 递归识别 `item` / `data` 中的 assistant message，并新增 `tests/codex.test.ts` 用例覆盖 `item.completed`。
- 第二次真实运行目录：`/tmp/moebius-2026-06-26T15:38:06.796Z-c1`。
- 验证：runner 记录 `event:commented,count:1`；GitHub issue 产生评论 `https://github.com/tranfu-labs/moebius/issues/1#issuecomment-4811069305`；`.state/tranfu-labs-moebius-1.json` 推进到 `{"maxRespondedCount":1}`。

### 状态持久化
- 文件：`./.state/tranfu-labs-moebius-1.json`，内容 `{ "maxRespondedCount": number }`。
- 读取：缺文件 → `{ maxRespondedCount: 0 }`；JSON 解析失败 → 抛错（由 runner.catch 接住）。
- 写入：先写 `<file>.tmp`，再 `fs.rename` → `<file>`，保证原子性（避免半写文件）。
- `.gitignore` 加入 `.state/`。

### 配置（硬编码常量，集中于 config.ts）
```
OWNER         = 'tranfu-labs'
REPO          = 'moebius'
ISSUE_NUMBER  = 1
INTERVAL_MS   = 5 * 60 * 1000
AGENT_MD_PATH = 'agents/product-manager.md'
TMP_ROOT      = '/tmp'
STATE_DIR     = '.state'
CODEX_ARGS    = [
  'exec','--ephemeral','--yolo','--json',
  '-m','gpt-5.5',
  '-c','service_tier="fast"',
  '-c','features.fast_mode=true',
  '-c','model_reasoning_effort="xhigh"',
]
```
> 注意：用户原样给的命令是 `-c service_tier='"fast"'` 这种 shell 引号嵌套，**仅是 shell 层的转义**；到 codex argv 实际是字符串 `service_tier="fast"`。spawn 传 argv 时直接给这个字符串即可，无需再加外层引号。

### 触发逻辑直观表
| 场景 | comments | count | 奇数? | shouldRespond? |
|---|---|---|---|---|
| 新 issue，无人回复 | 0 | 1 | ✓ | ✓（首轮触发） |
| AI 已回复 1 次 | 1 | 2 | ✗ | ✗ |
| 用户回复 1 次 | 2 | 3 | ✓ | ✓ |
| AI 再回复 | 3 | 4 | ✗ | ✗ |

## 权衡

### gh CLI vs 直接 REST API
选 gh CLI：避免在脚本里管理 token，复用本机 `gh auth login`，仓库不需要任何密钥。代价是依赖 gh 二进制存在。

### tsx vs ts-node vs build 成 JS
选 tsx：启动快、零编译、ESM 原生支持好，未来要写测试时与 vitest 衔接顺畅。代价是引入开发依赖。

### 状态持久化用文件 vs 用 issue label / GitHub 自身
选本地文件：实现最简、可在离线 / 调试时还原；缺点是换机器跑会重置状态。当前是单机常驻进程，可接受。

### 失败时是否发"出错"评论
不发。代价是失败对外不可见，但避免增加评论数→改变 count 奇偶→污染对话节奏。日志 + `/tmp` runDir 保留原始排查信息。

### 启动时是否立即跑一轮
立即跑。否则首次部署后用户最长要等 5 分钟才看到反应，且首轮已经是奇数（count=1）时不立即响应没有意义。

## 风险

- **codex --json 事件结构未确认**：不同版本 codex 的事件 `type` 字段名可能不同。回滚 / 应对：`extractFinalAssistant` 写成宽容匹配（多 type、多文本字段），且 `stdout.jsonl` 保留全量，未匹配上时 log 里能立刻看到原始输出去调整。
- **codex 安装与 PATH**：本机未装 codex → `spawn` ENOENT → 进 catch、日志 `cycle-error`；不会损坏状态。
- **gh 未登录**：第一次 `gh issue view` 解析失败 → 进 catch；不推进状态。
- **同一 count 上 codex 输出不同**：每轮触发都是新的 codex 调用，结果可能因模型行为不同而不同；当前不重试，第一次结果即评论。如果质量不稳定，再加重试 / 多次采样。
- **issue 一直没人回**：count 维持偶数，shouldRespond 始终 false，无任何动作（即"等待"），符合预期。
