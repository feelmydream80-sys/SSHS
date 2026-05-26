import os
import json
import uuid
import tempfile
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import requests

from analyzer import MealAnalyzer

app = Flask(__name__, static_folder="sangsan_meal")
CORS(app)

with open("config.json", "r", encoding="utf-8") as f:
    config = json.load(f)

analyzer = MealAnalyzer("config.json")

RESULTS_DIR = "analysis_results"
os.makedirs(RESULTS_DIR, exist_ok=True)

IMAGES_DIR = "uploaded_images"
os.makedirs(IMAGES_DIR, exist_ok=True)


def get_neis_key():
    key = os.environ.get("NEIS_API_KEY") or config.get("api_keys", {}).get("neis", "")
    if key and not key.startswith("__"):
        return key
    return ""


@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/<path:path>")
def static_files(path):
    file_path = os.path.join(app.static_folder, path)
    if os.path.isfile(file_path):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, "index.html")


@app.route("/api/detect", methods=["POST"])
def api_detect():
    if "image" not in request.files:
        return jsonify({"error": "이미지 파일이 필요합니다."}), 400
    image_file = request.files["image"]
    ext = os.path.splitext(image_file.filename or "image.jpg")[1] or ".jpg"
    image_filename = f"detect_{uuid.uuid4().hex}{ext}"
    image_path = os.path.join(IMAGES_DIR, image_filename)
    image_file.save(image_path)
    try:
        import base64
        buffer, regions = analyzer.detect(image_path)
        b64 = base64.b64encode(buffer).decode("utf-8")
        return jsonify({"image": f"data:image/jpeg;base64,{b64}", "regions": regions})
    except Exception as e:
        return jsonify({"error": f"영역 검출 중 오류: {str(e)}"}), 500
    finally:
        if os.path.exists(image_path):
            os.remove(image_path)


@app.route("/api/analyze", methods=["POST"])
def api_analyze():
    if "image" not in request.files:
        return jsonify({"error": "이미지 파일이 필요합니다."}), 400

    image_file = request.files["image"]
    date_str = request.form.get("date", datetime.now().strftime("%Y%m%d"))
    meal_time = request.form.get("meal_time", "")
    use_regions = request.form.get("use_regions", "")

    ext = os.path.splitext(image_file.filename or "image.jpg")[1] or ".jpg"
    image_filename = f"{uuid.uuid4().hex}{ext}"
    image_path = os.path.join(IMAGES_DIR, image_filename)
    image_file.save(image_path)

    try:
        if use_regions == "true":
            regions_json = request.form.get("regions", "[]")
            regions = json.loads(regions_json)
            tray_corners_json = request.form.get("tray_corners", "null")
            tray_corners = json.loads(tray_corners_json) if tray_corners_json != "null" else None
            result = analyzer.analyze_with_regions(image_path, regions, tray_corners)
        else:
            menu_json = request.form.get("menu", "{}")
            soup_food = request.form.get("soup_food", "")
            tray_foods = json.loads(menu_json)
            result = analyzer.analyze(image_path, tray_foods, soup_food)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"분석 중 오류: {str(e)}"}), 500
    finally:
        if os.path.exists(image_path):
            os.remove(image_path)

    if use_regions == "true":
        menu_from_regions = {}
        for r in regions:
            sec = r.get("section", 0)
            name = r.get("food_name", "")
            if sec == 0 or sec == 6:
                menu_from_regions["soup"] = name
            else:
                menu_from_regions[str(sec)] = name
        record_menu = menu_from_regions
        record_soup = menu_from_regions.get("soup", "")
    else:
        record_menu = tray_foods
        record_soup = soup_food

    record = {
        "id": uuid.uuid4().hex[:12],
        "date": date_str,
        "timestamp": datetime.now().isoformat(),
        "meal_time": meal_time,
        "menu": record_menu,
        "soup_food": record_soup,
        "result": result,
        "image_filename": image_filename
    }

    record_path = os.path.join(RESULTS_DIR, f"{record['id']}.json")
    with open(record_path, "w", encoding="utf-8") as f:
        json.dump(record, f, ensure_ascii=False, indent=2)

    return jsonify(record)


@app.route("/api/analyze-url", methods=["POST"])
def api_analyze_url():
    data = request.get_json(force=True)
    image_url = data.get("image_url", "")
    tray_foods = data.get("menu", {})
    soup_food = data.get("soup_food", "")
    date_str = data.get("date", datetime.now().strftime("%Y%m%d"))
    meal_time = data.get("meal_time", "")

    if not image_url:
        return jsonify({"error": "이미지 URL이 필요합니다."}), 400

    try:
        resp = requests.get(image_url, timeout=30)
        resp.raise_for_status()
        ext = ".jpg"
        image_filename = f"{uuid.uuid4().hex}{ext}"
        image_path = os.path.join(IMAGES_DIR, image_filename)
        with open(image_path, "wb") as f:
            f.write(resp.content)
    except Exception as e:
        return jsonify({"error": f"이미지 다운로드 실패: {str(e)}"}), 400

    try:
        result = analyzer.analyze(image_path, tray_foods, soup_food)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"분석 중 오류: {str(e)}"}), 500
    finally:
        if os.path.exists(image_path):
            os.remove(image_path)

    record = {
        "id": uuid.uuid4().hex[:12],
        "date": date_str,
        "timestamp": datetime.now().isoformat(),
        "meal_time": meal_time,
        "menu": tray_foods,
        "soup_food": soup_food,
        "result": result,
        "image_filename": image_filename
    }

    record_path = os.path.join(RESULTS_DIR, f"{record['id']}.json")
    with open(record_path, "w", encoding="utf-8") as f:
        json.dump(record, f, ensure_ascii=False, indent=2)

    return jsonify(record)


@app.route("/api/results", methods=["GET"])
def api_results():
    date = request.args.get("date", "")
    results_list = []
    for fname in os.listdir(RESULTS_DIR):
        if fname.endswith(".json"):
            fpath = os.path.join(RESULTS_DIR, fname)
            with open(fpath, "r", encoding="utf-8") as f:
                record = json.load(f)
            if date and record.get("date") != date:
                continue
            results_list.append(record)
    results_list.sort(key=lambda r: r.get("timestamp", ""), reverse=True)
    return jsonify(results_list)


@app.route("/api/results/<result_id>", methods=["GET"])
def api_result_by_id(result_id):
    fpath = os.path.join(RESULTS_DIR, f"{result_id}.json")
    if not os.path.isfile(fpath):
        return jsonify({"error": "결과를 찾을 수 없습니다."}), 404
    with open(fpath, "r", encoding="utf-8") as f:
        record = json.load(f)
    return jsonify(record)


@app.route("/api/results/<result_id>", methods=["DELETE"])
def api_delete_result(result_id):
    fpath = os.path.join(RESULTS_DIR, f"{result_id}.json")
    if not os.path.isfile(fpath):
        return jsonify({"error": "결과를 찾을 수 없습니다."}), 404
    os.remove(fpath)
    return jsonify({"status": "deleted"})


@app.route("/api/proxy/neis", methods=["GET"])
def api_proxy_neis():
    endpoint = request.args.get("endpoint", "mealServiceDietInfo")
    params = {}
    for key in request.args:
        if key != "endpoint":
            params[key] = request.args[key]

    if "KEY" not in params:
        params["KEY"] = get_neis_key()

    url = f"https://open.neis.go.kr/hub/{endpoint}"

    try:
        resp = requests.get(url, params=params, timeout=15)
        return jsonify(resp.json())
    except requests.exceptions.RequestException as e:
        return jsonify({"error": str(e)}), 502


@app.route("/api/menu/<date>", methods=["GET"])
def api_menu(date):
    school_atpt = request.args.get("atpt", "P10")
    school_code = request.args.get("code", "8321090")

    if len(date) == 10:
        date = date.replace("-", "")

    url = "https://open.neis.go.kr/hub/mealServiceDietInfo"
    params = {
        "KEY": get_neis_key(),
        "Type": "json",
        "pIndex": 1,
        "pSize": 50,
        "ATPT_OFCDC_SC_CODE": school_atpt,
        "SD_SCHUL_CODE": school_code,
        "MLSV_FROM_YMD": date,
        "MLSV_TO_YMD": date
    }

    try:
        resp = requests.get(url, params=params, timeout=15)
        data = resp.json()
        rows = data.get("mealServiceDietInfo", [{}])[1].get("row", []) if data.get("mealServiceDietInfo") else []

        menu_by_meal = {}
        for row in rows:
            meal_name = row.get("MMEAL_SC_NM", "")
            dishes = []
            for dish_str in row.get("DDISH_NM", "").split("<br/>"):
                if dish_str.strip():
                    dishes.append(dish_str.strip())
            menu_by_meal[meal_name] = {
                "calories": row.get("CAL_INFO", "0"),
                "dishes": dishes
            }

        return jsonify({
            "date": date,
            "school": {"atpt": school_atpt, "code": school_code},
            "meals": menu_by_meal,
            "raw": rows
        })
    except Exception as e:
        return jsonify({"error": str(e), "meals": {}}), 500


@app.route("/api/proxy/food-nutri", methods=["GET"])
def api_proxy_food_nutri():
    food_name = request.args.get("food", "")
    if not food_name:
        return jsonify({"error": "음식명이 필요합니다."}), 400

    service_key = config.get("api_keys", {}).get("food_nutrition", "")
    url = "https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02"
    params = {
        "serviceKey": service_key,
        "FOOD_NM_KR": food_name,
        "pageNo": 1,
        "numOfRows": 20,
        "type": "json"
    }

    try:
        resp = requests.get(url, params=params, timeout=10)
        data = resp.json()
        items = data.get("body", {}).get("items", [])
        if not items:
            return jsonify({"food": food_name, "kcal_per_100g": None})

        for item in items:
            if item.get("DB_GRP_NM") != "음식":
                continue
            if item.get("DB_CLASS_NM") == "외식":
                continue
            kcal = item.get("AMT_NUM1", "")
            if kcal != "":
                return jsonify({
                    "food": food_name,
                    "kcal_per_100g": float(kcal),
                    "item": item
                })
        return jsonify({"food": food_name, "kcal_per_100g": None})
    except Exception as e:
        return jsonify({"error": str(e)}), 502


@app.route("/api/health", methods=["GET"])
def api_health():
    return jsonify({"status": "ok", "time": datetime.now().isoformat()})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", config.get("server", {}).get("port", 5000)))
    debug = os.environ.get("FLASK_ENV", "production") == "development"
    host = os.environ.get("HOST", config.get("server", {}).get("host", "0.0.0.0"))
    print(f"서버 시작: http://{host}:{port}")
    print(f"분석 결과 저장: {RESULTS_DIR}/")
    app.run(host=host, port=port, debug=debug)
