# dsh-opencode-quota v0.9.0 · 视觉验证报告

> 时间：2026-09-13 07:54 +08:00 ｜ 目标：把小组件按参考图整体重做（三档紧凑面板 + 收起态三档读数 + ⚙ 里的账单开关）
> 方式：无头 Chrome + CDP 打开**正在运行的** dsh web（`http://127.0.0.1:3080`），用本机凭据自签 127.0.0.1 会话 cookie，
> **不碰用户浏览器进程、不重启宿主**；每一步同时截图 + 打几何/样式探针。
> 复跑命令：`cd E:\DeepSeek\dsh-opencode-quota; node .verify\sidebar-check.mjs`

## 1. 关键结论

| # | 检查项 | 证据 | 结果 |
|---|---|---|---|
| 1 | 宿主下发的是**改过的** client bundle | bundle URL 响应里含新皮肤类名 `dshoq-badge`（`mark: true`，rev=`aeb841baefd2`） | ✅ |
| 2 | 收起态 pill = `GO ● 5h 4% · wk 19% · mo 1% ^` | `shots/01-pill.png`；pill 256×31，三档与面板数值同源 | ✅ |
| 3 | 面板 = 三档紧凑行（名称+条+百分比，次行「距重置」） | `shots/02b-panel-only.png`；探针：`5h 滚动 3% / 距重置 4h21m`、`7d 每周 19% / 1d`、`1m 每月 1% / 29d10h` | ✅ |
| 4 | 面板几何：280×239（无账单），溢出 0 | 探针 `overflowX:0, overflowY:0`，`radius 12px`，`font -apple-system…` | ✅ |
| 5 | 账单**默认不显示** | 首次展开探针 `billingShown: 0`，且未请求 `/api/official` | ✅ |
| 6 | ⚙ 里能开关账单，开关可达 | `shots/03-settings-off.png` → 点击后 `aria-checked=true`、滑块 `matrix(1,0,0,1,16,0)`、轨道 `rgb(77,107,254)` | ✅ |
| 7 | 打开后账单出现（真实数据） | `shots/05b-panel-billing-only.png`：`今日 $0.0000 / 今日暂无消耗`、`本月 $3.1084`（DeepSeek V4 Flash 42% $1.3152、muse-spark-1.3-contributor 20% $0.6132、MiMo 2.5 19% $0.6059、deepseek-flash 14% $0.4371），面板 280×467、溢出 0 | ✅ |
| 8 | `prefers-reduced-motion: reduce` 下无动效 | 探针 `animation:none`、`fillTransition:0s`、`dotAnim:none` | ✅ |
| 9 | 收起即卸载面板（不留空 div） | 探针 `panel:false`、`aria-expanded:false`；localStorage `dshoq-panel-open=false`、`dshoq-billing-on=true` 持久化 | ✅ |
| 10 | ⚙ 弹窗居中、`fixed` 遮罩生效 | 弹窗 340×435，中心 (720,500) = 视口中心 (1440×1000)，`backdropFixed: fixed` | ✅ |

## 2. 本轮抓到并修掉的真 bug

**⚙ 弹窗被面板裁掉**（首轮 `shots/03-settings-off.png` 旧版可见：弹窗只剩半截、跟着面板滚动）。
根因：面板为了进场动效加了 `transform`（`animation` + `transform-origin`），**任何 transform 都会让面板成为内部 `position:fixed` 子元素的包含块** —— 弹窗的 `inset:0` 遮罩于是相对 280px 宽的面板定位，`max-width` 被压到 278，且被 `overflow-y:auto` 裁切。
修复：把弹窗改成**独立 portal 到 `document.body`**（`cfgNode`），并给面板的「点外收起」判断加一条 `dlgRef` 放行，避免点弹窗时把面板一起关掉；面板收起时同时 `setCfgOpen(false)`，不留孤儿浮层。

## 3. 尚未覆盖 / 已知缺口

1. **亮色主题**：`Emulation.setEmulatedMedia(prefers-color-scheme: light)` 对面板无效（`shots/06-panel-light.png` 与深色帧字节一致）——宿主把 `color-scheme` 钉死为深色，插件变量（`--dsw-alias-*`）随宿主主题走，因此亮色下表现只能等宿主切主题时再验。
2. **窄侧栏（rail）形态**：本机侧边栏是展开态，rail 分支只做了代码走查（三根迷你条 + 月度百分比 + 箭头），未截图。
3. **动画观感**：截图是静态帧，动效只能靠 `animation-name`/时长探针 + reduced-motion 探针确认存在与可关闭，最终手感以用户实机为准。
4. 用户自己浏览器里的 localStorage 与本次验证（一次性 profile）相互隔离，用户刷新后是「面板收起 + 账单隐藏」的出厂默认。

## 4. 截图清单

| 文件 | 内容 |
|---|---|
| `shots/01-pill.png` / `07-collapsed.png` | 收起态 pill |
| `shots/01b-window.png` | 整窗（侧边栏里的位置关系） |
| `shots/02-panel-quota.png` / `02b-panel-only.png` | 展开面板（账单默认关） |
| `shots/03-settings-off.png` / `03b-window-settings.png` / `04-settings-on.png` | ⚙ 弹窗（开关关 → 开） |
| `shots/05-panel-billing.png` / `05b-panel-billing-only.png` | 账单打开后的面板 |
| `shots/06-panel-light.png` | 亮色模拟（无效，见缺口 1） |

README 里的 `assets/screenshot-*.png` 已同步替换成本轮截图（同一份像素）。

---

## 附：v0.9.1 追补（2026-09-13 08:07）

**用户反馈**：展开面板里「额度」这两个字去掉（截图圈出区块标题）。

**改动**：面板不再渲染分区标题，三档卡片直接跟在标题栏下；账单打开时「官方账单」分区标题与分隔线保留，充当额度与账单之间的分界。`warn`（仍显示上次数据）本来就有一行独立提示，标题里那条冗余提示一并消失。

**复跑验证**（同一脚本、同一宿主，`node .verify/sidebar-check.mjs` → exit 0）：

| 探针 | v0.9.0 | v0.9.1 |
|---|---|---|
| `sectionTitles`（账单关） | `["额度"]` | `[]` |
| `sectionTitles`（账单开） | `["额度","官方账单"]` | `["官方账单"]` |
| 面板高度（账单关 / 开） | 239 / 467 px | **201 / 429 px** |
| 其他项（pill、溢出、账单卡数、弹窗居中、reduced-motion、收起卸载） | 全绿 | 全绿（不变） |

截图：`shots/02b-panel-only.png`（无标题）、`shots/05b-panel-billing-only.png`（只剩「官方账单」分区线）。

---

## 附：v0.9.2 追补（2026-09-13 08:10）

**用户反馈**：收起态 pill 右边的箭头反了（截图圈出）。

**改动**：箭头方向掉头 —— **收起 `▾`、展开 `▴`**。原实现是收起 `▴` / 展开 `▾`（与参考图里「面板展开时显示 `^`」相反）。基础形状本身是朝上的 chevron，所以只改一处：把「展开时旋转 180°」改成「收起时旋转 180°」（CSS 类 `--open` → `--closed`），弹簧曲线与时长不变。

**复跑验证**（`node .verify/sidebar-check.mjs` → exit 0，新增 `chev` 探针）：

| 探针 | 收起态 | 展开态 |
|---|---|---|
| `chev.cls` | `dshoq-chev dshoq-chev--closed` | `dshoq-chev` |
| `chev.transform` | `matrix(-1, 0, 0, -1, 0, 0)`（= 旋转 180° → 朝下 ▾） | `none`（朝上 ▴） |

截图目检：`shots/01-pill.png`（收起，箭头朝下）、`shots/02-panel-quota.png`（展开，箭头朝上）。其余探针（面板 280×201 / 账单开 429、溢出 0、账单默认 0 卡、弹窗 340×435 居中、reduced-motion 动画数 0、收起后卸载）与 v0.9.1 完全一致。

---

## 附：v0.9.3 追补（2026-09-13 08:16）· 开合时序

**用户反馈**：点击展开太慢；应该「先展开，再刷新」，而不是「先刷新，再展开」。

**先量后改**（页面内 rAF 逐帧采样 + `performance` 资源计时，脚本 `MEASURE_OPEN`）：

| 指标 | v0.9.2（改前） | v0.9.3（改后） |
|---|---|---|
| 点击 → 面板挂载 | 28ms | 19ms |
| **点击 → 面板可见** | **367ms** | **19ms** |
| 刷新请求起点（相对点击） | 与展开同帧发起（`force=1`） | **+24ms（可见之后才发）** |
| 首帧的三档数值 | `0%,0%,0%`（从 0 涨上来，像在加载） | `7%,20%,2%`（真值，不装加载） |
| 进场动画 | 200ms | 200ms |

**真因**：面板 28ms 就挂载了，但 `visibility` 一直挂在 `panelPos` 上，而 `panelPos` 要等 `placePanel()` 量完**面板高度**才好定位；那一次测量没落地，直到刷新响应回来触发重渲染才补上——所以看起来像"等刷新回来才展开"。

**三处改动**：
1. 展开前**只量 pill**，用 `bottom` 贴住 pill 上沿定位（不依赖面板高度，面板自然往上长）；上屏后只在需要时校正一次（上方放不下才翻到 pill 下方）。
2. `render = open || closing`：展开与挂载同一帧，退场仍保留 140ms 动画。
3. 刷新改到**上屏后的下一帧**（`requestAnimationFrame` → `setTimeout(0)`）才发；`openNow/closeNow` 都是无副作用动作，不再在 `setState` 更新器里调副作用。
4. 附带：数据已在手上时展开直接显示真值（只有真的在等数据才从 0 生长，380ms）。

复跑：`node .verify/sidebar-check.mjs` → exit 0，`done`；截图与其余探针不变。

---

## 附：v0.9.4 追补（2026-09-13 08:26）· 磨砂亚克力材质

**用户反馈**：不要白色描边，换成更高级的质感 —— 磨砂亚克力板。

**诊断（材质探针，脚本已内置）**：pill 的计算样式是
`border: 2px outset rgb(255, 255, 255)` —— 这不是插件画的，而是**浏览器给 `<button>` 的默认边框**（`2px outset ButtonBorder`，渲染成发白的 3D 边）。此前它被插件自绘的 `1px solid var(--oq-border)` 盖着，v0.9.4 一删自绘边框它就冒了出来。

**改法**：
1. 材质换成磨砂亚克力：半透明底（`rgba(30,30,35,.60)`，跟主题走）+ `backdrop-filter: blur(20px) saturate(170%)` + 内联 SVG 噪声颗粒（120×120，26%）+ 顶部一道极淡微光（46% 处收干，不是线）。
2. 所有描边改「深色内圈 + 投影」：pill / rail / 面板 / 卡片 / GO 徽标 / 弹窗 / 开关 / 输入框 / 按钮，全部 `border:0` 显式兜底（把 UA 默认边焊死），边缘靠 `inset 0 0 0 1px rgba(0,0,0,.26)` 与投影交代。
3. 弹窗用固定深色的同款材质（`blur(24px)`，不跟主题漂白），符合开发记录里「重要弹窗用固定色」的教训。

**验证**（复跑 exit=0）：

| 探针 | 值 |
|---|---|
| `pill.border` / `panel.border` | `0px none` / `0px none`（改前 pill 是 `2px outset rgb(255,255,255)`） |
| `pill.backgroundColor` | `rgba(30, 30, 35, 0.6)`（改前不透明 `#232327`） |
| `backdropFilter` | `blur(20px) saturate(1.7)` |
| 降级对照帧 | `shots/08-panel-noblur.png`（关掉 backdrop-filter 仍可读） |
| 其余探针 | 面板 280×201、溢出 0、三档行 3、账单默认 0 卡 / 开启 2 卡、点击 → 可见 19ms、reduced-motion 动画数 0 —— 全部不变 |

截图目检：`shots/01-pill.png`（磨砂颗粒、无白线）、`shots/02b-panel-only.png`（内容透出且模糊）、`shots/03-settings-off.png`（弹窗同材质）、`shots/01b-window.png`（侧边栏里的整体观感）。

---

## 附：v0.9.5 追补（2026-09-13 08:38）· 磨砂 → 亚克力

**用户要求**：把界面/组件里"磨砂质感（毛玻璃、模糊透明效果）"的地方**全部**换成亚克力（Acrylic）；不要保留磨砂；按项目现有材质/主题方案实现、复用既有变量与规范、不加依赖；布局/尺寸/层级/圆角/点击区域/可读性不变；不要自造色值与参数。

**第一步是查定义（不是猜）**：
- 全仓 grep `acrylic|Acrylic|亚克力` → **零命中**（项目没有给这个名字下定义）；
- `磨砂/毛玻璃` 也不是 token；DSH 自身的"磨砂"只有 `--dsw-mask-blur: blur(2px)`（Modal/设置根/灯箱三处遮罩用）；
- 于是取项目**现成的材质词表**：`design-platform.css`（`--dsw-alias-bg-layer-1/2/3`、`--dsw-alias-button-elevated-fill`、`--dsw-alias-button-floating-hover`、`--dsw-alias-interactive-bg-hover/active`、`--dsw-alias-bg-mask-1`、`--dsw-alias-border-l2`、`--dsw-alias-brand-primary*`、`--dsw-alias-state-*`）与 `gradient-shadow-text.css`（`--dsw-shadow-lv1/lv2/lv3`）；
- 并**直接复用组件配方**：`ui-primitives/Modal.module.css`（卡片 = layer-2 + border-inverted + shadow-lv3；遮罩 = mask-1）、`Button.module.css`（ghost / ghost-active）、`Input.module.css`（border-l2 + layer-1 + 品牌蓝聚焦）、`ui-sidebar/SidebarRoot.module.css`（同 slot 的「新会话」= border-l2 + button-elevated-fill）。

**替换清单（逐一，探针复核 `frostedLeftovers: 0`）**

| 原磨砂实现 | 处数 | 现在 |
|---|---|---|
| `backdrop-filter: blur(20px) saturate(170%)` | pill / rail / 面板 | 删除（面走 `button-elevated-fill` / `specific-menu`） |
| `backdrop-filter: blur(24px) saturate(160%)` | ⚙ 弹窗 | 删除（面走 `bg-layer-2`） |
| 内联 SVG `feTurbulence` 噪点贴图 | 全部面 | 删除 |
| `--oq-glass` / `--oq-glass-hi` / `--oq-ring` / `--oq-noise` | 4 个自造变量 | 删除，改语义 token 变量 |
| 自造 alpha 面/叠加层（`rgba(255,255,255,.05/.06/.10/.14)` 等） | pill hover、按钮、开关、输入框、switch-row、徽标、卡片 | 改 `interactive-bg-hover/active`、`button-*-fill`、`button-ghost-active-fill`、`bg-layer-1` |
| 自造投影（`0 8px 22px rgba(0,0,0,.34)` 等 6 处） | pill / rail / 面板 / 弹窗 | 改 `--dsw-shadow-lv1/lv2/lv3` |
| 遮罩 `rgba(0,0,0,.55)` | 弹窗 | 改 `--dsw-alias-bg-mask-1` |
| 字面色（`#4d6bfe` `#10b981` `#f59e0b` `#f87171` `#8b5cf6` `#fbbf24` 等） | 三档条、警示、账单卡、聚焦环、成功文案 | 收敛到 `--dsw-alias-state-*` / 品牌蓝 / 三级面 token |

**探针复核（`node .verify/sidebar-check.mjs` → exit 0）**

| 项 | 值 |
|---|---|
| `frostedLeftovers`（插件内仍带 backdrop-filter 或 feTurbulence 的元素数） | **0** |
| pill / 面板 `backdrop` | `none` / `none` |
| pill / 面板 `backgroundImage` | `none` / `none`（噪点贴图已无） |
| pill / 面板 `border` | `0px none` / `0px none`（沿用用户"不要白色描边"的要求） |
| pill / 面板 面色 | `rgb(67,69,74)`（bluish-750）/ `rgb(53,54,56)`（bluish-800） |
| 卡片 / 徽标 | `rgba(255,255,255,0.08)` / `rgba(255,255,255,0.14)`（interactive 填充） |
| 可读性 | 截图 `02b-panel-only.png` / `05b-panel-billing-only.png`：10% / 22% / 2% 与账单数字清晰 |
| 未退化 | 面板 280×201（账单开 429）、溢出 0、点击→可见 19ms、reduced-motion 动画数 0、收起卸载 |

**没动的**：布局、内边距、圆角（pill 10 / rail 11 / 面板 14 / 弹窗 14 / 卡片 10）、点击区域、字号、三档行几何、动效时长与曲线。唯一 2px 差异：pill 高 31 → 29px，因为不再有 1px 描边参与盒模型。

**三处需用户知晓的判断**（一票可翻）：
1. 账单卡从"自造紫/绿半透明"改成设计系统 `state-business-tertiary` / `state-success-tertiary` 的实色三级面（今日 → 品牌蓝），描边用对应 `…-primary`；系统里没有紫色 token，这是"最接近的语义 token"。
2. 弹窗不再硬编码固定深色：面与文字都跟 token 走（当年白底 bug 的真因是"浅色面 + 固定浅色文字"不匹配，同源 token 不会再有这个问题）。
3. 三档条蓝从 `#4d6bfe` 收敛到项目品牌蓝 `rgb(65,118,230)`（深色侧 `deepseek-450`），色相有极小位移。

**性能**：删掉 blur/噪点后不再有每帧背景采样与额外合成层，低配机器只会更轻（本轮未做帧率 A/B，如需可补）。
