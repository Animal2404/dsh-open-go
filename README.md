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
- 数据来自官方控制台月度成本接口，金额精确到分

**其他**
- 窄侧栏（rail 模式）退化为小图标按钮
- key / cookie 只在宿主侧使用，绝不下发浏览器

## 安装

```sh
dsh plugin --profile web add <本仓库路径>
# 或从 GitHub：
dsh plugin --profile web add https://github.com/Animal2404/dsh-opencode-quota
# 重启 dsh web 生效
```

## 凭证配置

在 `~/.dsh/.credentials.yaml`（或环境变量）中配置：

```yaml
# OpenCode GO API key（额度接口）
OPENCODE_GO_API_KEY: 'sk-...'

# opencode.ai 控制台登录 cookie（官方账单接口）
# 登录 https://opencode.ai/workspace/<你的workspace>/usage 后，
# 用 Cookie-Editor 等插件复制完整 cookie（auth=Fe26.2**...; oc_locale=zh）
OPENCODE_CONSOLE_COOKIE: 'auth=Fe26.2**...; oc_locale=zh'

# opencode workspace id（控制台 URL 中的 wrk_...）
OPENCODE_WORKSPACE_ID: 'wrk_...'
```

> 账单接口需要 `OPENCODE_CONSOLE_COOKIE` + `OPENCODE_WORKSPACE_ID`；未配置时额度仍可用，账单显示获取失败。

## 手动验证宿主接口

```powershell
# 额度
Invoke-RestMethod -Uri http://127.0.0.1:3080/dsh-opencode-quota/api/status -Headers @{ 'x-dsh-opencode-quota' = '1' }
# 官方账单（本月按日×模型）
Invoke-RestMethod -Uri http://127.0.0.1:3080/dsh-opencode-quota/api/official -Headers @{ 'x-dsh-opencode-quota' = '1' }
```

## 目录结构

```
lib/index.js    # 宿主：额度 / 账单 RPC / 会话日志聚合，读凭证库
lib/client.js   # 浏览器端组件（sidebar.footer.action 插槽）
bin/            # modlens 包装器（识图用量记录，可选）
cordis.patch.yml
```

## 注意

- 官方账单数据来自 opencode 控制台（`/console` 认证），cookie 过期后需重新复制
- `bin/` 下是 modlens CLI 包装器，用于把识图（MiMo 2.5）用量记入本地，可选安装
