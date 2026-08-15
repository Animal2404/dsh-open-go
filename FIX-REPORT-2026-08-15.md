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
