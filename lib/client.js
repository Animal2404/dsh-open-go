window.__ModuleLoader__.load({ id: "@dsh-external/dsh-opencode-quota", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
/**
 * dsh-opencode-quota（浏览器端）v0.9.7
 *
 * 侧边栏「设置」按钮上方（sidebar.footer.action 插槽）的 Open GO 套餐额度小组件。
 *
 * 形态（v0.9.0 按参考图整体重做）：
 * - 收起态：单行 pill —— `GO` 徽标 + 状态点 + `5h 7% · wk 12% · mo 85%` 三档读数 + 箭头；
 * - 展开态：pill 上方的锚定面板 —— 标题栏（状态点 / Open GO / HH:mm 更新 / ⚙ / ↻）
 *   + 「额度」卡片（三档：`5h 滚动` 名称、进度条、百分比，下面一行距重置倒计时）
 *   + 「官方账单」区（**默认隐藏**，由 ⚙ 弹窗里的开关打开：今日 / 本月按模型明细）；
 * - 点面板与 pill 之外收起；开合状态持久化在 localStorage；
 *   ⚙ 里的三项设置（账单开关 / workspace id / cookie）与「设置 → 插件 → opencode-quota」**同源**：
 *   面板开合是纯浏览器状态，配置项一律以宿主为准（齿轮保存会写回设置存储，反之设置面板改动会经 watch 生效）。
 *
 * 配置读写（齿轮弹窗）：GET/POST /dsh-opencode-quota/api/config
 *   GET  → { workspaceId, hasCookie, cookieMasked, billing, settingsWritable, source }
 *   POST → { workspaceId?, consoleCookie?, billing? }（空串=不修改；至少一项可落地改动）
 *
 * 数据来自同源宿主路由（key 不下发浏览器）：
 * - /dsh-opencode-quota/api/status    额度三档
 * - /dsh-opencode-quota/api/official  官方账单（仅账单开关打开时才请求/轮询）
 * - /dsh-opencode-quota/api/config    workspace id + cookie
 *
 * 动效约定（Emil/Apple 那套手感，详见 UI-SPEC-v0.9.md）：
 * - 只动 transform / opacity / 颜色；进场 200ms、退场 140ms，曲线统一 ease-out；
 * - 数值与进度条走 ease-out 补间，面板每次打开从 0 生长；
 * - 尊重 prefers-reduced-motion（此时全部退化为瞬时）。
 */
const TAG = '[opencode-quota]'
let React = null
try { React = require('react') } catch (e) { React = null }
const hasReact = React !== null
let ReactDOM = null
try { ReactDOM = require('react-dom') } catch (e) { ReactDOM = null }
const hasPortal = !!(ReactDOM && typeof ReactDOM.createPortal === 'function')

const HOST_API = '/dsh-opencode-quota/api/status'
const HOST_API_OFFICIAL = '/dsh-opencode-quota/api/official'
const HOST_API_CONFIG = '/dsh-opencode-quota/api/config'
const HEADERS = { 'x-dsh-opencode-quota': '1' }
const REFRESH_MS = 300000 // 5 分钟自动轮询
const PANEL_WIDTH = 280 // 展开面板默认宽度（窄 rail 下回退 260）
const PANEL_OPEN_KEY = 'dshoq-panel-open'
const BILLING_KEY = 'dshoq-billing-on'
const TICK_MS = 30000 // 倒计时刷新间隔
const WARN_PCT = 80 // ≥80%：橙色警示
const DANGER_PCT = 95 // ≥95%：红色警示
const OUT_MS = 150 // 面板退场动画时长（与 CSS 对齐）

// 三档元数据：参考图用语（5h 滚动 / 7d 每周 / 1m 每月），pill 里用短标签 5h/wk/mo。
// 配色一律取 DSH 语义 token：蓝 = 品牌蓝、绿 = success、琥珀 = warn（不写死色值）
const TIERS = [
  { key: 'rolling', label: '5h 滚动', chip: '5h', tone: 'var(--dsw-alias-brand-primary-new-colorprimary-new-color,#4d6bfe)' },
  { key: 'weekly', label: '7d 每周', chip: 'wk', tone: 'var(--dsw-alias-state-success-primary,#10b981)' },
  { key: 'monthly', label: '1m 每月', chip: 'mo', tone: 'var(--dsw-alias-state-warn-primary,#f59e0b)' },
]
const BLUE = 'var(--dsw-alias-brand-primary-new-colorprimary-new-color,#4d6bfe)'
const WARN_COLOR = 'var(--dsw-alias-state-warn-primary,#f59e0b)'
const DANGER_COLOR = 'var(--dsw-alias-state-error-primary,#f87171)'
const MODEL_BUSINESS = 'var(--dsw-alias-state-business-primary,#8b5cf6)'
const MODEL_SUCCESS = 'var(--dsw-alias-state-success-primary,#10b981)'
const MAIN = 'var(--oq-main)'
const MUTED = 'var(--oq-muted)'

// 模型显示名映射（明细行标签用）
const MODEL_SHORT = {
  'deepseek-v4-flash': 'DeepSeek V4 Flash',
  'deepseek-v4-pro': 'DeepSeek V4 Pro',
  'mimo-v2.5': 'MiMo 2.5',
  'mimo-v2.5-pro': 'MiMo 2.5 Pro',
  'qwen3.7-max': 'Qwen 3.7 Max',
  'qwen3.7-plus': 'Qwen 3.7 Plus',
  'minimax-m3': 'MiniMax M3',
  'minimax-m2.7': 'MiniMax M2.7',
  'kimi-k3': 'Kimi K3',
  'glm-5.3': 'GLM 5.3',
}
function shortModel(id) {
  if (MODEL_SHORT[id]) return MODEL_SHORT[id]
  return String(id)
}

// ── 小工具 ────────────────────────────────────────────────────────────────
/** 美元金额（官方账单消耗，4 位小数）。 */
function fmtUsd(n) {
  return '$' + (Number(n) || 0).toFixed(4)
}
/** 24 时制时间（HH:mm，本地时区）。 */
function fmtTime(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}
/** 紧凑倒计时：2h6m / 1d10h / 23h36m / 36m / 45s（跟着心跳实时走）。 */
function fmtCountdown(iso, now) {
  if (!iso) return null
  const t = Date.parse(iso)
  if (!isFinite(t)) return null
  const diff = t - now
  if (diff <= 0) return '即将重置'
  const MIN = 60000, HOUR = 3600000, DAY = 86400000
  if (diff < MIN) return Math.max(1, Math.round(diff / 1000)) + 's'
  const d = Math.floor(diff / DAY), h = Math.floor((diff % DAY) / HOUR), m = Math.floor((diff % HOUR) / MIN)
  if (d > 0) return d + 'd' + (h > 0 ? h + 'h' : '')
  if (h > 0) return h + 'h' + (m > 0 ? m + 'm' : '')
  return m + 'm'
}
/** 档位配色：≥95% 红、≥80% 橙，其余用档位本色（token，随主题走）。 */
function tierTone(t, pct) {
  if (typeof pct === 'number' && pct >= DANGER_PCT) return DANGER_COLOR
  if (typeof pct === 'number' && pct >= WARN_PCT) return WARN_COLOR
  return t.tone
}
/** localStorage 读写（读写都吞异常：隐私模式 / 沙箱下不能崩）。 */
function readFlag(key, fallback) {
  try {
    const v = window.localStorage.getItem(key)
    return v === null ? fallback : v === 'true'
  } catch (e) { return fallback }
}
function writeFlag(key, value) {
  try { window.localStorage.setItem(key, value ? 'true' : 'false') } catch (e) { /* 忽略 */ }
}
/** 用户是否要求减弱动效。 */
function prefersReduced() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch (e) { return false }
}

// ── 样式（注入一次；类名统一 dshoq- 前缀，不污染宿主）────────────────────
const CSS = [
  // 变量作用域：材质/颜色一律走 DSH 语义 token（var(--dsw-…, 回退) 写法保留，token 缺失时不至于裸奔）
  '.dshoq-scope{--oq-main:var(--dsw-alias-label-primary,#e6edf7);--oq-muted:var(--dsw-alias-label-secondary,#8fa3bf);--oq-track:var(--dsw-alias-border-l2,rgba(127,127,127,.22));--oq-bar-track:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.08));--oq-line:var(--dsw-alias-border-l2,rgba(127,127,127,.35));--oq-hover:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08));--oq-chip:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.08));--oq-acrylic:var(--dsw-alias-button-floating-fill,#2c2c2e);--oq-acrylic-hover:var(--dsw-alias-button-floating-hover,rgba(127,127,127,.16));--oq-acrylic-active:var(--dsw-alias-interactive-bg-active,rgba(127,127,127,.2));--oq-overlay:var(--dsw-specific-menu,var(--dsw-alias-bg-layer-3,#232327));--oq-dialog:var(--dsw-alias-bg-layer-2,#1e1e20);--oq-elev1:var(--dsw-shadow-lv1,0 2px 4px rgba(0,0,0,.06));--oq-elev2:var(--dsw-shadow-lv2,0 4px 12px rgba(0,0,0,.06));--oq-elev3:var(--dsw-shadow-lv3,0 12px 32px rgba(0,0,0,.1));--oq-mask:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.4));--oq-field:var(--dsw-alias-bg-layer-1,#26262a);--oq-field-line:var(--dsw-alias-border-l2,rgba(127,127,127,.35));--oq-accent:var(--dsw-alias-brand-primary-new-colorprimary-new-color,#4d6bfe);--oq-strong:var(--dsw-alias-button-ghost-active-fill,rgba(127,127,127,.22));--oq-strong-hover:var(--dsw-alias-button-ghost-active-hover,rgba(127,127,127,.3));--oq-knob:var(--dsw-static-neutral-bluish-00,#fff);--oq-edge:light-dark(var(--dsw-alias-border-l2,rgba(0,0,0,.1)),transparent);color:var(--oq-main);font:12px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;font-variant-numeric:tabular-nums}',
  '.dshoq-wrap{flex:0 0 100%;width:100%}',

  // ── 亚克力材质（v0.9.5）──
  // 项目里没有 "acrylic" 这个名字（全仓 grep 无命中），但 ui-theme 有完整的材质词表，按它搭：
  //   面 = bg-layer-* / button-elevated-fill / specific-menu；抬升 = shadow-lv1/2/3；
  //   交互 = interactive-bg-hover/active；遮罩 = bg-mask-1；输入控件 = ui-primitives/Input 的配方。
  // 本插件**不再使用** backdrop-filter / 噪点贴图 / 自造 alpha（磨砂玻璃那套已全部下线）；
  // 亚克力＝实色层面 + 层级投影 + 主题色差，深色侧靠面比底亮、浅色侧靠 light-dark() 里那条深色细边分界。


  // ── 收起态 pill ──
  '.dshoq-pill{display:flex;align-items:center;gap:7px;width:100%;box-sizing:border-box;padding:5px 8px;border:0;border-radius:10px;background-color:var(--oq-acrylic);color:var(--oq-main);font:inherit;text-align:left;cursor:pointer;white-space:nowrap;overflow:hidden;box-shadow:var(--oq-elev1),inset 0 0 0 1px var(--oq-edge);transition:background-color .2s ease,box-shadow .2s ease,transform .12s ease}',
  '.dshoq-pill:hover{background-color:var(--oq-acrylic-hover);box-shadow:var(--oq-elev2),inset 0 0 0 1px var(--oq-edge)}',
  '.dshoq-pill:active{transform:scale(.985);background-color:var(--oq-acrylic-active)}',
  '.dshoq-pill:focus-visible{outline:2px solid var(--oq-accent);outline-offset:2px}',
  '.dshoq-badge{flex:none;font-size:10px;font-weight:800;letter-spacing:.6px;line-height:1;padding:3px 5px;border-radius:5px;background:var(--oq-chip);color:var(--oq-main)}',
  '.dshoq-dot{width:6px;height:6px;border-radius:50%;flex:none;transition:background .3s ease}',
  '.dshoq-dot--busy{animation:dshoq-pulse 1.5s ease-in-out infinite}',
  '.dshoq-tiers{display:flex;align-items:baseline;gap:5px;min-width:0;overflow:hidden}',
  '.dshoq-k{font-size:11px;color:var(--oq-muted);flex:none}',
  '.dshoq-v{font-size:12px;font-weight:600;flex:none;transition:color .3s ease}',
  '.dshoq-sep{flex:none;font-size:10px;color:var(--oq-muted);opacity:.5}',
  '.dshoq-chev{flex:none;margin-left:auto;color:var(--oq-muted);opacity:.8;transition:transform .26s cubic-bezier(.34,1.4,.64,1)}',
  '.dshoq-chev--closed{transform:rotate(180deg)}',

  // ── 展开面板 ──
  '.dshoq-panel{position:fixed;z-index:9998;box-sizing:border-box;display:flex;flex-direction:column;gap:8px;padding:10px 11px;border-radius:14px;background-color:var(--oq-overlay);color:var(--oq-main);box-shadow:var(--oq-elev3),inset 0 0 0 1px var(--oq-edge);max-height:70vh;overflow-y:auto;scrollbar-width:thin;transform-origin:var(--oq-origin,50% 100%)}',
  '.dshoq-panel::-webkit-scrollbar{width:8px}',
  '.dshoq-panel::-webkit-scrollbar-thumb{background:var(--oq-track);border-radius:4px}',
  '.dshoq-panel::-webkit-scrollbar-track{background:transparent}',
  '.dshoq-panel--in{animation:dshoq-in .2s cubic-bezier(.16,1,.3,1) both}',
  '.dshoq-panel--out{animation:dshoq-out .14s cubic-bezier(.4,0,1,1) both;pointer-events:none}',
  '.dshoq-head{display:flex;align-items:center;gap:6px}',
  '.dshoq-title{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.dshoq-time{font-size:11px;color:var(--oq-muted);white-space:nowrap;flex:none}',
  '.dshoq-acts{margin-left:auto;display:flex;align-items:center;gap:1px;flex:none}',
  '.dshoq-icon{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;padding:0 3px;border:0;border-radius:6px;background:transparent;color:var(--oq-muted);font-size:13px;line-height:1;cursor:pointer;transition:background .16s ease,color .16s ease,transform .12s ease}',
  '.dshoq-icon:hover{background:var(--oq-hover);color:var(--oq-main)}',
  '.dshoq-icon:active{transform:scale(.9)}',
  '.dshoq-icon:focus-visible{outline:2px solid var(--oq-accent);outline-offset:1px}',
  '.dshoq-gear{display:inline-block;transition:transform .3s cubic-bezier(.34,1.4,.64,1)}',
  '.dshoq-icon:hover .dshoq-gear{transform:rotate(45deg)}',
  '.dshoq-sect{display:flex;align-items:center;gap:6px;margin-top:4px;padding-top:6px;border-top:1px solid var(--oq-line)}',
  '.dshoq-sect-t{font-size:12.5px;font-weight:600}',
  '.dshoq-sect-n{margin-left:auto;font-size:11px;color:var(--oq-muted)}',
  '.dshoq-card{display:flex;flex-direction:column;gap:8px;border-radius:10px;padding:8px}',

  // 三档行
  '.dshoq-row{display:flex;flex-direction:column;gap:3px}',
  '.dshoq-line{display:flex;align-items:center;gap:8px}',
  '.dshoq-label{width:52px;flex:none;font-size:12px;color:var(--oq-muted)}',
  '.dshoq-bar{position:relative;flex:1 1 auto;height:6px;border-radius:3px;overflow:hidden;background:var(--oq-bar-track)}',
  '.dshoq-fill{height:100%;border-radius:3px;transition:background .3s ease}',
  '.dshoq-pct{width:42px;flex:none;text-align:right;font-size:12.5px;font-weight:600;transition:color .3s ease}',
  '.dshoq-reset{display:flex;gap:5px;min-height:16px;padding-left:60px;font-size:11px;color:var(--oq-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.dshoq-reset-k{flex:none}',
  '.dshoq-reset-v{flex:none;color:var(--oq-muted)}',
  '.dshoq-shimmer{position:absolute;inset:0;background:linear-gradient(90deg,transparent,var(--dsw-alias-interactive-bg-hover-accent,rgba(255,255,255,.22)),transparent);animation:dshoq-sheen 1.2s ease-in-out infinite}',
  '.dshoq-note{font-size:11px;color:var(--oq-muted);line-height:1.5}',
  '.dshoq-warn{font-size:11px;color:var(--dsw-alias-state-warn-primary,#fbbf24);line-height:1.5}',
  '.dshoq-err{font-size:11px;color:var(--dsw-alias-state-error-primary,#f87171);line-height:1.5}',

  // 账单（今日 / 本月）
  '.dshoq-bill{display:flex;flex-direction:column;gap:4px;border-radius:9px;padding:7px 8px;border:1px solid}',
  '.dshoq-bill--today{background:var(--dsw-alias-state-business-tertiary,#eef2ff);border-color:var(--dsw-alias-state-business-primary,#4d6bfe)}',
  '.dshoq-bill--month{background:var(--dsw-alias-state-success-tertiary,#e9f9f1);border-color:var(--dsw-alias-state-success-primary,#10b981)}',
  '.dshoq-bill-head{display:flex;align-items:baseline;justify-content:space-between;gap:6px}',
  '.dshoq-bill-t{font-size:12px;font-weight:600}',
  '.dshoq-bill-v{font-size:14px;font-weight:700}',
  '.dshoq-mrow{display:flex;align-items:center;gap:6px}',
  '.dshoq-mname{flex:0 1 auto;min-width:0;max-width:46%;font-size:11px;color:var(--oq-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.dshoq-mbar{position:relative;flex:1 1 auto;height:5px;border-radius:3px;overflow:hidden;background:var(--oq-bar-track)}',
  '.dshoq-mpct{flex:none;width:32px;text-align:right;font-size:11px;color:var(--oq-muted)}',
  '.dshoq-musd{flex:none;font-size:11px;font-weight:600}',

  // 窄 rail 态
  '.dshoq-rail{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;width:42px;height:48px;margin:4px auto;padding:0;border:0;border-radius:11px;background-color:var(--oq-acrylic);color:var(--oq-main);cursor:pointer;flex:0 0 100%;box-shadow:var(--oq-elev1),inset 0 0 0 1px var(--oq-edge);transition:background-color .2s ease,box-shadow .2s ease,transform .12s ease}',
  '.dshoq-rail:hover{background-color:var(--oq-acrylic-hover);box-shadow:var(--oq-elev2),inset 0 0 0 1px var(--oq-edge)}',
  '.dshoq-rail:active{transform:scale(.96);background-color:var(--oq-acrylic-active)}',
  '.dshoq-rail:focus-visible{outline:2px solid var(--oq-accent);outline-offset:2px}',
  '.dshoq-minibars{display:flex;align-items:flex-end;gap:2px;height:16px}',
  '.dshoq-minibar{position:relative;width:4px;height:16px;border-radius:2px;overflow:hidden;background:var(--oq-track)}',
  '.dshoq-minifill{position:absolute;left:0;right:0;bottom:0;border-radius:2px;transition:background .3s ease}',

  // ⚙ 弹窗
  '.dshoq-backdrop{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:var(--oq-mask);animation:dshoq-fade .16s ease both}',
  '.dshoq-dialog{width:340px;max-width:calc(100vw - 40px);box-sizing:border-box;border-radius:14px;padding:14px;background-color:var(--oq-dialog);color:var(--oq-main);box-shadow:var(--oq-elev3),inset 0 0 0 1px var(--oq-edge);display:flex;flex-direction:column;gap:10px;font:12px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;font-variant-numeric:tabular-nums}',
  '.dshoq-dialog--in{animation:dshoq-pop .18s cubic-bezier(.16,1,.3,1) both}',
  '.dshoq-dlg-title{font-size:14px;font-weight:700}',
  '.dshoq-switch-row{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:10px;background:var(--oq-hover)}',
  '.dshoq-switch-txt{display:flex;flex-direction:column;gap:2px;min-width:0}',
  '.dshoq-switch-t{font-size:12.5px;font-weight:600}',
  '.dshoq-switch-sub{font-size:11px;color:var(--oq-muted)}',
  '.dshoq-switch{position:relative;flex:none;margin-left:auto;width:38px;height:22px;padding:0;border:0;border-radius:11px;background:var(--oq-chip);cursor:pointer;transition:background-color .22s ease,box-shadow .22s ease}',
  '.dshoq-switch[aria-checked="true"]{background:var(--oq-accent)}',
  '.dshoq-switch:focus-visible{outline:2px solid var(--oq-accent);outline-offset:2px}',
  '.dshoq-knob{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--oq-knob);box-shadow:var(--oq-elev1);transition:transform .24s cubic-bezier(.34,1.4,.64,1)}',
  '.dshoq-switch[aria-checked="true"] .dshoq-knob{transform:translateX(16px)}',
  '.dshoq-field{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--oq-main)}',
  '.dshoq-input{padding:7px 9px;border-radius:8px;font-size:13px;border:1px solid var(--oq-field-line);background-color:var(--oq-field);color:var(--oq-main);outline:none;transition:border-color .16s ease,background-color .16s ease}',
  '.dshoq-input:focus{border-color:var(--oq-accent)}',
  '.dshoq-hint{font-size:11px;color:var(--oq-muted);line-height:1.5}',
  '.dshoq-btns{display:flex;justify-content:flex-end;gap:8px;margin-top:2px}',
  '.dshoq-btn{padding:6px 13px;border-radius:9px;font-size:13px;cursor:pointer;border:0;background:transparent;color:var(--oq-main);transition:background-color .16s ease,transform .12s ease}',
  '.dshoq-btn:hover{background:var(--oq-hover)}',
  '.dshoq-btn:active{transform:scale(.97);background:var(--oq-chip)}',
  '.dshoq-btn:focus-visible{outline:2px solid var(--oq-accent);outline-offset:1px}',
  '.dshoq-btn--primary{font-weight:600;background:var(--oq-strong)}',
  '.dshoq-btn--primary:hover{background:var(--oq-strong-hover)}',

  // 动画
  '@keyframes dshoq-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}',
  '.dshoq-spin{display:inline-block;animation:dshoq-spin .8s linear infinite;transform-origin:center}',
  '@keyframes dshoq-pulse{0%,100%{opacity:1}50%{opacity:.4}}',
  '@keyframes dshoq-in{from{opacity:0;transform:translateY(7px) scale(.972)}to{opacity:1;transform:none}}',
  '@keyframes dshoq-out{from{opacity:1;transform:none}to{opacity:0;transform:translateY(5px) scale(.985)}}',
  '@keyframes dshoq-fade{from{opacity:0}to{opacity:1}}',
  '@keyframes dshoq-pop{from{opacity:0;transform:translateY(6px) scale(.97)}to{opacity:1;transform:none}}',
  '@keyframes dshoq-sheen{from{transform:translateX(-110%)}to{transform:translateX(210%)}}',
  '@media (prefers-reduced-motion: reduce){.dshoq-panel--in,.dshoq-panel--out,.dshoq-backdrop,.dshoq-dialog--in,.dshoq-spin,.dshoq-dot--busy,.dshoq-shimmer{animation:none!important}.dshoq-pill,.dshoq-icon,.dshoq-rail,.dshoq-fill,.dshoq-minifill,.dshoq-knob,.dshoq-chev,.dshoq-gear{transition:none!important}}',
].join('')

;(function injectCss() {
  if (typeof document === 'undefined') return
  const tagId = '@dsh-external/dsh-opencode-quota/skin'
  if (document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') !== null) return
  const tag = document.createElement('style')
  tag.dataset.plugin = '@dsh-external/dsh-opencode-quota'
  tag.dataset.pluginCss = tagId
  tag.textContent = CSS
  document.head.appendChild(tag)
})()

// ── hooks ────────────────────────────────────────────────────────────────
/** 数字补间：数据变化时缓动到目标值；首次可传 initial=0 让面板从 0 生长。 */
function useTweenNum(target, dur, initial) {
  const start = initial === undefined ? target : initial
  const [val, setVal] = React.useState(start)
  const fromRef = React.useRef(start)
  React.useEffect(function () {
    const from = fromRef.current
    const to = (typeof target === 'number' && isFinite(target)) ? target : 0
    if (from === to || !(dur > 0) || prefersReduced()) {
      fromRef.current = to
      setVal(to)
      return undefined
    }
    let raf = 0
    const clock = function () {
      return (window.performance && window.performance.now) ? window.performance.now() : Date.now()
    }
    const t0 = clock()
    const step = function () {
      const p = Math.min(1, (clock() - t0) / dur)
      const eased = 1 - Math.pow(1 - p, 3) // ease-out cubic
      setVal(from + (to - from) * eased)
      if (p < 1) raf = window.requestAnimationFrame(step)
      else fromRef.current = to
    }
    raf = window.requestAnimationFrame(step)
    return function () {
      window.cancelAnimationFrame(raf)
      fromRef.current = to
    }
  }, [target, dur])
  return val
}

/** 心跳：驱动「距重置」倒计时实时走动。 */
function useNow(interval) {
  const [now, setNow] = React.useState(function () { return Date.now() })
  React.useEffect(function () {
    const timer = window.setInterval(function () { setNow(Date.now()) }, interval)
    return function () { window.clearInterval(timer) }
  }, [interval])
  return now
}

// ── 子组件 ───────────────────────────────────────────────────────────────
/** 三档中的一行：名称 + 进度条 + 百分比，下面一行「距重置」。 */
function TierRow(props) {
  const tier = props.tier
  const pct = (typeof props.percent === 'number' && isFinite(props.percent)) ? props.percent : null
  // 数据已在手上 → 展开时直接显示真值（不装作"正在加载"）；确实还没数据才从 0 生长
  const shown = useTweenNum(pct === null ? 0 : pct, 380, pct === null ? 0 : undefined)
  const tone = tierTone(tier, pct)
  const resetText = props.resetsAt ? fmtCountdown(props.resetsAt, props.now) : (props.resetsIn || null)
  return React.createElement('div', { className: 'dshoq-row' }, [
    React.createElement('div', { key: 'line', className: 'dshoq-line' }, [
      React.createElement('span', { key: 'l', className: 'dshoq-label' }, tier.label),
      React.createElement('div', { key: 'b', className: 'dshoq-bar' }, [
        React.createElement('div', {
          key: 'f',
          className: 'dshoq-fill',
          style: {
            width: (pct === null ? 0 : shown) + '%',
            background: pct === null ? 'var(--oq-track)' : tone,
          },
        }),
        props.loading ? React.createElement('span', { key: 's', className: 'dshoq-shimmer' }) : null,
      ]),
      React.createElement('span', {
        key: 'p',
        className: 'dshoq-pct',
        style: { color: pct === null ? MUTED : tone },
        title: pct === null ? '尚未取到' : ('已用 ' + Math.round(pct) + '%'),
      }, pct === null ? '–' : Math.round(shown) + '%'),
    ]),
    React.createElement('div', { key: 'r', className: 'dshoq-reset' }, pct === null ? null : [
      React.createElement('span', { key: 'k', className: 'dshoq-reset-k' }, '距重置'),
      React.createElement('span', { key: 'v', className: 'dshoq-reset-v' }, resetText || '未知'),
    ]),
  ])
}

/** 账单明细行（今日 / 本月共用）：模型名 + 占比条 + 占比 + 金额。 */
function ModelRow(props) {
  const pct = (typeof props.percent === 'number' && isFinite(props.percent)) ? props.percent : 0
  const shown = useTweenNum(pct, 360) // 明细行：首帧即真值，之后的变化才补间
  return React.createElement('div', { className: 'dshoq-mrow' }, [
    React.createElement('span', { key: 'n', className: 'dshoq-mname', title: props.model }, shortModel(props.model)),
    React.createElement('div', { key: 'b', className: 'dshoq-mbar' }, [
      React.createElement('div', {
        key: 'f',
        className: 'dshoq-fill',
        style: { width: shown + '%', background: props.color },
      }),
    ]),
    React.createElement('span', { key: 'p', className: 'dshoq-mpct' }, Math.round(shown) + '%'),
    React.createElement('span', { key: 'u', className: 'dshoq-musd' }, fmtUsd(props.costUsd)),
  ])
}

/** 开关（role=switch；滑块用带过冲的弹簧曲线）。 */
function Switch(props) {
  return React.createElement('button', {
    type: 'button',
    role: 'switch',
    'aria-checked': props.on ? 'true' : 'false',
    'aria-label': props.label,
    title: props.title || props.label,
    className: 'dshoq-switch',
    onClick: function (e) { e.stopPropagation(); props.onChange(!props.on) },
  }, React.createElement('span', { className: 'dshoq-knob' }))
}

/** 收起态 pill 里的三档读数：5h 7% · wk 12% · mo 85%。 */
function TierReadout(props) {
  const out = []
  TIERS.forEach(function (t, i) {
    if (i > 0) out.push(React.createElement('span', { key: 'sep' + i, className: 'dshoq-sep' }, '·'))
    const pct = props.pct ? props.pct[t.key] : null
    out.push(React.createElement('span', { key: 'k' + i, className: 'dshoq-k' }, t.chip))
    out.push(React.createElement('span', {
      key: 'v' + i,
      className: 'dshoq-v',
      style: { color: pct === null ? MUTED : tierTone(t, pct) },
    }, pct === null ? '–' : Math.round(pct) + '%'))
  })
  return React.createElement('span', { className: 'dshoq-tiers' }, out)
}

/** 迷你条填充（rail 态用，入场从 0 生长）。 */
function MiniFill(props) {
  const has = typeof props.pct === 'number' && isFinite(props.pct)
  const shown = useTweenNum(has ? props.pct : 0, 380, has ? undefined : 0)
  return React.createElement('div', {
    className: 'dshoq-minifill',
    style: { height: (props.pct === null || props.pct === undefined ? 0 : shown) + '%', background: props.color },
  })
}

/** 箭头（收起 ▾ / 展开 ▴：同一个形状转过去，而不是换图标；面板向上展开，展开态箭头朝上）。 */
function Chevron(props) {
  const s = props.size || 11
  return React.createElement('svg', {
    className: 'dshoq-chev' + (props.open ? '' : ' dshoq-chev--closed'),
    width: s, height: s, viewBox: '0 0 12 12', 'aria-hidden': 'true', focusable: 'false',
  }, React.createElement('path', {
    d: 'M2 7.5 L6 3.5 L10 7.5',
    fill: 'none', stroke: 'currentColor', strokeWidth: 1.8,
    strokeLinecap: 'round', strokeLinejoin: 'round',
  }))
}

// ── 主组件 ───────────────────────────────────────────────────────────────
function QuotaWidget(props) {
  const wide = props && props.wide !== false

  // ── 数据层：额度 ──
  const [state, setState] = React.useState({ kind: 'loading' })
  const refresh = React.useCallback(function (force) {
    let alive = true
    setState(function (prev) { return prev.kind === 'ok' ? { ...prev, refreshing: true } : { kind: 'loading' } })
    const url = HOST_API + (force ? '?force=1' : '')
    window.fetch(url, { headers: HEADERS })
      .then(function (r) { return r.json() })
      .then(function (j) {
        if (!alive) return
        if (j && j.ok) setState({ kind: 'ok', usage: j.usage, fetchedAt: j.fetchedAt, refreshing: false, warn: null })
        else {
          const m = j && j.error ? j.error : '未知错误'
          setState(function (prev) {
            if (prev.kind === 'ok' && prev.usage) return { ...prev, refreshing: false, warn: m }
            return { kind: 'err', error: m }
          })
        }
      })
      .catch(function () {
        if (!alive) return
        setState(function (prev) {
          if (prev.kind === 'ok' && prev.usage) return { ...prev, refreshing: false, warn: '网络错误' }
          return { kind: 'err', error: '网络错误' }
        })
      })
    return function () { alive = false }
  }, [])
  const refreshCleanupRef = React.useRef(null)
  React.useEffect(function () {
    refreshCleanupRef.current = refresh()
    const timer = window.setInterval(function () {
      if (typeof refreshCleanupRef.current === 'function') refreshCleanupRef.current()
      refreshCleanupRef.current = refresh()
    }, REFRESH_MS)
    return function () {
      if (typeof refreshCleanupRef.current === 'function') refreshCleanupRef.current()
      refreshCleanupRef.current = null
      window.clearInterval(timer)
    }
  }, [refresh])

  // ── 显示偏好：账单开关（默认关；权威值在宿主设置存储，localStorage 只做首屏缓存）──
  const [billing, setBilling] = React.useState(function () { return readFlag(BILLING_KEY, false) })
  const setBillingPersist = React.useCallback(function (v) {
    setBilling(!!v)
    writeFlag(BILLING_KEY, !!v)
  }, [])
  // 挂载时用宿主值校准一次（换浏览器/换机器时，localStorage 是空的，宿主的设置才是真值）
  React.useEffect(function () {
    let alive = true
    window.fetch(HOST_API_CONFIG, { headers: HEADERS })
      .then(function (r) { return r.json() })
      .then(function (j) {
        if (!alive || !j || !j.ok || typeof j.billing !== 'boolean') return
        setBillingPersist(j.billing)
      })
      .catch(function () { /* 读不到就沿用本地缓存 */ })
    return function () { alive = false }
  }, [setBillingPersist])

  // ── 数据层：官方账单（只在开关打开时才请求，关掉即停轮询）──
  const [official, setOfficial] = React.useState(null)
  const refreshOfficial = React.useCallback(function (force) {
    let alive = true
    const url = HOST_API_OFFICIAL + (force ? '?force=1' : '')
    window.fetch(url, { headers: HEADERS })
      .then(function (r) { return r.json() })
      .then(function (j) { if (alive) setOfficial(j && j.ok ? j : { error: (j && j.error) || '未知错误' }) })
      .catch(function () { if (alive) setOfficial({ error: '网络错误' }) })
    return function () { alive = false }
  }, [])
  const officialCleanupRef = React.useRef(null)
  React.useEffect(function () {
    if (!billing) {
      if (typeof officialCleanupRef.current === 'function') officialCleanupRef.current()
      officialCleanupRef.current = null
      setOfficial(null)
      return undefined
    }
    officialCleanupRef.current = refreshOfficial()
    const timer = window.setInterval(function () {
      if (typeof officialCleanupRef.current === 'function') officialCleanupRef.current()
      officialCleanupRef.current = refreshOfficial()
    }, REFRESH_MS)
    return function () {
      if (typeof officialCleanupRef.current === 'function') officialCleanupRef.current()
      officialCleanupRef.current = null
      window.clearInterval(timer)
    }
  }, [billing, refreshOfficial])

  // 一键刷新（额度 + 已开启的账单）
  const refreshAll = React.useCallback(function () {
    refresh(true)
    if (billing) refreshOfficial(true)
  }, [refresh, refreshOfficial, billing])

  // ── 面板开合：open=逻辑态；closing=退场动画期（render = open || closing，展开当帧就挂载）──
  const [open, setOpen] = React.useState(function () { return readFlag(PANEL_OPEN_KEY, false) })
  const [closing, setClosing] = React.useState(false)
  const closeTimerRef = React.useRef(0)
  const refreshTimerRef = React.useRef(0)
  const render = open || closing
  const closeNow = React.useCallback(function () {
    setOpen(false)
    writeFlag(PANEL_OPEN_KEY, false)
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    setClosing(true)
    closeTimerRef.current = window.setTimeout(function () {
      closeTimerRef.current = 0
      setClosing(false)
    }, prefersReduced() ? 0 : OUT_MS)
  }, [])

  // ── ⚙ 弹窗状态（先声明：面板的 Esc 处理要读它）──
  const [cfgOpen, setCfgOpen] = React.useState(false)
  const cfgOpenRef = React.useRef(cfgOpen)
  cfgOpenRef.current = cfgOpen
  const [cfgData, setCfgData] = React.useState({ workspaceId: '', consoleCookie: '', hasCookie: false, cookieMasked: '', billing: false, settingsWritable: true, msg: '', err: '' })

  // ── 面板锚定 ──
  // 展开那一刻**只量 pill**（面板还没上屏），用 bottom 贴住 pill 上沿：不依赖面板高度，
  // 所以点击当帧就能上屏、面板自然往上长。旧实现在这里等 offsetHeight，实测面板 28ms 挂载、
  // 却一直 hidden 到 367ms（刷新返回）才可见。上屏后再校正一次：上方放不下就翻到 pill 下面。
  const pillRef = React.useRef(null)
  const panelRef = React.useRef(null)
  const dlgRef = React.useRef(null)
  const [panelPos, setPanelPos] = React.useState(null)
  const panelPosRef = React.useRef(null)
  panelPosRef.current = panelPos
  const [panelW, setPanelW] = React.useState(PANEL_WIDTH)
  const [origin, setOrigin] = React.useState('50% 100%')

  /** 只依赖 pill 的定位（同步、可在点击处理里直接调用）。 */
  const anchorToPill = React.useCallback(function () {
    try {
      const pill = pillRef.current
      if (!pill) return null
      const pr = pill.getBoundingClientRect()
      const vw = window.innerWidth, vh = window.innerHeight
      // 面板宽度跟随侧边栏（展开态）；窄 rail 回退 260 保持可用
      const sidebar = document.querySelector('div[class*="sidebarCol"]')
      const sb = sidebar ? sidebar.getBoundingClientRect() : null
      const wideSidebar = !!sb && sb.width >= 200
      const w = wideSidebar ? Math.min(Math.round(sb.width), 320) : 260
      let left = wideSidebar && sb ? sb.left : pr.left
      if (left + w > vw - 8) left = vw - w - 8
      if (!wideSidebar && left < 8) left = 8
      const ox = Math.max(12, Math.min(w - 12, Math.round(pr.left + pr.width / 2 - left)))
      setPanelW(w)
      setOrigin(ox + 'px 100%')
      return {
        left: Math.round(left),
        bottom: Math.round(vh - pr.top + 8),
        top: null,
        pillTop: Math.round(pr.top),
        pillBottom: Math.round(pr.bottom),
      }
    } catch (e) { return null }
  }, [])

  /** 上屏后校正：上方空间不够才翻到 pill 下方（够就不动，避免抖动）。 */
  const refinePlacement = React.useCallback(function () {
    try {
      const panel = panelRef.current
      const pos = panelPosRef.current
      if (!panel || !pos || typeof pos.pillTop !== 'number') return
      const h = panel.offsetHeight || 0
      if (h + 8 <= pos.pillTop) return
      const vh = window.innerHeight
      const top = Math.max(8, Math.min(pos.pillBottom + 8, vh - h - 8))
      setPanelPos(function (prev) {
        if (prev && prev.top === Math.round(top) && prev.bottom === null) return prev
        return { ...pos, top: Math.round(top), bottom: null }
      })
      setOrigin(function (prev) { return prev.replace('100%', '0%') })
    } catch (e) { /* 量不到就保持原样 */ }
  }, [])

  /** 展开：**先上屏**（同步定位 + 立刻渲染），**再刷新**（等这一帧画完才发请求）。 */
  const openNow = React.useCallback(function () {
    if (closeTimerRef.current) { window.clearTimeout(closeTimerRef.current); closeTimerRef.current = 0 }
    const pos = anchorToPill()
    if (pos) setPanelPos(pos)
    setClosing(false)
    setOpen(true)
    writeFlag(PANEL_OPEN_KEY, true)
    if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current)
    const run = function () {
      refreshTimerRef.current = 0
      refreshAll() // 额度 + 已开启的账单，force=1
    }
    const afterPaint = function () { refreshTimerRef.current = window.setTimeout(run, 0) }
    try { window.requestAnimationFrame(afterPaint) } catch (e) { afterPaint() }
  }, [anchorToPill, refreshAll])

  React.useEffect(function () {
    if (!open) {
      setPanelPos(null)
      setCfgOpen(false) // 面板收起时弹窗一起走，不留孤儿浮层
      return undefined
    }
    const raf = window.requestAnimationFrame(function () { refinePlacement() })
    const onResize = function () {
      const pos = anchorToPill()
      if (pos) setPanelPos(pos)
      window.requestAnimationFrame(function () { refinePlacement() })
    }
    const onDoc = function (e) {
      const t = e.target
      if (panelRef.current && panelRef.current.contains(t)) return
      if (pillRef.current && pillRef.current.contains(t)) return
      if (dlgRef.current && dlgRef.current.contains(t)) return // 弹窗已 portal 到 body，要单独放行
      closeNow()
    }
    const onKey = function (e) {
      if (e.key !== 'Escape') return
      if (cfgOpenRef.current) { setCfgOpen(false); return }
      closeNow()
    }
    window.addEventListener('resize', onResize)
    document.addEventListener('pointerdown', onDoc, true)
    document.addEventListener('keydown', onKey, true)
    return function () {
      window.cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('pointerdown', onDoc, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open, anchorToPill, refinePlacement, closeNow])
  // 账单开关 / 面板宽度变化 → 高度可能变，重新校正一次
  React.useEffect(function () {
    if (!open) return undefined
    const id = window.requestAnimationFrame(function () { refinePlacement() })
    return function () { window.cancelAnimationFrame(id) }
  }, [open, billing, panelW, refinePlacement])

  const openCfg = React.useCallback(function (e) {
    if (e && e.stopPropagation) e.stopPropagation()
    setCfgData({ workspaceId: '', consoleCookie: '', hasCookie: false, cookieMasked: '', billing: false, settingsWritable: true, msg: '', err: '' })
    window.fetch(HOST_API_CONFIG, { headers: HEADERS })
      .then(function (r) { return r.json() })
      .then(function (j) {
        if (j && j.ok) {
          setCfgData({
            workspaceId: j.workspaceId || '',
            consoleCookie: '',
            hasCookie: j.hasCookie,
            cookieMasked: j.cookieMasked || '',
            billing: j.billing === true,
            settingsWritable: j.settingsWritable !== false,
            msg: '',
            err: '',
          })
          // 弹窗里的开关 = 宿主里的值（与设置面板同一份），顺手校准面板本身
          setBillingPersist(j.billing === true)
        }
      })
      .catch(function () { /* 读不到就给空表单 */ })
    setCfgOpen(true)
  }, [setBillingPersist])
  /** 开关一改就落盘到宿主（与设置面板同源），失败时在弹窗里如实说明。 */
  const persistBilling = React.useCallback(function (next) {
    window.fetch(HOST_API_CONFIG, {
      method: 'POST',
      headers: Object.assign({ 'content-type': 'application/json' }, HEADERS),
      body: JSON.stringify({ billing: !!next }),
    })
      .then(function (r) { return r.json() })
      .then(function (j) {
        if (!j || !j.ok) { setCfgData(function (p) { return Object.assign({}, p, { err: (j && j.error) || '开关保存失败', msg: '' }) }); return }
        const okSettings = Array.isArray(j.persisted) && j.persisted.indexOf('settings:billing') !== -1
        setCfgData(function (p) {
          return Object.assign({}, p, {
            billing: j.billing === true,
            settingsWritable: j.settingsWritable !== false,
            err: '',
            msg: okSettings ? '开关已保存到设置（设置面板同源）' : '开关已生效（宿主设置只读，未落盘）',
          })
        })
        if (next) refreshOfficial(true) // 打开就顺手拉一次账单
      })
      .catch(function () { setCfgData(function (p) { return Object.assign({}, p, { err: '网络错误', msg: '' }) }) })
  }, [refreshOfficial])
  const saveCfg = React.useCallback(function () {
    const ws = cfgData.workspaceId.trim()
    const ck = cfgData.consoleCookie.trim()
    if (!ws && !ck) { setCfgData({ ...cfgData, err: '请至少填写一项（workspaceId / consoleCookie），或切换账单开关' }); return }
    window.fetch(HOST_API_CONFIG, {
      method: 'POST',
      headers: Object.assign({ 'content-type': 'application/json' }, HEADERS),
      body: JSON.stringify({ workspaceId: ws, consoleCookie: ck, billing: cfgData.billing === true }),
    })
      .then(function (r) { return r.json() })
      .then(function (j) {
        if (j && j.ok) {
          const synced = Array.isArray(j.persisted) && j.persisted.indexOf('settings') !== -1
          setCfgData({
            ...cfgData,
            msg: synced ? '已保存，正在刷新…' : '已保存到凭证文件（宿主设置只读，设置面板不会同步）',
            err: '',
          })
          setCfgOpen(false)
          refreshAll()
        } else {
          setCfgData({ ...cfgData, err: (j && j.error) || '保存失败' })
        }
      })
      .catch(function () { setCfgData({ ...cfgData, err: '网络错误' }) })
  }, [cfgData, refreshAll])

  // ── 展示用派生值 ──
  const now = useNow(TICK_MS)
  const ok = state.kind === 'ok' && !!state.usage
  const warn = ok && state.warn
  const err = state.kind === 'err'
  const spinning = state.kind === 'loading' || state.refreshing === true
  const updatedAt = fmtTime(state.fetchedAt)
  const pctOf = function (key) {
    if (!ok) return null
    const u = state.usage[key]
    return u && typeof u.percent === 'number' && isFinite(u.percent) ? u.percent : null
  }
  const pillPct = { rolling: pctOf('rolling'), weekly: pctOf('weekly'), monthly: pctOf('monthly') }
  const todayCost = (official && official.ok) ? official.todayCost : null
  const dotColor = err ? DANGER_COLOR : (warn ? WARN_COLOR : (spinning ? WARN_COLOR : BLUE))
  const titleText = err ? 'Open GO 获取失败' : 'Open GO'
  const toggleOpen = React.useCallback(function (e) {
    if (e && e.stopPropagation) e.stopPropagation()
    // 展开 = 先上屏再刷新；收起 = 先播出场动画（openNow/closeNow 都是无副作用的显式动作）
    if (open) closeNow()
    else openNow()
  }, [open, openNow, closeNow])

  // ── 展开面板主体 ──
  const quotaRows = TIERS.map(function (t) {
    const u = ok ? state.usage[t.key] : null
    return React.createElement(TierRow, {
      key: t.key,
      tier: t,
      percent: u ? u.percent : null,
      resetsAt: u ? u.resetsAt : null,
      resetsIn: u ? u.resetsIn : null,
      now: now,
      loading: !ok && !err,
    })
  })

  const billingBlock = !billing ? null : [
    React.createElement('div', { key: 'ohead', className: 'dshoq-sect' }, [
      React.createElement('span', { key: 't', className: 'dshoq-sect-t' }, '官方账单'),
      React.createElement('span', { key: 'n', className: 'dshoq-sect-n' }, 'opencode 控制台'),
    ]),
    official && official.error
      ? React.createElement('div', { key: 'oerr', className: 'dshoq-err' }, '官方账单获取失败：' + official.error)
      : (official && (official.models || official.todayModels)
        ? React.createElement('div', { key: 'oblock', style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, [
          // 今日（紫）
          React.createElement('div', { key: 'today', className: 'dshoq-bill dshoq-bill--today' }, [
            React.createElement('div', { key: 'h', className: 'dshoq-bill-head' }, [
              React.createElement('span', { key: 'l', className: 'dshoq-bill-t' }, '今日'),
              React.createElement('span', { key: 'v', className: 'dshoq-bill-v' }, fmtUsd(official.todayCost || 0)),
            ]),
            (official.todayModels && official.todayModels.length > 0)
              ? official.todayModels.map(function (m) {
                return React.createElement(ModelRow, {
                  key: 't' + m.model,
                  model: m.model,
                  percent: official.todayCost > 0 ? (m.costUsd / official.todayCost) * 100 : 0,
                  costUsd: m.costUsd,
                  color: MODEL_BUSINESS,
                })
              })
              : React.createElement('div', { key: 'empty', className: 'dshoq-note' }, '今日暂无消耗'),
          ]),
          // 本月（绿，前 4 名）
          React.createElement('div', { key: 'month', className: 'dshoq-bill dshoq-bill--month' }, [
            React.createElement('div', { key: 'h', className: 'dshoq-bill-head' }, [
              React.createElement('span', { key: 'l', className: 'dshoq-bill-t' }, '本月'),
              React.createElement('span', { key: 'v', className: 'dshoq-bill-v' }, fmtUsd(official.monthTotal || 0)),
            ]),
            (official.models && official.models.length > 0)
              ? official.models.slice(0, 4).map(function (m) {
                return React.createElement(ModelRow, {
                  key: 'm' + m.model,
                  model: m.model,
                  percent: official.monthTotal > 0 ? (m.costUsd / official.monthTotal) * 100 : 0,
                  costUsd: m.costUsd,
                  color: MODEL_SUCCESS,
                })
              })
              : React.createElement('div', { key: 'empty', className: 'dshoq-note' }, '本月暂无消耗'),
          ]),
        ])
        : React.createElement('div', { key: 'ol', className: 'dshoq-note' }, '官方账单加载中…')),
  ]

  const panel = React.createElement('div', {
    ref: panelRef,
    key: 'panel',
    className: 'dshoq-scope dshoq-panel' + (closing ? ' dshoq-panel--out' : ' dshoq-panel--in'),
    style: {
      width: panelW + 'px',
      maxWidth: 'calc(100vw - 16px)',
      left: panelPos ? panelPos.left + 'px' : '0',
      top: (panelPos && typeof panelPos.top === 'number') ? panelPos.top + 'px' : 'auto',
      bottom: (panelPos && typeof panelPos.bottom === 'number') ? panelPos.bottom + 'px' : 'auto',
      visibility: panelPos ? 'visible' : 'hidden',
      '--oq-origin': origin,
    },
  }, [
    // 标题栏：状态点 + Open GO + 更新时间 + ⚙ / ↻
    React.createElement('div', { key: 'head', className: 'dshoq-head' }, [
      React.createElement('span', {
        key: 'dot',
        className: 'dshoq-dot' + (spinning ? ' dshoq-dot--busy' : ''),
        style: { background: dotColor },
      }),
      React.createElement('span', { key: 't', className: 'dshoq-title' }, titleText),
      updatedAt ? React.createElement('span', { key: 'u', className: 'dshoq-time', role: 'status' }, updatedAt + ' 更新') : null,
      React.createElement('div', { key: 'acts', className: 'dshoq-acts' }, [
        React.createElement('button', {
          key: 'c',
          type: 'button',
          className: 'dshoq-icon',
          title: '设置：账单显示开关 / workspace id / cookie',
          'aria-label': 'Open GO 设置',
          onClick: openCfg,
        }, React.createElement('span', { key: 'g', className: 'dshoq-gear' }, '⚙')),
        React.createElement('button', {
          key: 'r',
          type: 'button',
          className: 'dshoq-icon',
          title: '刷新全部（额度' + (billing ? ' + 官方账单' : '') + '）',
          'aria-label': '刷新',
          onClick: function (e) { if (e && e.stopPropagation) e.stopPropagation(); refreshAll() },
        }, err ? '重试' : React.createElement('span', { key: 'i', className: spinning ? 'dshoq-spin' : '' }, '↻')),
      ]),
    ]),
    // —— 额度卡片（不起分区标题：三行自带档位名；账单开着时由「官方账单」那条线分隔）——
    React.createElement('div', { key: 'qcard', className: 'dshoq-card' }, quotaRows),
    err ? React.createElement('div', { key: 'err', className: 'dshoq-err' }, state.error) : null,
    warn ? React.createElement('div', { key: 'warn', className: 'dshoq-warn' }, '额度更新失败（仍显示上次数据）：' + warn) : null,
    // —— 官方账单（开关关闭时不渲染、也不请求官网接口）——
    billingBlock,
  ])

  // —— ⚙ 弹窗：单独挂到 body ——
  // 面板带进场 transform 动画，会把内部 fixed 元素变成「相对面板定位」，
  // 弹窗若留在面板里就会被面板裁掉，所以走独立 portal。
  const cfgDialog = React.createElement('div', {
    key: 'cfg',
    ref: dlgRef,
    className: 'dshoq-scope dshoq-backdrop',
    onClick: function () { setCfgOpen(false) },
  }, [
      React.createElement('div', {
        key: 'dlg',
        className: 'dshoq-dialog dshoq-dialog--in',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': 'Open GO 设置',
        onClick: function (e) { e.stopPropagation() },
      }, [
        React.createElement('div', { key: 't', className: 'dshoq-dlg-title' }, 'Open GO 设置'),
        React.createElement('div', { key: 'sw', className: 'dshoq-switch-row' }, [
          React.createElement('div', { key: 'txt', className: 'dshoq-switch-txt' }, [
            React.createElement('span', { key: 't', className: 'dshoq-switch-t' }, '显示官方账单'),
            // 与宿主 schema 的描述同句（BILLING_DESC），避免弹窗/设置面板两处措辞漂移
            React.createElement('span', { key: 's', className: 'dshoq-switch-sub' }, '在面板里显示今日 / 本月消耗（需控制台 cookie）'),
          ]),
          React.createElement(Switch, {
            key: 'swbtn',
            on: cfgData.billing,
            label: '显示官方账单',
            // 立即生效 + 落盘到宿主设置存储（与「设置 → 插件 → opencode-quota」同源）
            onChange: function (next) {
              setBillingPersist(next)
              setCfgData(function (p) { return Object.assign({}, p, { billing: !!next, msg: '', err: '' }) })
              persistBilling(next)
            },
          }),
        ]),
        React.createElement('label', { key: 'l1', className: 'dshoq-field' }, [
          'Workspace ID（用量页 URL 的 wrk_... 段）',
          React.createElement('input', {
            className: 'dshoq-input',
            value: cfgData.workspaceId,
            onChange: function (e) { setCfgData({ ...cfgData, workspaceId: e.target.value, err: '' }) },
            placeholder: 'wrk_01KZZVJ4HX6PR54FNAZJWXFWHX',
          }),
          React.createElement('span', { key: 'h', className: 'dshoq-hint' }, '它标识你在 opencode.ai 的哪个工作区：官方账单接口靠它定位查哪份用量（一个账号下可能有多个工作区，账单分开统计）。打开 https://opencode.ai/workspace/ 用量页，地址栏里 wrk_... 就是它。额度功能用 API key，不依赖此项。'),
        ]),
        React.createElement('label', { key: 'l2', className: 'dshoq-field' }, [
          '控制台 Cookie（auth=... 完整值）',
          React.createElement('input', {
            className: 'dshoq-input',
            type: 'password',
            value: cfgData.consoleCookie,
            onChange: function (e) { setCfgData({ ...cfgData, consoleCookie: e.target.value, err: '' }) },
            placeholder: cfgData.hasCookie ? ('已配置：' + cfgData.cookieMasked + '（留空则不修改）') : 'auth=Fe26.2**...',
          }),
        ]),
        cfgData.err ? React.createElement('div', { key: 'e', className: 'dshoq-err' }, cfgData.err) : null,
        cfgData.msg ? React.createElement('div', { key: 'm', style: { fontSize: '12px', color: 'var(--dsw-alias-state-success-primary,#34d399)' } }, cfgData.msg) : null,
        React.createElement('div', { key: 'btns', className: 'dshoq-btns' }, [
          React.createElement('button', {
            key: 'x',
            type: 'button',
            className: 'dshoq-btn',
            onClick: function () { setCfgOpen(false) },
          }, '取消'),
          React.createElement('button', {
            key: 's',
            type: 'button',
            className: 'dshoq-btn dshoq-btn--primary',
            onClick: saveCfg,
          }, '保存'),
        ]),
        React.createElement('div', { key: 'hint', className: 'dshoq-hint' }, '获取 cookie：登录 opencode.ai 用量页 → F12 → Network（网络）→ 刷新页面 → 请求标头 cookie: 行复制 auth=... 值（或 Application → Cookies）。'),
      ]),
    ])

  const cfgNode = cfgOpen ? (hasPortal ? ReactDOM.createPortal(cfgDialog, document.body) : cfgDialog) : null

  const panelNode = hasPortal && render ? ReactDOM.createPortal(panel, document.body) : (render ? panel : null)

  // ── 窄侧栏（rail）：三根迷你条 + 箭头 ──
  if (!wide) {
    const btn = React.createElement('button', {
      ref: pillRef,
      key: 'rail',
      type: 'button',
      className: 'dshoq-scope dshoq-rail',
      title: open ? '收起 Open GO 面板' : '展开 Open GO 面板（额度' + (billing ? ' + 官方账单' : '') + '）',
      'aria-label': 'Open GO 额度',
      'aria-expanded': open ? 'true' : 'false',
      onClick: toggleOpen,
    }, [
      React.createElement('div', { key: 'bars', className: 'dshoq-minibars' }, TIERS.map(function (t) {
        const pct = pillPct[t.key]
        return React.createElement('div', { key: t.key, className: 'dshoq-minibar' }, [
          React.createElement(MiniFill, {
            key: 'f',
            pct: pct,
            color: pct === null ? 'var(--oq-track)' : tierTone(t, pct),
          }),
        ])
      })),
      React.createElement('span', {
        key: 'pct',
        style: { fontSize: '10px', fontWeight: 600, lineHeight: 1, color: err ? DANGER_COLOR : MAIN },
      }, pillPct.monthly === null ? '–' : Math.round(pillPct.monthly) + '%'),
      React.createElement(Chevron, { key: 'chev', open: open, size: 9 }),
    ])
    return React.createElement('div', { className: 'dshoq-scope dshoq-wrap' }, [btn, panelNode, cfgNode])
  }

  // ── 宽侧栏：单行 pill（GO + 三档读数 + 箭头）──
  const pill = React.createElement('button', {
    ref: pillRef,
    key: 'pill',
    type: 'button',
    className: 'dshoq-scope dshoq-pill',
    'aria-expanded': open ? 'true' : 'false',
    'aria-label': 'Open GO 额度面板',
    title: open ? '收起 Open GO 面板' : '展开 Open GO 面板',
    onClick: toggleOpen,
  }, [
    React.createElement('span', { key: 'b', className: 'dshoq-badge' }, 'GO'),
    React.createElement('span', {
      key: 'dot',
      className: 'dshoq-dot' + (spinning ? ' dshoq-dot--busy' : ''),
      style: { background: dotColor },
    }),
    err
      ? React.createElement('span', { key: 'e', className: 'dshoq-v', style: { color: DANGER_COLOR } }, '获取失败')
      : React.createElement(TierReadout, { key: 'r', pct: pillPct }),
    (billing && todayCost !== null)
      ? React.createElement('span', { key: 'sep2', className: 'dshoq-sep' }, '·')
      : null,
    (billing && todayCost !== null)
      ? React.createElement('span', { key: 'today', className: 'dshoq-k' }, '今日 ' + fmtUsd(todayCost))
      : null,
    React.createElement(Chevron, { key: 'chev', open: open, size: 11 }),
  ])
  return React.createElement('div', { className: 'dshoq-scope dshoq-wrap' }, [pill, panelNode, cfgNode])
}

function apply(ctx) {
  if (!hasReact) { console.warn(TAG, 'React 不可用，组件未挂载'); return }
  const slots = ctx.get('slots')
  if (slots === undefined) { console.warn(TAG, 'slots 服务不可用'); return }
  try {
    slots.inject('sidebar.footer.action', function () {
      return slots.register(
        { name: 'sidebar.footer.action', id: 'opencode-quota-widget', order: 20, label: 'Open GO' },
        function (props) { return React.createElement(QuotaWidget, props) },
      )
    })
    console.log(TAG, '已注册到 sidebar.footer.action（设置按钮上方）')
  } catch (e) {
    console.warn(TAG, '注册失败：', e && e.message)
  }
}

exports.apply = apply
exports.inject = ['slots']
return module.exports;
} });
