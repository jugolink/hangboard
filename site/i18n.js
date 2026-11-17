/* Two languages, one page. The default is Simplified Chinese; the toggle in
 * the nav switches to English and remembers the choice in localStorage.
 * Every string lives here rather than in the HTML, so a missing translation
 * falls back to Chinese instead of leaving a blank element. */

const HB_I18N = {
  "zh-CN": {
    navDemo: "试一试",
    navFeatures: "功能",
    navHotkeys: "快捷键",
    navFaq: "常见问题",

    heroBadge: "✨ v0.1.0 · 1.5 MB 极致轻量 · 纯本地离线 · Rust + Tauri",
    tagline: "截图挂在屏幕顶上晾着。点一下复制，拖进任何软件，用完摘下来。",
    heroSub:
      "一个 Windows 小工具：每张截图自己挂到屏幕顶端的一条细线上。平时完全看不见，需要时把指针挪到屏幕顶上，它就垂下来。",
    download: "下载 Windows 版",
    source: "查看源码",
    fineprint: "免费开源（MIT）· Windows 10 / 11 · 无需账号，不联网，不收集数据",

    demoTitle: "这就是那个界面",
    demoSub:
      "下面这块「屏幕」就是它平常的样子。按 Ctrl+V 或点「截一张图」，照片会挂到线上；把指针移到顶端可以自己唤出线。",
    emptyHint: "把指针移到这里，截图就会挂上来",
    hoverHere: "把指针移到最顶端",
    btnShot: "截一张图",
    btnPaste: "粘贴图片",
    btnClear: "全部取下",
    btnAnnotate: "涂鸦标注",
    btnOcr: "离线 OCR",
    soundOn: "音效: 开",
    soundOff: "音效: 关",
    demoNote: "点卡片复制 · 往下拖是摘下 · 试试拖进底部应用",
    copied: "✓ 已复制",
    takeDown: "取下这张",
    noImage: "剪贴板里没有图片",
    pasteBlocked: "浏览器不允许读取剪贴板",

    dockTitle: "外部软件接收坞 (拖拽释放试试)",
    dockWechat: "微信 WeChat",
    dockVscode: "VS Code",
    dockFolder: "文件夹 Explorer",
    droppedTo: "✓ 已发送至",

    annotateTitle: "即时涂鸦标注",
    annotateHint: "框选完先别急着撒手：矩形、箭头、高亮、马赛克随心涂",
    annotateHang: "挂到线上 ⏎",
    annotateCancel: "取消 Esc",

    ocrScanning: "Windows WinRT 本地 OCR 离线识别中…",
    ocrDone: "识别完成 (点下方按钮复制)",
    ocrSampleText: "Hangboard v0.1.0\n轻量无感截图晾衣绳小工具\n- 纯本地离线 Windows WinRT OCR 识别\n- 原生 OLE 拖放支持微信/飞书/Word/VS Code\n- 1.5 MB 极致轻量，Rust + Tauri 构建",
    ocrCopyBtn: "复制文本",
    ocrClose: "关闭",

    featuresTitle: "它替你做的几件事",
    bentoTag1: "核心流转",
    bentoTag2: "离线文字提取",
    bentoTag3: "即时创作",
    bentoTag4: "极致体积",
    bentoTag5: "多屏协同",
    bentoTag6: "纯净隐私",

    f1t: "不用再找截图文件",
    f1b: "截图不再落到桌面等你翻文件夹。它直接挂到线上，点一下就回到剪贴板，立刻能粘。",
    f2t: "拖进任何软件",
    f2b: "原生 OLE 拖拽，不是模拟。图片能拖进资源管理器、微信、QQ、飞书、Word、Photoshop、VS Code。",
    f3t: "截图时就标注",
    f3b: "框选完先别急着撒手：矩形、椭圆、直线、箭头、画笔、荧光笔、马赛克、平滑模糊、文字、步骤序号，十种工具，颜色和粗细随选。",
    f4t: "离线提取文字",
    f4b: "右键「提取文字」，调用 Windows 自带的 OCR 引擎识别，不联网、不上传，结果直接进剪贴板。",
    f5t: "跟着指针走的那块屏",
    f5b: "多显示器也不用管：指针在哪块屏上，线就垂在哪块屏，截图也截那一块。",
    f6t: "不挡你做事",
    f6b: "平时它完全隐形，鼠标直接穿过去。只有指针碰到屏幕顶端那一条，它才下来。",

    hotkeysTitle: "三个快捷键就够",
    hotkeyInteractiveHint: "💡 试着在键盘上按下对应的组合键，体验界面实时高亮！",
    k1: "框选一块区域截图",
    k2: "截整个屏幕",
    k3: "呼出 / 收起晾衣绳",
    keynote:
      "快捷键都能在设置里改。托盘菜单能呼出设置面板，界面语言（中文 / English）也在那里切。",

    privTitle: "它不联网",
    privBody:
      "没有账号，没有分析，没有遥测。文字识别用的是 Windows 系统自带的引擎，图片和文字都留在你自己的机器上。源码是 MIT 许可，你可以自己编译一份。",
    privTech:
      "用 Rust + Tauri 写成，安装包只有 1.5 MB。相比 Electron 那套几百兆的运行时，它启动快、占内存少。",

    faqTitle: "常见问题",
    q1: "和系统自带的截图工具比，好在哪？",
    a1: "系统工具把截图存成文件，你得去文件夹找。Hangboard 让截图停在你能看见的地方，点一下就回剪贴板。它不替换系统截图键，两者可以共存。",
    q2: "截图会丢吗？",
    a2: "不会。每张截图都存成 PNG 放在数据目录里（默认 %APPDATA%\\Hangboard\\shots），线上的只是索引。摘下卡片才会删掉那个文件，所以你不摘，它就在。",
    q3: "为什么装的时候 Windows 弹警告？",
    a3: "安装包没有买代码签名证书。这是个人开源项目，证书一年要好几百美元。你可以直接看源码自己编译，或者点「更多信息 → 仍要运行」。",
    q4: "支持 macOS 或 Linux 吗？",
    a4: "目前只有 Windows。核心逻辑是 Rust，但窗口穿透、原生拖拽、系统 OCR 这几块都贴着 Windows API 写的，移植要重写。macOS 上有个同类软件叫 Tendedero，Hangboard 的设计参考了它。",
    q5: "要装 WebView2 吗？",
    a5: "Windows 11 和保持更新的 Windows 10 自带，不用管。太老的系统上安装程序会自动下载。",

    finalTitle: "试一下，两分钟就知道合不合手",
    guide: "使用指南",
  },

  en: {
    navDemo: "Demo",
    navFeatures: "Features",
    navHotkeys: "Shortcuts",
    navFaq: "FAQ",

    heroBadge: "✨ v0.1.0 · 1.5 MB Lightweight · 100% Offline · Rust + Tauri",
    tagline: "Screenshots hang on a line at the top of your screen.",
    heroSub:
      "A small Windows app: every screenshot pegs itself to a thin line along the top edge. It stays out of sight until you rest the pointer there, then the line glides down.",
    download: "Download for Windows",
    source: "View source",
    fineprint: "Free and open source (MIT) · Windows 10 / 11 · No account, no network, no tracking",

    demoTitle: "This is the real interface",
    demoSub:
      "The screen below is how it looks in use. Press Ctrl+V or hit “Take a screenshot” and a photo hangs itself; resting the pointer at the top edge brings the line down.",
    emptyHint: "Rest the pointer here and a screenshot will hang",
    hoverHere: "Rest the pointer at the top",
    btnShot: "Take a screenshot",
    btnPaste: "Paste an image",
    btnClear: "Take everything down",
    btnAnnotate: "Try Markup",
    btnOcr: "Offline OCR",
    soundOn: "Sound: On",
    soundOff: "Sound: Off",
    demoNote: "Click a photo to copy · drag it down to let it go · drag into dock apps below",
    copied: "✓ Copied",
    takeDown: "Take this down",
    noImage: "No image on the clipboard",
    pasteBlocked: "The browser blocked clipboard access",

    dockTitle: "External App Dock (Try dragging a card here)",
    dockWechat: "WeChat",
    dockVscode: "VS Code",
    dockFolder: "Explorer",
    droppedTo: "✓ Delivered to",

    annotateTitle: "Instant Screenshot Markup",
    annotateHint: "Before letting go: rectangle, arrow, highlighter, mosaic at your fingertips",
    annotateHang: "Hang to Line ⏎",
    annotateCancel: "Cancel Esc",

    ocrScanning: "Windows WinRT offline OCR scanning…",
    ocrDone: "Extracted (use the button below to copy)",
    ocrSampleText: "Hangboard v0.1.0\nSubtle screenshot clothesline utility\n- Pure offline Windows WinRT OCR text recognition\n- Native Win32 OLE drag & drop into WeChat, VS Code, Word\n- 1.5 MB ultra-compact, crafted with Rust + Tauri",
    ocrCopyBtn: "Copy Text",
    ocrClose: "Close",

    featuresTitle: "What it does for you",
    bentoTag1: "Core Workflow",
    bentoTag2: "Offline Text Extraction",
    bentoTag3: "Instant Creation",
    bentoTag4: "Ultra Lightweight",
    bentoTag5: "Multi-Monitor",
    bentoTag6: "Zero Privacy Risk",

    f1t: "No more hunting for files",
    f1b: "Screenshots stop landing on the Desktop waiting to be found. They hang on the line, and one click puts one back on the clipboard.",
    f2t: "Drag into any app",
    f2b: "A native OLE drag, not a simulation. Photos land in Explorer, WeChat, QQ, Feishu, Word, Photoshop and VS Code.",
    f3t: "Annotate as you capture",
    f3b: "Before you let go of the selection: rectangle, ellipse, line, arrow, pen, highlighter, mosaic, smooth blur, text and step badges — ten tools, any colour, three widths.",
    f4t: "Text, extracted offline",
    f4b: "Right-click, Extract text. Windows' own OCR engine reads the photo, nothing is uploaded, and the result lands on the clipboard.",
    f5t: "The monitor your pointer is on",
    f5b: "Multi-monitor needs no thought: whichever screen the pointer is on is where the line drops and where a capture is taken.",
    f6t: "Out of your way",
    f6b: "It is invisible and click-through until the pointer touches that strip at the top edge.",

    hotkeysTitle: "Three shortcuts are enough",
    hotkeyInteractiveHint: "💡 Try pressing these key combinations on your physical keyboard to see live feedback!",
    k1: "Capture a region",
    k2: "Capture the whole screen",
    k3: "Toggle the clothesline",
    keynote:
      "All three are rebindable in the settings. The tray menu opens the settings panel, which is also where the UI language lives.",

    privTitle: "It does not go online",
    privBody:
      "No account, no analytics, no telemetry. Text recognition uses the OCR engine built into Windows, and every photo and every word stays on your machine. The source is MIT licensed — you can build your own copy.",
    privTech:
      "Written in Rust with Tauri; the installer is 1.5 MB. Against Electron's hundreds of megabytes of runtime, it starts faster and sits lighter in memory.",

    faqTitle: "Questions",
    q1: "How is this better than the built-in Snipping Tool?",
    a1: "The built-in tool saves a file you then have to go find. Hangboard leaves the screenshot where you can see it, one click from the clipboard. It does not replace your screenshot key — both can live together.",
    q2: "Can I lose a screenshot?",
    a2: "No. Every capture is a PNG in the data directory (%APPDATA%\\Hangboard\\shots by default); the line only holds an index. Taking a card down deletes that file, so as long as you leave it hanging it is still there.",
    q3: "Why does Windows warn me when I install it?",
    a3: "The installer is not code-signed. This is a personal open source project, and a certificate costs a few hundred dollars a year. You can read the source and build it yourself, or click More info → Run anyway.",
    q4: "Does it run on macOS or Linux?",
    a4: "Windows only, for now. The core is Rust, but click-through, native drag and system OCR are written against Windows APIs and would need rewriting. The macOS app this design follows is called Tendedero.",
    q5: "Do I need WebView2?",
    a5: "Windows 11 and an up-to-date Windows 10 already have it. On older systems the installer fetches it.",

    finalTitle: "Try it — two minutes tells you whether it fits",
    guide: "User guide",
  },
};

(function () {
  "use strict";

  const root = document.documentElement;
  const toggle = document.getElementById("lang-toggle");
  const STORAGE_KEY = "hangboard.lang";

  function apply(lang) {
    const dict = HB_I18N[lang] || HB_I18N["zh-CN"];

    root.lang = lang;

    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.dataset.i18n;
      const value = dict[key];
      if (typeof value === "string") el.textContent = value;
    });

    document.querySelectorAll("[data-i18n-title]").forEach((el) => {
      const key = el.dataset.i18nTitle;
      const value = dict[key];
      if (typeof value === "string") el.setAttribute("title", value);
    });

    // Titles and descriptions are the two things a search engine and a shared
    // link actually show, so they follow the language too.
    if (lang === "en") {
      document.title = "Hangboard — Screenshots hang on a line at the top of your screen";
      document
        .querySelector('meta[name="description"]')
        ?.setAttribute(
          "content",
          "Hangboard hangs every screenshot on a line at the top edge of your Windows screen. Hover to bring it down, click to copy, drag into any app. Free, open source, offline OCR, annotate while you capture."
        );
      document
        .querySelector('meta[property="og:title"]')
        ?.setAttribute("content", "Hangboard — Screenshots hang on a line at the top of your screen");
    } else {
      document.title = "Hangboard — 截图挂在屏幕顶上晾着";
      document
        .querySelector('meta[name="description"]')
        ?.setAttribute(
          "content",
          "Hangboard 把每张截图挂到屏幕顶端的一条晾衣绳上。悬停垂下来，点一下复制，拖进任何软件。Windows 免费开源，离线 OCR，截图时即可标注。"
        );
      document
        .querySelector('meta[property="og:title"]')
        ?.setAttribute("content", "Hangboard — 截图挂在屏幕顶上晾着");
    }

    if (toggle) {
      toggle.textContent = lang === "en" ? "中" : "EN";
      toggle.setAttribute(
        "aria-label",
        lang === "en" ? "切换到中文" : "Switch to English"
      );
    }

    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {}

    if (typeof window.hbDemoRefreshLanguage === "function") {
      window.hbDemoRefreshLanguage();
    }
  }

  function initial() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "zh-CN" || saved === "en") return saved;
    } catch {}

    const browser = (navigator.languages?.[0] || navigator.language || "").toLowerCase();
    return browser.startsWith("zh") ? "zh-CN" : "en";
  }

  if (toggle) {
    toggle.addEventListener("click", () => {
      apply(root.lang === "en" ? "zh-CN" : "en");
    });
  }

  apply(initial());
  window.applyHangboardLanguage = apply;
  window.HB_I18N = HB_I18N;
})();
