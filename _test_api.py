import requests

url = 'https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02'
params = {
    'serviceKey': '56aa9dbe43a9e6d710ac47b79733815f59dca92c911790cbe6ca6f7113eb4959',
    'FOOD_NM_KR': '김치볶음밥',
    'pageNo': 1,
    'numOfRows': 20,
    'type': 'json'
}
resp = requests.get(url, params=params, timeout=10)
data = resp.json()
items = data.get('body', {}).get('items', [])
print(f'Found {len(items)} items')
for item in items[:5]:
    print(f'  - {item.get("FOOD_NM_KR")} | DB_GRP: {item.get("DB_GRP_NM")} | DB_CLASS: {item.get("DB_CLASS_NM")} | kcal: {item.get("AMT_NUM1")}')
