const EXAM_LOGIN_URL = 'https://examsection.acet.ac.in/Login.aspx?ReturnUrl=%2F';
const LEGACY_LOGIN_URL = 'https://info.aec.edu.in/acet/default.aspx';
const ATTENDANCE_PAGE_URL = 'https://info.aec.edu.in/acet/Academics/StudentAttendance.aspx?scrid=3&showtype=SA';
const ATTENDANCE_SCRIPT_URLS = [
  'https://info.aec.edu.in/acet/JSFiles/AjaxMethods.js',
  'https://info.aec.edu.in/acet/ajax/common.ashx',
  'https://info.aec.edu.in/acet/ajax/StudentAttendance,App_Web_studentattendance.aspx.a2a1b31c.ashx',
];

function decodeHtml(value = '') {
  return String(value).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
function parseAttributes(tag) {
  const attrs = {}; const re = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g; let match;
  while ((match = re.exec(tag))) attrs[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? '');
  return attrs;
}
function visibleText(html) {
  return decodeHtml(String(html || '').replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}
function getSetCookieHeaders(headers) {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const raw = headers.get('set-cookie'); return raw ? raw.split(/,(?=\s*[^;,=]+=[^;,]*)/g) : [];
}
function updateCookieJar(jar, headers) {
  for (const cookie of getSetCookieHeaders(headers)) {
    const pair = String(cookie).split(';', 1)[0]; const eq = pair.indexOf('='); if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim(); const value = pair.slice(eq + 1).trim(); if (value) jar.set(name, value); else jar.delete(name);
  }
}
function cookieHeader(jar) { return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; '); }
function hiddenInputs(html) {
  const result = {};
  for (const match of String(html).matchAll(/<input\b[^>]*>/gi)) { const attrs = parseAttributes(match[0]); if ((attrs.type || '').toLowerCase() === 'hidden' && attrs.name) result[attrs.name] = attrs.value || ''; }
  return result;
}
function safeInputs(html) {
  return [...String(html).matchAll(/<input\b[^>]*>/gi)].map((m) => { const a = parseAttributes(m[0]); return { name: a.name || null, id: a.id || null, type: (a.type || 'text').toLowerCase(), placeholder: a.placeholder || null }; });
}
function safeButtons(html) {
  return [...String(html).matchAll(/<(?:input|button)\b[^>]*>/gi)].map((m) => parseAttributes(m[0])).filter((a) => ['submit', 'button', 'image'].includes((a.type || '').toLowerCase()) || a.onclick).map((a) => ({ name: a.name || null, id: a.id || null, type: a.type || null, value: a.value || null, onclick: a.onclick || null }));
}
async function fetchPage(url, jar, options = {}) {
  const headers = { Accept: options.accept || 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.9', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36', ...(options.headers || {}) };
  const cookies = cookieHeader(jar); if (cookies) headers.Cookie = cookies;
  const response = await fetch(url, { method: options.method || 'GET', body: options.body, headers, redirect: 'manual' }); updateCookieJar(jar, response.headers);
  return { response, html: await response.text(), location: response.headers.get('location') };
}
function safeScriptMeta(text) {
  const raw = String(text || '');
  const lines = raw.split(/\r?\n/);
  const snippets = lines.filter((line) => /(StudentAttendance|AjaxPro|prototype|function|invoke|Request|attendance|present|held|Get|Show|Load|Bind|Fill)/i.test(line)).slice(0, 50).map((line) => line.replace(/\s+/g, ' ').trim().slice(0, 1800));
  const identifiers = new Set();
  for (const m of raw.matchAll(/\b([A-Za-z_$][\w$]{2,})\b/g)) if (/(attendance|present|student|report|show|load|bind|fill|get|year|date|ajax|method)/i.test(m[1])) identifiers.add(m[1]);
  const methodDefs = [];
  const patterns = [
    /(?:StudentAttendance\.)?([A-Za-z_$][\w$]*)\s*[:=]\s*function\s*\(([^)]*)\)/g,
    /invoke\s*\(\s*['"]([^'"]+)['"]/g,
  ];
  for (const re of patterns) {
    for (const m of raw.matchAll(re)) {
      const value = re === patterns[0] ? `${m[1]}(${m[2] || ''})` : `invoke:${m[1]}`;
      if (!methodDefs.includes(value)) methodDefs.push(value);
    }
  }
  return { identifiers: [...identifiers].slice(0, 120), methodDefs: methodDefs.slice(0, 80), snippets };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    if (String(req.query?.attendanceScripts || '') === '1') {
      const jar = new Map();
      try { await fetchPage(LEGACY_LOGIN_URL, jar); } catch {}
      const results = [];
      for (const url of ATTENDANCE_SCRIPT_URLS) {
        try {
          const page = await fetchPage(url, jar, { accept: 'application/javascript,text/javascript,*/*;q=0.8', headers: { Referer: ATTENDANCE_PAGE_URL, 'X-Requested-With': 'XMLHttpRequest' } });
          const text = page.html; results.push({ path: new URL(url).pathname, status: page.response.status, size: text.length, ...safeScriptMeta(text) });
        } catch { results.push({ path: new URL(url).pathname, error: 'fetch_failed' }); }
      }
      return res.status(200).json({ results });
    }

    const jar = new Map();
    const first = await fetchPage(EXAM_LOGIN_URL, jar);
    const form = new URLSearchParams(); Object.entries(hiddenInputs(first.html)).forEach(([key, value]) => form.set(key, value)); form.set('__EVENTTARGET', 'lnkStudent'); form.set('__EVENTARGUMENT', '');
    const student = await fetchPage(EXAM_LOGIN_URL, jar, { method: 'POST', body: form.toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://examsection.acet.ac.in', Referer: EXAM_LOGIN_URL } });
    return res.status(200).json({ ok: student.response.ok, status: student.response.status, source: EXAM_LOGIN_URL, studentLoginVisible: /student/i.test(visibleText(student.html)), inputs: safeInputs(student.html), buttons: safeButtons(student.html), textHints: visibleText(student.html).match(/.{0,60}(?:student|hall ticket|roll|register|password|mobile|dob|login).{0,100}/ig)?.slice(0, 12) || [] });
  } catch (error) {
    console.error('E-CAP metadata discovery failed:', error?.message || error);
    return res.status(502).json({ error: 'Unable to inspect E-CAP metadata' });
  }
}
