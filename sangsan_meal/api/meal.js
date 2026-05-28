export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const params = new URLSearchParams(req.query);
  const type = params.get('type') || '';
  
  const filteredParams = new URLSearchParams();
  params.forEach((value, key) => {
    if (key === 'type') return;
    if (value && value.trim() && value !== 'undefined' && value !== 'null') {
      filteredParams.append(key, value);
    }
  });
  
  const endpoint = type === 'school' ? 'schoolInfo' : 'mealServiceDietInfo';
  const neisUrl = `https://open.neis.go.kr/hub/${endpoint}?${filteredParams.toString()}`;
  
  console.log('[NEIS] URL:', neisUrl);
  
  try {
    const response = await fetch(neisUrl, {
      headers: { 'Accept': 'application/json' }
    });

    const status = response.status;
    const text = await response.text();
    
    console.log('[NEIS] Status:', status, 'Length:', text.length);
    
    if (!text || text.trim() === '') {
      console.log('[NEIS] Empty response');
      return res.status(502).json({ error: 'NEIS empty response' });
    }

    if (!response.ok) {
      console.log('[NEIS] Error response:', text.substring(0, 200));
      return res.status(status).json({ error: 'NEIS API error', detail: text.substring(0, 500) });
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (parseErr) {
      console.log('[NEIS] JSON parse error:', parseErr.message);
      console.log('[NEIS] Response preview:', text.substring(0, 300));
      return res.status(502).json({ error: 'JSON parse failed', preview: text.substring(0, 300) });
    }

    if (data.RESULT?.CODE === 'ERROR') {
      console.log('[NEIS] API Error:', data.RESULT);
      return res.status(400).json({ error: data.RESULT });
    }

    res.setHeader('Cache-Control', 's-maxage=1800');
    return res.status(200).json(data);

  } catch (e) {
    console.log('[NEIS] Fetch error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}