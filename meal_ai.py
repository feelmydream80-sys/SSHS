# ============================================================
# 급식 칼로리 추정 AI
# YOLO-seg + Perspective Transform 안정화 버전
# ============================================================

import cv2
import numpy as np
import matplotlib.pyplot as plt
import requests
import math





from ultralytics import YOLO

from tkinter import Tk
from tkinter.filedialog import askopenfilename


# ============================================================
# matplotlib 한글
# ============================================================

plt.rcParams['font.family'] = 'Malgun Gothic'
plt.rcParams['axes.unicode_minus'] = False

# ============================================================
# 실제 식판 크기(cm)
# ============================================================

REAL_TRAY_WIDTH = 35
REAL_TRAY_HEIGHT = 25

SERVICE_KEY = "56aa9dbe43a9e6d710ac47b79733815f59dca92c911790cbe6ca6f7113eb4959"

def get_food_kcal(food_name):

    url = (
        "https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02/getFoodNtrCpntDbInq02"
    )

    params = {
        "serviceKey": SERVICE_KEY,
        "FOOD_NM_KR": food_name,
        "pageNo": 1,
        "numOfRows": 20,
        "type": "json"
    }

    try:

        response = requests.get(
            url,
            params=params,
            timeout=10
        )

        data = response.json()

        items = data["body"]["items"]

        if len(items) == 0:
            return None

        # ============================================
        # 음식 데이터 필터링
        # ============================================

        for item in items:

            # 가공식품 제외
            if item["DB_GRP_NM"] != "음식":
                continue

            # 외식 제외 (급식에 더 가까운 값 사용)
            if item["DB_CLASS_NM"] == "외식":
                continue

            kcal = item["AMT_NUM1"]

            if kcal != "":
                return float(kcal)

        return None

    except Exception as e:

        print("API 오류:", e)

        return None

# ============================================================
# warp 크기
# ============================================================

WARP_WIDTH = 600
WARP_HEIGHT = 450

# ============================================================
# 클래스
#
# 0 : tray
# 1 : tray1
# 2 : tray2
# 3 : tray3
# 4 : tray4
# 5 : tray5
# ============================================================

CLASS_NAMES = {
    0: "tray",
    1: "tray1",
    2: "tray2",
    3: "tray3",
    4: "tray4",
    5: "tray5"
}

# ============================================================
# 칸별 평균 음식 높이(cm)
# ============================================================

TRAY_HEIGHTS = {
    1: 2.0,   # tray1
    2: 1.5,   # tray2
    3: 1.0,   # tray3
    4: 1.0,   # tray4
    5: 1.5    # tray5
}
# ============================================================
# 국 / 찌개 / 탕 판별
# ============================================================

SOUP_KEYWORDS = [
    "국",
    "찌개",
    "탕",
    "스프",
    "죽"
]
# ============================================================
# 음식 입력
# ============================================================

tray_foods = {}

print("급식판 음식 입력")

for i in range(1, 6):

    food_name = input(f"{i}번 칸 음식: ")

    tray_foods[i] = food_name

soup_food = input("\n국 음식 이름(없으면 엔터): ")

# ============================================================
# 이미지 선택
# ============================================================

Tk().withdraw()

image_path = askopenfilename(
    title="급식 이미지 선택",
    filetypes=[("Image Files", "*.jpg *.png *.jpeg")]
)

if image_path == "":
    raise Exception("이미지를 선택하지 않았습니다.")

print("선택 이미지:", image_path)

# ============================================================
# 이미지 읽기
# ============================================================

img = cv2.imread(image_path)

if img is None:
    raise Exception("이미지 읽기 실패")

# ============================================================
# 화질 개선
# ============================================================


# 노이즈 제거
img = cv2.fastNlMeansDenoisingColored(
    img,
    None,
    5,
    5,
    7,
    21
)

# 샤프닝
kernel = np.array([
    [-1,-1,-1],
    [-1, 9,-1],
    [-1,-1,-1]
])

img = cv2.filter2D(
    img,
    -1,
    kernel
)

# RGB
img_rgb = cv2.cvtColor(
    img,
    cv2.COLOR_BGR2RGB
)


# ============================================================
# YOLO 모델 로드
# ============================================================

model = YOLO(
    r"D:\Python\runs\segment\train-2\weights\best.pt"
)

# ============================================================
# YOLO 추론
# ============================================================

print("YOLO 추론 시작")

results = model(
    img_rgb,
    conf=0.15,
    imgsz=500,
    verbose=False
)   

print("YOLO 완료")




# ============================================================
# segmentation 결과 확인
# ============================================================

if results[0].masks is None:
    raise Exception("Segmentation 결과 없음")

# ============================================================
# tray / 음식 분리
# ============================================================

tray_mask = None
tray_area = 0

food_masks = []

# ============================================================
# YOLO 결과
# ============================================================

raw_masks = results[0].masks.data.cpu().numpy()
classes = results[0].boxes.cls.cpu().numpy()

# ============================================================
# 원본 크기로 복원된 mask 저장
# ============================================================

resized_masks = []

for mask in raw_masks:

    resized = cv2.resize(
        mask,
        (img_rgb.shape[1], img_rgb.shape[0])
    )

    resized_masks.append(resized)

# ============================================================
# tray / 음식 분리
# ============================================================

tray_mask = None
tray_area = 0

# 음식 mask 저장용
food_masks = []

for mask, cls in zip(resized_masks, classes):

    cls = int(cls)

    area = np.sum(mask)

    # ========================================================
    # tray
    # ========================================================

    if cls == 0:

        if area > tray_area:

            tray_area = area
            tray_mask = mask

    # ========================================================
    # 음식
    # ========================================================

    elif cls in [1,2,3,4,5]:

        # 여러 음식 저장 가능
        food_masks.append((cls, mask))
# ============================================================
# tray 검출 확인
# ============================================================

if tray_mask is None:
    raise Exception("tray 검출 실패")

# ============================================================
# tray mask 원본 크기로 resize
# ============================================================

tray_mask_resized = cv2.resize(
    tray_mask,
    (img_rgb.shape[1], img_rgb.shape[0])
)

tray_mask_uint8 = (
    tray_mask_resized * 255
).astype(np.uint8)
# ============================================================
# mask smoothing
# ============================================================

kernel = np.ones((9,9), np.uint8)

tray_mask_uint8 = cv2.morphologyEx(
    tray_mask_uint8,
    cv2.MORPH_CLOSE,
    kernel
)

tray_mask_uint8 = cv2.morphologyEx(
    tray_mask_uint8,
    cv2.MORPH_OPEN,
    kernel
)

tray_mask_uint8 = cv2.GaussianBlur(
    tray_mask_uint8,
    (5,5),
    0
)

# ============================================================
# contour 찾기
# ============================================================

contours, _ = cv2.findContours(
    tray_mask_uint8,
    cv2.RETR_EXTERNAL,
    cv2.CHAIN_APPROX_SIMPLE
)

largest_contour = max(
    contours,
    key=cv2.contourArea
)

# ============================================================
# contour 기반 실제 꼭짓점 검출
# ============================================================

# ============================================================
# contour 찾기
# ============================================================

contours, _ = cv2.findContours(
    tray_mask_uint8,
    cv2.RETR_EXTERNAL,
    cv2.CHAIN_APPROX_SIMPLE
)

largest_contour = max(
    contours,
    key=cv2.contourArea
)

# ============================================================
# contour mask 생성
# ============================================================

contour_mask = np.zeros_like(tray_mask_uint8)

cv2.drawContours(
    contour_mask,
    [largest_contour],
    -1,
    255,
    thickness=15
)

# ============================================================
# edge 검출
# ============================================================

edges = cv2.Canny(
    contour_mask,
    50,
    150
)

# ============================================================
# Hough Line 검출
# ============================================================

lines = cv2.HoughLinesP(
    edges,
    1,
    np.pi / 180,
    threshold=100,
    minLineLength=400,
    maxLineGap=50
)

if lines is None:
    raise Exception("직선 검출 실패")

# ============================================================
# 수평 / 수직 선 분리
# ============================================================

horizontal = []
vertical = []

line_img = img_rgb.copy()

for l in lines:

    x1, y1, x2, y2 = l[0]

    dx = x2 - x1
    dy = y2 - y1

    angle = math.degrees(
        math.atan2(dy, dx)
    )

    length = np.sqrt(dx*dx + dy*dy)

    if length < 300:
        continue

    # 수평선
    if abs(angle) < 20:

        horizontal.append((x1,y1,x2,y2))

        cv2.line(
            line_img,
            (x1,y1),
            (x2,y2),
            (0,255,0),
            3
        )

    # 수직선
    elif abs(angle) > 70:

        vertical.append((x1,y1,x2,y2))

        cv2.line(
            line_img,
            (x1,y1),
            (x2,y2),
            (255,0,0),
            3
        )


# ============================================================
# 선 부족 검사
# ============================================================

if len(horizontal) < 2 or len(vertical) < 2:
    raise Exception("외곽선 부족")

# ============================================================
# 가장 바깥 선 선택
# ============================================================

top_line = min(
    horizontal,
    key=lambda l: (l[1] + l[3]) / 2
)

bottom_line = max(
    horizontal,
    key=lambda l: (l[1] + l[3]) / 2
)

left_line = min(
    vertical,
    key=lambda l: (l[0] + l[2]) / 2
)

right_line = max(
    vertical,
    key=lambda l: (l[0] + l[2]) / 2
)

# ============================================================
# 직선 교차점 계산 함수
# ============================================================

def line_intersection(line1, line2):

    x1, y1, x2, y2 = map(float, line1)
    x3, y3, x4, y4 = map(float, line2)

    denom = (
        (x1-x2)*(y3-y4)
        -
        (y1-y2)*(x3-x4)
    )

    if denom == 0:
        return None

    px = (
        ((x1*y2 - y1*x2)*(x3-x4)
        -
        (x1-x2)*(x3*y4 - y3*x4))
        / denom
    )

    py = (
        ((x1*y2 - y1*x2)*(y3-y4)
        -
        (y1-y2)*(x3*y4 - y3*x4))
        / denom
    )

    return [px, py]

# ============================================================
# 4개 교차점 계산
# ============================================================

tl = line_intersection(top_line, left_line)
tr = line_intersection(top_line, right_line)
br = line_intersection(bottom_line, right_line)
bl = line_intersection(bottom_line, left_line)

corners = np.array(
    [tl, tr, br, bl],
    dtype=np.float32
)

# ============================================================
# 꼭짓점 정렬
# ============================================================

def order_points(pts):

    rect = np.zeros((4,2), dtype="float32")

    s = pts.sum(axis=1)

    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]

    diff = np.diff(pts, axis=1)

    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]

    return rect

corners = order_points(corners)


# ============================================================
# 4개 아닐 경우 처리
# ============================================================

if len(corners) != 4:

    print("자동 꼭짓점 검출 실패")

    # fallback
   # ============================================================
# contour 기반 실제 꼭짓점 검출
# ============================================================

epsilon = (
    0.02 *
    cv2.arcLength(largest_contour, True)
)

approx = cv2.approxPolyDP(
    largest_contour,
    epsilon,
    True
)

corners = approx.reshape(-1, 2)

print("검출된 꼭짓점 개수:", len(corners))

# ============================================================
# convex hull 적용
# ============================================================

if len(corners) > 4:

    hull = cv2.convexHull(corners)

    epsilon2 = (
        0.05 *
        cv2.arcLength(hull, True)
    )

    approx2 = cv2.approxPolyDP(
        hull,
        epsilon2,
        True
    )

    corners = approx2.reshape(-1, 2)

# ============================================================
# fallback
# ============================================================

if len(corners) != 4:

    print("자동 꼭짓점 검출 실패 → fallback")

    rect = cv2.minAreaRect(
        largest_contour
    )

    box = cv2.boxPoints(rect)

    corners = np.intp(box)

# ============================================================
# 꼭짓점 정렬
# ============================================================

def order_points(pts):

    rect = np.zeros((4,2), dtype="float32")

    s = pts.sum(axis=1)

    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]

    diff = np.diff(pts, axis=1)

    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]

    return rect

corners = order_points(corners)

# ============================================================
# 꼭짓점 시각화
# ============================================================

corner_img = img_rgb.copy()

for i, point in enumerate(corners):

    x, y = point.astype(int)

    cv2.circle(
        corner_img,
        (x,y),
        15,
        (255,0,0),
        -1
    )

    cv2.putText(
        corner_img,
        str(i),
        (x+20, y),
        cv2.FONT_HERSHEY_SIMPLEX,
        1,
        (255,0,0),
        3
    )


# ============================================================
# Perspective Transform
# ============================================================

pts_src = np.array(
    corners,
    dtype=np.float32
)

pts_dst = np.array([
    [0,0],
    [WARP_WIDTH,0],
    [WARP_WIDTH,WARP_HEIGHT],
    [0,WARP_HEIGHT]
], dtype=np.float32)

matrix = cv2.getPerspectiveTransform(
    pts_src,
    pts_dst
)

warped = cv2.warpPerspective(
    img_rgb,
    matrix,
    (WARP_WIDTH, WARP_HEIGHT)
)


# ============================================================
# 음식 segmentation 시각화
# ============================================================

visual = warped.copy()

section_food_areas = {}

for cls, food_mask in food_masks:

    # ========================================================
    # warp
    # ========================================================

    warped_mask = cv2.warpPerspective(
        food_mask.astype(np.float32),
        matrix,
        (WARP_WIDTH, WARP_HEIGHT)
    )
    
    # ========================================================
    # 면적
    # ========================================================

    pixel_area = np.sum(warped_mask > 0.2)

    if cls not in section_food_areas:
        section_food_areas[cls] = 0

    section_food_areas[cls] += pixel_area

    # ========================================================
    # 시각화
    # ========================================================

    visual[warped_mask > 0.2] = [255,0,0]


# ============================================================
# 전체 음식 면적
# ============================================================

food_area = sum(
    section_food_areas.values()
)

# ============================================================
# 실제 면적 계산
# ============================================================

real_tray_area = (
    REAL_TRAY_WIDTH *
    REAL_TRAY_HEIGHT
)

warp_pixel_area = (
    WARP_WIDTH *
    WARP_HEIGHT
)

cm2_per_pixel = (
    real_tray_area /
    warp_pixel_area
)

print("\n===== 칸별 음식 실제 면적 =====")

total_kcal = 0

for cls in range(1, 6):

    # ====================================================
    # 면적 계산
    # ====================================================

    pixel_area = section_food_areas.get(cls, 0)

    real_area = pixel_area * cm2_per_pixel

    # ====================================================
    # 음식 정보
    # ====================================================

    food_name = tray_foods[cls]

    food_height = TRAY_HEIGHTS[cls]

    volume_cm3 = real_area * food_height

    density = 0.8

    # ====================================================
    # 국 여부 검사
    # ====================================================

    is_soup = False

    for keyword in SOUP_KEYWORDS:

        if keyword in food_name:

            is_soup = True
            break

    # ====================================================
    # 사용자가 입력한 국 이름도 인정
    # ====================================================

    if food_name.strip() == soup_food.strip():

        is_soup = True

    # ====================================================
    # 무게 계산
    # ====================================================

    if is_soup:

        estimated_weight = 350

    else:

        estimated_weight = (
            volume_cm3 * density
        )

    # ====================================================
    # kcal 조회
    # ====================================================

    kcal_per_100g = get_food_kcal(food_name)

    if kcal_per_100g is None:

        kcal_per_100g = 150

    # ====================================================
    # 칼로리 계산
    # ====================================================

    kcal = (
        estimated_weight / 100
    ) * kcal_per_100g

    total_kcal += kcal

    # ====================================================
    # 출력
    # ====================================================

    print(f"""
음식명: {food_name}

실제 면적: {real_area:.2f} cm²
평균 높이: {food_height:.2f} cm

부피: {volume_cm3:.2f} cm³

예상 무게: {estimated_weight:.1f} g

100g당 kcal: {kcal_per_100g}

예상 칼로리: {kcal:.1f} kcal
""")
# ============================================================
# 음식 칼로리 API
# ============================================================




# ============================================================
# 면적 → 무게 추정
# ============================================================


plt.figure(figsize=(10,8))
plt.imshow(visual)
plt.title("최종 결과")
plt.axis("off")
plt.show()

# ============================================================
# 총 칼로리 출력
# ============================================================

print("="*40)
print(f"총 예상 칼로리: {total_kcal:.1f} kcal")
print("="*40)

print("프로그램 완료")