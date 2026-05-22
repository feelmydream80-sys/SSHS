import cv2
import numpy as np
import math
import json
import os

from ultralytics import YOLO

class MealAnalyzer:
    CLASS_NAMES = {0: "tray", 1: "tray1", 2: "tray2", 3: "tray3", 4: "tray4", 5: "tray5"}

    def __init__(self, config_path="config.json"):
        with open(config_path, "r", encoding="utf-8") as f:
            cfg = json.load(f)
        model_cfg = cfg["model"]
        tray_cfg = cfg["tray"]
        food_cfg = cfg["food"]

        self.yolo_path = model_cfg["yolo_path"]
        self.warp_width = model_cfg["warp_width"]
        self.warp_height = model_cfg["warp_height"]
        self.conf_threshold = model_cfg["conf_threshold"]
        self.imgsz = model_cfg["imgsz"]

        self.real_tray_width = tray_cfg["real_width_cm"]
        self.real_tray_height = tray_cfg["real_height_cm"]

        self.tray_heights = {int(k): v for k, v in food_cfg["tray_heights_cm"].items()}
        self.default_density = food_cfg["default_density"]
        self.soup_weight = food_cfg["soup_weight"]
        self.soup_keywords = food_cfg["soup_keywords"]

        self.model = None

    def _load_model(self):
        if self.model is None:
            self.model = YOLO(self.yolo_path)

    def analyze(self, image_path, tray_foods, soup_food=""):
        self._load_model()

        img = cv2.imread(image_path)
        if img is None:
            raise ValueError(f"이미지를 읽을 수 없습니다: {image_path}")

        img = cv2.fastNlMeansDenoisingColored(img, None, 5, 5, 7, 21)
        kernel_sharpen = np.array([[-1,-1,-1],[-1,9,-1],[-1,-1,-1]])
        img = cv2.filter2D(img, -1, kernel_sharpen)
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

        results = self.model(img_rgb, conf=self.conf_threshold, imgsz=self.imgsz, verbose=False)

        if results[0].masks is None:
            raise ValueError("Segmentation 결과가 없습니다.")

        raw_masks = results[0].masks.data.cpu().numpy()
        classes = results[0].boxes.cls.cpu().numpy()

        resized_masks = []
        for mask in raw_masks:
            resized = cv2.resize(mask, (img_rgb.shape[1], img_rgb.shape[0]))
            resized_masks.append(resized)

        tray_mask = None
        tray_area = 0
        food_masks = []

        for mask, cls in zip(resized_masks, classes):
            cls = int(cls)
            area = np.sum(mask)
            if cls == 0:
                if area > tray_area:
                    tray_area = area
                    tray_mask = mask
            elif cls in [1, 2, 3, 4, 5]:
                food_masks.append((cls, mask))

        if tray_mask is None:
            raise ValueError("tray 검출 실패")

        tray_mask_resized = cv2.resize(tray_mask, (img_rgb.shape[1], img_rgb.shape[0]))
        tray_mask_uint8 = (tray_mask_resized * 255).astype(np.uint8)

        kernel = np.ones((9,9), np.uint8)
        tray_mask_uint8 = cv2.morphologyEx(tray_mask_uint8, cv2.MORPH_CLOSE, kernel)
        tray_mask_uint8 = cv2.morphologyEx(tray_mask_uint8, cv2.MORPH_OPEN, kernel)
        tray_mask_uint8 = cv2.GaussianBlur(tray_mask_uint8, (5,5), 0)

        contours, _ = cv2.findContours(tray_mask_uint8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        largest_contour = max(contours, key=cv2.contourArea)

        contour_mask = np.zeros_like(tray_mask_uint8)
        cv2.drawContours(contour_mask, [largest_contour], -1, 255, thickness=15)

        edges = cv2.Canny(contour_mask, 50, 150)
        lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=100, minLineLength=400, maxLineGap=50)

        corners = None

        if lines is not None:
            horizontal = []
            vertical = []
            for l in lines:
                x1, y1, x2, y2 = l[0]
                dx = x2 - x1
                dy = y2 - y1
                angle = math.degrees(math.atan2(dy, dx))
                length = np.sqrt(dx*dx + dy*dy)
                if length < 300:
                    continue
                if abs(angle) < 20:
                    horizontal.append((x1,y1,x2,y2))
                elif abs(angle) > 70:
                    vertical.append((x1,y1,x2,y2))

            if len(horizontal) >= 2 and len(vertical) >= 2:
                top_line = min(horizontal, key=lambda l: (l[1] + l[3]) / 2)
                bottom_line = max(horizontal, key=lambda l: (l[1] + l[3]) / 2)
                left_line = min(vertical, key=lambda l: (l[0] + l[2]) / 2)
                right_line = max(vertical, key=lambda l: (l[0] + l[2]) / 2)

                tl = line_intersection(top_line, left_line)
                tr = line_intersection(top_line, right_line)
                br = line_intersection(bottom_line, right_line)
                bl = line_intersection(bottom_line, left_line)

                if all(p is not None for p in [tl, tr, br, bl]):
                    corners = np.array([tl, tr, br, bl], dtype=np.float32)
                    corners = order_points(corners)

        if corners is None or len(corners) != 4:
            epsilon = 0.02 * cv2.arcLength(largest_contour, True)
            approx = cv2.approxPolyDP(largest_contour, epsilon, True)
            hull_pts = approx.reshape(-1, 2)

            if len(hull_pts) > 4:
                hull = cv2.convexHull(hull_pts)
                epsilon2 = 0.05 * cv2.arcLength(hull, True)
                approx2 = cv2.approxPolyDP(hull, epsilon2, True)
                hull_pts = approx2.reshape(-1, 2)

            if len(hull_pts) == 4:
                corners = hull_pts.astype(np.float32)
                corners = order_points(corners)
            else:
                rect = cv2.minAreaRect(largest_contour)
                box = cv2.boxPoints(rect)
                corners = box.astype(np.float32)
                corners = order_points(corners)

        pts_src = np.array(corners, dtype=np.float32)
        pts_dst = np.array([
            [0, 0],
            [self.warp_width, 0],
            [self.warp_width, self.warp_height],
            [0, self.warp_height]
        ], dtype=np.float32)

        matrix = cv2.getPerspectiveTransform(pts_src, pts_dst)
        warped = cv2.warpPerspective(img_rgb, matrix, (self.warp_width, self.warp_height))

        real_tray_area_cm2 = self.real_tray_width * self.real_tray_height
        warp_pixel_area = self.warp_width * self.warp_height
        cm2_per_pixel = real_tray_area_cm2 / warp_pixel_area

        section_food_areas = {}
        for cls, food_mask in food_masks:
            warped_mask = cv2.warpPerspective(food_mask.astype(np.float32), matrix, (self.warp_width, self.warp_height))
            pixel_area = np.sum(warped_mask > 0.2)
            if cls not in section_food_areas:
                section_food_areas[cls] = 0
            section_food_areas[cls] += pixel_area

        results_list = []
        total_kcal = 0.0

        has_soup_in_sections = False

        for cls in range(1, 6):
            pixel_area = section_food_areas.get(cls, 0)
            real_area = pixel_area * cm2_per_pixel
            food_height = self.tray_heights.get(cls, 1.0)
            volume_cm3 = real_area * food_height

            food_name = tray_foods.get(str(cls), tray_foods.get(cls, ""))
            if not food_name:
                food_name = tray_foods.get(cls, f"칸{cls}")

            is_soup = False
            for keyword in self.soup_keywords:
                if keyword in food_name:
                    is_soup = True
                    break

            if soup_food and food_name.strip() == soup_food.strip():
                is_soup = True

            if is_soup:
                has_soup_in_sections = True

            if is_soup:
                estimated_weight = self.soup_weight
            else:
                estimated_weight = volume_cm3 * self.default_density

            kcal_per_100g = _lookup_kcal(food_name)

            kcal = (estimated_weight / 100) * kcal_per_100g
            total_kcal += kcal

            results_list.append({
                "section": cls,
                "food_name": food_name,
                "real_area_cm2": round(real_area, 2),
                "height_cm": food_height,
                "volume_cm3": round(volume_cm3, 2),
                "estimated_weight_g": round(estimated_weight, 1),
                "kcal_per_100g": kcal_per_100g,
                "is_soup": is_soup,
                "kcal": round(kcal, 1)
            })

        if soup_food and not has_soup_in_sections:
            kcal_per_100g = _lookup_kcal(soup_food)
            soup_kcal = (self.soup_weight / 100) * kcal_per_100g
            total_kcal += soup_kcal
            results_list.append({
                "section": 0,
                "food_name": soup_food,
                "real_area_cm2": 0,
                "height_cm": 0,
                "volume_cm3": 0,
                "estimated_weight_g": self.soup_weight,
                "kcal_per_100g": kcal_per_100g,
                "is_soup": True,
                "kcal": round(soup_kcal, 1)
            })

        return {
            "total_kcal": round(total_kcal, 1),
            "sections": results_list
        }


def _lookup_kcal(food_name):
    try:
        kcal = get_food_kcal(food_name)
        if kcal is not None:
            return kcal
    except Exception:
        pass

    simplified = food_name.replace(" ", "")
    if simplified != food_name:
        try:
            kcal = get_food_kcal(simplified)
            if kcal is not None:
                return kcal
        except Exception:
            pass

    for suffix in ["볶음", "구이", "찜", "조림", "무침", "튀김", "전", "회", "조림"]:
        if suffix in food_name:
            base = food_name[:food_name.index(suffix)]
            if len(base) >= 2:
                try:
                    kcal = get_food_kcal(base)
                    if kcal is not None:
                        return kcal
                except Exception:
                    pass

    return 150


def line_intersection(line1, line2):
    x1, y1, x2, y2 = map(float, line1)
    x3, y3, x4, y4 = map(float, line2)
    denom = (x1-x2)*(y3-y4) - (y1-y2)*(x3-x4)
    if denom == 0:
        return None
    px = ((x1*y2 - y1*x2)*(x3-x4) - (x1-x2)*(x3*y4 - y3*x4)) / denom
    py = ((x1*y2 - y1*x2)*(y3-y4) - (y1-y2)*(x3*y4 - y3*x4)) / denom
    return [px, py]


def order_points(pts):
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]
    return rect


SERVICE_KEY = None

def _get_service_key():
    global SERVICE_KEY
    if SERVICE_KEY is None:
        try:
            with open("config.json", "r", encoding="utf-8") as f:
                cfg = json.load(f)
            SERVICE_KEY = cfg["api_keys"]["food_nutrition"]
        except Exception:
            SERVICE_KEY = "56aa9dbe43a9e6d710ac47b79733815f59dca92c911790cbe6ca6f7113eb4959"
    return SERVICE_KEY


def get_food_kcal(food_name):
    import requests
    url = "https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02"
    params = {
        "serviceKey": _get_service_key(),
        "FOOD_NM_KR": food_name,
        "pageNo": 1,
        "numOfRows": 20,
        "type": "json"
    }
    try:
        response = requests.get(url, params=params, timeout=10)
        data = response.json()
        items = data["body"]["items"]
        if len(items) == 0:
            return None
        for item in items:
            if item.get("DB_GRP_NM") != "음식":
                continue
            if item.get("DB_CLASS_NM") == "외식":
                continue
            kcal = item.get("AMT_NUM1", "")
            if kcal != "":
                return float(kcal)
        return None
    except Exception as e:
        print("API 오류:", e)
        return None
