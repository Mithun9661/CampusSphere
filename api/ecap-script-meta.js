const URLS = [
  'https://info.aec.edu.in/acet/JSFiles/AjaxMethods.js',
  'https://info.aec.edu.in/acet/ajax/common.ashx',
  'https://info.aec.edu.in/acet/ajax/StudentAttendance,App_Web_studentattendance.aspx.a2a1b31c.ashx',
];

function safeSnippets(text) {
  const lines = String(text || '').split(/\r?\n/);
  const wanted = lines.filter((line) => /(StudentAttendance|AjaxPro|prototype|function|invoke|Request|attendance|present|held|Get|Show|Load|Bind|Fill)/i.test(line));
  return wanted.slice(0, 30).map((line) => line.replace(/\s+/g, ' ').trim().slice(0, 500));
}

function identifiers(text) {
  const out = new Set();
  for (const m of String(text || '').matchAll(/\b([A-Za-z_$][\w$]{2,})\b/g)) {
    const name = m[1];
    if (/(attendance|present|student|report|show|load|bind|fill|get|year|date|ajax|method)/i.test(name)) out.add(name);
  }
  return [...out].slice(0, 80);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const results = [];
  for (const url of URLS) {
    try {
      const r = await fetch(url, {
        headers: {
          Accept: 'application/javascript,text/javascript,*/*;q=0.8',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152 Safari/537.36',
          Referer: 'https://info.aec.edu.in/acet/Academics/StudentAttendance.aspx?scrid=3&showtype=SA',
        },
      });
      const text = await r.text();
      results.push({ path: new URL(url).pathname, status: r.status, size: text.length, identifiers: identifiers(text), snippets: safeSnippets(text) });
    } catch (error) {
      results.push({ path: new URL(url).pathname, error: 'fetch_failed' });
    }
  }
  return res.status(200).json({ results });
}
