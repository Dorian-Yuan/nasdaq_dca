import re

with open('style.css', 'r', encoding='utf-8') as f:
    css = f.read()

css = re.sub(r'(\.btn\s*\{[^}]*border-radius:\s*)var\(--radius-inner\)', r'\1var(--radius-elem)', css)
css = re.sub(r'(\.tab-btn\s*\{[^}]*border-radius:\s*)20px', r'\1var(--radius-card)', css)
css = css.replace('border-radius: var(--radius-inner);', 'border-radius: var(--radius-card);', 1)

with open('style.css', 'w', encoding='utf-8') as f:
    f.write(css)

with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

html = html.replace('class="metric-value"', 'class="metric-value font-mono"')
html = html.replace('class="stat-value"', 'class="stat-value font-mono"')
html = html.replace('class="stat-value small"', 'class="stat-value font-mono small"')
html = html.replace('id="val-price">', 'id="val-price" class="font-mono">')
html = html.replace('id="val-pe">', 'id="val-pe" class="font-mono">')
html = html.replace('class="factor-val"', 'class="factor-val font-mono"')

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)
