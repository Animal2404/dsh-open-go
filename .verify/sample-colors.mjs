/**
 * sample-colors.mjs — 取证用：把两张参考图放进无头 Chrome 用 canvas 取色（不依赖任何图像库）。
 *
 * 为什么这么做：相位 1 要求"图 2 原图"的准确色值（背景色/面板色/白色叠加），
 * 而 Node 侧没有任何 PNG 解码依赖；Chrome 天然能解码 → 用 canvas 采样最可靠。
 * 图片以 data: URL 注入（不碰 file:// 同源限制），采样结果打印为 JSON，另存放大裁切图供目检。
 *
 * 用法：node .verify/sample-colors.mjs
 */
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const OUT = join(process.cwd(), '.verify', 'shots')
const PORT = Number(process.env.CDP_PORT ?? 9336)
const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  join(process.env.LOCALAPPDATA ?? '', 'Google\\Chrome\\Application\\chrome.exe'),
].filter(Boolean)
const CHROME = CANDIDATES.find((p) => existsSync(p))

/** 本次要取色的图：图 2 = 用户指定的原图基准；fig1 = 用户给的当前 UI；before/after = 本次修正前后实拍 */
const SHOTS = join(process.cwd(), '.verify', 'shots')
const IMAGES = [
  { tag: 'fig2-baseline', file: 'C:\\Users\\axia\\.dsh\\attachments\\v1\\objects\\b0\\b0ef59816a096d6cdb095745b7c1cf43c04f863e56dede3eaa43616251fe2095' },
  { tag: 'fig1-current', file: 'C:\\Users\\axia\\.dsh\\attachments\\v1\\objects\\5b\\5bd54abeafc6d4fa7c690cc44f39b925685b764bee5491dace737d6018c7705e' },
  { tag: 'before-panel', file: join(SHOTS, 'color-before-panel.png') },
  { tag: 'after-panel', file: join(SHOTS, '02b-panel-only.png') },
]
/** 并排比对图的编排：[左边=基准, 中间=改前, 右边=改后] */
const COMPARE = [
  { tag: 'fig2-baseline', label: '图2 基准(原图)' },
  { tag: 'before-panel', label: '改前(白8%卡片)' },
  { tag: 'after-panel', label: '改后(无卡片/面=token)' },
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

class Cdp {
  constructor(ws) {
    this.ws = ws
    this.next = 1
    this.pending = new Map()
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
      }
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
}

async function evaluate(cdp, sessionId, expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId)
  if (r.exceptionDetails) throw new Error(`页面 JS 抛错：${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ''}`)
  return r.result?.value
}

/** 在页面里对一张图取样：直方图 + 网格图 + 命名点 + 放大裁切 PNG。 */
const SAMPLE = (dataUrl, tag) => `
(async () => {
  const img = new Image()
  img.src = ${JSON.stringify(dataUrl)}
  await img.decode()
  const w = img.naturalWidth, h = img.naturalHeight
  const cv = document.createElement('canvas')
  cv.width = w; cv.height = h
  const ctx = cv.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0)
  const px = (x, y) => { const d = ctx.getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2]] }
  const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('')
  const quant = (c) => c.map((v) => Math.round(v / 4) * 4).join(',')
  // 直方图（按 4 级量化）
  const hist = new Map()
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = ctx.getImageData(x, y, 1, 1).data
    const k = quant([d[0], d[1], d[2]])
    const e = hist.get(k) || { n: 0, r: 0, g: 0, b: 0 }
    e.n++; e.r += d[0]; e.g += d[1]; e.b += d[2]
    hist.set(k, e)
  }
  const top = [...hist.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 14).map(([k, e]) => ({
    hex: hex([Math.round(e.r / e.n), Math.round(e.g / e.n), Math.round(e.b / e.n)]),
    pct: +(100 * e.n / (w * h)).toFixed(2),
  }))
  // 网格图（每 25px 一个采样点，行优先）
  const step = 25
  const grid = []
  for (let y = 0; y < h; y += step) {
    const row = []
    for (let x = 0; x < w; x += step) row.push(hex(px(Math.min(x, w - 1), Math.min(y, h - 1))))
    grid.push({ y, row })
  }
  // 命名点（相对坐标）
  const named = {}
  for (const [name, rx, ry] of [['center', .5, .5], ['panelTop', .5, .12], ['panelRow2', .5, .45], ['panelBottomGap', .5, .78], ['bottomBar', .5, .95], ['leftEdgeMid', .02, .5], ['rightEdgeMid', .98, .5]]) {
    named[name] = hex(px(Math.round(rx * (w - 1)), Math.round(ry * (h - 1))))
  }
  // 放大裁切（最近的左上 1/2 区域 + 中间区域），供 read_image 目检
  const crop = (sx, sy, cw, ch, scale) => {
    const c2 = document.createElement('canvas')
    c2.width = cw * scale; c2.height = ch * scale
    const g = c2.getContext('2d')
    g.imageSmoothingEnabled = false
    g.drawImage(cv, sx, sy, cw, ch, 0, 0, cw * scale, ch * scale)
    return c2.toDataURL('image/png')
  }
  // 纵向逐像素扫描（找"更亮的内层卡片/白色叠加"的边界台阶）
  const cols = [4, 30, 200]
  const colScan = cols.map((x) => {
    const rows = []
    for (let y = 8; y < h - 4; y += 6) rows.push(String(y).padStart(3) + ':' + hex(px(Math.min(x, w - 1), y)))
    return { x, rows }
  })
  // 命中统计：面板主色 / 白叠加色（两者各占多少像素）
  const countOf = (target) => { let n = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = px(x, y); if (Math.abs(c[0] - target[0]) <= 1 && Math.abs(c[1] - target[1]) <= 1 && Math.abs(c[2] - target[2]) <= 1) n++ } return +(100 * n / (w * h)).toFixed(2) }
  const paletteHits = {
    bluish800_53_54_56: countOf([53, 54, 56]),
    bluish750_67_69_74: countOf([67, 69, 74]),
    bluish850_44_44_46: countOf([44, 44, 46]),
    bluish875_35_35_36: countOf([35, 35, 36]),
    bluish900_27_27_28: countOf([27, 27, 28]),
    bluish950_21_21_23: countOf([21, 21, 23]),
    white8_over800_69_70_72: countOf([69, 70, 72]),
  }
  return {
    tag: ${JSON.stringify(tag)},
    size: { w, h },
    top,
    named,
    grid,
    colScan,
    paletteHits,
    zoomCenter: crop(Math.round(w * 0.15), Math.round(h * 0.15), Math.round(w * 0.7), Math.round(h * 0.5), 3),
    zoomFull: crop(0, 0, w, h, 2),
  }
})()`

async function main() {
  if (!CHROME) throw new Error('找不到 Chrome：设 CHROME_PATH')
  mkdirSync(OUT, { recursive: true })
  const profile = join(tmpdir(), `oq-color-${Date.now()}`)
  const child = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--window-size=900,900', 'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] })
  const wsUrl = await new Promise((resolve, reject) => {
    let buf = ''
    const t = setTimeout(() => reject(new Error('chrome 未在 20s 内报出调试端口')), 20_000)
    const scan = (chunk) => {
      buf += chunk.toString()
      const m = /ws:\/\/[^\s]+/.exec(buf)
      if (m) { clearTimeout(t); resolve(m[0]) }
    }
    child.stderr.on('data', scan)
    child.stdout.on('data', scan)
    child.on('exit', (c) => reject(new Error(`chrome 提前退出 code=${c}`)))
  })
  const ws = new WebSocket(wsUrl)
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
  const cdp = new Cdp(ws)
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
  await cdp.send('Runtime.enable', {}, sessionId)
  await sleep(300)

  const report = {}
  for (const item of IMAGES) {
    const buf = readFileSync(item.file)
    const dataUrl = 'data:image/png;base64,' + buf.toString('base64')
    const r = await evaluate(cdp, sessionId, SAMPLE(dataUrl, item.tag))
    const { zoomCenter, zoomFull, ...rest } = r
    writeFileSync(join(OUT, `${item.tag}-zoom-center.png`), Buffer.from(zoomCenter.split(',')[1], 'base64'))
    writeFileSync(join(OUT, `${item.tag}-zoom-full.png`), Buffer.from(zoomFull.split(',')[1], 'base64'))
    report[item.tag] = rest
    console.log(`\n===== ${item.tag} (${rest.size.w}x${rest.size.h}) =====`)
    console.log('主色 top:', JSON.stringify(rest.top))
    console.log('命名点 :', JSON.stringify(rest.named))
    console.log('色阶命中率(%):', JSON.stringify(rest.paletteHits))
    for (const cs of rest.colScan) console.log(`纵向扫描 x=${cs.x}: ` + cs.rows.join(' '))
    for (const row of rest.grid) console.log(`  y=${String(row.y).padStart(3)} ` + row.row.join(' '))
  }
  writeFileSync(join(OUT, 'color-sample.json'), JSON.stringify(report, null, 2))

  // ── 并排比对图（基准 / 改前 / 改后），等比缩到同一高度 ──
  const compose = COMPARE.map((c) => ({ ...c, dataUrl: 'data:image/png;base64,' + readFileSync(IMAGES.find((i) => i.tag === c.tag).file).toString('base64') }))
  const composite = await evaluate(cdp, sessionId, `
(async () => {
  const items = ${JSON.stringify(compose)}
  const H = 420, GAP = 10, PAD = 12, LABEL = 22
  const imgs = []
  for (const it of items) { const im = new Image(); im.src = it.dataUrl; await im.decode(); imgs.push({ label: it.label, im }) }
  const widths = imgs.map(({ im }) => Math.round(im.naturalWidth * (H / im.naturalHeight)))
  const W = PAD * 2 + widths.reduce((a, b) => a + b, 0) + GAP * (imgs.length - 1)
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H + LABEL + PAD * 2
  const g = cv.getContext('2d')
  g.fillStyle = '#0b0b0c'; g.fillRect(0, 0, W, cv.height)
  g.font = '13px sans-serif'; g.textBaseline = 'middle'
  let x = PAD
  imgs.forEach(({ label, im }, i) => {
    g.fillStyle = '#e6edf7'; g.fillText(label, x, PAD + LABEL / 2)
    g.drawImage(im, x, PAD + LABEL, widths[i], H)
    x += widths[i] + GAP
  })
  return cv.toDataURL('image/png')
})()`)
  writeFileSync(join(OUT, 'color-compare.png'), Buffer.from(composite.split(',')[1], 'base64'))
  console.log('\n已写出 .verify/shots/color-sample.json + 放大裁切图 + color-compare.png（基准/改前/改后 并排）')
  ws.close()
  child.kill()
}

main().catch((e) => { console.error('FAIL:', e.message); process.exitCode = 1 })
