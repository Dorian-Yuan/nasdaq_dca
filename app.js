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
        dom.updateTime.textContent = `更新时间: ${data.update_time}`;

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
                console.error('获取数据失败:', error);
                dom.updateTime.textContent = '数据加载失败，请检查网络或是否已生成 JSON';
                dom.decisionText.textContent = '获取失败';
                resetLights();
                dom.lightRed.classList.add('active-red');
            });
    }

    // 自动刷新逻辑 (GitHub Webhook 触发)
    // 这里的配置从本地的 config.js 读取 (避免上传到公开仓库)
    let GITHUB_TOKEN = '';
    let REPO_OWNER = '';
    let REPO_NAME = '';

    if (typeof window.CONFIG !== 'undefined') {
        GITHUB_TOKEN = window.CONFIG.GITHUB_TOKEN || '';
        REPO_OWNER = window.CONFIG.GITHUB_USERNAME || '';
        REPO_NAME = window.CONFIG.GITHUB_REPO_NAME || '';
    }

    const WORKFLOW_ID = 'daily_update.yml'; // 与 workflows 目录下的文件名一致

    const refreshBtn = document.getElementById('refresh-btn');
    if (GITHUB_TOKEN && REPO_OWNER && REPO_NAME) {
        refreshBtn.style.display = 'inline-block';
        refreshBtn.addEventListener('click', () => {
            if (!confirm('确认要触发远程服务器重新获取数据吗？执行通常需要 10-20 秒。')) return;

            refreshBtn.disabled = true;
            refreshBtn.textContent = '触发中...';

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
                        alert('触发成功！请等待约 30 秒后刷新本页面查看最新数据。');
                    } else {
                        alert(`触发失败：${res.status} ${res.statusText}`);
                    }
                })
                .catch(err => alert('网络错误: ' + err))
                .finally(() => {
                    refreshBtn.disabled = false;
                    refreshBtn.textContent = '强制刷新策略数据 (调用 GitHub Actions)';
                });
        });
    }

    // 初始化加载
    loadData();
});
