# 硬件目录

原理图已保存到 [桌灵 · DeskSprite 工程](<桌灵 · DeskSprite/桌灵 · DeskSprite.eprj3>)，共五页：系统接口总览、USB与电源、主控模组、显示接口、采音与播放。原工程空白页已备份在 `design/backups/2026-11-14-before-schematic/`。

设计采用 BK7258 模组、USB-C 供电与 CH340K 串口烧录、D200N2407V0 显示屏、模拟麦克风和差分功放。2026-11-14 已取消板载复位键、对话键及 C11/C12/R5，并将 65 脚更正为 VDDGPIO、C10=1 µF；当前共 62 个实体器件。屏幕为 2 英寸、240×320、ST7789V2、无触摸版本，屏体 34.6×47.8×1.9 mm。

- [工程报告与检查结果](<桌灵 · DeskSprite/project-report.md>)
- [BOM（62个实体器件）](design/BOM.csv)
- [最新无按键版与 VDDGPIO 纠正记录](design/remove-buttons/20261114/review.md)
- [设计依据及原厂资料](design/design-intent.md)
- [所选屏幕、尺寸图与最终接口定义](design/display-selection/screen-selection.md)
- [当前 GPIO 引脚优化：屏幕 P25/P1/P28/P9，音频 P15/P14](design/pin-plan/20261114/review.md)
- [固件引脚表](design/pin-plan/20261114/firmware-pins.json)
- [当前主控原理图](design/pin-plan/20261114/page-3.png)
- [当前显示接口预览](design/pin-plan/20261114/page-4.png)
- [最新独立网表审计](design/pin-plan/20261114/independent-audit.json)

2026-11-14 显示适配：原生网表与独立审计均确认 J2 线序正确，只有 J2 的 1–10 脚网络改变。最新 ERC 保留四条虚拟模块无封装提示，未再报告栅格警告。背光 R9 暂留 10 Ω，仍需按屏幕背光额定电流或实测结果定值；实物供电、音频和显示初始化未验证。先前全图复核及修复历史见 [17:32 复核报告](design/reviews/20261114173243/review.md)。

原厂参考原理图保留在 [Document](../Document/立创·实战派BK7258/3、参考原理图/) 中。采购规格与待验证事项见 [当前方案](../docs/PROJECT_PLAN.md) 和 [决策记录](../docs/DECISIONS.md)。

当前 GPIO 分配按用户现有 PCB 位置调整，六条控制网络相关的直线交点由 44 降至 10（引脚规划模型，非实际布线保证）。PCB 文件保持用户原样，尚未同步这次引脚变化；更新原理图到 PCB 及实际布线由用户处理。固件需采用新的 GPIO 配置，背光使用 GPIO9/PWM3，GPIO25 改为静态屏电源使能。
