document.addEventListener('DOMContentLoaded', () => {
    // 注册 Service Worker (用于 PWA)
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js').then(reg => {
                console.log('ServiceWorker registration successful');
            }).catch(err => {
                console.log('ServiceWorker registration failed: ', err);
            });
        });
    }

    // 获取 DOM 元素
    const dom = {
        updateTime: document.getElementById('update-time'),
        lightRed: document.getElementById('light-red'),
        lightYellow: document.getElementById('light-yellow'),
        lightGreen: document.getElementById('light-green'),
        decisionText: document.getElementById('decision-text'),
        valBias: document.getElementById('val-bias'),
        valPrice: document.getElementById('val-price'),
        valPePct: document.getElementById('val-pe-pct'),
        valPe: document.getElementById('val-pe'),
        valVxn: document.getElementById('val-vxn'),
        valDailyReturn: document.getElementById('val-daily-return')
    };

    // 重置指示灯状态
    function resetLights() {
        dom.lightRed.className = 'light';
        dom.lightYellow.className = 'light';
        dom.lightGreen.className = 'light';
        dom.decisionText.className = '';
    }

    let currentTab = 'NDX';
    let cachedData = null;

    // 根据当前 Tab 动态替换文案
    function updateLabelsForTab() {
        if (currentTab === 'NDX') {
            document.getElementById('main-title').textContent = '纳斯达克100 (NDX) 定投评估';
            document.getElementById('label-price-title').textContent = 'NDX 指数';
            document.getElementById('label-vol-title').textContent = '^VXN';
            document.getElementById('tooltip-vol').setAttribute('data-tooltip', 'CBOE 纳斯达克 100 波动率指数。\n通常15-20为常态，低于15偏向贪婪，高于30代表恐慌并开始提供可观的买入乘数。');
        } else if (currentTab === 'SP500') {
            document.getElementById('main-title').textContent = '标普500 (SP500) 定投评估';
            document.getElementById('label-price-title').textContent = 'SP500 指数';
            document.getElementById('label-vol-title').textContent = '^VIX';
            document.getElementById('tooltip-vol').setAttribute('data-tooltip', 'CBOE 标普500 波动率指数。\n通常15-20为常态，低于15偏向贪婪，高于30代表恐慌并开始提供可观的买入乘数。');
        }
    }

    // 渲染 UI 数据
    function renderData(allData) {
        cachedData = allData;
        updateLabelsForTab();

        const tabData = allData[currentTab];
        if (!tabData || !tabData.latest) return;

        const data = tabData.latest;

        dom.updateTime.textContent = `更新时间 (北京时间): ${data.update_time}`;

        resetLights();

        const finalWeight = data.individual_decisions ? data.individual_decisions.final_weight : null;

        // 设置主策略红绿灯及权重得分显示 (模型二：红灯[0,0.4]，黄灯(0.4,0.7]，绿灯(0.7,+∞))
        if (finalWeight !== null) {
            if (finalWeight <= 0.4) {
                dom.lightRed.classList.add('active-red');
                dom.decisionText.textContent = `🔴 综合权重得分: ${finalWeight.toFixed(2)} 倍`;
                dom.decisionText.classList.add('decision-red');
            } else if (finalWeight > 0.7) {
                dom.lightGreen.classList.add('active-green');
                dom.decisionText.textContent = `🟢 综合权重得分: ${finalWeight.toFixed(2)} 倍`;
                dom.decisionText.classList.add('decision-green');
            } else {
                dom.lightYellow.classList.add('active-yellow');
                dom.decisionText.textContent = `🟡 综合权重得分: ${finalWeight.toFixed(2)} 倍`;
                dom.decisionText.classList.add('decision-yellow');
            }
        } else {
            // 兼容防错
            dom.decisionText.textContent = data.decision;
        }

        // 渲染详细指标数据 (处理可能为空的情况)
        if (data.metrics) {
            const m = data.metrics;
            const ind = data.individual_decisions || {};

            dom.valBias.textContent = m.bias_percent !== null ? `${m.bias_percent}%` : '--%';
            dom.valPrice.textContent = m.price !== null ? m.price.toLocaleString() : '--';
            document.getElementById('decision-bias').textContent = ind.bias_decision || '--';
            document.getElementById('decision-bias').className = `metric-decision ${ind.bias_decision === '加倍定投' ? 'text-green' : ind.bias_decision === '暂停定投' ? 'text-red' : 'text-yellow'}`;

            if (m.daily_return_percent !== null && m.daily_return_percent !== undefined) {
                const sign = m.daily_return_percent > 0 ? '+' : '';
                dom.valDailyReturn.textContent = `${sign}${m.daily_return_percent}%`;
                dom.valDailyReturn.className = `metric-value ${m.daily_return_percent > 0 ? 'text-red' : m.daily_return_percent < 0 ? 'text-green' : ''}`;
            } else {
                dom.valDailyReturn.textContent = '--%';
                dom.valDailyReturn.className = 'metric-value';
            }

            dom.valPePct.textContent = m.pe_percentile !== null ? `${(m.pe_percentile * 100).toFixed(1)}%` : '--%';
            dom.valPe.textContent = m.pe !== null ? m.pe : '--';
            document.getElementById('decision-pe').textContent = ind.pe_decision || '--';
            document.getElementById('decision-pe').className = `metric-decision ${ind.pe_decision === '加倍定投' ? 'text-green' : ind.pe_decision === '暂停定投' ? 'text-red' : 'text-yellow'}`;

            dom.valVxn.textContent = m.volatility !== null ? m.volatility : '--';
            document.getElementById('decision-vxn').textContent = ind.vol_decision || '--';

            // 根据返回的倍数决定文本颜色 (高于1倍为绿，低于1倍为红)
            const getDecisionClass = (decisionStr) => {
                if (!decisionStr || decisionStr === '--') return "text-yellow";
                if (decisionStr.includes('x')) {
                    const val = parseFloat(decisionStr);
                    if (val > 1.0) return "text-green";
                    if (val < 1.0) return "text-red";
                    return "text-yellow";
                }
                // 兼容旧文字
                return decisionStr === '加倍定投' ? 'text-green' : decisionStr === '暂停定投' ? 'text-red' : 'text-yellow';
            };

            document.getElementById('decision-bias').className = `metric-decision ${getDecisionClass(ind.bias_decision)}`;
            document.getElementById('decision-pe').className = `metric-decision ${getDecisionClass(ind.pe_decision)}`;
            document.getElementById('decision-vxn').className = `metric-decision ${getDecisionClass(ind.vol_decision)}`;
        }
    }

    // 获取数据的方法。加个随机数防止浏览器缓存 data.json
    function loadData() {
        const fetchUrl = `./data.json?t=${new Date().getTime()}`;
        fetch(fetchUrl)
            .then(response => {
                if (!response.ok) {
                    throw new Error('网络响应失败');
                }
                return response.json();
            })
            .then(data => {
                renderData(data);
            })
            .catch(error => {
                console.error('获取策略数据失败:', error);
                dom.updateTime.textContent = '数据加载失败，请检查网络或点击刷新按钮重试。';
                dom.decisionText.textContent = '读取失败';
                dom.decisionText.className = 'text-red';

                // 将所有指标设置为错误状态
                const errText = '错误';
                dom.valBias.textContent = errText;
                dom.valPrice.textContent = '--';
                document.getElementById('decision-bias').textContent = '--';

                dom.valDailyReturn.textContent = errText;
                dom.valDailyReturn.className = 'metric-value';

                dom.valPePct.textContent = errText;
                dom.valPe.textContent = '--';
                document.getElementById('decision-pe').textContent = '--';

                dom.valVxn.textContent = errText;
                document.getElementById('decision-vxn').textContent = '--';
            });
    }

    // 自动刷新逻辑 (GitHub Webhook 触发)
    let GITHUB_TOKEN = localStorage.getItem('GITHUB_TOKEN') || '';
    let REPO_OWNER = localStorage.getItem('REPO_OWNER') || 'Dorian-Yuan';
    let REPO_NAME = localStorage.getItem('REPO_NAME') || 'nasdaq_dca';

    if (typeof window.CONFIG !== 'undefined') {
        if (window.CONFIG.GITHUB_TOKEN) GITHUB_TOKEN = window.CONFIG.GITHUB_TOKEN;
        if (window.CONFIG.GITHUB_USERNAME) REPO_OWNER = window.CONFIG.GITHUB_USERNAME;
        if (window.CONFIG.GITHUB_REPO_NAME) REPO_NAME = window.CONFIG.GITHUB_REPO_NAME;
    }

    const WORKFLOW_ID = 'daily_update.yml'; // 与 workflows 目录下的文件名一致
    const refreshBtn = document.getElementById('refresh-btn');

    // 始终显示刷新按钮
    refreshBtn.style.display = 'inline-block';
    refreshBtn.addEventListener('click', () => {
        if (!GITHUB_TOKEN) {
            const token = prompt("检测到您是首次在新环境使用刷新功能。\n由于安全原因，GitHub Token 没有公开上传。\n\n请输入您的 GitHub Personal Access Token (以 ghp_ 开头):");
            if (token && token.trim() !== "") {
                GITHUB_TOKEN = token.trim();
                localStorage.setItem('GITHUB_TOKEN', GITHUB_TOKEN);
            } else {
                alert("未输入 Token，无法触发远程刷新。");
                return;
            }
        }

        if (!confirm('确认要触发远程服务器重新获取数据吗？执行通常需要 20-30 秒。')) return;

        refreshBtn.disabled = true;
        refreshBtn.textContent = '触发中...';

        // 记录触发前的时间
        const currentUpdateTime = dom.updateTime.textContent;

        fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${WORKFLOW_ID}/dispatches`, {
            method: 'POST',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            },
            body: JSON.stringify({
                ref: 'main' // 或 master
            })
        })
            .then(res => {
                if (res.ok) {
                    refreshBtn.textContent = '服务器运算中... 请勿关闭页面 (预计需要30秒)';

                    // 开始轮询检查更新
                    let pollCount = 0;
                    const maxPolls = 15; // 最多轮询 15 次 (大概 75 秒)

                    const pollInterval = setInterval(() => {
                        pollCount++;
                        const fetchUrl = `./data.json?t=${new Date().getTime()}`;
                        fetch(fetchUrl)
                            .then(r => r.json())
                            .then(newData => {
                                const newTimeStr = `更新时间 (北京时间): ${newData.update_time}`;
                                // 检查时间戳是否发生变化或者已经变成新的时间
                                if (newTimeStr !== currentUpdateTime && newData.update_time) {
                                    clearInterval(pollInterval);
                                    renderData(newData);
                                    refreshBtn.disabled = false;
                                    refreshBtn.textContent = '✅ 更新成功！';
                                    setTimeout(() => {
                                        refreshBtn.textContent = '强制刷新策略数据';
                                    }, 3000);
                                } else if (pollCount >= maxPolls) {
                                    clearInterval(pollInterval);
                                    refreshBtn.disabled = false;
                                    refreshBtn.textContent = '⚠️ 等待超时，您可以手动刷新页面试试';
                                    setTimeout(() => {
                                        refreshBtn.textContent = '强制刷新策略数据';
                                    }, 5000);
                                }
                            })
                            .catch(err => console.error("轮询获取JSON失败:", err));
                    }, 5000); // 每 5 秒请求一次

                } else {
                    alert(`触发失败：${res.status} ${res.statusText}`);
                    refreshBtn.disabled = false;
                    refreshBtn.textContent = '强制刷新策略数据';
                }
            })
            .catch(err => {
                alert('网络错误: ' + err);
                refreshBtn.disabled = false;
                refreshBtn.textContent = '强制刷新策略数据';
            });
    });

    // 监听 Tab 切换
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentTab = e.target.getAttribute('data-tab');
            updateLabelsForTab();
            if (cachedData) {
                renderData(cachedData);
            }
            // 自动联动并重置沙盒界面的数据
            if (typeof window.setSandboxRange === 'function') {
                window.setSandboxRange('ALL');
            }
        });
    });

    // 初始化加载
    loadData();

    // 修复移动端强制关闭 tooltip
    // 当点击非 tooltip 图标的地方时，清除页面上所有 tooltip 图标的焦点
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.tooltip-icon')) {
            document.querySelectorAll('.tooltip-icon').forEach(el => el.blur());
        }
    });

    // --- Model 4.4 历史图表 Modal 交互逻辑 ---
    const modal = document.getElementById('chartModal');
    const closeBtn = document.getElementById('closeModalBtn');
    const modalTitle = document.getElementById('modalTitle');
    let historyChartInstance = null;

    function openModalAndDrawChart(metricType) {
        if (typeof BACKTEST_DATA === 'undefined' || !BACKTEST_DATA[currentTab]) {
            alert("正在加载历史数据库，请稍后重试。");
            return;
        }

        const dataArray = BACKTEST_DATA[currentTab];
        let labels = [];
        let datasetData = [];
        let chartLabel = "";
        let color = "#3b82f6";

        if (metricType === 'bias') {
            chartLabel = "均线乖离率走势 (%)";
            color = "#f59e0b";
            labels = dataArray.map(d => d.date);
            datasetData = dataArray.map(d => d.bias * 100);
        } else if (metricType === 'vol') {
            chartLabel = "波动率走势 (市场恐慌指数)";
            color = "#ef4444";
            labels = dataArray.map(d => d.date);
            datasetData = dataArray.map(d => d.volatility);
        } else if (metricType === 'pe') {
            chartLabel = "PE 估值投资吸引力 (1 - 历史百分位)";
            color = "#10b981";
            labels = dataArray.map(d => d.date);
            // 将 PE百分位转换为直观的 (1 - 蛋卷原始百分位)
            // 数值越高，代表(1-pe)*100 越大，越便宜。
            datasetData = dataArray.map(d => (1.0 - d.pe_percentile) * 100);
        }

        modalTitle.textContent = `${currentTab} ${chartLabel}`;
        modal.classList.add('show');

        const ctx = document.getElementById('historyChart').getContext('2d');
        if (historyChartInstance) {
            historyChartInstance.destroy();
        }

        historyChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: chartLabel,
                    data: datasetData,
                    borderColor: color,
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    fill: {
                        target: 'origin',
                        above: color + '20' // 20% 透明度背景
                    },
                    tension: 0.2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index',
                },
                scales: {
                    x: {
                        grid: { display: false, color: "rgba(255,255,255,0.05)" },
                        ticks: { color: "#94a3b8", maxTicksLimit: 12 }
                    },
                    y: {
                        grid: { color: "rgba(255,255,255,0.05)" },
                        ticks: { color: "#94a3b8" }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                return context.parsed.y.toFixed(2);
                            }
                        }
                    }
                }
            }
        });
    }

    // 绑定点击事件到三个卡片
    const cardBias = document.getElementById('card-bias');
    const cardVol = document.getElementById('card-vol');
    const cardPe = document.getElementById('card-pe');

    if (cardBias) cardBias.addEventListener('click', () => openModalAndDrawChart('bias'));
    if (cardVol) cardVol.addEventListener('click', () => openModalAndDrawChart('vol'));
    if (cardPe) cardPe.addEventListener('click', () => openModalAndDrawChart('pe'));

    // 关闭 Modal
    if (closeBtn) {
        closeBtn.addEventListener('click', () => modal.classList.remove('show'));
    }
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('show');
        }
    });

});
