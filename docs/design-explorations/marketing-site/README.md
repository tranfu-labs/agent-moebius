# marketing-site 设计探索稿

本目录收纳营销落地页在正式采纳前的**视觉风格探索稿**，均为独立的自包含单文件
HTML 原型，用于比较不同美术方向。它们**不是**、也不会被当作 `sites/marketeam/index.html`
的替代品——后者受 `openspec/specs/marketing-site/spec.md` 约束（必须如实呈现
moebius 的真实角色/流程，不能出现虚构功能或数字）；本目录里的稿子用的是
通用的"Moebius 多 agent 协作流水线"概念文案与演示数据（例如"调研三个竞品"），
和 moebius 项目的真实事实源无关，仅作风格参考，不满足上述 spec。

每个 `.html` 配一份同名 `.md`：把该页面的视觉呈现、结构、文案、动效行为转译成
自然语言描述（类似网页无障碍朗读的效果），方便无法直接渲染 HTML/Canvas/内联
图片的读者（包括其他 LLM）快速了解"这个页面长什么样、说了什么、会怎么动"，
不必解析源码。

| 文件 | 说明 |
|---|---|
| `style-b-mosaic.html` / `.md` | 灰阶马赛克风格：低饱和灰阶网格 + 陶土橙强调色，核心视觉是 Canvas 绘制的 agent 关系图与滚动驱动的"重组"动画 |
| `style-c-pixel.html` / `.md` | 复古像素/终端风格：暖色像素游戏配色 + 深色终端窗口打字机日志，Hero 配一张像素风机器人流水线插画 |

若后续要把某个方向落地为正式站点，需先按 `openspec/specs/marketing-site/spec.md`
的业务规则重写文案与数据（如实反映 moebius），再合并进
`sites/marketeam/index.html`，而不是直接搬运本目录文件。
