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
window.updateSandboxConfigs = function () {
    compileAndRunSandbox();
};

window.setSandboxRange = function (years) {
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

window.compileAndRunSandbox = function () {
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

    window.exportSandboxModel = async function () {
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

        const exported = {
            id: id,
            name: nameInput,
            weights: { pe: wVal, vxn: wSent, bias: wTrend },
            formula_pe: codeVal,
            formula_vxn: codeSent,
            formula_bias: codeTrend
        };

        const emitFallback = (exportedJson, activeTabId, errorMsg) => {
            const jsonStr = JSON.stringify(exportedJson, null, 4);
            const finalStr = `// 请将以下内容作为一个新的 Key-Value 对，粘贴进 strategy_models.js 的 "${activeTabId}" 下面：\n"${id}": ${jsonStr},`;
            if (navigator.clipboard) {
                navigator.clipboard.writeText(finalStr).then(() => {
                    let msg = "✅ 模型导出成功！\n量化算法代码已复制到剪贴板。\n请打开本地的 strategy_models.js 文件，将其粘贴进去即可完成固化！";
                    if (errorMsg) msg = `⚠️ 云端直连失败 (${errorMsg})，已降级为剪贴板模式。\n\n` + msg;
                    alert(msg);
                }).catch(err => {
                    alert("无法自动复制到剪贴板，请手动复制以下内容：\n\n" + finalStr);
                });
            } else {
                alert("浏览器不支持自动粘贴，请手动复制以下内容：\n\n" + finalStr);
            }
        };

        const githubToken = localStorage.getItem('GITHUB_TOKEN');
        if (!githubToken) {
            emitFallback(exported, activeTab, null);
            return;
        }

        try {
            const owner = localStorage.getItem('REPO_OWNER') || 'Dorian-Yuan';
            const repo = localStorage.getItem('REPO_NAME') || 'nasdaq_dca';
            const path = 'strategy_models.js';
            const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

            let getRes = await fetch(url, {
                headers: { 'Authorization': `token ${githubToken}`, 'Accept': 'application/vnd.github.v3+json' }
            });

            if (!getRes.ok) throw new Error("获取远程文件失败");
            let fileData = await getRes.json();

            if (!window.STRATEGY_MODELS) window.STRATEGY_MODELS = { "NDX": {}, "SP500": {} };
            if (!window.STRATEGY_MODELS[activeTab]) window.STRATEGY_MODELS[activeTab] = {};
            window.STRATEGY_MODELS[activeTab][id] = exported;

            let newFileContent = "const STRATEGY_MODELS = " + JSON.stringify(window.STRATEGY_MODELS, null, 4) + ";\n\n";
            newFileContent += "if (typeof window !== 'undefined') {\n";
            newFileContent += "    window.STRATEGY_MODELS = STRATEGY_MODELS;\n";
            newFileContent += "    \n";
            newFileContent += "    // 初始化当前激活的模型库索引\n";
            newFileContent += "    window.ACTIVE_MODELS = {\n";
            newFileContent += "        \"NDX\": \"ndx_default\",\n";
            newFileContent += "        \"SP500\": \"spy_default\"\n";
            newFileContent += "    };\n";
            newFileContent += "}\n";

            let encodedContent = btoa(unescape(encodeURIComponent(newFileContent)));

            const exportBtn = document.querySelector('button[onclick="exportSandboxModel()"]');
            const oldText = exportBtn.innerText;
            exportBtn.innerText = "云端直写中...";
            exportBtn.disabled = true;

            let putRes = await fetch(url, {
                method: "PUT",
                headers: { 'Authorization': `token ${githubToken}`, 'Accept': 'application/vnd.github.v3+json' },
                body: JSON.stringify({
                    message: `feat: Add custom strategy [${nameInput}] from Sandbox`,
                    content: encodedContent,
                    sha: fileData.sha,
                    branch: "main"
                })
            });

            exportBtn.innerText = oldText;
            exportBtn.disabled = false;

            if (!putRes.ok) throw new Error("更新远程文件失败 (可能产生了冲突)");

            alert(`🚀 模型直连云端发布成功！\n算法 [${nameInput}] 已免密固化至 Github。\n您可以在网页顶部的模型下拉框中永久调取它了。`);

            // 动态刷新下拉选单
            if (typeof window.populateModelSelector === 'function') {
                window.ACTIVE_MODELS[activeTab] = id;
                window.populateModelSelector();
            }

        } catch (e) {
            console.error(e);
            const exportBtn = document.querySelector('button[onclick="exportSandboxModel()"]');
            if (exportBtn) {
                exportBtn.innerText = "📦 导出模型";
                exportBtn.disabled = false;
            }
            emitFallback(exported, activeTab, e.message);
        }
    };
    // 3. 执行时间切片过滤
    const sdStr = document.getElementById('sandbox-start-date').value;
    const edStr = document.getElementById('sandbox-end-date').value;

    const viewData = dataTable.filter(row => {
        if (sdStr && row.date < sdStr) return false;
        if (edStr && row.date > edStr) return false;
        return true;
    });

    if (viewData.length === 0) {
        alert("该日期区间内无数据！");
        return;
    }

    // 4. 执行千万次矩阵沙盘推演
    const INV_BASE = 1000;
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

    // 6. 重绘高速 Canvas 曲线图
    renderSandboxChart(labels, naiveEquity, dynamicEquity);
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
