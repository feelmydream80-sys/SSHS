// 학교 검색
import { SIDO_LIST } from './constants.js';

export async function searchSchoolsRealtime(context, NK) {
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

  if (!sido) {
    dropdownEl.innerHTML = '<div class="autocomplete-empty">시·도를 먼저 선택해주세요</div>';
    dropdownEl.classList.add('on');
    return;
  }

  dropdownEl.innerHTML = '<div class="autocomplete-loading">로딩 중...</div>';
  dropdownEl.classList.add('on');

  try {
    const endpoint = 'schoolInfo';
    let url = `https://open.neis.go.kr/hub/${endpoint}?KEY=${NK}&Type=json&pIndex=1&pSize=100&ATPT_OFCDC_SC_CODE=${sido}`;

    if (query.length > 0) url += `&SCHUL_NM=${encodeURIComponent(query)}`;
    if (level) url += `&SCHUL_KND_SC_NM=${encodeURIComponent(level)}`;

    const res = await fetch(url);
    const j = await res.json();

    if (j.RESULT) {
      dropdownEl.innerHTML = `<div class="autocomplete-empty">${j.RESULT.MESSAGE || '검색 결과가 없습니다'}</div>`;
      return;
    }

    if (!j.schoolInfo) {
      dropdownEl.innerHTML = '<div class="autocomplete-empty">검색 결과가 없습니다</div>';
      return;
    }

    const rows = j.schoolInfo[1]?.row || [];
    if (rows.length === 0) {
      dropdownEl.innerHTML = '<div class="autocomplete-empty">검색 결과가 없습니다</div>';
      return;
    }

    dropdownEl.innerHTML = rows.map(r =>
      `<div class="autocomplete-item" data-atpt="${sido}" data-code="${r.SD_SCHUL_CODE}" data-name="${r.SCHUL_NM}" onclick="selectSchool(this, '${context}')">${r.SCHUL_NM}</div>`
    ).join('');
  } catch (e) {
    dropdownEl.innerHTML = '<div class="autocomplete-empty">검색 중 오류가 발생했습니다</div>';
  }
}

export function selectSchool(el, context) {
  const atpt = el.dataset.atpt;
  const code = el.dataset.code;
  const name = el.dataset.name;

  window.currentSchool = { ATPT: atpt, CODE: code, NAME: name };
  localStorage.setItem('selected_school', JSON.stringify(window.currentSchool));

  if (context === 'nav') {
    document.getElementById('navSchoolSearch').value = name;
    document.getElementById('navAutocomplete').classList.remove('on');
    window.loadToday?.();
  } else {
    document.getElementById('schoolSearchInput').value = name;
    document.getElementById('modalAutocompleteList')?.classList.remove('on');
    window._selectedSchool = { ATPT: atpt, CODE: code, NAME: name };
  }
}

export function initNavSchoolSelect() {
  const s = document.getElementById('navSido');
  s.innerHTML = '<option value="">시·도</option>' + SIDO_LIST.map(x => `<option value="${x.code}">${x.name}</option>`).join('');

  document.getElementById('navSido').value = 'P10';
  document.getElementById('navLevel').value = '고등학교';
  document.getElementById('navSchoolSearch').value = '상산고등학교';

  const searchInput = document.getElementById('navSchoolSearch');
  searchInput.addEventListener('input', window.debounce(() => searchSchoolsRealtime('nav', window.NK), 300));
  searchInput.addEventListener('focus', () => {
    const dropdown = document.getElementById('navAutocomplete');
    const sido = document.getElementById('navSido').value;
    const level = document.getElementById('navLevel').value;
    if (sido && level) searchSchoolsRealtime('nav', window.NK);
    else if (dropdown.children.length > 0) dropdown.classList.add('on');
  });
}

export function onNavSidoChange() {
  document.getElementById('navSchoolSearch').value = '';
  document.getElementById('navAutocomplete').innerHTML = '';
  document.getElementById('navAutocomplete').classList.remove('on');

  const sido = document.getElementById('navSido').value;
  const level = document.getElementById('navLevel').value;
  if (sido && level) searchSchoolsRealtime('nav', window.NK);
}

export function onNavLevelChange() {
  document.getElementById('navSchoolSearch').value = '';
  document.getElementById('navAutocomplete').innerHTML = '';
  document.getElementById('navAutocomplete').classList.remove('on');

  const sido = document.getElementById('navSido').value;
  const level = document.getElementById('navLevel').value;
  if (sido && level) searchSchoolsRealtime('nav', window.NK);
}