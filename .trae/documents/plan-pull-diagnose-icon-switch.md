# 计划：拉取远程仓库 + 排查数据更新问题 + 切换图标

## 调查

### github page上数据未更新的根本原因还需要调查

经过详细调查，发现 **GitHub Actions 定时任务运行正常**，在于为什么github page没有用上最新的数据：

| 对比项               | 远程 (GitHub)             | 本地                      |
| ----------------- | ----------------------- | ----------------------- |
| data.json 更新时间    | `2026-04-29 14:21:31` ✅ | `2026-03-13 16:27:30` ❌ |
| 最近自动提交            | 4/27, 4/28, 4/29 每天都有 ✅ | 停留在 3/13 ❌              |
| backtest\_data.js | `2026-04-29 06:21:39` ✅ | `2026-03-13 07:43:54` ❌ |

**结论**：GitHub Actions 的 cron 定时任务一直在正常运行，远程数据每天按时更新。用户用github page只显示到4月21号左右的数据，需要分析为什么并生成新一版本的plan，让用户检查

***

## 实施步骤

### 步骤 1：从 GitHub 拉取最新代码

* 执行 `git pull origin main` 将远程最新数据同步到本地

* 这将更新本地的 `data/data.json` 和 `data/backtest_data.js` 等文件

### 步骤 2：切换应用图标 (icon.png → icon2.png)

需要修改以下 4 个文件中的 icon 引用，**保留两张图片不删除**：

1. **`manifest.json`**（2处引用）

   * `"src": "./web/assets/icon.png"` → `"src": "./web/assets/icon2.png"`

2. **`index.html`**（1处引用）

   * `<link rel="apple-touch-icon" href="./web/assets/icon.png">` → `href="./web/assets/icon2.png"`

3. **`sw.js`**（1处引用）

   * `'./web/assets/icon.png'` → `'./web/assets/icon2.png'`

4. **`backend/fetch_and_calc.py`**（1处引用 - Bark推送图标URL）

   * `"icon": "https://raw.githubusercontent.com/Dorian-Yuan/nasdaq_dca/main/icon.png"` → `"icon2.png"`

### 步骤 3：版本号更新

* 当前版本：`v2.4.7`（在 `index.html` 底部）

* 图标切换属于 UI 变更，C+1 → `v2.4.8`

### 步骤 4：验证

* 确认本地 data.json 已更新到最新日期

* 确认所有 icon.png 引用已切换为 icon2.png

* 确认 icon.png 和 icon2.png 文件都保留在 `web/assets/` 目录中

