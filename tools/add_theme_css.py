with open('style.css', 'r', encoding='utf-8') as f:
    text = f.read()

# Make the theme overriding work
theme_css = """
/* 手动暗色模式覆盖 */
:root[data-theme="dark"] {
    --bg-main: #0f172a;
    --bg-card: #1e293b;
    --text-primary: #f8fafc;
    --text-secondary: #94a3b8;
    --border-color: #334155;
    --color-gray: #334155;
}

/* 手动浅色模式覆盖 (相当于重置回原始:root) */
:root[data-theme="light"] {
    --bg-main: #f5f7fa;
    --bg-card: #ffffff;
    --text-primary: #1e293b;
    --text-secondary: #64748b;
    --border-color: #e2e8f0;
    --color-gray: #e2e8f0;
}
"""
if 'data-theme=' not in text:
    text += '\n' + theme_css
    with open('style.css', 'w', encoding='utf-8') as f:
        f.write(text)
