with open('app.js', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace("\\'", "'")

with open('app.js', 'w', encoding='utf-8') as f:
    f.write(text)
