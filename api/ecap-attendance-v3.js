import crypto from 'node:crypto';

const ORIGIN = 'https://info.aec.edu.in';
const BASE = `${ORIGIN}/acet/`;
const LOGIN_URL = `${BASE}default.aspx`;
const ATTENDANCE_URL = `${BASE}Academics/StudentAttendance.aspx?scrid=3&showtype=SA`;
const PROFILE_URL = `${BASE}Academics/StudentProfile.aspx?scrid=17`;
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

async function loginEcap(rollNo, password) {
  const jar = new Map();
  const landing = await request(LOGIN_URL, jar);
  if (!/\btxtId2\b/i.test(landing.text) || !/\btxtPwd2\b/i.test(landing.text)) {
    throw Object.assign(new Error('Could not open the E-CAP Student/Parent login form.'), { status: 502 });
  }
  const encrypted = encryptPassword(password);
  const form = new URLSearchParams();
  Object.entries(hiddenInputs(landing.text)).forEach(([key, value]) => form.set(key, value));
  form.set('txtId1', ''); form.set('txtPwd1', '');
  form.set('txtId2', rollNo); form.set('txtPwd2', encrypted);
  form.set('txtId3', ''); form.set('txtPwd3', '');
  form.set('TextBox1', ''); form.set('hdnpwd1', '');
  form.set('hdnpwd2', encrypted); form.set('hdnpwd3', '');
  form.set('imgBtn2.x', '48'); form.set('imgBtn2.y', '20');
  const logged = await request(LOGIN_URL, jar, {
    method: 'POST', body: form.toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: ORIGIN, Referer: landing.url },
  });
  if (isLoginPage(logged.text, logged.url)) {
    throw Object.assign(new Error('E-CAP did not accept this Hall Ticket/password.'), { status: 401 });
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

function num(value) {
  const cleaned = String(value ?? '').replace(/,/g, '').replace(/%/g, '').trim();
  if (!cleaned || !/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseAttendance(html) {
  const result = [];
  let total = null;
  for (const rawRow of rows(html)) {
    const cells = rawRow.map((v) => String(v || '').trim());
    if (!cells.length) continue;
    if (/^TOTAL\s*:?$/i.test(cells[0] || '')) {
      const nums = cells.map(num).filter((v) => v !== null);
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
    const numeric = cells.map((cell, index) => ({ index, value: num(cell) })).filter((x) => x.value !== null);
    if (/^\d+$/.test(cells[0] || '') && cells.length >= 5) {
      subject = cells[1] || '';
      held = num(cells[2]); attended = num(cells[3]); percentage = num(cells[4]);
    } else if (numeric.length >= 3) {
      const [h, a, p] = numeric.slice(-3);
      if (h.index < a.index && a.index < p.index) {
        held = h.value; attended = a.value; percentage = p.value;
        subject = cells.slice(0, h.index).filter(Boolean).join(' ').replace(/^\d+\s*/, '').trim();
      }
    }
    if (!subject || held === null || attended === null || percentage === null) continue;
    if (/^(sl\.?\s*no|course|subject|held|attend(?:ed)?|attendance|percentage|%)$/i.test(subject)) continue;
    if (held < 0 || attended < 0 || attended > held || percentage < 0 || percentage > 100) continue;
    const key = `${subject.toUpperCase()}|${held}|${attended}|${percentage}`;
    if (!result.some((x) => x._key === key)) result.push({ _key: key, subject, held, attended, percentage });
  }
  if (!total && result.length) {
    const held = result.reduce((s, x) => s + x.held, 0);
    const attended = result.reduce((s, x) => s + x.attended, 0);
    total = { held, attended, percentage: held ? Number(((attended / held) * 100).toFixed(2)) : 0 };
  }
  return { items: result.map(({ _key, ...x }) => x), total };
}

function hasAttendance(a) {
  return Boolean(a?.total || a?.items?.length);
}

function parseStructuredAttendance(value) {
  const rowsOut = [];
  function walk(node, depth = 0) {
    if (depth > 7 || node == null) return;
    if (Array.isArray(node)) { node.forEach((x) => walk(x, depth + 1)); return; }
    if (typeof node !== 'object') return;
    const normalized = {};
    for (const [k, v] of Object.entries(node)) normalized[k.toLowerCase().replace(/[^a-z0-9]/g, '')] = v;
    const subject = normalized.subject ?? normalized.subjectname ?? normalized.coursename ?? normalized.course ?? normalized.subname ?? normalized.subcode;
    const held = num(normalized.held ?? normalized.classesheld ?? normalized.conducted ?? normalized.totalclasses ?? normalized.total);
    const attended = num(normalized.attended ?? normalized.present ?? normalized.classesattended ?? normalized.attend);
    let percentage = num(normalized.percentage ?? normalized.percent ?? normalized.attendancepercentage ?? normalized.attendancepercent ?? normalized.pct);
    if (percentage === null && held !== null && attended !== null && held > 0) percentage = Number(((attended / held) * 100).toFixed(2));
    if (subject && held !== null && attended !== null && percentage !== null && attended <= held && percentage >= 0 && percentage <= 100) {
      rowsOut.push({ subject: String(subject), held, attended, percentage });
    }
    Object.values(node).forEach((x) => walk(x, depth + 1));
  }
  walk(value);
  if (!rowsOut.length) return { items: [], total: null };
  const unique = [];
  for (const item of rowsOut) {
    const key = `${item.subject.toUpperCase()}|${item.held}|${item.attended}|${item.percentage}`;
    if (!unique.some((x) => x._key === key)) unique.push({ ...item, _key: key });
  }
  const held = unique.reduce((s, x) => s + x.held, 0);
  const attended = unique.reduce((s, x) => s + x.attended, 0);
  return { items: unique.map(({ _key, ...x }) => x), total: { held, attended, percentage: held ? Number(((attended / held) * 100).toFixed(2)) : 0 } };
}

function attendanceFromAjax(raw) {
  const textCandidates = [String(raw || '')];
  try {
    const parsed = JSON.parse(raw);
    const structured = parseStructuredAttendance(parsed);
    if (hasAttendance(structured)) return structured;
    const stack = [parsed];
    while (stack.length && textCandidates.length < 60) {
      const v = stack.pop();
      if (typeof v === 'string') textCandidates.push(v);
      else if (Array.isArray(v)) stack.push(...v);
      else if (v && typeof v === 'object') stack.push(...Object.values(v));
    }
  } catch {}
  for (const candidate of textCandidates) {
    const a = parseAttendance(candidate);
    if (hasAttendance(a)) return a;
    const decoded = decodeHtml(candidate);
    if (decoded !== candidate) {
      const b = parseAttendance(decoded);
      if (hasAttendance(b)) return b;
    }
  }
  return { items: [], total: null };
}

function formControls(html) {
  const out = [];
  for (const match of String(html).matchAll(/<(select|input)\b[^>]*>([\s\S]*?<\/select>)?/gi)) {
    const tag = match[0].match(/<(?:select|input)\b[^>]*>/i)?.[0] || match[0];
    const a = attrs(tag);
    if (!a.name && !a.id) continue;
    let value = a.value ?? '';
    if (/^<select/i.test(match[0])) {
      const options = [...match[0].matchAll(/<option\b[^>]*>([\s\S]*?)<\/option>/gi)].map((m) => {
        const oa = attrs(m[0].match(/<option\b[^>]*>/i)?.[0] || '');
        return { value: oa.value ?? plainText(m[1]), selected: /\sselected(?:\s|=|>)/i.test(m[0]) };
      });
      value = (options.find((x) => x.selected) || options.find((x) => x.value !== '') || options[0] || {}).value ?? '';
    }
    out.push({ name: a.name || '', id: a.id || '', value });
  }
  return out;
}

function proxyUrls(html, base) {
  const found = new Set();
  for (const match of String(html).matchAll(/["']([^"']*\/ajax\/StudentAttendance,[^"']+\.ashx(?:\?[^"']*)?)["']/gi)) {
    try {
      const url = new URL(decodeHtml(match[1]), base);
      if (url.origin === ORIGIN) found.add(url.toString());
    } catch {}
  }
  for (const match of String(html).matchAll(/<script\b[^>]*>/gi)) {
    const a = attrs(match[0]);
    if (!a.src) continue;
    try {
      const url = new URL(a.src, base);
      if (url.origin === ORIGIN && /\/ajax\/StudentAttendance,.*\.ashx/i.test(url.pathname)) found.add(url.toString());
    } catch {}
  }
  return [...found];
}

function parseProxyMethods(js) {
  const source = String(js || '');
  const found = new Map();
  const callbackRe = /^(?:onsuccess|onfailed|onfailure|onerror|callback|cb|context|async)$/i;
  const addMethod = (method, params = []) => {
    if (!method || /^_/.test(method)) return;
    const clean = params.filter((p) => p?.name && !callbackRe.test(p.name));
    const key = `${method}|${clean.map((p) => p.name).join(',')}`;
    if (!found.has(key)) found.set(key, { method, params: clean });
  };

  const assignment = /(?:[A-Za-z_$][\w$]*\.)*([A-Za-z_$][\w$]*)\s*=\s*function\s*\(([^)]*)\)\s*\{([\s\S]*?)\}\s*;?/g;
  let m;
  while ((m = assignment.exec(source))) {
    const fnName = m[1];
    const fnArgs = m[2].split(',').map((x) => x.trim()).filter(Boolean);
    const body = m[3];
    const invoke = body.match(/(?:invoke|AjaxPro\.Request)\s*\(\s*["']([^"']+)["']/i);
    const method = invoke?.[1] || fnName;
    const pairs = [];
    for (const pair of body.matchAll(/\.add\(\s*["']([^"']+)["']\s*,\s*([A-Za-z_$][\w$]*)\s*\)/g)) pairs.push({ name: pair[1], variable: pair[2] });
    for (const pair of body.matchAll(/["']([^"']+)["']\s*:\s*([A-Za-z_$][\w$]*)/g)) pairs.push({ name: pair[1], variable: pair[2] });
    addMethod(method, pairs.length ? pairs : fnArgs.map((name) => ({ name, variable: name })));
  }

  const objectFn = /([A-Za-z_$][\w$]*)\s*:\s*function\s*\(([^)]*)\)/g;
  while ((m = objectFn.exec(source))) {
    const args = m[2].split(',').map((x) => x.trim()).filter(Boolean).map((name) => ({ name, variable: name }));
    addMethod(m[1], args);
  }

  for (const invoke of source.matchAll(/(?:invoke|AjaxPro\.Request)\s*\(\s*["']([^"']+)["']/gi)) addMethod(invoke[1], []);
  for (const ref of source.matchAll(/StudentAttendance(?:\.prototype)?\.([A-Za-z_$][\w$]*)/g)) addMethod(ref[1], []);

  return [...found.values()];
}

function isSafeReadMethod(name) {
  if (/(save|update|delete|insert|remove|add|edit|pay|fee|receipt|transaction|password|logout|change|upload|submit)/i.test(name)) return false;
  return true;
}

function controlValue(controls, matcher) {
  const c = controls.find((x) => matcher(`${x.name} ${x.id}`.toLowerCase()));
  return c?.value ?? null;
}

function mapArguments(method, controls, rollNo) {
  const args = {};
  for (const p of method.params) {
    const key = p.name;
    const low = `${p.name} ${p.variable || ''}`.toLowerCase();
    let value = controlValue(controls, (h) => h.includes(p.name.toLowerCase()) || (p.variable && h.includes(p.variable.toLowerCase())));
    if (value == null || value === '') {
      if (/(roll|regno|reg_no|hall|htno|studentno|student_no|userid|user_id)/i.test(low)) value = rollNo;
      else if (/(sem|semester)/i.test(low)) value = controlValue(controls, (h) => /(sem|semester)/i.test(h));
      else if (/(year|academic|acad)/i.test(low)) value = controlValue(controls, (h) => /(year|academic|acad)/i.test(h));
      else if (/(section|sec)/i.test(low)) value = controlValue(controls, (h) => /(section|sec)/i.test(h));
      else if (/(showtype|type|mode)/i.test(low)) value = 'SA';
    }
    if (value == null || value === '') return null;
    args[key] = value;
  }
  return args;
}

async function invokeProxy(proxyUrl, method, args, jar, referer) {
  const url = new URL(proxyUrl);
  url.searchParams.set('_method', method);
  url.searchParams.set('_session', 'r');
  return request(url.toString(), jar, {
    method: 'POST', body: JSON.stringify(args || {}),
    headers: {
      Accept: '*/*',
      'Content-Type': 'text/plain; charset=UTF-8',
      'X-AjaxPro-Method': method,
      'X-Requested-With': 'XMLHttpRequest',
      Origin: ORIGIN,
      Referer: referer,
    },
  });
}

async function resolveDynamic(attendancePage, jar, rollNo) {
  const controls = formControls(attendancePage.text);
  const proxies = proxyUrls(attendancePage.text, attendancePage.url);
  const diagnostics = { controls: controls.map((x) => ({ name: x.name, id: x.id, hasValue: x.value !== '' })), proxies: [], attempts: [] };
  for (const proxyUrl of proxies) {
    try {
      const proxy = await request(proxyUrl, jar, { headers: { Accept: 'application/javascript,text/javascript,*/*;q=0.8', Referer: attendancePage.url } });
      const methods = parseProxyMethods(proxy.text).filter((m) => isSafeReadMethod(m.method)).slice(0, 30);
      diagnostics.proxies.push({ path: new URL(proxyUrl).pathname, status: proxy.response.status, size: proxy.text.length, methods: methods.map((m) => ({ name: m.method, params: m.params.map((p) => p.name) })) });
      for (const method of methods) {
        const args = mapArguments(method, controls, rollNo);
        if (args === null) {
          diagnostics.attempts.push({ method: method.method, result: 'unresolved_params', params: method.params.map((p) => p.name) });
          continue;
        }
        try {
          const response = await invokeProxy(proxyUrl, method.method, args, jar, attendancePage.url);
          const parsed = attendanceFromAjax(response.text);
          diagnostics.attempts.push({ method: method.method, status: response.response.status, size: response.text.length, found: hasAttendance(parsed) });
          if (hasAttendance(parsed)) return { attendance: parsed, source: `ajax:${method.method}`, diagnostics };
        } catch (error) {
          diagnostics.attempts.push({ method: method.method, result: 'request_error' });
        }
      }
    } catch (error) {
      diagnostics.proxies.push({ path: new URL(proxyUrl).pathname, error: 'proxy_fetch_failed' });
    }
  }
  return { attendance: { items: [], total: null }, source: null, diagnostics };
}

function parseProfile(html, rollNo) {
  const tableRows = rows(html);
  const find = (labels) => {
    const wanted = labels.map((x) => x.toLowerCase());
    for (const row of tableRows) {
      for (let i = 0; i < row.length; i += 1) {
        const k = String(row[i] || '').replace(/\s*:\s*$/, '').trim().toLowerCase();
        if (!wanted.includes(k)) continue;
        for (const v of row.slice(i + 1)) if (v && v !== ':') return v;
      }
    }
    return '';
  };
  return {
    rollNo: find(['RollNo', 'Roll No', 'Hall Ticket No']) || rollNo,
    name: find(['Name', 'Student Name']),
    course: find(['Course']), branch: find(['Branch']), semester: find(['Semester', 'Sem']),
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const rollNo = String(req.body?.rollNo || '').trim().toUpperCase();
  const password = String(req.body?.password || '');
  if (!/^[A-Z0-9]{6,20}$/.test(rollNo) || !password || password.length > 128) return res.status(400).json({ error: 'Enter a valid roll number and E-CAP password' });
  try {
    const { jar, logged } = await loginEcap(rollNo, password);
    const attendancePage = await request(ATTENDANCE_URL, jar, { headers: { Referer: logged.url } });
    if (isLoginPage(attendancePage.text, attendancePage.url)) return res.status(401).json({ error: 'E-CAP session expired before attendance could be opened.' });
    let attendance = parseAttendance(attendancePage.text);
    let source = hasAttendance(attendance) ? 'attendance_page' : null;
    let diagnostics = null;
    if (!hasAttendance(attendance)) {
      const dynamic = await resolveDynamic(attendancePage, jar, rollNo);
      diagnostics = dynamic.diagnostics;
      if (hasAttendance(dynamic.attendance)) { attendance = dynamic.attendance; source = dynamic.source; }
    }
    let profile = { rollNo };
    try {
      const profilePage = await request(PROFILE_URL, jar, { headers: { Referer: attendancePage.url } });
      profile = parseProfile(profilePage.text, rollNo);
      if (!hasAttendance(attendance)) {
        const fallback = parseAttendance(profilePage.text);
        if (hasAttendance(fallback)) { attendance = fallback; source = 'profile_page'; }
      }
    } catch {}
    if (profile.rollNo && profile.rollNo.toUpperCase() !== rollNo) return res.status(403).json({ error: 'E-CAP account does not match your Student 360 roll number.' });
    console.info('E-CAP attendance v3', JSON.stringify({ source: source || 'none', subjectCount: attendance.items.length, total: Boolean(attendance.total), dynamic: diagnostics }));
    if (!hasAttendance(attendance)) return res.status(422).json({ error: 'E-CAP login succeeded, but the attendance AjaxPro method still needs one more mapping pass.', stage: 'attendance_ajax', reason: 'ajax_mapping_needed' });
    return res.status(200).json({ success: true, source: 'ACET E-CAP', attendance, profile, syncedAt: new Date().toISOString() });
  } catch (error) {
    console.error('E-CAP attendance v3 failed:', error?.message || error);
    return res.status(Number(error?.status) || 502).json({ error: error?.message || 'Unable to sync attendance from ACET E-CAP.' });
  }
}
