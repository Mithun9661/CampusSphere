import crypto from 'node:crypto';

const ORIGIN = 'https://info.aec.edu.in';
const BASE = `${ORIGIN}/acet/`;
const LOGIN_URL = `${BASE}default.aspx`;
const PAGES = {
  academicRegister: `${BASE}Academics/studentacadamicregister.aspx?scrid=2`,
  attendance: `${BASE}Academics/StudentAttendance.aspx?scrid=3&showtype=SA`,
  backlogs: `${BASE}Academics/studentbacklogs.aspx?scrid=4`,
  marks: `${BASE}Academics/StudentMarksReport.aspx?scrid=15`,
  profile: `${BASE}Academics/StudentProfile.aspx?scrid=17`,
};
const MAX_REDIRECTS = 8;
const AES_KEY = '8701661282118308';

function decodeHtml(value = '') {
  return String(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function plainText(value = '') {
  return decodeHtml(String(value)
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
  let match;
  while ((match = re.exec(tag))) out[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? '');
  return out;
}

function getSetCookies(headers) {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const raw = headers.get('set-cookie');
  return raw ? raw.split(/,(?=\s*[^;,=]+=[^;,]*)/g) : [];
}

function mergeCookies(jar, headers) {
  for (const cookie of getSetCookies(headers)) {
    const pair = String(cookie).split(';', 1)[0];
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const key = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (value) jar.set(key, value); else jar.delete(key);
  }
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([key, value]) => `${key}=${value}`).join('; ');
}

async function request(url, jar, options = {}) {
  let current = new URL(url);
  let method = options.method || 'GET';
  let body = options.body;

  for (let i = 0; i <= MAX_REDIRECTS; i += 1) {
    const headers = {
      Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
      ...(options.headers || {}),
    };
    const cookies = cookieHeader(jar);
    if (cookies) headers.Cookie = cookies;

    const response = await fetch(current, { method, body, headers, redirect: 'manual' });
    mergeCookies(jar, response.headers);
    const location = response.headers.get('location');

    if (response.status >= 300 && response.status < 400 && location) {
      current = new URL(location, current);
      if ([301, 302, 303].includes(response.status) && method !== 'GET') {
        method = 'GET';
        body = undefined;
      }
      continue;
    }

    return { response, url: current.toString(), text: await response.text() };
  }

  throw new Error('Too many E-CAP redirects');
}

function hiddenInputs(html) {
  const out = {};
  for (const match of String(html).matchAll(/<input\b[^>]*>/gi)) {
    const a = attrs(match[0]);
    if ((a.type || '').toLowerCase() === 'hidden' && a.name) out[a.name] = a.value || '';
  }
  return out;
}

function encryptPassword(password) {
  const key = Buffer.from(AES_KEY, 'utf8');
  const cipher = crypto.createCipheriv('aes-128-cbc', key, key);
  return Buffer.concat([cipher.update(String(password), 'utf8'), cipher.final()]).toString('base64');
}

function isLoginPage(html, url) {
  return /default\.aspx/i.test(url) && /\btxtId2\b/i.test(html) && /\btxtPwd2\b/i.test(html);
}

function loginReason(html) {
  const value = plainText(html).toLowerCase();
  if (/locked|blocked|disabled/.test(value)) return 'account_locked';
  if (/invalid|incorrect|wrong|not valid/.test(value) && /password|user|login|id/.test(value)) return 'invalid_credentials';
  return 'login_not_accepted';
}

async function loginEcap(rollNo, password) {
  const jar = new Map();
  const landing = await request(LOGIN_URL, jar);
  if (!/\btxtId2\b/i.test(landing.text) || !/\btxtPwd2\b/i.test(landing.text)) {
    throw Object.assign(new Error('Could not open the E-CAP Student/Parent login form.'), { status: 502, stage: 'login_form' });
  }

  const encrypted = encryptPassword(password);
  const form = new URLSearchParams();
  Object.entries(hiddenInputs(landing.text)).forEach(([key, value]) => form.set(key, value));
  form.set('txtId1', '');
  form.set('txtPwd1', '');
  form.set('txtId2', rollNo);
  form.set('txtPwd2', encrypted);
  form.set('txtId3', '');
  form.set('txtPwd3', '');
  form.set('TextBox1', '');
  form.set('hdnpwd1', '');
  form.set('hdnpwd2', encrypted);
  form.set('hdnpwd3', '');
  form.set('imgBtn2.x', '48');
  form.set('imgBtn2.y', '20');

  const logged = await request(LOGIN_URL, jar, {
    method: 'POST',
    body: form.toString(),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: ORIGIN,
      Referer: landing.url,
    },
  });

  if (isLoginPage(logged.text, logged.url)) {
    const reason = loginReason(logged.text);
    const message = reason === 'account_locked'
      ? 'E-CAP account appears locked/blocked.'
      : 'E-CAP did not accept this Hall Ticket/password.';
    throw Object.assign(new Error(message), { status: 401, stage: 'login', reason });
  }

  return { jar, logged };
}

function rows(html) {
  const out = [];
  for (const rowMatch of String(html).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [];
    for (const cellMatch of rowMatch[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)) cells.push(plainText(cellMatch[1]));
    if (cells.length) out.push(cells);
  }
  return out;
}

function number(value) {
  const cleaned = String(value ?? '').replace(/,/g, '').replace(/%/g, '').trim();
  if (!cleaned || !/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(cleaned)) return null;
  const result = Number(cleaned);
  return Number.isFinite(result) ? result : null;
}

function presentOnly(html) {
  const raw = String(html || '');
  const start = raw.search(/PERFORMANCE\s*\(\s*Present\s*\)/i);
  if (start < 0) return raw;
  const tail = raw.slice(start);
  const end = tail.search(/PERFORMANCE\s*\(\s*Past\s*\)/i);
  return end > 0 ? tail.slice(0, end) : tail;
}

function parseAttendance(html) {
  const result = [];
  let total = null;

  for (const rawRow of rows(presentOnly(html))) {
    const cells = rawRow.map((value) => String(value || '').trim()).filter((value, index, arr) => value || index < arr.length);
    if (!cells.length) continue;
    const first = (cells[0] || '').toUpperCase().replace(/\s+/g, ' ');

    if (/^TOTAL\s*:?$/.test(first)) {
      const nums = cells.map(number).filter((value) => value !== null);
      if (nums.length >= 3) {
        const [held, attended, percentage] = nums.slice(-3);
        if (held >= 0 && attended >= 0 && attended <= held && percentage >= 0 && percentage <= 100) total = { held, attended, percentage };
      }
      continue;
    }

    let subject = '';
    let held = null;
    let attended = null;
    let percentage = null;

    if (/^\d+$/.test(cells[0] || '') && cells.length >= 5) {
      subject = cells[1] || '';
      held = number(cells[2]);
      attended = number(cells[3]);
      percentage = number(cells[4]);
    } else {
      const nums = cells.map((cell, index) => ({ index, value: number(cell) })).filter((item) => item.value !== null);
      if (nums.length >= 3) {
        const [h, a, p] = nums.slice(-3);
        if (h.index < a.index && a.index < p.index) {
          held = h.value;
          attended = a.value;
          percentage = p.value;
          subject = cells.slice(0, h.index).filter(Boolean).join(' ').replace(/^\d+\s*/, '').trim();
        }
      }
    }

    if (!subject || held === null || attended === null || percentage === null) continue;
    if (/^(sl\.?\s*no|course|subject|held|attend(?:ed)?|attendance|percentage|%)$/i.test(subject)) continue;
    if (held < 0 || attended < 0 || attended > held || percentage < 0 || percentage > 100) continue;
    const key = `${subject.toUpperCase()}|${held}|${attended}|${percentage}`;
    if (!result.some((item) => item._key === key)) result.push({ _key: key, subject, held, attended, percentage });
  }

  if (!total && result.length) {
    const held = result.reduce((sum, item) => sum + item.held, 0);
    const attended = result.reduce((sum, item) => sum + item.attended, 0);
    total = { held, attended, percentage: held ? Number(((attended / held) * 100).toFixed(2)) : 0 };
  }

  return { items: result.map(({ _key, ...item }) => item), total };
}

function hasAttendance(value) {
  return Boolean(value?.total || value?.items?.length);
}

function findLabel(tableRows, labels) {
  const wanted = labels.map((value) => value.toLowerCase());
  for (const row of tableRows) {
    for (let i = 0; i < row.length; i += 1) {
      const cell = String(row[i] || '').replace(/\s*:\s*$/, '').trim().toLowerCase();
      if (!wanted.includes(cell)) continue;
      for (const candidate of row.slice(i + 1)) if (candidate && candidate !== ':') return candidate;
    }
  }
  return '';
}

function parseProfile(html, rollNo) {
  const tableRows = rows(html);
  return {
    rollNo: findLabel(tableRows, ['RollNo', 'Roll No', 'Hall Ticket No']) || rollNo,
    name: findLabel(tableRows, ['Name', 'Student Name']),
    course: findLabel(tableRows, ['Course']),
    branch: findLabel(tableRows, ['Branch']),
    semester: findLabel(tableRows, ['Semester', 'Sem']),
  };
}

function safeUrl(raw, base) {
  try {
    const url = new URL(decodeHtml(raw), base);
    if (url.origin !== ORIGIN) return null;
    if (/(logout|signout|payment|receipt|transaction|delete|remove|update|edit|change.?password)/i.test(`${url.pathname}${url.search}`)) return null;
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

function proxyUrls(html, base) {
  const found = new Set();
  const add = (raw) => {
    const url = safeUrl(raw, base);
    if (!url) return;
    if (/\/ajax\/StudentAttendance,[^"'\s>]+\.ashx/i.test(url.pathname)) found.add(url.toString());
  };

  for (const match of String(html).matchAll(/<script\b[^>]*>/gi)) {
    const a = attrs(match[0]);
    if (a.src) add(a.src);
  }
  for (const match of String(html).matchAll(/["']([^"']*\/ajax\/StudentAttendance,[^"']+\.ashx(?:\?[^"']*)?)["']/gi)) add(match[1]);
  return [...found];
}

function selectControls(html) {
  const controls = [];
  for (const match of String(html).matchAll(/<select\b[^>]*>([\s\S]*?)<\/select>/gi)) {
    const open = match[0].match(/<select\b[^>]*>/i)?.[0] || '';
    const a = attrs(open);
    const options = [...match[1].matchAll(/<option\b[^>]*>([\s\S]*?)<\/option>/gi)].map((optionMatch) => {
      const optionOpen = optionMatch[0].match(/<option\b[^>]*>/i)?.[0] || '';
      const oa = attrs(optionOpen);
      return {
        value: oa.value ?? plainText(optionMatch[1]),
        text: plainText(optionMatch[1]),
        selected: /\sselected(?:\s|=|>)/i.test(optionOpen),
      };
    });
    const selected = options.find((option) => option.selected) || options.find((option) => option.value !== '') || options[0] || null;
    controls.push({ name: a.name || '', id: a.id || '', selected, options });
  }
  return controls;
}

function parseProxyMethods(js) {
  const methods = [];
  const seen = new Set();
  const source = String(js || '');

  const functionRe = /([A-Za-z_$][\w$]*)\s*:\s*function\s*\(([^)]*)\)\s*\{([\s\S]*?)\n?\s*\}/g;
  let match;
  while ((match = functionRe.exec(source))) {
    const body = match[3];
    const invoke = body.match(/(?:this\.)?invoke\s*\(\s*["']([^"']+)["']\s*,\s*\{([\s\S]*?)\}\s*,/i);
    if (!invoke) continue;
    const method = invoke[1];
    const params = [];
    for (const pair of invoke[2].matchAll(/["']([^"']+)["']\s*:\s*([A-Za-z_$][\w$]*)/g)) params.push({ name: pair[1], variable: pair[2] });
    const key = `${method}|${params.map((p) => p.name).join(',')}`;
    if (!seen.has(key)) {
      seen.add(key);
      methods.push({ method, params });
    }
  }

  for (const invoke of source.matchAll(/(?:this\.)?invoke\s*\(\s*["']([^"']+)["']\s*,\s*\{([\s\S]*?)\}\s*,/gi)) {
    const method = invoke[1];
    const params = [];
    for (const pair of invoke[2].matchAll(/["']([^"']+)["']\s*:\s*([A-Za-z_$][\w$]*)/g)) params.push({ name: pair[1], variable: pair[2] });
    const key = `${method}|${params.map((p) => p.name).join(',')}`;
    if (!seen.has(key)) {
      seen.add(key);
      methods.push({ method, params });
    }
  }

  return methods;
}

function isSafeReadMethod(name) {
  const value = String(name || '');
  if (/(save|update|delete|insert|remove|add|edit|pay|fee|receipt|transaction|password|logout|change|upload)/i.test(value)) return false;
  return /(attendance|present|report|details|detail|get|load|show|view|bind|fill|fetch|student)/i.test(value);
}

function selectedFor(controls, matcher) {
  const control = controls.find((item) => matcher(`${item.name} ${item.id}`.toLowerCase()));
  return control?.selected?.value ?? null;
}

function mapArguments(method, controls, rollNo, attendanceUrl) {
  const args = {};
  const query = new URL(attendanceUrl).searchParams;

  for (const param of method.params) {
    const key = param.name;
    const low = `${param.name} ${param.variable}`.toLowerCase();
    let value = null;

    const exact = selectedFor(controls, (haystack) => haystack.includes(param.name.toLowerCase()) || haystack.includes(param.variable.toLowerCase()));
    if (exact !== null) value = exact;
    else if (/(sem|semester)/i.test(low)) value = selectedFor(controls, (haystack) => /(sem|semester)/i.test(haystack));
    else if (/(year|academic|acad)/i.test(low)) value = selectedFor(controls, (haystack) => /(year|academic|acad)/i.test(haystack));
    else if (/(showtype|type|mode)/i.test(low)) value = query.get('showtype') || selectedFor(controls, (haystack) => /(type|mode)/i.test(haystack));
    else if (/(roll|regno|reg_no|hall|htno|studentno|student_no)/i.test(low)) value = rollNo;

    if (value === null || value === undefined || value === '') return null;
    args[key] = value;
  }

  return args;
}

function collectStrings(value, out = [], depth = 0) {
  if (depth > 6 || out.length > 40) return out;
  if (typeof value === 'string') {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out, depth + 1);
    return out;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectStrings(item, out, depth + 1);
  }
  return out;
}

function attendanceFromAjax(raw) {
  const candidates = [String(raw || '')];
  try {
    const parsed = JSON.parse(raw);
    collectStrings(parsed, candidates);
  } catch {}

  for (const candidate of candidates) {
    const parsed = parseAttendance(candidate);
    if (hasAttendance(parsed)) return parsed;
    const decoded = decodeHtml(candidate);
    if (decoded !== candidate) {
      const second = parseAttendance(decoded);
      if (hasAttendance(second)) return second;
    }
  }
  return { items: [], total: null };
}

async function invokeProxy(proxyUrl, method, args, jar, referer) {
  const url = new URL(proxyUrl);
  url.searchParams.set('_method', method);
  url.searchParams.set('_session', 'r');
  const page = await request(url.toString(), jar, {
    method: 'POST',
    body: JSON.stringify(args || {}),
    headers: {
      Accept: '*/*',
      'Content-Type': 'text/plain; charset=UTF-8',
      'X-AjaxPro-Method': method,
      'X-Requested-With': 'XMLHttpRequest',
      Origin: ORIGIN,
      Referer: referer,
    },
  });
  return page;
}

async function dynamicAttendance(attendancePage, jar, rollNo) {
  const controls = selectControls(attendancePage.text);
  const proxies = proxyUrls(attendancePage.text, attendancePage.url);
  const diagnostics = { controls: controls.map((c) => ({ name: c.name, id: c.id, selected: c.selected?.value ?? null })), proxies: [], attempts: [] };

  for (const proxyUrl of proxies) {
    try {
      const proxy = await request(proxyUrl, jar, {
        headers: { Accept: 'application/javascript,text/javascript,*/*;q=0.8', Referer: attendancePage.url },
      });
      const methods = parseProxyMethods(proxy.text).filter((item) => isSafeReadMethod(item.method));
      diagnostics.proxies.push({ path: new URL(proxyUrl).pathname, methods: methods.map((m) => ({ name: m.method, params: m.params.map((p) => p.name) })) });

      for (const method of methods.slice(0, 12)) {
        const args = mapArguments(method, controls, rollNo, attendancePage.url);
        if (args === null) {
          diagnostics.attempts.push({ method: method.method, skipped: 'unresolved_parameters' });
          continue;
        }
        try {
          const response = await invokeProxy(proxyUrl, method.method, args, jar, attendancePage.url);
          const parsed = attendanceFromAjax(response.text);
          diagnostics.attempts.push({ method: method.method, status: response.response.status, size: response.text.length, found: hasAttendance(parsed) });
          if (hasAttendance(parsed)) return { attendance: parsed, source: `ajax:${method.method}`, diagnostics };
        } catch (error) {
          diagnostics.attempts.push({ method: method.method, error: error?.message || String(error) });
        }
      }
    } catch (error) {
      diagnostics.proxies.push({ path: new URL(proxyUrl).pathname, error: error?.message || String(error) });
    }
  }

  return { attendance: { items: [], total: null }, source: null, diagnostics };
}

async function fetchAcademicPages(jar, referer) {
  const out = {};
  for (const [key, url] of Object.entries(PAGES)) {
    try {
      const page = await request(url, jar, { headers: { Referer: referer } });
      if (!isLoginPage(page.text, page.url) && page.response.ok) out[key] = page;
    } catch {}
  }
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rollNo = String(req.body?.rollNo || '').trim().toUpperCase();
  const password = String(req.body?.password || '');
  if (!/^[A-Z0-9]{6,20}$/.test(rollNo) || !password || password.length > 128) {
    return res.status(400).json({ error: 'Enter a valid roll number and E-CAP password' });
  }

  try {
    const { jar, logged } = await loginEcap(rollNo, password);
    const pages = await fetchAcademicPages(jar, logged.url);
    const attendancePage = pages.attendance;
    if (!attendancePage) return res.status(502).json({ error: 'E-CAP login succeeded, but the Attendance page could not be opened.', stage: 'attendance_page' });

    let attendance = parseAttendance(attendancePage.text);
    let source = hasAttendance(attendance) ? 'attendance_page' : null;
    let dynamicDiagnostics = null;

    if (!hasAttendance(attendance)) {
      const dynamic = await dynamicAttendance(attendancePage, jar, rollNo);
      dynamicDiagnostics = dynamic.diagnostics;
      if (hasAttendance(dynamic.attendance)) {
        attendance = dynamic.attendance;
        source = dynamic.source;
      }
    }

    if (!hasAttendance(attendance) && pages.profile) {
      const profileAttendance = parseAttendance(pages.profile.text);
      if (hasAttendance(profileAttendance)) {
        attendance = profileAttendance;
        source = 'profile_report';
      }
    }

    const profile = parseProfile(pages.profile?.text || pages.academicRegister?.text || '', rollNo);
    if (profile.rollNo && profile.rollNo.toUpperCase() !== rollNo) {
      return res.status(403).json({ error: 'E-CAP account does not match your Student 360 roll number.' });
    }

    const pageDiagnostics = Object.fromEntries(Object.entries(pages).map(([key, page]) => [key, {
      path: `${new URL(page.url).pathname}${new URL(page.url).search}`,
      status: page.response.status,
      size: page.text.length,
      tables: (page.text.match(/<table\b/gi) || []).length,
    }]));

    console.info('E-CAP academic sync v2', {
      source: source || 'none',
      subjectCount: attendance.items.length,
      totalAvailable: Boolean(attendance.total),
      pages: pageDiagnostics,
      dynamic: dynamicDiagnostics,
    });

    if (!hasAttendance(attendance)) {
      return res.status(422).json({
        error: 'E-CAP login succeeded, but the live attendance AJAX response could not be resolved automatically yet.',
        stage: 'attendance_ajax',
        reason: 'ajax_attendance_not_resolved',
      });
    }

    return res.status(200).json({
      success: true,
      source: 'ACET E-CAP',
      attendance,
      profile,
      availableAcademicPages: Object.keys(pages),
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    const status = Number(error?.status) || 502;
    console.error('E-CAP attendance v2 failed:', { stage: error?.stage || 'unknown', reason: error?.reason || null, message: error?.message || String(error) });
    return res.status(status).json({
      error: error?.message || 'Unable to sync attendance from ACET E-CAP.',
      stage: error?.stage || 'unknown',
      ...(error?.reason ? { reason: error.reason } : {}),
    });
  }
}
