// NEIS API 호출
import { PROXIES } from './constants.js';
import { loadMealCache, saveMealCache, makeCacheKey } from './db.js';
import { fd2 } from './utils.js';

export async function fetchWithProxy(neisUrl) {
  let lastErr;
  for (const proxy of PROXIES) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
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

export async function fetchRange(from, to, school, NK) {
  const cacheKey = makeCacheKey(from, to, school);
  try {
    const cached = await loadMealCache(cacheKey);
    if (cached && cached.data) return cached.data;
  } catch (e) { console.warn('캐시 로드 실패:', e.message); }

  const allRows = [];
  const start = new Date(from.slice(0, 4) + '-' + from.slice(4, 6) + '-' + from.slice(6, 8));
  const end = new Date(to.slice(0, 4) + '-' + to.slice(4, 6) + '-' + to.slice(6, 8));
  let cur = new Date(start);

  while (cur <= end) {
    const chunkFrom = fd2(cur);
    const chunkEnd = new Date(cur);
    chunkEnd.setDate(chunkEnd.getDate() + 6);
    const chunkTo = fd2(chunkEnd > end ? end : chunkEnd);

    try {
      const url = `https://open.neis.go.kr/hub/mealServiceDietInfo?KEY=${NK}&Type=json&pIndex=1&pSize=50&ATPT_OFCDC_SC_CODE=${school.ATPT}&SD_SCHUL_CODE=${school.CODE}&MLSV_FROM_YMD=${chunkFrom}&MLSV_TO_YMD=${chunkTo}`;
      const res = await fetch(url);
      const j = await res.json();
      const rows = j.mealServiceDietInfo?.[1]?.row || [];
      allRows.push(...rows);
    } catch (e) { console.warn(`${chunkFrom}~${chunkTo} 실패:`, e.message); }
    cur.setDate(cur.getDate() + 7);
  }

  if (allRows.length > 0) {
    try { await saveMealCache(cacheKey, allRows); } catch (e) { console.warn('캐시 저장 실패:', e.message); }
  }
  return allRows;
}