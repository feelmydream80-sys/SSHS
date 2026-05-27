import time
import os
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "screenshots")
os.makedirs(OUTPUT_DIR, exist_ok=True)

options = webdriver.ChromeOptions()
options.add_argument("--headless")
options.add_argument("--no-sandbox")
options.add_argument("--disable-dev-shm-usage")
options.add_argument("--window-size=1440,1000")
options.add_argument("--force-device-scale-factor=2")

driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)

BASE_URL = "http://127.0.0.1:5001/"

try:
    # 1. 오늘 급식 화면 (날짜를 2026-05-24로 변경)
    print("[1/3] 오늘 급식 화면 촬영 중...")
    driver.get(BASE_URL)
    time.sleep(3)
    # 날짜 변경
    date_input = driver.find_element(By.ID, "dp")
    driver.execute_script("arguments[0].value = '2026-05-24';", date_input)
    driver.execute_script("arguments[0].dispatchEvent(new Event('change', {bubbles: true}));", date_input)
    time.sleep(4)
    driver.save_screenshot(os.path.join(OUTPUT_DIR, "screenshot_today.png"))
    print("  -> screenshot_today.png 저장 완료")

    # 2. 월간 통계 화면
    print("[2/3] 월간 통계 화면 촬영 중...")
    tabs = driver.find_elements(By.CSS_SELECTOR, ".tab")
    for tab in tabs:
        onclick = tab.get_attribute("onclick") or ""
        if "stats" in onclick or "월간" in tab.text:
            tab.click()
            break
    time.sleep(8)  # 로딩 대기 시간 증가
    driver.save_screenshot(os.path.join(OUTPUT_DIR, "screenshot_stats.png"))
    print("  -> screenshot_stats.png 저장 완료")

    # 3. 이미지 분석 화면
    print("[3/3] 이미지 분석 화면 촬영 중...")
    tabs = driver.find_elements(By.CSS_SELECTOR, ".tab")
    for tab in tabs:
        onclick = tab.get_attribute("onclick") or ""
        if "image" in onclick or "이미지" in tab.text:
            tab.click()
            break
    time.sleep(3)
    driver.save_screenshot(os.path.join(OUTPUT_DIR, "screenshot_image.png"))
    print("  -> screenshot_image.png 저장 완료")

finally:
    driver.quit()
    print("모든 스크린샷 촬영 완료!")
