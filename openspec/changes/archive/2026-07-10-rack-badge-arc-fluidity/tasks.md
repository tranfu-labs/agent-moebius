# 任务：rack-badge-arc-fluidity

- [x] CSS：`.mg-y`/`.mg-spin` wrapper 定位与 preserve-3d 链；遮罩 backdrop-filter 移入 `.rack-modal.is-settled` 并加 transition
- [x] JS：makeGhost 改三层 wrapper 结构（ghost/X、mg-y/Y、mg-spin/旋转缩放）
- [x] JS：morph() 重写为单段时长（开 600ms/关 380ms）+ 分轴并行曲线（X 连续 / Y 抛物弧 / spin 前重），淡化全换 ease-in-out，变形面延迟单曲线
- [x] JS：open/close 编排接 is-settled（落定加、关闭起手摘、降级路径直加）
- [x] 验证：速度采样断言——开/关水平速度剖面均为「起步升至峰值→单调衰减落定」，无中途低谷回升（上一版两拍在拼接点速度≈0）；落点对齐（最内层盒四维差 0.00px）；is-settled/blur 渐入、状态/焦点/清理断言；25% 弧线中帧目检；console 无页面错误
