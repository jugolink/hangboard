# Hangboard（悬板）

[![CI](https://github.com/jugolink/hangboard/actions/workflows/ci.yml/badge.svg)](https://github.com/jugolink/hangboard/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/jugolink/hangboard?display_name=tag)](https://github.com/jugolink/hangboard/releases/latest)
[![Licence](https://img.shields.io/github/license/jugolink/hangboard)](LICENSE)
[![Windows](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-0078d4)](#只支持-windows这是有意的)

截图会挂在屏幕顶端的一条晾衣绳上。点一下就能把它复制回剪贴板，用完摘下来即可。

[English](README.md) · **简体中文**

这是对 [Tendedero](https://github.com/alejandrobujan/tendedero) 背后想法的 Windows 重写，而不是移植。原版用 AppKit 调 macOS 私有 API；延续下来的是设计，不是代码。

<!-- 这里应该放一张晾衣绳的截图，目前还没有：它必须在运行着本应用的 Windows 桌面上拍。
     在那之前，site/ 下的落地页带了一个可交互的复刻演示。 -->

想要按任务走的完整说明——每个按钮、每项设置，以及界面上看不出来的技巧——请看 [用户使用说明（USER_GUIDE.md）](USER_GUIDE.md)。

## 它能做什么

截一张图，它会自己挂到绳上停一会儿，然后收起来。想把绳子叫回来，把鼠标移到屏幕顶部正中间（在设置里打开“鼠标悬停展开”，或者用托盘菜单）——一条细绳垂下来，上面像晾衣绳上的照片一样挂着最近的截图。

- **`Ctrl+Alt+H`** —— 区域截图。拖出一个矩形，松手。
- **`Ctrl+Alt+Shift+H`** —— 直接截取整个主显示器，不弹框选层。
- **`Ctrl+Alt+L`** —— 收起或展开晾衣绳。
- **单击照片** —— 复制到剪贴板。
- **双击照片** —— 打开居中灯箱预览。
- **右键照片** —— 上下文菜单：复制、打开、快速预览、提取文字、在资源管理器中显示、保存到桌面、丢弃，或者一次性摘掉它左边／右边的全部。
- **提取文字（OCR）** —— 右键菜单或灯箱预览里都能用。识别结果自动进剪贴板，同时弹出一个可编辑窗口供你调整。完全走 Windows 自带的 WinRT OCR 引擎离线完成，内容不出本机。
- **截图时直接标注** —— 拖完矩形、还没挂上去之前就能画：矩形、椭圆、直线、箭头、画笔、荧光笔、马赛克、平滑模糊、文字、编号步骤徽标。每个图形都能选颜色（七个预设加一个完整取色器）和线宽（三档预设，或者用滚轮），矩形和椭圆还能在描边与填充之间切换。`Ctrl+Z` / `Ctrl+Y` 撤销重做，`Enter` 把合成结果挂上去，`Esc` 先退出当前工具、再按一次才丢弃这次截图。落盘和进剪贴板的都是标注后的 PNG。
- **把照片拖出去** —— 原生 OLE 拖拽，文件能落进资源管理器、微信、QQ、飞书、Word、Photoshop 或 VS Code。灯箱预览里的照片也能拖出去。
- **照片上的 ✕** —— 摘下来。它会掉下绳子，动画结束后删除即生效。
- **照片上的 ☆** —— 钉住它，绳子挂满时它最后一个被挤掉。
- **全部摘下** —— 托盘菜单一次把绳子清空。

新截图会立刻进剪贴板，不点任何东西就能直接粘贴。

托盘图标的菜单里有同样的操作，另外还有设置面板：快捷键、数据目录、剪贴板监听、开机自启、绳子尺寸、容量上限，以及界面语言（简体中文或英文）都能在那里改。绳子和鼠标所在的那块显示器走，区域截图也截鼠标所在的那块。

有三个设置决定绳子怎么“通报”一张新图。**新图自动展开**决定截图到来或剪贴板图片被挂上时绳子是否垂下来；**展示停留时长**是它随后停留几秒（1–300，默认 3）；**提示音效**在照片挂上或摘下时响一声轻响。音效内嵌在二进制里，不需要网络也不需要额外文件；也可以用**自定义音效**指向磁盘上任意 `.wav`，保存前有个**试听**按钮先听一遍。关掉“新图自动展开”会让停留时长那一行失效，关掉音效会让自定义音效那一行失效。

## 环境要求

- Windows 10 或 11。运行时需要 WebView2，Windows 11 和保持更新的 Windows 10 上已经自带。
- 自行构建需要：Rust 1.88 或更新版本（stable）、Node 18 或更新版本，以及带 C++ 工作负载的 Visual Studio 生成工具——Tauri 需要 `link.exe`。

CI 实际用 Node 22 和当时的 stable Rust 构建，所以那才是真正验证过的版本；上面写的是声明的最低线（`src-tauri/Cargo.toml` 里 `rust-version = "1.88"`）。

## 构建

```powershell
npm install          # 装 Tauri CLI
npm run build        # 产出 src-tauri/target/release/hangboard.exe
```

带控制台、前端热重载的开发运行：

```powershell
npm run dev
```

NSIS 安装包由 `npm run bundle` 产出。这是唯一配置了的打包目标——没有 `.msi`。

## 从源码目录直接运行

```
$env:HANGBOARD_DATA_DIR = ".\\dev-data"
.\\src-tauri\\target\\release\\hangboard.exe
```

截图和绳子索引就放在那个目录下的 `shots/` 与 `line.json` 里。不设这个变量则落在 `%APPDATA%\\Hangboard`。两个位置都能在设置面板里改，改动时会自动迁移已有文件。

## 目录结构

```
src-tauri/src/
  lib.rs        应用装配、快捷键、数据目录、各处接线
  window.rs     创建六个窗口，掌管它们的几何位置
  hover.rs      轮询指针位置，决定何时垂下与收起
  capture.rs    冻结屏幕，从冻结帧里裁出矩形
  line.rs       像素变条目、持久化、剪贴板、删除
  commands.rs   webview 调用的 invoke 接口
  state.rs      共享状态与几何常量
  settings.rs   settings.json、默认值、读写
  tray.rs       托盘图标、它的菜单，以及本地化文案
  ocr.rs        Windows WinRT 原生 OCR 文字识别
  drag.rs       把照片带到别的应用里去的 OLE 拖拽
  clipboard.rs  轮询 Windows 剪贴板，发现新图片
  autostart.rs  “开机自启”的注册表项
ui/
  index.html    晾衣绳窗口
  line.css      ……以及它的样式表
  line.js       ……以及它的行为
  overlay.html  框选截图用的浮层，带标注工具栏
  overlay.css   ……以及它的样式表
  overlay.js    ……以及它的行为
  annotate.js   浮层用来作画的 canvas 标注层
  preview.html  居中的灯箱预览
  context.html  每张照片的右键上下文菜单
  settings.html 设置面板
  ocr.html      OCR 识别结果与编辑窗口
src-tauri/assets/
  default_hang.wav  挂上时的提示音，用 include_bytes! 内嵌进二进制
site/
  index.html    落地页，在 Vercel 上以这个目录为根部署
  demo.js       那个页面上的晾衣绳演示
  README.md     这个目录怎么构建、怎么部署
docs/
  SPEC.md       应用做什么、不做什么
  ROADMAP.md    还剩什么，以及哪些是有意搁置的
  adr/          关键决策当初为什么那样定
scripts/
  check-site.mjs           让落地页的键、id 与版本号彼此一致
  check-version.mjs        版本号偏离 src-tauri/Cargo.toml 时失败
  third-party-licenses.mjs 从 cargo metadata 生成 THIRD-PARTY-LICENSES.md
```

`ui/` 下每个 `.html` 都有配套的 `.css` 与 `.js`，唯独 `annotate.js` 是由浮层额外加载的标注层。

## 测试

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
npm run check
```

Rust 测试（27 个）覆盖的是有价值的那些**算术**——裁剪、缩略图、持久化、迁移、热区几何、提示音的 WAV 头——刻意不依赖 Tauri 类型，所以不需要窗口就能跑。这同样意味着它们对只存在于运行时的部分一言不发：托盘、OLE 拖拽、WinRT OCR、窗口接线，以及 `ui/annotate.js` 里那个 canvas 标注层。那些靠手工验证。已知的空白记在 `docs/ROADMAP.md` 里。

`npm run check` 对没有构建步骤的文件跑两项静态检查：

- `check:site` —— 每个 `data-i18n` 键在两种语言里都能解析、演示脚本查的每个 id 在标记里都存在、下载链接指向稳定的 release 地址。
- `check:version` —— 版本号在 `package.json`、`Cargo.lock`、`site/index.html`、`site/i18n.js` 四处与 `src-tauri/Cargo.toml` 一致。

### 改版本号

只改 `src-tauri/Cargo.toml`。`tauri.conf.json` 刻意没有 `version` 字段——缺省时 Tauri 会回落到 `Cargo.toml`——而 `Cargo.lock` 会在下一次构建时跟上。`package.json` 和那两个站点文件没法自动推导，所以落下它们时 `npm run check:version` 会失败。

## 只支持 Windows，这是有意的

热区、点击穿透行为、截图路径全都是 Windows 特有的。没有跨平台抽象层，因为只有一个平台。为想象中的第二个平台写代码，只是把工夫花在猜测上。

## 参与贡献

CI 检查什么、以及它检查不到什么，见 [CONTRIBUTING.md](CONTRIBUTING.md)。安全问题请走[私密报告](https://github.com/jugolink/hangboard/security/advisories/new)，不要开公开 issue。[docs/ROADMAP.md](docs/ROADMAP.md) 列出了还剩什么、哪些是有意搁置的。

## 许可

MIT —— 见 [LICENSE](LICENSE)。名称和图标属于本项目；对 Tendedero 的设计借鉴已在上面致谢。

二进制链接了 271 个 crate，它们的许可要求随每份二进制一起分发声明，所以安装包会展示 MIT 文本，每个 release 也附带一份生成的 `THIRD-PARTY-LICENSES.md`。`npm run licenses` 会从 `cargo metadata --filter-platform x86_64-pc-windows-msvc` 重新生成它；该文件不提交进仓库，因为 1.2 MB 的许可文本会盖过它所说明的源码。
