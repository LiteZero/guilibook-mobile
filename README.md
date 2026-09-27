# 贵礼簿 · 电子人情账本

这是一个纯 HTML、CSS、JavaScript 的移动端优先单页应用，复刻参考 PDF 中的电子礼簿产品视觉和核心流程。手机端采用单列卡片、底部导航和抽屉式录入表单，桌面端会自动扩展为宽屏布局。

## 使用

直接打开 `index.html` 即可使用。数据会以 JSON 字符串保存在当前浏览器的 `localStorage` 中。

页面支持：

- 收礼、送礼记录的新增、编辑、删除和搜索
- 自动统计收礼总额、送礼总额、往来净额和亲友人数
- 按亲友计算“别人差我 / 我差别人”的礼金差额
- JSON 备份与导入恢复
- 导出 Excel 兼容的 `.xls` 文件

## JSON 持久化

浏览器无法在没有用户授权的情况下直接修改网页所在目录。点击“保存 data.json”后，现代浏览器会让你选择根目录的 `data.json`；授权后，后续每次新增、编辑或删除都会自动写回这个文件。浏览器不支持 File System Access API 时，会退化为下载文件。

在 APK 中，Capacitor Filesystem 会把运行数据持续保存为应用数据目录中的 `data.json`，导出的 JSON 和 Excel 会写入应用的 Documents 目录，并可通过系统分享。

## APK 构建

本项目使用 Capacitor 6 和 Java 17。GitHub Actions 会自动创建 Android 工程并上传 debug APK。仓库需要包含 `package-lock.json`，工作流入口是 `.github/workflows/build-apk.yml`。

本地首次构建前需要安装 Android SDK Command-line Tools，并准备 `platform-tools`、`platforms;android-35` 和 `build-tools;35.0.0`。Android Studio 和全局 Gradle 不是必需的。

首次打开为空白礼簿，录入第一笔收礼或送礼后会开始生成数据。
