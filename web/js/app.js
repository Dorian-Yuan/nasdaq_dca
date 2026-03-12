
// 立即执行以防闪烁
(function() {
    const savedTheme = localStorage.getItem('setting-theme') || 'system';
    if (savedTheme !== 'system') {
        document.documentElement.setAttribute('data-theme', savedTheme);
    }
})();


let lastToastTime = 0;
window.showToast = function(message, type = 'success') {
    // 简单的防抖：防止 1 秒内弹出重复或多个 Toast (针对 iOS change+blur 同时触发)
    const now = Date.now();
    if (type === 'success' && now - lastToastTime < 1000) return;
    if (type === 'success') lastToastTime = now;

    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

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
            document.getElementById('main-title').textContent = '纳斯达克100 (NDX)';
            document.getElementById('label-price-title').textContent = 'NDX 指数';
            document.getElementById('label-vol-title').textContent = '^VXN';
            document.getElementById('tooltip-vol').setAttribute('data-tooltip', 'CBOE 纳斯达克 100 波动率指数。\n通常15-20为常态，低于15偏向贪婪，高于30代表恐慌并开始提供可观的买入乘数。');
        } else if (currentTab === 'SP500') {
            document.getElementById('main-title').textContent = '标普500 (SP500)';
            document.getElementById('label-price-title').textContent = 'SP500 指数';
            document.getElementById('label-vol-title').textContent = '^VIX';
            document.getElementById('tooltip-vol').setAttribute('data-tooltip', 'CBOE 标普500 波动率指数。\n通常15-20为常态，低于15偏向贪婪，高于30代表恐慌并开始提供可观的买入乘数。');
        }
    }

    // 渲染 UI 数据
    function renderData(allData) {
    document.querySelectorAll(".skeleton").forEach(el => el.classList.remove("skeleton"));

        cachedData = allData;
        updateLabelsForTab();

        const tabData = allData[currentTab];
        if (!tabData || !tabData.latest) return;

        const data = tabData.latest;

        dom.updateTime.textContent = `更新时间 (北京时间): ${data.update_time}`;

        renderModelManagerList(); // Ensure dropdown is synced with tab
        resetLights();

        const finalWeight = data.individual_decisions ? data.individual_decisions.final_weight : null;

        // 核心改动：前端接管动态算力！取代 Python 后端的建议倍数。
        let dynResults = applyActiveAlgorithm(data.metrics);
        let displayWeight = dynResults ? dynResults.finalWeight : finalWeight;
        let displayInd = dynResults ? dynResults : (data.individual_decisions || {});

        // 设置主策略红绿灯及权重得分显示
        if (displayWeight !== null) {
            const threshRed = parseFloat(document.getElementById('setting-threshold-red')?.value) || 0.4;
            const threshGreen = parseFloat(document.getElementById('setting-threshold-green')?.value) || 0.7;

            if (displayWeight <= threshRed) {
                dom.lightRed.classList.add('active-red');
                dom.decisionText.textContent = `🔴 综合权重得分: ${displayWeight.toFixed(2)} 倍`;
                dom.decisionText.classList.add('decision-red');
            } else if (displayWeight > threshGreen) {
                dom.lightGreen.classList.add('active-green');
                dom.decisionText.textContent = `🟢 综合权重得分: ${displayWeight.toFixed(2)} 倍`;
                dom.decisionText.classList.add('decision-green');
            } else {
                dom.lightYellow.classList.add('active-yellow');
                dom.decisionText.textContent = `🟡 综合权重得分: ${displayWeight.toFixed(2)} 倍`;
                dom.decisionText.classList.add('decision-yellow');
            }
        } else {
            // 兼容防错
            dom.decisionText.textContent = data.decision;
        }

        // 渲染详细指标数据 (处理可能为空的情况)
        if (data.metrics) {
            const m = data.metrics;

            dom.valBias.textContent = m.bias_percent !== null ? `${m.bias_percent}%` : '--%';
            dom.valPrice.textContent = m.price !== null ? m.price.toLocaleString() : '--';
            document.getElementById('decision-bias').textContent = displayInd.bias_decision || '--';

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
            document.getElementById('decision-pe').textContent = displayInd.pe_decision || '--';

            dom.valVxn.textContent = m.volatility !== null ? m.volatility : '--';
            document.getElementById('decision-vxn').textContent = displayInd.vol_decision || '--';

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

            document.getElementById('decision-vxn').className = `metric-decision ${getDecisionClass(displayInd.vol_decision)}`;
        }

        // 建议买入金额渲染逻辑 v2.3.2
        const suggestedAmountEl = document.getElementById('suggested-amount');
        if (suggestedAmountEl && displayWeight !== null) {
            // 优先读取标准化后的键名，兼容旧键名
            const realBaseStr = localStorage.getItem('setting-real-amount') || localStorage.getItem('REAL_AMOUNT');
            const realBase = parseFloat(realBaseStr);
            
            if (!isNaN(realBase) && realBase > 0) {
                const finalAmount = Math.round(realBase * displayWeight);
                suggestedAmountEl.textContent = finalAmount.toLocaleString();
            } else {
                suggestedAmountEl.textContent = '--';
            }
        }
    }

    // 前端 JS 模型管理器逻辑
    window.toggleModelManager = function () {
        const panel = document.getElementById('model-manager-panel');
        const icon = document.getElementById('model-manager-icon');
        if (panel.style.display === 'none') {
            panel.style.display = 'block';
            if (icon) icon.style.transform = 'rotate(180deg)';
            renderModelManagerList();
        } else {
            panel.style.display = 'none';
            if (icon) icon.style.transform = 'rotate(0deg)';
        }
    }

    window.renderModelManagerList = function () {
        const container = document.getElementById('model-list-container');
        if (!container) return;
        container.innerHTML = '';

        if (window.STRATEGY_MODELS && window.STRATEGY_MODELS[currentTab]) {
            const models = window.STRATEGY_MODELS[currentTab];
            const activeId = window.ACTIVE_MODELS && window.ACTIVE_MODELS[currentTab];

            // 刷新主控制台面板显示的名字
            const topLabel = document.getElementById('active-model-name-display');
            if (topLabel && activeId && models[activeId]) {
                topLabel.textContent = models[activeId].name;
            }

            for (const modelId in models) {
                const model = models[modelId];
                if (model.deleted) continue;

                const isDefault = (modelId === 'ndx_default' || modelId === 'spy_default');
                const isActive = (modelId === activeId);

                const return5yText = model.return_5y !== undefined ?
                    `<span style="margin-left:8px; color:${model.return_5y >= 0 ? 'var(--color-green)' : 'var(--color-red)'}">5年预估: ${model.return_5y >= 0 ? '+' : ''}${(model.return_5y).toFixed(1)}%</span>`
                    : '';
                const dateText = model.timestamp ? new Date(model.timestamp).toLocaleDateString() : '预设模型';

                const itemDiv = document.createElement('div');
                itemDiv.className = `model-item ${isActive ? 'active-item' : ''}`;

                itemDiv.innerHTML = `
                    <div class="model-item-header">
                        <input type="text" class="model-item-title" 
                            id="input-name-${modelId}" 
                            value="${model.name}" 
                            onchange="renameModelLocal('${modelId}', this.value)">
                        <div class="model-item-actions">
                            ${!isActive ? `<button class="icon-btn" onclick="activateModelLocal('${modelId}')" title="启用">⚪️</button>` : `<button class="icon-btn" style="color:var(--color-green);border-color:var(--color-green)" disabled title="当前活跃">✅</button>`}
                            <button class="icon-btn" onclick="deleteModelLocal('${modelId}')" title="删除草稿">❌</button>
                        </div>
                    </div>
                    <div class="model-item-meta">
                        <span>🕒 ${dateText}${return5yText}</span>
                        ${modelId.startsWith('custom_') ? '<span style="color:var(--color-yellow)">[自建草稿]</span>' : '<span>[官方精调]</span>'}
                    </div>
                `;
                container.appendChild(itemDiv);
            }
        }
    };
    
    // Initialize immediately to show the correct active model name before data fetch completes
    window.renderModelManagerList();

    window.activateModelLocal = function (id) {
        if (window.ACTIVE_MODELS && window.STRATEGY_MODELS[currentTab][id]) {
            window.ACTIVE_MODELS[currentTab] = id;
            renderModelManagerList();
            if (cachedData) {
                renderData(cachedData);
                if (typeof window.loadSandboxFormulas === 'function') {
                    window.loadSandboxFormulas();
                    window.compileAndRunSandbox();
                }
            }
        }
    };

    window.renameModelLocal = function (id, newName) {
        if (window.STRATEGY_MODELS[currentTab][id]) {
            window.STRATEGY_MODELS[currentTab][id].name = newName || "未命名策略";
            renderModelManagerList();
        }
    };

    window.deleteModelLocal = function (id) {
        if (confirm("确定要在草稿池中标记删除此模型吗？（需点击底部提交才会同步到云端）")) {
            if (window.STRATEGY_MODELS[currentTab][id]) {
                window.STRATEGY_MODELS[currentTab][id].deleted = true;

                if (window.ACTIVE_MODELS[currentTab] === id) {
                    const fallback = currentTab === 'NDX' ? 'ndx_default' : 'spy_default';
                    window.activateModelLocal(fallback);
                } else {
                    renderModelManagerList();
                }
            }
        }
    };

    window.commitModelsToCloud = async function () {
        const githubToken = localStorage.getItem('GITHUB_TOKEN');
        const commitBtn = document.getElementById('commit-strats-btn');

        // 生成纯净的清理版对象
        const cleanModels = JSON.parse(JSON.stringify(window.STRATEGY_MODELS));
        for (const tab in cleanModels) {
            for (const id in cleanModels[tab]) {
                if (cleanModels[tab][id].deleted) {
                    delete cleanModels[tab][id];
                }
            }
        }

        let newFileContent = "/**\n * 该文件由 NASDAQ PWA 聚合生成，包含活跃模型及其公式权重。\n * 供 GitHub Actions 及本地加载使用。\n */\n\n";
        
        const realAmount = localStorage.getItem('setting-real-amount') || '0';
        const sandboxAmount = localStorage.getItem('setting-sandbox-amount') || '1000000';
        const tRed = localStorage.getItem('setting-threshold-red') || '0.4';
        const tGreen = localStorage.getItem('setting-threshold-green') || '0.7';

        newFileContent += `window.GLOBAL_CONFIG = {\n`;
        newFileContent += `    threshold_red: ${parseFloat(tRed)},\n`;
        newFileContent += `    threshold_green: ${parseFloat(tGreen)},\n`;
        newFileContent += `    real_amount: ${parseFloat(realAmount)},\n`;
        newFileContent += `    sandbox_amount: ${parseFloat(sandboxAmount)}\n`;
        newFileContent += `};\n\n`;
        newFileContent += "const STRATEGY_MODELS = " + JSON.stringify(cleanModels, null, 4) + ";\n\n";
        newFileContent += "if (typeof window !== 'undefined') {\n";
        newFileContent += "    window.STRATEGY_MODELS = STRATEGY_MODELS;\n";
        newFileContent += "    \n";
        newFileContent += "    // 初始化当前激活的模型库索引\n";
        newFileContent += "    window.ACTIVE_MODELS = " + JSON.stringify(window.ACTIVE_MODELS, null, 4) + ";\n";
        newFileContent += "}\n";

        if (!githubToken) {
            if (navigator.clipboard) {
                navigator.clipboard.writeText(newFileContent).then(() => {
                    window.showToast("未检测到 GitHub Token\n已将变动复制至剪贴板", "warning");
                }).catch(err => alert("请手动复制更新后的底层代码！"));
            } else {
                window.showToast("未检测到 GitHub Token\n浏览器不支持自动复制", "error");
            }
            return;
        }

        try {
            let btns = document.querySelectorAll('.global-sync-btn');
            btns.forEach(b => { b.classList.add('loading'); b.disabled = true; });

            const owner = localStorage.getItem('setting-repo-owner') || 'Dorian-Yuan';
            const repo = localStorage.getItem('setting-repo-name') || 'nasdaq_dca';
            // 修复：默认路径应为 web/js/strategy_models.js，因为文件已移位
            const path = localStorage.getItem('setting-repo-path') || 'web/js/strategy_models.js';
            const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

            let getRes = await fetch(url, {
                headers: { 'Authorization': `token ${githubToken}`, 'Accept': 'application/vnd.github.v3+json' }
            });

            if (!getRes.ok) {
                const errorData = await getRes.json().catch(() => ({}));
                console.error("Github GET failure:", getRes.status, errorData);
                throw new Error(`获取远程文件失败 (${getRes.status}): ${errorData.message || '网络或权限问题'}`);
            }
            let fileData = await getRes.json();

            let encodedContent = btoa(unescape(encodeURIComponent(newFileContent)));

            let putRes = await fetch(url, {
                method: "PUT",
                headers: { 'Authorization': `token ${githubToken}`, 'Accept': 'application/vnd.github.v3+json' },
                body: JSON.stringify({
                    message: `feat: Commit Strategy Drafts from Model Manager`,
                    content: encodedContent,
                    sha: fileData.sha,
                    branch: "main"
                })
            });

            btns = document.querySelectorAll('.global-sync-btn');
            btns.forEach(b => { b.classList.remove('loading'); b.disabled = false; });

            if (!putRes.ok) {
                const errorData = await putRes.json().catch(() => ({}));
                console.error("Github PUT failure:", putRes.status, errorData);
                throw new Error(`更新远程文件失败 (${putRes.status}): ${errorData.message || '权限/冲突/Token无效'}`);
            }

            window.STRATEGY_MODELS = cleanModels;
            renderModelManagerList();
            window.showToast("🎉 聚合发布成功！", "success"); //\n所有的策略增删改草稿已于 1 秒内整体覆盖并固化至 Github。`);
        } catch (e) {
            console.error(e);
            const btns = document.querySelectorAll('.global-sync-btn');
            btns.forEach(b => { b.classList.remove('loading'); b.disabled = false; });
            window.showToast("推送云端发生网络或鉴权错误：" + e.message);
        }
    };

    function applyActiveAlgorithm(m) {
        if (!m || !window.STRATEGY_MODELS || !window.ACTIVE_MODELS) return null;
        const activeModelId = window.ACTIVE_MODELS[currentTab];
        const model = window.STRATEGY_MODELS[currentTab][activeModelId];
        if (!model) return null;

        try {
            const peFn = new Function('x', model.formula_pe);
            const vxnFn = new Function('x', model.formula_vxn);
            const biasFn = new Function('x', model.formula_bias);

            const bias_raw = m.bias_percent !== null ? m.bias_percent / 100.0 : 0;
            const pe_pct = m.pe_percentile !== null ? m.pe_percentile : 0.5;
            const vol = m.volatility !== null ? m.volatility : 20;

            let peScore = peFn(pe_pct);
            let vxnScore = vxnFn(vol);
            let biasScore = biasFn(bias_raw);

            let finalWeight = (peScore * model.weights.pe) + (vxnScore * model.weights.vxn) + (biasScore * model.weights.bias);
            finalWeight = Math.max(0.0, Math.min(3.0, finalWeight)); // 兜底

            return {
                finalWeight: finalWeight,
                pe_decision: peScore.toFixed(2) + 'x',
                vol_decision: vxnScore.toFixed(2) + 'x',
                bias_decision: biasScore.toFixed(2) + 'x'
            };
        } catch (e) {
            console.error("动态算法解析失败!", e);
            return null;
        }
    }

    // 获取数据的方法。加个随机数防止浏览器缓存 data.json
    function loadData() {
    document.querySelectorAll(".metric-value, #decision-text").forEach(el => el.classList.add("skeleton"));

        const fetchUrl = `./data/data.json?t=${new Date().getTime()}`;
        fetch(fetchUrl)
            .then(response => {
                if (!response.ok) {
                    throw new Error('网络响应失败');
                }
                return response.json();
            })
            .then(data => {
                renderData(data);
                if (typeof window.loadSandboxFormulas === 'function') {
                    window.loadSandboxFormulas();
                }
                if (typeof window.compileAndRunSandbox === 'function') window.compileAndRunSandbox(false);
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
    
    // 版本更新按钮逻辑 (针对 iOS PWA 优化)
    const versionUpdateBtn = document.getElementById('version-update-btn');
    if (versionUpdateBtn) {
        versionUpdateBtn.addEventListener('click', async () => {
            window.showToast("正在强制清除缓存并更新系统...", "loading");
            
            try {
                // 1. 清除 Service Worker
                if ('serviceWorker' in navigator) {
                    const registrations = await navigator.serviceWorker.getRegistrations();
                    for (let registration of registrations) {
                        await registration.unregister();
                    }
                }
                
                // 2. 清除 Cache Storage
                if ('caches' in window) {
                    const keys = await caches.keys();
                    for (let key of keys) {
                        await caches.delete(key);
                    }
                }
                
                // 3. 清除特定本地缓存 (如有)
                localStorage.removeItem('APP_VERSION');
                
                window.showToast("更新准备就绪，刷新中...", "success");
                
                // 给 Toast 一点显示时间
                setTimeout(() => {
                    // 使用更加暴力的方式刷新，附带时间戳确保绕过所有缓存
                    const url = new URL(window.location.href);
                    url.searchParams.set('reload_time', Date.now());
                    window.location.replace(url.toString());
                }, 1000);
            } catch (err) {
                console.error("Update failed:", err);
                window.location.reload(true);
            }
        });
    }

    refreshBtn.addEventListener('click', () => {
        if (!GITHUB_TOKEN) {
            window.showToast("未检测到 GitHub Token，请在设置中填写。", "warning");
            return;
        }

        if (!confirm('确认要触发远程服务器重新获取数据吗？执行通常需要 20-30 秒。')) return;

        refreshBtn.disabled = true;
        refreshBtn.classList.add('loading');

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
                                    refreshBtn.classList.remove('loading');
                                    window.showToast('更新成功！', 'success');
                                } else if (pollCount >= maxPolls) {
                                    clearInterval(pollInterval);
                                    refreshBtn.disabled = false;
                                    refreshBtn.classList.remove('loading');
                                    window.showToast('等待超时，您可以手动刷新页面试试', 'warning');
                                }
                            })
                            .catch(err => console.error("轮询获取JSON失败:", err));
                    }, 5000); // 每 5 秒请求一次

                } else {
                    window.showToast(`触发失败：${res.status} ${res.statusText}`);
                    refreshBtn.disabled = false;
                    refreshBtn.textContent = '强制刷新策略数据';
                }
            })
            .catch(err => {
                window.showToast('网络错误: ' + err);
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
                if (typeof window.loadSandboxFormulas === 'function') {
                    window.loadSandboxFormulas();
                }
            }
            // 自动联动并重置沙盒界面的数据
            if (typeof window.setSandboxRange === 'function') {
                window.setSandboxRange('ALL', true, false);
            }
        });
    });

    // 初始化加载
    
    // 路由切换逻辑
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetView = e.currentTarget.getAttribute('data-view');
            
            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            
            document.querySelectorAll('.view-section').forEach(v => {
                v.classList.remove('active');
                v.style.display = 'none';
            });
            const targetElement = document.getElementById(targetView);
            if (targetElement) {
                targetElement.classList.add('active');
                targetElement.style.display = 'block';
            }
            if (targetView === 'view-dashboard') {
                document.body.classList.add('no-scroll');
            } else {
                document.body.classList.remove('no-scroll');
            }
            
            if (targetView === 'view-sandbox' && typeof window.compileAndRunSandbox === 'function') {
                window.compileAndRunSandbox(false);
            }
            
            // Re-render chart if switching to sandbox
            
        });
    });

    if (document.getElementById('view-dashboard').classList.contains('active')) {
        document.body.classList.add('no-scroll');
    }
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
            window.showToast("正在加载历史数据库，请稍后重试。");
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
            chartLabel = "PE估值历史百分位";
            color = "#10b981";
            labels = dataArray.map(d => d.date);
            // 将 PE百分位转换为直观的 (1 - 蛋卷原始百分位)
            // 数值越高，代表(1-pe)*100 越大，越便宜。
            datasetData = dataArray.map(d => d.pe_percentile * 100);
        } else if (metricType === 'price') {
            chartLabel = "价格走势";
            color = "#8b5cf6"; // 紫色系
            labels = dataArray.map(d => d.date);
            datasetData = dataArray.map(d => d.price);
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
                        grid: { 
                            color: "rgba(148, 163, 184, 0.2)", 
                            borderDash: [5, 5],
                            drawTicks: false
                        },
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
    const cardReturn = document.getElementById('card-return');

    if (cardBias) cardBias.addEventListener('click', (e) => { if (e.target.closest('.tooltip-icon')) return; openModalAndDrawChart('bias'); });
    if (cardVol) cardVol.addEventListener('click', (e) => { if (e.target.closest('.tooltip-icon')) return; openModalAndDrawChart('vol'); });
    if (cardPe) cardPe.addEventListener('click', (e) => { if (e.target.closest('.tooltip-icon')) return; openModalAndDrawChart('pe'); });
    if (cardReturn) cardReturn.addEventListener('click', (e) => { if (e.target.closest('.tooltip-icon')) return; openModalAndDrawChart('price'); });

    // 关闭 Modal
    if (closeBtn) {
        closeBtn.addEventListener('click', () => modal.classList.remove('show'));
    }
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('show');
        }
    });

    // 仪表盘刷新逻辑 (被设置项调用) - 修复作用域：放在 DOMContentLoaded 内部以访问 renderData
    window.refreshDashboardWithNewThresholds = function() {
        const r = localStorage.getItem('setting-threshold-red');
        const g = localStorage.getItem('setting-threshold-green');
        console.log("Refreshing dashboard with thresholds (scoped):", r, g);
        if (cachedData) {
            renderData(cachedData);
        }
    };
});



function applyTheme(theme) {
    if (theme === 'system' || !theme) {
        document.documentElement.removeAttribute('data-theme');
    } else {
        document.documentElement.setAttribute('data-theme', theme);
    }
}

// 页面加载时恢复主题与设置
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
});

window.saveSettings = function() {
    const settingIds = [
        'setting-real-amount', 'setting-sandbox-amount', 
        'setting-threshold-red', 'setting-threshold-green', 
        'setting-github-token', 'setting-theme',
        'setting-repo-owner', 'setting-repo-name', 'setting-repo-path'
    ];
    
    const settings = {};
    settingIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) settings[id] = el.value;
    });
    
    console.log("Saving settings to localStorage:", settings);
    for (const key in settings) {
        localStorage.setItem(key, settings[key]);
    }
    
    // 同步更新 UI
    applyTheme(settings['setting-theme']);
    window.refreshDashboardWithNewThresholds();
    
    if (window.showToast) {
        window.showToast('设置已保存', 'success');
    } else {
        alert('设置已保存');
    }
};

window.loadSettings = function() {
    const settingIds = [
        'setting-real-amount', 'setting-sandbox-amount', 
        'setting-threshold-red', 'setting-threshold-green', 
        'setting-github-token', 'setting-theme',
        'setting-repo-owner', 'setting-repo-name', 'setting-repo-path'
    ];
    
    // 1. 先加载本地数据 (ID 为主)
    settingIds.forEach(id => {
        let saved = localStorage.getItem(id);
        
        // 兼容旧版全大写键名 (如果是第一次启动新版本)
        if (saved === null) {
            const oldKey = id.replace('setting-', '').toUpperCase().replace('-', '_');
            saved = localStorage.getItem(oldKey);
            if (saved !== null) {
                localStorage.setItem(id, saved); // 迁移到新格式
            }
        }

        if (saved !== null) {
            const el = document.getElementById(id);
            if (el) el.value = saved;
        }
    });

    // 2. 云端配置优先 (GLOBAL_CONFIG)
    if (window.GLOBAL_CONFIG) {
        console.log("Cloud Config detected, Merging...", window.GLOBAL_CONFIG);
        const cloudMapping = {
            'threshold_red': 'setting-threshold-red',
            'threshold_green': 'setting-threshold-green',
            'real_amount': 'setting-real-amount',
            'sandbox_amount': 'setting-sandbox-amount'
        };

        for (const [cfgKey, id] of Object.entries(cloudMapping)) {
            const val = window.GLOBAL_CONFIG[cfgKey];
            if (val !== undefined && val !== null) {
                // Only overwrite if not already set in localStorage
                if (localStorage.getItem(id) === null) {
                    localStorage.setItem(id, val);
                    const el = document.getElementById(id);
                    if (el) el.value = val;
                }
            }
        }
    }
    
    applyTheme(localStorage.getItem('setting-theme') || 'system');
};

// 为所有设置项绑定自动保存和即时预览
document.addEventListener('DOMContentLoaded', () => {
    const settingIds = [
        'setting-real-amount', 'setting-sandbox-amount', 
        'setting-threshold-red', 'setting-threshold-green', 
        'setting-github-token', 'setting-theme',
        'setting-repo-owner', 'setting-repo-name', 'setting-repo-path'
    ];
    
    settingIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        
        // 任何改变都会触发保存（带 Toast）
        el.addEventListener('change', () => {
            console.log(`Setting changed (change): ${id}`);
            window.saveSettings();
        });

        // iOS PWA 优化：显式失焦触发保存
        el.addEventListener('blur', () => {
            // 避免与 change 重复触发导致双重 Toast，采用简单防抖或检查值变化
            console.log(`Setting blurred: ${id}`);
            window.saveSettings();
        });
        
        // 阈值修改支持即时预览（不带 Toast）
        if (id.includes('threshold')) {
            el.addEventListener('input', () => {
                // 实时更新临时值以便预览生效
                const val = el.value;
                const storageKey = id.replace('setting-', '').toUpperCase().replace('-', '_');
                localStorage.setItem(storageKey, val);
                window.refreshDashboardWithNewThresholds();
            });
        }
        
        // 主题修改支持即时预览
        if (id === 'setting-theme') {
            el.addEventListener('input', () => {
                applyTheme(el.value);
            });
        }
    });
});
