# ⚡ dsh-opencode-quota

OpenCode GO 套餐额度 + 官方账单小组件，挂在 DSH Web 侧边栏**设置按钮上方**（`sidebar.footer.action` 插槽）。

## 功能

**Open GO 额度**（官方 usage 接口）
- 滚动 / 每周 / 每月三档额度百分比条 + 重置时间
- 标题旁显示 24 时制更新时间（如 `17:35 更新`）
- 点击 ↻ **一键刷新全部**（额度 + 账单，跳过缓存），每 5 分钟自动轮询

**官方账单**（opencode 控制台 getCosts RPC，非本地估算）
- **今日**：蓝色块，按模型柱状条（模型名 + 占比% + 金额）
- **本月**：绿色块，按模型柱状条（top 4）
- 金额来自官方控制台，精确到分

**窄侧栏**（rail 模式）自动退化为小图标按钮。

## 安装

```sh
# pnpm 9+ 需要 -w（workspace root）标志；dsh 转发器原样透传
dsh plugin --profile web add -w https://github.com/Animal2404/dsh-opencode-quota

# 若报 EPERM（profile 目录在工作区外被沙箱拦截），在允许写入 ~/.dsh 的权限下重试
# 重启 dsh web 生效
```

## 配置凭证（~/.dsh/.credentials.yaml）

额度功能**零配置**：自动读取 `OPENCODE_GO_API_KEY`（环境变量或 `~/.dsh/.credentials.yaml`），
或回退到 opencode CLI 的 `~/.local/share/opencode/auth.json`（用过 opencode CLI 登录即有）。

官方账单需要两步（一次性，约 2 分钟）：

```yaml
# ① workspace id：打开 https://opencode.ai/workspace/ 用量页，
#    地址栏里 wrk_ 开头的那段就是
OPENCODE_WORKSPACE_ID: 'wrk_01KZZVJ4HX6PR54FNAZJWXFWHX'

# ② 登录 cookie（登录 opencode.ai 后获取，见下方方法）：
OPENCODE_CONSOLE_COOKIE: 'auth=Fe26.2**...'
```

### 获取 cookie（auth 是 httpOnly，JS 读不到，务必用下面两种方式之一）

**方式 1（推荐，F12 Application 面板）**
1. 浏览器登录 https://opencode.ai/workspace/ 用量页，按 F12
2. Application → Cookies → `https://opencode.ai` → 找到 `auth`
3. 双击 Value 全选复制（Application 面板能看到 httpOnly cookie 的值）
4. 拼成 `auth=<复制的值>` 写入凭证文件

**方式 2（Cookie-Editor 扩展）**
1. 浏览器装 Cookie-Editor 扩展，登录 opencode.ai 后打开扩展
2. 点 Copy（复制全部 cookie），粘贴到凭证文件即可

> ⚠️ 控制台 `copy(document.cookie)` **无效**：auth cookie 是 httpOnly，JS 无法读取。
> cookie 是登录会话，**过期后重新复制一次即可**（账单会显示"cookie 可能已过期"提示）。

## 手动验证宿主接口

```powershell
# 额度
Invoke-RestMethod -Uri http://127.0.0.1:3080/dsh-opencode-quota/api/status -Headers @{ 'x-dsh-opencode-quota' = '1' }
# 官方账单（本月按日×模型；?force=1 跳过缓存）
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
- 账单 RPC 自动重试 3 次（抗网络抖动）；cookie 过期时返回明确提示

## 许可

MIT
