import re

with open('web/js/strategy_models.js', 'r', encoding='utf-8') as f:
    content = f.read()

# match lines like: "return_5y": 38.3632165509057,
content = re.sub(r'\s*"return_5y":\s*[-0-9\.]+,\n', '\n', content)

with open('web/js/strategy_models.js', 'w', encoding='utf-8') as f:
    f.write(content)
