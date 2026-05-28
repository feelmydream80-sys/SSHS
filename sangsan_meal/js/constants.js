// 상수 정의
export const SCHOOL = { ATPT: 'P10', CODE: '8321090' };
export const DEFAULT_SCHOOL = { ATPT: 'P10', CODE: '8321090', NAME: '상산고등학교' };
export const NEIS = 'https://open.neis.go.kr/hub/mealServiceDietInfo';
export const DEFAULT_NEIS_KEY = '35b75a10a2fe426b8aa1b072ab2be207';

export const SIDO_LIST = [
  { code: 'B10', name: '서울특별시' }, { code: 'C10', name: '부산광역시' },
  { code: 'D10', name: '대구광역시' }, { code: 'E10', name: '인천광역시' },
  { code: 'F10', name: '광주광역시' }, { code: 'G10', name: '대전광역시' },
  { code: 'H10', name: '울산광역시' }, { code: 'I10', name: '세종특별자치시' },
  { code: 'J10', name: '경기도' }, { code: 'K10', name: '강원도' },
  { code: 'L10', name: '충청북도' }, { code: 'M10', name: '충청남도' },
  { code: 'N10', name: '전라북도' }, { code: 'O10', name: '전라남도' },
  { code: 'P10', name: '전북특별자치도' }, { code: 'Q10', name: '경상남도' },
  { code: 'R10', name: '제주특별자치도' }
];

export const PROXIES = [
  { url: u => `https://api.allorigins.win/get?url=${u}`, parse: async r => { const o = await r.json(); return JSON.parse(o.contents); } },
  { url: u => `https://api.codetabs.com/v1/proxy?quest=${u}`, parse: async r => await r.json() },
  { url: u => `https://corsproxy.io/?${u}`, parse: async r => await r.json() }
];

export const AM = { 1: '난류', 2: '우유', 3: '메밀', 4: '땅콩', 5: '대두', 6: '밀', 7: '고등어', 8: '게', 9: '새우(김치)', 10: '돼지고기', 11: '복숭아', 12: '토마토', 13: '아황산류', 14: '호두', 15: '닭고기', 16: '쇠고기', 17: '오징어', 18: '조개류' };

export const DRI = {
  '탄수화물(g)': { rec: 350, color: '#7eb8ff' },
  '단백질(g)': { rec: 65, color: '#4fffb0' },
  '지방(g)': { rec: 75, color: '#ffd60a' },
  '칼슘(mg)': { rec: 900, color: '#ff9f43' },
  '철분(mg)': { rec: 14, color: '#c77dff' },
  '비타민C(mg)': { rec: 100, color: '#ff6b9d' }
};

export const MEAL_RATIO = { '조식': 0.35, '중식': 1.0, '석식': 1.0 };
export const MC = { '조식': '#ff9f43', '중식': '#4fffb0', '석식': '#7eb8ff' };
export const PALETTE = ['#4fffb0', '#7eb8ff', '#ffd60a', '#ff6b6b', '#ff9f43', '#c77dff', '#ff6b9d', '#48dbfb'];

export const DB_NAME = 'sangsan-meal-cache';
export const DB_VERSION = 1;
export const STORE_NAME = 'meals';

export function getMealRec(key, mealName) {
  return DRI[key].rec * (MEAL_RATIO[mealName] || 1.0);
}