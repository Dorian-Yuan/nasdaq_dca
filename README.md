# NASDAQ 100 DCA Strategy Tool (纳指100定投评估工具)

这是一个基于 Python 和 GitHub Actions 构建的完全自动化的纳斯达克 100 (QQQ) 定投策略评估工具。它可以每天抓取金融数据，通过预设的指标判断当前市场处于什么位置，并给出“加倍定投”、“普通定投”或“暂停定投”的建议。

项目自带一个现代化的 PWA (渐进式 Web 应用) 界面，您可以将其**添加到手机主屏幕**，获得类似原生 App 的体验。

## ✨ 核心功能

1. **三维加权模型 (Model 2)**：
   - 🏷️ **估值因子 (40%)**：调用蛋卷 API，获取纳指100 PE历史百分位。百分位越低得分越高，若达到100%极度泡沫时该项得分为0。
   - 😱 **情绪因子 (30%)**：接入 Alternative.me 获取美股市场恐慌贪婪指数。越恐慌得分越高。
   - 📉 **趋势因子 (30%)**：计算 QQQ 与 200 日线乖离率。均线之上顺势增强，跌破防守，极度超买大幅扣分。
   - **综合红绿灯**：三者乘加后得出 0.00x ~ 3.00x 的平滑资金倍数。红灯(暂停买入)[0, 0.4]、黄灯(普通定投)(0.4, 0.7]、绿灯(加倍定投)(0.7, +∞)。
2. **全自动无服务器运行**：完全依赖 GitHub Actions 充当免费的定时服务器，每天美股收盘后自动运行。
3. **PWA 手机端友好**：自带响应式暗黑模式前端页面，支持一键添加到手机桌面。
4. **支持 Bark 推送**：自带配置参数，在每天北京时间 14:00 自动向您的手机 Bark 发送包含数据与决策的通知推送。
5. **一键强制刷新**：网页端内置调用 GitHub Webhook 的功能，可以随时点击按钮强制云端服务器重新获取最新数据。

---

## 🚀 部署配置指南 (详细版)

这个项目设计为“Fork 即用”。为了保障您的隐私（如 GitHub Token 和 Bark Key 不被泄露），所有的敏感数据都是在本地配置文件和 GitHub Secrets 中独立管理的。

### 第 1 步：克隆/Fork 仓库并配置本地环境

1. 将本仓库 Fork 到您自己的 GitHub 账号下。
2. 将代码克隆到您的本地电脑。
3. 在本地项目根目录下找到 **`config.js`** 文件（如果不存在请新建，本仓库的 `.gitignore` 已经为您排除了它，防止上传泄露）。
4. 在 `config.js` 中填入如下代码，并替换为您自己的信息：
   ```javascript
   const CONFIG = {
       GITHUB_USERNAME: "您的GitHub用户名", 
       GITHUB_REPO_NAME: "包含当前代码的仓库名",
       GITHUB_TOKEN: "您的Personal Access Token (PAT)" // 可选：只有想在网页上手动点刷新按钮才需要配置
   };
   ```
5. *(注意：如果您需要配置 `GITHUB_TOKEN`，请去 GitHub 的 `Settings` -> `Developer settings` -> `Personal access tokens (classic)` 创建一个带有 `repo` (读写仓库)和 `workflow` 权限的 Token。)*

### 第 2 步：开启 GitHub Actions 读写权限 (关键❗)

如果不开启此项，每天 Actions 算好数据后将会因为没有权限，无法把结果写入到 `data.json` 中保存。

1. 进入您的 GitHub 仓库网页。
2. 点击顶部的 **Settings** 选项卡。
3. 在左侧菜单找到 **Actions**，点击展开后选择 **General**。
4. 一直往下滑，找到 **Workflow permissions** 模块。
5. 勾选 **Read and write permissions**，然后点击下方的 **Save** 按钮。

### 第 3 步：部署静态网页 (GitHub Pages)

利用 GitHub Pages 即可免费托管前端展示页面。

1. 同样在仓库的 **Settings** 页面。
2. 在左侧菜单，接近底部找到 **Pages**。
3. 在 `Build and deployment` -> `Source` 中，选择 **Deploy from a branch**。
4. 在下方的 `Branch` 下拉菜单中选择 **main**（或 master），文件夹保留 `/(root)`。
5. 点击 **Save**。
6. 等待约 1 分钟后刷新该页面，顶部就会显示您专属的网页链接了（例如 `https://您的名字.github.io/仓库名`）。

### 第 4 步：(可选) 配置每日 Bark 推送通知

如果您想每天下午 14:00 在手机上收到如下提示音响亮的推送通知，请配置您的 Bark 密钥。

1. 在仓库的 **Settings** -> 左侧边栏找到 **Secrets and variables** -> 展开选 **Actions**。
2. 点击绿色的 **New repository secret** 按钮。
3. **Name (名称)**：严格填入 `BARK_KEY` (全部大写，不要有空格)。
4. **Secret (数值)**：打开您手机的 Bark App，复制专属链接中最后那段随机字符串（例如链接是 `https://api.day.app/abcd1234efgh/`，那么只填写 `abcd1234efgh` 进去）。
5. 点击 **Add secret** 保存。

### 第 5 步：安装至手机桌面

1. 在您的 iPhone (建议使用 Safari) 或 Android (建议使用 Chrome/Edge) 上打开刚才第三步生成的 **GitHub Pages 链接**。
2. 点击浏览器底部的**分享**图标（iPhone）或右上角的**菜单**（Android）。
3. 选择 **“添加到主屏幕” (Add to Home Screen)**。
4. 返回桌面，您就可以像打开一个普通 App 一样每天快速查看当天的美股定投评估结果了！

---

## 👨‍💻 二次开发与计算逻辑参考

如果您想调整各项因子的权重或算法，可以通过修改 `backend/fetch_and_calc.py` 中的 `evaluate_strategy()` 函数来实现。

**当前计算逻辑 (Model 2)：**
- **Valuation (估值)** 得分：`2.0 * (1.0 - PE百分位)`。低估值给予高乘数，极度高估剥夺加分能力。
- **Sentiment (情绪)** 得分：`(100 - FG指数) / 50.0`。指数越低越能贪婪。
- **Trend (趋势)** 得分：均线之上 `1.2`，跌破防守 `0.8`，若乖离率>15%极度超买，回归风险极大，得分强制下调至 `0.5`。

最终将三个得分系数与各自的全局权重阈值 (0.4, 0.3, 0.3) 相乘累加，计算得出综合定投倍数，由该倍数直接映射生成 PWA 上的红黄绿灯指令与买入金额建议。
