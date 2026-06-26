# 任务：add-issue-conversation-runner

## TypeScript 工程脚手架
- [x] 新建 `package.json`（type=module；deps: 无运行时 npm 依赖；devDeps `tsx`、`vitest`、`@types/node`、`typescript`；scripts: `start` / `test` / `typecheck`）
- [x] 新建 `tsconfig.json`（target ES2022、module NodeNext、strict、moduleResolution NodeNext、`include: ["src","tests"]`）
- [x] 更新 `.gitignore` 加入 `node_modules/`、`.state/`

## 纯逻辑模块（含单测）
- [x] `src/config.ts`：硬编码 OWNER/REPO/ISSUE_NUMBER/INTERVAL_MS/AGENT_MD_PATH/TMP_ROOT/STATE_DIR/CODEX_ARGS
- [x] `src/conversation.ts`：`countMessages` / `shouldRespond` / `buildPrompt`
- [x] `tests/conversation.test.ts`：
  - countMessages(0)=1、countMessages(2)=3
  - shouldRespond(1,0)=true、shouldRespond(3,1)=true、shouldRespond(3,3)=false、shouldRespond(2,1)=false
  - buildPrompt('A','B',[])==='A\n\nB'、buildPrompt('A','B',['C','D'])==='A\n\nB\n\nC\n\nD'
- [x] `src/state.ts`：`read()`、`write(s)`（tmp + rename 原子写）
- [x] `tests/state.test.ts`：缺文件默认 0；写后读回一致；并发写后文件可解析

## 外部交互模块
- [x] `src/github.ts`：`fetchIssueWithComments()` 走 `spawn('gh',['issue','view',String(ISSUE_NUMBER),'--repo',`${OWNER}/${REPO}`,'--json','body,comments'])`；`postComment(body)` 走 `gh ... --body-file -` + stdin
- [x] `src/codex.ts`：
  - `run({prompt, runDir})`：spawn codex，stdout/stderr 边流边写文件
  - `extractFinalAssistant(lines: string[]): string | null`：纯函数，宽容匹配多种 type / 字段
- [x] `tests/codex.test.ts`：fixture 多种 type → 取最后一条；混入坏 JSON 行 → 跳过；无 assistant 消息 → null

## 集成
- [x] `src/log.ts`：`log({event, ...fields})` → 单行 JSON
- [x] `src/runner.ts`：main loop（启动立即 tick + setInterval）
- [x] 进程级 unhandled rejection / uncaughtException → 日志后不退出（除非致命）

## 自动化验证
- [x] `pnpm test`
- [x] `pnpm typecheck`
- [x] 符合度检查：确认未使用 `exec` / `execSync` / `shell:true` 拼接外部输入。

## AI 验证流程（无法单测的部分）
> 本组未在本次实施中执行：会真实调用本机 `codex` 并可能向 `tranfu-labs/agent-moebius#1` 发表评论。执行前需确认允许该外部副作用。

- [ ] `pnpm install && pnpm start` 启动后立即看到 `event:trigger,count:1,runDir:/tmp/...` 日志
- [ ] 进 `runDir` 查 `stdout.jsonl` 有完整 codex 流、`stderr.log` 无致命错误
- [ ] GitHub issue 出现机器人评论
- [ ] 在 issue 下手动回一条 → 等下一轮 → 触发 + 新 runDir + 新评论
- [ ] `.state/tranfu-labs-agent-moebius-1.json` 内容 = `{"maxRespondedCount": N}`，N 与最近一次响应的 count 一致

## 文档与配置回填（实现完成后做，归档前做）
- [x] 更新 `AGENTS.md` 的「常用命令」节：填上 `pnpm install` / `pnpm start` / `pnpm test` / `pnpm typecheck`，删掉对应 TODO
- [x] 更新 `AGENTS.md` 的「项目结构」节：加 `src/` / `tests/` / `package.json` / `tsconfig.json`
