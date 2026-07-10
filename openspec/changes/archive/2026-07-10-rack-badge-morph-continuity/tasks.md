# 任务：rack-badge-morph-continuity

- [x] CSS：`.morph-surface`（面板同款空面）、`.morph-ghost`（幽灵容器+双子层定位）、`.rack-modal.is-morphing .badge` 隐藏；fly-layer 保留
- [x] JS：重写 morph()——测量（真工牌 rect / 面板 rect / 架上姿态）、建变形面（插 overlay 与 sheet 之间）、建幽灵（A/B 双内容）、多条 WAAPI（幽灵移/A淡/B淡/头像收敛/亮度、面移/面淡、面板内容淡），开/关各自节奏表
- [x] JS：两拍编排（二轮用户反馈补充）——打开=拿起（上抬/前移/转正/微放大提亮，settle 缓动）+入窗（emphasized 缓动）；关闭=离窗（accelerate）+放回（settle）；关键帧同构 transform 列表、分段缓动写在关键帧上
- [x] JS：起降帧对齐——fly-layer 透视按 .rack 实测 inline、mask 透明度 α 起/末帧渐变、hover 亮度并入拿起提亮
- [x] JS：open/close 编排接 is-morphing 状态类与像素级换装时机；防重入/降级/焦点/清理沿用
- [x] 验证：状态断言（开/关/防重入/清理/焦点）+ 无双卡断言（变形全程真工牌 visibility=hidden）+ 落点对齐断言（seek 99.6% 四维差 0.00px）+ 慢放逐帧目检（15%/38% 拿起、37%/64% 入窗交叉淡化、60% 落定前）+ 实时速度开合两轮 + console 无页面错误
