# 相位 1 · 取证与对齐：泛白问题定位（先验证，未改任何代码）

> 目标：让 Open GO 小组件的背景/面板配色严格对齐「图 2 原图」所体现的 dsh 配色，消除泛白。
> 本文只记录事实与差异，**不含任何样式改动**；所有色值均为实测（不是肉眼估计）。

## 1. dsh 配色的真实来源（唯一权威）

| 来源 | 路径 | 作用 |
|---|---|---|
| 静态色阶 | `.dsh-vision-toolkit/dsh-src/packages/client/ui-theme/src/styles/design-platform.css` L53–71（深色侧同名值 L129–147） | 原始色板 `--dsw-static-*` |
| 语义别名 | 同上 L249–331（深色主题块） | `body[data-ds-dark-theme]` 下把 `--dsw-alias-*` 指向静态色阶 |
| 阴影/模糊 | 同目录 `gradient-shadow-text.css` L5–11 | `--dsw-shadow-lv1/lv2/lv3`、`--dsw-mask-blur` |

深色主题下与背景相关的取值（**只有这一处定义，无第二来源、无冲突**）：

| token | 取值 | dsh 自己的用途 |
|---|---|---|
| `--dsw-alias-bg-base` | `rgb(21,21,23)`（bluish-950） | app 底 |
| `--dsw-specific-sidebar-fill` | `rgb(27,27,28)`（bluish-900） | 侧边栏底 |
| `--dsw-alias-bg-layer-1` | `rgb(35,35,36)`（bluish-875） | 一级面（输入框等） |
| `--dsw-alias-bg-layer-2` | `rgb(44,44,46)`（bluish-850） | 二级面（Modal 卡片、`button-floating-fill`） |
| `--dsw-alias-bg-layer-3` | `rgb(53,54,56)`（bluish-800） | 三级面（`--dsw-specific-menu` = 菜单/浮层） |
| `--dsw-alias-button-elevated-fill` | `rgb(67,69,74)`（bluish-750） | 抬升按钮（侧边栏「新会话」） |
| `--dsw-alias-interactive-bg-hover` | `rgba(255,255,255,.08)` | 悬停叠加（**白 8%**） |
| `--dsw-alias-interactive-bg-active` | `rgba(255,255,255,.14)` | 按下/选中叠加（**白 14%**） |
| `--dsw-alias-border-l2` | `rgba(255,255,255,.12)` | 描边/轨道（**白 12%**） |
| `--dsw-alias-bg-mask-1` | `rgba(0,0,0,.5)` | 遮罩 |

> 结论：dsh 在深色侧确实**自带白色叠加 token**（hover/active/border-l2），它们的设计用途是"状态叠加/描边"，**不是"面"**。把这类 token 当面用时就会泛白 —— 这是本次泛白的根因类别。

## 2. 图 2（原图基准）实测色值

用无头 Chrome canvas 逐像素取色（脚本 `.verify/sample-colors.mjs`，输出 `.verify/shots/color-sample.json`）。
图 2 = 373×375，色阶命中率：

| 色值 | 命中率 | 判定 |
|---|---|---|
| `#353638` = `rgb(53,54,56)` = **bluish-800** | **64.01%** | 面板主体（= `bg-layer-3`） |
| `#2c2c2e` = `rgb(44,44,46)` = **bluish-850** | **6.95%** | 底部状态条 / pill（= `bg-layer-2` / `button-floating-fill`） |
| `#151517` = `rgb(21,21,23)` = **bluish-950** | 4.00% | 面板外的 app 底 |
| `#454648` = `rgb(69,70,72)` | 2.58% | 只出现在轨道/局部，**不是整块卡片** |
| `bluish-750 (67,69,74)` | **0.04%** | 图 2 里几乎不存在 |

纵向扫描（x=30 从 y=14 到 y=320）：**几乎每个采样点都是 `#353638`**，只在文字/进度条/分隔线处才偏离
→ 图 2 的**面板内部没有独立的内层卡片**：三档行直接坐在面板面上。

## 3. 当前实现实际生效的色值（含计算值）

来源 = 无头 Chrome 实测计算样式（`.verify/probes-v0.9.5.json`）+ 同一脚本对当前 UI 截图的取色。

| 位置（文件 / 选择器 / 行号） | 变量 | 现在用的 token | 计算值 | 图 2 对应部位实测 | 差异 |
|---|---|---|---|---|---|
| `lib/client.js` **L175** `.dshoq-card`（面板内层卡片） | `--oq-card`（L129） | `--dsw-alias-interactive-bg-hover` | `rgba(255,255,255,.08)` → 叠在 800 上 = **`#454648` (69,70,72)** | 图 2 **无此卡片**（= 800 通铺 `#353638`） | **+16 阶偏白，占截图 50.62% 像素** ← 主因 |
| `lib/client.js` **L141** `.dshoq-pill`（含 **L206** `.dshoq-rail`） | `--oq-acrylic`（L129） | `--dsw-alias-button-elevated-fill` | `rgb(67,69,74)` = bluish-750 | 图 2 底栏 = bluish-850 `#2c2c2e` | **+23 阶偏白** ← 次因 |
| `lib/client.js` **L145** `.dshoq-badge` | `--oq-chip`（L129） | `--dsw-alias-interactive-bg-active` | `rgba(255,255,255,.14)` → 叠在 750 上 ≈ (82,84,88) | 图 2 徽标 ≈ `#3e3e3e` (62,62,62) = 白 ~9% 叠在 850 上 | 小面积白叠加，偏白 ~20 阶 |
| `lib/client.js` **L181** `.dshoq-bar` / **L201** `.dshoq-mbar`（进度条轨道） | `--oq-track`（L129） | `--dsw-alias-border-l2` | `rgba(255,255,255,.12)` → 卡上 `#5c5c5e` | 图 2 轨道 = `#454648` (69,70,72)（白 8% 叠在 800 上） | +23 阶偏白（局部，非"整体泛白"来源） |
| `lib/client.js` **L157** `.dshoq-panel` | `--oq-overlay`（L129） | `--dsw-specific-menu`(= bg-layer-3) | `rgb(53,54,56)` | 图 2 面板 = `rgb(53,54,56)` | **0，已经一致** ✅ |
| `lib/client.js` **L223** `.dshoq-switch` 等控件 | `--oq-chip` / `--oq-hover` | interactive-bg-* | 白 8–14% | 图 2/图 1 均未涉及弹窗 | 见 §5「列出但不动」 |

## 4. 泛白来自哪几处（结论）

1. **面板内层卡片把「白 8% 叠加」当面用**（`.dshoq-card`，L175 / 变量 L129）→ 占一半像素、比图 2 亮 16 阶；
2. **pill 把「抬升按钮面」用在侧边栏里**（`.dshoq-pill` L141 / `.dshoq-rail` L206）→ bluish-750 比图 2 的底栏 bluish-850 亮 23 阶；
3. **徽标用「按下叠加」当作底**（`.dshoq-badge` L145）→ 白 14%，偏白约 20 阶；
4. **进度条轨道比图 2 亮一档**（`.dshoq-bar` L181 / `.dshoq-mbar` L201，白 12% vs 图 2 的白 8%）。

面板主体（`bg-layer-3`）与遮罩/投影（黑系）**没有问题**，不需要动。

## 5. 列出但**不动**的白色相关样式（不确定是否属于本次泛白）

| 位置 | 说明 | 为什么不动 |
|---|---|---|
| `.dshoq-icon:hover` / `.dshoq-btn:hover` / `.dshoq-pill:active` / `.dshoq-rail:active`（白 8–14%） | 瞬时状态叠加 | 图 1/图 2 都是静态截图，无法证明它是"整体泛白"来源；且属于 dsh 规定的 hover/active 用法 |
| `.dshoq-switch-row`（弹窗内，白 8%） / `.dshoq-switch` 轨道（白 14%） / `.dshoq-input` 面 | ⚙ 弹窗内部控件 | 两张图都未涉及弹窗；面已用 `bg-layer-1/2`，不构成"面板泛白" |
| `.dshoq-shimmer`（加载扫光，白 22%） | 局部动画 | 仅在加载态出现 |
| `--oq-edge` = `light-dark(border-l2, transparent)` | 仅浅色主题出现的一条深色细边 | 深色侧为 transparent，不影响本次结论 |

## 6. 是否触发"停下来问"的条件

- dsh 色值**来源唯一**（`design-platform.css` 一处定义，运行时计算值与之吻合）→ **无冲突**，不需要停；
- 图 2 可读且分辨率足够取色（373×375，逐像素取色成功）→ 不需要重发原图；
- 因此按你的阶段约定**继续进入相位 2**：把面换成 dsh 的**面** token（`bg-layer-*` / `button-floating-fill`），
  把白色叠层从"面"退回"状态"用途；层级关系保持（背景 bluish-950/900 → 浮层 800 → 二级面 850）。
