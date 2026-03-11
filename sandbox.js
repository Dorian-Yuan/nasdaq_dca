// sandbox.js
// 纳斯达克定投评估工具 - 全息回测与动态公式引擎

let sandboxChartIns = null;
let fullDataStore = []; // Store the fully filtered data array for chart rendering

window.loadSandboxFormulas = function () {
    const activeTab = document.querySelector('.tab-btn.active')?.getAttribute('data-tab') || 'NDX';
    if (!window.STRATEGY_MODELS || !window.ACTIVE_MODELS) return;

    const activeId = window.ACTIVE_MODELS[activeTab];
    const model = window.STRATEGY_MODELS[activeTab]?.[activeId];
    if (!model) return;

    // 更新权重拉杆
    document.getElementById('sb-slider-val').value = model.weights.pe;
    document.getElementById('sb-slider-sent').value = model.weights.vxn;
    document.getElementById('sb-slider-trend').value = model.weights.bias;

    // 清空现有的编辑器 DOM（强制下次展开时重新使用新模型的公式代码）
    document.getElementById('builder-val').innerHTML = '';
    document.getElementById('builder-sent').innerHTML = '';
    document.getElementById('builder-trend').innerHTML = '';
};

// 全局暴露的对象，用于绑定 UI 事件
window.updateSandboxConfigs = function () { if(typeof window.compileAndRunSandbox === 'function') setTimeout(() => window.compileAndRunSandbox(false), 50);
    compileAndRunSandbox();
};

window.setSandboxRange = function (years, autoCompile = true) {
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');

    const endInput = document.getElementById('sandbox-end-date');
    const startInput = document.getElementById('sandbox-start-date');

    // Default to latest date in data
    const activeTab = document.querySelector('.tab-btn.active').getAttribute('data-tab') || 'NDX';
    if (!BACKTEST_DATA || !BACKTEST_DATA[activeTab]) return;

    const data = BACKTEST_DATA[activeTab];
    if (data.length === 0) return;

    const latestDateStr = data[data.length - 1].date;
    endInput.value = latestDateStr;

    if (years === 'ALL') {
        startInput.value = data[0].date;
    } else {
        const endDate = new Date(latestDateStr);
        endDate.setFullYear(endDate.getFullYear() - years);
        const yyyy = endDate.getFullYear();
        const mm = String(endDate.getMonth() + 1).padStart(2, '0');
        const dd = String(endDate.getDate()).padStart(2, '0');
        startInput.value = `${yyyy}-${mm}-${dd}`;
    }
    compileAndRunSandbox();
};

window.toggleFormulaBuilder = function (factor) {
    const builder = document.getElementById(`builder-${factor}`);
    if (builder.style.display === 'none') {
        builder.style.display = 'block';
        // Initialize default formula if empty
        if (builder.children.length === 0) {
            const activeTab = document.querySelector('.tab-btn.active')?.getAttribute('data-tab') || 'NDX';
            let activeModel = null;
            if (window.STRATEGY_MODELS && window.ACTIVE_MODELS) {
                activeModel = window.STRATEGY_MODELS[activeTab]?.[window.ACTIVE_MODELS[activeTab]];
            }

            let defaultCode = "";
            let varName = "";
            if (factor === 'val') {
                varName = "PEPct";
                defaultCode = activeModel ? activeModel.formula_pe : `// x 是当天的 PE 百分位\nreturn 1.0;`;
            } else if (factor === 'sent') {
                varName = "VXN";
                defaultCode = activeModel ? activeModel.formula_vxn : `// x 是当天的 恐慌波动率\nreturn 1.0;`;
            } else if (factor === 'trend') {
                varName = "Bias";
                defaultCode = activeModel ? activeModel.formula_bias : `// x 是当天的 乖离率\nreturn 1.0;`;
            }
            builder.innerHTML = `
                <div class="formula-help">使用 JavaScript 语法返回该因子的动态倍数。提供变量 <code>x</code> 代表当天因子值 (${varName})。</div>
                <textarea class="formula-input" id="code-${factor}">${defaultCode}</textarea>
            `;
        }
    } else {
        builder.style.display = 'none';
    }
};

// 定投频率切换逻辑
window.onDcaFreqChange = function () { if(typeof window.compileAndRunSandbox === 'function') setTimeout(() => window.compileAndRunSandbox(true), 50);
    const freq = document.getElementById('dca-freq').value;
    const daySelect = document.getElementById('dca-day');
    daySelect.addEventListener('change', () => {
        if(typeof window.compileAndRunSandbox === 'function') window.compileAndRunSandbox(true);
    });
    daySelect.innerHTML = '';

    if (freq === 'daily') {
        const opt = document.createElement('option');
        opt.value = '0';
        opt.textContent = '每日';
        daySelect.appendChild(opt);
    } else if (freq === 'weekly') {
        const days = ['周一', '周二', '周三', '周四', '周五'];
        days.forEach((d, i) => {
            const opt = document.createElement('option');
            opt.value = String(i + 1);
            opt.textContent = d;
            if (i + 1 === 3) opt.selected = true; // 默认周三
            daySelect.appendChild(opt);
        });
    } else if (freq === 'monthly') {
        for (let i = 1; i <= 28; i++) {
            const opt = document.createElement('option');
            opt.value = String(i);
            opt.textContent = `每月${i}号`;
            if (i === 1) opt.selected = true;
            daySelect.appendChild(opt);
        }
    }
};

window.compileAndRunSandbox = function (showToastMsg = true) {
    const btn = document.getElementById('compile-formula-btn');
    if (btn && showToastMsg) { btn.classList.add('loading'); btn.disabled = true; }
    setTimeout(() => {
    if (typeof BACKTEST_DATA === 'undefined') {
        return; // 数据暂未加载
    }

    const activeTab = document.querySelector('.tab-btn.active').getAttribute('data-tab') || 'NDX';
    const dataTable = BACKTEST_DATA[activeTab];
    if (!dataTable || dataTable.length === 0) return;

    // 1. 读取权重
    const wVal = parseFloat(document.getElementById('sb-slider-val').value);
    const wSent = parseFloat(document.getElementById('sb-slider-sent').value);
    const wTrend = parseFloat(document.getElementById('sb-slider-trend').value);

    document.getElementById('sb-weight-val').innerText = wVal.toFixed(2);
    document.getElementById('sb-weight-sent').innerText = wSent.toFixed(2);
    document.getElementById('sb-weight-trend').innerText = wTrend.toFixed(2);

    // 2. 编译手写公式 (动态引擎核心)
    let fnVal, fnSent, fnTrend;
    try {
        const activeMod = (window.STRATEGY_MODELS && window.ACTIVE_MODELS) ? window.STRATEGY_MODELS[activeTab]?.[window.ACTIVE_MODELS[activeTab]] : null;

        const codeVal = document.getElementById('code-val') ? document.getElementById('code-val').value : (activeMod ? activeMod.formula_pe : "");
        const codeSent = document.getElementById('code-sent') ? document.getElementById('code-sent').value : (activeMod ? activeMod.formula_vxn : "");
        const codeTrend = document.getElementById('code-trend') ? document.getElementById('code-trend').value : (activeMod ? activeMod.formula_bias : "");

        fnVal = new Function("x", codeVal);
        fnSent = new Function("x", codeSent);
        fnTrend = new Function("x", codeTrend);
    } catch (e) {
        alert("语法错误，请检查公式！\n详细信息：" + e.message);
        return;
    }

    window.exportSandboxModel = function () {
        const activeTab = document.querySelector('.tab-btn.active')?.getAttribute('data-tab') || 'NDX';

        let nameInput = prompt("请输入为您将要保存的量化策略命名：\n（该模型将与选定的标签页如 NDX 绑定）", "自定义策略");
        if (nameInput === null) return; // 用户取消
        nameInput = nameInput.trim() || '自定义策略';

        const id = "custom_" + Date.now();

        let activeModel = null;
        if (window.STRATEGY_MODELS && window.ACTIVE_MODELS) {
            activeModel = window.STRATEGY_MODELS[activeTab]?.[window.ACTIVE_MODELS[activeTab]];
        }

        const codeVal = document.getElementById('code-val') ? document.getElementById('code-val').value : (activeModel ? activeModel.formula_pe : "");
        const codeSent = document.getElementById('code-sent') ? document.getElementById('code-sent').value : (activeModel ? activeModel.formula_vxn : "");
        const codeTrend = document.getElementById('code-trend') ? document.getElementById('code-trend').value : (activeModel ? activeModel.formula_bias : "");

        const wVal = parseFloat(document.getElementById('sb-slider-val').value);
        const wSent = parseFloat(document.getElementById('sb-slider-sent').value);
        const wTrend = parseFloat(document.getElementById('sb-slider-trend').value);

        // 后台静默推演近 5 年收益率
        let return5y = 0;
        try {
            const fnVal = new Function("x", codeVal);
            const fnSent = new Function("x", codeSent);
            const fnTrend = new Function("x", codeTrend);

            let silentData = window.BACKTEST_DATA[activeTab] || [];
            const fiveYearsAgo = new Date();
            fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
            silentData = silentData.filter(d => new Date(d.date) >= fiveYearsAgo);

            if (silentData.length > 0) {
                let d_shares = 0;
                let d_invested = 0;
                let n_shares = 0;
                let n_invested = 0;
                // 与可视沙盘完全一致的归一化逻辑
                let totalW = wVal + wSent + wTrend;
                if (totalW === 0) totalW = 1;
                const nwVal = wVal / totalW;
                const nwSent = wSent / totalW;
                const nwTrend = wTrend / totalW;
                const INV_BASE = parseFloat(document.getElementById("setting-sandbox-amount")?.value) || 1000;

                for (const row of silentData) {
                    let vScore = 1.0, sScore = 1.0, tScore = 1.0;
                    try { vScore = fnVal(row.pe_percentile !== null ? row.pe_percentile : 0.5); } catch (e) { }
                    try { sScore = fnSent(row.volatility !== null ? row.volatility : 20); } catch (e) { }
                    try { tScore = fnTrend(row.bias !== null ? row.bias : 0); } catch (e) { }

                    let finalWeight = (vScore * nwVal) + (sScore * nwSent) + (tScore * nwTrend);
                    finalWeight = Math.max(0.0, Math.min(3.0, finalWeight)); // 与可视引擎完全一致的兜底

                    let invest = INV_BASE * finalWeight;
                    d_invested += invest;
                    d_shares += invest / row.price;

                    // 无脑定投
                    n_invested += INV_BASE;
                    n_shares += INV_BASE / row.price;
                }

                let finalPrice = silentData[silentData.length - 1].price;

                let d_value = d_shares * finalPrice;
                let d_return = 0;
                if (d_invested > 0) d_return = (d_value - d_invested) / d_invested;

                let n_value = n_shares * finalPrice;
                let n_return = 0;
                if (n_invested > 0) n_return = (n_value - n_invested) / n_invested;

                // 返回超额收益 (Alpha)
                return5y = (d_return - n_return) * 100;
            }
        } catch (e) {
            console.error("静默5年预估失败", e);
            return5y = 0;
        }

        const exported = {
            id: id,
            name: nameInput,
            timestamp: Date.now(),
            return_5y: return5y,
            weights: { pe: wVal, vxn: wSent, bias: wTrend },
            formula_pe: codeVal,
            formula_vxn: codeSent,
            formula_bias: codeTrend
        };

        if (!window.STRATEGY_MODELS) window.STRATEGY_MODELS = { "NDX": {}, "SP500": {} };
        if (!window.STRATEGY_MODELS[activeTab]) window.STRATEGY_MODELS[activeTab] = {};
        window.STRATEGY_MODELS[activeTab][id] = exported;

        if (typeof window.renderModelManagerList === 'function') {
            window.renderModelManagerList();

            // 自动打开面板看效果
            const panel = document.getElementById('model-manager-panel');
            const icon = document.getElementById('model-manager-icon');
            if (panel && panel.style.display === 'none') {
                panel.style.display = 'block';
                if (icon) icon.style.transform = 'rotate(180deg)';
            }
        }

        alert(`✅ 模型草稿 [${nameInput}] 已添加到本地管理器！\n\n请注意：目前该策略仅保存在网页内存中，切勿刷新页面引发丢失。\n确认无误后，请点击管理器底部的“🚀 提交保存至 Github”按钮以永久固化所有设置。`);
    };
    // 3. 执行时间切片过滤
    const sdStr = document.getElementById('sandbox-start-date').value;
    const edStr = document.getElementById('sandbox-end-date').value;

    const viewDataRaw = dataTable.filter(row => {
        if (sdStr && row.date < sdStr) return false;
        if (edStr && row.date > edStr) return false;
        return true;
    });

    // 3b. 定投频率过滤
    const dcaFreq = document.getElementById('dca-freq').value;
    const dcaDay = parseInt(document.getElementById('dca-day').value);
    const viewData = viewDataRaw.filter(row => {
        const d = new Date(row.date);
        if (dcaFreq === 'weekly') {
            return d.getDay() === dcaDay; // 0=Sun, 1=Mon, ..., 5=Fri
        } else if (dcaFreq === 'monthly') {
            return d.getDate() === dcaDay;
        }
        return true; // daily: all data
    });

    if (viewData.length === 0) {
        if(window.showToast) window.showToast("该日期区间内无数据！", "error"); else alert("该日期区间内无数据！");
        return;
    }

    // 4. 执行千万次矩阵沙盘推演
    const INV_BASE = parseFloat(document.getElementById("setting-sandbox-amount")?.value) || 1000;
    let totalNaiveInvested = 0, naiveShares = 0;
    let totalDynInvested = 0, dynShares = 0;

    const labels = [];
    const naiveEquity = [];
    const dynamicEquity = [];

    // 权重归一化 (防止用户滑块加总不为1)
    let totalW = wVal + wSent + wTrend;
    if (totalW === 0) totalW = 1;
    let nwVal = wVal / totalW;
    let nwSent = wSent / totalW;
    let nwTrend = wTrend / totalW;

    for (let i = 0; i < viewData.length; i++) {
        let row = viewData[i];
        let price = row.price;

        // 无脑定投
        totalNaiveInvested += INV_BASE;
        naiveShares += INV_BASE / price;

        // 动态策略执行
        let vScore = 1.0, sScore = 1.0, tScore = 1.0;
        try { vScore = fnVal(row.pe_percentile !== null ? row.pe_percentile : 0.5); } catch (e) { }
        try { sScore = fnSent(row.volatility !== null ? row.volatility : 20); } catch (e) { }
        try { tScore = fnTrend(row.bias !== null ? row.bias : 0); } catch (e) { }

        let finalWeight = (vScore * nwVal) + (sScore * nwSent) + (tScore * nwTrend);
        finalWeight = Math.max(0.0, Math.min(3.0, finalWeight)); // 兜底与封顶保护

        let dynInvest = INV_BASE * finalWeight;
        totalDynInvested += dynInvest;
        if (dynInvest > 0) {
            dynShares += dynInvest / price;
        }

        labels.push(row.date);
        naiveEquity.push({ x: row.date, y: naiveShares * price });
        dynamicEquity.push({ x: row.date, y: dynShares * price });
    }

    // 5. 渲染终局成绩单
    const finalPrice = viewData[viewData.length - 1].price;
    const finalNaiveVal = naiveShares * finalPrice;
    const finalDynVal = dynShares * finalPrice;

    const profitNaive = finalNaiveVal - totalNaiveInvested;
    const profitDyn = finalDynVal - totalDynInvested;

    const retNaive = totalNaiveInvested > 0 ? (profitNaive / totalNaiveInvested) * 100 : 0;
    const retDyn = totalDynInvested > 0 ? (profitDyn / totalDynInvested) * 100 : 0;
    const alpha = retDyn - retNaive;

    const sn = document.getElementById('sb-stat-naive');
    sn.innerText = retNaive.toFixed(2) + '%';
    sn.className = 'stat-value ' + (retNaive >= 0 ? 'value-green' : 'value-red');

    const sd = document.getElementById('sb-stat-dynamic');
    sd.innerText = retDyn.toFixed(2) + '%';
    sd.className = 'stat-value ' + (retDyn >= 0 ? 'value-green' : 'value-red');

    const sa = document.getElementById('sb-stat-alpha');
    sa.innerText = alpha.toFixed(2) + '%';
    sa.className = 'stat-value ' + (alpha >= 0 ? 'value-green' : 'value-red');

    document.getElementById('sb-cost-naive').innerText = '$' + totalNaiveInvested.toLocaleString(undefined, { maximumFractionDigits: 0 });
    document.getElementById('sb-cost-dynamic').innerText = '$' + totalDynInvested.toLocaleString(undefined, { maximumFractionDigits: 0 });

    const formatSignedCurrency = (val) => (val >= 0 ? '+$' : '-$') + Math.abs(val).toLocaleString(undefined, { maximumFractionDigits: 0 });

    const pn = document.getElementById('sb-profit-naive');
    if (pn) {
        pn.innerText = formatSignedCurrency(profitNaive);
        pn.className = 'stat-value small ' + (profitNaive >= 0 ? 'value-green' : 'value-red');
    }

    const pd = document.getElementById('sb-profit-dynamic');
    if (pd) {
        pd.innerText = formatSignedCurrency(profitDyn);
        pd.className = 'stat-value small ' + (profitDyn >= 0 ? 'value-green' : 'value-red');
    }

    // 总收益差异 (Profit Diff)
    const profitDiff = profitDyn - profitNaive;
    const spd = document.getElementById('sb-stat-profit-diff');
    if (spd) {
        spd.innerText = formatSignedCurrency(profitDiff);
        spd.className = 'stat-value ' + (profitDiff >= 0 ? 'value-green' : 'value-red');
    }

    // 6. 重绘高速 Canvas 曲线图
    renderSandboxChart(labels, naiveEquity, dynamicEquity);
    if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
        if(window.showToast && showToastMsg) window.showToast('回测完成', 'success');
    }, 50);
};

function renderSandboxChart(labels, naiveData, dynData) {
    const ctx = document.getElementById('sandboxChart').getContext('2d');
    if (sandboxChartIns) {
        sandboxChartIns.destroy();
    }

    sandboxChartIns = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '动态公式沙盘净值',
                    data: dynData,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    pointRadius: 0,
                    pointHitRadius: 10,
                },
                {
                    label: '无脑定投对照组',
                    data: naiveData,
                    borderColor: '#94a3b8',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    fill: false,
                    pointRadius: 0,
                    pointHitRadius: 10,
                }
            ]
        },
        options: {

            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: { labels: { color: '#475569', font: { weight: 'bold' } } },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || '';
                            if (label) { label += ': '; }
                            if (context.parsed.y !== null) {
                                label += new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(context.parsed.y);
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(0,0,0,0.05)' },
                    ticks: { color: '#64748b', maxTicksLimit: 12 }
                },
                y: {
                    grid: { color: 'rgba(0,0,0,0.05)' },
                    ticks: {
                        color: '#64748b',
                        callback: function (value) { return '$' + (value / 1000) + 'k'; }
                    }
                }
            }
        }
    });
}

// 沙盘折叠逻辑
window.toggleSandboxGrid = function () {
    const grid = document.getElementById('sandbox-grid');
    const icon = document.getElementById('sandbox-toggle-icon');
    if (!grid) return;

    if (grid.style.display === 'none') {
        grid.style.display = 'flex';
        icon.style.transform = 'rotate(180deg)';
        compileAndRunSandbox(); // Render chart fully when expanded
    } else {
        grid.style.display = 'none';
        icon.style.transform = 'rotate(0deg)';
    }
};

// 首次触发引导：等待 1 秒等主循环数据组装完毕后执行
setTimeout(() => {
    const section = document.getElementById('sandbox-section');
    if (section && typeof BACKTEST_DATA !== 'undefined') {
        section.style.display = 'block'; // 显示沙盒大框架 (默认折叠内部)

        // 挂载自动适配当前选项卡的逻辑（借助 MutationObserver 监听 Tab 变化最解耦）
        const tabContainer = document.querySelector('.tabs') || document.body;

        // Setup initial dates to "All" to prep stats
        setSandboxRange('ALL');
    }
}, 1500);
