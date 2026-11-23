# 桌灵 DeskSprite 原理图设计依据

底板支持 USB-C 供电与串口下载、模拟麦克风、差分扬声器和 ST7789V2 显示接口。结项使用 BK7258 串口采音与 Windows 面板。屏幕规格见[屏幕适配与尺寸](display-selection/screen-selection.md)。

## 图页

1. 系统接口总览：电源、下载、主控、显示和音频之间的电气接口。
2. 电源与下载：USB-C 输入/保护、3.3 V 降压、CH340K。
3. 主控模组：LC-OPEN-BK7258-MOD 两个符号单元及去耦；CEN 无外部连接，P28 用于屏幕 D/C。
4. 显示接口：D200N2407V0 的 10 针接口、电源开关和低有效背光。
5. 语音与播放：ZTS6216、MS8002D、扬声器连接器和 ADC2 回采。

原理图内部用电气导线；跨功能页使用明确网络名。独立中文说明采用默认字体，100 mil（文件单位 0.01 inch，fontSize=10）。本次只操作原理图及嵌入的符号/封装/模型引用。

## 原厂依据

| 电路 | 资料与定位 | 采用要点 |
| --- | --- | --- |
| 模组 | [立创硬件指南](https://wiki.lckfb.com/zh-hans/bk7258md/bk7258-mod/hardware.html)；仓库 BK7258模组设计参考.pdf 第1页 | 3.3 V 供电能力≥500 mA，10 µF+100 nF 去耦，P10/P11 下载；复位内部10 kΩ上拉；65 脚 VDDGPIO 按参考接 1 µF 到地 |
| 显示 | [立创 SPI 文档](https://wiki.lckfb.com/zh-hans/bk7258md/basic/spi.html)；参考PDF第5页 | GPIO2 CLK、3 CS、4 MOSI、5 DC、12 RESET、13电源高有效、25背光低有效。参考图的LCD_MISO实际是DC |
| 降压 | [Diodes AP63200/01/03/05 DS41326 Rev.3-2](https://www.diodes.com/datasheet/download/AP63200-AP63201-AP63203-AP63205.pdf)，p2、p9 Fig.21、p13 Table2 | AP63203固定3.3 V；FB直接取样；Cin10 µF、Cout2×22 µF、BST100 nF；推荐L3.9 µH，额定电流≥2.7 A |
| 功放 | [MSKSEMI MS8002D](https://datasheet.lcsc.com/datasheet/pdf/8da8c14dddcecc086d6a5db6fa317138.pdf?productCode=C42403122)，p2–5 | SD高电平关断；IN+偏置电阻接BYPASS；OUTP反馈IN−；3.3 V下不标称2.8 W |
| 麦克风 | [ZillTek ZTS6216 DS-1.4](https://atta.szlcsc.com/upload/public/pdf/source/20200316/C481302_3CBECE2A7DED4DFD53CEA082844189F4.pdf)，p1–3 | 1OUT/2,3GND/4VDD；1.5–3.6 V；输出隔直；避免麦克风邻近使用有压电效应的Class2介质电容 |
| 屏电源 | [AEROSEMI MT9700 Rev.2.1](https://datasheet.lcsc.com/datasheet/pdf/214b1e75ea8422f7136f2495299ed3e9.pdf?productCode=C42441843)，p1–3、p5–6 | 1OUT/2GND/3SET/4EN/5IN；EN高有效；输入输出10 µF；RSET6.8 kΩ对应典型1 A（0.75–1.25 A） |
| 串口 | [WCH CH340DS1 3C](https://atta.szlcsc.com/upload/public/pdf/source/20240313/4FD4567B6A986AE079C4960D6CEBDDB5.pdf)，p1–3、p5；[WCH产品页](https://www.wch.cn/products/CH340.html) | CH340K 3.3 V模式，VCC7和V3/10并接3.3 V；GND3必接、裸焊盘0；USB数据线不额外串联电阻；UART串100 Ω |

## 待实物确认

- D200N2407V0 背光的额定电流与正向压降；10 Ω仍为参考取值。FPC 应按 1 脚对 1 脚、金手指朝插座触点安装，折叠空间和显示初始化须结合实物确认。
- USB主机/电源的可用电流和整机峰值；3.3 V/2 A为板上电源设计能力，不等于USB口已授权2 A。
- 音频直流工作点、增益、ADC2回采幅度、声学效果及固件适配。
- 采购模组版本与参考图一致性。当前 65 脚为 VDDGPIO，按参考接 1 µF 对地去耦；此前 VIO 名称与 4.7 µF 说明混用已纠正。

## 实际选型与交付

- L1 采用顺络 MWSA0503S-4R7MT，4.7 µH，替代 AP63203 表格推荐的 3.9 µH。它位于手册允许的约 2.2–10 µH 范围内；5 V→3.3 V、1.1 MHz、2 A 时计算纹波约 0.217 A、峰值约 2.109 A。电感表列典型 Isat=4.6 A、Irms=4.5 A，DCR 最大 60 mΩ；没有把典型值当保证最小值。资料：[顺络 MWSA 系列](https://www.alfatec.de/fileadmin/productfiles/datasheets/sunlord_mwsa_s_series.pdf)，MWSA0503S 参数表；负载瞬态仍待验证。
- C6、C7 使用 22 µF / 25 V / 0805，以保留直流偏压后的有效容量。C16 使用 TDK C3216C0G1H104JT000N，100 nF / C0G / 1206，避免在麦克风近端使用 Class 2 介质；1 µF 隔直电容保留官方模组参考取值，并标明远离麦克风。其余常规阻容采用 0603 英制。
- USB-C 为 5 V 受电端，两个 CC 各接 5.1 kΩ；没有 PD 协商或 CC 电流档位检测。烧录采用 CH340K，取消复位键后可用断电重上电复位；没有 RTS/DTR 自动复位连接。
- 显示接口：AFC34-S10FIA-00，10 针、0.5 mm、下接触、适配 0.30 mm FPC。配套 D200N2407V0（D200FPC2407-A）屏幕；引脚 1–10 为 LEDK/GND、LEDA/LCD_BLA、GND、LCD_3V3、GND、LCD_SCK、LCD_RST_N、LCD_CS_N、LCD_MOSI、LCD_DC。11/12 为固定焊脚，接地。原生网表已经逐针核对；封装和模型引用沿用原 J2。完整规格及资料来源见 [屏幕适配记录](display-selection/screen-selection.md)。
- 按当前 PCB 位置重新分配控制 GPIO：屏复位 P1 / 模组11脚，屏电源 P25 / 9脚（高有效），DC P28 / 10脚，背光 P9 / 13脚（PWMG0_PWM3，低有效）；音频电源 P15 / 29脚（高有效），功放关断 P14 / 28脚（高有效）。这些均为外圈引脚，原内部 P12/P13 继续不使用。SPI1 仍为 P2/P3/P4，UART0 仍为 P10/P11。完整表见 [当前引脚规划](pin-plan/20261114/review.md)。
- 固件需采用 [最新引脚表](pin-plan/20261114/firmware-pins.json)，将 GPIO25 从 PWM5 释放为静态使能，并显式把 PWM3 映射至 GPIO9；普通输出解除旧 UART1/SDIO/SPI0 等复用。PWMG0 通道2/3共用计数器，当前保持通道2禁用。关断音频时先 SD 高，再将 GPIO 设为无上下拉高阻，最后断功放电源；屏断电前将相关 GPIO 置低或高阻。取消板载按键依赖。
- C10 按模组参考图 65 脚 VDDGPIO 的 1 µF 取值，采用 CL10A105KB8NNNC / C15849，绑定 0603 封装和对应模型。原稿将该节点命名为 VIO，并套用 VIO 的 4.7 µF 说明，现已纠正。SW1/SW2、C11/C12、R5 已删除；当前对话触发入口由 Windows 上位机提供。

交付五页原理图、62 个实体器件、51 个网络；保留器件均有封装及 3D 模型引用，C10 使用工程内匹配的器件、相同焊盘和模型。未逐一验证模型的实体几何尺寸。使用全局网络关联的平面分页，总览有实际电气引脚，未宣称已经建立真实层次图页实例。

四个功能页通过原生 ERC，完整五页保留 B1–B4 虚拟模块的四条无封装提示。独立审计没有发现阻断性电气连线错误。检查结果和预览见 [引脚复核](pin-plan/20261114/review.md)。
