# 桌灵 BK7258 联调固件

固件经 USB 串口提供设备状态和板载麦克风录音。Windows 上位机负责中文识别、指令执行和语音回复。J3 保留两段诊断提示音。

## 构建

在 Linux 或 WSL 中按 [Beken 构建环境说明](https://docs.riselink.ai/arminodoc/bk_avdk_smp/smp_doc/bk7258/zh_CN/v3.1.1/get-started/env-manual.html)安装依赖。使用 Beken SMP SDK v3.1.1.9 的[固定提交](https://github.com/bekencorp/bk_avdk_smp/tree/c3b560f3b972db7bf3883edaffa3b49060a865cd)、GNU Arm Embedded Toolchain 10.3-2021.10 及 Python 3。脚本会核对 SDK 提交。输出目录放在 Linux 文件系统中。

```bash
git clone -b release/v3.1.1.9 https://github.com/bekencorp/bk_avdk_smp.git
git -C bk_avdk_smp checkout c3b560f3b972db7bf3883edaffa3b49060a865cd
python3 Firmware/voice-bringup/build.py ./bk_avdk_smp /path/to/build-work \
  --toolchain /path/to/gcc-arm-none-eabi-10.3-2021.10/bin
```

镜像输出到构建目录下的 `desksprite_voice/build/bk7258/desksprite_voice/package/all-app.bin`。脚本使用 3060 KiB AP 分区。两段 WAV 是编译输入，脚本将其转换为板端提示音数组。

## 烧录及联调

1. 使用带数据线的 USB-C 接入电脑，在设备管理器中查找 CH340K 对应的 COM 号。烧录时关闭上位机和其他占用该串口的程序。
2. 使用[立创提供的 BKFIL](../../Document/立创·实战派BK7258/1、官方烧录工具/BKFIL_windows_4.1.2.260525141.zip)，核对 BK7258、Flash 容量和分区，备份现有 Flash，按所用烧录工具的流程写入已构建镜像。BKFIL 4.1.2 CLI 按 4 KiB 扇区处理，使用 CLI 时保持末尾扇区中镜像范围之外的数据。
3. 通过断电重上电进入下载或重启流程，串口运行参数为 115200 8N1。命令以回车换行结尾。

| 串口命令 | 用途 |
| --- | --- |
| `ap_cmd voicecheck` | 返回采音与播放状态 |
| `ap_cmd voicecheck record` | 采集四秒的 8 kHz 无符号 8 位单声道 PCM，共 32,000 个采样点 |
| `ap_cmd voicecheck play` | 测试 J3 诊断提示 |
| `ap_cmd voicecheck play goodbye` | 播放第二段诊断提示 |

录音以 `BOARD_PCM_START` 开始，`BOARD_PCM` 记录携带字节偏移和 Base64 数据，由 `BOARD_PCM_END` 结束。上位机校验偏移和长度，再转换为 16 kHz 单声道 WAV。

`ap_cmd lcdcheck` 是早期 PCB 的诊断入口，使用旧版屏幕控制引脚。最新 EDA 工程的引脚参见[硬件归档](../../Hardware/README.md)。使用最新 PCB 时需先适配引脚，再单独复测屏电源、复位和背光。结项版本使用 Windows 面板显示。
