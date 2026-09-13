# Open GO（dsh-open-go）开发记录

> 插件全名：`@dsh-external/dsh-opencode-quota` → 仓库/品牌名 **dsh-open-go**
> 用途：DeepSeek Harness Web 侧边栏的 Open GO 套餐额度 + 官方账单小组件
> 技术栈：DSH 插件（宿主 `lib/index.js` + 浏览器端 `lib/client.js`），React 手写渲染，无构建步骤

---

## 一、架构总览

```
DSH Web 侧边栏（sidebar.footer.action 插槽）
        │
        ├─ lib/client.js  （浏览器注入组件 QuotaWidget）
        │     └─ 轮询 /dsh-opencode-quota/api/* （带自定义头 x-dsh-opencode-quota: 1）
        │
        └─ lib/index.js   （宿主进程，注入 webServer + settings）
              ├─ GET /api/status    额度（滚动/每周/每月百分比 + 重置时间）
              ├─ GET /api/official  官方账单（本月按日×模型，今日/本月分块）
              └─ GET/POST /api/config  配置 workspace id + cookie（写 ~/.dsh/.credentials.yaml）
```

- 凭据只存在宿主侧（`~/.dsh/.credentials.yaml` + 设置面板），**绝不下发浏览器**；cookie 字段用 `role('secret')` 显示为密码框。
- 客户端每 5 分钟自动轮询额度，官方账单每 5 分钟轮询（`?force=1` 跳过缓存一键刷新全部）。

---

## 二、官方接口逆向（核心成果）

### 1. 额度接口（官方，公开）

```
GET https://opencode.ai/zen/go/v1/usage
Authorization: Bearer <OPENCODE_GO_API_KEY>
```

响应 `{ usage: { rolling, weekly, monthly: { status, percent, resetsAt } } }`。
档位上限：rolling $12 / 每周 $30 / 每月 $60（percent 为整数，仅百分比，无美元值）。

### 2. 官方账单 RPC（控制台 getCosts，非本地估算）

这是最难的逆向。opencode.ai 用量页的"按日成本图表"走 SolidStart 的**服务端函数**，不是普通 REST：

```
POST https://opencode.ai/_server?id=15702f3a12ff8bff357f8c2aa154a17e65b746d5f6b96adc9002c86ee0c15205
headers: content-type: application/json
         x-server-id: <同上 hash>
         x-server-instance: server-fn:<n>
         referer: https://opencode.ai/workspace/<ws>/usage
         Cookie: <登录 cookie>
```

**请求体是 seroval 流式序列化格式**，排错过程中踩了三个大坑：

```jsonc
{ "t": { "t": 9, "i": 0, "l": 4, "a": [
    { "t": 1, "s": "<workspaceId>" },
    { "t": 0, "s": 2026 },          // 年
    { "t": 0, "s": 7 },             // 月，0 基（7 = 8 月）
    { "t": 1, "s": "+08:00" }       // 时区偏移是字符串
  ], "o": 0 },
  "f": 31, "m": [] }
```

- 坑 1：数组节点必须带 **`l`（数组长度）** 字段，缺了服务端解析失败。
- 坑 2：**`f` 必须是 31**（不是 127！），`f` 错会得到 "Invalid time value" 类失败。对照浏览器实际请求逐字节对齐（Content-Length 148 完全一致才算对）。
- 坑 3：`month` 是 **0 基**（7=8 月）；`tzOffset` 是字符串 `"+08:00"`。

响应是 seroval 流，用正则提取 `{date:"...",model:"...",totalCost:<n>}`，成本单位为 **1e-8 美元**（`×1e-8` 转美元）。

### 3. 价格核算（备用方案，已弃用）

插件曾内置 pi-ai `opencode-go.json` 的价格表（deepseek-v4-flash 等 in/out/cache 单价）做本地估算，精度与官方字段误差仅 $0.00000004——算法是对的，但最终仍以官方 RPC 为准（用户要求官方数据）。

---

## 三、开发中遇到的问题与解决

### 1. PowerShell 写坏 UTF-8 中文（事故×2，重要教训）

- **package.json 事故**：用 PowerShell `(Get-Content -Raw) -replace | Set-Content` 改 description 里的中文 → 字节被破坏成 U+FFFD → `dsh web` 直接崩溃（JSON 解析失败），用户手动修复并留下 FIX-REPORT。
- **README 事故**：`Get-Content -Raw .Replace() + WriteAllText(UTF8)` 再次损坏中文。
- **结论（永久铁律）**：**任何含中文的 UTF-8 文件绝不用 PowerShell 字符串命令改写**，一律用 write/edit 工具；校验用 `node -e`（UTF-8 读取），不用 PowerShell `Get-Content` 判断。

### 2. 缺依赖导致 import 崩溃

schemastery 是 `@deepseek-ai/schemastery`（^3.18.1），settings 是 `@deepseek-ai/dsh-settings`（0.1.0-rc.6），插件必须有自己的 `node_modules`。漏装 → 宿主加载即崩。`npm install` 后解决。

### 3. 静默重启（无弹窗）

用户要求"重启 web 无弹窗"。宿主通过 `POST /dsh-silent-restart/api/restart` + 头 `x-dsh-silent-restart: 1` 触发静默重启（约 10-14 秒），PID 变化即成功。改宿主代码/配置后必须重启才生效；改 client.js 后浏览器 **Ctrl+Shift+R** 硬刷新（bundle 带内容哈希）。

### 4. cookie 是 httpOnly（教程修正）

`copy(document.cookie)` 返回 undefined——auth cookie 是 httpOnly，JS 读不到。教程改为 **F12 → Network → 刷新 → 请求头 `cookie:` 行复制**（或 Application → Cookies）。

### 5. 「今日」时区 bug（真 bug）

`/api/official` 聚合时 `todayKey = now.toISOString().slice(0,10)` 用的是 **UTC 日期**，而 getCosts 数据按 **+08:00** 分桶 → 北京时间 0–8 点会把"昨天"当"今日"。修复：统一用 `bjy = new Date(now.getTime() + 8*3600*1000)` 推导年/月/今日。

### 6. 账单显示问题（一轮 UI 打磨）

- **舍入矛盾**：`fmtUsd` 每个值单独 `toFixed(2)`，总额与明细之和肉眼对不上（$2.12 vs $2.13）——数据同源，纯显示问题。
- **本月重复显示**：标题行和绿色本月块都显示"本月 $X" → 去掉标题行那份。
- **文案**：「重置于」→「距重置」。
- **UI 割裂**：额度区（平铺列表）和官方账单区（彩色圆角卡片）两套风格 → 额度区也改"分区标题「额度」+ 中性卡片"，整块统一成"标题 + 卡片"语言；账单明细行改为内联进度条与额度行一致。
- **字体偏小**：整体字号 +1px（标题 13px、额度行 12px、明细 11px、金额 14px），进度条 6→8px，固定宽度配合微调。

### 7. 额度偶尔「获取失败」

- 根因：`fetchUsage` **零重试**（官方账单有 3 次重试，额度没有），网络抖动一次就挂。
- 修复：3 次重试（1.5s 退避）+ 明确报错分类（key 过期 / 限流 / 服务端异常 / 网络）+ 客户端刷新失败**保留上次数据**（黄条提示"仍显示上次数据"），不再闪没。

### 8. settingsValue 冻结对象报错

`ctx.settings.register(...)` 返回的对象不可扩展（frozen），`saveCredentials` 里 `settingsValue.workspaceId = ...` 抛 "Cannot add property ... not extensible"。修复：`settingsValue = Object.assign({}, settings.get() || {})` 用可变浅拷贝。

### 9. 配置弹窗白底/蓝按钮（主题适配）

- 弹窗背景用 `var(--dsw-alias-bg-layer-1, #1e1e20)`，但主题变量在用户环境解析成浅色 → 白茫茫一片看不清。
- 修复：弹窗背景/输入框/按钮全部改**固定深色**（`#1e1e20`/`#26262a`/`#e6edf7`），不依赖主题变量。
- 「保存」按钮最初蓝色 `#4d6bfe` 被否（不符合主题）→ 改中性深灰 `rgba(127,127,127,.22)` + 细边框，与「取消」同族。

---

## 四、自动抓取 Cookie 的尝试与放弃（v0.6.6 → v0.7.0）

### 需求
cookie 过期后不想手动 F12 复制，做"一键自动抓取"。

### 技术路线（CDP）
Chrome DevTools Protocol 读 httpOnly cookie：起一个带 `--remote-debugging-port` 的 Chrome → `Network.getAllCookies` 读 opencode.ai 的 auth。

### 踩坑清单
1. **Node spawn 起 Chrome 失败**：`--user-data-dir=C:\...\User Data` 的**空格**被拆 → Chrome 把路径当 URL 打开目录列表、端口起不来。改用 PowerShell `Start-Process` 成功。
2. **headless 不能跑现有配置**：`--headless=new` + 真实 `User Data` 直接秒退。只能可见模式。
3. **.lnk 快捷方式引号解析**：带引号的 Arguments 在快捷方式里解析异常、端口不生效；改用 **8.3 短路径**（`USERDA~1`，无空格）后正常。
4. **根本性障碍**：opencode 的 auth cookie 是**会话级**（cookie 库元数据 `expires_utc=0`），只活在**正在运行的那个 Chrome 内存**里。另起的 Chrome 读磁盘库只有旧的/过期的 → 抓到的一直无效。
5. **事故**：排查中反复 `taskkill /F` 强杀用户 Chrome → 内存会话 cookie 全丢 → 用户的 opencode/GitHub 登录全掉了。用户明确不满。

### 结论（v0.7.0 移除）
自动抓取在"会话级 cookie + 必须另起实例"的组合下**原理上不可靠**，且调试过程损害了用户登录状态，得不偿失。**v0.7.0 彻底移除**（按钮、`/grab-cookie` 接口、CDP 代码、桌面快捷方式全下线），回归纯手动配置。

### 意外收获：cookie 格式规律
账单 RPC 吃的就是浏览器实际发送的完整串：
```
auth=Fe26.2**...; oc_locale=zh
```
手动从 F12 Network 复制 `cookie:` 请求头整行即可，不需要自己拼。已写进 README。

---

## 五、视觉/模型问题（pi-ai 图片输入）

### 现象
普通 DeepSeek V4 Flash 发图片 → `pi-ai image input requires the durable attachment service / UNSUPPORTED_CONTENT`；必须用 opencode-go (modlens vision) 组的 DeepSeek V4 Flash。

### 根因（读 dsh-llm-pi-ai 源码）
```
lib/index.js L827-832:
  containsImage && model.input.includes("image")
    → attachments = this.config.resolveAttachments?.()   // = ctx.get("attachments")
  attachments === undefined → throw LlmError("...durable attachment service", "UNSUPPORTED_CONTENT")
```
- pi-ai 目录把 DeepSeek V4 Flash 声明为**支持图片**（`input: [text, image]`）；
- 带图时必须走 `ctx.get("attachments")`（DSH 附件服务，把图片转成持久 URL）——当前环境**没有挂载任何 attachments 服务** → 报错；
- opencode-go (modlens vision) 组的模型被标记为纯文本，图片由 modlens 中间件用视觉模型（qwen3.6-plus，走 OPENCODE_GO_API_KEY）读成文字 → 模型只收文本，不触发附件服务。

### 处理
这是平台/适配器层面的约束，插件侧无法绕开：**看图必须选 opencode-go (modlens vision) 模型组**。

---

## 六、GitHub 发布流程（用户要求固化）

1. 版本号：`package.json` version 递增（语义化，如 0.6.x → 0.7.x）。
2. 改完立即 **commit + push**（用户明确要求："只要更新了 Open GO 就马上推送 GitHub"）。
3. Release：`gh release create vX.Y.Z --notes-file ...`，README 与 Release 截图放 `assets/`（README 用 raw 链接，更新文件即自动更新渲染）。
4. 仓库名：`Animal2404/dsh-opencode-quota` → **`Animal2404/dsh-open-go`**（gh repo rename，旧名自动跳转）。

---

## 七、经验教训汇总（最重要）

1. **绝不碰用户的浏览器进程**——taskkill /F 会毁掉会话级登录，这是本插件开发中最大的事故，也是最终砍掉自动抓取功能的直接原因。
2. **中文文件只用 write/edit 工具改**，绝不用 PowerShell 字符串改写（UTF-8 损坏事故×2）。
3. **先验证再动手**：对官方接口先抓真实请求逐字节比对（seroval 的 l/f 字段就是这么对的），不要猜。
4. **UI 要跟主题走**：别用会随主题变量漂移的颜色，重要弹窗用固定色。
5. **数据优先官方**：能调官方 RPC 就别用本地估算，用户在乎"官方准确"。
6. 用户会在意细节（字体、配色、按钮文案、舍入一致性），改 UI 后要实际截图核对，不要光看代码。
7. **给容器加动效之前先清点它内部的 `fixed` 子元素**：`transform`（含 `animation` 里的）会把容器变成包含块，`position:fixed` 的浮层会被容器接管定位并被裁切（见 §八）。
8. **语法/编译通过 ≠ 看着对**：本轮的真 bug（弹窗被面板裁掉）语法一点问题都没有，是无头浏览器截图一眼看出来的——UI 改动一律真截图。

---

## 八、v0.9.0：按参考图整体重做 UI + 账单开关（2026-09-13）

**需求**（参考图 + 用户当场拍板）：面板改成三档紧凑列表（`5h 滚动` / `7d 每周` / `1m 每月`：名称 + 进度条 + 百分比，下一行「距重置」）；收起态 pill 显示三档读数（`GO 5h 7% · wk 12% · mo 85%`）；官方账单**默认隐藏**，开关放右上角 ⚙ 里；在此基础上做动效与细节优化。

**改了什么**
- `lib/client.js` 重写（v0.8.0 → v0.9.0，仍无构建步骤）：一份注入式 CSS（类名 `dshoq-*`）+ React.createElement 渲染；三档元数据从 `每5小时/每周/每月` 改为参考图用语 `5h 滚动 / 7d 每周 / 1m 每月`，pill 里用短标签 `5h/wk/mo`。
- 收起态：`<button class="dshoq-pill">`（`GO` 徽标 + 状态点 + 三档读数 + 箭头），替代原「一条月额度条 + 今日消费」；带 `aria-expanded`，键盘可开合。
- 展开面板：标题栏 + 「额度」卡片（三行）+ 可选「官方账单」；三档行的「距重置」用 `resetsAt` 现场算成紧凑式（`2h6m` / `1d10h` / `29d10h`），**每 30s 心跳自己走**，不再依赖宿主返回的中文长句。
- 账单开关：`localStorage['dshoq-billing-on']`（默认 false）；关着时**既不渲染、也不请求** `/api/official`——原来是无条件 5 分钟轮询官网接口。
- 动效：面板进出场（200ms / 140ms，只动 transform + opacity）、数值与进度条 ease-out 补间并从 0 生长、齿轮悬停旋转、箭头旋转变向、状态点呼吸、开关弹簧滑块；全部可被 `prefers-reduced-motion` 关掉。
- 警示：≥80% 橙、≥95% 红（进度条 + 百分比 + pill 里的数字同步变色）。
- 文档：新增 `UI-SPEC-v0.9.md`（参考图逐项对照 + token + 动效/可达性清单 + 验收表），README 重写功能与截图。

**验证方式（这轮建立的可复用套路）**
`.verify/sidebar-check.mjs`：零依赖无头 Chrome + CDP —— 用 `~/.dsh/.credentials.yaml` 里的 `client-connection/browser-session` 密钥自签一个 127.0.0.1 会话 cookie，打开**正在运行的** dsh web，依次截 pill / 面板 / ⚙ 弹窗（开关关→开）/ 账单展开 / 收起态，并打印几何与样式探针（溢出、圆角、字号、动画名、滑块 transform、localStorage）。约 1 分钟跑完，不重启宿主、不碰用户浏览器进程。
结果记在 `.verify/VERIFY-REPORT.md`：10 项检查通过，4 项缺口（亮色主题被宿主钉死、rail 未截图等）明确列出。

**踩坑（本轮最值钱的一条）**
- **祖先的 `transform` 会抢走 `position:fixed` 子元素的定位**：面板为了进场动效加了 `animation` + `transform-origin` → 留在面板里的 ⚙ 弹窗（`position:fixed; inset:0`）被面板接管包含块，宽度 340 被压成 278，还被 `overflow-y:auto` 裁掉半截、跟着面板滚动。首轮截图一眼看到（探针同时给出 `parent: dshoq-scope dshoq-backdrop`、`w: 278`）。
- 修法：弹窗改成独立 `ReactDOM.createPortal(document.body)`；「点外收起」判断补 `dlgRef` 放行（否则点弹窗会把面板一起关掉）；面板收起时同时 `setCfgOpen(false)`，不留孤儿浮层。

## 九、v0.9.7：齿轮设置与设置面板同源（两个配置面必须共用一份真相）

**背景**：同一个插件的配置有两个入口 —— 面板右上角 ⚙ 弹窗，和「设置 → 插件 → opencode-quota」（由 `ctx.settings.register` 渲染）。
改之前它们**各写各的**：齿轮把值写进 `~/.dsh/.credentials.yaml` + 内存副本，设置面板读的是设置存储（`~/.dsh/settings.yaml`）。
取证方式：读两个文件 + 打一次 `GET /api/config` —— 设置存储里根本没有 `opencode-quota` 段，而凭证文件有值，
所以"齿轮显示已配置、设置面板一片空白"是必然结果；更糟的是 `source` 字段还会谎报 `settings`。

**修法**：配置项一律以**设置存储**为准。齿轮保存时 `settingsScope.update({...})` 写回设置存储，
凭证文件降级为"设置服务不可用时"的兜底；账单开关也进 schema（`billing`，默认 `false`），两端字段集从此一致。

**踩坑（三条，都比结论值钱）**
- **`SettingsScope` 没有 `writable` 字段**：`writable` 在**服务**上（`ctx.settings.writable`）。写 `if (!scope.writable) return`
  会把 undefined 当 false → 写回路径被自己的判断静默短路（现象：代码"跑了"但文件永远不变）。**教训：读 API 前先看 d.ts 的接口面**，
  这次是 `@deepseek-ai/dsh-settings/lib/types/index.d.ts` 的 `SettingsScope` 定义把字段列得清清楚楚。
- **热重载会把 loader entry 弄丢**：`dev_reload_package` 对宿主侧插件报 `activeEntry=none`，重载后 entry 变 `[failed]`，
  再重载也救不回来（路由还是旧实例在应答，容易误判"改动已生效"）。**教训：宿主侧改动别指望热重载**；
  先用 `node --input-type=module -e "import('file:///…/lib/index.js')"` 证明模块本身能加载，再走一次干净重启。
- **验证脚本要先确认前置状态**：齿轮探针第一版失败，是因为它在"弹窗已关闭"的步骤里找 `.dshoq-switch`（拿到 null）。
  探针要显式打开弹窗、并在结尾复原状态（开关交回 false、cookie 不回填），否则会给用户留下测试态。

**证据**：`.verify/GEAR-SETTINGS-INVENTORY.md`（26 处清单 + 逐项决策）、`.verify/gear-run.log`（全流程探针原文）、
`settings.yaml` 与备份的 diff（只多出 `opencode-quota:` 段）、凭证文件 cookie 行未变。
