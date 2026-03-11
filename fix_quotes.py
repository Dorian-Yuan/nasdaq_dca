with open('sandbox.js', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace("\\'", "'")

with open('sandbox.js', 'w', encoding='utf-8') as f:
    f.write(text)
