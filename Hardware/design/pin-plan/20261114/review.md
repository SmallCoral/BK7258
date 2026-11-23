# 桌灵屏幕与功放 GPIO

2026-11-14 修订原理图时调整六条控制网。2026-11-23 复核归档 PCB 的 U1 焊盘网络，确认这六项与修订原理图一致。实际制板版本及 DRC 结论需以完整 EDA 工程为准。

| 网络 | 旧版 GPIO | 修订 GPIO | U1 模组焊盘 | 有效电平 |
| --- | --- | --- | --- | --- |
| LCD_PWR_EN | P7 | P25 | 9 | 高 |
| LCD_RST_N | P6 | P1 | 11 | 低 |
| LCD_DC | P5 | P28 | 10 | 随命令和数据切换 |
| LCD_BL_N | P25 / PWM5 | P9 / PWMG0 通道 3 | 13 | 低 |
| AMP_PWR_EN | P8 | P15 | 29 | 高 |
| AMP_SD | P23 | P14 | 28 | 高 |

SPI1 仍用 P2/P3/P4，下载 UART0 仍用 P10/P11。J2 的 1–10 脚按 [D200N2407V0 线序](../../display-selection/screen-selection.md)连接，已核对最新 PCB 的全部 12 个焊盘网络。

P25 在新版为静态屏电源使能。映射背光时，PWMG0 通道 3 选择 GPIO9，通道 2 与通道 3 共用计数器。屏幕断电前禁止信号输出，上电时先关背光并保持复位。功放上电前先置 SD 高电平关断。当前固件的 LCD 诊断仍按旧版控制脚编译。[GPIO 机器可读表](firmware-pins.json) · [固件说明](../../../../Firmware/voice-bringup/README.md)

修订时导出的原理图网表包含 62 个实体器件、4 个总览虚拟模块、294 个引脚和 51 个网络。ERC 保留 4 条虚拟模块缺少封装提示。以下文件记录当时的原理图检查。

- [主控原理图](page-3.png) · [显示接口原理图](page-4.png)
- [逐针核对](verification.json) · [导出网表](netlist-rendered.json) · [ERC](erc.json) · [独立审计](independent-audit.json)
