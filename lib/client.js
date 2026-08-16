window.__ModuleLoader__.load({ id: "@dsh-external/dsh-opencode-quota", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
/**
 * dsh-opencode-quota（浏览器端）v0.1.2
 *
 * 侧边栏「设置」按钮上方（sidebar.footer.action 插槽）的 OpenCode GO 套餐额度
 * 面板：滚动/每周/每月三档额度**常驻直显**（百分比 + 额度条 + 相对重置时间），
 * 无需悬停；点击「↻」立即刷新，每 5 分钟自动轮询。
 * 宽侧栏显示完整面板；窄侧栏（rail）退化为小图标按钮（悬停看摘要）。
 * 数据来自同源宿主路由 /dsh-opencode-quota/api/status（key 不下发）。
 */
const TAG = '[opencode-quota]'
let React = null
try { React = require('react') } catch (e) { React = null }
const hasReact = React !== null

const HOST_API = '/dsh-opencode-quota/api/status'
const HOST_API_OFFICIAL = '/dsh-opencode-quota/api/official'
const HOST_API_CONFIG = '/dsh-opencode-quota/api/config'
const HOST_API_GRAB = '/dsh-opencode-quota/api/grab-cookie'
const REFRESH_MS = 300000 // 5 分钟

// 模型显示名映射（完整名，柱状图标签用）
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
// 柱状图配色（与三档额度条同族）
const MODEL_COLORS = ['#4d6bfe', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#f97316']
const MODEL_COLOR_DARK = ['#7c93ff', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#22d3ee', '#fb923c']
// 美元金额
function fmtUsd(n) {
  return '$' + (Number(n) || 0).toFixed(2)
}
// 24 时制时间（HH:mm，本地时区）
function fmtTime(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return h + ':' + m
}

// 三档的展示元数据：中文名 + 条色（light-dark 双主题，带纯色回退）
const TIERS = [
  { key: 'rolling', label: '每5小时', color: '#4d6bfe', colorDark: '#7c93ff' },
  { key: 'weekly', label: '每周', color: '#10b981', colorDark: '#34d399' },
  { key: 'monthly', label: '每月', color: '#f59e0b', colorDark: '#fbbf24' },
]

// 刷新转圈动画（注入一次样式）
;(function injectSpinCss() {
  if (typeof document === 'undefined') return
  const tagId = '@dsh-external/dsh-opencode-quota/spin'
  if (document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') !== null) return
  const tag = document.createElement('style')
  tag.dataset.plugin = '@dsh-external/dsh-opencode-quota'
  tag.dataset.pluginCss = tagId
  tag.textContent = '@keyframes dshoq-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}.dshoq-spin{display:inline-block;animation:dshoq-spin .8s linear infinite;transform-origin:center}'
  document.head.appendChild(tag)
})()

function QuotaWidget(props) {
  const wide = props && props.wide !== false
  const [state, setState] = React.useState({ kind: 'loading' })
  const refresh = React.useCallback(function (force) {
    let alive = true
    setState(function (prev) { return prev.kind === 'ok' ? { ...prev, refreshing: true } : { kind: 'loading' } })
    const url = HOST_API + (force ? '?force=1' : '')
    window.fetch(url, { headers: { 'x-dsh-opencode-quota': '1' } })
      .then(function (r) { return r.json() })
      .then(function (j) {
        if (!alive) return
        if (j && j.ok) setState({ kind: 'ok', usage: j.usage, fetchedAt: j.fetchedAt, refreshing: false, warn: null })
        else {
          const m = j && j.error ? j.error : '未知错误'
          setState(function (prev) {
            // 已有上次成功数据 → 保留显示，仅标记"更新失败"提示；无数据才进错误态
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
  React.useEffect(function () {
    const cleanup = refresh()
    const timer = window.setInterval(refresh, REFRESH_MS)
    return function () {
      if (typeof cleanup === 'function') cleanup()
      window.clearInterval(timer)
    }
  }, [refresh])

  // 官方成本（opencode 控制台 getCosts：本月按日×模型）
  const [official, setOfficial] = React.useState(null)
  const refreshOfficial = React.useCallback(function (force) {
    let alive = true
    const url = HOST_API_OFFICIAL + (force ? '?force=1' : '')
    window.fetch(url, { headers: { 'x-dsh-opencode-quota': '1' } })
      .then(function (r) { return r.json() })
      .then(function (j) { if (alive) setOfficial(j && j.ok ? j : { error: (j && j.error) || '未知错误' }) })
      .catch(function () { if (alive) setOfficial({ error: '网络错误' }) })
    return function () { alive = false }
  }, [])
  React.useEffect(function () {
    const cleanup = refreshOfficial()
    const timer = window.setInterval(refreshOfficial, 300000)
    return function () {
      if (typeof cleanup === 'function') cleanup()
      window.clearInterval(timer)
    }
  }, [refreshOfficial])

  // 一键刷新全部（额度 + 官方账单，均跳过缓存）
  const refreshAll = React.useCallback(function () {
    refresh(true)
    refreshOfficial(true)
  }, [refresh, refreshOfficial])

  // 窄侧栏（rail）：只有一个小图标按钮
  if (!wide) {
    let label = 'OG'
    if (state.kind === 'ok' && state.usage && state.usage.monthly) label = 'OG ' + state.usage.monthly.percent + '%'
    return React.createElement('button', {
      type: 'button',
      title: state.kind === 'err' ? ('Open GO 额度获取失败：' + state.error + '，点击重试') : 'Open GO 套餐额度（点击刷新全部）',
      onClick: refreshAll,
      style: {
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: '36px', height: '36px', margin: '4px 0', padding: 0, borderRadius: '10px',
        border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.25))',
        background: 'var(--dsw-alias-button-elevated-fill, rgba(127,127,127,.08))',
        color: 'var(--dsw-alias-label-secondary, inherit)',
        fontSize: '12px', fontWeight: 600, fontVariantNumeric: 'tabular-nums', cursor: 'pointer',
        flex: '0 0 100%',
      },
    }, label)
  }

  // 配置弹窗状态
  const [cfgOpen, setCfgOpen] = React.useState(false)
  const [cfgData, setCfgData] = React.useState({ workspaceId: '', consoleCookie: '', hasCookie: false, cookieMasked: '', msg: '', err: '' })
  const openCfg = React.useCallback(function () {
    setCfgData({ workspaceId: '', consoleCookie: '', hasCookie: false, cookieMasked: '', msg: '', err: '' })
    window.fetch(HOST_API_CONFIG, { headers: { 'x-dsh-opencode-quota': '1' } })
      .then(function (r) { return r.json() })
      .then(function (j) {
        if (j && j.ok) {
          setCfgData({
            workspaceId: j.workspaceId || '',
            consoleCookie: '',
            hasCookie: j.hasCookie,
            cookieMasked: j.cookieMasked || '',
            msg: '',
            err: '',
          })
        }
      })
      .catch(function () { /* 忽略 */ })
    setCfgOpen(true)
  }, [])
  const saveCfg = React.useCallback(function () {
    const ws = cfgData.workspaceId.trim()
    const ck = cfgData.consoleCookie.trim()
    if (!ws && !ck) { setCfgData({ ...cfgData, err: '至少填写一项' }); return }
    window.fetch(HOST_API_CONFIG, {
      method: 'POST',
      headers: { 'x-dsh-opencode-quota': '1', 'content-type': 'application/json' },
      body: JSON.stringify({ workspaceId: ws, consoleCookie: ck }),
    })
      .then(function (r) { return r.json() })
      .then(function (j) {
        if (j && j.ok) {
          setCfgData({ ...cfgData, msg: '已保存，正在刷新…', err: '' })
          setCfgOpen(false)
          refreshAll()
        } else {
          setCfgData({ ...cfgData, err: (j && j.error) || '保存失败' })
        }
      })
      .catch(function () { setCfgData({ ...cfgData, err: '网络错误' }) })
  }, [cfgData, refreshAll])

  // 自动抓取 Cookie（Chrome CDP；需先关闭已运行的 Chrome）
  const [grabbing, setGrabbing] = React.useState(false)
  const grabCfg = React.useCallback(function () {
    if (grabbing) return
    setGrabbing(true)
    setCfgData({ ...cfgData, err: '', msg: '' })
    window.fetch(HOST_API_GRAB, {
      method: 'POST',
      headers: { 'x-dsh-opencode-quota': '1' },
    })
      .then(function (r) { return r.json() })
      .then(function (j) {
        if (j && j.ok) {
          setCfgData({ ...cfgData, err: '', msg: (j.message || '已抓取') + '，正在刷新…', hasCookie: true, cookieMasked: j.cookieMasked || '', consoleCookie: '' })
          refreshAll()
        } else {
          setCfgData({ ...cfgData, err: (j && j.error) || '抓取失败', msg: '' })
        }
      })
      .catch(function () { setCfgData({ ...cfgData, err: '网络错误', msg: '' }) })
      .finally(function () { setGrabbing(false) })
  }, [grabbing, cfgData, refreshAll])

  // 宽侧栏：三档常驻面板
  const ok = state.kind === 'ok' && state.usage
  const warn = ok && state.warn // 有数据但最近一次刷新失败时的提示
  const err = state.kind === 'err'
  const spinning = state.kind === 'loading' || state.refreshing === true
  const mainColor = 'var(--dsw-alias-label-primary, #e6edf7)'
  const mutedColor = 'var(--dsw-alias-label-secondary, #8fa3bf)'
  const trackColor = 'var(--dsw-alias-border-l2, rgba(127,127,127,.22))'
  const barBase = { height: '8px', borderRadius: '4px', overflow: 'hidden', background: trackColor, flex: '1 1 auto' }
  const fillBase = { height: '100%', borderRadius: '3px', transition: 'width .4s ease-out' }
  // 额度更新时间（24 时制）
  const updatedAt = fmtTime(state.fetchedAt)

  return React.createElement('div', {
    style: {
      display: 'flex', flexDirection: 'column', gap: '7px',
      width: '100%', boxSizing: 'border-box', padding: '6px 2px 4px',
      flex: '0 0 100%', // footerActions 是横向 flex，100% basis 让面板独占一行
    },
  }, [
    // 标题行：Open GO + 更新时间 + 刷新按钮
    React.createElement('div', {
      key: 'head',
      style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' },
    }, [
      React.createElement('div', {
        key: 'tl',
        style: { display: 'flex', alignItems: 'baseline', gap: '6px', minWidth: '0', flex: '1 1 auto' },
      }, [
        React.createElement('span', {
          key: 't',
          style: { fontSize: '13px', fontWeight: 600, color: mainColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
        }, err ? 'Open GO 获取失败' : 'Open GO'),
        updatedAt ? React.createElement('span', {
          key: 'u',
          style: { fontSize: '11px', color: mutedColor, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
        }, updatedAt + ' 更新') : null,
      ]),
      React.createElement('div', { key: 'acts', style: { display: 'flex', alignItems: 'center', gap: '2px', flex: 'none' } }, [
        React.createElement('button', {
          key: 'c',
          type: 'button',
          title: '配置 Open GO 账单（workspace id + cookie）',
          onClick: openCfg,
          style: {
            border: 'none', background: 'transparent', cursor: 'pointer',
            color: mutedColor, fontSize: '14px', lineHeight: 1, padding: '2px 4px', borderRadius: '6px',
          },
        }, '⚙'),
        React.createElement('button', {
          key: 'r',
          type: 'button',
          title: '刷新全部（额度 + 官方账单）',
          onClick: refreshAll,
          style: {
            border: 'none', background: 'transparent', cursor: 'pointer',
            color: mutedColor, fontSize: '14px', lineHeight: 1, padding: '2px 4px', borderRadius: '6px',
          },
        }, err ? '重试' : React.createElement('span', { className: spinning ? 'dshoq-spin' : '', style: { display: 'inline-block' } }, '↻')),
      ]),
    ]),
    // —— 额度区（分区标题 + 中性卡片，与账单区同一种"标题 + 卡片"语言）——
    React.createElement('div', {
      key: 'qhead',
      style: { display: 'flex', alignItems: 'center', marginTop: '6px', paddingTop: '5px', borderTop: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.18))' },
    }, [
      React.createElement('span', { key: 't', style: { fontSize: '13px', fontWeight: 600, color: mainColor } }, '额度'),
    ]),
    React.createElement('div', {
      key: 'quota-card',
      style: {
        display: 'flex', flexDirection: 'column', gap: '7px', marginTop: '3px',
        borderRadius: '8px', padding: '7px 8px',
        background: 'light-dark(rgba(127,127,127,.06), rgba(160,160,170,.08))',
        border: '1px solid light-dark(rgba(127,127,127,.18), rgba(160,160,170,.22))',
      },
    }, [
    // 三档额度行（百分比显示，官方 API 直出）
    TIERS.map(function (t) {
      const u = ok ? state.usage[t.key] : null
      const pct = u ? Math.round(u.percent) : 0
      const barColor = u ? 'light-dark(' + t.color + ',' + t.colorDark + ')' : mutedColor
      const row = React.createElement('div', {
        key: t.key,
        style: { display: 'flex', flexDirection: 'column', gap: '2px' },
      }, [
        React.createElement('div', {
          key: 'line',
          style: { display: 'flex', alignItems: 'center', gap: '8px' },
        }, [
          React.createElement('span', { key: 'l', style: { width: '50px', flex: 'none', fontSize: '12px', color: mutedColor } }, t.label),
          React.createElement('div', { key: 'bar', style: barBase }, [
            React.createElement('div', { key: 'fill', style: Object.assign({}, fillBase, { width: (ok ? pct : 0) + '%', background: barColor }) }),
          ]),
          React.createElement('span', {
            key: 'p',
            title: u ? ('已用 ' + pct + '%') : '',
            style: { width: '40px', flex: 'none', textAlign: 'right', fontSize: '12px', fontWeight: 600, color: mainColor, fontVariantNumeric: 'tabular-nums' },
          }, ok ? pct + '%' : '–'),
        ]),
        React.createElement('div', {
          key: 'reset',
          style: { paddingLeft: '58px', fontSize: '12px', color: mutedColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
        }, ok ? ('距重置 ' + (u.resetsIn || '未知')) : ''),
      ])
          return row
    }),
    ]),
    // 错误详情（仅错误时显示）
    err ? React.createElement('div', { key: 'err', style: { fontSize: '11px', color: mutedColor } }, state.error) : null,
    // 上次刷新失败但仍有旧数据：不清空显示，仅提示更新失败
    (!err && warn) ? React.createElement('div', { key: 'warn', style: { fontSize: '11px', color: 'var(--dsw-alias-state-warning-primary, #fbbf24)' } }, '额度更新失败（仍显示上次数据）：' + warn) : null,
    // —— 官方账单（opencode 控制台数据，今日 / 本月分块）——
    React.createElement('div', {
      key: 'ohead',
      style: { display: 'flex', alignItems: 'center', marginTop: '6px', paddingTop: '5px', borderTop: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.18))' },
    }, [
      React.createElement('span', { key: 't', style: { fontSize: '13px', fontWeight: 600, color: mainColor } }, '官方账单'),
    ]),
    official && official.error
      ? React.createElement('div', { key: 'oerr', style: { fontSize: '11px', color: mutedColor } }, '官方账单获取失败：' + official.error)
      : (official && (official.models || official.todayModels)
        ? React.createElement('div', { key: 'oblock', style: { display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '3px' } }, [
            // —— 今日块（蓝色调）——
            React.createElement('div', {
              key: 'today-block',
              style: {
                display: 'flex', flexDirection: 'column', gap: '3px',
                borderRadius: '8px', padding: '6px 8px',
                background: 'light-dark(rgba(77,107,254,.08), rgba(124,147,255,.10))',
                border: '1px solid light-dark(rgba(77,107,254,.25), rgba(124,147,255,.30))',
              },
            }, [
              React.createElement('div', {
                key: 'today-head',
                style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '6px' },
              }, [
                React.createElement('span', { key: 'l', style: { fontSize: '12px', fontWeight: 600, color: mainColor } }, '今日'),
                React.createElement('span', { key: 'v', style: { fontSize: '14px', fontWeight: 700, color: mainColor, fontVariantNumeric: 'tabular-nums' } }, fmtUsd(official.todayCost || 0)),
              ]),
              official.todayModels && official.todayModels.length > 0
                ? official.todayModels.map(function (m, i) {
                    const pct = official.todayCost > 0 ? Math.round((m.costUsd / official.todayCost) * 100) : 0
                    const color = '#4d6bfe'
                    const colorDark = '#7c93ff'
                    return React.createElement('div', {
                      key: m.model,
                      style: { display: 'flex', alignItems: 'center', gap: '6px' },
                    }, [
                      React.createElement('span', { key: 'l', style: { flex: '0 1 auto', maxWidth: '46%', fontSize: '11px', color: mutedColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: '0' }, title: m.model }, shortModel(m.model)),
                      React.createElement('div', { key: 'bar', style: barBase }, [
                        React.createElement('div', { key: 'fill', style: Object.assign({}, fillBase, { width: pct + '%', background: 'light-dark(' + color + ',' + colorDark + ')' }) }),
                      ]),
                      React.createElement('span', { key: 'p', style: { flex: 'none', width: '34px', textAlign: 'right', fontSize: '11px', color: mutedColor, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } }, pct + '%'),
                      React.createElement('span', { key: 'v', style: { flex: 'none', fontSize: '11px', fontWeight: 600, color: mainColor, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } }, fmtUsd(m.costUsd)),
                    ])
                  })
                : React.createElement('div', { key: 'empty', style: { fontSize: '11px', color: mutedColor } }, '今日暂无消耗'),
            ]),
            // —— 本月块（绿色调）——
            React.createElement('div', {
              key: 'month-block',
              style: {
                display: 'flex', flexDirection: 'column', gap: '3px',
                borderRadius: '8px', padding: '6px 8px',
                background: 'light-dark(rgba(16,185,129,.08), rgba(52,211,153,.10))',
                border: '1px solid light-dark(rgba(16,185,129,.25), rgba(52,211,153,.30))',
              },
            }, [
              React.createElement('div', {
                key: 'month-head',
                style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '6px' },
              }, [
                React.createElement('span', { key: 'l', style: { fontSize: '12px', fontWeight: 600, color: mainColor } }, '本月'),
                React.createElement('span', { key: 'v', style: { fontSize: '14px', fontWeight: 700, color: mainColor, fontVariantNumeric: 'tabular-nums' } }, fmtUsd(official.monthTotal || 0)),
              ]),
              official.models && official.models.length > 0
                ? official.models.slice(0, 4).map(function (m, i) {
                    const pct = official.monthTotal > 0 ? Math.round((m.costUsd / official.monthTotal) * 100) : 0
                    const color = '#10b981'
                    const colorDark = '#34d399'
                    return React.createElement('div', {
                      key: m.model,
                      style: { display: 'flex', alignItems: 'center', gap: '6px' },
                    }, [
                      React.createElement('span', { key: 'l', style: { flex: '0 1 auto', maxWidth: '46%', fontSize: '11px', color: mutedColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: '0' }, title: m.model }, shortModel(m.model)),
                      React.createElement('div', { key: 'bar', style: barBase }, [
                        React.createElement('div', { key: 'fill', style: Object.assign({}, fillBase, { width: pct + '%', background: 'light-dark(' + color + ',' + colorDark + ')' }) }),
                      ]),
                      React.createElement('span', { key: 'p', style: { flex: 'none', width: '34px', textAlign: 'right', fontSize: '11px', color: mutedColor, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } }, pct + '%'),
                      React.createElement('span', { key: 'v', style: { flex: 'none', fontSize: '11px', fontWeight: 600, color: mainColor, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } }, fmtUsd(m.costUsd)),
                    ])
                  })
                : React.createElement('div', { key: 'empty', style: { fontSize: '11px', color: mutedColor } }, '本月暂无消耗'),
            ]),
          ])
        : React.createElement('div', { key: 'ol', style: { fontSize: '11px', color: mutedColor } }, '官方账单加载中…')),
    // —— 配置弹窗（⚙）——
    cfgOpen ? React.createElement('div', {
      key: 'cfg-modal',
      style: {
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,.55)',
      },
      onClick: function () { setCfgOpen(false) },
    }, [
      React.createElement('div', {
        onClick: function (e) { e.stopPropagation() },
        style: {
          width: '340px', maxWidth: 'calc(100vw - 48px)',
          borderRadius: '12px', padding: '16px',
          background: 'var(--dsw-alias-bg-layer-1, #1e1e20)',
          border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3))',
          boxShadow: '0 8px 32px rgba(0,0,0,.4)',
          display: 'flex', flexDirection: 'column', gap: '10px',
          color: 'var(--dsw-alias-label-primary, #e6edf7)',
          fontFamily: 'inherit',
        },
      }, [
        React.createElement('div', { key: 't', style: { fontSize: '14px', fontWeight: 700 } }, 'Open GO 账单配置'),
        React.createElement('label', { key: 'l1', style: { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: mutedColor } }, [
          'Workspace ID（用量页 URL 的 wrk_... 段）',
          React.createElement('input', {
            value: cfgData.workspaceId,
            onChange: function (e) { setCfgData({ ...cfgData, workspaceId: e.target.value, err: '' }) },
            placeholder: 'wrk_01KZZVJ4HX6PR54FNAZJWXFWHX',
            style: {
              padding: '7px 9px', borderRadius: '8px', fontSize: '13px',
              border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3))',
              background: 'var(--dsw-alias-bg-layer-2, #26262a)',
              color: 'inherit', outline: 'none',
            },
          }),
          React.createElement('div', { key: 'wh', style: { fontSize: '11px', color: mutedColor, lineHeight: 1.5 } }, '它标识你在 opencode.ai 的哪个工作区：官方账单接口靠它定位查哪份用量（一个账号下可能有多个工作区，账单分开统计）。打开 https://opencode.ai/workspace/ 用量页，地址栏里 wrk_... 就是它。额度功能用 API key，不依赖此项。'),
        ]),
        React.createElement('label', { key: 'l2', style: { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: mutedColor } }, [
          '控制台 Cookie（auth=... 完整值）',
          React.createElement('input', {
            type: 'password',
            value: cfgData.consoleCookie,
            onChange: function (e) { setCfgData({ ...cfgData, consoleCookie: e.target.value, err: '' }) },
            placeholder: cfgData.hasCookie ? ('已配置：' + cfgData.cookieMasked + '（留空则不修改）') : 'auth=Fe26.2**...',
            style: {
              padding: '7px 9px', borderRadius: '8px', fontSize: '13px',
              border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3))',
              background: 'var(--dsw-alias-bg-layer-2, #26262a)',
              color: 'inherit', outline: 'none',
            },
          }),
        ]),
        cfgData.err ? React.createElement('div', { key: 'e', style: { fontSize: '12px', color: 'var(--dsw-alias-state-error-primary, #f87171)' } }, cfgData.err) : null,
        cfgData.msg ? React.createElement('div', { key: 'msg', style: { fontSize: '12px', color: 'var(--dsw-alias-state-success-primary, #34d399)' } }, cfgData.msg) : null,
        React.createElement('div', { key: 'grabrow', style: { display: 'flex', flexDirection: 'column', gap: '3px', borderTop: '1px dashed var(--dsw-alias-border-l2, rgba(127,127,127,.18))', paddingTop: '8px' } }, [
          React.createElement('button', {
            type: 'button',
            onClick: grabCfg,
            disabled: grabbing,
            style: {
              padding: '7px 12px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', fontWeight: 600,
              border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3))',
              background: 'transparent', color: 'var(--dsw-alias-label-primary, #e6edf7)',
            },
          }, grabbing ? '正在抓取…' : '🤖 自动抓取 Cookie'),
          React.createElement('div', { key: 'grabhint', style: { fontSize: '10px', color: mutedColor, lineHeight: 1.4 } }, '自动读取你浏览器里已登录的 opencode.ai 登录 cookie 并写入插件。点之前请完全关闭 Chrome（托盘退出）；若还没登录，会打开 Chrome 让你登录后再点一次。'),
        ]),
        React.createElement('div', { key: 'btns', style: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '2px' } }, [
          React.createElement('button', {
            type: 'button',
            onClick: function () { setCfgOpen(false) },
            style: {
              padding: '6px 14px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
              border: '1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3))',
              background: 'transparent', color: 'inherit',
            },
          }, '取消'),
          React.createElement('button', {
            type: 'button',
            onClick: saveCfg,
            style: {
              padding: '6px 14px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: 600,
              border: 'none', background: 'var(--dsw-alias-button-primary-fill, #4d6bfe)', color: '#fff',
            },
          }, '保存并刷新'),
        ]),
        React.createElement('div', { key: 'hint', style: { fontSize: '11px', color: mutedColor, lineHeight: 1.5 } }, '获取 cookie：登录 opencode.ai 用量页 → F12 → Network（网络）→ 刷新页面 → 请求标头 cookie: 行复制 auth=... 值（或 Application → Cookies）。'),
      ]),
    ]) : null,
  ])
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
