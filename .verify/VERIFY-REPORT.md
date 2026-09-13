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
