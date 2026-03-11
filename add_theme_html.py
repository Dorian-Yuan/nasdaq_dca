import re

with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Add theme switch to HTML
theme_html = """
            <div class="settings-group">
                <div class="settings-group-title">显示设置</div>
                <div class="settings-item">
                    <label for="setting-theme">外观模式</label>
                    <select id="setting-theme" class="setting-input" onchange="changeTheme()">
                        <option value="system">跟随系统</option>
                        <option value="light">浅色模式</option>
                        <option value="dark">深色模式</option>
                    </select>
                </div>
            </div>
"""
html = html.replace('<div class="settings-group">\n                <div class="settings-group-title">高级配置</div>', theme_html + '            <div class="settings-group">\n                <div class="settings-group-title">高级配置</div>')

# Add version to bottom of settings
version_html = """
            <div class="settings-footer" style="text-align: center; margin-top: 30px; color: var(--text-secondary); font-size: 12px; padding-bottom: 20px;">
                <p>Version <span class="font-mono">v2.0.0</span></p>
            </div>
"""
html = html.replace('        <!-- View 3: Settings -->', '        <!-- View 3: Settings -->')
html = html.replace('</button>\n            </div>\n        </div>\n\n        <footer>', '</button>\n            </div>\n' + version_html + '        </div>\n\n        <footer>')

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)
