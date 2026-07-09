# 任务：marketeam-landing-page

- [ ] 建 `sites/marketeam/index.html` 骨架：`.app` 容器 + CSS mesh 渐变背景 + Google Fonts 引入 + 关键色变量
- [ ] Header：内联 SVG 品牌标 + 4 nav（hover scaleX 下划线）+ Log In + Join Now 药丸按钮（左滑紫填充 + `@property` 旋转 conic 描边）
- [ ] Hero 左：打字机标题（前 67 字黑/其余白 + 紫光标）、Start Project 按钮（右滑填充 + 旋转描边，3.2s 后现）、David 光标徽章（3.6s 后现）
- [ ] Hero 右：4 条同心旋转轨（353/501/649/797，速度方向按规格）+ 1px 渐变描边 mask + 中心 20k+ count-up（反向自转正立）+ Specialists
- [ ] 9 头像：按位置/尺寸/形状/光晕定位 + 错峰 fly-in（0.6→2.3s）；占位 = 光晕色渐变卡 + 首字母；`data-name/role/prompt` 挂载
- [ ] 头像 hover 标注框：姓名·角色 + 提示词全文 + 复制按钮；窄屏内翻不溢出视口
- [ ] 底部 ticker：5 个内联 SVG 合作方标 ×4 无缝左滚 20s + 左右渐隐 mask
- [ ] 入场动画（header/hero 左/圆环/ticker 错峰）+ 四档响应式断点（1280/1024/768/480）
- [ ] AI 验证：playwright 开页面截全屏、等动效落定截图、触发某头像 hover 抓 tooltip 文本与复制按钮、1024/768/480 各截一张
