# v0.9.1 发布记录

| 项 | 值 |
|---|---|
| 仓库 | `https://github.com/Animal2404/dsh-open-go` |
| 改动 | 去掉展开面板里的「额度」分区标题（用户反馈截图圈出）；三档卡片直接跟在标题栏下；账单打开时保留「官方账单」分区标题作分界 |
| 版本 | `package.json` 0.9.0 → 0.9.1；`lib/client.js` / `lib/index.js` 头注释同步 |
| 验证 | `.verify/sidebar-check.mjs` 复跑 exit 0：`sectionTitles` 由 `["额度"]` → `[]`（账单关）/ `["官方账单"]`（账单开）；面板高度 239 → 201px（账单开 467 → 429px）；其余探针不变（pill 256×31、溢出 0、账单默认 0 卡、弹窗 340×435 居中、reduced-motion 动画数 0、收起后卸载） |
| 截图 | `assets/screenshot-closeup.png`（无标题）、`assets/screenshot-main.png`（账单打开）等 4 张已换成 v0.9.1 实测帧 |
| 探针 | `.verify/probes-v0.9.1.json` |
