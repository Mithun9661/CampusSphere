const LOGIN_URL = 'https://examsection.acet.ac.in/Login.aspx?ReturnUrl=%2F';
const ORIGIN = 'https://examsection.acet.ac.in';
const MAX_REDIRECTS = 8;
const RESULT_PATHS = [
  '/StudentLogin/Student/overallMarks.aspx',
  '/StudentLogin/Student/InternalMarks.aspx',
  '/StudentLogin/Student/MidMarks.aspx',
];

function decode(value = '') {
  return String(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function text(value = '') {
  return decode(String(value)
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function attrs(tag) {
  const out = {};
  const re = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let m;
  while ((m = re.exec(tag))) out[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? '');
  return out;
}

function setCookies(headers) {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const raw = headers.get('set-cookie');
  return raw ? raw.split(/,(?=\s*[^;,=]+=[^;,]*)/g) : [];
}

function updateJar(jar, headers) {
  for (const cookie of setCookies(headers)) {
    const pair = String(cookie).split(';', 1)[0];
    const i = pair.indexOf('=');
    if (i <= 0) continue;
    const name = pair.slice(0, i).trim();
    const value = pair.slice(i + 1).trim();
    if (value) jar.set(name, value); else jar.delete(name);
  }
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function request(url, jar, options = {}) {
  let current = new URL(url);
  let method = options.method || 'GET';
  let body = options.body;
  for (let i = 0; i <= MAX_REDIRECTS; i += 1) {
    const headers = {
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152 Safari/537.36',
      ...(options.headers || {}),
    };
    const cookies = cookieHeader(jar);
    if (cookies) headers.Cookie = cookies;
    const response = await fetch(current, { method, body, headers, redirect: 'manual' });
    updateJar(jar, response.headers);
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      current = new URL(location, current);
      if ([301, 302, 303].includes(response.status) && method !== 'GET') {
        method = 'GET';
        body = undefined;
      }
      continue;
    }
    return { response, url: current.toString(), html: await response.text() };
  }
  throw new Error('Too many Exam Section redirects');
}

function hiddenInputs(html) {
  const out = {};
  for (const m of String(html).matchAll(/<input\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    if ((a.type || '').toLowerCase() === 'hidden' && a.name) out[a.name] = a.value || '';
  }
  return out;
}

function formBody(hidden, values) {
  const form = new URLSearchParams();
  Object.entries(hidden).forEach(([k, v]) => form.set(k, v));
  Object.entries(values).forEach(([k, v]) => form.set(k, v));
  return form.toString();
}

async function login(rollNo, password) {
  const jar = new Map();
  const landing = await request(LOGIN_URL, jar);
  const student = await request(LOGIN_URL, jar, {
    method: 'POST',
    body: formBody(hiddenInputs(landing.html), { __EVENTTARGET: 'lnkStudent', __EVENTARGUMENT: '' }),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: ORIGIN, Referer: landing.url },
  });
  if (!/\btxtUserId\b/i.test(student.html) || !/\btxtPwd\b/i.test(student.html)) throw new Error('Student login form unavailable');
  const authenticated = await request(LOGIN_URL, jar, {
    method: 'POST',
    body: formBody(hiddenInputs(student.html), {
      __EVENTTARGET: '', __EVENTARGUMENT: '', txtUserId: rollNo, txtPwd: password, btnLogin: 'Login',
    }),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: ORIGIN, Referer: student.url },
  });
  if (/\btxtUserId\b/i.test(authenticated.html) && /\btxtPwd\b/i.test(authenticated.html)) {
    const error = new Error('Exam Section did not accept this UserID/password.');
    error.status = 401;
    throw error;
  }
  return { jar, home: authenticated.url };
}

function parseRows(tableHtml) {
  const rows = [];
  for (const row of String(tableHtml).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [];
    for (const cell of row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)) cells.push(text(cell[1]));
    if (cells.some(Boolean)) rows.push(cells);
  }
  return rows;
}

function semesterNumber(value) {
  const s = String(value || '').toLowerCase();
  const numeric = s.match(/(?:semester|sem)\s*[-:]?\s*([1-8])\b|\b([1-8])\s*(?:semester|sem)\b/i);
  if (numeric) return Number(numeric[1] || numeric[2]);
  const roman = s.match(/(?:semester|sem)\s*[-:]?\s*(viii|vii|vi|iv|v|iii|ii|i)\b|\b(viii|vii|vi|iv|v|iii|ii|i)\s*(?:semester|sem)\b/i);
  if (!roman) return null;
  const map = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8 };
  return map[(roman[1] || roman[2]).toLowerCase()] || null;
}

function number(value) {
  const s = String(value ?? '').replace(/,/g, '').replace(/%/g, '').trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function headerIndex(row, patterns) {
  return row.findIndex((cell) => patterns.some((p) => p.test(String(cell || '').toLowerCase())));
}

function normalizeAcademicTable(rows, source, context) {
  if (rows.length < 2) return null;
  let headerAt = rows.findIndex((row) => {
    const joined = row.join(' ').toLowerCase();
    return /(subject|course|paper)/.test(joined) && /(mark|grade|credit|result)/.test(joined);
  });
  if (headerAt < 0) return null;

  const headers = rows[headerAt];
  const codeI = headerIndex(headers, [/subject\s*code/, /course\s*code/, /^code$/]);
  const subjectI = headerIndex(headers, [/subject\s*name/, /course\s*name/, /subject/, /course/, /paper/]);
  const gradeI = headerIndex(headers, [/grade/]);
  const creditsI = headerIndex(headers, [/credit/]);
  const marksI = headerIndex(headers, [/total\s*mark/, /marks?/, /score/]);
  const resultI = headerIndex(headers, [/result/, /status/]);
  let sem = semesterNumber(context) || semesterNumber(rows.slice(0, headerAt + 2).flat().join(' '));
  const subjects = [];

  for (let i = headerAt + 1; i < rows.length; i += 1) {
    const row = rows[i];
    const rowText = row.join(' ');
    const rowSem = semesterNumber(rowText);
    if (rowSem && row.filter(Boolean).length <= 3) { sem = rowSem; continue; }
    const subject = subjectI >= 0 ? row[subjectI] : '';
    const code = codeI >= 0 ? row[codeI] : '';
    if (!subject && !code) continue;
    if (/total|sgpa|cgpa|percentage|grand/i.test(`${subject} ${code}`)) continue;
    const item = {
      code: code || '',
      subject: subject || code || '',
      grade: gradeI >= 0 ? row[gradeI] || '' : '',
      credits: creditsI >= 0 ? number(row[creditsI]) : null,
      marks: marksI >= 0 ? row[marksI] || '' : '',
      result: resultI >= 0 ? row[resultI] || '' : '',
      source,
    };
    if (item.subject) subjects.push(item);
  }
  if (!subjects.length) return null;
  return { semester: sem, subjects };
}

function parseDetailedResults(html, source) {
  const groups = [];
  const string = String(html || '');
  const tables = [...string.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)];
  for (const match of tables) {
    const start = match.index || 0;
    const context = text(string.slice(Math.max(0, start - 700), start));
    const parsed = normalizeAcademicTable(parseRows(match[0]), source, context);
    if (parsed) groups.push(parsed);
  }
  return groups;
}

function mergeGroups(groups) {
  const bySem = new Map();
  const unassigned = [];
  for (const group of groups) {
    if (!group.semester) { unassigned.push(...group.subjects); continue; }
    if (!bySem.has(group.semester)) bySem.set(group.semester, []);
    const list = bySem.get(group.semester);
    for (const subject of group.subjects) {
      const key = `${subject.code}|${subject.subject}|${subject.grade}|${subject.marks}`.toLowerCase();
      if (!list.some((x) => `${x.code}|${x.subject}|${x.grade}|${x.marks}`.toLowerCase() === key)) list.push(subject);
    }
  }
  const semesters = [...bySem.entries()].sort((a, b) => a[0] - b[0]).map(([n, subjects]) => ({ semester: `Semester ${n}`, semesterNumber: n, subjects }));
  return { semesters, unassigned: unassigned.slice(0, 80) };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const rollNo = String(req.body?.rollNo || '').trim().toUpperCase();
  const password = String(req.body?.password || '');
  if (!/^[A-Z0-9]{6,20}$/.test(rollNo) || !password || password.length > 128) return res.status(400).json({ error: 'Enter valid Exam Section credentials' });

  try {
    const session = await login(rollNo, password);
    const parsedGroups = [];
    const pages = [];
    for (const path of RESULT_PATHS) {
      try {
        const page = await request(`${ORIGIN}${path}`, session.jar, { headers: { Referer: session.home } });
        if (!page.response.ok || /Login\.aspx/i.test(page.url)) continue;
        const groups = parseDetailedResults(page.html, path.split('/').pop());
        parsedGroups.push(...groups);
        pages.push({ path, tableGroups: groups.length });
      } catch {}
    }
    const merged = mergeGroups(parsedGroups);
    console.info('Exam Section detailed result parse', { pages, semesterCount: merged.semesters.length, unassignedCount: merged.unassigned.length });
    return res.status(200).json({ success: true, ...merged, syncedAt: new Date().toISOString() });
  } catch (error) {
    console.error('Detailed Exam Section result sync failed:', error?.message || error);
    return res.status(error?.status || 502).json({ error: error?.message || 'Unable to read detailed Exam Section results' });
  }
}
