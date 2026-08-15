# ⚡ dsh-opencode-quota

OpenCode GO 套餐额度 + 官方账单小组件，挂在 DSH Web 侧边栏**设置按钮上方**（`sidebar.footer.action` 插槽）。

## 功能

**Open GO 额度**（官方 usage 接口）
- 滚动 / 每周 / 每月三档额度百分比条 + 重置时间
- 标题旁显示 24 时制更新时间（如 `17:35 更新`）
- 点击 ↻ 立即刷新，每 5 分钟自动轮询

**官方账单**（opencode 控制台 getCosts RPC，非本地估算）
- **今日**：蓝色块，按模型柱状条（模型名 + 占比% + 金额）
- **本月**：绿色块，按模型柱状条（top 4）
- 金额来自官方控制台，精确到分

**窄侧栏**（rail 模式）自动退化为小图标按钮。

## 安装

```sh
dsh plugin --profile web add https://github.com/Animal2404/dsh-opencode-quota
# 重启 dsh web 生效
```

## 配置凭证（~/.dsh/.credentials.yaml）

额度功能**零配置**：自动复用已有的 `OPENCODE_GO_API_KEY`。

官方账单需要两步（一次性，约 2 分钟）：

```yaml
# ① workspace id：打开 https://opencode.ai/workspace/ 用量页，
#    地址栏里 wrk_ 开头的那段就是
OPENCODE_WORKSPACE_ID: 'wrk_01KZZVJ4HX6PR54FNAZJWXFWHX'

# ② 登录 cookie（登录 opencode.ai 后，任选一种方式获取）：
OPENCODE_CONSOLE_COOKIE: 'auth=Fe26.2**...; oc_locale=zh'
```

### 获取 cookie 的 3 种方式（都不需要抓包/截图）

**方式 A（最简单，控制台一行命令）**
1. 浏览器登录 https://opencode.ai/workspace/ 用量页，按 F12 → Console
2. 输入 `allow pasting` 回车（Chrome 首次粘贴的安全提示）
3. 粘贴 `copy(document.cookie)` 回车 —— 自动复制到剪贴板
4. 粘贴到凭证文件即可

**方式 B（Cookie-Editor 插件）**
1. 浏览器装 Cookie-Editor 插件，登录 opencode.ai 后打开插件
2. 点 Copy（复制全部 cookie，格式即 `auth=...; oc_locale=zh`）
3. 粘贴到凭证文件

**方式 C（F12 Application 面板）**
1. F12 → Application → Cookies → opencode.ai
2. 找到 `auth`，双击 Value 全选复制
3. 拼成 `auth=<复制的值>` 写入凭证文件

> cookie 是登录会话，**过期后重新复制一次即可**（账单会显示"cookie 可能已过期"提示）。

## 手动验证宿主接口

```powershell
# 额度
Invoke-RestMethod -Uri http://127.0.0.1:3080/dsh-opencode-quota/api/status -Headers @{ 'x-dsh-opencode-quota' = '1' }
# 官方账单（本月按日×模型）
Invoke-RestMethod -Uri http://127.0.0.1:3080/dsh-opencode-quota/api/official -Headers @{ 'x-dsh-opencode-quota' = '1' }
```

## 目录结构

```
lib/index.js    # 宿主：额度 / 账单 RPC / 读凭证库，key/cookie 不出服务器
lib/client.js   # 浏览器端组件（sidebar.footer.action 插槽）
bin/            # modlens 包装器（可选，识图用量本地记录）
cordis.patch.yml
```

## 说明

- 官方账单走 opencode 控制台的登录会话认证（官方限制，API key 无法访问），所以必须配置 cookie；额度接口用 API key，无需 cookie
- 所有凭据只在宿主侧使用，绝不下发浏览器
- 时间显示为本地时区 24 时制；账单按 +08:00 时区聚合（与控制台页面一致）
