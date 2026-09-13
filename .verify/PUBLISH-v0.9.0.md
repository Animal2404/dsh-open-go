# v0.9.0 发布记录

| 项 | 值 |
|---|---|
| 仓库 | `https://github.com/Animal2404/dsh-open-go` |
| 提交 | `1714ee0` — feat(opencode-quota): v0.9.0 按参考图整体重做 UI，账单改为 ⚙ 里的开关（23 files changed, 1240 insertions(+), 315 deletions(-)） |
| 推送 | `0eee8c3..1714ee0  HEAD -> master`（push 成功） |
| 发布 | `gh release create v0.9.0` → https://github.com/Animal2404/dsh-open-go/releases/tag/v0.9.0 （Latest） |
| 版本 | `package.json` 0.8.0 → 0.9.0；`lib/index.js` 头注释同步 |
| 截图 | `assets/screenshot-pill.png` / `-closeup.png` / `-config.png` / `-main.png`（本轮无头 Chrome 实测帧，README 直接引用） |
| 验证 | `.verify/sidebar-check.mjs` 无头 Chrome 复跑两轮全绿；结论见 `VERIFY-REPORT.md` |

复跑验证：

```powershell
cd E:\DeepSeek\dsh-opencode-quota
node .verify\sidebar-check.mjs          # 需要 dsh web 正在运行（127.0.0.1:3080）
```
