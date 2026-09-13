# v0.9.2 发布记录

| 项 | 值 |
|---|---|
| 仓库 | `https://github.com/Animal2404/dsh-open-go` |
| 改动 | 收起态箭头方向掉头：**收起 ▾ / 展开 ▴**（用户反馈「箭头反了」）。基础形状是朝上的 chevron，只把「展开时旋转 180°」改成「收起时旋转 180°」（CSS 类 `--open` → `--closed`） |
| 版本 | `package.json` 0.9.1 → 0.9.2；`lib/client.js` / `lib/index.js` 头注释同步 |
| 验证 | `.verify/sidebar-check.mjs` 复跑 exit=0，新增 `chev` 探针：收起 `dshoq-chev dshoq-chev--closed` / `matrix(-1,0,0,-1,0,0)`，展开 `dshoq-chev` / `none`；其余探针与 v0.9.1 一致（面板 280×201、账单开 429、溢出 0、账单默认 0 卡、弹窗 340×435 居中、reduced-motion 动画数 0、收起卸载） |
| 截图 | `assets/screenshot-pill.png` 换成收起态（箭头朝下）实测帧 |
| 探针 | `.verify/probes-v0.9.2.json` |
