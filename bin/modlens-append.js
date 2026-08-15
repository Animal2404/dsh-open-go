/**
 * modlens-append.js <stdout.json>
 * 解析 modlens CLI 输出的 JSON（meta.usage），追加一条用量记录到
 * ~/.modlens/usage.jsonl（JSONL）。不解析成功就静默跳过，绝不干扰原输出。
 */
import { readFileSync, appendFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const outPath = process.argv[2]
const logPath = join(homedir(), '.modlens', 'usage.jsonl')
if (!outPath) process.exit(0)

let text = ''
try { text = readFileSync(outPath, 'utf8') } catch (e) { process.exit(0) }
let j = null
try { j = JSON.parse(text) } catch (e) {
  // 容错：stdout 可能被包装过（如 "[info] ..." 前缀），尝试找第一个 { 之后的部分
  const idx = text.indexOf('{')
  if (idx >= 0) { try { j = JSON.parse(text.slice(idx)) } catch (e2) {} }
}
if (!j) process.exit(0)

const meta = (j && j.meta) || {}
const usage = meta.usage
if (!usage || typeof usage !== 'object') process.exit(0)

const model = meta.model || (j.provider ? (j.provider + '-vision') : 'mimo-v2.5')
// 兼容多种 usage 字段命名（openai 风格 prompt_tokens / antigravity 风格 input_tokens）
const inputTokens = Number(usage.prompt_tokens ?? usage.input_tokens ?? usage.inputTokens ?? 0)
const outputTokens = Number(usage.completion_tokens ?? usage.output_tokens ?? usage.outputTokens ?? 0)
const cacheReadTokens = Number(usage.cache_read_tokens ?? usage.cacheReadTokens ?? 0)
if (inputTokens <= 0 && outputTokens <= 0 && cacheReadTokens <= 0) process.exit(0)

const rec = {
  time: Date.now(),
  model,
  provider: 'opencode-go',
  inputTokens,
  outputTokens,
  cacheReadTokens,
  source: 'modlens',
}
try {
  mkdirSync(join(homedir(), '.modlens'), { recursive: true })
  appendFileSync(logPath, JSON.stringify(rec) + '\n', 'utf8')
} catch (e) { /* 静默 */ }
