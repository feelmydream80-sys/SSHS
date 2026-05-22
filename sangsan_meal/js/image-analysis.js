let iSelectedFile = null;
let iMenuData = null;
let iIsLocalMode = false;

async function iCheckMode() {
  try {
    const resp = await fetch('/api/health', { method: 'GET', signal: AbortSignal.timeout(2000) });
    if (resp.ok) iIsLocalMode = true;
    else iIsLocalMode = false;
  } catch {
    iIsLocalMode = false;
  }
}

function icd(n) {
  const c = new Date(document.getElementById('idp').value);
  c.setDate(c.getDate() + n);
  document.getElementById('idp').value = fd(c, '-');
  iloadMenu();
}

function iloadMenu() {
  const dv = document.getElementById('idp').value;
  if (!dv) return;
  ifetchMenu();
}

function ihandleFile(file) {
  if (!file) return;
  if (!iIsLocalMode) {
    alert('이미지 분석은 로컬 Flask 서버에서만 가능합니다.\npython server.py 실행 후 이용해주세요.');
    return;
  }
  iSelectedFile = file;
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = document.getElementById('preview-img');
    img.src = e.target.result;
    document.getElementById('image-upload-area').style.display = 'none';
    document.getElementById('image-preview').style.display = 'block';
    document.getElementById('ianalyze-section').style.display = 'block';
  };
  reader.readAsDataURL(file);
}

function ihandleDrop(event) {
  event.preventDefault();
  const file = event.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) {
    ihandleFile(file);
  }
}

async function ifetchMenu() {
  const dv = document.getElementById('idp').value;
  if (!dv) {
    document.getElementById('imenu-area').innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:12px">날짜를 먼저 선택해주세요.</div>';
    return;
  }

  const loading = document.getElementById('imenu-loading');
  const area = document.getElementById('imenu-area');
  loading.style.display = 'block';
  area.innerHTML = '';

  try {
    let meals = {};
    let dateStr = dv.replace(/-/g, '');

    if (iIsLocalMode) {
      try {
        const resp = await fetch(`/api/menu/${dateStr}`);
        const data = await resp.json();
        if (!data.error) {
          iMenuData = data;
          meals = data.meals || {};
        }
      } catch {
        meals = await iFetchNEISDirect(dateStr);
      }
    } else {
      meals = await iFetchNEISDirect(dateStr);
    }

    if (!meals || Object.keys(meals).length === 0) {
      area.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:12px">📭 해당일 급식 정보가 없습니다.</div>';
      return;
    }

    let html = '';
    for (const [mealName, mealInfo] of Object.entries(meals)) {
      const mealColor = MC[mealName] || '#fff';
      const calInfo = typeof mealInfo === 'string' ? mealInfo : (mealInfo.calories || '0');
      const dishes = typeof mealInfo === 'string' ? [] : (mealInfo.dishes || []);
      html += `<div style="margin-bottom:12px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span class="meal-badge" style="color:${mealColor};border-color:${mealColor}33;background:${mealColor}0d">${mealName}</span>
          <span style="font-family:'Space Mono',monospace;font-size:11px;font-weight:700;color:${mealColor}">${calInfo} Kcal</span>
        </div>
        <div class="menu-list">${
          dishes.map(d => {
            const nums = (d.match(/\(([\d\.]+)\)/g) || []).flatMap(m => m.replace(/[()]/g, '').split('.').map(Number));
            const hasAllergy = nums.some(n => MA.includes(n));
            return `<span class="menu-item ${hasAllergy ? 'aw' : ''}">${d.replace(/\s*\([\d\.]+\)/g, '').trim()}</span>`;
          }).join('')
        }</div>
      </div>`;
    }

    html += `<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
      <div style="font-size:12px;color:var(--muted);margin-bottom:8px;font-weight:700">📝 분석할 메뉴</div>`;
    const allDishes = [];
    for (const mealInfo of Object.values(meals)) {
      const dishes = typeof mealInfo === 'string' ? [] : (mealInfo.dishes || []);
      for (const d of dishes) {
        const name = d.replace(/\s*\([\d\.]+\)/g, '').trim();
        if (!allDishes.includes(name)) allDishes.push(name);
      }
    }
    const displayDishes = allDishes.slice(0, 6);
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">';
    const labels = ['1번 칸', '2번 칸', '3번 칸', '4번 칸', '5번 칸', '국/찌개'];
    for (let i = 0; i < Math.min(displayDishes.length, 6); i++) {
      html += `<label style="display:flex;align-items:center;gap:6px;padding:6px 10px;background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:6px;font-size:11px;cursor:pointer">
        <span style="color:var(--muted);font-family:'Space Mono',monospace;font-size:9px">${labels[i]}:</span>
        <span>${displayDishes[i]}</span>
      </label>`;
    }
    html += '</div>';

    if (!iIsLocalMode) {
      html += '<div style="margin-top:12px;padding:12px;background:rgba(255,107,107,.08);border:1px solid rgba(255,107,107,.2);border-radius:8px;font-size:11px;color:var(--red)">⚠️ 이미지 분석은 로컬 Flask 서버(python server.py)에서만 가능합니다.</div>';
    }

    html += '</div>';
    area.innerHTML = html;
  } catch (e) {
    area.innerHTML = `<div style="text-align:center;padding:20px;color:var(--red);font-size:12px">⚠️ 메뉴 로드 실패: ${e.message}</div>`;
  } finally {
    loading.style.display = 'none';
  }
}

async function iFetchNEISDirect(dateStr) {
  const rows = await fetchRange(dateStr, dateStr);
  if (!rows || rows.length === 0) return {};

  const meals = {};
  for (const row of rows) {
    const mealName = row.MMEAL_SC_NM;
    const dishes = row.DDISH_NM ? row.DDISH_NM.split('<br/>').filter(Boolean) : [];
    meals[mealName] = {
      calories: row.CAL_INFO || '0',
      dishes: dishes
    };
  }

  iMenuData = { date: dateStr, meals: meals };
  return meals;
}

async function ianalyze() {
  if (!iSelectedFile) {
    alert('먼저 사진을 업로드해주세요.');
    return;
  }

  const btn = document.getElementById('ianalyze-btn');
  const loading = document.getElementById('ianalyze-loading');
  const done = document.getElementById('ianalyze-done');
  const area = document.getElementById('imenu-area');
  const dv = document.getElementById('idp').value;

  btn.disabled = true;
  btn.textContent = '⏳ 분석 중...';
  loading.style.display = 'flex';
  done.innerHTML = '';

  const trayFoods = {};
  const allDishes = [];
  if (iMenuData && iMenuData.meals) {
    for (const mealInfo of Object.values(iMenuData.meals)) {
      const dishes = typeof mealInfo === 'string' ? [] : (mealInfo.dishes || []);
      for (const d of dishes) {
        const name = d.replace(/\s*\([\d\.]+\)/g, '').trim();
        if (!allDishes.includes(name) && name) allDishes.push(name);
      }
    }
  }

  const soupKeyword = window.SOUP_KEYWORDS || ['국', '찌개', '탕', '스프', '죽'];
  let soupFood = '';
  let foodIdx = 0;
  for (let i = 0; i < allDishes.length && foodIdx < 5; i++) {
    const name = allDishes[i];
    const isSoup = soupKeyword.some(k => name.includes(k));
    if (isSoup && !soupFood) {
      soupFood = name;
      continue;
    }
    foodIdx++;
    trayFoods[foodIdx] = name;
  }

  if (foodIdx === 0) {
    for (let i = 1; i <= 5; i++) {
      trayFoods[i] = `${i}번 칸`;
    }
  }

  const formData = new FormData();
  formData.append('image', iSelectedFile);
  formData.append('menu', JSON.stringify(trayFoods));
  formData.append('soup_food', soupFood);
  formData.append('date', dv.replace(/-/g, ''));

  try {
    const resp = await fetch('/api/analyze', {
      method: 'POST',
      body: formData
    });
    const result = await resp.json();

    if (result.error) {
      done.innerHTML = `<div class="empty">⚠️ ${result.error}</div>`;
      return;
    }

    renderAnalysisResult(result);
    loadHistory();
  } catch (e) {
    done.innerHTML = `<div class="empty">⚠️ 분석 요청 실패: ${e.message}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = '🔬 이미지 분석 시작';
    loading.style.display = 'none';
  }
}

function renderAnalysisResult(record) {
  const done = document.getElementById('ianalyze-done');
  const result = record.result;
  if (!result || !result.sections) {
    done.innerHTML = '<div class="empty">분석 결과가 없습니다.</div>';
    return;
  }

  const neisCal = getNEISCalTotal();

  let sectionsHtml = result.sections.map((s, idx) => {
    const kcalColor = s.kcal > 300 ? '#ff6b6b' : s.kcal > 150 ? '#ffd60a' : '#4fffb0';
    return `<div class="result-card">
      <div class="result-card-header">
        <span class="result-section-badge" style="color:var(--green);border-color:rgba(79,255,176,.3)">${s.section === 0 ? '국/찌개' : idx + 1 + '번 칸'}</span>
        <span class="result-kcal-big" style="color:${kcalColor}">${s.kcal} <span style="font-size:14px;font-weight:300">Kcal</span></span>
      </div>
      <div class="result-food-name">${s.food_name}</div>
      <div class="result-stat-row">
        <div class="result-stat-item">면적: <strong>${s.real_area_cm2} cm²</strong></div>
        <div class="result-stat-item">부피: <strong>${s.volume_cm3} cm³</strong></div>
        <div class="result-stat-item">예상 무게: <strong>${s.estimated_weight_g} g</strong></div>
        <div class="result-stat-item">100g당: <strong>${s.kcal_per_100g} Kcal</strong></div>
      </div>
      ${s.is_soup ? '<div style="font-size:11px;color:var(--blue);margin-top:4px">🌊 국/찌개로 분류되어 고정 중량 적용</div>' : ''}
    </div>`;
  }).join('');

  const totalKcalColor = result.total_kcal > 1200 ? '#ff6b6b' : result.total_kcal > 600 ? '#ffd60a' : '#4fffb0';

  const compareHtml = neisCal > 0
    ? `<div class="result-compare">📋 NEIS 제공 칼로리: ${neisCal} Kcal | 이미지 분석: ${result.total_kcal} Kcal | 차이: ${Math.abs(result.total_kcal - neisCal)} Kcal</div>`
    : '';

  done.innerHTML = `
    <div class="result-total-card">
      <div style="font-size:12px;color:var(--muted);font-weight:300;margin-bottom:4px">예상 총 칼로리</div>
      <div class="result-total-kcal" style="color:${totalKcalColor}">${result.total_kcal} Kcal</div>
      ${compareHtml}
    </div>
    ${sectionsHtml}
    <div style="text-align:center;margin-top:8px">
      <span style="font-size:10px;color:var(--muted)">✅ 분석 완료 — ${record.date} ${record.timestamp ? new Date(record.timestamp).toLocaleTimeString() : ''}</span>
    </div>`;
}

function getNEISCalTotal() {
  if (!iMenuData || !iMenuData.meals) return 0;
  let total = 0;
  for (const mealInfo of Object.values(iMenuData.meals)) {
    total += parseFloat(typeof mealInfo === 'string' ? mealInfo : (mealInfo.calories || 0));
  }
  return Math.round(total);
}

async function loadHistory() {
  const area = document.getElementById('ihistory-area');

  if (!iIsLocalMode) {
    area.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:12px">📭 분석 이력은 로컬 서버 실행 시 확인 가능합니다.</div>';
    return;
  }

  try {
    const resp = await fetch('/api/results');
    const results = await resp.json();

    if (!results || results.length === 0) {
      area.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:12px">📭 저장된 분석 결과가 없습니다.</div>';
      return;
    }

    area.innerHTML = results.map(r => {
      const kc = r.result ? r.result.total_kcal : 0;
      const dateStr = r.date || r.timestamp?.slice(0, 10) || '--';
      return `<div class="history-item" onclick="showHistoryDetail('${r.id}')">
        <div>
          <div class="history-date">${dateStr}</div>
          <div style="font-size:10px;color:var(--muted)">${Object.values(r.menu || {}).filter(Boolean).join(', ').slice(0, 30)}...</div>
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <div class="history-kcal" style="color:${kc > 1200 ? '#ff6b6b' : kc > 600 ? '#ffd60a' : '#4fffb0'}">${kc} Kcal</div>
          <button class="history-del" onclick="event.stopPropagation();deleteHistory('${r.id}')">🗑</button>
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    area.innerHTML = `<div style="text-align:center;padding:20px;color:var(--muted);font-size:12px">⚠️ 이력 로드 실패</div>`;
  }
}

async function showHistoryDetail(id) {
  try {
    const resp = await fetch(`/api/results/${id}`);
    const record = await resp.json();
    if (record.error) {
      alert(record.error);
      return;
    }
    renderAnalysisResult(record);
    const btn = document.getElementById('ianalyze-btn');
    btn.textContent = '🔬 새 이미지 분석';
    btn.disabled = false;
  } catch (e) {
    alert('결과 조회 실패: ' + e.message);
  }
}

async function deleteHistory(id) {
  if (!confirm('이 분석 결과를 삭제하시겠습니까?')) return;
  try {
    await fetch(`/api/results/${id}`, { method: 'DELETE' });
    loadHistory();
  } catch (e) {
    alert('삭제 실패: ' + e.message);
  }
}

async function ifocusImageTab() {
  await iCheckMode();
  const today = new Date();
  const dp = document.getElementById('idp');
  if (!dp.value) dp.value = fd(today, '-');
  iloadMenu();
  loadHistory();
  document.getElementById('image-upload-area').style.display = 'block';
  document.getElementById('image-preview').style.display = 'none';
  document.getElementById('ianalyze-section').style.display = 'none';
  document.getElementById('ianalyze-done').innerHTML = '';
  iSelectedFile = null;
}

function iinitTab() {
  const origSW = window.sw;
  const origFn = origSW;
  window.sw = function(name, btn) {
    origFn(name, btn);
    if (name === 'image') {
      setTimeout(ifocusImageTab, 100);
    }
  };
}

document.addEventListener('DOMContentLoaded', iinitTab);
