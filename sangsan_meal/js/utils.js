// 유틸리티 함수
export function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

export function fd(d, s) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return s ? `${y}${s}${m}${s}${dd}` : `${y}${m}${dd}`;
}

export function fd2(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${dd}`;
}

export function pNtr(s) {
  const r = {};
  (s || '').split('<br/>').forEach(x => {
    const [k, v] = x.split(':').map(a => a.trim());
    if (k && v) r[k] = parseFloat(v) || 0;
  });
  return r;
}

export function pDish(s) {
  return s.split('<br/>').filter(Boolean).map(d => {
    const name = d.replace(/\s*\([\d\.]+\)/g, '').trim();
    const nums = (d.match(/\(([\d\.]+)\)/g) || []).flatMap(m =>
      m.replace(/[()]/g, '').split('.').map(Number)
    );
    return { name, nums };
  });
}

export function gCat(n) {
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

export function cOpts() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: 'rgba(255,255,255,.6)', font: { family: 'Noto Sans KR', size: 11 } } }
    },
    scales: {
      x: {
        ticks: { color: 'rgba(255,255,255,.4)', font: { family: 'Space Mono', size: 9 } },
        grid: { color: 'rgba(255,255,255,.05)' }
      },
      y: {
        ticks: { color: 'rgba(255,255,255,.4)', font: { family: 'Space Mono', size: 9 } },
        grid: { color: 'rgba(255,255,255,.05)' }
      }
    }
  };
}