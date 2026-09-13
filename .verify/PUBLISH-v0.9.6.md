# v0.9.6 发布记录

| 项 | 值 |
|---|---|
| 仓库 | `https://github.com/Animal2404/dsh-open-go` |
| 目标 | 消除"泛白"：背景/面板配色严格对齐「图 2 原图」所体现的 dsh 配色 |
| 阶段 1（取证） | dsh 色源唯一：`ui-theme/src/styles/design-platform.css`（静态色阶 + 深色 alias）+ `gradient-shadow-text.css`（shadow-lv1..3）→ 无冲突；用无头 Chrome canvas 对图 2 与当前实现逐像素取色（`.verify/PHASE1-COLOR-AUDIT.md`） |
| 根因 | dsh 深色侧自带白色叠加 token（hover 白8% / active 白14% / border-l2 白12%），设计用途是「状态叠加/描边」；被当成「面」用就会泛白。当前实现里白 8% 卡片色占 50.62% 像素 |
| 阶段 2（修正） | `lib/client.js` 4 行：① L129 变量（`--oq-chip` 白14%→白8%、`--oq-acrylic`→`button-floating-fill`、删 `--oq-card`、增 `--oq-bar-track`）；② L175 `.dshoq-card` 去背景；③ L181 `.dshoq-bar` 轨道；④ L201 `.dshoq-mbar` 轨道。**无任何尺寸/间距/字体/交互改动** |
| 阶段 3（验证） | 像素复核：面板主色占比 28.11% → **85.00%**（图 2 = 64.01%，余差为裁切范围）；白 8% 卡片色 56.85% → **3.52%**（图 2 = 2.58%）；pill `rgb(67,69,74)` → **`rgb(44,44,46)`** = 图 2 底栏实测值；卡片 → `rgba(0,0,0,0)`；受控 A/B 的 `panel.offsetHeight` 改前/改后 = 197/197（布局零改动）；行为未退化（280×197、溢出 0、点击→可见 28ms、账单默认 0 卡、reduced-motion 0） |
| 证据 | `.verify/PHASE1-COLOR-AUDIT.md`、`.verify/PHASE3-COLOR-EVIDENCE.md`、`.verify/probes-v0.9.6.json`、`.verify/shots/color-compare.png`（基准｜改前｜改后）、`.verify/sample-colors.mjs`（零依赖取色脚本） |
| 版本 | `package.json` 0.9.5 → 0.9.6；`lib/client.js` / `lib/index.js` 头注释同步 |
