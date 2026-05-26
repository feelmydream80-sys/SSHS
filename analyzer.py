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

    def preview(self, image_path):
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

        colors = {
            1: (255, 50, 50),
            2: (50, 200, 50),
            3: (50, 100, 255),
            4: (255, 200, 50),
            5: (200, 50, 200),
        }
        label_names = {1: "1", 2: "2", 3: "3", 4: "4", 5: "5"}

        overlay = img_rgb.copy()

        preview_entries = []
        for mask, cls in zip(raw_masks, classes):
            cls = int(cls)
            if cls not in colors:
                continue
            mask_resized = cv2.resize(mask, (img_rgb.shape[1], img_rgb.shape[0]))
            mask_bin = (mask_resized > 0.2).astype(np.uint8)
            contours, _ = cv2.findContours(mask_bin, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if not contours:
                continue
            largest = max(contours, key=cv2.contourArea)
            M = cv2.moments(largest)
            if M["m00"] != 0:
                cx = int(M["m10"] / M["m00"])
                cy = int(M["m01"] / M["m00"])
            else:
                cx, cy = largest[0][0]
            preview_entries.append((cls, largest, cx, cy))

        preview_entries.sort(key=lambda e: (e[3], e[2]))

        for i, (cls, contour, cx, cy) in enumerate(preview_entries):
            section = i + 1
            col = colors.get(section, colors[cls])
            overlay_layer = overlay.copy()
            cv2.drawContours(overlay_layer, [contour], -1, col, thickness=cv2.FILLED)
            overlay = cv2.addWeighted(overlay, 1.0, overlay_layer, 0.25, 0)
            cv2.drawContours(overlay, [contour], -1, col, thickness=3)
            label = str(section)
            cv2.putText(overlay, label, (cx - 12, cy + 8), cv2.FONT_HERSHEY_SIMPLEX, 1.4, (255, 255, 255), 4)
            cv2.putText(overlay, label, (cx - 12, cy + 8), cv2.FONT_HERSHEY_SIMPLEX, 1.4, col, 3)

        for mask, cls in zip(raw_masks, classes):
            cls = int(cls)
            if cls != 0:
                continue
            mask_resized = cv2.resize(mask, (img_rgb.shape[1], img_rgb.shape[0]))
            mask_bin = (mask_resized > 0.2).astype(np.uint8)
            contours, _ = cv2.findContours(mask_bin, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if contours:
                cv2.drawContours(overlay, [max(contours, key=cv2.contourArea)], -1, (180, 180, 180), thickness=2)

        overlay_bgr = cv2.cvtColor(overlay, cv2.COLOR_RGB2BGR)
        _, buffer = cv2.imencode('.jpg', overlay_bgr, [cv2.IMWRITE_JPEG_QUALITY, 85])
        return buffer

    def detect(self, image_path):
        self._load_model()
        img = cv2.imread(image_path)
        if img is None:
            raise ValueError(f"이미지를 읽을 수 없습니다: {image_path}")
        img = cv2.fastNlMeansDenoisingColored(img, None, 5, 5, 7, 21)
        kernel_sharpen = np.array([[-1,-1,-1],[-1,9,-1],[-1,-1,-1]])
        img = cv2.filter2D(img, -1, kernel_sharpen)
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        results = self.model(img_rgb, conf=self.conf_threshold, imgsz=self.imgsz, verbose=False)
        h, w = img_rgb.shape[:2]

        # Collect tray mask (class 0) and food mask contours (classes 1-5)
        tray_mask = None
        food_items = []

        for mask_t, cls_t in zip(results[0].masks.data.cpu().numpy(), results[0].boxes.cls.cpu().numpy()):
            cls = int(cls_t)
            m = cv2.resize(mask_t, (w, h))
            m_bin = (m > 0.2).astype(np.uint8)
            if cls == 0:
                if tray_mask is None or np.sum(m_bin) > np.sum(tray_mask):
                    tray_mask = m_bin
            elif cls in [1, 2, 3, 4, 5]:
                contours, _ = cv2.findContours(m_bin, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                if not contours:
                    continue
                largest = max(contours, key=cv2.contourArea)
                M = cv2.moments(largest)
                cx = int(M["m10"]/M["m00"]) if M["m00"] else int(largest[0][0][0])
                cy = int(M["m01"]/M["m00"]) if M["m00"] else int(largest[0][0][1])
                food_items.append((cls, largest, cx, cy))

        # Determine tray bounding box
        if tray_mask is not None:
            cs, _ = cv2.findContours(tray_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if cs:
                bx, by, bw, bh = cv2.boundingRect(max(cs, key=cv2.contourArea))
            else:
                bx, by, bw, bh = 0, 0, w, h
        else:
            bx, by, bw, bh = 0, 0, w, h

        # Split food items into top/bottom by y
        mid_y = by + bh * 0.45
        top_items = [(c, cx, cy) for cls, c, cx, cy in food_items if cy < mid_y]
        bottom_items = [(c, cx, cy) for cls, c, cx, cy in food_items if cy >= mid_y]
        top_items.sort(key=lambda x: x[2])
        bottom_items.sort(key=lambda x: x[2])

        # Assign section numbers: leftmost top=1, rightmost top=4, center fills 2->3
        assigned = []  # (section, contour_or_None, cx, cy)

        n_top = len(top_items)
        if n_top == 0:
            assigned.append((2, None, int(bx + bw / 2), int(by + bh * 0.25)))
        elif n_top == 1:
            _, cx, cy = top_items[0]
            assigned.append((2, top_items[0][0], cx, cy))
        elif n_top == 2:
            _, cx1, cy1 = top_items[0]
            _, cx2, cy2 = top_items[1]
            assigned.append((1, top_items[0][0], cx1, cy1))
            assigned.append((4, top_items[1][0], cx2, cy2))
        elif n_top == 3:
            for i in range(3):
                _, cx, cy = top_items[i]
                sec = [1, 2, 4][i]
                assigned.append((sec, top_items[i][0], cx, cy))
        else:
            for i in range(4):
                _, cx, cy = top_items[i]
                assigned.append((i + 1, top_items[i][0], cx, cy))

        n_bottom = len(bottom_items)
        mid_x = bx + bw / 2

        # Bottom row (5, 6): assign by grid cell membership, no placeholder fallback
        half_bw = int(bw / 2)
        bot_y1 = int(mid_y)
        bot_y2 = by + bh
        sec5_x1, sec5_x2 = bx, bx + half_bw
        sec6_x1, sec6_x2 = bx + half_bw, bx + bw

        # Always add both bottom sections: contour if centroid in cell, else None
        sec5_cnt_cx_cy = None
        sec6_cnt_cx_cy = None
        for item in bottom_items:
            c, cx, cy = item
            if cx < mid_x:
                if sec5_cnt_cx_cy is None:
                    sec5_cnt_cx_cy = (c, cx, cy)
            else:
                if sec6_cnt_cx_cy is None:
                    sec6_cnt_cx_cy = (c, cx, cy)

        for sec in [5, 6]:
            entry = sec5_cnt_cx_cy if sec == 5 else sec6_cnt_cx_cy
            if entry is not None:
                c, cx, cy = entry
                assigned.append((sec, c, cx, cy))
            else:
                cell_cx = (sec5_x1 + sec5_x2) // 2 if sec == 5 else (sec6_x1 + sec6_x2) // 2
                cell_cy = (bot_y1 + bot_y2) // 2
                assigned.append((sec, None, cell_cx, cell_cy))

        # Build overlay and regions
        overlay = img_rgb.copy()
        colors = [(255, 50, 50), (50, 200, 50), (50, 100, 255), (255, 200, 50), (200, 50, 200), (100, 200, 200)]
        regions = []

        for sec, cnt, fcx, fcy in assigned:
            col = colors[(sec - 1) % 6]

            if cnt is not None and sec >= 5:
                cell_x1 = sec5_x1 if sec == 5 else sec6_x1
                cell_x2 = sec5_x2 if sec == 5 else sec6_x2
                cell_y1, cell_y2 = bot_y1, bot_y2
                cell_mask = np.zeros((h, w), dtype=np.uint8)
                cell_mask[cell_y1:cell_y2, cell_x1:cell_x2] = 1
                cnt_mask = np.zeros((h, w), dtype=np.uint8)
                cv2.drawContours(cnt_mask, [cnt], -1, 1, thickness=cv2.FILLED)
                clipped = (cnt_mask * cell_mask).astype(np.uint8)
                ccs, _ = cv2.findContours(clipped, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                if ccs:
                    use_cnt = max(ccs, key=cv2.contourArea)
                    epsilon = 0.02 * cv2.arcLength(use_cnt, True)
                    approx = cv2.approxPolyDP(use_cnt, epsilon, True)
                    poly = approx.reshape(-1, 2).tolist()
                    cx_use, cy_use = (cell_x1 + cell_x2) // 2, (cell_y1 + cell_y2) // 2
                    ol = overlay.copy()
                    cv2.drawContours(ol, [use_cnt], -1, col, thickness=cv2.FILLED)
                    overlay = cv2.addWeighted(overlay, 1.0, ol, 0.25, 0)
                    cv2.drawContours(overlay, [use_cnt], -1, col, thickness=3)
                else:
                    poly = _make_hexagon(cell_x1, cell_y1, cell_x2, cell_y2)
                    cx_use, cy_use = (cell_x1 + cell_x2) // 2, (cell_y1 + cell_y2) // 2
                    ol = overlay.copy()
                    cv2.fillPoly(ol, [np.array(poly, dtype=np.int32)], col)
                    overlay = cv2.addWeighted(overlay, 1.0, ol, 0.12, 0)
                    _draw_dashed_poly(overlay, poly, col, 2, 8, 4)
                mask_img = np.zeros((h, w), dtype=np.uint8)
                cv2.drawContours(mask_img, [cnt], -1, 1, thickness=cv2.FILLED)
                px_area = int(np.sum(mask_img))
            elif cnt is not None:
                epsilon = 0.02 * cv2.arcLength(cnt, True)
                approx = cv2.approxPolyDP(cnt, epsilon, True)
                poly = approx.reshape(-1, 2).tolist()
                cx_use, cy_use = fcx, fcy
                ol = overlay.copy()
                cv2.drawContours(ol, [cnt], -1, col, thickness=cv2.FILLED)
                overlay = cv2.addWeighted(overlay, 1.0, ol, 0.25, 0)
                cv2.drawContours(overlay, [cnt], -1, col, thickness=3)
                mask_img = np.zeros((h, w), dtype=np.uint8)
                cv2.drawContours(mask_img, [cnt], -1, 1, thickness=cv2.FILLED)
                px_area = int(np.sum(mask_img))
            else:
                cell_w = bw / 4 if sec <= 4 else bw / 2
                cell_h = bh / 2
                x1 = int(fcx - cell_w / 2)
                y1 = int(fcy - cell_h / 2)
                x2 = int(fcx + cell_w / 2)
                y2 = int(fcy + cell_h / 2)
                px_area = 0
                if sec >= 5:
                    poly = _make_hexagon(x1, y1, x2, y2)
                    cx_use, cy_use = int(fcx), int(fcy)
                    ol = overlay.copy()
                    cv2.fillPoly(ol, [np.array(poly, dtype=np.int32)], col)
                    overlay = cv2.addWeighted(overlay, 1.0, ol, 0.12, 0)
                    _draw_dashed_poly(overlay, poly, col, 2, 8, 4)
                else:
                    poly = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]
                    cx_use, cy_use = int(fcx), int(fcy)
                    ol = overlay.copy()
                    cv2.rectangle(ol, (x1, y1), (x2, y2), col, thickness=cv2.FILLED)
                    overlay = cv2.addWeighted(overlay, 1.0, ol, 0.12, 0)
                    _draw_dashed_rect(overlay, x1, y1, x2, y2, col, 2, 8, 4)

            regions.append({
                "id": str(sec),
                "section": sec,
                "polygon": poly,
                "cx": cx_use,
                "cy": cy_use,
                "pixel_area": px_area,
                "placeholder": cnt is None
            })

            label = f"{sec}번"
            (lx, ly), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 1.0, 3)
            lx, ly = lx // 2, ly // 2
            cv2.putText(overlay, label, (cx_use - lx, cy_use + ly), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 3)
            cv2.putText(overlay, label, (cx_use - lx, cy_use + ly), cv2.FONT_HERSHEY_SIMPLEX, 1.0, col, 2)

        # Draw tray outline
        if tray_mask is not None:
            cs, _ = cv2.findContours(tray_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if cs:
                cv2.drawContours(overlay, [max(cs, key=cv2.contourArea)], -1, (180, 180, 180), 2)

        overlay_bgr = cv2.cvtColor(overlay, cv2.COLOR_RGB2BGR)
        _, buffer = cv2.imencode('.jpg', overlay_bgr, [cv2.IMWRITE_JPEG_QUALITY, 85])
        return buffer, regions

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

        food_entries = []
        for cls, food_mask in food_masks:
            warped_mask = cv2.warpPerspective(food_mask.astype(np.float32), matrix, (self.warp_width, self.warp_height))
            pixel_area = np.sum(warped_mask > 0.2)
            if pixel_area < 10:
                continue
            mask_bin = (warped_mask > 0.2).astype(np.uint8)
            ys, xs = np.where(mask_bin)
            cy = float(np.mean(ys)) if len(ys) > 0 else 0
            cx = float(np.mean(xs)) if len(xs) > 0 else 0
            food_entries.append((cls, pixel_area, cx, cy, warped_mask))

        food_entries.sort(key=lambda e: (e[3], e[2]))

        section_food_areas = {}
        assigned_cls = {}
        for i, (cls, pixel_area, cx, cy, _) in enumerate(food_entries):
            section = i + 1
            if cls not in assigned_cls:
                assigned_cls[cls] = section
            section_food_areas[section] = pixel_area

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

    def analyze_with_regions(self, image_path, regions, tray_corners=None):
        self._load_model()
        img = cv2.imread(image_path)
        if img is None:
            raise ValueError(f"이미지를 읽을 수 없습니다: {image_path}")
        img = cv2.fastNlMeansDenoisingColored(img, None, 5, 5, 7, 21)
        kernel_sharpen = np.array([[-1,-1,-1],[-1,9,-1],[-1,-1,-1]])
        img = cv2.filter2D(img, -1, kernel_sharpen)
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        h, w = img_rgb.shape[:2]

        if tray_corners:
            pts_src = np.array(tray_corners, dtype=np.float32)
        else:
            results = self.model(img_rgb, conf=self.conf_threshold, imgsz=self.imgsz, verbose=False)
            tray_mask = None
            tray_area = 0
            for mask, cls in zip(results[0].masks.data.cpu().numpy(), results[0].boxes.cls.cpu().numpy()):
                cls = int(cls)
                if cls != 0:
                    continue
                area = np.sum(mask)
                if area > tray_area:
                    tray_area = area
                    tray_mask = mask
            if tray_mask is None:
                raise ValueError("tray 검출 실패")
            tray_resized = cv2.resize(tray_mask, (w, h))
            tray_uint8 = (tray_resized * 255).astype(np.uint8)
            tray_uint8 = cv2.morphologyEx(tray_uint8, cv2.MORPH_CLOSE, np.ones((9,9),np.uint8))
            tray_uint8 = cv2.morphologyEx(tray_uint8, cv2.MORPH_OPEN, np.ones((9,9),np.uint8))
            tray_uint8 = cv2.GaussianBlur(tray_uint8, (5,5), 0)
            contours, _ = cv2.findContours(tray_uint8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            largest = max(contours, key=cv2.contourArea)
            contour_mask = np.zeros_like(tray_uint8)
            cv2.drawContours(contour_mask, [largest], -1, 255, 15)
            edges = cv2.Canny(contour_mask, 50, 150)
            lines = cv2.HoughLinesP(edges, 1, np.pi/180, 100, 400, 50)
            corners = None
            if lines is not None:
                horizontal = []
                vertical = []
                for l in lines:
                    x1,y1,x2,y2 = l[0]
                    dx,dy = x2-x1, y2-y1
                    angle = math.degrees(math.atan2(dy,dx))
                    length = np.sqrt(dx*dx+dy*dy)
                    if length < 300: continue
                    if abs(angle) < 20: horizontal.append((x1,y1,x2,y2))
                    elif abs(angle) > 70: vertical.append((x1,y1,x2,y2))
                if len(horizontal) >= 2 and len(vertical) >= 2:
                    top_line = min(horizontal, key=lambda l: (l[1]+l[3])/2)
                    bottom_line = max(horizontal, key=lambda l: (l[1]+l[3])/2)
                    left_line = min(vertical, key=lambda l: (l[0]+l[2])/2)
                    right_line = max(vertical, key=lambda l: (l[0]+l[2])/2)
                    tl = line_intersection(top_line, left_line)
                    tr = line_intersection(top_line, right_line)
                    br = line_intersection(bottom_line, right_line)
                    bl = line_intersection(bottom_line, left_line)
                    if all(p is not None for p in [tl,tr,br,bl]):
                        corners = np.array([tl,tr,br,bl], dtype=np.float32)
                        corners = order_points(corners)
            if corners is None:
                epsilon = 0.02*cv2.arcLength(largest,True)
                approx = cv2.approxPolyDP(largest,epsilon,True)
                hull_pts = approx.reshape(-1,2)
                if len(hull_pts) > 4:
                    hull = cv2.convexHull(hull_pts)
                    epsilon2 = 0.05*cv2.arcLength(hull,True)
                    hull_pts = cv2.approxPolyDP(hull,epsilon2,True).reshape(-1,2)
                if len(hull_pts) == 4:
                    corners = hull_pts.astype(np.float32)
                    corners = order_points(corners)
                else:
                    rect = cv2.minAreaRect(largest)
                    corners = cv2.boxPoints(rect).astype(np.float32)
                    corners = order_points(corners)
            pts_src = corners

        pts_dst = np.array([[0,0],[self.warp_width,0],[self.warp_width,self.warp_height],[0,self.warp_height]], dtype=np.float32)
        matrix = cv2.getPerspectiveTransform(pts_src, pts_dst)

        real_tray_cm2 = self.real_tray_width * self.real_tray_height
        cm2_per_pixel = real_tray_cm2 / (self.warp_width * self.warp_height)

        soup_food = ""
        results_list = []
        total_kcal = 0.0
        has_soup = False

        for r in regions:
            section = r.get("section", 1)
            food_name = r.get("food_name", "")
            if not food_name:
                continue

            poly = np.array(r["polygon"], dtype=np.float32).reshape(-1, 1, 2)
            warped_poly = cv2.perspectiveTransform(poly, matrix).reshape(-1, 2)
            mask = np.zeros((self.warp_height, self.warp_width), dtype=np.uint8)
            cv2.fillPoly(mask, [warped_poly.astype(np.int32)], 1)
            pixel_area = np.sum(mask)

            real_area = pixel_area * cm2_per_pixel
            food_height = self.tray_heights.get(section, 1.0)
            volume = real_area * food_height

            is_soup = any(k in food_name for k in self.soup_keywords)
            if is_soup:
                has_soup = True
                if food_name not in soup_food:
                    soup_food = food_name
                estimated_weight = self.soup_weight
            else:
                estimated_weight = volume * self.default_density

            kcal_per_100g = _lookup_kcal(food_name)
            kcal = (estimated_weight / 100) * kcal_per_100g
            total_kcal += kcal

            results_list.append({
                "section": section,
                "food_name": food_name,
                "real_area_cm2": round(real_area, 2),
                "height_cm": food_height,
                "volume_cm3": round(volume, 2),
                "estimated_weight_g": round(estimated_weight, 1),
                "kcal_per_100g": kcal_per_100g,
                "is_soup": is_soup,
                "kcal": round(kcal, 1)
            })

        return {"total_kcal": round(total_kcal, 1), "sections": results_list}


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


def _make_hexagon(cell_x1, cell_y1, cell_x2, cell_y2):
    cx = (cell_x1 + cell_x2) // 2
    h = cell_y2 - cell_y1
    return [
        [cx, cell_y1],
        [cell_x2, int(cell_y1 + h * 0.25)],
        [cell_x2, int(cell_y1 + h * 0.75)],
        [cx, cell_y2],
        [cell_x1, int(cell_y1 + h * 0.75)],
        [cell_x1, int(cell_y1 + h * 0.25)]
    ]

def _draw_dashed_poly(img, poly, color, thickness, dash_len, gap_len):
    n = len(poly)
    for i in range(n):
        pt1 = poly[i]
        pt2 = poly[(i + 1) % n]
        dx = pt2[0] - pt1[0]
        dy = pt2[1] - pt1[1]
        line_len = np.sqrt(dx*dx + dy*dy)
        if line_len == 0:
            continue
        nx, ny = dx / line_len, dy / line_len
        num = int(line_len / (dash_len + gap_len))
        for j in range(num):
            s = j * (dash_len + gap_len)
            sp = (int(pt1[0] + nx * s), int(pt1[1] + ny * s))
            ep = (int(pt1[0] + nx * min(s + dash_len, line_len)), int(pt1[1] + ny * min(s + dash_len, line_len)))
            cv2.line(img, sp, ep, color, thickness)

def _draw_dashed_rect(img, x1, y1, x2, y2, color, thickness, dash_len, gap_len):
    for pt1, pt2 in [
        ((x1, y1), (x2, y1)),
        ((x2, y1), (x2, y2)),
        ((x2, y2), (x1, y2)),
        ((x1, y2), (x1, y1)),
    ]:
        dx = pt2[0] - pt1[0]
        dy = pt2[1] - pt1[1]
        line_len = np.sqrt(dx*dx + dy*dy)
        if line_len == 0:
            continue
        nx, ny = dx / line_len, dy / line_len
        num = int(line_len / (dash_len + gap_len))
        for i in range(num):
            s = i * (dash_len + gap_len)
            sp = (int(pt1[0] + nx * s), int(pt1[1] + ny * s))
            ep = (int(pt1[0] + nx * min(s + dash_len, line_len)), int(pt1[1] + ny * min(s + dash_len, line_len)))
            cv2.line(img, sp, ep, color, thickness)


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
        env_key = os.environ.get("FOOD_NUTRITION_API_KEY")
        if env_key and not env_key.startswith("__"):
            SERVICE_KEY = env_key
        else:
            try:
                with open("config.json", "r", encoding="utf-8") as f:
                    cfg = json.load(f)
                cfg_key = cfg["api_keys"]["food_nutrition"]
                SERVICE_KEY = cfg_key if not cfg_key.startswith("__") else ""
            except Exception:
                SERVICE_KEY = ""
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
