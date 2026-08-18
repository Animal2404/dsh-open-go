# dsh web 启动失败修复记录

- **修复日期**：2026-08-15（GMT+8）
- **涉及组件**：`dsh-opencode-quota`（@dsh-external/dsh-opencode-quota v0.6.0，本地链接 `E:/DeepSeek/dsh-opencode-quota`）
- **症状**：运行 `dsh web` 启动即崩溃

---

## 一、故障现象

执行 `dsh web`（实际为 `dsh --profile web`）时报错退出：

```
SyntaxError: Bad control character in string literal in JSON at position 229 (line 4 column 160)
    at JSON.parse (<anonymous>)
    at loadProfile (.../dsh-app-boot/lib/index.js:548:25)
```

报错位置指向 profile 加载阶段解析某段 JSON 的 `description` 字段，字符串中含有损坏字节（`�?`），且末尾缺少闭合引号。

修好第一处后再次启动，暴露出第二处错误：

```
Error: dsh: plugin tree failed to load: failed to apply loader entry include (cordis:include):
failed to import loader entry opencode-quota (@dsh-external/dsh-opencode-quota):
Cannot find package '@deepseek-ai/schemastery' imported from E:\DeepSeek\dsh-opencode-quota\lib\index.js
```

## 二、根因分析

### 问题 1：package.json 的 description 字段损坏（启动崩溃主因）

`E:\DeepSeek\dsh-opencode-quota\package.json` 中 `description` 字段在版本升级（0.5.3 → 0.6.0）时被写坏：

- 多处 UTF-8 中文字节被替换为 `0x3F`（`?`），解码后显示为 `�?`，共 6 处 `U+FFFD` 损坏标记；
- 字符串末尾的闭合引号 `"` 丢失，紧跟换行进入下一个字段；
- 导致整个文件不再是合法 JSON，`JSON.parse` 直接失败。

字节级证据（`description` 起始处 hex）：

```
...e6bb9a e58a3f e5913f ...   ← "滚" 后本应继续的中文字节变成了 0x3F
```

### 问题 2：新增 import 依赖未安装（修复 JSON 后暴露）

`lib/index.js` 最近新增了设置面板能力，引入了两个新依赖：

```js
import z from '@deepseek-ai/schemastery'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
```

但插件目录没有 `node_modules`，`package.json` 也未声明这两个依赖，因此插件树加载时 Node ESM 解析失败。

## 三、修复过程

### 步骤 1：定位损坏文件

- 通过报错栈定位到 profile 加载逻辑（`dsh-app-boot` 的 `loadProfile`）；
- 在 `C:\Users\axia\.dsh\profiles\web\package.json` 的 bundles 中找到 `@dsh-external/dsh-opencode-quota`，其本地链接为 `E:/DeepSeek/dsh-opencode-quota`；
- 检查确认损坏文件即该目录下的 `package.json`（其余文件如 `lib/index.js`、`lib/client.js`、`README.md` 均无损坏）。

### 步骤 2：恢复 description 正确内容

- 用 `git diff HEAD -- package.json` 对照历史版本，取出正确的原始描述文本；
- 用 Node 脚本按行替换损坏的 `description` 行，保留 `version: 0.6.0` 与原有换行风格（LF/CRLF 保持一致）；
- 写入后立即 `JSON.parse` 验证通过。

关键修复脚本（核心逻辑）：

```js
const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
for (let i = 0; i < lines.length; i++) {
  if (lines[i].trim().startsWith('"description"')) {
    lines[i] = correctDescription; // 来自 git 历史中的正确文本
  }
}
```

### 步骤 3：补装缺失依赖

- 确认 npm registry 上的可用版本与全局 dsh 一致：
  - `@deepseek-ai/schemastery` → `3.18.1`
  - `@deepseek-ai/dsh-settings` → `0.1.0-rc.6`
- 在 `package.json` 增加 `dependencies` 字段：

```json
"dependencies": {
  "@deepseek-ai/dsh-settings": "0.1.0-rc.6",
  "@deepseek-ai/schemastery": "^3.18.1"
}
```

- 在插件目录执行安装：

```bash
cd E:\DeepSeek\dsh-opencode-quota
npm install
# added 7 packages, audited 8 packages, found 0 vulnerabilities
```

## 四、验证结果

1. `dsh web --help` → 正常输出 usage，说明 profile 组合已通过；
2. `dsh web --port 0` → 正常启动并输出：

```
dsh web: http://127.0.0.1:3197
```

3. 最终 `git status`：

```
M lib/index.js       ← 修复前已有的功能改动（设置面板），非本次修复产生
M package.json       ← 本次修复：description 恢复 + 新增 dependencies
?? package-lock.json ← 本次 npm install 生成
```

## 五、最终状态与建议

- ✅ `dsh web` 可正常启动；
- ✅ 无其他文件损坏；
- ⚠️ `lib/index.js` 与 `package.json` 的改动尚未 commit，`package-lock.json` 为新增文件；如确认无误建议尽快提交，避免再次出现工作区内容与版本库不一致导致的意外损坏；
- ⚠️ 本次 JSON 损坏疑似由编辑器/脚本以错误编码覆盖保存引起，后续编辑该文件时注意保持 UTF-8 编码。

---

# 追加修复（同日 20:33）：silent-restart 插件 schema 报错

## 故障现象

再次运行 `dsh web` 崩溃，报错：

```
Error: dsh: plugin tree failed to load: failed to apply loader entry silent-restart
(@dsh-external/dsh-silent-restart): unsupported JSON schema:
schema.properties.ok.required is not supported on type "boolean";
schema.properties.action.required is not supported on type "string";
schema.properties.text.required is not supported on type "string"
JsonSchemaError: ... code: 'UNSUPPORTED_SCHEMA'
```

## 根因

`E:\DeepSeek\dsh-plugin-silent-restart\lib\index.js` 中注册 agent 工具 `dsh_silent_restart` 时，`output.schema` 写法错误：

```js
// 错误写法：required 被放在属性级别，JSON Schema 不允许对 boolean/string 原始类型声明 required
properties: {
  ok: { type: 'boolean', required: true },
  action: { type: 'string', required: true },
  text: { type: 'string', required: true },
},
```

`dsh-tools` 的 `assertSupportedJsonSchema` 只接受 object 顶层 `required` 数组，属性级 `required` 一律拒绝（UNSUPPORTED_SCHEMA），导致插件树加载失败。

## 修复

改为对象顶层声明必需属性：

```js
properties: {
  ok: { type: 'boolean' },
  action: { type: 'string' },
  text: { type: 'string' },
},
required: ['ok', 'action', 'text'],
```

并验证：`node --check` 语法通过；`dsh web --port 0` 正常启动（http://127.0.0.1:8173）。

## 经验教训

- dsh 插件工具 schema 的 `required` 必须写在对象顶层，不能写在具体属性上；
- 该插件的 `parameters` 部分写法正确（顶层 `required: []`），仅 `output.schema` 存在此问题；
- 两个插件仓库均非 git 仓库（dsh-plugin-silent-restart 无 .git），建议对本地插件也启用版本管理，便于回滚。

---

# 追加修复（8-16 20:17）：dsh-token-stats 客户端 boot 失败

## 故障现象

`dsh web` 服务端能启动（http://127.0.0.1:3080），但浏览器打开后页面顶部提示：

```
Failed to load plugins
web boot: 1 entry did not activate dsh-token-stats: pending (waiting for services:
@deepseek-ai/dsh-client-runtime, @deepseek-ai/dsh-client-ui-slots, @deepseek-ai/dsh-client-ui-conversation)
```

## 根因

`C:\Users\axia\.dsh\plugins\dsh-token-stats\client.js` 中把 **npm 包全名** 当作客户端服务名声明：

```js
// 错误：客户端 shell 不提供这些“服务”，boot 一直等待导致 entry 无法激活
exports.inject = [
  '@deepseek-ai/dsh-client-runtime',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-conversation',
];
```

客户端 shell 实际提供的服务是短名（`slots`、`theme` 等）。正常插件（dsh-opencode-quota）用的是 `exports.inject = ['slots']`。

## 修复

```js
exports.inject = ['slots'];
```

`slots` 是真实存在的客户端服务（`dsh-cordis-client-runner` 的 guardedSlots），且插件 `apply` 中确实使用 `ctx.slots.inject/register`，声明与实际使用一致。

## 验证

1. `dsh web --port 0` 服务端启动成功；
2. 杀掉旧实例（PID 24332，加载的是修复前 client.js）后以默认端口 3080 重启（PID 29824）；
3. 浏览器打开 http://127.0.0.1:3080：页面正常加载，**无** “Failed to load plugins”，模型选择/额度小组件等均正常。

## 经验教训

- 客户端插件 `exports.inject` 声明的是**运行时服务名**（短名，如 `slots`/`theme`），不是 npm 包名；
- 修改 client 端代码后必须重启 dsh 服务（客户端 bundle 在启动时构建），仅刷新页面无效；
- 端口 3080 被旧实例占用时 `dsh web` 会报 EADDRINUSE，先 `taskkill` 旧进程再启动。


