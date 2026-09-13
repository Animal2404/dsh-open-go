/**
 * sidebar-check.mjs — dsh-opencode-quota v0.9.0 的本地视觉验证（无头 Chrome + CDP，零依赖）
 *
 * 做什么：
 *  1. 用本机 dsh 自己签发的会话密钥（~/.dsh/.credentials.yaml → client-connection/browser-session）
 *     签一个只对 127.0.0.1 有效的 cookie，打开正在运行的 dsh web（**不碰用户的浏览器进程**）；
 *  2. 确认宿主实际下发的是「本次改过的」client bundle（抓 bundle URL 查标记串）；
 *  3. 依次截图：收起态 pill / 展开面板（账单默认关）/ ⚙ 弹窗（开关关→开）/ 账单展开 / 亮色主题 /
 *     窄 rail 形态，并打印几何与样式探针（不靠肉眼猜）。
 *
 * 用法（插件根目录）：
 *   node .verify/sidebar-check.mjs [输出目录，默认 .verify/shots]
 */
import { spawn } from 'node:child_process'
import { createHash, createHmac } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.env.DSH_WEB_URL ?? 'http://127.0.0.1:3080'
const TARGET = new URL(BASE)
const AUTHORITY = TARGET.host
const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  join(process.env.LOCALAPPDATA ?? '', 'Google\\Chrome\\Application\\chrome.exe'),
  join(process.env.LOCALAPPDATA ?? '', 'Microsoft\\Edge\\Application\\msedge.exe'),
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean)
const CHROME = CANDIDATES.find((p) => existsSync(p))
const PORT = Number(process.env.CDP_PORT ?? 9334)
const OUT = process.argv[2] ?? join(process.cwd(), '.verify', 'shots')
const CRED = join(homedir(), '.dsh', '.credentials.yaml')
/** 本次改动的「指纹」：新皮肤类名，用来证明宿主发的是新代码。 */
const MARK = 'dshoq-badge'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const b64url = (buf) => Buffer.from(buf).toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')

function mintCookie() {
  const text = readFileSync(CRED, 'utf8')
  const start = text.indexOf('client-connection/browser-session:')
  if (start < 0) throw new Error('凭据文件里没有 browser-session 记录')
  const after = text.slice(start)
  const endRel = after.search(/\n {2}\S/)
  const block = endRel >= 0 ? after.slice(0, endRel) : after
  const raw = /secret:\s*([A-Za-z0-9_-]+)/.exec(block)?.[1]
  if (typeof raw !== 'string' || raw.length === 0) throw new Error('凭据文件里没有 browser-session 密钥')
  const secret = Buffer.from(raw.replaceAll('-', '+').replaceAll('_', '/'), 'base64')
  if (secret.byteLength !== 32) throw new Error(`密钥长度异常：${secret.byteLength}`)
  const now = Date.now()
  const payload = { version: 1, authority: AUTHORITY, issuedAt: now, expiresAt: now + 86_400_000 }
  const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'))
  const sig = b64url(createHmac('sha256', secret).update(body).digest())
  const name = 'dsh-auth-' + b64url(createHash('sha256').update(AUTHORITY).digest())
  return { name, value: `v1.${body}.${sig}` }
}

class Cdp {
  constructor(ws) {
    this.ws = ws
    this.next = 1
    this.pending = new Map()
    this.events = []
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        msg.error ? reject(new Error(`${msg.error.message} (${JSON.stringify(msg.error.data ?? '')})`)) : resolve(msg.result)
      } else if (msg.method) this.events.push(msg)
    })
  }
  send(method, params = {}, sessionId) {
    const id = this.next++
    const payload = { id, method, params }
    if (sessionId) payload.sessionId = sessionId
    this.ws.send(JSON.stringify(payload))
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      setTimeout(() => { if (this.pending.delete(id)) reject(new Error(`CDP 超时：${method}`)) }, 30_000)
    })
  }
  async until(predicate, timeoutMs, what) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const hit = this.events.find(predicate)
      if (hit) return hit
      await sleep(120)
    }
    throw new Error(`等待超时：${what}`)
  }
}

async function evaluate(cdp, sessionId, expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId)
  if (r.exceptionDetails) throw new Error(`页面 JS 抛错：${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ''}`)
  return r.result?.value
}

async function untilJs(cdp, sessionId, expression, timeoutMs, what) {
  const deadline = Date.now() + timeoutMs
  let last = null
  while (Date.now() < deadline) {
    last = await evaluate(cdp, sessionId, expression)
    if (last) return last
    await sleep(250)
  }
  throw new Error(`等待超时：${what}（最后一次求值：${JSON.stringify(last)}）`)
}

async function shot(cdp, sessionId, name, clip) {
  const params = { format: 'png' }
  if (clip) params.clip = { x: Math.max(0, clip.x), y: Math.max(0, clip.y), width: clip.width, height: clip.height, scale: clip.scale ?? 2 }
  const { data } = await cdp.send('Page.captureScreenshot', params, sessionId)
  const file = join(OUT, `${name}.png`)
  writeFileSync(file, Buffer.from(data, 'base64'))
  console.log(`  📸 ${file}`)
  return file
}

/** 元素外框 + 边距 → 截图裁剪区。 */
const boxOf = (sel, pad = 6) => `
(() => {
  const el = document.querySelector(${JSON.stringify(sel)})
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { x: r.left - ${pad}, y: r.top - ${pad}, width: r.width + ${pad * 2}, height: r.height + ${pad * 2}, scale: 2 }
})()`

const unionBox = (sels, pad = 10) => `
(() => {
  const rs = ${JSON.stringify(sels)}.map((s) => document.querySelector(s)).filter(Boolean).map((el) => el.getBoundingClientRect())
  if (rs.length === 0) return null
  const left = Math.min(...rs.map((r) => r.left)), top = Math.min(...rs.map((r) => r.top))
  const right = Math.max(...rs.map((r) => r.right)), bottom = Math.max(...rs.map((r) => r.bottom))
  return { x: left - ${pad}, y: top - ${pad}, width: right - left + ${pad * 2}, height: bottom - top + ${pad * 2}, scale: 2 }
})()`

const PROBE = `
(() => {
  const pill = document.querySelector('.dshoq-pill')
  const rail = document.querySelector('.dshoq-rail')
  const panel = document.querySelector('.dshoq-panel')
  const p = panel && getComputedStyle(panel)
  const bar = document.querySelector('.dshoq-bar')
  const fill = bar && bar.querySelector('.dshoq-fill')
  const rows = [...document.querySelectorAll('.dshoq-row')].map((r) => ({
    text: (r.textContent || '').replace(/\\s+/g, ' ').trim(),
    label: r.querySelector('.dshoq-label')?.textContent ?? null,
    pct: r.querySelector('.dshoq-pct')?.textContent ?? null,
    reset: r.querySelector('.dshoq-reset-v')?.textContent ?? null,
    fillWidth: r.querySelector('.dshoq-fill') ? getComputedStyle(r.querySelector('.dshoq-fill')).width : null,
    barWidth: r.querySelector('.dshoq-bar') ? getComputedStyle(r.querySelector('.dshoq-bar')).width : null,
    barH: r.querySelector('.dshoq-bar') ? getComputedStyle(r.querySelector('.dshoq-bar')).height : null,
    pctColor: r.querySelector('.dshoq-pct') ? getComputedStyle(r.querySelector('.dshoq-pct')).color : null,
  }))
  const dlg = document.querySelector('[role="dialog"][aria-label="Open GO 设置"]')
  const sw = document.querySelector('.dshoq-switch')
  return {
    mode: pill ? 'wide' : (rail ? 'rail' : 'none'),
    pillText: pill ? (pill.textContent || '').replace(/\\s+/g, ' ').trim() : null,
    pillBox: pill ? (() => { const r = pill.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top) } })() : null,
    pillExpanded: pill ? pill.getAttribute('aria-expanded') : null,
    chev: (() => {
      const c = document.querySelector('.dshoq-chev') || document.querySelector('.dshoq-rail .dshoq-chev')
      if (!c) return null
      return { cls: c.getAttribute('class'), transform: getComputedStyle(c).transform }
    })(),
    railText: rail ? (rail.textContent || '').replace(/\\s+/g, ' ').trim() : null,
    panel: panel ? {
      w: Math.round(panel.getBoundingClientRect().width),
      h: Math.round(panel.getBoundingClientRect().height),
      offsetH: Math.round(panel.offsetHeight), // 不含 transform 的布局高度：用来区分"真布局变化"与"动效缩放期间量测抖动"
      offsetW: Math.round(panel.offsetWidth),
      x: Math.round(panel.getBoundingClientRect().left),
      y: Math.round(panel.getBoundingClientRect().top),
      bg: p.backgroundColor, color: p.color, radius: p.borderRadius,
      animation: p.animationName,
      overflowX: Math.round(panel.scrollWidth - panel.clientWidth),
      overflowY: Math.round(panel.scrollHeight - panel.clientHeight),
      cls: panel.className,
      fontFamily: p.fontFamily.slice(0, 40),
    } : null,
    title: document.querySelector('.dshoq-title')?.textContent ?? null,
    titleFont: document.querySelector('.dshoq-title') ? getComputedStyle(document.querySelector('.dshoq-title')).fontSize : null,
    sectionTitles: [...document.querySelectorAll('.dshoq-sect-t')].map((n) => n.textContent),
    rows,
    firstFill: fill ? { width: getComputedStyle(fill).width, bg: getComputedStyle(fill).backgroundColor } : null,
    billingShown: document.querySelectorAll('.dshoq-bill').length,
    billingText: [...document.querySelectorAll('.dshoq-bill')].map((b) => (b.textContent || '').replace(/\\s+/g, ' ').trim()),
    dialog: dlg ? { open: true, w: Math.round(dlg.getBoundingClientRect().width), h: Math.round(dlg.getBoundingClientRect().height), text: (dlg.textContent || '').replace(/\\s+/g, ' ').slice(0, 160) } : { open: false },
    switch: sw ? { checked: sw.getAttribute('aria-checked'), knob: getComputedStyle(sw.querySelector('.dshoq-knob')).transform, track: getComputedStyle(sw).backgroundColor } : null,
    glyphWarn: document.querySelector('.dshoq-warn')?.textContent ?? null,
    note: document.querySelector('.dshoq-note')?.textContent ?? null,
  }
})()`

/** 开合延迟测量：点 pill 之后，逐帧记「面板是否挂载 / 是否可见 / 行有没有数 / 动画」。
 *  目的是把"感觉慢"拆成可比的毫秒：挂载延迟、可见延迟、动画时长、数据到位时间。 */
const MEASURE_OPEN = `
(async () => {
  const t = () => performance.now()
  const pill = document.querySelector('.dshoq-pill')
  if (!pill) return { error: 'no pill' }
  const marks = {}
  const rowsText = () => [...document.querySelectorAll('.dshoq-pct')].map((e) => e.textContent).join(',')
  const before = { rows: document.querySelectorAll('.dshoq-row').length, updated: document.querySelector('.dshoq-time')?.textContent ?? null }
  const frames = []
  const t0 = t()
  pill.click()
  const start = t()
  let paintedAt = null
  await new Promise((res) => {
    const tick = () => {
      const now = t() - t0
      const p = document.querySelector('.dshoq-panel')
      const vis = p ? getComputedStyle(p).visibility : null
      const anim = p ? getComputedStyle(p).animationName : null
      if (p && marks.mount === undefined) marks.mount = Math.round(now)
      if (vis === 'visible' && marks.visible === undefined) { marks.visible = Math.round(now); paintedAt = now }
      if (p && anim === 'dshoq-in' && marks.animStart === undefined) marks.animStart = Math.round(now)
      if (p && anim === 'none' && marks.animStart !== undefined && marks.animEnd === undefined) marks.animEnd = Math.round(now)
      const fill = document.querySelector('.dshoq-fill')
      const bar = document.querySelector('.dshoq-bar')
      const fw = fill ? Math.round(fill.getBoundingClientRect().width * 10) / 10 : null
      const bw = bar ? Math.round(bar.getBoundingClientRect().width) : null
      frames.push({ t: Math.round(now), panel: !!p, vis, anim, rows: document.querySelectorAll('.dshoq-row').length, w1: fw, barW: bw, pct: rowsText(), upd: (document.querySelector('.dshoq-time')?.textContent ?? '').trim() })
      if (now < 1400) requestAnimationFrame(tick); else res()
    }
    requestAnimationFrame(tick)
  })
  const panel = document.querySelector('.dshoq-panel')
  const anims = panel && panel.getAnimations ? panel.getAnimations().map((a) => ({ name: a.animationName, dur: a.effect?.getTiming?.().duration ?? null })) : null
  // 刷新请求相对"点击那一刻"的起点（performance 时间轴同源）：验证「先展开、后刷新」
  const apiReqs = performance.getEntriesByType('resource')
    .filter((e) => e.name.indexOf('/dsh-opencode-quota/api/status') !== -1)
    .map((e) => ({ at: Math.round(e.startTime - t0), dur: Math.round(e.duration) }))
  return {
    before,
    marks: { ...marks, animDurationConfigured: anims },
    first: frames.slice(0, 10),
    after600: frames.find((f) => f.t >= 600) ?? null,
    frames: frames.length,
    rowsAtFirstPaint: (frames.find((f) => f.vis === 'visible') ?? {}).rows ?? null,
    pctAtFirstPaint: (frames.find((f) => f.vis === 'visible') ?? {}).pct ?? null,
    apiRequestsAfterClick: apiReqs,
    // 展开生长动画：首帧宽度 / 终态宽度 / 中间出现过的不同宽度个数（>2 说明是补间而不是瞬跳）
    fill: (() => {
      const withFill = frames.filter((f) => f.w1 !== null)
      const widths = withFill.map((f) => f.w1)
      const uniq = [...new Set(widths)]
      const last = withFill[withFill.length - 1] ?? null
      return {
        firstFrame: widths[0] ?? null,
        settled: last ? last.w1 : null,
        barW: last ? last.barW : null,
        settledRatioPct: last && last.barW ? Math.round((last.w1 / last.barW) * 1000) / 10 : null,
        distinctWidths: uniq.length,
        monotonic: widths.every((w, i) => i === 0 || w >= widths[i - 1]),
        samplePath: widths.slice(0, 8),
      }
    })(),
  }
})()`

async function main() {
  if (!CHROME) throw new Error('找不到 Chrome/Edge：设 CHROME_PATH 环境变量')
  mkdirSync(OUT, { recursive: true })
  const cookie = mintCookie()
  console.log(`chrome : ${CHROME}`)
  console.log(`cookie : ${cookie.name} (len ${cookie.value.length})`)

  const profile = join(tmpdir(), `oq-verify-${Date.now()}`)
  const child = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--window-size=1440,1000', 'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] })

  const wsUrl = await new Promise((resolve, reject) => {
    let buf = ''
    const t = setTimeout(() => reject(new Error(`chrome 没在 20s 内报出调试端口\n${buf.slice(-400)}`)), 20_000)
    const scan = (chunk) => {
      buf += chunk.toString()
      const m = /ws:\/\/[^\s]+/.exec(buf)
      if (m) { clearTimeout(t); resolve(m[0]) }
    }
    child.stderr.on('data', scan)
    child.stdout.on('data', scan)
    child.on('exit', (code) => reject(new Error(`chrome 提前退出 code=${code}`)))
  })

  const ws = new WebSocket(wsUrl)
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
  const cdp = new Cdp(ws)
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
  await cdp.send('Page.enable', {}, sessionId)
  await cdp.send('Runtime.enable', {}, sessionId)
  await cdp.send('Network.enable', {}, sessionId)
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId)
  await cdp.send('Network.setCookie', {
    name: cookie.name, value: cookie.value, domain: TARGET.hostname, path: '/',
    httpOnly: true, secure: false, sameSite: 'Strict',
  }, sessionId)

  console.log('打开 GUI…')
  await cdp.send('Page.navigate', { url: BASE + '/' }, sessionId)
  await cdp.until((e) => e.method === 'Page.loadEventFired', 30_000, 'page load')
  await untilJs(cdp, sessionId, `Boolean(document.querySelector('.dshoq-pill') || document.querySelector('.dshoq-rail'))`, 40_000, 'Open GO 组件挂载')
  // 等额度真值到达再截图：否则截到的是加载态（`–`），看不到数字/进度条在材质上的可读性
  await untilJs(cdp, sessionId, `(() => { const p = document.querySelector('.dshoq-pill'); return Boolean(p && /%/.test(p.textContent || '')) })()`, 40_000, '额度数据到达')
  await sleep(800)

  // ── 0. 宿主下发的 bundle 是不是本次改过的？──
  const bundle = await evaluate(cdp, sessionId, `
    (async () => {
      const urls = [...performance.getEntriesByType('resource')].map((e) => e.name).filter((n) => /opencode-quota/.test(n))
      let mark = null, hit = null, bytes = null
      for (const u of urls) {
        try {
          const t = await (await fetch(u)).text()
          if (t.includes(${JSON.stringify(MARK)})) { hit = u; bytes = t.length; mark = true; break }
          if (mark === null) { mark = false; bytes = t.length }
        } catch (e) { /* 忽略 */ }
      }
      return { urls, mark, hit, bytes }
    })()`)
  console.log('bundle 探针:', JSON.stringify(bundle))

  console.log('探针（收起态，面板关）…')
  console.log('  ', JSON.stringify(await evaluate(cdp, sessionId, PROBE)))
  await shot(cdp, sessionId, '01-pill', await evaluate(cdp, sessionId, boxOf('.dshoq-pill', 6)))
  await shot(cdp, sessionId, '01b-window', null)

  // ── 0b. 开合延迟测量（点 pill → 面板挂载 → 可见 → 动画结束 → 数据刷新）──
  console.log('开合延迟测量…')
  console.log('  ', JSON.stringify(await evaluate(cdp, sessionId, MEASURE_OPEN)))
  await sleep(200)
  // 收起 → 确认面板已卸载 → 再展开：验证生长动画能重播（第一轮的终点也要停住）
  await evaluate(cdp, sessionId, `(() => { const p = document.querySelector('.dshoq-pill'); if (p) p.click(); return true })()`)
  await sleep(600)
  const unmounted = await evaluate(cdp, sessionId, `(() => document.querySelector('.dshoq-panel') === null)()`)
  console.log('重播前确认面板已卸载:', unmounted)
  console.log('重播测量（第二次展开）…')
  console.log('  ', JSON.stringify(await evaluate(cdp, sessionId, MEASURE_OPEN)))
  await sleep(200)
  // 中途帧截图（80ms / 260ms / 800ms）：留作"从 0 长上去"的视觉证据
  await evaluate(cdp, sessionId, `(() => { const p = document.querySelector('.dshoq-pill'); if (p) p.click(); return true })()`)
  await sleep(600)
  await evaluate(cdp, sessionId, `(() => { const p = document.querySelector('.dshoq-pill'); if (p) p.click(); return true })()`)
  await sleep(80)
  await shot(cdp, sessionId, '09-grow-80ms', await evaluate(cdp, sessionId, boxOf('.dshoq-panel', 4)))
  await sleep(180)
  await shot(cdp, sessionId, '09b-grow-260ms', await evaluate(cdp, sessionId, boxOf('.dshoq-panel', 4)))
  await sleep(540)
  await shot(cdp, sessionId, '09c-grow-settled', await evaluate(cdp, sessionId, boxOf('.dshoq-panel', 4)))
  await sleep(200)
  await evaluate(cdp, sessionId, `(() => { const p = document.querySelector('.dshoq-pill'); if (p) p.click(); return true })()`)
  await sleep(500)

  // ── 1. 展开面板（账单默认关）──
  console.log('点开 pill…')
  console.log('  ', JSON.stringify(await evaluate(cdp, sessionId, `(() => { const p = document.querySelector('.dshoq-pill'); p.click(); return true })()`)))
  await sleep(900)
  const probeOpen = await evaluate(cdp, sessionId, PROBE)
  console.log('  ', JSON.stringify(probeOpen))
  await shot(cdp, sessionId, '02-panel-quota', await evaluate(cdp, sessionId, unionBox(['.dshoq-pill', '.dshoq-panel'], 10)))
  await shot(cdp, sessionId, '02b-panel-only', await evaluate(cdp, sessionId, boxOf('.dshoq-panel', 4)))

  // ── 2b. 材质探针：算样式 + 静态父链；再临时关掉 backdrop-filter 看边缘光晕是否消失 ──
  console.log('材质探针:', JSON.stringify(await evaluate(cdp, sessionId, `(() => {
    const cs = (el) => { const s = getComputedStyle(el); return { bg: s.backgroundColor, bgImage: (s.backgroundImage || '').slice(0, 70), border: s.borderTopWidth + ' ' + s.borderTopStyle + ' ' + s.borderTopColor, shadow: s.boxShadow, backdrop: (s.backdropFilter || s.webkitBackdropFilter || 'none'), radius: s.borderRadius, color: s.color } }
    const chain = (el) => { const out = []; let n = el; for (let i = 0; i < 4 && n; i++, n = n.parentElement) { const s = getComputedStyle(n); out.push({ tag: n.tagName, cls: String(n.className).slice(0, 46), border: s.borderTopWidth + ' ' + s.borderTopColor, bg: s.backgroundColor }) } return out }
    const p = document.querySelector('.dshoq-panel')
    const pill = document.querySelector('.dshoq-pill')
    const card = document.querySelector('.dshoq-card')
    const badge = document.querySelector('.dshoq-badge')
    const back = document.querySelector('.dshoq-backdrop')
    return {
      panel: p ? cs(p) : null,
      pill: pill ? cs(pill) : null,
      card: card ? cs(card) : null,
      badge: badge ? cs(badge) : null,
      backdrop: back ? cs(back) : null,
      pillChain: pill ? chain(pill) : null,
      panelParent: p ? String(p.parentElement.tagName) : null,
      frostedLeftovers: [...document.querySelectorAll('.dshoq-scope *')].filter((el) => { const s = getComputedStyle(el); return (s.backdropFilter && s.backdropFilter !== 'none') || /feTurbulence/.test(s.backgroundImage || '') }).length,
    }
  })()`)))
  await evaluate(cdp, sessionId, `(() => { const p = document.querySelector('.dshoq-panel'); if (p) p.style.backdropFilter = 'none'; return true })()`)
  await sleep(250)
  await shot(cdp, sessionId, '08-panel-noblur', await evaluate(cdp, sessionId, boxOf('.dshoq-panel', 4)))
  await evaluate(cdp, sessionId, `(() => { const p = document.querySelector('.dshoq-panel'); if (p) p.style.backdropFilter = ''; return true })()`)
  await sleep(150)

  // ── 2. ⚙ 弹窗（开关关 → 开）──
  console.log('点齿轮…')
  console.log('  ', JSON.stringify(await evaluate(cdp, sessionId, `(() => { const b = document.querySelector('.dshoq-icon'); if (!b) return false; b.click(); return true })()`)))
  await sleep(600)
  console.log('  ', JSON.stringify(await evaluate(cdp, sessionId, PROBE)))
  await shot(cdp, sessionId, '03-settings-off', await evaluate(cdp, sessionId, boxOf('.dshoq-dialog', 8)))
  await shot(cdp, sessionId, '03b-window-settings', null)
  console.log('  弹窗几何:', JSON.stringify(await evaluate(cdp, sessionId, `(() => { const d = document.querySelector('.dshoq-dialog'); const b = document.querySelector('.dshoq-backdrop'); if (!d) return null; const r = d.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2), vw: window.innerWidth, vh: window.innerHeight, backdropFixed: b ? getComputedStyle(b).position : null, parent: d.parentElement.className } })()`)))

  console.log('把「显示官方账单」开关打开…')
  console.log('  ', JSON.stringify(await evaluate(cdp, sessionId, `(() => { const s = document.querySelector('.dshoq-switch'); if (!s) return false; s.click(); return s.getAttribute('aria-checked') })()`)))
  await sleep(700)
  console.log('  ', JSON.stringify(await evaluate(cdp, sessionId, PROBE)))
  await shot(cdp, sessionId, '04-settings-on', await evaluate(cdp, sessionId, boxOf('.dshoq-dialog', 8)))

  // ── 3. 账单区出现（Esc 关弹窗）──
  console.log('Esc 关弹窗，等账单数据…')
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, sessionId)
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, sessionId)
  await sleep(4000)
  const probeBill = await evaluate(cdp, sessionId, PROBE)
  console.log('  ', JSON.stringify(probeBill))
  await shot(cdp, sessionId, '05-panel-billing', await evaluate(cdp, sessionId, unionBox(['.dshoq-pill', '.dshoq-panel'], 10)))
  await shot(cdp, sessionId, '05b-panel-billing-only', await evaluate(cdp, sessionId, boxOf('.dshoq-panel', 4)))

  // ── 5c. 齿轮设置全流程探针：开关落盘 / 保存写回设置存储 / 两端同源 ──
  // 注意：前面的步骤已经 Esc 关掉了弹窗，所以这里必须先点 ⚙ 重新打开（上次就是漏了这步，拿到的是 null）
  console.log('齿轮设置全流程探针…')
  const gear = await evaluate(cdp, sessionId, `(async () => {
    const H = { 'x-dsh-opencode-quota': '1' }
    const getCfg = () => fetch('/dsh-opencode-quota/api/config', { headers: H }).then((r) => r.json())
    const post = (body) => fetch('/dsh-opencode-quota/api/config', {
      method: 'POST',
      headers: Object.assign({ 'content-type': 'application/json' }, H),
      body: JSON.stringify(body),
    }).then((r) => r.json())
    const wait = (ms) => new Promise((r) => setTimeout(r, ms))
    const out = { before: await getCfg() }
    // ① 打开齿轮弹窗（标题栏那颗 aria-label='Open GO 设置' 的图标按钮）
    const gearBtn = [...document.querySelectorAll('.dshoq-icon')].find((b) => (b.getAttribute('aria-label') || '') === 'Open GO 设置')
    out.gearButtonFound = !!gearBtn
    gearBtn.click(); await wait(700)
    const sw = () => document.querySelector('.dshoq-switch')
    out.dialog = { open: !!document.querySelector('.dshoq-dialog'), switchFound: !!sw(), ariaChecked: sw() && sw().getAttribute('aria-checked') }
    // ② 开关：关 -> 开（每次都该落盘到设置存储）
    sw().click(); await wait(800)
    out.afterOff = await getCfg()
    sw().click(); await wait(800)
    out.afterOn = await getCfg()
    // ③ 保存：回填同一个 workspaceId（cookie 留空=不修改），验证 persisted 同时含 credentials 与 settings
    const input = document.querySelector('.dshoq-input')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, out.before.workspaceId || '')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await wait(150)
    const btn = [...document.querySelectorAll('.dshoq-btn')].find((b) => b.textContent.indexOf('保存') !== -1)
    btn.click(); await wait(1200)
    out.postViaButton = await getCfg()
    out.postDirect = await post({ workspaceId: out.before.workspaceId || '', consoleCookie: '' })
    out.afterDirect = await getCfg()
    // ④ 复原：开关交回 false（与运行前一致），弹窗收起，避免把测试态留给用户
    out.restore = await post({ billing: false })
    out.final = await getCfg()
    out.dialogStillOpen = !!document.querySelector('.dshoq-dialog')
    return out
  })()`)
  console.log('  ', JSON.stringify(gear))

  // ── 4. 亮色主题（模拟 prefers-color-scheme: light）──
  console.log('模拟亮色主题…')
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] }, sessionId)
  await sleep(600)
  await shot(cdp, sessionId, '06-panel-light', await evaluate(cdp, sessionId, boxOf('.dshoq-panel', 4)))
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] }, sessionId)

  // ── 5. prefers-reduced-motion：动效应为 none ──
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: 'dark' }, { name: 'prefers-reduced-motion', value: 'reduce' }],
  }, sessionId)
  await sleep(300)
  const rm = await evaluate(cdp, sessionId, `(() => { const p = document.querySelector('.dshoq-panel'); return p ? { animation: getComputedStyle(p).animationName, fillTransition: getComputedStyle(document.querySelector('.dshoq-fill')).transitionDuration, dotAnim: getComputedStyle(document.querySelector('.dshoq-dot')).animationName } : null })()`)
  console.log('reduced-motion 探针:', JSON.stringify(rm))
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }, { name: 'prefers-reduced-motion', value: 'no-preference' }] }, sessionId)

  // ── 6. 关掉面板：退场后应完全卸载 ──
  console.log('再点 pill 收起…')
  await evaluate(cdp, sessionId, `(() => { const p = document.querySelector('.dshoq-pill'); p.click(); return true })()`)
  await sleep(600)
  const closed = await evaluate(cdp, sessionId, `(() => ({ panel: Boolean(document.querySelector('.dshoq-panel')), pill: document.querySelector('.dshoq-pill')?.getAttribute('aria-expanded'), ls: (() => { try { return { open: localStorage.getItem('dshoq-panel-open'), billing: localStorage.getItem('dshoq-billing-on') } } catch (e) { return null } })() }))()`)
  console.log('收起后:', JSON.stringify(closed))
  await shot(cdp, sessionId, '07-collapsed', await evaluate(cdp, sessionId, boxOf('.dshoq-pill', 6)))

  ws.close()
  child.kill()
  console.log('done')
}

main().catch((e) => {
  console.error('FAIL:', e.message)
  process.exitCode = 1
})
