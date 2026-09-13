# v0.9.4 发布记录

| 项 | 值 |
|---|---|
| 仓库 | `https://github.com/Animal2404/dsh-open-go` |
| 改动 | 材质换成**磨砂亚克力**，去掉发白的描边 |
| 白线真身 | `pill` 的计算样式是 `border: 2px outset rgb(255,255,255)` —— 浏览器给 `<button>` 的默认边框；此前被插件自绘的 `1px solid` 盖着，删掉自绘边框后就冒出来了 |
| 修法 | ① 材质：半透明底（`rgba(30,30,35,.60)`）+ `backdrop-filter: blur(20px) saturate(170%)` + 内联 SVG 噪声颗粒 + 顶部极淡微光；② 所有描边换「深色内圈 + 投影」，`border:0` 显式兜底（pill / rail / 面板 / 卡片 / 徽标 / 弹窗 / 开关 / 输入框 / 按钮）；③ 弹窗同材质但固定深色（不跟主题漂白） |
| 版本 | `package.json` 0.9.3 → 0.9.4；`lib/client.js` / `lib/index.js` 头注释同步 |
| 验证 | 复跑 `.verify/sidebar-check.mjs` exit=0：`pill.border`/`panel.border` = `0px none`（改前 `2px outset rgb(255,255,255)`）、背景 `rgba(30,30,35,0.6)`、`blur(20px) saturate(1.7)`；降级对照帧 `shots/08-panel-noblur.png`；其余探针不变（面板 280×201、溢出 0、账单默认 0 卡、点击→可见 19ms、reduced-motion 动画数 0） |
| 截图 | `assets/screenshot-*.png` 四张全部换成 v0.9.4 实测帧 |
| 探针 | `.verify/probes-v0.9.4.json` |
