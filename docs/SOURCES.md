# 资料索引

归档日期：2026-11-13。以下区分原始本地资料、用户提供的附件和参考链接。文件校验值见 [FILE_MANIFEST.json](FILE_MANIFEST.json)。

## 原有项目资料

- [官方烧录工具 BKFIL](../Document/立创·实战派BK7258/1、官方烧录工具/BKFIL_windows_4.1.2.260525141.zip)
- [20 个示例工程 demo.zip](../Document/立创·实战派BK7258/2、参考历程/demo.zip)
- [小智拉取说明](../Document/立创·实战派BK7258/2、参考历程/小智拉取说明.txt)
- [BK7258 模组设计参考](../Document/立创·实战派BK7258/3、参考原理图/BK7258模组设计参考.pdf)
- [AIDK AI 玩具开发板原理图](../Document/立创·实战派BK7258/3、参考原理图/AIDK_AI玩具开发板_原理图.pdf)
- [GPIO 寄存器表](../Document/立创·实战派BK7258/4、GPIO寄存器表/BK7258_GPIO_REG.xlsx)

两个原理图是不同硬件方案，不能将双屏玩具板的外围配置视为立创裸模组自带。

## 用户提供的手台附件

这些附件来自用户在本对话中指定的文件，原件保留在下载目录，仓库内存放副本。它们属于已停止推进的无线电研究方向。

- [UV-K1-2 中文说明书](../Document/参考资料/UV-K1/UV-K1-2中文说明书.pdf)
- [UV-K1(8) 固件](<../Document/参考资料/UV-K1/UV-K1(8)固件.rar>)
- [UV-K1(8) 写频软件](<../Document/参考资料/UV-K1/UV-K1(8)写频软件.rar>)

调研时逐页阅读 11 页说明书、检查两个压缩包的目录。固件包只有二进制固件，写频软件包只有安装程序；没有发现源码或写频协议说明。未运行安装程序或给手台刷机。

## 用户给出的项目网站

- [立创 BK7258 文档主页](https://wiki.lckfb.com/zh-hans/bk7258md/)
- [立创 BK7258 项目页](https://lckfb.com/project/detail/lc-open-bk7258-mod?param=baseInfo)
- [开源硬件项目页](https://oshwhub.com/li-chuang-kai-fa-ban/project_gwvxztxf)：本次读取受访问限制，未作为已读内容引用。

## 已用于方案调研的官方与项目文档

- [芯片能力](https://wiki.lckfb.com/zh-hans/bk7258md/bk7258-mod/chip-description.html)
- [硬件与电源设计](https://wiki.lckfb.com/zh-hans/bk7258md/bk7258-mod/hardware.html)
- [开发环境](https://wiki.lckfb.com/zh-hans/bk7258md/basic/programming-environment-setup.html)
- [内存区域](https://wiki.lckfb.com/zh-hans/bk7258md/advanced-guide/ram-regions.html)
- [AP/CP 架构](https://wiki.lckfb.com/zh-hans/bk7258md/advanced-guide/ap-cp-architecture.html)
- [Beken 小智参考工程](https://gitee.com/bekencorp/smp_ai_xiaozhi)
- [Beken 小智中文说明](https://gitee.com/bekencorp/smp_ai_xiaozhi/blob/main/README.zh.md)
- [Beken SMP SDK](https://github.com/bekencorp/bk_avdk_smp)
- [小智服务端候选](https://github.com/xinnan-tech/xiaozhi-esp32-server)：社区项目，BK7258 协议兼容性待联调。
- [psutil 文档](https://psutil.io/)

线上资料可能更新，本仓库保留的是本次讨论的结论。调研没有完成硬件实测，也未固定远端项目的具体提交版本。
