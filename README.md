# NoxFlash Magnetar

NoxFlash 是 Windows 创作画布。新用户可从 Releases 下载并运行 Windows 安装包。现有 Magnetar 用户可在软件内点击立即更新。

此项目基于 NoxFlash Canvas。原项目与作者见 [GODKIDZ1118/NoxFlash-Canvas](https://github.com/GODKIDZ1118/NoxFlash-Canvas)。内置第三方作品的署名和许可随文件保留。

维护工具入口为 `NoxFlash更新工具.cmd`。在完整的 NoxFlash Windows 程序目录运行，需 Node.js、Python 3.12、Git 和 NSIS。工具按清单复制程序文件，安装包放在程序目录旁的 `NoxFlash-Magnetar-Releases`。发布使用 Git Credential Manager 当前会话。发布签名密钥保存在维护者本机的 `%LOCALAPPDATA%\NoxFlashPublisher`，后续版本需沿用这把密钥。

本仓库包含可编辑代码。安装包中的 Electron 与现有后端 EXE 通过发行附件提供。当前后端 EXE 尚无可重复构建入口。
