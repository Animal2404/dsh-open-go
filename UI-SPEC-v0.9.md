# Open GO 侧边栏小组件 · UI 规范 v0.9.0

> 参考图（用户提供）= 目标样式：面板三档紧凑列表（`5h 滚动` / `7d 每周` / `1m 每月`，每行 = 名称 + 进度条 + 百分比，下面一行距重置）+ 收起态三档读数条（`GO 5h 7% · wk 12% · mo 85%`）。
> 用户拍板：**以参考图为准整体重做**；**官方账单默认隐藏**，开关放在面板右上角 ⚙ 里。
> 实现：`lib/client.js`（浏览器端，无构建步骤，React.createElement 手写渲染 + 一份注入式 CSS）。

---

## 1. 结构与信息层级

| 区域 | 内容 | 备注 |
|---|---|---|
| 收起态 pill | `GO` 徽标 · 状态点 · `5h 7% · wk 12% · mo 85%` · 箭头 | 三档全部可见（参考图的核心诉求）；账单开启时追加 `· 今日 $x.xxxx` |
| 面板 · 标题栏 | 状态点 · `Open GO` · `HH:mm 更新` · ⚙ · ↻ | 与现状一致，只加动效与可达性 |
| 面板 · 额度 | 直接放中性卡片（v0.9.1 起**不再有「额度」分区标题**），三行：`5h 滚动` / `7d 每周` / `1m 每月` | 每行：名称 + 进度条 + 百分比；次行 `距重置 2h6m` |
| 面板 · 官方账单 | 分区标题「官方账单」+ 今日（紫）/ 本月（绿）两张卡 | **默认不渲染**；由 ⚙ 开关控制，关闭时也不请求官网接口 |
| ⚙ 弹窗 | 顶部 = 「显示官方账单」开关；其下 = workspace id / cookie / 提示 / 取消·保存 | 深色固定配色（主题变量在部分环境会解析成浅色） |
| 窄侧栏 rail | 42×48 竖排迷你卡：三根迷你条 + 月度百分比 + 箭头 | 与 pill 同一套视觉语言 |

## 2. 设计 token

| 项 | 值 |
|---|---|
| 字体 | `-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif`；数字一律 `tabular-nums` |
| 字号 | 标题 13 / 分区标题 12.5 / 行名称 12 / 百分比 12.5·600 / 距重置 11 / 明细 11 / 金额 14·700 |
| 行内宽度 | 名称 52px、百分比 42px（右对齐）、次行缩进 60px = 52 + 8 间隙 |
| 进度条 | 档位 6px、明细 5px，圆角 3px，轨道 = `--dsw-alias-border-l2` 回退 `rgba(127,127,127,.22)` |
| 档位色 | 5h 蓝 `#4d6bfe / #7c93ff`、7d 绿 `#10b981 / #34d399`、1m 琥珀 `#f59e0b / #fbbf24`（亮/暗双值，`light-dark()`） |
| 警示色 | ≥80% 橙 `#f59e0b`；≥95% 红 `#f87171`（进度条与百分比同时变色） |
| 圆角/间距 | pill 9、卡片 9、面板 12、弹窗 12；卡片内 gap 8、行间 gap 3 |
| 面板 | 宽 = 侧边栏宽（≤320，rail 下 260），`max-height:70vh`，细节滚动条 |
| 动效时长 | 进场 200ms / 退场 140ms / 数值补间 480~520ms / 滑块 240ms |
| 缓动 | 进场与数值 `cubic-bezier(.16,1,.3,1)`、滑块与箭头 `cubic-bezier(.34,1.4,.64,1)`（带回弹）、退场 `.4,0,1,1` |

## 3. 与参考图的逐项对照

| 参考图元素 | 本实现 | 说明 |
|---|---|---|
| `GO` 徽标 | ✅ 同 | 10px/800 字重，1px 描边小方牌 |
| `5h 7% · wk 12% · mo 85%` | ✅ 同 | 百分比按档位色着色（参考图是单色，这里做了一点可读性优化） |
| 三行 `5h 滚动 / 7d 每周 / 1m 每月` | ✅ 同 | 名称、进度条、百分比同一行 |
| `重置于 2h6m` | ⚠️ 微调 | 文案沿用上一版的改进「**距重置**」；格式照参考图取紧凑式 `2h6m`，并**每 30s 实时走动**（`1d10h` / `23h36m`） |
| 收起态箭头 | ✅ 同（v0.9.2 修正方向） | 单个 chevron 形状旋转 180°：**收起 ▾ / 展开 ▴**（面板向上展开，展开态朝上，与参考图展开态的 `^` 一致）；带弹簧曲线，不是换图标 |
| 面板锚定在上方、外点收起 | ✅ 同 | 保留原锚定逻辑，缩放原点跟随锚点位置 |
| —（参考图未画） | ➕ 新增 | 官方账单区（可在 ⚙ 里开关）、状态点、错误/降级提示、rail 形态、a11y 语义 |

## 4. 动效清单（全部可被 `prefers-reduced-motion: reduce` 关闭）

1. **面板开合**：`opacity/translateY(7px)/scale(.972)` → 原位，进场 200ms；退场 140ms 后才卸载（`render = open || closing`）。
2. **展开当帧上屏**（v0.9.3 修）：展开前**只量 pill**，用 `bottom` 贴住 pill 上沿定位 —— 不等面板高度测量、不等任何数据；实测「点击 → 可见」**367ms → 19ms**。上屏后只在校正时量一次高度（上方放不下才翻到 pill 下面）。
3. **先展开、后刷新**（v0.9.3，用户要求）：展开动作与网络请求解耦 —— 点击 → 面板上屏（同一帧）→ **下一帧（画完这一帧）才发** `?force=1` 刷新。刷新绝不挡开合（实测：面板 19ms 可见，刷新请求起点 +24ms）。
4. **展开生长**（v0.9.8 按用户要求恢复）：每次展开，三档进度条与百分比都从 0 缓动到**当前数据的真实值**（420ms，ease-out cubic，rAF 补间）；面板收起即卸载整块，所以重复展开必然重播；数据变化时终点随之变化（补间从当前值出发）；`prefers-reduced-motion` 下直接停在终点不播。
5. **倒计时**：30s 心跳，`距重置` 数字自己走，不整块重绘。
6. **刷新**：↻ 转圈（0.8s 线性）+ 状态点呼吸；失败保留上次数据并切橙点。
7. **齿轮**：悬停旋转 45°，按下缩放 .9；弹窗 180ms 弹入。
8. **箭头**：180° 旋转带过冲；**滑块**：弹簧曲线位移 + 轨道 220ms 变色。
9. **交互反馈**：pill / 图标 / 按钮都有 hover 背景与 press 缩放；`:focus-visible` 蓝色描边。

## 5. 可达性

- pill 是真按钮：`aria-expanded`、`aria-label`、键盘 Enter/Space 可开合；`Esc` 收起面板（弹窗开着时只关弹窗）。
- ⚙ / ↻ 是按钮（`aria-label`），弹窗 `role="dialog"` + `aria-modal` + `aria-label`，点遮罩或 `Esc` 关闭。
- 开关 `role="switch"` + `aria-checked`；更新时间用 `role="status"` 播报。
- 颜色不是唯一信号：百分比数字本身带 `%` 与 `title`，警示同时改颜色与提示文案。

## 6. 数据与行为

- 额度：`/dsh-opencode-quota/api/status`，5 分钟轮询，展开面板时立即刷一次（`?force=1` 跳过宿主缓存）。
- 账单：`/dsh-opencode-quota/api/official`，**仅在开关打开时**请求与轮询；关闭即清空并停轮询（不再打官网接口）。
- 配置读写（**齿轮弹窗 ↔ 设置面板同一份**，v0.9.7 起）：
  - `GET /api/config` → `{ workspaceId, hasWorkspaceId, hasCookie, cookieMasked, billing, settingsWritable, source }`；
  - `POST /api/config` → `{ workspaceId?, consoleCookie?, billing? }`；空串=不修改；至少要有一项可落地改动，否则报 `请至少填写一项（workspaceId / consoleCookie），或切换账单开关`（两端同一句）；
  - 落点：**设置存储**（`~/.dsh/settings.yaml` 的 `opencode-quota` 段，与「设置 → 插件 → opencode-quota」同源）+ **凭证文件**（`~/.dsh/.credentials.yaml`，设置服务不可用时的兜底）；响应里的 `persisted` 回报实际写到了哪几处；
  - 读优先级：设置存储 → 环境变量/凭证文件；`settingsWritable=false` 时齿轮仍能用，但弹窗会如实说明"未落盘"。
- 状态持久化：`dshoq-panel-open`（面板开合，纯浏览器状态）；`dshoq-billing-on` 降级为账单开关的**首屏缓存**，权威值在设置存储（挂载时用宿主值校准，弹窗打开时再校准一次）。
- 失败降级：额度失败但手上有旧数据 → 保留旧数据 + 橙点 + 「仍显示上次数据」；从未成功过 → 红点 + 明确错误文案。

## 7. 验收清单

- [ ] 收起态读数是 `5h / wk / mo` 三档，且与面板三行数值一致
- [ ] 面板三行 = 名称 + 条 + 百分比（同一行），次行 `距重置` 紧凑倒计时
- [ ] 面板里**没有**「额度」分区标题（v0.9.1 用户要求去掉）
- [ ] 箭头方向：收起 `▾`、展开 `▴`（v0.9.2 修正；面板向上展开，展开态朝上）
- [ ] 账单默认不显示；⚙ 里开关打开后出现「今日 / 本月」并拉取数据；关掉即消失且停止请求
- [ ] 开关状态与面板开合状态刷新后仍在
- [ ] 面板开合有动效且不闪烁；`prefers-reduced-motion` 下无动效
- [ ] 亮/暗主题下文字与描边都清晰（`light-dark()` + 主题变量回退）
- [ ] **任何主题下都不出现发白描边**（v0.9.4）：pill / 面板 / 弹窗 / GO 徽标都不画白线，边缘只靠深色内圈 + 投影
- [ ] 键盘：Tab 到 pill 可开合、`Esc` 收起、开关可键盘切换

## 8. 材质：亚克力（token 方案，v0.9.5 起）

**先查定义**：全仓 grep `acrylic|Acrylic|亚克力` **无命中** —— 项目没有给这个名字下定义；`磨砂/毛玻璃` 也不是 token，DSH 自己的模糊只出现在 Modal 遮罩的 `--dsw-mask-blur: blur(2px)`。
所以按 `ui-theme` 的**材质词表**（`design-platform.css` 的 alias token + `gradient-shadow-text.css` 的 `--dsw-shadow-lv1..3`）与 `ui-primitives` 的**现成组件配方**（Modal / Button / Input）来实现，未新引入任何依赖，也没有自造色值。

| 部位 | 取值（全部是项目 token，括号内为回退） |
|---|---|
| 收起态 pill / 窄栏 rail | 面 `--dsw-alias-button-floating-fill`（深色侧 = bluish-850 `rgb(44,44,46)`，与图 2 底栏实测一致；v0.9.5 曾用 `button-elevated-fill` = bluish-750，偏白 +23 阶）；悬停 `--dsw-alias-button-floating-hover`（bluish-800）；按下 `--dsw-alias-interactive-bg-active`；抬升 `--dsw-shadow-lv1`（悬停 `--dsw-shadow-lv2`） |
| 展开面板 | 面 `--dsw-specific-menu`（= `--dsw-alias-bg-layer-3` = bluish-800 `rgb(53,54,56)`，与图 2 面板实测一致）；抬升 `--dsw-shadow-lv3` |
| ⚙ 弹窗 | 面 `--dsw-alias-bg-layer-2`（Modal 的卡片配方）；抬升 `--dsw-shadow-lv3`；遮罩 `--dsw-alias-bg-mask-1`（Modal 的 mask token，**不带** 那道 blur(2px)） |
| 面板内层卡片 | **不画面**（v0.9.6 起）：图 2 的面板里就是三档行直接坐在 bluish-800 上，没有更亮的内层卡片；卡片容器只保留 padding/圆角/gap 的布局职责 |
| 进度条轨道（档位条 / 明细条） | `--oq-bar-track` = `--dsw-alias-interactive-bg-hover`（白 8%，叠在面板上 = `rgb(69,70,72)`，与图 2 轨道实测一致）；滚动条滑块仍用 `--oq-track`（`border-l2`，白 12%） |
| `GO` 徽标 / 开关轨道（关） | 面 `--dsw-alias-interactive-bg-hover`（白 8%；v0.9.5 用 active 白 14%，偏白约 20 阶） |
| 开关轨道（开）/ 焦点环 | `--dsw-alias-brand-primary-new-colorprimary-new-color`（设计批准的品牌蓝） |
| 输入框 | 抄 `ui-primitives/Input`：`border: 1px solid --dsw-alias-border-l2` + 面 `--dsw-alias-bg-layer-1`，聚焦 `border-color: --dsw-alias-brand-primary` |
| 按钮 | 抄 `ui-primitives/Button`：取消 = ghost（透明 + `--dsw-alias-interactive-bg-hover`）；保存 = `--dsw-alias-button-ghost-active-fill`（中性实心，悬停 `--dsw-alias-button-ghost-active-hover`） |
| 三档条 / 明细条 / 警示 | 蓝 = 品牌蓝；绿 = `--dsw-alias-state-success-primary`；琥珀 = `--dsw-alias-state-warn-primary`；警示红 = `--dsw-alias-state-error-primary` |
| 账单卡 | 今日 = `--dsw-alias-state-business-tertiary` / 描边 `…-business-primary`；本月 = `--dsw-alias-state-success-tertiary` / `…-success-primary` |
| 边缘 | **不画白描边**（沿用 v0.9.4 的用户要求）：深色侧不描边；浅色侧那条分界线用 `light-dark(var(--dsw-alias-border-l2), transparent)` —— 只在浅色主题出现、且是深色细边 |

**下线清单（磨砂相关，全部移除，探针复核 `frostedLeftovers: 0`）**：`backdrop-filter`（原 20px/24px 两处）、内联 SVG `feTurbulence` 噪点贴图、`--oq-glass/--oq-glass-hi/--oq-ring/--oq-noise` 四个自造变量、以及所有自造 alpha 的面/叠加层（`rgba(...)` 现在只作为 `var()` 的回退值存在）。

**没动的**：布局、内外边距、圆角（pill 10 / rail 11 / 面板 14 / 弹窗 14 / 卡片 10）、点击区域、字号、三档行的几何、动效时长与曲线 —— 只换材质表现。

**坑（记一笔）**：`<button>` 有浏览器默认 `border: 2px outset ButtonBorder`（渲染出来就是一圈发白的 3D 边）。v0.9.4 把自绘的 `border` 删掉换成内圈后，这条默认边**冒出来了** —— 截图里那圈白线就是它。修法：`border:0` 显式兜底（pill / rail / 图标 / 开关 / 输入框 / 按钮全部显式声明）。

## 9. 版本追补

- **v0.9.1**（2026-09-13）：按用户截图要求**去掉展开面板里的「额度」分区标题**，三档卡片直接跟在标题栏下（面板高度 239 → 201px）；账单打开时「官方账单」分区标题与分隔线保留，作为额度与账单之间的分界。探测：`sectionTitles` 由 `["额度"]` 变为 `[]`（账单关）/ `["官方账单"]`（账单开）。
- **v0.9.2**（2026-09-13）：按用户反馈**把收起态箭头掉了个头** —— 收起 `▾`、展开 `▴`（原实现是收起 `▴`/展开 `▾`，与参考图展开态 `^` 相反）。实现只改一处：旋转条件从 `--open` 改成 `--closed`（基础形状本身是朝上的 chevron）。探测新增 `chev`：收起 `matrix(-1,0,0,-1,0,0)`（=180°）、展开 `none`。
- **v0.9.3**（2026-09-13）：按用户反馈「点开太慢、要先展开再刷新」修开合时序。三处改动：① 定位不再等面板高度（只量 pill + `bottom` 锚定）；② `render = open || closing`，展开与挂载同一帧；③ 刷新改到**上屏后下一帧**才发；④ 数据已在手上时展开直接显示真值。实测「点击 → 可见」**367 → 19ms**，刷新请求起点 +24ms（在可见 +19ms 之后）。
- **v0.9.4**（2026-09-13）：按用户反馈「不要白色描边、要磨砂亚克力」换材质。① 材质换成 §8 那套（半透明 + `backdrop-filter` 模糊 + 噪声颗粒 + 顶部微光）；② 所有描边换成深色内圈（pill / rail / 面板 / 卡片 / GO 徽标 / 弹窗 / 开关 / 输入框 / 按钮）；③ 修掉被放出来的浏览器默认按钮白边（`<button>` 的 `2px outset`）—— 这才是那圈白线的真身。弹窗与面板都验证过计算样式 `border: 0px none`。
- **v0.9.5**（2026-09-13）：按用户要求**把磨砂质全部换成亚克力**（模糊/噪点/半透明叠加一律下线，见 §8）。① 面改走 `button-elevated-fill` / `specific-menu` / `bg-layer-2`，抬升改走 `shadow-lv1/2/3`，交互改走 `interactive-bg-*`，遮罩改走 `bg-mask-1`；② 输入框/按钮直接抄 `ui-primitives` 的 Input/Button 配方；③ 色值收敛到 `--dsw-alias-*`（三档条、警示、账单卡），`rgba()/hex` 只剩 `var()` 回退；④ 弹窗不再用「固定深色」硬编码，改成跟主题 token 走（当年那个白底 bug 的真因是「浅色面 + 固定浅色文字」不匹配，同源 token 不会再有这个问题）。探针：`backdrop: none`、`bgImage: none`、`frostedLeftovers: 0`、pill `rgb(67,69,74)`、面板 `rgb(53,54,56)`；布局/圆角/点击区域与 v0.9.4 一致（pill 高 31 → 29px，因为不再有 1px 描边参与盒模型）。
- **v0.9.6**（2026-09-13）：**消除泛白**。取证发现 dsh 深色侧自带白色叠加 token（`interactive-bg-hover` 白 8% / `-active` 白 14% / `border-l2` 白 12%），它们的设计用途是「状态叠加/描边」而不是「面」——把它们当面用就泛白。四处定点修正（**只动 background/变量值，布局零改动，受控 A/B 的 `panel.offsetHeight` 改前改后都是 197**）：内层卡片不再画面（图 2 里也没有）、pill 换 `button-floating-fill`（bluish-850 = 图 2 底栏色）、徽标降到白 8%、轨道改用白 8%。像素复核：白 8% 卡片色占比 **56.85% → 3.52%**（图 2 = 2.58%），面板主色占比 **28.11% → 85.00%**（图 2 = 64.01%，余差来自裁切范围）。详见 `.verify/PHASE1-COLOR-AUDIT.md`、`.verify/PHASE3-COLOR-EVIDENCE.md`。
- **v0.9.7**（2026-09-13）：齿轮设置全量对齐（清单见 `.verify/GEAR-SETTINGS-INVENTORY.md`）。① 新增 `billing` 到宿主 schema（默认 `false`，描述与弹窗副文案**同句**），设置面板从此也有这一项；② 齿轮保存改为**同时**写凭证文件与**设置存储**（`settings.update`），设置面板不再显示旧/空值；③ 修掉一个真 bug：`writable` 在**服务**（`ctx.settings.writable`）上，`SettingsScope` 没有这个字段——原判断让写回被自己短路（实测 `settingsWritable` 由 false → true）；④ GET 增 `billing`/`settingsWritable`，POST 增 `billing` 入参、统一「至少一项可落地改动」校验与两端文案、返回 `persisted`；⑤ 客户端挂载与开弹窗时都用宿主值校准开关（换浏览器不再丢设置），开关改动即时落盘。实测：开关点两下 → 存储 `billing` 跟随；点保存 → `persisted:["credentials","settings"]`、`source` 由 `credentials` 变 `settings`；`settings.yaml` 只多出 `opencode-quota: {billing:false, workspaceId:…}` 一段，凭证文件的 cookie 行未变。
- **v0.9.8**（2026-09-13）：按用户要求给「展开」加进度条生长动画 —— 从 0 缓动到当前数据进度并停住（终点 = `/api/status` 的实时 percent，不写死）；同时把账单明细条一并纳入。实测：首帧宽度 0px → 终态 31.7px/132px = **24%**（与页面读数、接口数据一致）、25 个不同宽度且单调递增、收起后确认面板已卸载再展开仍从 0 重播；中途帧 80ms=15%、260ms=24%。
