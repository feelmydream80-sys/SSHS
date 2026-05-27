import time
import os
import base64
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
    # 1. AI 주간 조언 결과 화면 캡처 (학부모 리포트 탭)
    print("[1/2] AI 주간 조언 결과 화면 촬영 중...")
    driver.get(BASE_URL)
    time.sleep(4)
    
    # 학부모 리포트 탭 클릭
    tabs = driver.find_elements(By.CSS_SELECTOR, ".tab")
    for tab in tabs:
        onclick = tab.get_attribute("onclick") or ""
        if "report" in onclick or "리포트" in tab.text:
            tab.click()
            break
    time.sleep(5)
    
    # AI 조언 버튼 클릭
    ai_btn = driver.find_element(By.ID, "wab")
    if ai_btn and ai_btn.is_displayed():
        ai_btn.click()
        time.sleep(8)  # AI 응답 대기
    
    driver.save_screenshot(os.path.join(OUTPUT_DIR, "screenshot_ai_report.png"))
    print("  -> screenshot_ai_report.png 저장 완료")
    
    # 2. 자녀 설정 팝업 캡처
    print("[2/2] 자녀 설정 팝업 화면 촬영 중...")
    driver.get(BASE_URL)
    time.sleep(3)
    
    # 설정 버튼 클릭
    config_btn = driver.find_element(By.CSS_SELECTOR, ".config-btn")
    if config_btn:
        config_btn.click()
        time.sleep(2)
    
    # 설정 모달에서 스크린샷
    driver.save_screenshot(os.path.join(OUTPUT_DIR, "screenshot_settings.png"))
    print("  -> screenshot_settings.png 저장 완료")

finally:
    driver.quit()
    print("모든 스크린샷 촬영 완료!")
