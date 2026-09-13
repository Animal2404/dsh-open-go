# 齿轮设置 · 全量清单与逐项决策（先查全，再改）

> 「齿轮设置」= 面板右上角 ⚙ 按钮打开的「Open GO 设置」弹窗，以及它所配置的全部字段（账单显示开关、Workspace ID、控制台 Cookie）与其读写落点。
> 本文是**改前**的盘点：每处都标注了它为什么属于齿轮设置，以及是否需要改。

## 0. 关键证据（改前实测）

| 证据 | 命令/来源 | 结果 |
|---|---|---|
| 设置存储里没有本插件的命名空间 | 读 `~/.dsh/settings.yaml` | 只有 `opencode-go`（**别的**插件的命名空间），**没有 `opencode-quota`** |
| 齿轮读到的值来自凭证文件 | `GET /dsh-opencode-quota/api/config` | `{"workspaceId":"wrk_01KZ…FWHX","hasCookie":true,"source":"credentials"}` |
| 仓库无测试/类型检查/构建/lint | `package.json` | `"scripts": null`，且无 `tsconfig*/eslint*/vitest/jest/Makefile/.github` |
| 设置服务**有**写 API 可用 | `@deepseek-ai/dsh-settings/lib/types/index.d.ts` L99-114、L241-275 | `scope.update(patch)`、`ctx.settings.update(ns, patch)`、`replace`、`mutate`、`scope.writable` |

## 1. 客户端 `lib/client.js`

| # | 位置 | 为什么属于齿轮设置 | 决策 |
|---|---|---|---|
| C1 | L35 `HOST_API_CONFIG` | 齿轮读写宿主的唯一通道 | **改**：GET 结果新增消费 `billing` / `settingsWritable` |
| C2 | L40 `BILLING_KEY='dshoq-billing-on'` | 齿轮开关的持久化键 | **改**：降级为「首屏缓存」，权威值改为宿主设置存储 |
| C3 | L214+ `.dshoq-switch*`/`.dshoq-field`/`.dshoq-input`/`.dshoq-btn*`/`.dshoq-hint` | 齿轮弹窗专用样式（v0.9.5/6 刚对齐 token） | 不改 |
| C4 | L461-465 `billing` + `setBillingPersist` | 齿轮开关的状态本体 | **改**：状态变化同时写宿主；挂载时用宿主值校准 |
| C5 | L522-526 `cfgOpen`/`cfgData` | 齿轮弹窗状态 | **改**：`cfgData` 增加 `billing`、`settingsWritable` |
| C6 | L625 Esc 先关弹窗 | 齿轮交互 | 不改 |
| C7 | L645-664 `openCfg` | 齿轮打开时读宿主配置 | **改**：用宿主 `billing` 校准开关 |
| C8 | L665-685 `saveCfg` | 齿轮保存按钮 | **改**：body 带 `billing`；提示文案按宿主返回的 `persisted` 说明 |
| C9 | L787-805 ⚙ 按钮（`title`/`aria-label`/glyph） | 齿轮入口 | 不改（文案已准确） |
| C10 | L823-893 弹窗 DOM（标题/开关行/两字段/提示/按钮/portal） | 齿轮弹窗主体 | **改**：开关行副文案与宿主 schema 描述**同句**；错误/成功提示与宿主文案对齐 |
| C11 | L6-12 文件头注释 | 描述齿轮行为 | **改**：说明开关已改为宿主持久化 |

## 2. 宿主 `lib/index.js`

| # | 位置 | 为什么属于齿轮设置 | 决策 |
|---|---|---|---|
| H1 | L25/27/40 `inject=['webServer','settings']` + namespace | 齿轮字段的注册处 | 不改 |
| H2 | L43-50 `Config` schema | 齿轮字段的**权威定义**（设置面板据此渲染） | **改**：新增 `billing`（`z.boolean().default(false)`，描述与弹窗副文案同句） |
| H3 | L53-75 `settingsValue` + 读取优先级 | 齿轮值的读取链 | 不改（`watch` 已同步） |
| H4 | L137-161 `saveCredentials` | 齿轮保存的落点（凭证文件 + 内存） | **改**：保留凭证文件兜底，但**同时写回设置服务**，否则设置面板永远看不到齿轮存的值 |
| H5 | L552-565 settings 注册 + `watch` | 设置面板入口 | **改**：把 scope 提到模块级，供保存路径写回；记录 `writable` |
| H6 | L575-604 `/api/config` GET/POST | 齿轮读写接口 | **改**：GET 增 `billing`/`settingsWritable`；POST 接受 `billing`、校验统一为「至少一项可落地改动」、返回 `persisted` |

## 3. 文档与元数据

| # | 位置 | 为什么属于齿轮设置 | 决策 |
|---|---|---|---|
| D1 | `package.json` description | 提到「⚙ 里的账单开关」 | **改**：改为两个入口都提 |
| D2 | `README.md` 配置章节 | 齿轮 vs 设置面板的入口说明 | **改**：写明两者同源、默认值、存放位置 |
| D3 | `UI-SPEC-v0.9.md` §6 数据与行为 / §8 / §9 | 齿轮行为契约 | **改**：补 v0.9.7 追补 |
| D4 | `DEVELOPMENT-LOG.md` | 齿轮踩坑记录 | **改**：追加「两个配置面必须同源」教训 |
| D5 | `.verify/PUBLISH-*.md`、`.verify/probes-*.json` | 历史留档 | **不改**（历史证据不改写） |
| D6 | `.verify/sidebar-check.mjs` | 齿轮探针 | **改**：新增齿轮全流程探针（打开→开关→保存→回读→设置存储落盘） |

## 4. 看起来相关但**不属于**齿轮设置（不动，说明原因）

| 位置 | 原因 |
|---|---|
| `.credentials.yaml` 的 `refs`/`records` 结构与 `TAVILY_API_KEY` 等 | DSH 自己的凭证存储，由 DSH 的 credential provider 管理；本插件只写自己的两个键（兜底路径），格式改造会破坏用户既有文件 |
| `/api/status`（额度）与 `/api/official`（账单数据） | 数据接口，不是配置入口；它们只**读**齿轮配置 |
| `dshoq-panel-open` / pill / 面板开合 | 展示状态，不是设置项 |
| 宿主设置面板自身（`ui-settings-*` 包） | 由 DSH 提供，本插件只提供 schema 与描述 |

## 5. 判定的不一致（本轮要修的）

1. **读写不同源**：齿轮保存 → 只写凭证文件 + 内存；设置面板读设置存储 → 面板永远显示旧/空值，`source` 字段还会谎报 `settings`（H4/H5/H6）。
2. **字段集不一致**：齿轮有「显示官方账单」开关，schema 里没有 → 设置面板缺这一项，且换浏览器就丢（H2/C2/C4）。
3. **校验与文案口径不一致**：加入 billing 后，「至少填写一项」的判定必须两端一致；开关副文案与 schema 描述必须同句（H6/C8/C10）。
4. **文档不同步**：D1/D2/D3/D4 仍按「齿轮单入口 + 本地开关」描述。

## 6. 逐项结果（改完之后回填：每处是否已改 + 证据）

| # | 位置 | 是否已改 | 证据 |
|---|---|---|---|
| C1 | client `HOST_API_CONFIG` | ✅ 已改 | GET 消费 `billing`/`settingsWritable`（client L670-680、L695-705） |
| C2 | client `BILLING_KEY` | ✅ 已改 | 降级为缓存：挂载时 `setBillingPersist(j.billing)` 校准（client L466-479） |
| C3 | client 弹窗样式类 | ⛔ 未改 | 与齿轮行为无关；v0.9.5/6 刚对齐 token |
| C4 | client `billing` state | ✅ 已改 | 开关改动 → `persistBilling()` 即时 POST（client L688-712） |
| C5 | client `cfgData` | ✅ 已改 | 新增 `billing`/`settingsWritable`（client L544） |
| C6 | client Esc 处理 | ⛔ 未改 | 行为正确，无需动 |
| C7 | client `openCfg` | ✅ 已改 | 用宿主值校准开关 + 填 `billing`（client L663-687） |
| C8 | client `saveCfg` | ✅ 已改 | body 带 `billing`；提示按 `persisted` 区分（client L713-738） |
| C9 | client ⚙ 按钮 | ⛔ 未改 | title/aria 文案仍准确 |
| C10 | client 弹窗 DOM | ✅ 已改 | 副文案与 schema 描述同句（`客户端 L895 ↔ 宿主 L43`）；开关接 `cfgData.billing` + `persistBilling` |
| C11 | client 头注释 | ✅ 已改 | 补配置读写契约（client L12-18） |
| H1 | 宿主 inject/namespace | ⛔ 未改 | 无需动 |
| H2 | 宿主 `Config` schema | ✅ 已改 | 新增 `billing: z.boolean().default(false).description(BILLING_DESC)`（宿主 L43-54），实测 `Config({})` → `{"billing":false}` |
| H3 | 宿主读取优先级 | ⛔ 未改 | `watch` 已同步存储值 |
| H4 | 宿主 `saveCredentials` | ✅ 已改 | 保留文件写入 + 新增 `persistToSettings()` 写回（宿主 L62-90、L630-646） |
| H5 | 宿主 settings 注册 | ✅ 已改 | scope 提到模块级 + `settingsWritable = ctx.settings.writable`（宿主 L580-587）——**修掉 `scope.writable` 读错字段的真 bug** |
| H6 | 宿主 `/api/config` | ✅ 已改 | GET 增 `billing`/`settingsWritable`；POST 增 billing、统一校验与文案、返回 `persisted`（宿主 L604-660） |
| D1 | `package.json` 描述 | ✅ 已改 | 改为"⚙ 齿轮弹窗与设置面板共用同一份配置" |
| D2 | `README.md` 配置章节 | ✅ 已改 | 新增两入口对照表 + 同源说明 + `billing` 字段 |
| D3 | `UI-SPEC-v0.9.md` §6/§9 | ✅ 已改 | §6 补配置契约；§9 补 v0.9.7 追补 |
| D4 | `DEVELOPMENT-LOG.md` | ✅ 已改 | 新增第九节（同源原则 + 三条踩坑） |
| D5 | `.verify/PUBLISH-*`/`probes-*` 历史 | ⛔ 未改 | 历史证据不改写 |
| D6 | `.verify/sidebar-check.mjs` | ✅ 已改 | 新增齿轮全流程探针（先开弹窗、结尾复原） |

## 7. 验证证据（本轮实跑）

- `node --check lib/index.js` / `lib/client.js` → 均 SYNTAX OK；
- 宿主模块可加载：`node --input-type=module -e "import(…)"; Config({})` → 导出 `BILLING_DESC, Config, …, apply, inject`，校验结果 `{"billing":false}`；
- 齿轮全流程探针（`.verify/gear-run.log`）：`before.billing=true → afterOff.billing=false → afterOn.billing=true`；
  点「保存」后 `source` 由 `credentials` 变 **`settings`**；直接打 POST → `persisted:["credentials","settings"]`；
  结尾 `restore` → `billing=false`（与运行前一致）；
- 落盘证据：`~/.dsh/settings.yaml` 新增 `opencode-quota: {billing:false, workspaceId: wrk_01KZ…FWHX}`；
  与运行前备份 diff **只多这 3 行**（备份含明文密钥，已移出仓库到 `../oq-secrets-local/`，并由 `.gitignore` 兜底永不入库）；凭证文件的 `OPENCODE_CONSOLE_COOKIE` 行**未变**（探针不回填 cookie，不复制密钥）；
- 两端文案同句：宿主 L43 `BILLING_DESC` ↔ 客户端 L895 同一串字；
- 仓库无测试/类型检查/构建/lint 入口（`package.json` 的 `scripts` 为 null，且无 tsconfig/eslint/vitest/Makefile/.github），
  因此验证以"可复现手动步骤"给出：`node --check` → 打 `GET/POST /api/config` → 看 `~/.dsh/settings.yaml` 与 diff。
