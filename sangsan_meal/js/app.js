const SCHOOL = { ATPT: 'P10', CODE: '8321090' };
const NEIS = 'https://open.neis.go.kr/hub/mealServiceDietInfo';
const SIDO_LIST = [
  { code: 'B10', name: '서울특별시' }, { code: 'C10', name: '부산광역시' }, { code: 'D10', name: '대구광역시' },
  { code: 'E10', name: '인천광역시' }, { code: 'F10', name: '광주광역시' }, { code: 'G10', name: '대전광역시' },
  { code: 'H10', name: '울산광역시' }, { code: 'I10', name: '세종특별자치시' }, { code: 'J10', name: '경기도' },
  { code: 'K10', name: '강원도' }, { code: 'L10', name: '충청북도' }, { code: 'M10', name: '충청남도' },
  { code: 'N10', name: '전라북도' }, { code: 'O10', name: '전라남도' }, { code: 'P10', name: '전북특별자치도' },
  { code: 'Q10', name: '경상남도' }, { code: 'R10', name: '제주특별자치도' }
];
const DEFAULT_SCHOOL = { ATPT: 'P10', CODE: '8321090', NAME: '상산고등학교' };
let currentSchool = { ...DEFAULT_SCHOOL };

const PROXIES = [
  { url: u => u, parse: async r => await r.json() },
  { url: u => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`, parse: async r => { const o = await r.json(); return JSON.parse(o.contents); } },
  { url: u => `https://api.codetabs.com/v1/proxy?quest=${u}`, parse: async r => await r.json() },
  { url: u => `https://corsproxy.io/?${u}`, parse: async r => await r.json() }
];

async function fetchWithProxy(neisUrl) {
  let lastErr;
  for (const proxy of PROXIES) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(proxy.url(neisUrl), { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) { lastErr = new Error(`HTTP ${res.status}`); continue; }
      const j = await proxy.parse(res);
      if (j && (j.mealServiceDietInfo || j.RESULT)) return j;
      lastErr = new Error('유효하지 않은 응답');
    } catch (e) { lastErr = e; console.warn('프록시 실패:', e.message); }
  }
  throw lastErr || new Error('모든 프록시 실패');
}

const AM = { 1: '난류', 2: '우유', 3: '메밀', 4: '땅콩', 5: '대두', 6: '밀', 7: '고등어', 8: '게', 9: '새우(김치)', 10: '돼지고기', 11: '복숭아', 12: '토마토', 13: '아황산류', 14: '호두', 15: '닭고기', 16: '쇠고기', 17: '오징어', 18: '조개류' };
const DRI = {
  '탄수화물(g)': { rec: 350, color: '#7eb8ff' },
  '단백질(g)': { rec: 65, color: '#4fffb0' },
  '지방(g)': { rec: 75, color: '#ffd60a' },
  '칼슘(mg)': { rec: 900, color: '#ff9f43' },
  '철분(mg)': { rec: 14, color: '#c77dff' },
  '비타민C(mg)': { rec: 100, color: '#ff6b9d' }
};
const MEAL_RATIO = { '조식': 0.35, '중식': 1.0, '석식': 1.0 };
function getMealRec(key, mealName) { return DRI[key].rec * (MEAL_RATIO[mealName] || 1.0); }
const MC = { '조식': '#ff9f43', '중식': '#4fffb0', '석식': '#7eb8ff' };
const PALETTE = ['#4fffb0', '#7eb8ff', '#ffd60a', '#ff6b6b', '#ff9f43', '#c77dff', '#ff6b9d', '#48dbfb'];

let db = null; let _reportPeriod = 'week'; let _childProfile = null; _imageData = null; let _dataSource = 'weekly';
const DB_NAME = 'sangsan-meal-cache', DB_VERSION = 1, STORE_NAME = 'meals';
function openDB() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onerror = () => reject(r.error);
    r.onsuccess = () => { db = r.result; resolve(db); };
    r.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains(STORE_NAME)) { d.createObjectStore(STORE_NAME, { keyPath: 'id' }); }
    };
  });
}
async function saveMealCache(key, data) {
  if (!db) await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).put({ id: key, data: data, time: Date.now() });
  return new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
}
async function loadMealCache(key) {
  if (!db) await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const req = tx.objectStore(STORE_NAME).get(key);
  return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}
async function clearMealCache() {
  if (!db) await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).clear();
  return new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
}
function makeCacheKey(from, to, school) { return `${school.ATPT}_${school.CODE}_${from}_${to}`; }

function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

const DEFAULT_NEIS_KEY = '35b75a10a2fe426b8aa1b072ab2be207';
const DEFAULT_GEMINI_KEY = 'AIzaSyBHinJjUFWIv2z9QA39rl8ONM4rAIfjqOQ';
const DEFAULT_DEEPSEEK_KEY = 'sk-omLs4GxwcqzeobbhlCPyhjSqSYKbAp88j8nzxmXFnM9w40wF5SOrFGKpKjFQ67pw';
let NK = '', GK = '', MA = [], SY = 2025, SM = 4, CHARTS = {}, _aiModel = 'gemini';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(r => console.log('SW 등록 완료:', r.scope))
      .catch(e => console.log('SW 등록 실패:', e));
  });
}

window.onload = async () => {
  NK = localStorage.getItem('neis_key') || DEFAULT_NEIS_KEY;
  GK = localStorage.getItem('gemini_key') || DEFAULT_GEMINI_KEY;
  MA = JSON.parse(localStorage.getItem('my_allergies') || '[]');
  _childProfile = loadProfile();
  _aiModel = localStorage.getItem('ai_model') || 'gemini';
  const savedSchool = localStorage.getItem('selected_school');
  if (savedSchool) currentSchool = JSON.parse(savedSchool);
  if (!localStorage.getItem('neis_key')) localStorage.setItem('neis_key', NK);
  await openDB();
  initNavSchoolSelect();
  const navSchool = document.getElementById('navSchoolSearch');
  if (currentSchool.CODE && currentSchool.NAME) { navSchool.innerHTML = `<option value="${currentSchool.CODE}|${currentSchool.NAME}">${currentSchool.NAME}</option>`; }
  const t = new Date(); SY = t.getFullYear(); SM = t.getMonth() + 1;
  document.getElementById('dp').value = fd(t, '-');
  updMD();
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('on'));
  document.querySelector('.tab').classList.add('on');
  ['today', 'stats', 'allergy', 'report'].forEach(name => {
    const el = document.getElementById('tab-' + name);
    if (el) el.style.display = name === 'today' ? 'block' : 'none';
  });
  loadToday(); renderAG();
};

function showModal() {
  document.getElementById('ni').value = NK;
  document.getElementById('gi').value = GK;
  document.getElementById('currentSchoolName').textContent = currentSchool.NAME;
  document.getElementById('modal').style.display = 'flex';
}
function saveKeys() {
  const nk = document.getElementById('ni').value.trim(), gk = document.getElementById('gi').value.trim();
  if (!nk) { alert('NEIS API 키를 입력해주세요.'); return; }
  NK = nk; GK = gk; localStorage.setItem('neis_key', nk); localStorage.setItem('gemini_key', gk);
  document.getElementById('modal').style.display = 'none';
  loadToday(); renderAG();
}
function toggleSchoolPanel() {
  const panel = document.getElementById('schoolPanel');
  const saveBtn = document.getElementById('saveBtn');
  panel.classList.toggle('on');
  if (panel.classList.contains('on')) {
    const sidoSel = document.getElementById('sidoSelect');
    sidoSel.innerHTML = '<option value="">시·도 선택</option>' + SIDO_LIST.map(s => `<option value="${s.code}">${s.name}</option>`).join('');
    document.getElementById('levelSelect').value = '';
    document.getElementById('schoolSearchInput').value = '';
    document.getElementById('schoolSelect').innerHTML = '<option value="">시·도와 학교급을 먼저 선택해주세요</option>';
    window._selectedSchool = null; window._schoolRows = null;
    saveBtn.style.display = 'none';
  } else { saveBtn.style.display = 'block'; }
}

function applySchool() {
  if (!window._selectedSchool) { alert('학교를 검색하여 선택해주세요.'); return; }
  currentSchool = window._selectedSchool;
  localStorage.setItem('selected_school', JSON.stringify(currentSchool));
  document.getElementById('currentSchoolName').textContent = currentSchool.NAME;
  document.getElementById('navSchoolSearch').value = currentSchool.NAME;
  toggleSchoolPanel();
  loadToday();
}
async function doClearCache() {
  if (!confirm('저장된 급식 캐시를 모두 삭제하시겠습니까?')) return;
  try { await clearMealCache(); alert('캐시가 삭제되었습니다.'); } catch (e) { alert('캐시 삭제 실패: ' + e.message); }
}

function fd(d, s) { const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0'); return s ? `${y}${s}${m}${s}${dd}` : `${y}${m}${dd}`; }
function fd2(d) { const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0'); return `${y}${m}${dd}`; }
function cd(n) { const c = new Date(document.getElementById('dp').value); c.setDate(c.getDate() + n); document.getElementById('dp').value = fd(c, '-'); loadToday(); }
function cm(n) { SM += n; if (SM > 12) { SM = 1; SY++; } if (SM < 1) { SM = 12; SY--; } updMD(); if (document.getElementById('tab-stats').style.display !== 'none') loadMonthlyStats(); }
function updMD() { document.getElementById('md').textContent = `${SY}년 ${String(SM).padStart(2, '0')}월`; }

function getWeekDates(sy, sm, weekNum) {
  const lastDay = new Date(sy, sm, 0).getDate();
  const weekStarts = weekNum <= 4 ? [1, 8, 15, 22][weekNum - 1] : 29;
  const startDay = weekStarts;
  const endDay = Math.min(startDay + 6, lastDay);
  const from = `${sy}${String(sm).padStart(2, '0')}${String(startDay).padStart(2, '0')}`;
  const to = `${sy}${String(sm).padStart(2, '0')}${String(endDay).padStart(2, '0')}`;
  return { from, to, label: `${weekNum}주차 (${startDay}~${endDay}일)` };
}

async function loadMonthlyStats() {
  const box = document.getElementById('stats-box');
  box.innerHTML = '<div class="loading-wrap"><div class="spinner"></div><div style="color:var(--muted);font-size:13px">월간 통계를 분석중...</div></div>';
  
  let allHtml = '';
  for (let w = 1; w <= 5; w++) {
    const { from, to, label } = getWeekDates(SY, SM, w);
    try {
      const rows = await fetchRange(from, to);
      if (!rows.length) { allHtml += `<div class="week-card"><div class="week-card-header">${label}</div><div class="empty">급식 정보가 없습니다.</div></div>`; continue; }
      const byDate = {};
      rows.forEach(r => { if (!byDate[r.MLSV_YMD]) byDate[r.MLSV_YMD] = []; byDate[r.MLSV_YMD].push(r); });
      const dates = Object.keys(byDate).sort();
      const calByDate = dates.map(d => ({ date: d, cal: byDate[d].reduce((s, r) => s + parseFloat(r.CAL_INFO || 0), 0) }));
      const avgCal = dates.length ? Math.round(calByDate.reduce((s, d) => s + d.cal, 0) / dates.length) : 0;
      const ntrSums = {}, ntrOver = {}, ntrLow = {};
      Object.keys(DRI).forEach(k => { ntrSums[k] = 0; ntrOver[k] = 0; ntrLow[k] = 0; });
      dates.forEach(d => {
        const dn = {}; Object.keys(DRI).forEach(k => dn[k] = 0);
        byDate[d].forEach(r => { const n = pNtr(r.NTR_INFO); Object.keys(DRI).forEach(k => dn[k] += (n[k] || 0)); });
        Object.keys(DRI).forEach(k => { ntrSums[k] += dn[k]; const r = dn[k] / DRI[k].rec; if (r > 1.2) ntrOver[k]++; else if (r < 0.7) ntrLow[k]++; });
      });
      const ntrAvgs = {}; Object.keys(DRI).forEach(k => ntrAvgs[k] = Math.round(ntrSums[k] / dates.length));
      const ac = {};
      rows.forEach(r => pDish(r.DDISH_NM).forEach(d => d.nums.forEach(n => { ac[n] = (ac[n] || 0) + 1; })));
      const menuSet = new Set();
      rows.forEach(r => pDish(r.DDISH_NM).forEach(d => menuSet.add(d.name)));
      allHtml += `<div class="week-card" id="week-card-${w}">
        <div class="week-card-header">${label}</div>
        <div class="stat-grid">
          <div class="stat-card"><div class="stat-label">평균 칼로리</div><div class="stat-value" style="color:var(--yellow)">${avgCal.toLocaleString()}<span class="stat-unit">Kcal</span></div><div class="stat-sub">${dates.length}일 / ${rows.length}끼</div></div>
          <div class="stat-card"><div class="stat-label">메뉴 종류</div><div class="stat-value" style="color:var(--green)">${menuSet.size}<span class="stat-unit">종</span></div></div>
          <div class="stat-card"><div class="stat-label">평균 단백질</div><div class="stat-value" style="color:var(--blue)">${ntrAvgs['단백질(g)'] || 0}<span class="stat-unit">g</span></div><div class="stat-sub">권장 ${Math.round((ntrAvgs['단백질(g)'] || 0) / DRI['단백질(g)'].rec * 100)}%</div></div>
          <div class="stat-card"><div class="stat-label">평균 칼슘</div><div class="stat-value" style="color:var(--orange)">${ntrAvgs['칼슘(mg)'] || 0}<span class="stat-unit">mg</span></div><div class="stat-sub">권장 ${Math.round((ntrAvgs['칼슘(mg)'] || 0) / DRI['칼슘(mg)'].rec * 100)}%</div></div>
        </div>
        <div class="chart-card">
          <div class="chart-title">📈 일별 칼로리 트렌드</div>
          <div class="chart-wrap"><canvas id="wc${w}"></canvas></div>
        </div>
        <div class="chart-card">
          <div class="chart-title">⚠️ 알레르기 식품 노출</div>
          <div id="wael${w}"></div>
        </div>
      </div>`;
      setTimeout(() => {
        new Chart(document.getElementById(`wc${w}`), {
          type: 'line',
          data: {
            labels: calByDate.map(d => `${d.date.slice(6)}일`),
            datasets: [
              { label: '일별 칼로리', data: calByDate.map(d => d.cal), borderColor: '#ffd60a', backgroundColor: 'rgba(255,214,10,.08)', tension: .4, pointRadius: 3, pointBackgroundColor: '#ffd60a', fill: true },
              { label: '권장 2600Kcal', data: calByDate.map(() => 2600), borderColor: 'rgba(255,107,107,.4)', borderDash: [6, 4], pointRadius: 0, fill: false }
            ]
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: 'rgba(255,255,255,.4)', font: { family: 'Space Mono', size: 9 } }, grid: { color: 'rgba(255,255,255,.05)' } }, y: { ticks: { color: 'rgba(255,255,255,.4)', font: { family: 'Space Mono', size: 9 } }, grid: { color: 'rgba(255,255,255,.05)' } } } }
        });
        const top = Object.entries(ac).sort((a, b) => b[1] - a[1]).slice(0, 8);
        const mx = top[0]?.[1] || 1;
        document.getElementById(`wael${w}`).innerHTML = top.map(([n, cnt]) => {
          const im = MA.includes(Number(n));
          return `<div class="exp-row"><div class="exp-name">${im ? '⚠️ ' : ''}<span style="color:${im ? 'var(--red)' : 'var(--text)'}">${AM[n] || n + '번'}</span></div><div class="exp-bar-wrap"><div class="exp-fill" style="width:${cnt / mx * 100}%;background:${im ? 'var(--red)' : 'rgba(255,255,255,.25)'}"></div></div><div class="exp-count">${cnt}회</div></div>`;
        }).join('');
      }, 100);
    } catch (e) { allHtml += `<div class="week-card"><div class="week-card-header">${label}</div><div class="empty">⚠️ 데이터 로드 실패: ${e.message}</div></div>`; }
  }
  box.innerHTML = allHtml || '<div class="empty">이번 달 급식 정보가 없습니다.</div>';
}

async function loadWeek(weekNum) {
  const box = document.getElementById('stats-box');
  const weekBtn = document.getElementById(`wb${weekNum}`);
  if (weekBtn.classList.contains('loaded')) { return; }
  weekBtn.disabled = true; weekBtn.textContent = '로딩중...';
  const { from, to, label } = getWeekDates(SY, SM, weekNum);
  try {
    const rows = await fetchRange(from, to);
    const existingCard = document.getElementById(`week-card-${weekNum}`);
    if (existingCard) { weekBtn.classList.add('loaded'); weekBtn.disabled = false; weekBtn.textContent = `${weekNum}주차 ✓`; return; }
    if (!rows.length) { box.innerHTML += `<div class="week-card" id="week-card-${weekNum}"><div class="empty">${label}: 급식 정보가 없습니다.</div></div>`; weekBtn.classList.add('loaded'); weekBtn.disabled = false; weekBtn.textContent = `${weekNum}주차`; return; }
    const byDate = {};
    rows.forEach(r => { if (!byDate[r.MLSV_YMD]) byDate[r.MLSV_YMD] = []; byDate[r.MLSV_YMD].push(r); });
    const dates = Object.keys(byDate).sort();
    const calByDate = dates.map(d => ({ date: d, cal: byDate[d].reduce((s, r) => s + parseFloat(r.CAL_INFO || 0), 0) }));
    const avgCal = dates.length ? Math.round(calByDate.reduce((s, d) => s + d.cal, 0) / dates.length) : 0;
    const ntrSums = {}, ntrOver = {}, ntrLow = {};
    Object.keys(DRI).forEach(k => { ntrSums[k] = 0; ntrOver[k] = 0; ntrLow[k] = 0; });
    dates.forEach(d => {
      const dn = {}; Object.keys(DRI).forEach(k => dn[k] = 0);
      byDate[d].forEach(r => { const n = pNtr(r.NTR_INFO); Object.keys(DRI).forEach(k => dn[k] += (n[k] || 0)); });
      Object.keys(DRI).forEach(k => { ntrSums[k] += dn[k]; const r = dn[k] / DRI[k].rec; if (r > 1.2) ntrOver[k]++; else if (r < 0.7) ntrLow[k]++; });
    });
    const ntrAvgs = {}; Object.keys(DRI).forEach(k => ntrAvgs[k] = Math.round(ntrSums[k] / dates.length));
    const ac = {};
    rows.forEach(r => pDish(r.DDISH_NM).forEach(d => d.nums.forEach(n => { ac[n] = (ac[n] || 0) + 1; })));
    const menuSet = new Set();
    rows.forEach(r => pDish(r.DDISH_NM).forEach(d => menuSet.add(d.name)));
    const cardId = `week-card-${weekNum}`;
    const cardHtml = `
<div class="week-card" id="${cardId}">
  <div class="week-card-header">${label}</div>
  <div class="stat-grid">
    <div class="stat-card"><div class="stat-label">평균 칼로리</div><div class="stat-value" style="color:var(--yellow)">${avgCal.toLocaleString()}<span class="stat-unit">Kcal</span></div><div class="stat-sub">${dates.length}일 / ${rows.length}끼</div></div>
    <div class="stat-card"><div class="stat-label">메뉴 종류</div><div class="stat-value" style="color:var(--green)">${menuSet.size}<span class="stat-unit">종</span></div></div>
    <div class="stat-card"><div class="stat-label">평균 단백질</div><div class="stat-value" style="color:var(--blue)">${ntrAvgs['단백질(g)'] || 0}<span class="stat-unit">g</span></div><div class="stat-sub">권장 ${Math.round((ntrAvgs['단백질(g)'] || 0) / DRI['단백질(g)'].rec * 100)}%</div></div>
    <div class="stat-card"><div class="stat-label">평균 칼슘</div><div class="stat-value" style="color:var(--orange)">${ntrAvgs['칼슘(mg)'] || 0}<span class="stat-unit">mg</span></div><div class="stat-sub">권장 ${Math.round((ntrAvgs['칼슘(mg)'] || 0) / DRI['칼슘(mg)'].rec * 100)}%</div></div>
  </div>
  <div class="chart-card">
    <div class="chart-title">📈 일별 칼로리 트렌드</div>
    <div class="chart-wrap"><canvas id="wc${weekNum}"></canvas></div>
  </div>
  <div class="chart-card">
    <div class="chart-title">⚠️ 알레르기 식품 노출</div>
    <div id="wael${weekNum}"></div>
  </div>
</div>`;
    const existingWeekCards = box.querySelectorAll('.week-card');
    if (existingWeekCards.length > 0) {
      existingWeekCards[existingWeekCards.length - 1].insertAdjacentHTML('afterend', cardHtml);
    } else {
      box.innerHTML = cardHtml;
    }
    new Chart(document.getElementById(`wc${weekNum}`), {
      type: 'line',
      data: {
        labels: calByDate.map(d => `${d.date.slice(6)}일`),
        datasets: [
          { label: '일별 칼로리', data: calByDate.map(d => d.cal), borderColor: '#ffd60a', backgroundColor: 'rgba(255,214,10,.08)', tension: .4, pointRadius: 3, pointBackgroundColor: '#ffd60a', fill: true },
          { label: '권장 2600Kcal', data: calByDate.map(() => 2600), borderColor: 'rgba(255,107,107,.4)', borderDash: [6, 4], pointRadius: 0, fill: false }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(0,0,0,.8)', titleFont: { family: 'Space Mono' }, bodyFont: { family: 'Space Mono' }, callbacks: { label: c => `${c.parsed.y.toLocaleString()} Kcal` } } }, scales: { x: { ticks: { color: 'rgba(255,255,255,.4)', font: { family: 'Space Mono', size: 9 } }, grid: { color: 'rgba(255,255,255,.05)' } }, y: { ticks: { color: 'rgba(255,255,255,.4)', font: { family: 'Space Mono', size: 9 } }, grid: { color: 'rgba(255,255,255,.05)' } } } }
    });
    const top = Object.entries(ac).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const mx = top[0]?.[1] || 1;
    document.getElementById(`wael${weekNum}`).innerHTML = top.map(([n, cnt]) => {
      const im = MA.includes(Number(n));
      return `<div class="exp-row"><div class="exp-name">${im ? '⚠️ ' : ''}<span style="color:${im ? 'var(--red)' : 'var(--text)'}">${AM[n] || n + '번'}</span></div><div class="exp-bar-wrap"><div class="exp-fill" style="width:${cnt / mx * 100}%;background:${im ? 'var(--red)' : 'rgba(255,255,255,.25)'}"></div></div><div class="exp-count">${cnt}회</div></div>`;
    }).join('');
  } catch (e) {
    const existingCard = document.getElementById(`week-card-${weekNum}`);
    if (existingCard) existingCard.remove();
    box.innerHTML += `<div class="week-card" id="week-card-${weekNum}"><div class="empty">⚠️ ${label} 데이터 로드 실패: ${e.message}</div></div>`;
  }
  weekBtn.classList.add('loaded');
  weekBtn.disabled = false;
  weekBtn.textContent = `${weekNum}주차 ✓`;
}

async function fetchRange(f, t) {
  const cacheKey = makeCacheKey(f, t, currentSchool);
  try {
    const cached = await loadMealCache(cacheKey);
    if (cached && cached.data) { console.log('캐시 히트:', cacheKey); return cached.data; }
  } catch (e) { console.warn('캐시 로드 실패:', e.message); }
  const allRows = [];
  const start = new Date(f.slice(0, 4) + '-' + f.slice(4, 6) + '-' + f.slice(6, 8));
  const end = new Date(t.slice(0, 4) + '-' + t.slice(4, 6) + '-' + t.slice(6, 8));
  let cur = new Date(start);
  let attempt = 0;
  while (cur <= end) {
    const chunkFrom = fd2(cur);
    const chunkEnd = new Date(cur); chunkEnd.setDate(chunkEnd.getDate() + 3);
    const chunkTo = fd2(chunkEnd > end ? end : chunkEnd);
    attempt++;
    let success = false;
    for (let retry = 0; retry < 3 && !success; retry++) {
      try {
        await new Promise(r => setTimeout(r, retry * 800));
        const url = `https://open.neis.go.kr/hub/mealServiceDietInfo?KEY=${NK}&Type=json&pIndex=1&pSize=50&ATPT_OFCDC_SC_CODE=${currentSchool.ATPT}&SD_SCHUL_CODE=${currentSchool.CODE}&MLSV_FROM_YMD=${chunkFrom}&MLSV_TO_YMD=${chunkTo}`;
        const j = await fetchWithProxy(url);
        const rows = j.mealServiceDietInfo?.[1]?.row || [];
        if (rows.length) { allRows.push(...rows); success = true; }
        else { console.warn(`${chunkFrom}~${chunkTo} 응답 없음, 재시도 ${retry + 1}`); }
      } catch (e) { console.warn(`${chunkFrom}~${chunkTo} 실패 (${retry + 1}/3):`, e.message); }
    }
    cur.setDate(cur.getDate() + 4);
  }
  if (allRows.length > 0) {
    try { await saveMealCache(cacheKey, allRows); console.log('캐시 저장:', cacheKey); } catch (e) { console.warn('캐시 저장 실패:', e.message); }
  }
  return allRows;
}

function pNtr(s) {
  const r = {};
  (s || '').split('<br/>').forEach(x => {
    const [k, v] = x.split(':').map(a => a.trim());
    if (k && v) r[k] = parseFloat(v) || 0;
  });
  return r;
}
function pDish(s) {
  return s.split('<br/>').filter(Boolean).map(d => {
    const name = d.replace(/\s*\([\d\.]+\)/g, '').trim();
    const nums = (d.match(/\(([\d\.]+)\)/g) || []).flatMap(m => m.replace(/[()]/g, '').split('.').map(Number));
    return { name, nums };
  });
}
function gCat(n) {
  if (/밥|죽|비빔|볶음밥/.test(n)) return '밥류';
  if (/국|찌개|탕|스프/.test(n)) return '국·찌개';
  if (/김치|깍두기|나물|무침/.test(n)) return '김치·나물';
  if (/고기|불고기|갈비|닭|돼지|소고기|육/.test(n)) return '육류';
  if (/생선|고등어|갈치|조기|새우|오징어/.test(n)) return '어류·해산물';
  if (/빵|케이크|쿠키|도넛/.test(n)) return '빵·과자';
  if (/과일|사과|배|딸기|포도|귤|오렌지|수박|바나나|파인/.test(n)) return '과일';
  if (/쥬스|우유|음료|차/.test(n)) return '음료';
  if (/샐러드|야채|채소/.test(n)) return '채소·샐러드';
  if (/면|파스타|라면|우동/.test(n)) return '면류';
  if (/튀김|전|구이|볶음/.test(n)) return '구이·튀김';
  return '기타';
}

async function loadToday() {
  const dv = document.getElementById('dp').value.replace(/-/g, '');
  const box = document.getElementById('today-box');
  box.innerHTML = '<div class="loading-wrap"><div class="spinner"></div><div style="color:var(--muted);font-size:13px">급식 정보를 불러오는 중...</div></div>';
  try {
    const rows = await fetchRange(dv, dv);
    if (!rows.length) { box.innerHTML = '<div class="empty">📭 급식 정보가 없습니다.<br><span style="font-size:12px">주말이거나 방학일 수 있어요.</span></div>'; return; }
    const totalNtr = {};
    Object.keys(DRI).forEach(k => totalNtr[k] = 0);
    let totalCal = 0;
    rows.forEach(r => {
      totalCal += parseFloat(r.CAL_INFO) || 0;
      const n = pNtr(r.NTR_INFO);
      Object.keys(DRI).forEach(k => totalNtr[k] += (n[k] || 0));
    });
    const mealNames = rows.map(r => r.MMEAL_SC_NM);
    const hasBrk = mealNames.includes('조식');
    const hasLunch = mealNames.includes('중식');
    const hasDinner = mealNames.includes('석식');
    const mealList = mealNames.join(' · ');

    function calcSummary(mode) {
      let cal = 0, ntr = {};
      Object.keys(DRI).forEach(k => ntr[k] = 0);
      rows.forEach(r => {
        const ratio = (mode === 'lunchDinner' && r.MMEAL_SC_NM === '조식') ? 0 : 1;
        if (ratio === 0) return;
        cal += parseFloat(r.CAL_INFO) || 0;
        const n = pNtr(r.NTR_INFO);
        Object.keys(DRI).forEach(k => ntr[k] += (n[k] || 0));
      });
      return { cal, ntr };
    }

    const summaryTabs = `<div style="display:flex;gap:4px;margin-bottom:14px;flex-wrap:wrap">
      <button class="sum-tab on" onclick="switchSum('all',this)">전체</button>
      <button class="sum-tab" onclick="switchSum('lunchDinner',this)">중식+석식</button>
      <button class="sum-tab" onclick="switchSum('brk35',this)">조식35%+중식+석식</button>
    </div>`;

    function renderSummary(mode) {
      const { cal, ntr } = calcSummary(mode);
      const labels = { all: '전체 (조식+중식+석식)', lunchDinner: '중식+석식만', brk35: '조식35%+중식+석식' };
      const html = Object.entries(DRI).map(([k, i]) => {
        const v = Math.round(ntr[k]), pct = Math.min(v / i.rec * 100, 100), rt = Math.round(v / i.rec * 100);
        const rc = rt > 120 ? '#ff6b6b' : rt < 60 ? '#ff9f43' : '#4fffb0';
        return `<div class="ntr-row"><div class="ntr-name">${k.replace(/\(.*?\)/, '')}</div><div class="ntr-bar-wrap"><div class="ntr-bar" style="width:${pct}%;background:${i.color}"></div></div><div class="ntr-val">${v}<span style="color:${rc};margin-left:4px">${rt}%</span></div></div>`;
      }).join('');
      const calColor = cal > 3120 ? '#ff6b6b' : cal < 1560 ? '#ff9f43' : '#4fffb0';
      return { cal, html, calColor, label: labels[mode] };
    }

    const defaultMode = hasBrk ? 'brk35' : 'lunchDinner';
    const def = renderSummary(defaultMode);

    const summaryCard = `<div class="card" style="border-color:rgba(255,255,255,.12);margin-bottom:20px" id="sumCard">
      <div class="card-shine"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-family:'Space Mono',monospace;font-size:9px;letter-spacing:.18em;text-transform:uppercase;padding:4px 12px;border-radius:4px;border:1px solid rgba(255,255,255,.15);color:rgba(255,255,255,.6)">일일 합산</span>
          <span style="font-family:'Space Mono',monospace;font-size:10px;color:var(--muted)">${mealList}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <button onclick="exportDaily()" style="padding:4px 10px;background:transparent;border:1px solid var(--border);border-radius:4px;color:var(--muted);font-family:'Space Mono',monospace;font-size:8px;cursor:pointer">📥 내보내기</button>
          <span style="font-family:'Space Mono',monospace;font-size:13px;font-weight:700;color:${def.calColor}" id="sumCal">${Math.round(def.cal).toLocaleString()} Kcal <span style="font-size:10px;font-weight:300">/ 2,600 권장</span></span>
        </div>
      </div>
      ${summaryTabs}
      <div style="font-family:'Space Mono',monospace;font-size:9px;letter-spacing:.15em;color:var(--muted);text-transform:uppercase;margin-bottom:10px" id="sumLabel">${def.label}</div>
      <div id="sumNtr">${def.html}</div>
    </div>`;

    window._sumData = { rows, hasBrk, hasLunch, hasDinner };
    window.switchSum = function (mode, btn) {
      document.querySelectorAll('.sum-tab').forEach(t => t.classList.remove('on'));
      btn.classList.add('on');
      const { cal, html, calColor, label } = renderSummary(mode);
      document.getElementById('sumCal').innerHTML = `${Math.round(cal).toLocaleString()} Kcal <span style="font-size:10px;font-weight:300">/ 2,600 권장</span>`;
      document.getElementById('sumCal').style.color = calColor;
      document.getElementById('sumLabel').textContent = label;
      document.getElementById('sumNtr').innerHTML = html;
    };

    box.innerHTML = summaryCard + rows.map(r => {
      const ac = MC[r.MMEAL_SC_NM] || '#fff';
      const dishes = pDish(r.DDISH_NM);
      const ntr = pNtr(r.NTR_INFO);
      const mHTML = dishes.map(d => `<span class="menu-item ${d.nums.some(n => MA.includes(n)) ? 'aw' : ''}">${d.name}</span>`).join('');
      const nHTML = Object.entries(DRI).map(([k, i]) => {
        const v = ntr[k] || 0, rec = getMealRec(k, r.MMEAL_SC_NM), pct = Math.min(v / rec * 100, 100), rt = Math.round(v / rec * 100), rc = rt > 120 ? '#ff6b6b' : rt < 60 ? '#ff9f43' : '#4fffb0';
        return `<div class="ntr-row"><div class="ntr-name">${k.replace(/\(.*?\)/, '')}</div><div class="ntr-bar-wrap"><div class="ntr-bar" style="width:${pct}%;background:${i.color}"></div></div><div class="ntr-val">${v}<span style="color:${rc};margin-left:4px">${rt}%</span></div></div>`;
      }).join('');
      const isBreakfast = r.MMEAL_SC_NM === '조식';
      const ntrLabelTxt = isBreakfast ? '영양소 — 조식 기준 (1일 권장량의 35%)' : '영양소 — 1일 권장량 대비 %';
      return `<div class="card"><div class="card-shine"></div><div class="card-header"><span class="meal-badge" style="color:${ac};border-color:${ac}33;background:${ac}0d">${r.MMEAL_SC_NM}</span><span style="font-family:'Space Mono',monospace;font-size:12px;font-weight:700;color:${ac}">${r.CAL_INFO}</span></div><div class="menu-list">${mHTML}</div><div class="ntr-label">${ntrLabelTxt}</div>${nHTML}</div>`;
    }).join('');
  } catch (e) { box.innerHTML = `<div class="empty">⚠️ 데이터를 불러오지 못했습니다.<br><span style="font-size:12px">${e.message}</span></div>`; }
}

async function loadStats() {
  function resetBtn() { const btn = document.getElementById('slb'); if (btn) { btn.disabled = false; btn.textContent = '① 분석 시작'; } }
  const btn = document.getElementById('slb');
  btn.disabled = true; btn.textContent = '분석 중...';
  const box = document.getElementById('stats-box');
  box.innerHTML = `<div class="loading-wrap"><div class="spinner"></div><div style="color:var(--muted);font-size:13px">${SY}년 ${SM}월 데이터 분석 중...</div></div>`;
  const from = `${SY}${String(SM).padStart(2, '0')}01`;
  const last = new Date(SY, SM, 0).getDate();
  const to = `${SY}${String(SM).padStart(2, '0')}${last}`;
  try {
    const rows = await fetchRange(from, to);
    if (!rows.length) { box.innerHTML = '<div class="empty">📭 해당 월의 급식 정보가 없습니다.</div>'; resetBtn(); return; }

  const byDate = {};
    rows.forEach(r => { if (!byDate[r.MLSV_YMD]) byDate[r.MLSV_YMD] = []; byDate[r.MLSV_YMD].push(r); });
    const dates = Object.keys(byDate).sort();
    const calByDate = dates.map(d => ({ date: d, cal: byDate[d].reduce((s, r) => s + parseFloat(r.CAL_INFO || 0), 0) }));
    const avgCal = Math.round(calByDate.reduce((s, d) => s + d.cal, 0) / calByDate.length);
    const ntrSums = {}, ntrOver = {}, ntrLow = {};
    Object.keys(DRI).forEach(k => { ntrSums[k] = 0; ntrOver[k] = 0; ntrLow[k] = 0; });
    dates.forEach(d => {
      const dn = {}; Object.keys(DRI).forEach(k => dn[k] = 0);
      byDate[d].forEach(r => { const n = pNtr(r.NTR_INFO); Object.keys(DRI).forEach(k => dn[k] += (n[k] || 0)); });
      Object.keys(DRI).forEach(k => { ntrSums[k] += dn[k]; const r = dn[k] / DRI[k].rec; if (r > 1.2) ntrOver[k]++; else if (r < 0.7) ntrLow[k]++; });
    });
    const ntrAvgs = {}; Object.keys(DRI).forEach(k => ntrAvgs[k] = Math.round(ntrSums[k] / dates.length));

    const ac = {};
    rows.forEach(r => pDish(r.DDISH_NM).forEach(d => d.nums.forEach(n => { ac[n] = (ac[n] || 0) + 1; })));

    const menuSet = new Set(); const catCount = {};
    rows.forEach(r => pDish(r.DDISH_NM).forEach(d => { menuSet.add(d.name); const c = gCat(d.name); catCount[c] = (catCount[c] || 0) + 1; }));

    Object.values(CHARTS).forEach(c => c.destroy()); CHARTS = {};

    box.innerHTML = `
<div class="stat-grid">
  <div class="stat-card"><div class="stat-label">하루 평균 칼로리</div><div class="stat-value" style="color:var(--yellow)">${avgCal.toLocaleString()}<span class="stat-unit">Kcal</span></div><div class="stat-sub">분석 ${dates.length}일 / ${rows.length}끼</div></div>
  <div class="stat-card"><div class="stat-label">등장 메뉴 종류</div><div class="stat-value" style="color:var(--green)">${menuSet.size}<span class="stat-unit">종</span></div><div class="stat-sub">이번 달 전체 급식 기준</div></div>
  <div class="stat-card"><div class="stat-label">평균 단백질</div><div class="stat-value" style="color:var(--blue)">${ntrAvgs['단백질(g)']}<span class="stat-unit">g</span></div><div class="stat-sub">권장 대비 ${Math.round(ntrAvgs['단백질(g)'] / DRI['단백질(g)'].rec * 100)}%</div></div>
  <div class="stat-card"><div class="stat-label">평균 칼슘</div><div class="stat-value" style="color:var(--orange)">${ntrAvgs['칼슘(mg)']}<span class="stat-unit">mg</span></div><div class="stat-sub">권장 대비 ${Math.round(ntrAvgs['칼슘(mg)'] / DRI['칼슘(mg)'].rec * 100)}%</div></div>
</div>

<div class="chart-card">
  <div class="chart-title">📈 일별 칼로리 트렌드</div>
  <div class="chart-sub">하루 총 칼로리(조식+중식+석식) — 점선: 고1 권장 2,600Kcal</div>
  <div class="chart-wrap"><canvas id="cc"></canvas></div>
</div>

<div class="chart-card">
  <div class="chart-title">⚖️ 영양소 부족·과잉 빈도</div>
  <div class="chart-sub">이번 달 ${dates.length}일 중 권장량 70% 미만(부족) / 120% 초과(과잉) 일수</div>
  <div class="chart-wrap"><canvas id="cn"></canvas></div>
  <div class="ntr-freq-grid" id="nfd"></div>
</div>

<div class="chart-card">
  <div class="chart-title">⚠️ 알레르기 식품 월간 노출 현황</div>
  <div class="chart-sub">급식 메뉴에 등장한 알레르기 유발 식품 횟수 (상위 10개)</div>
  <div id="ael"></div>
</div>

<div class="chart-card">
  <div class="chart-title">🍱 메뉴 다양성 분석</div>
  <div class="chart-sub">이번 달 급식 메뉴 카테고리 분포</div>
  <div class="chart-wrap" style="height:280px"><canvas id="cd2"></canvas></div>
</div>

<div class="ai-card" id="aiCardStats">
  <div class="ai-header"><div class="ai-icon">✦</div><div><div style="font-size:14px;font-weight:700">AI 학부모 인사이트</div><div style="font-size:11px;color:var(--muted)">이번 달 급식 데이터 기반 맞춤 인사이트</div></div></div>
  ${renderModelBar()}
  <div class="ai-content" id="aic" style="color:var(--muted);font-style:italic">${GK ? 'AI 분석 버튼을 눌러 학부모용 인사이트를 받아보세요.' : '설정에서 Gemini API 키를 입력하면 AI 분석을 사용할 수 있습니다.'}</div>
</div>`;

    CHARTS.cal = new Chart(document.getElementById('cc'), {
      type: 'line',
      data: {
        labels: calByDate.map(d => `${d.date.slice(6)}일`),
        datasets: [
          { label: '일별 칼로리', data: calByDate.map(d => d.cal), borderColor: '#ffd60a', backgroundColor: 'rgba(255,214,10,.08)', tension: .4, pointRadius: 3, pointBackgroundColor: '#ffd60a', fill: true },
          { label: '권장 2600Kcal', data: calByDate.map(() => 2600), borderColor: 'rgba(255,107,107,.4)', borderDash: [6, 4], pointRadius: 0, fill: false }
        ]
      },
      options: cOpts()
    });

    const nk = Object.keys(DRI).map(k => k.replace(/\(.*?\)/, ''));
    CHARTS.ntr = new Chart(document.getElementById('cn'), {
      type: 'bar',
      data: {
        labels: nk,
        datasets: [
          { label: '과잉(>120%)', data: Object.keys(DRI).map(k => ntrOver[k]), backgroundColor: 'rgba(255,107,107,.6)', borderRadius: 4 },
          { label: '부족(<70%)', data: Object.keys(DRI).map(k => ntrLow[k]), backgroundColor: 'rgba(255,159,67,.6)', borderRadius: 4 }
        ]
      },
      options: { ...cOpts(), scales: { x: { stacked: true, ticks: { color: 'rgba(255,255,255,.4)', font: { family: 'Space Mono', size: 9 } }, grid: { color: 'rgba(255,255,255,.05)' } }, y: { stacked: true, max: dates.length, ticks: { color: 'rgba(255,255,255,.4)', font: { family: 'Space Mono', size: 9 }, callback: v => `${v}일` }, grid: { color: 'rgba(255,255,255,.05)' } } } }
    });

    document.getElementById('nfd').innerHTML = Object.entries(DRI).map(([k, i]) => {
      const avg = ntrAvgs[k], rt = Math.round(avg / i.rec * 100), ov = ntrOver[k], lw = ntrLow[k];
      const bc = rt > 120 ? 'fover' : rt < 70 ? 'flow' : 'fok';
      const bt = rt > 120 ? `과잉 ${ov}일` : rt < 70 ? `부족 ${lw}일` : '양호';
      return `<div class="freq-item"><div class="freq-name">${k.replace(/\(.*?\)/, '')}</div><div class="freq-bar-row"><div class="freq-bar-wrap"><div class="freq-bar-fill" style="width:${Math.min(rt, 100)}%;background:${i.color}"></div></div><div class="freq-pct">${rt}%</div></div><span class="fbadge ${bc}">${bt}</span></div>`;
    }).join('');

    const top = Object.entries(ac).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const mx = top[0]?.[1] || 1;
    document.getElementById('ael').innerHTML = top.map(([n, cnt]) => {
      const im = MA.includes(Number(n));
      return `<div class="exp-row"><div class="exp-name">${im ? '⚠️ ' : ''}<span style="color:${im ? 'var(--red)' : 'var(--text)'}">${AM[n] || n + '번'}</span></div><div class="exp-bar-wrap"><div class="exp-fill" style="width:${cnt / mx * 100}%;background:${im ? 'var(--red)' : 'rgba(255,255,255,.25)'}"></div></div><div class="exp-count">${cnt}회</div></div>`;
    }).join('');

    const ce = Object.entries(catCount).sort((a, b) => b[1] - a[1]).slice(0, 8);
    CHARTS.div = new Chart(document.getElementById('cd2'), {
      type: 'doughnut',
      data: { labels: ce.map(e => e[0]), datasets: [{ data: ce.map(e => e[1]), backgroundColor: PALETTE, borderWidth: 0, hoverOffset: 6 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: 'rgba(255,255,255,.6)', font: { family: 'Noto Sans KR', size: 11 }, padding: 12, boxWidth: 14 }, tooltip: { callbacks: { label: c => `${c.label}: ${c.parsed}회` } } }, cutout: '65%' } }
    });

    window._AD = { ntrAvgs, ntrOver, ntrLow, avgCal, dates, ac, monthLabel: `${SY}년 ${SM}월` };
    _dataSource = 'stats'; _reportPeriod = 'month';
    document.getElementById('slb').disabled = true;
    document.getElementById('slb').style.opacity = '0.4';
    document.getElementById('slb').textContent = '① 분석 완료';
    document.getElementById('aib').disabled = false;
    document.getElementById('aib').style.opacity = '1';
    document.getElementById('aib').style.background = 'var(--green)';
    document.getElementById('mlb').disabled = false;
    document.getElementById('mlb').style.opacity = '1';
    document.getElementById('mlb').style.background = 'var(--blue)';
  } catch (e) { box.innerHTML = `<div class="empty">⚠️ 데이터를 불러오지 못했습니다.<br><span style="font-size:12px">${e.message}</span></div>`; resetBtn(); }
  document.getElementById('slb').disabled = false;
  document.getElementById('slb').textContent = '① 분석 시작';
  document.getElementById('slb').style.opacity = '1';
  document.getElementById('aib').disabled = true;
  document.getElementById('aib').style.opacity = '0.4';
  document.getElementById('aib').style.background = 'var(--surface)';
  document.getElementById('aib').textContent = '② AI 인사이트 받기';
  document.getElementById('mlb').disabled = true;
  document.getElementById('mlb').style.opacity = '0.4';
  document.getElementById('mlb').style.background = 'var(--surface)';
}

function cOpts() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: 'rgba(255,255,255,.6)', font: { family: 'Noto Sans KR', size: 11 } } } },
    scales: {
      x: { ticks: { color: 'rgba(255,255,255,.4)', font: { family: 'Space Mono', size: 9 } }, grid: { color: 'rgba(255,255,255,.05)' } },
      y: { ticks: { color: 'rgba(255,255,255,.4)', font: { family: 'Space Mono', size: 9 } }, grid: { color: 'rgba(255,255,255,.05)' } }
    }
  };
}

function switchAIModel(model) {
  _aiModel = model;
  localStorage.setItem('ai_model', model);
  document.querySelectorAll('.ai-model-btn').forEach(b => b.classList.toggle('on', b.dataset.model === model));
  const period = _reportPeriod || 'week';
  const d = _dataSource === 'weekly' ? window._weeklyData : (_dataSource === 'monthly' ? window._monthlyData : window._AD);
  if (d) {
    const c = document.getElementById(_dataSource === 'stats' ? 'aic' : 'wai');
    const btn = document.getElementById(_dataSource === 'stats' ? 'aib' : 'wab');
    if (c) { c.style.fontStyle = 'italic'; c.style.color = 'var(--muted)'; c.textContent = 'AI가 데이터를 분석하고 있습니다...'; }
    if (btn) btn.textContent = '생성 중...';
    getAIReport();
  }
}

async function getAIReport() {
  const isStatsContext = _dataSource === 'stats';
  const d = isStatsContext ? window._AD : (_dataSource === 'weekly' ? window._weeklyData : window._monthlyData);
  if (!d) return;
  const isWeekly = _dataSource === 'weekly';
  const period = _reportPeriod || 'week';
  const btnId = isStatsContext ? 'aib' : 'wab';
  const contentId = isStatsContext ? 'aic' : 'wai';
  const btn = document.getElementById(btnId);
  const c = document.getElementById(contentId);
  if (!btn || !c) return;

  btn.disabled = true;
  if (isStatsContext) {
    btn.textContent = 'AI 분석 중...';
    btn.style.background = 'var(--surface)';
    c.style.fontStyle = 'italic';
    c.style.color = 'var(--muted)';
    c.textContent = 'AI가 데이터를 분석하고 있습니다...';
  } else {
    btn.textContent = '생성 중...';
    c.style.fontStyle = 'italic';
    c.style.color = 'var(--muted)';
    c.textContent = 'AI가 데이터를 분석하고 있습니다...';
  }

  const pDRI = getPersonalizedDRI(_childProfile);
  const useDRI = pDRI === DRI ? DRI : pDRI;
  const ns = Object.entries(useDRI).filter(([k]) => k !== '권장칼로리').map(([k, i]) => {
    const actualAvg = d.ntrAvgs[k] || 0;
    const rt = i.rec ? Math.round(actualAvg / i.rec * 100) : 0;
    return `${k.replace(/\(.*?\)/, '')}: 평균${actualAvg}(권장${i.rec},${rt}%), 부족${d.ntrLow[k] || 0}일, 과잉${d.ntrOver[k] || 0}일`;
  }).join('\n');

  const ta = Object.entries(d.ac).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, c]) => `${AM[n] || n}:${c}회`).join(',');
  const userAllergies = MA.map(n => AM[n]).filter(Boolean).join(', ') || '없음';
  const warningAllergies = Object.entries(d.ac).filter(([n]) => MA.includes(Number(n))).sort((a, b) => b[1] - a[1]).map(([n, c]) => `${AM[n] || n}:${c}회`).join(', ') || '없음';

  const periodKo = isWeekly ? '이번 주' : '이번 달';
  const periodLabel = isWeekly ? '주간' : '월간';
  const dateRange = isWeekly ? (d.weekLabel || '') : (d.monthLabel || `${SY}년 ${SM}월`);
  const daysInfo = `${d.dates.length}일`;

  const imageData = window._imageData;
  let imageInsightText = '';
  if (imageData && imageData.imageCount > 0) {
    const diff = imageData.avgImageKcal - imageData.avgNEISKcal;
    const trendMsg = diff > 0
      ? `NEIS 대비 평균 ${diff}Kcal 높게 측정되어 실제 섭취량이 제공량보다 많을 수 있습니다.`
      : diff < 0
        ? `NEIS 대비 평균 ${Math.abs(diff)}Kcal 낮게 측정되어 실제 섭취량이 제공량보다 적을 수 있습니다.`
        : 'NEIS 제공 칼로리와 유사하게 측정되어 적정 섭취 중입니다.';
    imageInsightText = `\n\n[이미지 분석 기반 실제 식사량]\n- 이미지 분석 ${imageData.imageCount}회\n- 분석 평균 칼로리: ${imageData.avgImageKcal}Kcal\n- NEIS 제공 평균 칼로리: ${imageData.avgNEISKcal}Kcal\n- 1회 평균 예상 무게: ${imageData.avgWeight}g\n- 식사량 평가: ${trendMsg}`;
  }

  const profile = _childProfile;
  let profileText = '';
  let healthLabel = '';
  if (profile && profile.height && profile.weight) {
    const bmi = (profile.weight / Math.pow(profile.height / 100, 2)).toFixed(1);
    let bmiLabel = '';
    if (bmi >= 25) bmiLabel = '과체중';
    else if (bmi >= 23) bmiLabel = '과체중 위험';
    else if (bmi < 18.5) bmiLabel = '저체중';
    else bmiLabel = '정상';
    healthLabel = getHealthLabel(profile.health) || '정보 없음';
    const genderLabel = profile.gender === 'male' ? '남' : profile.gender === 'female' ? '여' : '미지정';
    profileText = `\n\n[자녀 정보]\n- 키: ${profile.height}cm / 몸무게: ${profile.weight}kg / 성별: ${genderLabel}\n- BMI: ${bmi} (${bmiLabel})\n- 건강 상태: ${healthLabel}${profile.note ? '\n- 추가: ' + profile.note : ''}`;
  }

  const calInsight = profile ? `\n- 개인 권장 칼로리: ${useDRI['권장칼로리']?.rec || '정보없음'}Kcal (일반 2600Kcal 대비)` : '';

  const prompt = `상산고등학교 ${periodKo}(${dateRange}) 급식 분석 결과입니다.${profileText}

[영양소 분석]
${ns}
[식사량 분석]
- 평균 칼로리: ${d.avgCal}Kcal (${daysInfo})${calInsight}

[알레르기 정보]
- 사용자 설정 알레르기: ${userAllergies}
- 급식 내 자주 등장 알레르기: ${ta}
- 주의 알레르기 노출: ${warningAllergies}${imageInsightText}

학부모에게 다음 5가지를 친근하고 실천 가능한 조언으로 알려주세요:
1. 🥗 ${periodKo} 부족한 영양소와 집에서 보완할 구체적 식품 (2~3가지)
2. ⚠️ 알레르기 관련 주의사항 (특히 사용자 알레르기 식품 노출 빈도 강조)
3. 🍽️ 식사량 패턴 인사이트 (과식/부족 여부 및 개선 방법)
4. 📊 자녀 건강 상태${profile ? '(' + healthLabel + ')' : ''} 기반 맞춤 조언
5. ✅ ${periodKo} 총평

전문용어 없이 실천 가능한 조언으로 작성해주세요.`;

  try {
    let url, headers, body;
    if (_aiModel === 'deepseek') {
      url = 'https://api.deepseek.com/v1/chat/completions';
      headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEFAULT_DEEPSEEK_KEY}` };
      body = { model: 'deepseek-chat', messages: [{ role: 'user', content: prompt }], max_tokens: 900 };
    } else {
      url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${GK}`;
      headers = { 'Content-Type': 'application/json' };
      body = { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 900 } };
    }
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const j = await res.json();
    const t = _aiModel === 'deepseek'
      ? (j.choices?.[0]?.message?.content || '분석 결과를 받지 못했습니다.')
      : (j.candidates?.[0]?.content?.parts?.[0]?.text || '분석 결과를 받지 못했습니다.');
    c.style.fontStyle = 'normal';
    c.style.color = 'rgba(255,255,255,.8)';
    c.textContent = t;
    if (isStatsContext) {
      btn.textContent = '② AI 완료';
    } else {
      btn.textContent = '✓ 완료';
    }
    btn.disabled = true;
  } catch (e) {
    c.textContent = '오류: ' + e.message;
    btn.disabled = false;
    if (isStatsContext) {
      btn.textContent = '② 다시 시도';
      btn.style.background = 'var(--green)';
    } else {
      btn.textContent = '✦ 다시 시도';
    }
  }
}

function renderModelBar() {
  return `<div class="ai-model-bar"><button class="ai-model-btn${_aiModel === 'gemini' ? ' on' : ''}" data-model="gemini" onclick="switchAIModel('gemini')">Gemini 2.0</button><button class="ai-model-btn${_aiModel === 'deepseek' ? ' on' : ''}" data-model="deepseek" onclick="switchAIModel('deepseek')">DeepSeek V4</button></div>`;
}

function renderAG() {
  document.getElementById('ag').innerHTML = Object.entries(AM).map(([n, nm]) => `<button class="allergy-chip ${MA.includes(Number(n)) ? 'selected' : ''}" onclick="tgA(${n},this)">${n}. ${nm}</button>`).join('');
}
function tgA(n, el) {
  const i = MA.indexOf(n);
  if (i > -1) MA.splice(i, 1);
  else MA.push(n);
  localStorage.setItem('my_allergies', JSON.stringify(MA));
  el.classList.toggle('selected');
  loadToday();
}

function loadProfile() {
  try { return JSON.parse(localStorage.getItem('child_profile')); } catch { return null; }
}
function showProfileModal() {
  const p = _childProfile || {};
  document.getElementById('pi-height').value = p.height || '';
  document.getElementById('pi-weight').value = p.weight || '';
  document.getElementById('pi-birth').value = p.birth || '';
  document.getElementById('pi-gender').value = p.gender || '';
  document.getElementById('pi-health').value = p.health || '';
  document.getElementById('pi-note').value = p.note || '';
  document.getElementById('profileModal').style.display = 'flex';
}
function closeProfileModal() {
  document.getElementById('profileModal').style.display = 'none';
}
function saveProfile() {
  const p = {
    height: parseFloat(document.getElementById('pi-height').value) || 0,
    weight: parseFloat(document.getElementById('pi-weight').value) || 0,
    birth: document.getElementById('pi-birth').value,
    gender: document.getElementById('pi-gender').value,
    health: document.getElementById('pi-health').value,
    note: document.getElementById('pi-note').value.trim()
  };
  localStorage.setItem('child_profile', JSON.stringify(p));
  _childProfile = p;
  closeProfileModal();
  renderProfileSummary();
  if (window._weeklyData || window._monthlyData || window._AD) {
    getAIReport();
  }
}
function renderProfileSummary() {
  const el = document.getElementById('profile-summary');
  if (!el) return;
  const p = _childProfile;
  if (!p || !p.height || !p.weight) {
    el.innerHTML = '정보를 입력하면 맞춤형 조언을 제공합니다.';
    return;
  }
  const bmi = (p.weight / Math.pow(p.height / 100, 2)).toFixed(1);
  const healthLabels = {
    healthy: '건강함', average: '보통', weak: '허약', obese: '비만',
    digestive: '소화기 약함', athlete: '운동선수',
    allergy_rhinitis: '알레르기 비염', atopy: '아토피', diabetes: '당뇨', other: '기타'
  };
  const hl = healthLabels[p.health] || '';
  el.innerHTML = `키 ${p.height}cm · 몸무게 ${p.weight}kg · BMI ${bmi}${hl ? ' · ' + hl : ''}${p.note ? '<br><span style="opacity:.6">📌 ' + p.note + '</span>' : ''}`;
}
function getHealthLabel(code) {
  const labels = {
    healthy: '건강함', average: '보통', weak: '허약', obese: '비만',
    digestive: '소화기 약함', athlete: '운동선수',
    allergy_rhinitis: '알레르기 비염', atopy: '아토피', diabetes: '당뇨', other: '기타'
  };
  return labels[code] || '';
}
function getPersonalizedDRI(profile) {
  if (!profile || !profile.height || !profile.weight) return DRI;
  const bmi = profile.weight / Math.pow(profile.height / 100, 2);
  const isMale = profile.gender === 'male';
  let calPerKg = isMale ? 35 : 30;
  if (profile.health === 'athlete') calPerKg *= 1.2;
  else if (profile.health === 'obese') calPerKg *= 0.85;
  const recCal = Math.round(calPerKg * profile.weight);
  return {
    '탄수화물(g)': { ...DRI['탄수화물(g)'], rec: Math.round(recCal * 0.55 / 4) },
    '단백질(g)': { ...DRI['단백질(g)'], rec: Math.round(profile.weight * (profile.health === 'athlete' ? 1.5 : 1.0)) },
    '지방(g)': { ...DRI['지방(g)'], rec: Math.round(recCal * 0.25 / 9) },
    '칼슘(mg)': DRI['칼슘(mg)'],
    '철분(mg)': DRI['철분(mg)'],
    '비타민C(mg)': DRI['비타민C(mg)'],
    '권장칼로리': { rec: recCal }
  };
}

function sw(name, btn) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('on')); btn.classList.add('on');
  ['today', 'stats', 'allergy', 'report', 'image'].forEach(t => document.getElementById(`tab-${t}`).style.display = t === name ? 'block' : 'none');
  if (name === 'stats') loadMonthlyStats();
  if (name === 'report') {
    renderProfileSummary();
    _reportPeriod = 'week';
    document.querySelectorAll('.period-btn').forEach(b => b.classList.toggle('on', b.dataset.period === 'week'));
    loadWeeklyReport();
  }
}

function getWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(now);
  mon.setDate(now.getDate() + diffToMon);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return { from: fd2(mon), to: fd2(sun), mon, sun };
}

function getWeekLabel(mon, sun) {
  const fmt = d => `${d.getMonth() + 1}/${d.getDate()}`;
  return `${fmt(mon)} ~ ${fmt(sun)}`;
}

function swReport(period, btn) {
  document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  _reportPeriod = period;
  if (period === 'week') loadWeeklyReport();
  else loadMonthlyReport();
}

async function fetchImageAnalysis(from, to) {
  try {
    const resp = await fetch('/api/results');
    if (!resp.ok) return null;
    const results = await resp.json();
    const filtered = results.filter(r => r.date >= from && r.date <= to && r.result);
    if (!filtered.length) return null;
    const totalKcal = filtered.reduce((s, r) => s + (r.result.total_kcal || 0), 0);
    let neisTotal = 0;
    filtered.forEach(r => {
      const cal = parseFloat(r.menu?.calories || 0);
      neisTotal += cal;
    });
    const totalWeight = filtered.reduce((s, r) => {
      return s + (r.result.sections || []).reduce((ss, sec) => ss + (sec.estimated_weight_g || 0), 0);
    }, 0);
    return {
      imageCount: filtered.length,
      avgImageKcal: Math.round(totalKcal / filtered.length),
      avgNEISKcal: Math.round(neisTotal / filtered.length),
      avgWeight: Math.round(totalWeight / filtered.length)
    };
  } catch { return null; }
}

async function loadMonthlyReport() {
  const box = document.getElementById('report-box');
  box.innerHTML = '<div class="loading-wrap"><div class="spinner"></div><div style="color:var(--muted);font-size:13px">이번 달 급식 데이터를 불러오는 중...</div></div>';
  try {
    const from = `${SY}${String(SM).padStart(2, '0')}01`;
    const last = new Date(SY, SM, 0).getDate();
    const to = `${SY}${String(SM).padStart(2, '0')}${last}`;
    const rows = await fetchRange(from, to);
    if (!rows.length) { box.innerHTML = '<div class="empty">📭 이번 달 급식 정보가 없습니다.</div>'; return; }

    const byDate = {};
    rows.forEach(r => { if (!byDate[r.MLSV_YMD]) byDate[r.MLSV_YMD] = []; byDate[r.MLSV_YMD].push(r); });
    const dates = Object.keys(byDate).sort();
    const calByDate = dates.map(d => ({ date: d, cal: byDate[d].reduce((s, r) => s + parseFloat(r.CAL_INFO || 0), 0) }));
    const avgCal = Math.round(calByDate.reduce((s, d) => s + d.cal, 0) / calByDate.length);

    const ntrSums = {}, ntrOver = {}, ntrLow = {};
    Object.keys(DRI).forEach(k => { ntrSums[k] = 0; ntrOver[k] = 0; ntrLow[k] = 0; });
    dates.forEach(d => {
      const dn = {}; Object.keys(DRI).forEach(k => dn[k] = 0);
      byDate[d].forEach(r => { const n = pNtr(r.NTR_INFO); Object.keys(DRI).forEach(k => dn[k] += (n[k] || 0)); });
      Object.keys(DRI).forEach(k => { ntrSums[k] += dn[k]; const r = dn[k] / DRI[k].rec; if (r > 1.2) ntrOver[k]++; else if (r < 0.7) ntrLow[k]++; });
    });
    const ntrAvgs = {}; Object.keys(DRI).forEach(k => ntrAvgs[k] = Math.round(ntrSums[k] / dates.length));

    const ac = {};
    rows.forEach(r => pDish(r.DDISH_NM).forEach(d => d.nums.forEach(n => { ac[n] = (ac[n] || 0) + 1; })));

    const monthLabel = `${SY}년 ${SM}월`;
    window._monthlyData = { ntrAvgs, ntrOver, ntrLow, avgCal, dates, ac, monthLabel };
    _dataSource = 'monthly';

    const imageData = await fetchImageAnalysis(from, to);
    window._imageData = imageData;

    const topAllergy = Object.entries(ac).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const allergyHTML = topAllergy.map(([n, cnt]) => {
      const im = MA.includes(Number(n));
      return `<div class="exp-row"><div class="exp-name">${im ? '⚠️ ' : ''}<span style="color:${im ? 'var(--red)' : 'var(--text)'}">${AM[n] || n}</span></div><div class="exp-bar-wrap"><div class="exp-fill" style="width:100%;background:${im ? 'var(--red)' : 'rgba(255,255,255,.25)'}"></div></div><div class="exp-count">${cnt}회</div></div>`;
    }).join('');

    const ntrHTML = Object.entries(DRI).map(([k, i]) => {
      const avg = ntrAvgs[k], rt = Math.round(avg / i.rec * 100), ov = ntrOver[k], lw = ntrLow[k];
      const bc = rt > 120 ? 'fover' : rt < 70 ? 'flow' : 'fok';
      const bt = rt > 120 ? `과잉 ${ov}일` : rt < 70 ? `부족 ${lw}일` : '양호';
      return `<div class="freq-item"><div class="freq-name">${k.replace(/\(.*?\)/, '')}</div><div class="freq-bar-row"><div class="freq-bar-wrap"><div class="freq-bar-fill" style="width:${Math.min(rt, 100)}%;background:${i.color}"></div></div><div class="freq-pct">${rt}%</div></div><span class="fbadge ${bc}">${bt}</span></div>`;
    }).join('');

    const imageInfo = imageData
      ? `<div class="stat-card"><div class="stat-label">📸 이미지 분석</div><div class="stat-value" style="color:var(--blue);font-size:18px">${imageData.imageCount}<span class="stat-unit">회</span></div><div class="stat-sub">평균 ${imageData.avgImageKcal}Kcal / NEIS ${imageData.avgNEISKcal}Kcal</div></div>`
      : '';

    const aiContent = GK
      ? `<div class="ai-content" id="wai" style="color:var(--muted);font-style:italic">AI 조언을 생성 중...</div><button class="ai-btn" id="wab" onclick="getAIReport()">✦ AI 조언 받기</button>`
      : `<div class="ai-content" style="color:var(--muted);font-style:italic">설정에서 Gemini API 키를 입력하면 AI 조언을 받을 수 있어요.</div>`;

    box.innerHTML = `
<div class="stat-grid">
  <div class="stat-card"><div class="stat-label">📅 ${monthLabel} 평균 칼로리</div><div class="stat-value" style="color:var(--yellow)">${avgCal.toLocaleString()}<span class="stat-unit">Kcal</span></div><div class="stat-sub">분석 ${dates.length}일</div></div>
  <div class="stat-card"><div class="stat-label">총 끼니</div><div class="stat-value" style="color:var(--green)">${rows.length}<span class="stat-unit">끼</span></div><div class="stat-sub">조식·중식·석식</div></div>
  ${imageInfo}
</div>

<div class="chart-card">
  <div class="chart-title">📈 영양소 상태</div>
  <div class="chart-sub">이번 달 권장량 대비 평균</div>
  <div class="ntr-freq-grid">${ntrHTML}</div>
</div>

<div class="chart-card">
  <div class="chart-title">⚠️ 알레르기 노출</div>
  <div class="chart-sub">이번 달 알레르기 유발 식품</div>
  ${allergyHTML}
</div>

<div class="ai-card">
  <div class="ai-header"><div class="ai-icon">✦</div><div><div style="font-size:14px;font-weight:700">AI 월간 조언</div><div style="font-size:11px;color:var(--muted)">이번 달 급식 데이터 기반 맞춤 인사이트</div></div></div>
  ${renderModelBar()}
  ${aiContent}
</div>`;

    if (GK) getAIReport();
  } catch (e) { box.innerHTML = `<div class="empty">⚠️ 데이터를 불러오지 못했습니다.<br><span style="font-size:12px">${e.message}</span></div>`; }
}

async function loadWeeklyReport() {
  const box = document.getElementById('report-box');
  box.innerHTML = '<div class="loading-wrap"><div class="spinner"></div><div style="color:var(--muted);font-size:13px">이번 주 급식 데이터를 불러오는 중...</div></div>';
  try {
    const { from, to, mon, sun } = getWeekRange();
    const rows = await fetchRange(from, to);
    if (!rows.length) { box.innerHTML = '<div class="empty">📭 이번 주는 급식 정보가 없습니다.</div>'; return; }

    const byDate = {};
    rows.forEach(r => { if (!byDate[r.MLSV_YMD]) byDate[r.MLSV_YMD] = []; byDate[r.MLSV_YMD].push(r); });
    const dates = Object.keys(byDate).sort();
    const calByDate = dates.map(d => ({ date: d, cal: byDate[d].reduce((s, r) => s + parseFloat(r.CAL_INFO || 0), 0) }));
    const avgCal = Math.round(calByDate.reduce((s, d) => s + d.cal, 0) / calByDate.length);

    const ntrSums = {}, ntrOver = {}, ntrLow = {};
    Object.keys(DRI).forEach(k => { ntrSums[k] = 0; ntrOver[k] = 0; ntrLow[k] = 0; });
    dates.forEach(d => {
      const dn = {}; Object.keys(DRI).forEach(k => dn[k] = 0);
      byDate[d].forEach(r => { const n = pNtr(r.NTR_INFO); Object.keys(DRI).forEach(k => dn[k] += (n[k] || 0)); });
      Object.keys(DRI).forEach(k => { ntrSums[k] += dn[k]; const r = dn[k] / DRI[k].rec; if (r > 1.2) ntrOver[k]++; else if (r < 0.7) ntrLow[k]++; });
    });
    const ntrAvgs = {}; Object.keys(DRI).forEach(k => ntrAvgs[k] = Math.round(ntrSums[k] / dates.length));

    const ac = {};
    rows.forEach(r => pDish(r.DDISH_NM).forEach(d => d.nums.forEach(n => { ac[n] = (ac[n] || 0) + 1; })));

    const weekLabel = getWeekLabel(mon, sun);
    window._weeklyData = { ntrAvgs, ntrOver, ntrLow, avgCal, dates, ac, weekLabel };
    _dataSource = 'weekly';

    const imageData = await fetchImageAnalysis(from, to);
    window._imageData = imageData;

    const topAllergy = Object.entries(ac).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const allergyHTML = topAllergy.map(([n, cnt]) => {
      const im = MA.includes(Number(n));
      return `<div class="exp-row"><div class="exp-name">${im ? '⚠️ ' : ''}<span style="color:${im ? 'var(--red)' : 'var(--text)'}">${AM[n] || n}</span></div><div class="exp-bar-wrap"><div class="exp-fill" style="width:100%;background:${im ? 'var(--red)' : 'rgba(255,255,255,.25)'}"></div></div><div class="exp-count">${cnt}회</div></div>`;
    }).join('');

    const ntrHTML = Object.entries(DRI).map(([k, i]) => {
      const avg = ntrAvgs[k], rt = Math.round(avg / i.rec * 100), ov = ntrOver[k], lw = ntrLow[k];
      const bc = rt > 120 ? 'fover' : rt < 70 ? 'flow' : 'fok';
      const bt = rt > 120 ? `과잉 ${ov}일` : rt < 70 ? `부족 ${lw}일` : '양호';
      return `<div class="freq-item"><div class="freq-name">${k.replace(/\(.*?\)/, '')}</div><div class="freq-bar-row"><div class="freq-bar-wrap"><div class="freq-bar-fill" style="width:${Math.min(rt, 100)}%;background:${i.color}"></div></div><div class="freq-pct">${rt}%</div></div><span class="fbadge ${bc}">${bt}</span></div>`;
    }).join('');

    const imageInfo = imageData
      ? `<div class="stat-card"><div class="stat-label">📸 이미지 분석</div><div class="stat-value" style="color:var(--blue);font-size:18px">${imageData.imageCount}<span class="stat-unit">회</span></div><div class="stat-sub">평균 ${imageData.avgImageKcal}Kcal / NEIS ${imageData.avgNEISKcal}Kcal</div></div>`
      : '';

    const aiContent = GK
      ? `<div class="ai-content" id="wai" style="color:var(--muted);font-style:italic">AI 조언을 생성 중...</div><button class="ai-btn" id="wab" onclick="getAIReport()">✦ AI 조언 받기</button>`
      : `<div class="ai-content" style="color:var(--muted);font-style:italic">설정에서 Gemini API 키를 입력하면 AI 조언을 받을 수 있어요.</div>`;

    box.innerHTML = `
<div class="stat-grid">
  <div class="stat-card"><div class="stat-label">이번 주(${weekLabel}) 평균 칼로리</div><div class="stat-value" style="color:var(--yellow)">${avgCal.toLocaleString()}<span class="stat-unit">Kcal</span></div><div class="stat-sub">분석 ${dates.length}일</div></div>
  <div class="stat-card"><div class="stat-label">총 끼니</div><div class="stat-value" style="color:var(--green)">${rows.length}<span class="stat-unit">끼</span></div><div class="stat-sub">조식·중식·석식</div></div>
  ${imageInfo}
</div>

<div class="chart-card">
  <div class="chart-title">📈 영양소 상태</div>
  <div class="chart-sub">이번 주 권장량 대비 평균</div>
  <div class="ntr-freq-grid">${ntrHTML}</div>
</div>

<div class="chart-card">
  <div class="chart-title">⚠️ 알레르기 노출</div>
  <div class="chart-sub">이번 주 알레르기 유발 식품</div>
  ${allergyHTML}
</div>

<div class="ai-card">
  <div class="ai-header"><div class="ai-icon">✦</div><div><div style="font-size:14px;font-weight:700">AI 주간 조언</div><div style="font-size:11px;color:var(--muted)">이번 주 급식 데이터 기반 맞춤 인사이트</div></div></div>
  ${renderModelBar()}
  ${aiContent}
</div>`;

if (GK) getAIReport();
  } catch (e) { box.innerHTML = `<div class="empty">⚠️ 데이터를 불러오지 못했습니다.<br><span style="font-size:12px">${e.message}</span></div>`; }
}

function exportDaily() {
  const data = window._sumData;
  if (!data || !data.rows) { alert('내보낼 데이터가 없습니다.'); return; }
  const exportObj = {
    exportDate: new Date().toISOString().split('T')[0],
    school: currentSchool,
    type: 'daily',
    date: document.getElementById('dp').value,
    data: data.rows.map(r => ({
      mealType: r.MMEAL_SC_NM,
      calories: r.CAL_INFO,
      menu: r.DDISH_NM.split('<br/>').filter(Boolean),
      nutrients: pNtr(r.NTR_INFO)
    }))
  };
  const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `급식_${document.getElementById('dp').value}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportMonthly() {
  const d = window._AD;
  if (!d) { alert('먼저 월간 통계를 분석해주세요.'); return; }
  const exportObj = {
    exportDate: new Date().toISOString().split('T')[0],
    school: currentSchool,
    type: 'monthly',
    yearMonth: `${SY}-${String(SM).padStart(2, '0')}`,
    summary: { avgCal: d.avgCal, totalDays: d.dates.length, totalMeals: d.dates.length * 3 },
    nutrients: d.ntrAvgs,
    nutrientStatus: { over: d.ntrOver, low: d.ntrLow },
    allergyCount: d.ac
  };
  const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `급통계_${SY}-${String(SM).padStart(2, '0')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function handleImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data.type || !data.data) { alert('유효하지 않은 파일 형식입니다.'); return; }
    if (data.type === 'daily') { renderImportedDaily(data); }
    else if (data.type === 'monthly') { renderImportedMonthly(data); }
    alert('데이터를 성공적으로 불러왔습니다.');
  } catch (e) { alert('파일 읽기 오류: ' + e.message); }
  event.target.value = '';
}

function renderImportedDaily(data) {
  const box = document.getElementById('today-box');
  if (data.school) currentSchool = data.school;
  const rows = data.data.map(r => ({
    MMEAL_SC_NM: r.mealType,
    CAL_INFO: r.calories,
    DDISH_NM: r.menu.join('<br/>'),
    NTR_INFO: Object.entries(r.nutrients).map(([k, v]) => `${k}:${v}`).join('<br/>')
  }));
  const totalNtr = {};
  Object.keys(DRI).forEach(k => totalNtr[k] = 0);
  let totalCal = 0;
  rows.forEach(r => { totalCal += parseFloat(r.CAL_INFO) || 0; const n = pNtr(r.NTR_INFO); Object.keys(DRI).forEach(k => totalNtr[k] += (n[k] || 0)); });
  const mealNames = rows.map(r => r.MMEAL_SC_NM);
  const hasBrk = mealNames.includes('조식');
  const mealList = mealNames.join(' · ');
  const calColor = totalCal > 3120 ? '#ff6b6b' : totalCal < 1560 ? '#ff9f43' : '#4fffb0';
  const ntrHTML = Object.entries(DRI).map(([k, i]) => {
    const v = Math.round(totalNtr[k]), pct = Math.min(v / i.rec * 100, 100), rt = Math.round(v / i.rec * 100), rc = rt > 120 ? '#ff6b6b' : rt < 60 ? '#ff9f43' : '#4fffb0';
    return `<div class="ntr-row"><div class="ntr-name">${k.replace(/\(.*?\)/, '')}</div><div class="ntr-bar-wrap"><div class="ntr-bar" style="width:${pct}%;background:${i.color}"></div></div><div class="ntr-val">${v}<span style="color:${rc};margin-left:4px">${rt}%</span></div></div>`;
  }).join('');
  const summaryCard = `<div class="card" style="border-color:rgba(255,255,255,.12);margin-bottom:20px">
    <div class="card-shine"></div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-family:'Space Mono',monospace;font-size:9px;letter-spacing:.18em;text-transform:uppercase;padding:4px 12px;border-radius:4px;border:1px solid rgba(255,255,255,.15);color:rgba(255,255,255,.6)">📁 불러온 데이터</span>
        <span style="font-family:'Space Mono',monospace;font-size:10px;color:var(--muted)">${mealList}</span>
      </div>
      <span style="font-family:'Space Mono',monospace;font-size:13px;font-weight:700;color:${calColor}">${Math.round(totalCal).toLocaleString()} Kcal</span>
    </div>
    <div style="font-family:'Space Mono',monospace;font-size:9px;letter-spacing:.15em;color:var(--muted);text-transform:uppercase;margin-bottom:10px">${data.date} 일일 합산</div>
    ${ntrHTML}
  </div>`;
  box.innerHTML = summaryCard + rows.map(r => {
    const ac = MC[r.MMEAL_SC_NM] || '#fff';
    const dishes = pDish(r.DDISH_NM);
    const ntr = pNtr(r.NTR_INFO);
    const mHTML = dishes.map(d => `<span class="menu-item ${d.nums.some(n => MA.includes(n)) ? 'aw' : ''}">${d.name}</span>`).join('');
    const nHTML = Object.entries(DRI).map(([k, i]) => {
      const v = ntr[k] || 0, rec = getMealRec(k, r.MMEAL_SC_NM), pct = Math.min(v / rec * 100, 100), rt = Math.round(v / rec * 100), rc = rt > 120 ? '#ff6b6b' : rt < 60 ? '#ff9f43' : '#4fffb0';
      return `<div class="ntr-row"><div class="ntr-name">${k.replace(/\(.*?\)/, '')}</div><div class="ntr-bar-wrap"><div class="ntr-bar" style="width:${pct}%;background:${i.color}"></div></div><div class="ntr-val">${v}<span style="color:${rc};margin-left:4px">${rt}%</span></div></div>`;
    }).join('');
    return `<div class="card"><div class="card-shine"></div><div class="card-header"><span class="meal-badge" style="color:${ac};border-color:${ac}33;background:${ac}0d">${r.MMEAL_SC_NM}</span><span style="font-family:'Space Mono',monospace;font-size:12px;font-weight:700;color:${ac}">${r.CAL_INFO}</span></div><div class="menu-list">${mHTML}</div><div class="ntr-label">영양소</div>${nHTML}</div>`;
  }).join('');
  document.getElementById('dp').value = data.date;
}

function renderImportedMonthly(data) {
  const box = document.getElementById('stats-box');
  if (data.school) currentSchool = data.school;
  const s = data.summary, a = data.nutrients, os = data.nutrientStatus.over, ls = data.nutrientStatus.low;
  const calColor = s.avgCal > 3120 ? '#ff6b6b' : s.avgCal < 1560 ? '#ff9f43' : '#4fffb0';
  box.innerHTML = `<div style="margin-bottom:16px;padding:12px;background:rgba(79,255,176,.08);border:1px solid rgba(79,255,176,.2);border-radius:10px;font-size:12px;color:var(--green)">📁 파일에서 불러온 데이터: ${data.yearMonth}</div>
<div class="stat-grid">
  <div class="stat-card"><div class="stat-label">하루 평균 칼로리</div><div class="stat-value" style="color:var(--yellow)">${s.avgCal.toLocaleString()}<span class="stat-unit">Kcal</span></div><div class="stat-sub">분석 ${s.totalDays}일</div></div>
  <div class="stat-card"><div class="stat-label">평균 단백질</div><div class="stat-value" style="color:var(--blue)">${a['단백질(g)']}<span class="stat-unit">g</span></div><div class="stat-sub">권장 ${DRI['단백질(g)'].rec}g 기준</div></div>
  <div class="stat-card"><div class="stat-label">평균 칼슘</div><div class="stat-value" style="color:var(--orange)">${a['칼슘(mg)']}<span class="stat-unit">mg</span></div><div class="stat-sub">권장 ${DRI['칼슘(mg)'].rec}mg 기준</div></div>
  <div class="stat-card"><div class="stat-label">영양 상태</div><div class="stat-value" style="color:var(--green)">${Object.keys(os).length}<span class="stat-unit">종</span></div><div class="stat-sub">과잉 영양소</div></div>
</div>
<div class="ntr-freq-grid">${Object.entries(DRI).map(([k, i]) => {
    const avg = a[k], rt = Math.round(avg / i.rec * 100), ov = os[k], lw = ls[k];
    const bc = rt > 120 ? 'fover' : rt < 70 ? 'flow' : 'fok';
    const bt = rt > 120 ? `과잉 ${ov}일` : rt < 70 ? `부족 ${lw}일` : '양호';
    return `<div class="freq-item"><div class="freq-name">${k.replace(/\(.*?\)/, '')}</div><div class="freq-bar-row"><div class="freq-bar-wrap"><div class="freq-bar-fill" style="width:${Math.min(rt, 100)}%;background:${i.color}"></div></div><div class="freq-pct">${rt}%</div></div><span class="fbadge ${bc}">${bt}</span></div>`;
  }).join('')}</div>`;
  SY = parseInt(data.yearMonth.split('-')[0]); SM = parseInt(data.yearMonth.split('-')[1]); updMD();
}

function initNavSchoolSelect() {
  const s = document.getElementById('navSido');
  s.innerHTML = '<option value="">시·도</option>' + SIDO_LIST.map(x => `<option value="${x.code}">${x.name}</option>`).join('');
  document.getElementById('navSido').value = 'P10';
  document.getElementById('navLevel').value = '고등학교';
  document.getElementById('navSchoolSearch').value = '상산고등학교';
  searchSchoolsRealtime('nav');
  const searchInput = document.getElementById('navSchoolSearch');
  searchInput.addEventListener('input', debounce(() => searchSchoolsRealtime('nav'), 300));
  searchInput.addEventListener('focus', () => {
    const dropdown = document.getElementById('navAutocomplete');
    const sido = document.getElementById('navSido').value;
    const level = document.getElementById('navLevel').value;
    if (sido && level) { searchSchoolsRealtime('nav'); }
    else if (dropdown.children.length > 0) { dropdown.classList.add('on'); }
  });
}

async function searchSchoolsRealtime(context) {
  let sido, level, inputEl, dropdownEl;
  if (context === 'nav') {
    sido = document.getElementById('navSido').value;
    level = document.getElementById('navLevel').value;
    inputEl = document.getElementById('navSchoolSearch');
    dropdownEl = document.getElementById('navAutocomplete');
  } else {
    sido = document.getElementById('sidoSelect').value;
    level = document.getElementById('levelSelect').value;
    inputEl = document.getElementById('schoolSearchInput');
    dropdownEl = document.getElementById('modalAutocompleteList');
  }
  const query = inputEl.value.trim();
  if (!sido) { dropdownEl.innerHTML = '<div class="autocomplete-empty">시·도를 먼저 선택해주세요</div>'; dropdownEl.classList.add('on'); return; }
  dropdownEl.innerHTML = '<div class="autocomplete-loading">로딩 중...</div>'; dropdownEl.classList.add('on');
  try {
    const endpoint = 'schoolInfo';
    let url = `https://open.neis.go.kr/hub/${endpoint}?KEY=${NK}&Type=json&pIndex=1&pSize=100&ATPT_OFCDC_SC_CODE=${sido}`;
    if (query.length > 0) url += `&SCHUL_NM=${encodeURIComponent(query)}`;
    if (level) url += `&SCHUL_KND_SC_NM=${encodeURIComponent(level)}`;
    const j = await fetchWithProxy(url);
    if (j.RESULT) { dropdownEl.innerHTML = `<div class="autocomplete-empty">${j.RESULT.MESSAGE || '검색 결과가 없습니다'}</div>`; dropdownEl.classList.add('on'); return; }
    if (!j.schoolInfo) { dropdownEl.innerHTML = '<div class="autocomplete-empty">검색 결과가 없습니다</div>'; dropdownEl.classList.add('on'); return; }
    const rows = j.schoolInfo[1]?.row || [];
    if (rows.length === 0) { dropdownEl.innerHTML = '<div class="autocomplete-empty">검색 결과가 없습니다</div>'; return; }
    dropdownEl.innerHTML = rows.map(r => `<div class="autocomplete-item" data-atpt="${sido}" data-code="${r.SD_SCHUL_CODE}" data-name="${r.SCHUL_NM}" onclick="selectSchool(this, '${context}')">${r.SCHUL_NM}</div>`).join('');
  } catch (e) { console.error('학교 검색 실패:', e); dropdownEl.innerHTML = '<div class="autocomplete-empty">검색 중 오류가 발생했습니다</div>'; }
}

function selectSchool(el, context) {
  const atpt = el.dataset.atpt;
  const code = el.dataset.code;
  const name = el.dataset.name;
  currentSchool = { ATPT: atpt, CODE: code, NAME: name };
  localStorage.setItem('selected_school', JSON.stringify(currentSchool));
  if (context === 'nav') {
    document.getElementById('navSchoolSearch').value = name;
    document.getElementById('navAutocomplete').classList.remove('on');
    loadToday();
  } else {
    document.getElementById('schoolSearchInput').value = name;
    document.getElementById('modalAutocompleteList').classList.remove('on');
    window._selectedSchool = { ATPT: atpt, CODE: code, NAME: name };
  }
}

function onNavSidoChange() {
  document.getElementById('navSchoolSearch').value = '';
  document.getElementById('navAutocomplete').innerHTML = '';
  document.getElementById('navAutocomplete').classList.remove('on');
  const sido = document.getElementById('navSido').value;
  const level = document.getElementById('navLevel').value;
  if (sido && level) searchSchoolsRealtime('nav');
}

function onNavLevelChange() {
  document.getElementById('navSchoolSearch').value = '';
  document.getElementById('navAutocomplete').innerHTML = '';
  document.getElementById('navAutocomplete').classList.remove('on');
  const sido = document.getElementById('navSido').value;
  const level = document.getElementById('navLevel').value;
  if (sido && level) searchSchoolsRealtime('nav');
}

async function loadSchoolList() {
  const sido = document.getElementById('sidoSelect').value;
  const level = document.getElementById('levelSelect').value;
  const schoolSelect = document.getElementById('schoolSelect');
  const loading = document.getElementById('schoolListLoading');
  if (!sido || !level) { schoolSelect.innerHTML = '<option value="">시·도와 학교급을 먼저 선택해주세요</option>'; return; }
  const cacheKey = `schools_${sido}_${level}`;
  if (window._schoolCache && window._schoolCache[cacheKey]) { window._schoolRows = window._schoolCache[cacheKey]; renderSchoolList(window._schoolRows); return; }
  loading.style.display = 'block';
  schoolSelect.innerHTML = '<option value="">학교 목록 로딩 중...</option>';
  schoolSelect.disabled = true;
  try {
    let url = `https://open.neis.go.kr/hub/schoolInfo?KEY=${NK}&Type=json&pIndex=1&pSize=1000&ATPT_OFCDC_SC_CODE=${sido}&SCHUL_KND_SC_NM=${encodeURIComponent(level)}`;
    const res = await fetch(url);
    const j = await res.json();
    loading.style.display = 'none';
    schoolSelect.disabled = false;
    if (j.RESULT) { schoolSelect.innerHTML = '<option value="">' + (j.RESULT.MESSAGE || '조회 실패') + '</option>'; return; }
    const rows = j.schoolInfo?.[1]?.row || [];
    if (rows.length === 0) { schoolSelect.innerHTML = '<option value="">학교가 없습니다</option>'; return; }
    rows.sort((a, b) => a.SCHUL_NM.localeCompare(b.SCHUL_NM, 'ko'));
    if (!window._schoolCache) window._schoolCache = {};
    window._schoolCache[cacheKey] = rows;
    window._schoolRows = rows;
    renderSchoolList(rows);
  } catch (e) { loading.style.display = 'none'; schoolSelect.disabled = false; schoolSelect.innerHTML = '<option value="">오류: ' + e.message + '</option>'; }
}

function renderSchoolList(rows) {
  const schoolSelect = document.getElementById('schoolSelect');
  const searchInput = document.getElementById('schoolSearchInput');
  const query = searchInput.value.trim().toLowerCase();
  let filtered = rows;
  if (query) filtered = rows.filter(r => r.SCHUL_NM.toLowerCase().includes(query));
  if (filtered.length === 0) { schoolSelect.innerHTML = query ? '<option value="">검색 결과 없음</option>' : '<option value="">학교가 없습니다</option>'; return; }
  schoolSelect.innerHTML = '<option value="">학교를 선택해주세요</option>' + filtered.map(r => `<option value="${r.SD_SCHUL_CODE}|${r.SCHUL_NM}">${r.SCHUL_NM}</option>`).join('');
}

function filterSchoolList() {
  if (!window._schoolRows) return;
  renderSchoolList(window._schoolRows);
}

function selectSchoolFromList() {
  const schoolSelect = document.getElementById('schoolSelect');
  const val = schoolSelect.value;
  if (!val) return;
  const [code, name] = val.split('|');
  window._selectedSchool = { ATPT: document.getElementById('sidoSelect').value, CODE: code, NAME: name };
}