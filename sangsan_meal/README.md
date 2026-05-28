# 상산고 급식 영양 분석 — PWA

NEIS 공공데이터 기반 AI 급식 영양 분석 서비스

---

## 📁 파일 구조

```
sangsan-pwa/
├── index.html       ← 메인 앱
├── manifest.json    ← PWA 설정
├── sw.js            ← Service Worker
├── vercel.json      ← Vercel 배포 설정
└── icons/
    ├── icon-72.png
    ├── icon-96.png
    ├── icon-128.png
    ├── icon-144.png
    ├── icon-152.png
    ├── icon-192.png
    ├── icon-384.png
    └── icon-512.png
```

---

## 🚀 Vercel 배포 방법

### 방법 A — GitHub 연동 (추천)

1. GitHub에 새 저장소 만들기
2. 이 폴더의 파일 전체 업로드
3. vercel.com 접속 → "Add New Project"
4. GitHub 저장소 선택 → Deploy 클릭
5. 완료! `https://sangsan-meal.vercel.app` 주소 발급

### 방법 B — Vercel CLI (빠름)

```bash
# Node.js 설치 후
npm install -g vercel
cd sangsan-pwa
vercel
# 질문에 모두 엔터 → 배포 완료
```

---

## 📱 PWA 설치 방법

### 안드로이드 (크롬)
1. 배포된 URL 접속
2. 주소창 오른쪽 "⋮" 메뉴
3. "앱 설치" 또는 "홈 화면에 추가"

### 아이폰 (사파리)
1. 배포된 URL 접속
2. 하단 공유 버튼 (□↑)
3. "홈 화면에 추가"

---

## 🔑 API 키 설정

앱 실행 후 ⚙ 설정 버튼에서 입력:
- **NEIS API KEY**: open.neis.go.kr 에서 발급
- **Claude API KEY**: console.anthropic.com 에서 발급 (선택)
