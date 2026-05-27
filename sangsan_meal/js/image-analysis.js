let iSelectedFile = null;
let iMenuData = null;
let iIsLocalMode = false;
let iSelectedMealTime = 'lunch';
let iDetectedRegions = [];
let iSelectedRegionIdx = -1;
let iDrawMode = false;
let iDrawPoints = [];
let iImgNaturalW = 0;
let iImgNaturalH = 0;
let iTrayCorners = null;
const REGION_COLORS = ['#ff3232','#32c832','#3264ff','#ffc832','#c832c8','#64c8c8'];
const MEAL_TIME_KR = { 'breakfast': '조식', 'lunch': '중식', 'dinner': '석식' };
let iSoupPlacementMode = false;
let iDragVertex = null; // { idx, vi } while dragging a vertex handle
let iSelectedSwapSection = -1; // section number selected for food swapping

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

async function ihandleFile(file) {
  if (!file) return;
  if (!iIsLocalMode) {
    alert('이미지 분석은 로컬 Flask 서버에서만 가능합니다.\npython server.py 실행 후 이용해주세요.');
    return;
  }
  iSelectedFile = file;
  iDetectedRegions = [];
  iSelectedRegionIdx = -1;
  iDrawMode = false;
  iDrawPoints = [];
  iTrayCorners = null;
  iDragVertex = null;
  iSelectedSwapSection = -1;
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = document.getElementById('preview-img');
    img.src = e.target.result;
    document.getElementById('image-upload-area').style.display = 'none';
    document.getElementById('image-preview').style.display = 'block';
    document.getElementById('ianalyze-section').style.display = 'block';
  };
  reader.readAsDataURL(file);
  try {
    const fd = new FormData();
    fd.append('image', file);
    const resp = await fetch('/api/detect', { method: 'POST', body: fd });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      console.error('[detect] HTTP error:', resp.status, errText.substring(0, 200));
      return;
    }
    const data = await resp.json();
    if (data.image && data.regions) {
      const imgEl = document.getElementById('ioverlay-img');
      imgEl.src = data.image;
      iDetectedRegions = data.regions.map(r => ({ ...r, food_name: '' }));
      document.getElementById('ioverlay-section').style.display = 'block';
      imgEl.onload = () => {
        iImgNaturalW = imgEl.naturalWidth;
        iImgNaturalH = imgEl.naturalHeight;
        irenderRegions();
      };
      if (imgEl.complete && imgEl.naturalWidth) {
        iImgNaturalW = imgEl.naturalWidth;
        iImgNaturalH = imgEl.naturalHeight;
        irenderRegions();
      }
      ibuildLegend();
      isyncInputsToRegions();
      const recalcBtn = document.getElementById('irecalc-btn');
      if (recalcBtn) recalcBtn.style.display = 'inline-block';
    }
  } catch (e) {
    console.warn('영역 검출 실패:', e);
  }
}

function irenderRegions() {
  const svg = document.getElementById('iregions-svg');
  if (!iImgNaturalW || !iImgNaturalH) {
    svg.innerHTML = '';
    return;
  }
  svg.setAttribute('viewBox', `0 0 ${iImgNaturalW} ${iImgNaturalH}`);
  svg.style.pointerEvents = 'none';
  let html = '';
  iDetectedRegions.forEach((r, idx) => {
    if (r.section === 6) return;
    const fill = REGION_COLORS[idx % REGION_COLORS.length];
    const pts = r.polygon.map(p => `${p[0]},${p[1]}`).join(' ');
    const label = `${r.section}번`;
    const foodLabel = r.food_name ? ` ${r.food_name}` : '';
    const dash = (r._placeholder || r.placeholder) ? ' stroke-dasharray="8,4"' : '';
    html += `<polygon points="${pts}" fill="${fill}40" stroke="${fill}" stroke-width="3"${dash}
      data-idx="${idx}" style="pointer-events:auto;cursor:pointer"
      onmouseover="this.setAttribute('fill','${fill}80')"
      onmouseout="this.setAttribute('fill','${fill}40')"
      onclick="iregionClick(${idx})"/>`;
    const cx = r.cx, cy = r.cy;
    html += `<text x="${cx}" y="${cy - 6}" text-anchor="middle" style="pointer-events:none"
      font-size="22" font-weight="bold" stroke="#fff" stroke-width="4">${label}</text>`;
    html += `<text x="${cx}" y="${cy - 6}" text-anchor="middle" style="pointer-events:none"
      font-size="22" font-weight="bold" fill="${fill}">${label}</text>`;
    html += `<text x="${cx}" y="${cy + 20}" text-anchor="middle" style="pointer-events:none"
      font-size="14" font-weight="bold" stroke="#000" stroke-width="3" fill="#fff">${foodLabel}</text>`;
    html += `<text x="${cx}" y="${cy + 20}" text-anchor="middle" style="pointer-events:none"
      font-size="14" font-weight="bold" fill="#fff">${foodLabel}</text>`;
    r.polygon.forEach((p, vi) => {
      html += `<circle cx="${p[0]}" cy="${p[1]}" r="5" fill="#fff" stroke="${fill}" stroke-width="2"
        style="pointer-events:auto;cursor:nwse-resize"
        data-idx="${idx}" data-vi="${vi}"
        onmousedown="iStartVertexDrag(event,${idx},${vi})"/>`;
    });
  });
  svg.innerHTML = html;
}

function ibuildLegend() {
  let html = '';
  iDetectedRegions.forEach((r, idx) => {
    if (r.section === 6) return;
    const c = REGION_COLORS[idx % REGION_COLORS.length];
    const food = r.food_name || '(미지정)';
    html += `<span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;color:var(--muted);cursor:pointer" onclick="iregionClick(${idx})">
      <span style="display:inline-block;width:16px;height:16px;border-radius:3px;background:${c};text-align:center;line-height:16px;font-size:9px;font-weight:700;color:#fff">${r.section}</span>
      ${r.section}번 칸 ${food}
    </span>`;
  });
  document.getElementById('ilegend').innerHTML = html;
}

function iregionClick(idx) {
  if (iDrawMode || iDragVertex) return;
  const r = iDetectedRegions[idx];
  if (!r) return;
  if (r.section === 6) {
    iopenSoupPicker();
    return;
  }
  iSelectedRegionIdx = idx;
  iopenFoodPicker(idx);
}

function iStartVertexDrag(event, idx, vi) {
  if (iDrawMode) return;
  event.stopPropagation();
  event.preventDefault();
  iDragVertex = { idx, vi };
  const svg = document.getElementById('iregions-svg');
  svg.addEventListener('mousemove', iOnVertexDrag);
  svg.addEventListener('mouseup', iEndVertexDrag);
  svg.addEventListener('mouseleave', iEndVertexDrag);
}

function iOnVertexDrag(event) {
  if (!iDragVertex) return;
  const svg = document.getElementById('iregions-svg');
  const rect = svg.getBoundingClientRect();
  const scaleX = iImgNaturalW / rect.width;
  const scaleY = iImgNaturalH / rect.height;
  const x = Math.round(Math.max(0, Math.min((event.clientX - rect.left) * scaleX, iImgNaturalW)));
  const y = Math.round(Math.max(0, Math.min((event.clientY - rect.top) * scaleY, iImgNaturalH)));
  const { idx, vi } = iDragVertex;
  const region = iDetectedRegions[idx];
  if (!region) return;
  region.polygon[vi] = [x, y];
  const poly = svg.querySelector(`polygon[data-idx="${idx}"]`);
  if (poly) poly.setAttribute('points', region.polygon.map(p => `${p[0]},${p[1]}`).join(' '));
  const handle = svg.querySelector(`circle[data-idx="${idx}"][data-vi="${vi}"]`);
  if (handle) { handle.setAttribute('cx', x); handle.setAttribute('cy', y); }
}

function iEndVertexDrag() {
  if (iDragVertex) {
    const { idx } = iDragVertex;
    const region = iDetectedRegions[idx];
    if (region) {
      const xs = region.polygon.map(p => p[0]);
      const ys = region.polygon.map(p => p[1]);
      region.cx = Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
      region.cy = Math.round(ys.reduce((a, b) => a + b, 0) / ys.length);
      irenderRegions();
    }
    iDragVertex = null;
  }
  const svg = document.getElementById('iregions-svg');
  svg.removeEventListener('mousemove', iOnVertexDrag);
  svg.removeEventListener('mouseup', iEndVertexDrag);
  svg.removeEventListener('mouseleave', iEndVertexDrag);
}

function iopenFoodPicker(idx) {
  const r = iDetectedRegions[idx];
  if (!r) return;
  const overlay = document.getElementById('ifood-modal-overlay');
  overlay.style.display = 'flex';
  const col = REGION_COLORS[idx % REGION_COLORS.length];
  document.getElementById('ifood-modal-header').innerHTML =
    `<span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${col};text-align:center;line-height:14px;font-size:10px;font-weight:700;color:#fff;margin-right:6px">${r.id}</span>
     ${r.section}번 칸 — 음식 선택`;

  const selectedMealKR = MEAL_TIME_KR[iSelectedMealTime];
  const allDishes = [];
  if (iMenuData && iMenuData.meals && iMenuData.meals[selectedMealKR]) {
    const meal = iMenuData.meals[selectedMealKR];
    const dishes = typeof meal === 'string' ? [] : (meal.dishes || []);
    for (const d of dishes) {
      const name = d.replace(/\s*\([\d\.]+\)/g, '').trim();
      if (name && !allDishes.includes(name)) allDishes.push(name);
    }
  }
  document.getElementById('ifood-modal-body').dataset.allDishes = JSON.stringify(allDishes);
  document.getElementById('ifood-search-input').value = '';
  ifilterFoodPicker();

  const otherFoods = iDetectedRegions
    .filter((reg, i) => i !== idx && reg.food_name)
    .map(reg => reg.food_name)
    .filter((v, i, a) => a.indexOf(v) === i);
  const otherDiv = document.getElementById('ifood-other-regions');
  const otherBtns = document.getElementById('ifood-other-btns');
  if (otherFoods.length) {
    otherDiv.style.display = 'block';
    otherBtns.innerHTML = otherFoods.map(f =>
      `<button class="sum-tab" onclick="iassignFood('${f.replace(/'/g, "\\'")}')" style="padding:4px 8px;font-size:9px">${f}</button>`
    ).join('');
  } else {
    otherDiv.style.display = 'none';
  }

  const customInput = document.getElementById('ifood-custom-input');
  const soupKeyword = window.SOUP_KEYWORDS || ['국', '찌개', '탕', '스프', '죽'];
  if (!r.food_name) {
    const autoSoup = allDishes.find(d => soupKeyword.some(k => d.includes(k)));
    customInput.value = autoSoup || '';
    customInput.placeholder = autoSoup ? `예: ${autoSoup}` : '예: 콩나물국';
  } else {
    customInput.value = r.food_name;
    customInput.placeholder = '예: 콩나물국';
  }
  customInput.focus();
}

function ifilterFoodPicker() {
  const allDishes = JSON.parse(document.getElementById('ifood-modal-body').dataset.allDishes || '[]');
  const q = document.getElementById('ifood-search-input').value.trim().toLowerCase();
  const body = document.getElementById('ifood-modal-body');
  if (!allDishes.length) {
    body.innerHTML = '<div style="font-size:11px;color:var(--muted);width:100%;text-align:center">메뉴 데이터가 없습니다. 직접 입력해주세요.</div>';
    return;
  }
  const filtered = q ? allDishes.filter(d => d.toLowerCase().includes(q)) : allDishes;
  body.innerHTML = filtered.length
    ? filtered.map(d =>
        `<button class="sum-tab" onclick="iassignFood('${d.replace(/'/g, "\\'")}')" style="padding:6px 10px;font-size:10px">${d}</button>`
      ).join('')
    : `<div style="font-size:11px;color:var(--muted);width:100%;text-align:center">"${q}"와 일치하는 메뉴가 없습니다.<br>직접 입력해주세요.</div>`;
}

function iassignFood(foodName) {
  const idx = iSelectedRegionIdx;
  if (idx < 0 || idx >= iDetectedRegions.length) return;
  const r = iDetectedRegions[idx];
  r.food_name = foodName;
  const section = r.section;
  if (section >= 1 && section <= 5) {
    const el = document.getElementById(`i-food-${section}`);
    if (el) el.value = foodName;
  } else if (section === 6) {
    const soupEl = document.getElementById('i-soup-food');
    if (soupEl) soupEl.value = foodName;
  }
  irenderRegions();
  ibuildLegend();
  icloseFoodPicker();
  isaveMenuMapping();
}

function iassignCustomFood() {
  const val = document.getElementById('ifood-custom-input').value.trim();
  if (val) iassignFood(val);
}

function icloseFoodPicker() {
  document.getElementById('ifood-modal-overlay').style.display = 'none';
  iSelectedRegionIdx = -1;
}

function iopenSoupPicker() {
  const selectedMealKR = MEAL_TIME_KR[iSelectedMealTime];
  const soupKeyword = window.SOUP_KEYWORDS || ['국', '찌개', '탕', '스프', '죽'];
  const soupItems = [];
  if (iMenuData && iMenuData.meals && iMenuData.meals[selectedMealKR]) {
    const meal = iMenuData.meals[selectedMealKR];
    const dishes = typeof meal === 'string' ? [] : (meal.dishes || []);
    for (const d of dishes) {
      const name = d.replace(/\s*\([\d\.]+\)/g, '').trim();
      if (name && !soupItems.includes(name) && soupKeyword.some(k => name.includes(k))) {
        soupItems.push(name);
      }
    }
  }
  const body = document.getElementById('isoup-modal-body');
  body.innerHTML = soupItems.length
    ? soupItems.map(d =>
        `<button class="sum-tab" onclick="iassignSoup('${d.replace(/'/g, "\\'")}')" style="padding:6px 10px;font-size:10px">${d}</button>`
      ).join('')
    : '<div style="font-size:11px;color:var(--muted);width:100%;text-align:center">해당 끼니에 국/찌개 메뉴가 없습니다.<br>직접 입력해주세요.</div>';
  const curVal = document.getElementById('i-soup-food')?.value || '';
  document.getElementById('isoup-custom-input').value = curVal;
  document.getElementById('isoup-custom-input').placeholder = curVal ? `예: ${curVal}` : '예: 콩나물국';
  document.getElementById('isoup-modal-overlay').style.display = 'flex';
  setTimeout(() => document.getElementById('isoup-custom-input').focus(), 100);
}

function iassignSoup(foodName) {
  const el = document.getElementById('i-soup-food');
  if (el) el.value = foodName;
  const region = iDetectedRegions.find(r => r.section === 6);
  if (region) region.food_name = foodName;
  irenderRegions();
  ibuildLegend();
  isaveMenuMapping();
  icloseSoupPicker();
}

function iassignSoupCustom() {
  const val = document.getElementById('isoup-custom-input')?.value?.trim();
  if (val) iassignSoup(val);
}

function icloseSoupPicker() {
  document.getElementById('isoup-modal-overlay').style.display = 'none';
}

function ihandleSwapClick(inputId) {
  const section = inputId === 'i-soup-food' ? 6 : parseInt(inputId.replace('i-food-', ''));
  if (iSelectedSwapSection === -1) {
    iSelectedSwapSection = section;
  } else if (iSelectedSwapSection === section) {
    iSelectedSwapSection = -1;
  } else {
    const fromId = iSelectedSwapSection === 6 ? 'i-soup-food' : `i-food-${iSelectedSwapSection}`;
    const fromEl = document.getElementById(fromId);
    const toEl = document.getElementById(inputId);
    if (fromEl && toEl) {
      const temp = fromEl.value;
      fromEl.value = toEl.value;
      toEl.value = temp;
      const fromRegion = iDetectedRegions.find(r => r.section === iSelectedSwapSection);
      const toRegion = iDetectedRegions.find(r => r.section === section);
      if (fromRegion && toRegion) {
        const tempFood = fromRegion.food_name;
        fromRegion.food_name = toRegion.food_name;
        toRegion.food_name = tempFood;
      }
      irenderRegions();
      ibuildLegend();
      isaveMenuMapping();
    }
    iSelectedSwapSection = -1;
  }
  iupdateSwapHighlights();
}

function iupdateSwapHighlights() {
  document.querySelectorAll('[id^="iswap-label-"]').forEach(el => {
    el.style.color = '';
    el.style.textDecoration = '';
    el.style.fontWeight = '';
  });
  if (iSelectedSwapSection !== -1) {
    const id = iSelectedSwapSection === 6 ? 'i-soup-food' : `i-food-${iSelectedSwapSection}`;
    const el = document.getElementById(`iswap-label-${id}`);
    if (el) {
      el.style.color = 'var(--green)';
      el.style.textDecoration = 'underline';
      el.style.fontWeight = '700';
    }
  }
}

function itoggleDrawMode() {
  iDrawMode = !iDrawMode;
  const btn = document.getElementById('idraw-btn');
  btn.textContent = iDrawMode ? '✅ 완료' : '🖌️ 수동';
  btn.style.background = iDrawMode ? 'rgba(79,255,176,.12)' : '';
  btn.style.borderColor = iDrawMode ? 'rgba(79,255,176,.3)' : '';
  btn.style.color = iDrawMode ? 'var(--green)' : '';
  document.getElementById('idraw-status').style.display = iDrawMode ? 'block' : 'none';
  document.getElementById('iundo-region-btn').style.display = iDrawMode ? 'inline-block' : 'none';
  if (iDrawMode) { iDrawPoints = []; }
  const svg = document.getElementById('iregions-svg');
  svg.style.pointerEvents = 'auto';
  svg.style.cursor = iDrawMode ? 'crosshair' : '';
  if (!iDrawMode && iDrawPoints.length >= 3) {
    ifinishDrawRegion();
  }
  if (iDrawMode) {
    svg.onclick = ihdrawClick;
    svg.ondblclick = function(e) {
      e.preventDefault();
      if (iDrawPoints.length >= 3) ifinishDrawRegion();
    };
  } else {
    svg.onclick = null;
    svg.ondblclick = null;
    irenderRegions();
  }
  irenderDrawPreview();
}

function ihdrawClick(event) {
  const svg = document.getElementById('iregions-svg');
  const rect = svg.getBoundingClientRect();
  const scaleX = iImgNaturalW / rect.width;
  const scaleY = iImgNaturalH / rect.height;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;
  iDrawPoints.push([Math.round(x), Math.round(y)]);
  irenderDrawPreview();
}

function irenderDrawPreview() {
  const svg = document.getElementById('iregions-svg');
  if (!iDrawPoints.length) {
    const existing = svg.querySelector('#idraw-preview');
    if (existing) existing.remove();
    return;
  }
  let existing = svg.querySelector('#idraw-preview');
  if (!existing) {
    existing = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    existing.id = 'idraw-preview';
    svg.appendChild(existing);
  }
  existing.innerHTML = '';
  const pts = iDrawPoints.map(p => `${p[0]},${p[1]}`).join(' ');
  const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  poly.setAttribute('points', pts);
  poly.setAttribute('fill', 'rgba(255,255,255,0.15)');
  poly.setAttribute('stroke', '#fff');
  poly.setAttribute('stroke-width', '2');
  poly.setAttribute('stroke-dasharray', '6,3');
  existing.appendChild(poly);
  iDrawPoints.forEach((p, i) => {
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', p[0]); dot.setAttribute('cy', p[1]);
    dot.setAttribute('r', '5'); dot.setAttribute('fill', '#fff');
    existing.appendChild(dot);
  });
}

function ifinishDrawRegion() {
  const newIdx = iDetectedRegions.length;
  const xs = iDrawPoints.map(p => p[0]);
  const ys = iDrawPoints.map(p => p[1]);
  const cx = Math.round(xs.reduce((a,b) => a+b, 0) / xs.length);
  const cy = Math.round(ys.reduce((a,b) => a+b, 0) / ys.length);
  iDetectedRegions.push({
    id: String(newIdx + 1), section: newIdx + 1, cls: 0,
    polygon: iDrawPoints.map(p => [p[0], p[1]]),
    cx, cy, pixel_area: 0, food_name: ''
  });
  iDrawPoints = [];
  window.setTimeout(() => {
    irenderRegions();
    ibuildLegend();
    irenderDrawPreview();
    iopenFoodPicker(newIdx);
  }, 100);
}

function iundoLastRegion() {
  if (iDrawPoints.length > 0) {
    iDrawPoints.pop();
    irenderDrawPreview();
  }
}

function iaddEmptyRegion() {
  const maxSection = Math.max(0, ...iDetectedRegions.map(r => r.section));
  if (maxSection >= 6) { alert('최대 6개 영역까지 추가 가능합니다.'); return; }
  const newSection = maxSection + 1;
  const iw = iImgNaturalW || 600;
  const ih = iImgNaturalH || 450;
  const margin = 0.05;
  const cols = Math.min(newSection, 3);
  const rows = Math.ceil(newSection / 3);
  const cw = (1 - 2 * margin) / cols;
  const rh = (1 - 2 * margin) / rows;
  const ci = (newSection - 1) % cols;
  const ri = Math.floor((newSection - 1) / cols);
  const x1 = Math.round(iw * (margin + ci * cw));
  const y1 = Math.round(ih * (margin + ri * rh));
  const x2 = Math.round(iw * (margin + (ci + 1) * cw));
  const y2 = Math.round(ih * (margin + (ri + 1) * rh));
  const cx = Math.round((x1 + x2) / 2);
  const cy = Math.round((y1 + y2) / 2);
  iDetectedRegions.push({
    id: String(newSection), section: newSection, cls: 0,
    polygon: [[x1,y1],[x2,y1],[x2,y2],[x1,y2]],
    cx, cy, pixel_area: 0, food_name: ''
  });
  irenderRegions();
  ibuildLegend();
  iopenFoodPicker(iDetectedRegions.length - 1);
}

function isaveTemplate() {
  if (!iDetectedRegions.length) { alert('저장할 영역이 없습니다.'); return; }
  const name = prompt('템플릿 이름:', `식판형_${new Date().toLocaleDateString()}`);
  if (!name) return;
  const templates = JSON.parse(localStorage.getItem('image_region_templates') || '[]');
  templates.push({ name, regions: JSON.parse(JSON.stringify(iDetectedRegions)), timestamp: Date.now() });
  localStorage.setItem('image_region_templates', JSON.stringify(templates));
  alert(`템플릿 "${name}" 저장됨`);
}

function iloadTemplate() {
  const templates = JSON.parse(localStorage.getItem('image_region_templates') || '[]');
  if (!templates.length) { alert('저장된 템플릿이 없습니다.'); return; }
  const names = templates.map((t, i) => `${i+1}. ${t.name}`).join('\n');
  const idx = parseInt(prompt(`불러올 템플릿 번호:\n${names}`)) - 1;
  if (isNaN(idx) || idx < 0 || idx >= templates.length) return;
  const t = templates[idx];
  iDetectedRegions = JSON.parse(JSON.stringify(t.regions));
  irenderRegions();
  ibuildLegend();
  iDetectedRegions.forEach(r => {
    const inputId = r.section === 6 || r.section === 0 ? 'i-soup-food' : `i-food-${r.section}`;
    const inputEl = document.getElementById(inputId);
    if (inputEl && r.food_name) inputEl.value = r.food_name;
  });
  alert(`템플릿 "${t.name}" 불러옴`);
}

function ihandleDrop(event) {
  event.preventDefault();
  const file = event.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) {
    ihandleFile(file);
  }
}

function selectMealTime(meal, btn) {
  iSelectedMealTime = meal;
  document.querySelectorAll('.meal-time-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  if (iMenuData) ifetchMenu();
  const section = document.getElementById('ianalyze-section');
  if (section && section.style.display !== 'none') {
    setTimeout(() => section.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
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
        if (!data.error && data.meals && Object.keys(data.meals).length > 0) {
          iMenuData = data;
          meals = data.meals;
        } else {
          meals = await iFetchNEISDirect(dateStr);
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
    const selectedMealKR = MEAL_TIME_KR[iSelectedMealTime];
    const allDishes = [];
    const mealObj = meals[selectedMealKR];
    if (mealObj && typeof mealObj !== 'string') {
      for (const d of (mealObj.dishes || [])) {
        const name = d.replace(/\s*\([\d\.]+\)/g, '').trim();
        if (!allDishes.includes(name) && name) allDishes.push(name);
      }
    }
    const soupKeyword = window.SOUP_KEYWORDS || ['국', '찌개', '탕', '스프', '죽'];
    const riceKeyword = ['밥', '쌀밥', '잡곡', '현미', '흑미', '콥밥', '귀리', '보리'];
    let autoRice = '';
    let autoSoup = '';
    const autoTray = [];
    for (const name of allDishes) {
      if (!autoRice && riceKeyword.some(k => name.includes(k))) {
        autoRice = name;
      } else if (!autoSoup && soupKeyword.some(k => name.includes(k))) {
        autoSoup = name;
      } else if (autoTray.length < 4) {
        autoTray.push(name);
      }
    }
    const inputIds = ['i-food-1', 'i-food-2', 'i-food-3', 'i-food-4', 'i-food-5', 'i-soup-food'];
    const inputLabels = ['1번 칸', '2번 칸', '3번 칸', '4번 칸', '5번 칸', '국/찌개'];
    const inputValues = [
      autoTray[0] || '', autoTray[1] || '', autoTray[2] || '', autoTray[3] || '',
      autoRice || '', autoSoup || ''
    ];
    const prevInputs = {};
    for (const id of inputIds) {
      const el = document.getElementById(id);
      if (el && el.value) prevInputs[id] = el.value;
    }

    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">';
    for (let i = 0; i < 6; i++) {
      const preserved = prevInputs[inputIds[i]] || '';
      const val = preserved || inputValues[i] || '';
      const isSoupInput = inputIds[i] === 'i-soup-food';
      html += `<label style="display:flex;align-items:center;gap:6px;padding:6px 10px;background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:6px;font-size:11px">
        <span id="iswap-label-${inputIds[i]}" style="color:var(--muted);font-family:'Space Mono',monospace;font-size:9px;cursor:pointer;white-space:nowrap" onclick="ihandleSwapClick('${inputIds[i]}')" title="클릭하여 다른 칸과 교체">${inputLabels[i]}:</span>
        <input id="${inputIds[i]}" type="text" value="${val}" style="flex:1;padding:4px 8px;border-radius:4px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:11px;outline:none;min-width:0${isSoupInput ? ';cursor:pointer' : ''}" placeholder="(직접 입력)"
          oninput="ionInputFieldChange('${inputIds[i]}')"${isSoupInput ? ` onclick="iopenSoupPicker()"` : ''}>
      </label>`;
    }
    html += '</div></div>';

    if (!iIsLocalMode) {
      html += '<div style="margin-top:12px;padding:12px;background:rgba(255,107,107,.08);border:1px solid rgba(255,107,107,.2);border-radius:8px;font-size:11px;color:var(--red)">⚠️ 이미지 분석은 로컬 Flask 서버(python server.py)에서만 가능합니다.</div>';
    }

    html += '</div>';
    area.innerHTML = html;
    irestoreSavedMapping();
    isyncInputsToRegions();
  } catch (e) {
    area.innerHTML = `<div style="text-align:center;padding:20px;color:var(--red);font-size:12px">⚠️ 메뉴 로드 실패: ${e.message}</div>`;
  } finally {
    loading.style.display = 'none';
  }
}

function iflashRegion(idx) {
  const svg = document.getElementById('iregions-svg');
  const poly = svg.querySelector(`polygon[data-idx="${idx}"]`);
  if (!poly) return;
  const origFill = poly.getAttribute('fill');
  const origWidth = poly.getAttribute('stroke-width');
  poly.setAttribute('fill', 'rgba(255,255,255,0.3)');
  poly.setAttribute('stroke-width', '6');
  setTimeout(() => {
    poly.setAttribute('fill', origFill);
    poly.setAttribute('stroke-width', origWidth || '3');
  }, 600);
}

function ionInputFieldChange(inputId) {
  const value = document.getElementById(inputId)?.value || '';
  const section = inputId === 'i-soup-food' ? 6 : parseInt(inputId.replace('i-food-', ''));
  const region = iDetectedRegions.find(r => r.section === section);
  if (region) region.food_name = value;
  irenderRegions();
  ibuildLegend();
  isaveMenuMapping();
}

function isyncInputsToRegions() {
  for (let sec = 1; sec <= 5; sec++) {
    const el = document.getElementById(`i-food-${sec}`);
    if (el && el.value) {
      const region = iDetectedRegions.find(r => r.section === sec);
      if (region) region.food_name = el.value;
    }
  }
  const soupEl = document.getElementById('i-soup-food');
  if (soupEl && soupEl.value) {
    const region = iDetectedRegions.find(r => r.section === 6);
    if (region) region.food_name = soupEl.value;
  }
  irenderRegions();
  ibuildLegend();
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

  isyncInputsToRegions();
  const formData = new FormData();
  formData.append('image', iSelectedFile);
  formData.append('date', dv.replace(/-/g, ''));
  formData.append('meal_time', iSelectedMealTime);

  if (iDetectedRegions.length > 0) {
    formData.append('use_regions', 'true');
    formData.append('regions', JSON.stringify(iDetectedRegions.map(r => ({
      section: r.section,
      food_name: r.food_name,
      polygon: r.polygon
    }))));
    if (iTrayCorners) formData.append('tray_corners', JSON.stringify(iTrayCorners));
  } else {
    const soupFood = document.getElementById('i-soup-food')?.value || '';
    const trayFoods = {};
    for (let i = 1; i <= 5; i++) {
      const val = document.getElementById(`i-food-${i}`)?.value?.trim();
      trayFoods[i] = val || `${i}번 칸`;
    }
    formData.append('menu', JSON.stringify(trayFoods));
    formData.append('soup_food', soupFood);
  }

  if (!window._ianalyzeRetry) window._ianalyzeRetry = 0;

  let resp = null;
  try {
    resp = await fetch('/api/analyze', {
      method: 'POST',
      body: formData
    });
    const result = await resp.json();

    window._ianalyzeRetry = 0;

    if (result.error) {
      done.innerHTML = `<div class="empty">⚠️ ${result.error}</div>`;
      return;
    }

    isaveMenuMapping();
    renderAnalysisResult(result);
    const recalcBtn = document.getElementById('irecalc-btn');
    if (recalcBtn) recalcBtn.style.display = iDetectedRegions.length > 0 ? 'inline-block' : 'none';
    loadHistory();
  } catch (e) {
    window._ianalyzeRetry++;
    const isTimeout = !resp || resp.status === 502 || resp.status === 504;
    const delay = isTimeout ? Math.min(3000 * window._ianalyzeRetry, 15000) : 10000;
    let detail = `<div class="empty">⚠️ 분석 요청 실패`;

    if (isTimeout) {
      detail += `: 서버가 아직 준비 중입니다 (cold start).<br><small style="opacity:.6">`;
      if (resp) detail += `HTTP ${resp.status} `;
      detail += `(${window._ianalyzeRetry}번째 재시도, ${Math.round(delay/1000)}초 후...)`;
    } else {
      detail += `: ${e.message}<br><small style="opacity:.6">`;
      if (resp) detail += `HTTP ${resp.status} `;
    }
    detail += `</small></div>`;
    done.innerHTML = detail;

    if (resp && !isTimeout) {
      resp.text().then(text => {
        if (text) console.error('[analyze] 응답 본문:', text.substring(0, 500));
      }).catch(() => {});
    }

    setTimeout(() => { if (!btn.disabled) ianalyze(); }, delay);
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
      <span style="font-size:10px;color:var(--muted)">✅ 분석 완료 — ${record.date} ${MEAL_TIME_KR[record.meal_time] || ''} ${record.timestamp ? new Date(record.timestamp).toLocaleTimeString() : ''}</span>
    </div>`;
}

function getNEISCalTotal() {
  if (!iMenuData || !iMenuData.meals) return 0;
  const selectedMealKR = MEAL_TIME_KR[iSelectedMealTime];
  const mealObj = iMenuData.meals[selectedMealKR];
  if (!mealObj) return 0;
  const cal = typeof mealObj === 'string' ? mealObj : (mealObj.calories || 0);
  return Math.round(parseFloat(cal));
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
      const mealLabel = MEAL_TIME_KR[r.meal_time] || '';
      return `<div class="history-item" onclick="showHistoryDetail('${r.id}')">
        <div>
          <div class="history-date">${dateStr} ${mealLabel}</div>
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

function irestoreSavedMapping() {
  const dv = document.getElementById('idp')?.value;
  if (!dv || !iSelectedMealTime) return;
  const key = `image_menu_map_${dv.replace(/-/g, '')}_${iSelectedMealTime}`;
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (!saved) return;
    const soupEl = document.getElementById('i-soup-food');
    if (soupEl && saved.soup !== undefined && !soupEl.value) soupEl.value = saved.soup;
    for (let i = 1; i <= 5; i++) {
      const el = document.getElementById(`i-food-${i}`);
      if (el && saved[i] !== undefined && !el.value) el.value = saved[i];
    }
    isyncInputsToRegions();
  } catch {}
}

function isaveMenuMapping() {
  const dv = document.getElementById('idp')?.value;
  if (!dv || !iSelectedMealTime) return;
  const key = `image_menu_map_${dv.replace(/-/g, '')}_${iSelectedMealTime}`;
  const data = { soup: document.getElementById('i-soup-food')?.value || '' };
  for (let i = 1; i <= 5; i++) {
    data[i] = document.getElementById(`i-food-${i}`)?.value || '';
  }
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {}
}

async function ifocusImageTab() {
  await iCheckMode();
  const today = new Date();
  const dp = document.getElementById('idp');
  if (!dp.value) dp.value = fd(today, '-');
  iSelectedMealTime = 'lunch';
  document.querySelectorAll('.meal-time-btn').forEach(b => b.classList.toggle('selected', b.dataset.meal === 'lunch'));
  iloadMenu();
  loadHistory();
  document.getElementById('image-upload-area').style.display = 'block';
  document.getElementById('image-preview').style.display = 'none';
  document.getElementById('ioverlay-section').style.display = 'none';
  document.getElementById('ianalyze-section').style.display = 'none';
  document.getElementById('ianalyze-done').innerHTML = '';
  document.getElementById('iregions-svg').innerHTML = '';
  iSelectedFile = null;
  iDetectedRegions = [];
  iSelectedRegionIdx = -1;
  iDrawMode = false;
  iDrawPoints = [];
  iTrayCorners = null;
  iDragVertex = null;
  iSelectedSwapSection = -1;
  iSoupPlacementMode = false;
  const recalcBtn = document.getElementById('irecalc-btn');
  if (recalcBtn) recalcBtn.style.display = 'none';
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
