import requests

API_KEY = "56aa9dbe43a9e6d710ac47b79733815f59dca92c911790cbe6ca6f7113eb4959"

url = "https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02"

params = {
    "serviceKey": API_KEY,
    "type": "json",
    "FOOD_NM_KR": "김치볶음밥"
}

response = requests.get(url, params=params)

print(response.text)