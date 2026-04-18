import json

with open("server/routes/candles.py", "r") as f:
    content = f.read()

content = content.replace('.sort("timestamp", 1)', '.sort("timestamp", -1)')
content = content.replace('candles = await cursor.to_list(length=5000)', 'candles = await cursor.to_list(length=5000)\n            candles.reverse()')

content = content.replace('"outputsize": 500,', '"outputsize": 5000,')

with open("server/routes/candles.py", "w") as f:
    f.write(content)

