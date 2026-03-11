import re

# --- Update style.css ---
with open('style.css', 'r', encoding='utf-8') as f:
    css = f.read()

toast_css = """
/* --- Toast 提示系统 --- */
.toast-container {
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 10px;
    pointer-events: none;
}

.toast {
    background: var(--bg-card);
    color: var(--text-primary);
    padding: 12px 24px;
    border-radius: var(--radius-elem);
    box-shadow: var(--shadow-lg);
    font-size: 14px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;
    opacity: 0;
    transform: translateY(-20px);
    transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
    border: 1px solid var(--border-color);
}

.toast.show {
    opacity: 1;
    transform: translateY(0);
}

.toast-success { border-left: 4px solid var(--color-green); }
.toast-error { border-left: 4px solid var(--color-red); }
.toast-warning { border-left: 4px solid var(--color-yellow); }

/* --- 骨架屏动画 --- */
@keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
}

.skeleton {
    background: linear-gradient(90deg, rgba(148, 163, 184, 0.1) 25%, rgba(148, 163, 184, 0.2) 50%, rgba(148, 163, 184, 0.1) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    color: transparent !important;
    border-radius: 4px;
    pointer-events: none;
}
.skeleton * {
    visibility: hidden;
}

/* --- Spinner --- */
@keyframes spin {
    to { transform: rotate(360deg); }
}

.btn.loading, .interactive-block.loading {
    position: relative;
    pointer-events: none;
    opacity: 0.7;
    color: transparent !important;
}

.btn.loading::after, .interactive-block.loading::after {
    content: "";
    position: absolute;
    width: 18px;
    height: 18px;
    top: calc(50% - 9px);
    left: calc(50% - 9px);
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}

/* 涨跌色 */
.color-up { color: var(--color-up) !important; }
.color-down { color: var(--color-down) !important; }
"""

if "toast-container" not in css:
    with open('style.css', 'a', encoding='utf-8') as f:
        f.write(toast_css)


# --- Update index.html for Toast container ---
with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

if '<div id="toast-container"' not in html:
    html = html.replace('<body>', '<body>\n    <div id="toast-container" class="toast-container"></div>')
    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(html)


# --- Update app.js ---
with open('app.js', 'r', encoding='utf-8') as f:
    app_js = f.read()

toast_js = """
window.showToast = function(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    let icon = type === 'success' ? '✅' : type === 'error' ? '❌' : '⚠️';
    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};
"""

if "showToast" not in app_js:
    app_js = toast_js + "\n" + app_js

# Replace alert with showToast in app.js
app_js = app_js.replace('alert("⚠️ 未检测到', 'window.showToast("未检测到')
app_js = app_js.replace('alert("未配置', 'window.showToast("未配置')
app_js = app_js.replace('alert(`🎉 聚合发布成功！', 'window.showToast("🎉 聚合发布成功！", "success"); //')
app_js = app_js.replace('alert("推送云端发生网络或鉴权错误', 'window.showToast("推送云端发生网络或鉴权错误', 1)
app_js = app_js.replace('alert("未输入 Token', 'window.showToast("未输入 Token')
app_js = app_js.replace('alert(`触发失败', 'window.showToast(`触发失败')
app_js = app_js.replace("alert('网络错误", "window.showToast('网络错误")
app_js = app_js.replace('alert("正在加载历史数据库', 'window.showToast("正在加载历史数据库')

# Add Skeleton class before loadData finishes
app_js = re.sub(r'(function loadData\(\)\s*\{)', r'\1\n    document.querySelectorAll(".metric-value, #decision-text").forEach(el => el.classList.add("skeleton"));\n', app_js)
app_js = re.sub(r'(function renderData\(allData\)\s*\{)', r'\1\n    document.querySelectorAll(".skeleton").forEach(el => el.classList.remove("skeleton"));\n', app_js)


# Fix Spinner in app.js
app_js = app_js.replace(
    '''        try {
            commitBtn.innerText = "云端聚合提交中...";
            commitBtn.disabled = true;''',
    '''        try {
            const btns = document.querySelectorAll('.global-sync-btn');
            btns.forEach(b => { b.classList.add('loading'); b.disabled = true; });'''
)
app_js = app_js.replace(
    '''            commitBtn.innerText = "🚀 提交保存至 Github";
            commitBtn.disabled = false;''',
    '''            const btns = document.querySelectorAll('.global-sync-btn');
            btns.forEach(b => { b.classList.remove('loading'); b.disabled = false; });'''
)

app_js = app_js.replace(
    '''        refreshBtn.disabled = true;
        refreshBtn.textContent = '触发中...';''',
    '''        refreshBtn.disabled = true;
        refreshBtn.classList.add('loading');'''
)

app_js = app_js.replace(
    '''                                    refreshBtn.disabled = false;
                                    refreshBtn.textContent = '✅ 更新成功！';
                                    setTimeout(() => {
                                        refreshBtn.textContent = '强制刷新策略数据';
                                    }, 3000);''',
    '''                                    refreshBtn.disabled = false;
                                    refreshBtn.classList.remove('loading');
                                    window.showToast('更新成功！', 'success');'''
)

app_js = app_js.replace(
    '''                                    refreshBtn.disabled = false;
                                    refreshBtn.textContent = '⚠️ 等待超时，您可以手动刷新页面试试';
                                    setTimeout(() => {
                                        refreshBtn.textContent = '强制刷新策略数据';
                                    }, 5000);''',
    '''                                    refreshBtn.disabled = false;
                                    refreshBtn.classList.remove('loading');
                                    window.showToast('等待超时，您可以手动刷新页面试试', 'warning');'''
)

app_js = app_js.replace(
    '''                    alert(`触发失败：${res.status} ${res.statusText}`);
                    refreshBtn.disabled = false;
                    refreshBtn.textContent = '强制刷新策略数据';''',
    '''                    window.showToast(`触发失败：${res.status} ${res.statusText}`, 'error');
                    refreshBtn.disabled = false;
                    refreshBtn.classList.remove('loading');'''
)

app_js = app_js.replace(
    '''                alert('网络错误: ' + err);
                refreshBtn.disabled = false;
                refreshBtn.textContent = '强制刷新策略数据';''',
    '''                window.showToast('网络错误: ' + err, 'error');
                refreshBtn.disabled = false;
                refreshBtn.classList.remove('loading');'''
)

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(app_js)

# --- Update sandbox.js ---
with open('sandbox.js', 'r', encoding='utf-8') as f:
    sandbox_js = f.read()

# Replace hardcoded 1000
sandbox_js = sandbox_js.replace('const INV_BASE = 1000;', 'const INV_BASE = parseFloat(document.getElementById("setting-sandbox-amount")?.value) || 1000;')

# Replace alert with showToast
sandbox_js = sandbox_js.replace('alert("该日期区间内无数据！");', 'if(window.showToast) window.showToast("该日期区间内无数据！", "error"); else alert("该日期区间内无数据！");')

# Format Money/Alpha with color-up/color-down
sandbox_js = sandbox_js.replace(
    '''    const alpha = retDyn - retNaive;

    const diffInvested = totalDynInvested - totalNaiveInvested;
    const diffShares = dynShares - naiveShares;
    const profitNaive = (naiveShares * currentPrice) - totalNaiveInvested;
    const profitDyn = (dynShares * currentPrice) - totalDynInvested;
    const diffProfit = profitDyn - profitNaive;''',
    '''    const alpha = retDyn - retNaive;

    const profitNaive = (naiveShares * currentPrice) - totalNaiveInvested;
    const profitDyn = (dynShares * currentPrice) - totalDynInvested;
    const diffProfit = profitDyn - profitNaive;
    
    // UI Helpers
    const formatPct = (val) => (val > 0 ? "+" : "") + (val * 100).toFixed(2) + "%";
    const formatMoney = (val) => (val >= 0 ? "+$" : "-$") + Math.abs(val).toFixed(2);
    const applyColor = (el, val) => {
        el.classList.remove("color-up", "color-down");
        if(val > 0) el.classList.add("color-up");
        else if(val < 0) el.classList.add("color-down");
    };'''
)

sandbox_js = re.sub(
    r'''    sn\.innerText = \(retNaive \* 100\)\.toFixed\(2\) \+ '%';
    sd\.innerText = \(retDyn \* 100\)\.toFixed\(2\) \+ '%';
    sa\.innerText = \(alpha \* 100\)\.toFixed\(2\) \+ '%';
    
    document\.getElementById\('sb-stat-profit-diff'\)\.innerText = '\$' \+ diffProfit\.toFixed\(2\);
    document\.getElementById\('sb-cost-naive'\)\.innerText = '\$' \+ totalNaiveInvested\.toFixed\(2\);
    document\.getElementById\('sb-cost-dynamic'\)\.innerText = '\$' \+ totalDynInvested\.toFixed\(2\);
    document\.getElementById\('sb-profit-naive'\)\.innerText = '\$' \+ profitNaive\.toFixed\(2\);
    document\.getElementById\('sb-profit-dynamic'\)\.innerText = '\$' \+ profitDyn\.toFixed\(2\);

    sn\.className = retNaive >= 0 \? 'stat-value value-green' : 'stat-value value-red';
    sd\.className = retDyn >= 0 \? 'stat-value value-green' : 'stat-value value-red';
    sa\.className = alpha >= 0 \? 'stat-value value-green' : 'stat-value value-red';''',
    '''    sn.innerText = formatPct(retNaive);
    sd.innerText = formatPct(retDyn);
    sa.innerText = formatPct(alpha);
    
    let pd = document.getElementById('sb-stat-profit-diff');
    pd.innerText = formatMoney(diffProfit);
    document.getElementById('sb-cost-naive').innerText = "$" + totalNaiveInvested.toFixed(2);
    document.getElementById('sb-cost-dynamic').innerText = "$" + totalDynInvested.toFixed(2);
    
    let pn = document.getElementById('sb-profit-naive');
    pn.innerText = formatMoney(profitNaive);
    let pdy = document.getElementById('sb-profit-dynamic');
    pdy.innerText = formatMoney(profitDyn);

    applyColor(sn, retNaive);
    applyColor(sd, retDyn);
    applyColor(sa, alpha);
    applyColor(pd, diffProfit);
    applyColor(pn, profitNaive);
    applyColor(pdy, profitDyn);''',
    sandbox_js, flags=re.MULTILINE
)

# Replace old value-green and font-mono if missing in class assignment
sandbox_js = sandbox_js.replace("stat-value value-green", "stat-value font-mono")
sandbox_js = sandbox_js.replace("stat-value value-red", "stat-value font-mono")

# Spinner for compile sandbox
sandbox_js = sandbox_js.replace(
    'window.compileAndRunSandbox = function () {',
    '''window.compileAndRunSandbox = function () {
    const btn = document.getElementById('compile-formula-btn');
    if (btn) { btn.classList.add('loading'); btn.disabled = true; }
    setTimeout(() => {'''
)
# Close the setTimeout wrapper for compile (assuming the end of compileAndRunSandbox has `}`);
sandbox_js = re.sub(r'(\s*updateSandboxChart\(labels, naiveEquity, dynamicEquity\);\s*\})', r'\1\n        if (btn) { btn.classList.remove("loading"); btn.disabled = false; window.showToast("回测完成", "success"); }\n    }, 50);', sandbox_js)

with open('sandbox.js', 'w', encoding='utf-8') as f:
    f.write(sandbox_js)
