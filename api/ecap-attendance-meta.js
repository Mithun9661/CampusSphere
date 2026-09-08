const AJAX_URL = 'https://info.aec.edu.in/acet/ajax/StudentAttendance,App_Web_studentattendance.aspx.a2a1b31c.ashx';

function extractMethods(js = '') {
  const methods = new Map();
  const flat = String(js).replace(/\r/g, '');

  for (const match of flat.matchAll(/(?:StudentAttendance\.)?([A-Za-z_$][\w$]*)\s*=\s*function\s*\(([^)]*)\)/g)) {
    const name = match[1];
    if (/^(?:constructor|toString|valueOf)$/i.test(name)) continue;
    const args = match[2].split(',').map((v) => v.trim()).filter(Boolean);
    methods.set(name, { name, args });
  }

  for (const match of flat.matchAll(/\.add\(\s*["']([^"']+)["']\s*,\s*([A-Za-z_$][\w$]*)\s*\)/g)) {
    const [_, key, variable] = match;
    for (const method of methods.values()) {
      if (method.args.includes(variable)) {
        method.parameters ||= [];
        if (!method.parameters.includes(key)) method.parameters.push(key);
      }
    }
  }

  for (const match of flat.matchAll(/["']_method["']\s*[:=]\s*["']([^"']+)["']/g)) {
    const name = match[1];
    if (!methods.has(name)) methods.set(name, { name, args: [] });
  }

  return [...methods.values()]
    .filter((m) => !/^_/.test(m.name))
    .slice(0, 40);
}

function snippets(js = '') {
  const flat = String(js).replace(/\s+/g, ' ');
  const needles = ['Request', '.add(', '_method', 'attendance', 'semester', 'section', 'subject'];
  const out = [];
  for (const needle of needles) {
    const i = flat.toLowerCase().indexOf(needle.toLowerCase());
    if (i >= 0) out.push({ needle, snippet: flat.slice(Math.max(0, i - 120), Math.min(flat.length, i + 360)) });
  }
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const response = await fetch(AJAX_URL, {
      headers: {
        Accept: 'text/javascript,application/javascript,*/*;q=0.8',
        Referer: 'https://info.aec.edu.in/acet/Academics/StudentAttendance.aspx?scrid=3&showtype=SA',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152 Safari/537.36',
      },
    });
    const body = await response.text();
    return res.status(200).json({
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get('content-type'),
      size: body.length,
      methods: extractMethods(body),
      hints: snippets(body),
    });
  } catch (error) {
    console.error('Attendance AJAX metadata failed:', error?.message || error);
    return res.status(502).json({ error: 'Unable to inspect attendance AJAX metadata' });
  }
}
