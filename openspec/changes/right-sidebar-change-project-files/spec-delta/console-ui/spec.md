# console-ui delta：right-sidebar-change-project-files

本 delta 为 `console-ui` 域新增改动标签、项目文件标签与共用文件内容呈现的行为规格。**新增** Requirement，不替换既有条目。

## Requirement: 验收 #3 结果卡片一步打开当前对话的改动标签
Source: docs/product/pages/main-right-sidebar.md#入口与去向

系统 MUST 让一轮结束结果卡片的「查看」动作直接打开右侧栏并聚焦当前对话唯一的来源改动标签。系统 MUST NOT 先显示类型选择，也 MUST NOT 为同一结果来源重复创建标签。

### Scenario: 从一轮结果查看改动
- GIVEN 当前对话一轮工作结束并显示含改动数量的结果卡片
- WHEN 用户点击「查看」
- THEN 右侧栏打开并聚焦该对话的改动标签，标签内容开始读取累计改动

## Requirement: 验收 #4 改动标签展示对话全程累计改动
Source: docs/product/pages/main-right-sidebar.md#改动标签

系统 MUST 展示相对当前对话开始基线的累计改动。系统 MUST NOT 把最后一步或最后一轮的局部改动冒充为整段对话改动。

### Scenario: 多轮工作后查看累计改动
- GIVEN 同一对话先后两轮分别改动了不同文件
- WHEN 用户在第二轮结束后打开改动标签
- THEN 文件树同时包含两轮相对对话开始基线产生的改动文件

## Requirement: 验收 #5 改动说明不归因于团队成员
Source: docs/product/pages/main-right-sidebar.md#改动标签

系统 MUST 以「这段对话期间，项目发生了这些改动」说明内容范围。系统 MUST NOT 声称这些改动由团队、成员或某个 Agent 造成。

### Scenario: 查看有改动的文件清单
- GIVEN 当前对话存在项目改动
- WHEN 改动标签完成加载
- THEN 顶部说明的主语为项目或这段对话，且说明中没有成员改动归因

## Requirement: 验收 #6 改动标签明确当前工作空间
Source: docs/product/pages/main-right-sidebar.md#改动标签

系统 MUST 使用「项目文件夹」或「独立工作空间」说明正在读取的位置；独立工作空间还 MUST 说明改动位于隔离副本且项目文件夹没有被动过。系统 MUST NOT 显示磁盘路径、`direct`、`worktree` 或「默认工作空间」。

### Scenario: 独立工作空间说明隔离后果
- GIVEN 当前对话使用独立工作空间
- WHEN 用户查看改动标签
- THEN 页面显示「独立工作空间」并说明隔离副本中的改动没有动项目文件夹

## Requirement: 验收 #8 文件内容逐行区分变化
Source: docs/product/pages/main-right-sidebar.md#改动标签

系统 MUST 为新增、删除与未改动行分别呈现可判定的行类型，并保留未改动上下文。系统 MUST NOT 把整个文件仅渲染为一段无变化标记的文本。

### Scenario: 查看同时包含增删的文件
- GIVEN 所选文件包含新增行、删除行与未改动上下文
- WHEN 文件内容读取完成
- THEN 三类行分别带 `addition`、`deletion`、`unchanged` 可观察标记并显示对应行号

## Requirement: 验收 #9 改动与项目文件使用不同清单范围
Source: docs/product/pages/main-right-sidebar.md#项目文件标签

系统 MUST 让改动标签只列改动文件，并让项目文件标签列出包含未改动文件的完整项目树；项目文件中的改动文件 MUST 继续使用同一行级变化呈现。系统 MUST NOT 在改动标签混入未改动文件。

### Scenario: 浏览未改动文件
- GIVEN 项目包含一个改动文件和一个未改动文件
- WHEN 用户分别打开改动标签与项目文件标签
- THEN 改动标签只列改动文件，项目文件标签同时列出两个文件且可读取未改动文件内容

## Requirement: 验收 #10 工作期间披露列表时点并允许手动刷新
Source: docs/product/pages/main-right-sidebar.md#内容更新

系统 MUST 在团队正在工作时说明改动列表截至上一轮结束并提供手动刷新。系统 MUST NOT 把活动运行输出更新当作改动列表的实时订阅。

### Scenario: 团队工作时打开改动标签
- GIVEN 当前对话有成员正在工作
- WHEN 用户查看改动标签
- THEN 页面显示「截至上一轮结束」说明和可用的「刷新」按钮

## Requirement: 验收 #11 三种改动空态使用不同措辞
Source: docs/product/pages/main-right-sidebar.md#改动为空

系统 MUST 分别说明「对话还没有开始」「跑过但文件没有变化」「正在读取」三种状态。系统 MUST NOT 在读取中或对话未开始时下结论称没有改动。

### Scenario: 三种状态依次出现
- GIVEN 用户依次查看未开始的对话、正在读取的已开始对话、已完成且无文件变化的对话
- WHEN 改动标签渲染各状态
- THEN 三种状态的可见文本互不相同，只有最后一种说明文件没有变化

## Requirement: 验收 #20 刷新保持文件阅读位置
Source: docs/product/pages/main-right-sidebar.md#内容更新

系统 MUST 在刷新发现新改动时保留当前选中文件与内容滚动位置，并先显示可点击的新改动提示，由用户决定何时应用。系统 MUST NOT 因刷新自动跳到其他文件、滚动到顶部或抢占当前标签。

### Scenario: 阅读中刷新发现新改动
- GIVEN 用户已选中一个文件并把内容滚动到中部
- WHEN 手动刷新返回新改动
- THEN 原文件与滚动位置保持不变并出现「有新改动」提示，点击提示后才更新内容

## Requirement: 验收 #22 文件内容与路径可选择复制
Source: docs/product/pages/main-right-sidebar.md#弹层与危险操作

系统 MUST 让文件路径和文件内容保持可选择复制，并保持改动与项目文件标签只读。系统 MUST NOT 提供编辑、保存、撤销、回滚、还原或 git 操作控件与文案。

### Scenario: 从文件视图复制证据
- GIVEN 用户已在改动或项目文件标签打开一个文本文件
- WHEN 用户选择路径或正文文本
- THEN 浏览器允许文本选择，页面不存在任何文件写入、还原或 git 操作入口
