# v0.9.5 发布记录

| 项 | 值 |
|---|---|
| 仓库 | `https://github.com/Animal2404/dsh-open-go` |
| 改动 | 磨砂质感（毛玻璃/模糊透明/噪点）**全部**换成亚克力材质；色值收敛到 DSH 语义 token |
| 定义来源 | 全仓 grep `acrylic\|亚克力` **零命中** → 按项目现有材质方案实现：`ui-theme` 的 `--dsw-alias-bg-layer-*` / `button-*-fill` / `interactive-bg-*` / `bg-mask-1` / `border-l2` / `brand-primary*` / `state-*` 与 `--dsw-shadow-lv1..3`；并直接复用 `ui-primitives` 的 Modal / Button / Input 配方与 `ui-sidebar`「新会话」按钮配方。未新增依赖 |
| 删除 | `backdrop-filter`（blur 20px / 24px 两处）、内联 SVG `feTurbulence` 噪点贴图、4 个自造变量（`--oq-glass`/`--oq-glass-hi`/`--oq-ring`/`--oq-noise`）、6 处自造投影、多处自造 alpha 叠加层 |
| 保留 | 布局 / 内边距 / 圆角（10·11·14·14·10）/ 点击区域 / 字号 / 三档行几何 / 动效曲线；"不画白描边"（深色侧不描边，浅色侧用 `light-dark(border-l2, transparent)` 给深色细边） |
| 版本 | `package.json` 0.9.4 → 0.9.5；`lib/client.js` / `lib/index.js` 头注释同步 |
| 验证 | `node .verify/sidebar-check.mjs` exit=0：`frostedLeftovers=0`、pill/面板 `backdrop=none`、`bgImage=none`、`border=0px none`、pill `rgb(67,69,74)`、面板 `rgb(53,54,56)`；其余探针不变（280×201、溢出 0、点击→可见 19ms、reduced-motion 0、收起卸载）；四张截图已目检 |
| 探针 | `.verify/probes-v0.9.5.json` |
