/**
 * dsh-opencode-quota（宿主侧）v0.2.0
 *
 * OpenCode GO 套餐额度查询：
 * - GET /dsh-opencode-quota/api/status → { ok, usage: {rolling, weekly, monthly}, limits, fetchedAt }
 *   每档：{ percent, status, resetsAt, resetsIn }（resetsIn 为相对重置时间的
 *   简体中文表示，如 "4 小时 4 分钟"）。展示的是用量百分比，不换算金额。
 * - GET /dsh-opencode-quota/api/models → 近 7 天各模型用量（token）柱状图数据：
 *   opencode 不提供按模型分解的额度，改从本机会话日志（~/.dsh/sessions）聚合
 *   每条 LLM 请求的 model + usage，返回 [{ model, provider, inputTokens,
 *   outputTokens, cacheReadTokens, totalTokens, count, share }]（share 为
 *   totalTokens 占比，0~1）。
 *
 * 安全：仅接受带自定义头 X-DSH-Opencode-Quota: 1 的请求（CSRF 防护）。
 * key 从 ~/.dsh/.credentials.yaml（或环境变量 OPENCODE_GO_API_KEY）读取，
 * 只在服务器侧使用，绝不随响应下发。
 *
 * 额度换算（用户确认的官方数据）：rolling $12 / 5h、weekly $30、monthly $60。
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'
import z from '@deepseek-ai/schemastery'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'

export const inject = ['webServer', 'settings']

/** 设置命名空间：显示在「设置 → 插件」面板（需重启后生效）。 */
export const OPENCODE_QUOTA_SETTINGS_NAMESPACE = settingsNamespace('opencode-quota')

/** 设置面板 schema：workspace id + 控制台 cookie（secret 类型，UI 显示为密码框）。 */
export const Config = z.object({
  workspaceId: z.string().description(
    '你的 opencode.ai 工作区 ID（用量页 URL 里的 wrk_... 段）。' +
    '官方账单接口靠它定位查哪个工作区的用量：一个账号下可能有多个工作区（不同项目/组织），账单是分开统计的。' +
    '额度功能走 API key，不依赖它；只填 cookie 也行。'
  ),
  consoleCookie: z.string().role('secret').description('登录 opencode.ai 后复制的 auth=... 完整 cookie（httpOnly，JS 读不到：F12 → Network → 刷新 → 请求头 cookie: 行复制，或 Application → Cookies）'),
})

/** 设置值（可能为空对象）。 */
let settingsValue = {}

/** 从设置面板读取（优先），其次环境变量 / 凭证文件。 */
function readWorkspaceId() {
  if (settingsValue.workspaceId) return settingsValue.workspaceId
  if (process.env.OPENCODE_WORKSPACE_ID) return process.env.OPENCODE_WORKSPACE_ID
  try {
    const file = join(homedir(), '.dsh', '.credentials.yaml')
    const txt = readFileSync(file, 'utf8')
    const m = /(?:^|\n)\s*OPENCODE_WORKSPACE_ID\s*[:=]\s*["']?([^"'\s]+)/.exec(txt)
    if (m) return m[1].trim()
  } catch (e) { /* 忽略 */ }
  return null
}

/** 从设置面板读取（优先），其次环境变量 / 凭证文件。 */
function readConsoleCookie() {
  if (settingsValue.consoleCookie) return settingsValue.consoleCookie
  if (process.env.OPENCODE_CONSOLE_COOKIE) return process.env.OPENCODE_CONSOLE_COOKIE
  try {
    const file = join(homedir(), '.dsh', '.credentials.yaml')
    const txt = readFileSync(file, 'utf8')
    const m = /(?:^|\n)\s*OPENCODE_CONSOLE_COOKIE\s*[:=]\s*["']?([^"'\n]+)/.exec(txt)
    if (m) return m[1].trim()
  } catch (e) { /* 忽略 */ }
  return null
}

const API = '/dsh-opencode-quota/api'
const GUARD_HEADER = 'x-dsh-opencode-quota'
const USAGE_URL = 'https://opencode.ai/zen/go/v1/usage'
/** 官方套餐额度（美元等值） */
const LIMITS = { rolling: 12, weekly: 30, monthly: 60 }
/** 缓存 30 秒，避免轮询把额度 API 打太狠 */
const CACHE_MS = 30000

let cache = { at: 0, payload: null }

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(body)
}

function guard(req) {
  return req.headers[GUARD_HEADER] === '1'
}

/** 读取请求体（限制大小，失败返回 null）。 */
function readBody(req, cap = 16384) {
  return new Promise((resolve) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > cap) { req.destroy(); resolve(null); return }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', () => resolve(null))
  })
}

/** 从凭证文件或环境变量读取 opencode-go key（不打印值）。
 * 回退顺序：环境变量 → ~/.dsh/.credentials.yaml →
 * ~/.local/share/opencode/auth.json（opencode CLI 登录自动生成，零配置）。 */
function readApiKey() {
  if (process.env.OPENCODE_GO_API_KEY) return process.env.OPENCODE_GO_API_KEY
  try {
    const file = join(homedir(), '.dsh', '.credentials.yaml')
    const txt = readFileSync(file, 'utf8')
    const m = /(?:^|\n)\s*OPENCODE_GO_API_KEY\s*[:=]\s*["']?([^"'\s]+)/.exec(txt)
    if (m) return m[1]
  } catch (e) { /* 文件不存在则走下一步 */ }
  try {
    const file = join(homedir(), '.local', 'share', 'opencode', 'auth.json')
    const auth = JSON.parse(readFileSync(file, 'utf8'))
    const entry = auth && auth['opencode-go']
    if (entry && entry.key) return entry.key
  } catch (e) { /* 无 auth.json 则返回 null */ }
  return null
}

/** 凭证文件路径。 */
function credentialsFile() {
  return join(process.env.DSH_HOME || join(homedir(), '.dsh'), '.credentials.yaml')
}

/** 把 workspace id / cookie 写入凭证文件（保留其它键；空值不覆盖已有）。 */
function saveCredentials(workspaceId, consoleCookie) {
  const file = credentialsFile()
  let txt = ''
  try { txt = readFileSync(file, 'utf8') } catch (e) { /* 新文件 */ }
  const lines = txt.split(/\r?\n/)
  const set = (key, value) => {
    if (!value) return
    const re = new RegExp('^\\s*' + key + '\\s*[:=].*$')
    const line = key + ": '" + String(value).replace(/'/g, "''") + "'"
    const idx = lines.findIndex((l) => re.test(l))
    if (idx >= 0) lines[idx] = line
    else lines.push(line)
  }
  set('OPENCODE_WORKSPACE_ID', workspaceId)
  set('OPENCODE_CONSOLE_COOKIE', consoleCookie)
  // 同步内存（设置面板优先读取）
  if (workspaceId) settingsValue.workspaceId = workspaceId
  if (consoleCookie) settingsValue.consoleCookie = consoleCookie
  try {
    writeFileSync(file, lines.join('\n') + '\n', 'utf8')
    return true
  } catch (e) {
    return false
  }
}

/** 把 cookie 值掩码成 "前10…后6" 用于展示（不回传明文）。 */
function maskSecret(ck) {
  if (!ck) return ''
  return ck.slice(0, 10) + '…' + ck.slice(-6)
}

// ============ Chrome CDP 自动抓取 auth cookie ============
const CHROME_DEBUG_PORT = 9333
const CDP_BASE = 'http://127.0.0.1:' + CHROME_DEBUG_PORT
function chromeExe() {
  if (process.platform !== 'win32') return null
  const pf = process.env['ProgramFiles'] || 'C:\\Program Files'
  for (const cand of [
    join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join(process.env.LOCALAPPDATA || pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ]) {
    try { if (existsSync(cand)) return cand } catch (e) { /* continue */ }
  }
  return null
}
/** 结束我们 spawn 出的 Chrome 进程树（Windows taskkill /T /F；其余平台用 kill）。 */
function killTree(pid) {
  if (!pid) return
  try {
    if (process.platform === 'win32') {
      const tk = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
      tk.on('error', () => {})
    } else {
      try { process.kill(pid, 'SIGKILL') } catch (e) {}
    }
  } catch (e) { /* best effort */ }
}
async function cdpJson(endpoint) {
  const r = await fetch(endpoint, { signal: AbortSignal.timeout(3000) })
  return r.json()
}
/** 发一条 CDP 命令，取回响应（Node 22+ 原生 WebSocket）。 */
function cdpCall(wsUrl, method, params, timeout = 10000) {
  return new Promise((resolve) => {
    let ws
    try { ws = new WebSocket(wsUrl) } catch (e) { return resolve(null) }
    const timer = setTimeout(() => { try { ws.close() } catch (e) {} resolve(null) }, timeout)
    ws.addEventListener('open', () => { try { ws.send(JSON.stringify({ id: 1, method, params: params || {} })) } catch (e) {} })
    ws.addEventListener('message', (ev) => {
      let m
      try { m = JSON.parse(ev.data) } catch (e) { return }
      if (m && m.id === 1) { clearTimeout(timer); try { ws.close() } catch (e) {} resolve(m) }
    })
    ws.addEventListener('error', () => { clearTimeout(timer); try { ws.close() } catch (e) {} resolve(null) })
  })
}
/** 打开 opencode 用量页并返回其 page 的 WebSocket 调试地址。 */
async function cdpOpenUsage(wsUrl) {
  if (!wsUrl) {
    const list = await cdpJson(CDP_BASE + '/json').catch(() => [])
    let page = Array.isArray(list) ? list.find((t) => t.type === 'page') : null
    if (!page) {
      const created = await cdpJson(CDP_BASE + '/json/new?' + encodeURIComponent('about:blank')).catch(() => null)
      page = created || null
    }
    wsUrl = page && page.webSocketDebuggerUrl
  }
  if (!wsUrl) throw new Error('无法获取调试页面地址')
  const wsid = readWorkspaceId() || ''
  const usageUrl = wsid ? ('https://opencode.ai/workspace/' + wsid + '/go') : 'https://opencode.ai/workspace/'
  await cdpCall(wsUrl, 'Page.navigate', { url: usageUrl }, 6000)
  return wsUrl
}

/** 用真实配置拉起一个带调试端口的 Chrome（可见窗口）。
 * 已有可用调试端口则返回 true（复用，不杀，不清理）；启动且端口就绪返回 { pid, hadPs }（用于最后清理）；
 * 失败返回 'dead'；无 Chrome 返回 null。
 * 注意：Node spawn 直接启 Chrome 会因 `User Data` 路径里的空格把它拆成 URL，导致开发者端口起不来；
 * 这里改用 PowerShell 的 Start-Process 启动（实测能正确处理空格路径），并直接导航到 opencode 用量页。
 * 配置路径用 homedir() 推导（宿主的 $env:LOCALAPPDATA 可能为空导致开了空配置、看不到登录态）。 */
async function launchChrome() {
  const exe = chromeExe()
  if (!exe) return null
  try { if (Array.isArray(await cdpJson(CDP_BASE + '/json'))) return true } catch (e) { /* 无端口，继续启动 */ }
  const profile = process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data')
    : join(homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data')
  const wsid = readWorkspaceId() || ''
  const usageUrl = wsid ? ('https://opencode.ai/workspace/' + wsid + '/go') : 'https://opencode.ai/workspace/'
  const pidFile = join(tmpdir(), 'dsh-opencode-quota-chrome.pid')
  const ps1 = join(tmpdir(), 'dsh-opencode-quota-launch.ps1')
  try { writeFileSync(pidFile, '', 'utf8') } catch (e) { /* ignore */ }
  const ps1Content =
    "param([int]$Port, [string]$Url, [string]$Profile)\n" +
    "$chrome = '" + exe + '\'\n' +
    "$a = @(\n" +
    "  ('--remote-debugging-port=' + $Port),\n" +
    "  ('--user-data-dir=' + $Profile),\n" +
    "  '--no-first-run', '--no-default-browser-check', $Url\n" +
    ")\n" +
    "$p = Start-Process -FilePath $chrome -ArgumentList $a -PassThru\n" +
    "try { [string]$p.Id | Out-File -FilePath '" + pidFile + "' -Encoding ascii } catch { }\n"
  try { writeFileSync(ps1, ps1Content, 'utf8') } catch (e) { return null }

  const sysRoot = process.env.SystemRoot || process.env.windir || 'C:\\Windows'
  const shell = sysRoot + '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
  let child
  try {
    child = spawn(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, '-Port', String(CHROME_DEBUG_PORT), '-Url', usageUrl, '-Profile', profile], { stdio: 'ignore', windowsHide: true })
  } catch (e) { return null }

  let pid = 0
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 700))
    try {
      if (Array.isArray(await cdpJson(CDP_BASE + '/json'))) {
        try { pid = Number(readFileSync(pidFile, 'utf8').trim()) || 0 } catch (e) { pid = 0 }
        return { pid: pid || (child && child.pid) || 0, hadPs: !!pid }
      }
    } catch (e) { /* retry */ }
  }
  try { pid = Number(readFileSync(pidFile, 'utf8').trim()) || 0 } catch (e) { pid = 0 }
  if (pid) killTree(pid)
  try { child && child.kill() } catch (e) {}
  return 'dead'
}

/** 读 opencode.ai 的 auth cookie（需 Chrome 已带调试端口）。无则返回 null。 */
async function readAuthCookie() {
  const wsUrl = await cdpOpenUsage(null)
  await new Promise((r) => setTimeout(r, 2500))
  await cdpCall(wsUrl, 'Network.enable')
  const res = await cdpCall(wsUrl, 'Network.getAllCookies')
  const cookies = res && res.result && Array.isArray(res.result.cookies) ? res.result.cookies : []
  const hit = cookies.find((c) => c && c.name === 'auth' && String(c.domain).toLowerCase().indexOf('opencode.ai') !== -1)
  if (hit && hit.value) return 'auth=' + hit.value
  return null
}

/** 从可见 Chrome 读取 opencode.ai 的 auth cookie 并写入凭证。 */
async function grabCookieFromChrome() {
  const launched = await launchChrome()
  if (launched === 'dead') {
    return { ok: false, error: '无法启动带调试端口的 Chrome。Chrome 可能仍在运行：请完全关闭 Chrome（托盘退出）后再点"自动抓取 Cookie"。' }
  }
  let auth
  try { auth = await readAuthCookie() } catch (e) { auth = null }
  if (auth) { if (typeof launched === 'object') killTree(launched.pid); return saveGrabResult(auth) }
  // 保留可见 Chrome 给用户登录
  return { ok: false, error: '未检测到 auth cookie。请在刚打开的 Chrome 里登录 opencode.ai（Continue with GitHub），然后再点一次"自动抓取 Cookie"。', keepOpen: true }
}

function saveGrabResult(auth) {
  const wsid = readWorkspaceId() || ''
  const saved = saveCredentials(wsid || undefined, auth)
  return { ok: true, saved, hasCookie: true, cookieMasked: maskSecret(auth), message: '已抓取并保存 auth cookie（立即生效），已自动刷新。' }
}

/** 从官方 workspace usage 页面（SSR HTML 注入的 usage.list）解析最近 50 条
 * 官方用量记录。返回 [{ model, provider, inputTokens, outputTokens,
 * cacheReadTokens, costUsd, timeCreated }]，cost 单位为 1e-8 美元。
 * 抓取失败返回 null。 */
async function fetchOfficialUsage(wsId) {
  const cookie = readConsoleCookie()
  if (!cookie || !wsId) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)
  try {
    const r = await fetch('https://opencode.ai/workspace/' + wsId + '/usage', {
      headers: { cookie, accept: 'text/html', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' },
      signal: controller.signal,
    })
    if (r.status !== 200) return null
    const html = await r.text()
    if (html.indexOf('OpenAuth') !== -1 && html.indexOf('Continue with GitHub') !== -1) return null // 未登录
    // 解析 SSR 注入的 usage.list 记录块
    const recRe = /\{id:"usg_[\s\S]*?plan:"lite"\}\}/g
    const recs = html.match(recRe) || []
    const rows = []
    for (const raw of recs) {
      try {
        let s = raw
          .replace(/timeCreated:\$R\[\d+\]=new Date\("([^"]+)"\)/g, 'timeCreated:"$1"')
          .replace(/timeUpdated:\$R\[\d+\]=new Date\("([^"]+)"\)/g, 'timeUpdated:"$1"')
          .replace(/enrichment:\$R\[\d+\]=\{plan:"lite"\}/g, 'enrichment:{}')
          .replace(/\$R\[\d+\]=/g, 'null')
          .replace(/([{,]\s*)(id|workspaceID|timeCreated|timeUpdated|timeDeleted|model|provider|inputTokens|outputTokens|reasoningTokens|cacheReadTokens|cacheWrite5mTokens|cacheWrite1hTokens|cost|keyID|sessionID|enrichment)\s*:/g, '$1"$2":')
        const j = JSON.parse(s)
        rows.push({
          model: j.model || 'unknown',
          provider: j.provider || 'unknown',
          inputTokens: Number(j.inputTokens || 0),
          outputTokens: Number(j.outputTokens || 0),
          cacheReadTokens: Number(j.cacheReadTokens || 0),
          costUsd: Number(j.cost || 0) * 1e-8,
          timeCreated: j.timeCreated || null,
        })
      } catch (e) { /* 跳过坏块 */ }
    }
    return rows.length > 0 ? rows : null
  } catch (e) {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** 官方成本图表 RPC（getCosts，按月返回按日×模型成本）。
 * 请求体用服务端期望的 seroval 旧格式：数组节点带 l 字段、f:31。
 * 返回 [{ date, model, costUsd }]，失败返回 null。网络抖动自动重试 3 次。 */
async function fetchOfficialCosts(wsId, year, month, tzOffset) {
  const cookie = readConsoleCookie()
  if (!cookie || !wsId) return null
  const args = [
    { t: 1, s: wsId },
    { t: 0, s: year },
    { t: 0, s: month },
    { t: 1, s: tzOffset },
  ]
  const body = JSON.stringify({ t: { t: 9, i: 0, l: args.length, a: args, o: 0 }, f: 31, m: [] })
  const URL = 'https://opencode.ai/_server?id=15702f3a12ff8bff357f8c2aa154a17e65b746d5f6b96adc9002c86ee0c15205'
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  let lastErr = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20000)
    try {
      const r = await fetch(URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie,
          accept: '*/*',
          'x-server-id': '15702f3a12ff8bff357f8c2aa154a17e65b746d5f6b96adc9002c86ee0c15205',
          'x-server-instance': 'server-fn:' + attempt,
          referer: 'https://opencode.ai/workspace/' + wsId + '/usage',
        },
        body,
        signal: controller.signal,
      })
      if (r.status !== 200) { lastErr = 'HTTP ' + r.status; if (attempt < 3) { await sleep(1500); continue } return null }
      const t = await r.text()
      if (t.indexOf('OpenAuth') !== -1 && t.indexOf('Continue with GitHub') !== -1) return null
      // 302 到 /auth/authorize = cookie 过期
      if (t.indexOf('"location","/auth/authorize"') !== -1 || t.indexOf('location","/auth/authorize') !== -1) return null
      // seroval 流式响应中提取 {date, model, totalCost} 记录
      const re = /\{date:"([^"]+)",model:"([^"]+)",totalCost:(\d+)/g
      const rows = []
      let m
      while ((m = re.exec(t)) !== null) {
        rows.push({ date: m[1], model: m[2], costUsd: Number(m[3]) * 1e-8 })
      }
      return rows.length > 0 ? rows : null
    } catch (e) {
      lastErr = String((e && e.message) || e)
      if (attempt < 3) { await sleep(1500); continue }
      return null
    } finally {
      clearTimeout(timer)
    }
  }
  return null
}

/** 调用 opencode usage 端点；带 3 次重试（1.5s 退避）。
 * 成功返回 { data }；彻底失败返回 { error }（附具体原因）。 */
async function fetchUsage(key) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  let lastErr = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)
    try {
      const r = await fetch(USAGE_URL, {
        headers: { authorization: 'Bearer ' + key },
        signal: controller.signal,
      })
      if (r.status !== 200) {
        lastErr = 'HTTP ' + r.status
        if (attempt < 3) { await sleep(1500 * attempt); continue }
        return { error: describeUsageError(r.status) }
      }
      const data = await r.json()
      return { data }
    } catch (e) {
      lastErr = String((e && e.message) || e)
      if (attempt < 3) { await sleep(1500 * attempt); continue }
      return { error: '额度接口网络请求失败：' + lastErr }
    } finally {
      clearTimeout(timer)
    }
  }
  return { error: '额度接口重试 3 次仍失败' + (lastErr ? '（' + lastErr + '）' : '') }
}

/** 把 usage 接口的状态码转成面向用户的解释。 */
function describeUsageError(status) {
  if (status === 401 || status === 403) return 'OPENCODE_GO_API_KEY 无效或已过期，请更新凭证'
  if (status === 429) return '额度接口请求过于频繁被限流，稍后自动重试'
  if (status === 500 || status === 502 || status === 503) return 'opencode 服务端异常（HTTP ' + status + '）'
  return 'opencode usage 端点返回 HTTP ' + status
}

/** 归一化 usage 响应：percent + 折算美元 + 重置时间。 */
/** 相对重置时间的简体中文表示（如 "4 小时 4 分钟"、"1 天 19 小时"）。 */
function resetsIn(iso) {
  if (!iso) return '未知'
  const t = Date.parse(iso)
  if (!isFinite(t)) return '未知'
  const diff = Math.max(0, t - Date.now())
  const MIN = 60000, HOUR = 3600000, DAY = 86400000
  if (diff < MIN) return '即将重置'
  const days = Math.floor(diff / DAY)
  const hours = Math.floor((diff % DAY) / HOUR)
  const mins = Math.floor((diff % HOUR) / MIN)
  if (days > 0) return days + ' 天 ' + hours + ' 小时'
  if (hours > 0) return hours + ' 小时 ' + mins + ' 分钟'
  return mins + ' 分钟'
}

function normalize(raw) {
  if (!raw || typeof raw !== 'object' || !raw.usage) return null
  const out = {}
  for (const k of Object.keys(LIMITS)) {
    const v = raw.usage[k]
    if (!v || typeof v !== 'object') { out[k] = null; continue }
    const percent = Number(v.percent ?? 0)
    out[k] = {
      percent,
      // 官方美元用量 = 官方 percent × 档位上限（percent 为整数，存在 ±1% 舍入误差）
      spentUsd: (LIMITS[k] * percent) / 100,
      limitUsd: LIMITS[k],
      status: v.status ?? 'unknown',
      resetsAt: v.resetsAt ?? null,
      resetsIn: resetsIn(v.resetsAt),
    }
  }
  return out
}

/** 近 7 天窗口（毫秒）。 */
const MODELS_WINDOW_MS = 7 * 86400000
/** 模型用量缓存（60 秒）。 */
const MODELS_CACHE_MS = 60000
/** 官方用量页缓存（5 分钟）。 */
const OFFICIAL_CACHE_MS = 300000

let modelsCache = { at: 0, sessionId: null, payload: null }
let officialCache = { at: 0, key: null, payload: null }

/** 多帧 zstd 解压：会话日志每次写入追加一个 zstd frame（魔数 28 B5 2F FD），
 * 按魔数切分逐帧解压后拼接；非压缩内容原样返回。失败返回 null。 */
function decompressLog(buf) {
  const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
  const starts = []
  for (let i = 0; i <= buf.length - 4; i++) {
    if (buf[i] === magic[0] && buf[i + 1] === magic[1] && buf[i + 2] === magic[2] && buf[i + 3] === magic[3]) starts.push(i)
  }
  if (starts.length === 0) {
    try { return zstdDecompressSync(buf).toString('utf8') } catch (e) { return null }
  }
  let out = ''
  for (let i = 0; i < starts.length; i++) {
    const s = starts[i]
    const e = i + 1 < starts.length ? starts[i + 1] : buf.length
    try { out += zstdDecompressSync(buf.subarray(s, e)).toString('utf8') } catch (err) { /* 跳过坏帧 */ }
  }
  return out
}

/** 解析单个会话日志文件，把每条 LLM 请求的 model + usage 累加进 acc。
 * 返回该文件第一条记录的时间（毫秒），无记录返回 null。 */
function collectSessionLog(file, since, acc) {
  let text
  try {
    const st = statSync(file)
    if (st.size > 50 * 1024 * 1024) return null // 超大日志跳过
    if (st.mtimeMs < since) return null // 文件比窗口旧，里面不会有新记录
    const buf = readFileSync(file)
    text = file.endsWith('.zstd') ? decompressLog(buf) : buf.toString('utf8')
  } catch (e) { return null }
  if (text === null || text === '') return null
  // 首条记录时间：用文件第一行的 time（会话起点）
  let firstTime = null
  const lines = text.split('\n')
  for (let i = 0; i < lines.length && firstTime === null; i++) {
    if (lines[i].indexOf('"time"') === -1) continue
    try {
      const t = JSON.parse(lines[i]).time
      if (typeof t === 'number') firstTime = t
    } catch (e) { /* 跳过坏行 */ }
  }
  for (const line of lines) {
    // 快速预筛：只处理带 usage 的 assistant/message 行
    if (line.indexOf('"assistant/message"') === -1 || line.indexOf('"usage"') === -1) continue
    let j
    try { j = JSON.parse(line) } catch (e) { continue }
    const d = j && j.data
    // usage 兼容两种格式：新格式在 data.usage，老格式在顶层 usage
    const u = (j && j.usage) || (d && d.usage)
    if (!u) continue
    if (typeof j.time === 'number' && j.time < since) continue
    const src = d && d.message && d.message.source
    if (!src || src.kind !== 'model') continue
    const model = src.model || 'unknown'
    const provider = src.provider || 'unknown'
    const key = provider + '|' + model
    let b = acc.get(key)
    if (!b) {
      b = { model, provider, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, count: 0 }
      acc.set(key, b)
    }
    b.inputTokens += Number(u.inputTokens || 0)
    b.outputTokens += Number(u.outputTokens || 0)
    b.cacheReadTokens += Number(u.cacheReadTokens || 0)
    b.count += 1
  }
  return firstTime
}

/** 递归遍历会话根目录下的 session.jsonl / session.jsonl.zstd。
 * 给定 sessionId 时只收集该会话目录（sessions 根下任意 cwd 子目录中的
 * 同名目录）。inside 标记是否已进入目标会话目录。 */
function walkSessionLogs(root, since, acc, sessionId, inside) {
  let entries
  try { entries = readdirSync(root, { withFileTypes: true }) } catch (e) { return null }
  let firstTime = null
  for (const e of entries) {
    if (e.name === '.' || e.name === '..') continue
    const p = join(root, e.name)
    if (e.isDirectory()) {
      const isTarget = sessionId ? e.name === sessionId : false
      const ft = walkSessionLogs(p, since, acc, sessionId, inside || isTarget)
      if (ft !== null && (firstTime === null || ft < firstTime)) firstTime = ft
    } else if (e.isFile() && /^session\.jsonl(\.zstd)?$/.test(e.name)) {
      if (sessionId && !inside) continue
      const ft = collectSessionLog(p, since, acc)
      if (ft !== null && (firstTime === null || ft < firstTime)) firstTime = ft
    }
  }
  return firstTime
}

/** 读 ~/.modlens/usage.jsonl（modlens 包装器写入的识图用量），
 * 返回 time >= since 的记录数组。 */
function readModlensUsage(since) {
  const file = join(homedir(), '.modlens', 'usage.jsonl')
  let text
  try { text = readFileSync(file, 'utf8') } catch (e) { return [] }
  const out = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    let j
    try { j = JSON.parse(line) } catch (e) { continue }
    if (!j || typeof j.time !== 'number') continue
    if (j.time < since) continue
    out.push(j)
  }
  return out
}

/** 官方单价表（USD / 1M tokens，来源：pi-ai opencode-go 模型目录）。 */
const PRICES = {
  'deepseek-v4-flash': { in: 0.14, out: 0.28, cache: 0.0028 },
  'deepseek-v4-pro': { in: 0.435, out: 0.87, cache: 0.003625 },
  'mimo-v2.5': { in: 0.14, out: 0.28, cache: 0.0028 },
  'mimo-v2.5-pro': { in: 0.435, out: 0.87, cache: 0.003625 },
  'qwen3.7-max': { in: 2.5, out: 7.5, cache: 0.5 },
  'qwen3.7-plus': { in: 0.4, out: 1.6, cache: 0.04 },
  'qwen3.6-plus': { in: 0.5, out: 3, cache: 0.05 },
  'minimax-m3': { in: 0.3, out: 1.2, cache: 0.06 },
  'minimax-m2.7': { in: 0.3, out: 1.2, cache: 0.06 },
  'kimi-k2.6': { in: 0.95, out: 4, cache: 0.16 },
  'kimi-k2.7-code': { in: 0.95, out: 4, cache: 0.19 },
  'kimi-k3': { in: 3, out: 15, cache: 0.3 },
  'glm-5.1': { in: 1.4, out: 4.4, cache: 0.26 },
  'glm-5.2': { in: 1.4, out: 4.4, cache: 0.26 },
  'hy3': { in: 0.14, out: 0.58, cache: 0.035 },
  'grok-4.5': { in: 2, out: 6, cache: 0.5 },
}
/** 未知模型回退单价（按 deepseek-v4-flash）。 */
const FALLBACK_PRICE = { in: 0.14, out: 0.28, cache: 0.0028 }

/** 按官方单价估算某模型的成本（USD）。 */
function costOf(model, inputTokens, outputTokens, cacheReadTokens) {
  const p = PRICES[model] || FALLBACK_PRICE
  return (inputTokens * p.in + outputTokens * p.out + cacheReadTokens * p.cache) / 1e6
}

/** 聚合模型用量与成本。
 * @param sessionId 可选：只统计该会话（sessions 根下的同名子目录），
 *   并把该会话开始时间之后发生的 modlens 识图用量（mimo-v2.5）计入。
 *   不传则统计近 7 天全部会话 + 7 天内的 modlens 识图。
 */
function aggregateModels(sessionId) {
  const root = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'sessions')
  const acc = new Map()
  let since = Date.now() - MODELS_WINDOW_MS
  let sessionStart = null
  if (sessionId) {
    // 单会话：先聚合日志拿首条记录时间作为会话起点；
    // 找不到日志（新会话还没写入）时起点 = 现在，避免旧识图记录混入。
    sessionStart = walkSessionLogs(root, 0, acc, sessionId)
    since = sessionStart !== null ? sessionStart : Date.now()
  } else {
    walkSessionLogs(root, since, acc, null)
  }
  // modlens 识图用量（MiMo 2.5）：会话开始之后（或近 7 天）的记录
  const modlensRecords = readModlensUsage(since)
  for (const r of modlensRecords) {
    const model = r.model || 'mimo-v2.5'
    const provider = r.provider || 'opencode-go'
    const key = provider + '|' + model
    let b = acc.get(key)
    if (!b) {
      b = { model, provider, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, count: 0 }
      acc.set(key, b)
    }
    b.inputTokens += Number(r.inputTokens || 0)
    b.outputTokens += Number(r.outputTokens || 0)
    b.cacheReadTokens += Number(r.cacheReadTokens || 0)
    b.count += 1
  }
  const rows = [...acc.values()].map((r) => {
    const totalTokens = r.inputTokens + r.outputTokens + r.cacheReadTokens
    return { ...r, totalTokens, costUsd: costOf(r.model, r.inputTokens, r.outputTokens, r.cacheReadTokens) }
  })
  const totalCost = rows.reduce((s, r) => s + r.costUsd, 0)
  rows.sort((a, b) => b.costUsd - a.costUsd)
  return {
    scope: sessionId ? 'session' : '7d',
    sessionId: sessionId || null,
    totalTokens: rows.reduce((s, r) => s + r.totalTokens, 0),
    totalCost,
    models: rows.map((r) => ({ ...r, share: totalCost > 0 ? r.costUsd / totalCost : 0 })),
  }
}

export function apply(ctx) {
  // 设置面板：显示在「设置 → 插件 → opencode-quota」（workspace id + cookie）
  try {
    const settings = ctx.settings.register(OPENCODE_QUOTA_SETTINGS_NAMESPACE, Config, {
      applies: 'live',
    })
    settingsValue = Object.assign({}, settings.get() || {})
    const watch = settings.watch((next) => {
      settingsValue = Object.assign({}, next || {})
    })
    ctx.on('dispose', () => watch())
  } catch (e) {
    console.warn('[opencode-quota] settings 注册失败：', e && e.message)
  }
  const webServer = ctx.webServer
  const disposer = webServer.register({
    kind: 'prefix',
    path: API,
    handler: async (req, res) => {
      if (!guard(req)) return sendJson(res, 403, { ok: false, error: 'forbidden' })
      let url
      try { url = new URL(req.url, 'http://127.0.0.1') } catch (e) { return sendJson(res, 400, { ok: false, error: 'bad url' }) }
      try {
        if (url.pathname === API + '/grab-cookie') {
          // POST：通过 Chrome CDP 自动抓取 auth cookie 并写入凭证文件（需用户显式点击触发）
          if (req.method === 'POST') {
            const r = await grabCookieFromChrome()
            return sendJson(res, 200, { ...r, fetchedAt: new Date().toISOString() })
          }
          return sendJson(res, 405, { ok: false, error: 'method not allowed' })
        }
        if (url.pathname === API + '/config') {
          // GET：返回配置状态（不回传 cookie 明文）
          if (req.method === 'GET' || req.method === undefined) {
            const ws = readWorkspaceId()
            const ck = readConsoleCookie()
            return sendJson(res, 200, {
              ok: true,
              workspaceId: ws || '',
              hasWorkspaceId: !!ws,
              hasCookie: !!ck,
              cookieMasked: ck ? ck.slice(0, 10) + '…' + ck.slice(-6) : '',
              source: settingsValue.workspaceId || settingsValue.consoleCookie ? 'settings' : 'credentials',
            })
          }
          // POST：保存 workspace id / cookie 到凭证文件
          if (req.method === 'POST') {
            const body = await readBody(req, 16384)
            let j = null
            try { j = JSON.parse(body) } catch (e) { /* 解析失败走下方校验 */ }
            const wsId = j && typeof j.workspaceId === 'string' ? j.workspaceId.trim() : ''
            const cookie = j && typeof j.consoleCookie === 'string' ? j.consoleCookie.trim() : ''
            if (wsId === '' && cookie === '') {
              return sendJson(res, 200, { ok: false, error: '请填写 workspaceId 或 consoleCookie 至少一项' })
            }
            const saved = saveCredentials(wsId || undefined, cookie || undefined)
            if (!saved) return sendJson(res, 200, { ok: false, error: '凭证文件写入失败（权限？）' })
            return sendJson(res, 200, { ok: true, message: '已保存（立即生效）' })
          }
          return sendJson(res, 405, { ok: false, error: 'method not allowed' })
        }
        if (url.pathname === API + '/status') {
          const now = Date.now()
          const force = url.searchParams.get('force') === '1'
          if (!force && cache.payload && now - cache.at < CACHE_MS) {
            return sendJson(res, 200, { ...cache.payload, cached: true })
          }
          const key = readApiKey()
          if (!key) return sendJson(res, 200, { ok: false, error: '未找到 OPENCODE_GO_API_KEY（凭证文件或环境变量）' })
          const got = await fetchUsage(key)
          if (got.error) return sendJson(res, 200, { ok: false, error: got.error, fetchedAt: new Date().toISOString() })
          const usage = normalize(got.data)
          if (!usage) return sendJson(res, 200, { ok: false, error: '额度接口返回的数据无法解析', fetchedAt: new Date().toISOString() })
          cache = { at: now, payload: { ok: true, usage, limits: LIMITS, fetchedAt: new Date().toISOString() } }
          return sendJson(res, 200, { ...cache.payload, cached: false })
        }
        if (url.pathname === API + '/models') {
          const sessionId = url.searchParams.get('session') || null
          const now = Date.now()
          if (modelsCache.payload && modelsCache.sessionId === sessionId && now - modelsCache.at < MODELS_CACHE_MS) {
            return sendJson(res, 200, { ...modelsCache.payload, cached: true })
          }
          const data = aggregateModels(sessionId)
          modelsCache = { at: now, sessionId, payload: { ok: true, ...data, fetchedAt: new Date().toISOString() } }
          return sendJson(res, 200, { ...modelsCache.payload, cached: false })
        }
        if (url.pathname === API + '/official') {
          const wsId = url.searchParams.get('workspace') || readWorkspaceId() || null
          const now = new Date()
          const force = url.searchParams.get('force') === '1'
          const cacheKey = wsId + '|' + now.getUTCFullYear() + '-' + now.getUTCMonth()
          if (!force && officialCache.payload && officialCache.key === cacheKey && now.getTime() - officialCache.at < OFFICIAL_CACHE_MS) {
            return sendJson(res, 200, { ...officialCache.payload, cached: true })
          }
          if (!wsId) return sendJson(res, 200, { ok: false, error: '未配置 OPENCODE_WORKSPACE_ID（凭证文件或环境变量）：打开 opencode.ai 用量页，地址栏里 wrk_... 就是' })
          // 官方成本图表 RPC：本月按日×模型（时区 +08:00，页面一致）
          // 注意：getCosts 返回 k 日期与重置都按 +08:00 聚合，因此年份/月份/今日取值都用北京时间，避免跨时区对不上账
          const bjy = new Date(now.getTime() + 8 * 3600 * 1000)
          const rows = await fetchOfficialCosts(wsId, bjy.getUTCFullYear(), bjy.getUTCMonth(), '+08:00')
          if (!rows) return sendJson(res, 200, { ok: false, error: readConsoleCookie() ? '官方成本获取失败：cookie 可能已过期，请重新从浏览器复制 OPENCODE_CONSOLE_COOKIE' : '未配置 OPENCODE_CONSOLE_COOKIE：登录 opencode.ai 用量页后从浏览器复制 cookie 写入凭证文件' })
          const byDate = new Map()
          const byModelAll = new Map()
          for (const r of rows) {
            let d = byDate.get(r.date)
            if (!d) { d = { date: r.date, totalCost: 0, models: new Map() }; byDate.set(r.date, d) }
            d.totalCost += r.costUsd
            const mk = d.models.get(r.model) || { model: r.model, costUsd: 0 }
            mk.costUsd += r.costUsd
            d.models.set(r.model, mk)
            const ma = byModelAll.get(r.model) || { model: r.model, costUsd: 0 }
            ma.costUsd += r.costUsd
            byModelAll.set(r.model, ma)
          }
          const dates = [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1)).map((d) => ({
            date: d.date,
            totalCost: d.totalCost,
            models: [...d.models.values()].sort((x, y) => y.costUsd - x.costUsd),
          }))
          // 今天（本地 +08:00）的成本
          const todayKey = bjy.toISOString().slice(0, 10)
          const today = byDate.get(todayKey) || null
          const monthTotal = [...byDate.values()].reduce((s, d) => s + d.totalCost, 0)
          const models = [...byModelAll.values()].sort((a, b) => b.costUsd - a.costUsd)
          officialCache = {
            at: now.getTime(),
            key: cacheKey,
            payload: {
              ok: true,
              scope: 'official-month',
              month: bjy.toISOString().slice(0, 7),
              monthTotal,
              todayCost: today ? today.totalCost : 0,
              todayModels: today ? [...today.models.values()].sort((a, b) => b.costUsd - a.costUsd) : [],
              dates,
              models,
              fetchedAt: now.toISOString(),
            },
          }
          return sendJson(res, 200, { ...officialCache.payload, cached: false })
        }
        return sendJson(res, 404, { ok: false, error: 'not found' })
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: String((e && e.message) || e) })
      }
    },
  })
  ctx.on('dispose', () => disposer())
}
