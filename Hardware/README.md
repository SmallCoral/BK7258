# 桌灵硬件归档

用嘉立创 EDA 专业版打开 [桌灵 DeskSprite 工程](<桌灵 · DeskSprite/桌灵 · DeskSprite.eprj3>)。工程包含五页原理图、PCB 和拼板。移动工程时保留整个工程目录。

| 文件 | 内容 |
| --- | --- |
| [BOM](design/BOM.csv) | 62 个实体器件 |
| [设计依据](design/design-intent.md) | 电源、串口、麦克风、功放及显示选型依据 |
| [屏幕和 FPC](design/display-selection/screen-selection.md) | D200N2407V0 尺寸、线序与 AFC34-S10FIA-00 插座规格 |
| [引脚表](design/pin-plan/20261114/firmware-pins.json) | 原理图 GPIO、背光 PWM 及有效电平 |
| [引脚复核](design/pin-plan/20261114/review.md) | GPIO、审计及原理图预览 |

## 版本核对

结项保留 GitHub 提交 `4d6bf4e` 中最新的 PCB 与工程索引。读取 PCB 的 U1 焊盘网络，确认屏幕电源、复位、D/C、背光、功放电源及关断六项与修订原理图一致。该核对仅覆盖六条控制网，制板版本、其余网络和 DRC 需结合实际工程确认。

固件中的 LCD 诊断仍按早期 PCB 使用 P7 屏电源、P6 复位、P5 D/C 和 P25 背光。最新工程使用 P25 屏电源、P1 复位、P28 D/C 和 P9 背光。样机 LCD 测试中屏幕与背光未亮，结项使用 Windows 面板。[固件说明](../Firmware/voice-bringup/README.md)

J2 的 10 针排线应同时核对 1 脚方向和插座触点。R9 的 10 Ω 是参考值，背光电流尚待实测。J3 两脚为功放差分输出，扬声器跨接两脚，禁止将任一端接地。图纸的扬声器选型是 8 Ω、至少 1 W。
