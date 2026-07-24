# 设计：fix-angle-bracket-role-comments

## 方案
在 `src/conversation.ts` 内保持评论格式化与解析为纯业务逻辑：

1. `formatAgentComment(role, finalText)` 生成：

   ```md
   &lt;role&gt;:
   ${LAST_RESPONSE}

   <!-- moebius:role=<role> -->
   ```

   GitHub 页面会把 `&lt;` / `&gt;` 渲染为可见尖括号。

2. 新增 role envelope 解析辅助逻辑，让归一化时能识别并剥离：
   - `role:\n...`
   - `&lt;role&gt;:\n...`
   - `<role>:\n...`

3. metadata 仍是优先可信来源。若 metadata role 存在且是本地 agent，则按 metadata role 归类；剥离正文时兼容上述三种 envelope。

4. 无 metadata 的历史 comment 仍按 legacy 前缀兼容：只要前缀能解析到本地 agent，就归类为该 agent。

## 权衡
选择 HTML entity 而不是 raw `<role>:`，是因为 GitHub Markdown 会把 raw angle tag 当作 HTML 处理，不能可靠显示。选择继续兼容 `role:`，是为了不破坏已有 #4 这类历史评论。

不改变隐藏 metadata 格式，因为它已经能表达 role，且不会直接影响页面可读性。可见前缀只负责人类和模型可读，metadata 负责机器识别。

## 风险
- 如果某个 agent 名称未来包含当前 mention 规则以外的字符，需要同步扩展 role 正则；当前 agent 文件名规则仍是小写字母、数字和短横线。
- 旧评论若用户伪造 metadata 且 role 存在，仍会被视作 agent comment；这是既有协议风险，本次不扩大。
