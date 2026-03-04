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
        reasonsList: document.getElementById('reasons-list'),
        valBias: document.getElementById('val-bias'),
        valPrice: document.getElementById('val-price'),
        valPePct: document.getElementById('val-pe-pct'),
        valPe: document.getElementById('val-pe'),
        valFgScore: document.getElementById('val-fg-score'),
        valFgRating: document.getElementById('val-fg-rating')
    };

    // 重置指示灯状态
    function resetLights() {
        dom.lightRed.className = 'light';
        dom.lightYellow.className = 'light';
        dom.lightGreen.className = 'light';
        dom.decisionText.className = '';
    }

    // 渲染 UI 数据
    function renderData(data) {
        dom.updateTime.textContent = `更新时间 (北京时间): ${data.update_time}`;

        resetLights();

        // 设置主策略红绿灯
        if (data.decision === "暂停定投") {
            dom.lightRed.classList.add('active-red');
            dom.decisionText.textContent = "🔴 暂停买入";
            dom.decisionText.classList.add('decision-red');
        } else if (data.decision === "加倍定投") {
            dom.lightGreen.classList.add('active-green');
            dom.decisionText.textContent = "🟢 加倍定投";
            dom.decisionText.classList.add('decision-green');
        } else {
            dom.lightYellow.classList.add('active-yellow');
            dom.decisionText.textContent = "🟡 普通定投";
            dom.decisionText.classList.add('decision-yellow');
        }

        // 渲染理由标签
        dom.reasonsList.innerHTML = '';
        data.reasons.forEach(reason => {
            const span = document.createElement('span');
            span.className = 'reason-tag';
            span.textContent = reason;
            dom.reasonsList.appendChild(span);
        });

        // 渲染详细指标数据 (处理可能为空的情况)
        if (data.metrics) {
            const m = data.metrics;
            const ind = data.individual_decisions || {};

            dom.valBias.textContent = m.bias_percent !== null ? `${m.bias_percent}%` : '--%';
            dom.valPrice.textContent = m.qqq_price !== null ? `$${m.qqq_price}` : '--';
            document.getElementById('decision-bias').textContent = ind.bias_decision || '--';
            document.getElementById('decision-bias').className = `metric-decision ${ind.bias_decision === '加倍定投' ? 'text-green' : ind.bias_decision === '暂停定投' ? 'text-red' : 'text-yellow'}`;

            dom.valPePct.textContent = m.pe_percentile !== null ? `${(m.pe_percentile * 100).toFixed(1)}%` : '--%';
            dom.valPe.textContent = m.pe !== null ? m.pe : '--';
            document.getElementById('decision-pe').textContent = ind.pe_decision || '--';
            document.getElementById('decision-pe').className = `metric-decision ${ind.pe_decision === '加倍定投' ? 'text-green' : ind.pe_decision === '暂停定投' ? 'text-red' : 'text-yellow'}`;


            dom.valFgScore.textContent = m.fear_greed_score !== null ? m.fear_greed_score : '--';
            dom.valFgRating.textContent = m.fear_greed_rating !== null ? m.fear_greed_rating : '--';
            document.getElementById('decision-fg').textContent = ind.fg_decision || '--';
            document.getElementById('decision-fg').className = `metric-decision ${ind.fg_decision === '加倍定投' ? 'text-green' : ind.fg_decision === '暂停定投' ? 'text-red' : 'text-yellow'}`;
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
                dom.reasonsList.innerHTML = `<li style="color:var(--color-red);">错误详情: ${error.message}</li>`;

                // 将所有指标设置为错误状态
                const errText = '错误';
                dom.valBias.textContent = errText;
                dom.valPrice.textContent = '--';
                document.getElementById('decision-bias').textContent = '--';

                dom.valPePct.textContent = errText;
                dom.valPe.textContent = '--';
                document.getElementById('decision-pe').textContent = '--';

                dom.valFgScore.textContent = errText;
                dom.valFgRating.textContent = '--';
                document.getElementById('decision-fg').textContent = '--';
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

    // 初始化加载
    loadData();
});
