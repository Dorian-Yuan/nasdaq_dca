import re
with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

settings_addition = """
            <div class="settings-group">
                <div class="settings-group-title">阈值参数 (红绿灯)</div>
                <div class="settings-item">
                    <label for="setting-threshold-red">红灯最高阈值 (≤)</label>
                    <input type="number" id="setting-threshold-red" class="setting-input font-mono" step="0.1" value="0.4" onchange="refreshDashboardWithNewThresholds()">
                </div>
                <div class="settings-item">
                    <label for="setting-threshold-green">绿灯最低阈值 (>)</label>
                    <input type="number" id="setting-threshold-green" class="setting-input font-mono" step="0.1" value="0.7" onchange="refreshDashboardWithNewThresholds()">
                </div>
            </div>
"""
html = html.replace('<div class="settings-group">\n                <div class="settings-group-title">高级配置</div>', settings_addition + '            <div class="settings-group">\n                <div class="settings-group-title">高级配置</div>')

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)
