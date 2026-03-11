import re

with open('app.js', 'r', encoding='utf-8') as f:
    app_js = f.read()

# 1. Update app.js logic to read from inputs
logic_replacement = """        // 设置主策略红绿灯及权重得分显示
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
        } else {"""

app_js = re.sub(
    r'        // 设置主策略红绿灯及权重得分显示.*?\} else \{',
    logic_replacement,
    app_js,
    flags=re.DOTALL
)

# 2. Add refreshDashboardWithNewThresholds function
refresh_fn = """
window.refreshDashboardWithNewThresholds = function() {
    if (cachedData) {
        renderData(cachedData);
        if(window.showToast) window.showToast('阈值已更新并重绘页面', 'success');
    }
};
"""

app_js += "\n" + refresh_fn

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(app_js)
