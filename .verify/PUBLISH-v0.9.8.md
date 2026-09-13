# v0.9.8 发布记录

| 项 | 值 |
|---|---|
| 仓库 | `https://github.com/Animal2404/dsh-open-go` |
| 需求 | 给「展开」加进度条生长动画：从 0 增长到当前数据对应的进度值 |
| 定位 | 展开 = `openNow()` 挂载面板 → `.dshoq-card` → `TIERS.map(TierRow)`；数据 = `state.usage[key].percent`（`/api/status`）经 `props.percent` 传入；补间用既有 `useTweenNum`（rAF），**零新增依赖** |
| 改动 | ① `TierRow` 补间起点改回 0（`420ms`）；② 账单明细 `ModelRow` 同步（`420ms`）；③ pill 里的读数不动（避免收起态跳动）；`prefers-reduced-motion` 仍直接停终点 |
| 验证（`.verify/grow-run.log`） | 首次展开：首帧宽度 **0px** → 终态 **31.7px / 132px = 24%**（与页面读数 24%、接口数据三方一致），中间出现 **25 个不同宽度且单调递增**；收起后确认面板已卸载 → 再展开 **仍从 0px 重播**（24 个不同宽度）；中途帧 80ms=15%、260ms=24% |
| 未回退 | 面板 280×197、点击→可见 28ms、账单默认 0 卡、reduced-motion 动画数 0、收起卸载 |
| 无工具链 | `package.json` `scripts: null`，无 tsconfig/eslint/vitest/Makefile/.github → 以 `node --check` + 逐帧几何采样 + 截图 + 接口对账代替 |
| 版本 | `package.json` 0.9.7 → 0.9.8；`lib/client.js` / `lib/index.js` 头注释同步（本轮仅客户端改动，刷新页面即可生效） |
| 探针 | `.verify/probes-v0.9.8.json`、截图 `.verify/shots/09-grow-80ms.png`、`09b-grow-260ms.png`、`09c-grow-settled.png` |
