# v0.9.7 发布记录

| 项 | 值 |
|---|---|
| 仓库 | `https://github.com/Animal2404/dsh-open-go` |
| 目标 | 齿轮设置（⚙ 弹窗及其配置面）涉及的所有位置全部对齐，行为一致、无遗漏 |
| 阶段 1（查全） | `.verify/GEAR-SETTINGS-INVENTORY.md`：26 处 —— 客户端 11（C1-C11）、宿主 6（H1-H6）、文档/脚本 6（D1-D6）、以及 4 处"看似相关但不属于齿轮"的说明 |
| 根本不一致 | 齿轮写 `~/.dsh/.credentials.yaml` + 内存；设置面板读 `~/.dsh/settings.yaml`（实测里面**没有** `opencode-quota` 段）→ 两个入口必然分叉；`billing` 只在齿轮里有，schema 里没有 |
| 阶段 2（修改） | 宿主：`billing` 进 schema（默认 false，描述同句）、`persistToSettings()` 写回设置存储、GET/POST 契约升级、**修 `scope.writable` 读错字段的真 bug**；客户端：开关权威值宿主化 + 挂载/开窗校准 + 改动即时落盘 + 保存带 billing + 两端文案统一；文档：README / UI-SPEC §6·§9 / DEVELOPMENT-LOG 第九节 / package.json 描述 |
| 阶段 3（验证） | `node --check` 双通过；宿主导出 + `Config({})={"billing":false}`；齿轮全流程探针 exit=0（`.verify/gear-run.log`）：开关 关→开 均落盘、点保存后 `source: credentials → settings`、直打 POST `persisted:["credentials","settings"]`、结尾复原 `billing:false`；落盘 diff 仅 3 行；凭证文件 cookie 行未变；两端文案同句（宿主 L43 ↔ 客户端 L895） |
| 无工具链 | `package.json` `scripts: null`，无 tsconfig/eslint/vitest/Makefile/.github → 无可跑的测试/类型检查/构建/lint，改用可复现的手动验证（命令与输出见 §7） |
| 事故与恢复 | `dev_reload_package` 把宿主 loader entry 弄成 `[failed]`（`activeEntry=none`，旧实例仍在应答接口）→ 用一次干净重启恢复，随后 `settingsWritable: true` |
| 版本 | `package.json` 0.9.6 → 0.9.7；`lib/client.js` / `lib/index.js` 头注释同步 |
| 探针 | `.verify/probes-v0.9.7.json` |
