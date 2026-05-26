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
const MEAL_TIME_KR = { 'breakfast': 'Ï°∞Ïãù', 'lunch': 'Ï§ëÏãù', 'dinner': '?ùÏãù' };
let iMenuMapping = [];

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
    alert('?¥Î?ÏßÄ Î∂ÑÏÑù?Ä Î°úÏª¨ Flask ?úÎ≤Ñ?êÏÑúÎß?Í∞Ä?•Ìï©?àÎã§.\npython server.py ?§Ìñâ ???¥Ïö©?¥Ï£º?∏Ïöî.');
    return;
  }
  iSelectedFile = file;
  iDetectedRegions = [];
  iSelectedRegionIdx = -1;
  iDrawMode = false;
  iDrawPoints = [];
  iTrayCorners = null;
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
      isyncMappingToRegions();
    }
  } catch (e) {
    console.warn('?ÅÏó≠ Í≤ÄÏ∂??§Ìå®:', e);
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
    const fill = REGION_COLORS[idx % REGION_COLORS.length];
    const pts = r.polygon.map(p => `${p[0]},${p[1]}`).join(' ');
    const label = `${r.section}Î≤?;
    const foodLabel = r.food_name ? ` ${r.food_name}` : '';
    const dash = r._placeholder ? ' stroke-dasharray="8,4"' : '';
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
  });
  svg.innerHTML = html;
}

function ibuildLegend() {
  const html = iDetectedRegions.map((r, idx) => {
    const c = REGION_COLORS[idx % REGION_COLORS.length];
    const food = r.food_name || '(ÎØ∏Ï???';
    return `<span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;color:var(--muted);cursor:pointer" onclick="iregionClick(${idx})">
      <span style="display:inline-block;width:16px;height:16px;border-radius:3px;background:${c};text-align:center;line-height:16px;font-size:9px;font-weight:700;color:#fff">${r.section}</span>
      ${r.section}Î≤?Ïπ?${food}
    </span>`;
  }).join('');
  document.getElementById('ilegend').innerHTML = html;
}

function iregionClick(idx) {
  if (iDrawMode) return;
  iSelectedRegionIdx = idx;
  iopenFoodPicker(idx);
}

function iopenFoodPicker(idx) {
  const r = iDetectedRegions[idx];
  if (!r) return;
  const overlay = document.getElementById('ifood-modal-overlay');
  overlay.style.display = 'flex';
  const col = REGION_COLORS[idx % REGION_COLORS.length];
  document.getElementById('ifood-modal-header').innerHTML =
    `<span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${col};text-align:center;line-height:14px;font-size:10px;font-weight:700;color:#fff;margin-right:6px">${r.id}</span>
     ${r.section}Î≤?Ïπ????åÏãù ?†ÌÉù`;

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
  const soupKeyword = window.SOUP_KEYWORDS || ['Íµ?, 'Ï∞åÍ∞ú', '??, '?§ÌîÑ', 'Ï£?];
  if (!r.food_name) {
    const autoSoup = allDishes.find(d => soupKeyword.some(k => d.includes(k)));
    customInput.value = autoSoup || '';
    customInput.placeholder = autoSoup ? `?? ${autoSoup}` : '?? ÏΩ©ÎÇòÎ¨ºÍµ≠';
  } else {
    customInput.value = r.food_name;
    customInput.placeholder = '?? ÏΩ©ÎÇòÎ¨ºÍµ≠';
  }
  customInput.focus();
}

function ifilterFoodPicker() {
  const allDishes = JSON.parse(document.getElementById('ifood-modal-body').dataset.allDishes || '[]');
  const q = document.getElementById('ifood-search-input').value.trim().toLowerCase();
  const body = document.getElementById('ifood-modal-body');
  if (!allDishes.length) {
    body.innerHTML = '<div style="font-size:11px;color:var(--muted);width:100%;text-align:center">Î©îÎâ¥ ?∞Ïù¥?∞Í? ?ÜÏäµ?àÎã§. ÏßÅÏ†ë ?ÖÎ†•?¥Ï£º?∏Ïöî.</div>';
    return;
  }
  const filtered = q ? allDishes.filter(d => d.toLowerCase().includes(q)) : allDishes;
  body.innerHTML = filtered.length
    ? filtered.map(d =>
        `<button class="sum-tab" onclick="iassignFood('${d.replace(/'/g, "\\'")}')" style="padding:6px 10px;font-size:10px">${d}</button>`
      ).join('')
    : `<div style="font-size:11px;color:var(--muted);width:100%;text-align:center">"${q}"?Ä ?ºÏπò?òÎäî Î©îÎâ¥Í∞Ä ?ÜÏäµ?àÎã§.<br>ÏßÅÏ†ë ?ÖÎ†•?¥Ï£º?∏Ïöî.</div>`;
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
  }
  const soupEl = document.getElementById('i-soup-food');
  const isSoup = window.SOUP_KEYWORDS ? window.SOUP_KEYWORDS.some(k => foodName.includes(k)) : false;
  if (isSoup) { if (soupEl) soupEl.value = foodName; }
  irenderRegions();
  ibuildLegend();
  icloseFoodPicker();
  isyncDropdownFromRegion(section, foodName);
  isaveMenuMapping();
}

function isyncDropdownFromRegion(section, foodName) {
  if (!iMenuMapping || !foodName) return;
  for (let i = 0; i < iMenuMapping.length; i++) {
    if (iMenuMapping[i].dish === foodName) {
      iMenuMapping[i].section = section === 0 ? 0 : section;
      const select = document.querySelector(`#imapping-list select[data-dish-idx="${i}"]`);
      if (select) select.value = iMenuMapping[i].section;
      break;
    }
  }
}

function iassignCustomFood() {
  const val = document.getElementById('ifood-custom-input').value.trim();
  if (val) iassignFood(val);
}

function icloseFoodPicker() {
  document.getElementById('ifood-modal-overlay').style.display = 'none';
  iSelectedRegionIdx = -1;
}

function itoggleDrawMode() {
  iDrawMode = !iDrawMode;
  const btn = document.getElementById('idraw-btn');
  btn.textContent = iDrawMode ? '???ÑÎ£å' : '?ñåÔ∏??òÎèô';
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
  if (maxSection >= 6) { alert('ÏµúÎ? 6Í∞??ÅÏó≠ÍπåÏ? Ï∂îÍ? Í∞Ä?•Ìï©?àÎã§.'); return; }
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
  if (!iDetectedRegions.length) { alert('?Ä?•Ìï† ?ÅÏó≠???ÜÏäµ?àÎã§.'); return; }
  const name = prompt('?úÌîåÎ¶??¥Î¶Ñ:', `?ùÌåê??${new Date().toLocaleDateString()}`);
  if (!name) return;
  const templates = JSON.parse(localStorage.getItem('image_region_templates') || '[]');
  templates.push({ name, regions: JSON.parse(JSON.stringify(iDetectedRegions)), timestamp: Date.now() });
  localStorage.setItem('image_region_templates', JSON.stringify(templates));
  alert(`?úÌîåÎ¶?"${name}" ?Ä?•Îê®`);
}

function iloadTemplate() {
  const templates = JSON.parse(localStorage.getItem('image_region_templates') || '[]');
  if (!templates.length) { alert('?Ä?•Îêú ?úÌîåÎ¶øÏù¥ ?ÜÏäµ?àÎã§.'); return; }
  const names = templates.map((t, i) => `${i+1}. ${t.name}`).join('\n');
  const idx = parseInt(prompt(`Î∂àÎü¨???úÌîåÎ¶?Î≤àÌò∏:\n${names}`)) - 1;
  if (isNaN(idx) || idx < 0 || idx >= templates.length) return;
  const t = templates[idx];
  iDetectedRegions = JSON.parse(JSON.stringify(t.regions));
  irenderRegions();
  ibuildLegend();
  iDetectedRegions.forEach(r => {
    const inputId = r.section === 6 || r.section === 0 ? 'i-soup-food' : `i-food-${r.section}`;
    const inputEl = document.getElementById(inputId);
    if (inputEl && r.food_name) inputEl.value = r.food_name;
    if (r.food_name && iMenuMapping) {
      for (let i = 0; i < iMenuMapping.length; i++) {
        if (iMenuMapping[i].dish === r.food_name || !iMenuMapping[i].dish) {
          iMenuMapping[i].section = r.section === 6 ? 0 : r.section;
          const select = document.querySelector(`#imapping-list select[data-dish-idx="${i}"]`);
          if (select) select.value = iMenuMapping[i].section;
          break;
        }
      }
    }
  });
  alert(`?úÌîåÎ¶?"${t.name}" Î∂àÎü¨??);
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
    document.getElementById('imenu-area').innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:12px">?†ÏßúÎ•?Î®ºÏ? ?†ÌÉù?¥Ï£º?∏Ïöî.</div>';
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
      area.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:12px">?ì≠ ?¥Îãπ??Í∏âÏãù ?ïÎ≥¥Í∞Ä ?ÜÏäµ?àÎã§.</div>';
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
      <div style="font-size:12px;color:var(--muted);margin-bottom:4px;font-weight:700">?çΩÔ∏?Î©îÎâ¥ ??Ïπ?Îß§Ïπ≠</div>
      <div style="font-size:10px;color:var(--muted);margin-bottom:12px">Í∞?Î©îÎâ¥Í∞Ä ?ùÌåê??Î™?Î≤?Ïπ∏Ïóê ?àÎäîÏßÄ ?†ÌÉù?òÏÑ∏??/div>
      <div id="imapping-list" style="display:flex;flex-direction:column;gap:4px;margin-bottom:16px">`;
    const selectedMealKR = MEAL_TIME_KR[iSelectedMealTime];
    const allDishes = [];
    const mealObj = meals[selectedMealKR];
    if (mealObj && typeof mealObj !== 'string') {
      for (const d of (mealObj.dishes || [])) {
        const name = d.replace(/\s*\([\d\.]+\)/g, '').trim();
        if (!allDishes.includes(name) && name) allDishes.push(name);
      }
    }
    const soupKeyword = window.SOUP_KEYWORDS || ['Íµ?, 'Ï∞åÍ∞ú', '??, '?§ÌîÑ', 'Ï£?];
    const autoMapping = [];
    let foundSoup = false;
    for (let i = 0; i < allDishes.length; i++) {
      const name = allDishes[i];
      if (!foundSoup && soupKeyword.some(k => name.includes(k))) {
        autoMapping.push({dish: name, section: 0});
        foundSoup = true;
      } else {
        const trayIdx = autoMapping.filter(m => m.section > 0).length + 1;
        autoMapping.push({dish: name, section: trayIdx <= 5 ? trayIdx : -1});
      }
    }
    if (!foundSoup && autoMapping.length > 0) {
      autoMapping[0].section = 0;
    }
    autoMapping.forEach(m => { m._prevSection = m.section; });
    iMenuMapping = autoMapping;
    iMenuMapping.forEach((m, idx) => {
      html += `<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:6px;font-size:11px">
        <span style="flex:1">${m.dish}</span>
        <span style="color:var(--muted)">??/span>
        <select data-dish-idx="${idx}" onchange="iupdateMappingFromDropdown(${idx}, parseInt(this.value))"
          style="padding:4px 8px;border-radius:4px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:11px;outline:none;cursor:pointer;font-family:'Space Mono',monospace">
          <option value="-1" ${m.section === -1 ? 'selected' : ''}>(ÏßÄ??????</option>
          <option value="0" ${m.section === 0 ? 'selected' : ''}>?•£ Íµ?Ï∞åÍ∞ú</option>
          <option value="1" ${m.section === 1 ? 'selected' : ''}>1Î≤?Ïπ?/option>
          <option value="2" ${m.section === 2 ? 'selected' : ''}>2Î≤?Ïπ?/option>
          <option value="3" ${m.section === 3 ? 'selected' : ''}>3Î≤?Ïπ?/option>
          <option value="4" ${m.section === 4 ? 'selected' : ''}>4Î≤?Ïπ?/option>
          <option value="5" ${m.section === 5 ? 'selected' : ''}>5Î≤?Ïπ?/option>
        </select>
      </div>`;
    });
    const inputIds = ['i-soup-food', 'i-food-1', 'i-food-2', 'i-food-3', 'i-food-4', 'i-food-5'];
    const inputLabels = ['Íµ?Ï∞åÍ∞ú', '1Î≤?Ïπ?, '2Î≤?Ïπ?, '3Î≤?Ïπ?, '4Î≤?Ïπ?, '5Î≤?Ïπ?];
    const inputFoods = ['', '', '', '', '', ''];
    iMenuMapping.forEach(m => {
      if (m.section >= 0 && m.section <= 5) {
        inputFoods[m.section] = m.dish;
      }
    });
    html += '</div>';
    html += `<div style="margin-bottom:8px;padding-top:8px;border-top:1px solid var(--border)">
      <div style="font-size:10px;color:var(--muted);margin-bottom:8px">?êÎäî ÏßÅÏ†ë ?ÖÎ†•</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">`;
    for (let i = 0; i < 6; i++) {
      html += `<label style="display:flex;align-items:center;gap:6px;padding:6px 10px;background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:6px;font-size:11px">
        <span style="color:var(--muted);font-family:'Space Mono',monospace;font-size:9px">${inputLabels[i]}:</span>
        <input id="${inputIds[i]}" type="text" value="${inputFoods[i] || ''}" style="flex:1;padding:4px 8px;border-radius:4px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:11px;outline:none;min-width:0" placeholder="(ÏßÅÏ†ë ?ÖÎ†•)"
          oninput="ionInputFieldChange('${inputIds[i]}')">
      </label>`;
    }
    html += '</div></div>';

    if (!iIsLocalMode) {
      html += '<div style="margin-top:12px;padding:12px;background:rgba(255,107,107,.08);border:1px solid rgba(255,107,107,.2);border-radius:8px;font-size:11px;color:var(--red)">?†Ô∏è ?¥Î?ÏßÄ Î∂ÑÏÑù?Ä Î°úÏª¨ Flask ?úÎ≤Ñ(python server.py)?êÏÑúÎß?Í∞Ä?•Ìï©?àÎã§.</div>';
    }

    html += '</div>';
    area.innerHTML = html;
    irestoreSavedMapping();
  } catch (e) {
    area.innerHTML = `<div style="text-align:center;padding:20px;color:var(--red);font-size:12px">?†Ô∏è Î©îÎâ¥ Î°úÎìú ?§Ìå®: ${e.message}</div>`;
  } finally {
    loading.style.display = 'none';
  }
}

function iupdateMappingFromDropdown(dishIndex, section) {
  if (!iMenuMapping || dishIndex >= iMenuMapping.length) return;
  iMenuMapping[dishIndex].section = section;
  const dish = iMenuMapping[dishIndex].dish;
  if (section >= 0) {
    iassignFoodToSection(dish, section);
  } else {
    const prevSection = iMenuMapping[dishIndex]._prevSection;
    if (prevSection >= 0) {
      const inputId = prevSection === 0 ? 'i-soup-food' : `i-food-${prevSection}`;
      const el = document.getElementById(inputId);
      if (el && el.value === dish) el.value = '';
      const region = iDetectedRegions.find(r => r.section === prevSection);
      if (region && region.food_name === dish) region.food_name = '';
    }
    irenderRegions();
    ibuildLegend();
  }
  iMenuMapping[dishIndex]._prevSection = section;
  ihandleDuplicateWarning();
  if (section > 0) {
    const regionIdx = iDetectedRegions.findIndex(r => r.section === section);
    if (regionIdx >= 0) iflashRegion(regionIdx);
  }
  isaveMenuMapping();
}

function iassignFoodToSection(foodName, section) {
  if (section === 0) {
    const soupEl = document.getElementById('i-soup-food');
    if (soupEl) soupEl.value = foodName;
    let region = iDetectedRegions.find(r => r.section === 6);
    if (!region) {
      iensureRegionExists(6);
      region = iDetectedRegions.find(r => r.section === 6);
    }
    if (region) region.food_name = foodName;
    irenderRegions();
    ibuildLegend();
    return;
  }
  iensureRegionExists(section);
  const region = iDetectedRegions.find(r => r.section === section);
  if (region) region.food_name = foodName;
  const el = document.getElementById(`i-food-${section}`);
  if (el) el.value = foodName;
  irenderRegions();
  ibuildLegend();
}

function iensureRegionExists(section) {
  if (section < 1 || (section > 5 && section !== 6)) return;
  if (iDetectedRegions.some(r => r.section === section)) return;
  const iw = iImgNaturalW || 600;
  const ih = iImgNaturalH || 450;
  const margin = 0.05;
  const cols = 3;
  const ci = (section - 1) % cols;
  const ri = Math.floor((section - 1) / cols);
  const cw = (1 - 2 * margin) / cols;
  const rh = (1 - 2 * margin) / 2;
  const x1 = Math.round(iw * (margin + ci * cw));
  const y1 = Math.round(ih * (margin + ri * rh));
  const x2 = Math.round(iw * (margin + (ci + 1) * cw));
  const y2 = Math.round(ih * (margin + (ri + 1) * rh));
  const cx = Math.round((x1 + x2) / 2);
  const cy = Math.round((y1 + y2) / 2);
  iDetectedRegions.push({
    id: String(section), section: section, cls: 0,
    polygon: [[x1,y1],[x2,y1],[x2,y2],[x1,y2]],
    cx, cy, pixel_area: 0, food_name: '', _placeholder: true
  });
  irenderRegions();
  ibuildLegend();
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

function ihandleDuplicateWarning() {
  const existing = document.getElementById('imapping-duplicate-warn');
  if (existing) existing.remove();
  const sectionCounts = {};
  iMenuMapping.forEach(m => {
    if (m.section >= 0) {
      sectionCounts[m.section] = (sectionCounts[m.section] || 0) + 1;
    }
  });
  const duplicates = Object.entries(sectionCounts).filter(([_, count]) => count > 1);
  if (!duplicates.length) return;
  const sectionLabels = {0: 'Íµ?Ï∞åÍ∞ú', 1: '1Î≤?Ïπ?, 2: '2Î≤?Ïπ?, 3: '3Î≤?Ïπ?, 4: '4Î≤?Ïπ?, 5: '5Î≤?Ïπ?};
  const list = document.getElementById('imapping-list');
  if (!list) return;
  const warn = document.createElement('div');
  warn.id = 'imapping-duplicate-warn';
  warn.style.cssText = 'padding:6px 10px;background:rgba(255,107,107,.1);border:1px solid rgba(255,107,107,.3);border-radius:6px;font-size:10px;color:var(--red);margin-top:4px';
  warn.textContent = `?†Ô∏è ${duplicates.map(([s]) => sectionLabels[s]).join(', ')}???¨Îü¨ Î©îÎâ¥Í∞Ä ÏßÄ?ïÎêò?àÏäµ?àÎã§`;
  list.appendChild(warn);
}

function isyncMappingToRegions() {
  if (!iMenuMapping || !iDetectedRegions.length) return;
  iMenuMapping.forEach(m => {
    if (m.section >= 0 && m.dish) {
      if (m.section === 0) {
        let region = iDetectedRegions.find(r => r.section === 6);
        if (!region) {
          iensureRegionExists(6);
          region = iDetectedRegions.find(r => r.section === 6);
        }
        if (region) region.food_name = m.dish;
      } else {
        const regionIdx = iDetectedRegions.findIndex(r => r.section === m.section);
        if (regionIdx >= 0) {
          iDetectedRegions[regionIdx].food_name = m.dish;
        } else {
          iensureRegionExists(m.section);
          const newRegion = iDetectedRegions.find(r => r.section === m.section);
          if (newRegion) newRegion.food_name = m.dish;
        }
      }
    }
  });
  irenderRegions();
  ibuildLegend();
}

function ionInputFieldChange(inputId) {
  const value = document.getElementById(inputId)?.value || '';
  const section = inputId === 'i-soup-food' ? 0 : parseInt(inputId.replace('i-food-', ''));
  if (section === 0) {
    let region = iDetectedRegions.find(r => r.section === 6);
    if (!region && value) {
      iensureRegionExists(6);
      region = iDetectedRegions.find(r => r.section === 6);
    }
    if (region) region.food_name = value;
  } else if (!isNaN(section) && section >= 1 && section <= 5) {
    if (value) iensureRegionExists(section);
    const region = iDetectedRegions.find(r => r.section === section);
    if (region) region.food_name = value;
  }
  irenderRegions();
  ibuildLegend();
  isaveMenuMapping();
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
    alert('Î®ºÏ? ?¨ÏßÑ???ÖÎ°ú?úÌï¥Ï£ºÏÑ∏??');
    return;
  }

  const btn = document.getElementById('ianalyze-btn');
  const loading = document.getElementById('ianalyze-loading');
  const done = document.getElementById('ianalyze-done');
  const area = document.getElementById('imenu-area');
  const dv = document.getElementById('idp').value;

  btn.disabled = true;
  btn.textContent = '??Î∂ÑÏÑù Ï§?..';
  loading.style.display = 'flex';
  done.innerHTML = '';

  const hasAssignedFoods = iDetectedRegions.some(r => r.food_name);
  const formData = new FormData();
  formData.append('image', iSelectedFile);
  formData.append('date', dv.replace(/-/g, ''));
  formData.append('meal_time', iSelectedMealTime);

  if (hasAssignedFoods) {
    const regionsWithFood = iDetectedRegions.filter(r => r.food_name).map(r => ({
      section: r.section,
      food_name: r.food_name,
      polygon: r.polygon
    }));
    formData.append('use_regions', 'true');
    formData.append('regions', JSON.stringify(regionsWithFood));
    if (iTrayCorners) formData.append('tray_corners', JSON.stringify(iTrayCorners));
  } else {
    const soupFood = document.getElementById('i-soup-food')?.value || '';
    const trayFoods = {};
    for (let i = 1; i <= 5; i++) {
      const val = document.getElementById(`i-food-${i}`)?.value?.trim();
      trayFoods[i] = val || `${i}Î≤?Ïπ?;
    }
    formData.append('menu', JSON.stringify(trayFoods));
    formData.append('soup_food', soupFood);
  }

  try {
    const resp = await fetch('/api/analyze', {
      method: 'POST',
      body: formData
    });
    const result = await resp.json();

    if (result.error) {
      done.innerHTML = `<div class="empty">?†Ô∏è ${result.error}</div>`;
      return;
    }

    isaveMenuMapping();
    renderAnalysisResult(result);
    loadHistory();
  } catch (e) {
    done.innerHTML = `<div class="empty">?†Ô∏è Î∂ÑÏÑù ?îÏ≤≠ ?§Ìå®: ${e.message}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = '?î¨ ?¥Î?ÏßÄ Î∂ÑÏÑù ?úÏûë';
    loading.style.display = 'none';
  }
}

function renderAnalysisResult(record) {
  const done = document.getElementById('ianalyze-done');
  const result = record.result;
  if (!result || !result.sections) {
    done.innerHTML = '<div class="empty">Î∂ÑÏÑù Í≤∞Í≥ºÍ∞Ä ?ÜÏäµ?àÎã§.</div>';
    return;
  }

  const neisCal = getNEISCalTotal();

  let sectionsHtml = result.sections.map((s, idx) => {
    const kcalColor = s.kcal > 300 ? '#ff6b6b' : s.kcal > 150 ? '#ffd60a' : '#4fffb0';
    return `<div class="result-card">
      <div class="result-card-header">
        <span class="result-section-badge" style="color:var(--green);border-color:rgba(79,255,176,.3)">${s.section === 0 ? 'Íµ?Ï∞åÍ∞ú' : idx + 1 + 'Î≤?Ïπ?}</span>
        <span class="result-kcal-big" style="color:${kcalColor}">${s.kcal} <span style="font-size:14px;font-weight:300">Kcal</span></span>
      </div>
      <div class="result-food-name">${s.food_name}</div>
      <div class="result-stat-row">
        <div class="result-stat-item">Î©¥Ï†Å: <strong>${s.real_area_cm2} cm¬≤</strong></div>
        <div class="result-stat-item">Î∂Ä?? <strong>${s.volume_cm3} cm¬≥</strong></div>
        <div class="result-stat-item">?àÏÉÅ Î¨¥Í≤å: <strong>${s.estimated_weight_g} g</strong></div>
        <div class="result-stat-item">100g?? <strong>${s.kcal_per_100g} Kcal</strong></div>
      </div>
      ${s.is_soup ? '<div style="font-size:11px;color:var(--blue);margin-top:4px">?åä Íµ?Ï∞åÍ∞úÎ°?Î∂ÑÎ•ò?òÏñ¥ Í≥†Ï†ï Ï§ëÎüâ ?ÅÏö©</div>' : ''}
    </div>`;
  }).join('');

  const totalKcalColor = result.total_kcal > 1200 ? '#ff6b6b' : result.total_kcal > 600 ? '#ffd60a' : '#4fffb0';

  const compareHtml = neisCal > 0
    ? `<div class="result-compare">?ìã NEIS ?úÍ≥µ ÏπºÎ°úÎ¶? ${neisCal} Kcal | ?¥Î?ÏßÄ Î∂ÑÏÑù: ${result.total_kcal} Kcal | Ï∞®Ïù¥: ${Math.abs(result.total_kcal - neisCal)} Kcal</div>`
    : '';

  done.innerHTML = `
    <div class="result-total-card">
      <div style="font-size:12px;color:var(--muted);font-weight:300;margin-bottom:4px">?àÏÉÅ Ï¥?ÏπºÎ°úÎ¶?/div>
      <div class="result-total-kcal" style="color:${totalKcalColor}">${result.total_kcal} Kcal</div>
      ${compareHtml}
    </div>
    ${sectionsHtml}
    <div style="text-align:center;margin-top:8px">
      <span style="font-size:10px;color:var(--muted)">??Î∂ÑÏÑù ?ÑÎ£å ??${record.date} ${MEAL_TIME_KR[record.meal_time] || ''} ${record.timestamp ? new Date(record.timestamp).toLocaleTimeString() : ''}</span>
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
    area.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:12px">?ì≠ Î∂ÑÏÑù ?¥Î†•?Ä Î°úÏª¨ ?úÎ≤Ñ ?§Ìñâ ???ïÏù∏ Í∞Ä?•Ìï©?àÎã§.</div>';
    return;
  }

  try {
    const resp = await fetch('/api/results');
    const results = await resp.json();

    if (!results || results.length === 0) {
      area.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:12px">?ì≠ ?Ä?•Îêú Î∂ÑÏÑù Í≤∞Í≥ºÍ∞Ä ?ÜÏäµ?àÎã§.</div>';
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
          <button class="history-del" onclick="event.stopPropagation();deleteHistory('${r.id}')">?óë</button>
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    area.innerHTML = `<div style="text-align:center;padding:20px;color:var(--muted);font-size:12px">?†Ô∏è ?¥Î†• Î°úÎìú ?§Ìå®</div>`;
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
    btn.textContent = '?î¨ ???¥Î?ÏßÄ Î∂ÑÏÑù';
    btn.disabled = false;
  } catch (e) {
    alert('Í≤∞Í≥º Ï°∞Ìöå ?§Ìå®: ' + e.message);
  }
}

async function deleteHistory(id) {
  if (!confirm('??Î∂ÑÏÑù Í≤∞Í≥ºÎ•???†ú?òÏãúÍ≤†Ïäµ?àÍπå?')) return;
  try {
    await fetch(`/api/results/${id}`, { method: 'DELETE' });
    loadHistory();
  } catch (e) {
    alert('??†ú ?§Ìå®: ' + e.message);
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
    if (soupEl && saved.soup !== undefined) soupEl.value = saved.soup;
    for (let i = 1; i <= 5; i++) {
      const el = document.getElementById(`i-food-${i}`);
      if (el && saved[i] !== undefined) el.value = saved[i];
    }
    if (saved.mapping && iMenuMapping) {
      iMenuMapping = saved.mapping.map(m => ({ ...m, _prevSection: m.section }));
      iMenuMapping.forEach((m, idx) => {
        if (idx >= iMenuMapping.length) return;
        const select = document.querySelector(`#imapping-list select[data-dish-idx="${idx}"]`);
        if (select) select.value = m.section;
      });
    }
    isyncMappingToRegions();
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
  if (iMenuMapping) data.mapping = JSON.parse(JSON.stringify(iMenuMapping));
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
