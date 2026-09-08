import crypto from 'node:crypto';

const ORIGIN = 'https://info.aec.edu.in';
const BASE = `${ORIGIN}/acet/`;
const LOGIN_URL = `${BASE}default.aspx`;
const ATTENDANCE_URL = `${BASE}Academics/StudentAttendance.aspx?scrid=3&showtype=SA`;
const PROFILE_URL = `${BASE}Academics/StudentProfile.aspx?scrid=17`;
const AES_KEY = '8701661282118308';
const MAX_REDIRECTS = 8;

function decodeHtml(v = '') {
  return String(v).replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function plain(v = '') {
  return decodeHtml(String(v).replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function attrs(tag) {
  const out = {};
  const re = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let m;
  while ((m = re.exec(tag))) out[m[1].toLowerCase()] = decodeHtml(m[2] ?? m[3] ?? m[4] ?? '');
  return out;
}

function setCookies(headers) {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const raw = headers.get('set-cookie');
  return raw ? raw.split(/,(?=\s*[^;,=]+=[^;,]*)/g) : [];
}

function mergeCookies(jar, headers) {
  for (const raw of setCookies(headers)) {
    const pair = String(raw).split(';', 1)[0];
    const i = pair.indexOf('=');
    if (i <= 0) continue;
    const key = pair.slice(0, i).trim();
    const value = pair.slice(i + 1).trim();
    if (value) jar.set(key, value); else jar.delete(key);
  }
}

function cookieHeader(jar) { return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; '); }

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
      if ([301, 302, 303].includes(response.status) && method !== 'GET') { method = 'GET'; body = undefined; }
      continue;
    }
    return { response, url: current.toString(), text: await response.text() };
  }
  throw new Error('Too many E-CAP redirects');
}

function hiddenInputs(html) {
  const out = {};
  for (const m of String(html).matchAll(/<input\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    if ((a.type || '').toLowerCase() === 'hidden' && a.name) out[a.name] = a.value || '';
  }
  return out;
}

function encryptPassword(password) {
  const key = Buffer.from(AES_KEY, 'utf8');
  const cipher = crypto.createCipheriv('aes-128-cbc', key, key);
  return Buffer.concat([cipher.update(String(password), 'utf8'), cipher.final()]).toString('base64');
}

function isLoginPage(html, url) { return /default\.aspx/i.test(url) && /\btxtId2\b/i.test(html) && /\btxtPwd2\b/i.test(html); }

async function loginEcap(rollNo, password) {
  const jar = new Map();
  const landing = await request(LOGIN_URL, jar);
  if (!/\btxtId2\b/i.test(landing.text) || !/\btxtPwd2\b/i.test(landing.text)) throw Object.assign(new Error('Could not open E-CAP login form.'), { status: 502 });
  const encrypted = encryptPassword(password);
  const form = new URLSearchParams();
  Object.entries(hiddenInputs(landing.text)).forEach(([k, v]) => form.set(k, v));
  form.set('txtId1', ''); form.set('txtPwd1', ''); form.set('txtId2', rollNo); form.set('txtPwd2', encrypted);
  form.set('txtId3', ''); form.set('txtPwd3', ''); form.set('TextBox1', ''); form.set('hdnpwd1', '');
  form.set('hdnpwd2', encrypted); form.set('hdnpwd3', ''); form.set('imgBtn2.x', '48'); form.set('imgBtn2.y', '20');
  const logged = await request(LOGIN_URL, jar, {
    method: 'POST', body: form.toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: ORIGIN, Referer: landing.url },
  });
  if (isLoginPage(logged.text, logged.url)) throw Object.assign(new Error('E-CAP did not accept this Hall Ticket/password.'), { status: 401 });
  return { jar, logged };
}

function tableRows(html) {
  const out = [];
  for (const tr of String(html).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...tr[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => plain(m[1]));
    if (cells.length) out.push(cells);
  }
  return out;
}

function num(v) {
  const s = String(v ?? '').replace(/,/g, '').replace(/%/g, '').trim();
  if (!s || !/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(s)) return null;
  const n = Number(s); return Number.isFinite(n) ? n : null;
}

function parseAttendance(html) {
  const items = []; let total = null;
  for (const cells0 of tableRows(html)) {
    const cells = cells0.map((v) => String(v || '').trim());
    if (/^TOTAL\s*:?$/i.test(cells[0] || '')) {
      const ns = cells.map(num).filter((v) => v !== null);
      if (ns.length >= 3) {
        const [held, attended, percentage] = ns.slice(-3);
        if (held >= 0 && attended >= 0 && attended <= held && percentage >= 0 && percentage <= 100) total = { held, attended, percentage };
      }
      continue;
    }
    let subject = ''; let held = null; let attended = null; let percentage = null;
    const numeric = cells.map((cell, index) => ({ index, value: num(cell) })).filter((x) => x.value !== null);
    if (/^\d+$/.test(cells[0] || '') && cells.length >= 5) {
      subject = cells[1] || ''; held = num(cells[2]); attended = num(cells[3]); percentage = num(cells[4]);
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
    if (!items.some((x) => x._key === key)) items.push({ _key: key, subject, held, attended, percentage });
  }
  if (!total && items.length) {
    const held = items.reduce((s, x) => s + x.held, 0), attended = items.reduce((s, x) => s + x.attended, 0);
    total = { held, attended, percentage: held ? Number(((attended / held) * 100).toFixed(2)) : 0 };
  }
  return { items: items.map(({ _key, ...x }) => x), total };
}

function hasAttendance(a) { return Boolean(a?.total || a?.items?.length); }

function structuredAttendance(value) {
  const items = [];
  const walk = (node, depth = 0) => {
    if (depth > 8 || node == null) return;
    if (Array.isArray(node)) return node.forEach((x) => walk(x, depth + 1));
    if (typeof node !== 'object') return;
    const n = {}; for (const [k, v] of Object.entries(node)) n[k.toLowerCase().replace(/[^a-z0-9]/g, '')] = v;
    const subject = n.subject ?? n.subjectname ?? n.coursename ?? n.course ?? n.subname ?? n.subcode;
    const held = num(n.held ?? n.classesheld ?? n.conducted ?? n.totalclasses ?? n.total);
    const attended = num(n.attended ?? n.present ?? n.classesattended ?? n.attend);
    let percentage = num(n.percentage ?? n.percent ?? n.attendancepercentage ?? n.attendancepercent ?? n.pct);
    if (percentage === null && held !== null && attended !== null && held > 0) percentage = Number(((attended / held) * 100).toFixed(2));
    if (subject && held !== null && attended !== null && percentage !== null && attended <= held && percentage >= 0 && percentage <= 100) items.push({ subject: String(subject), held, attended, percentage });
    Object.values(node).forEach((x) => walk(x, depth + 1));
  };
  walk(value);
  if (!items.length) return { items: [], total: null };
  const unique = []; for (const x of items) { const k = `${x.subject.toUpperCase()}|${x.held}|${x.attended}|${x.percentage}`; if (!unique.some((u) => u._k === k)) unique.push({ ...x, _k: k }); }
  const held = unique.reduce((s, x) => s + x.held, 0), attended = unique.reduce((s, x) => s + x.attended, 0);
  return { items: unique.map(({ _k, ...x }) => x), total: { held, attended, percentage: held ? Number(((attended / held) * 100).toFixed(2)) : 0 } };
}

function attendanceFromResponse(raw) {
  const candidates = [String(raw || '')];
  try {
    const parsed = JSON.parse(raw);
    const structured = structuredAttendance(parsed); if (hasAttendance(structured)) return structured;
    const stack = [parsed];
    while (stack.length && candidates.length < 80) {
      const v = stack.pop();
      if (typeof v === 'string') candidates.push(v); else if (Array.isArray(v)) stack.push(...v); else if (v && typeof v === 'object') stack.push(...Object.values(v));
    }
  } catch {}
  for (const c of candidates) {
    const a = parseAttendance(c); if (hasAttendance(a)) return a;
    const d = decodeHtml(c); if (d !== c) { const b = parseAttendance(d); if (hasAttendance(b)) return b; }
  }
  return { items: [], total: null };
}

function controls(html) {
  const out = [];
  for (const m of String(html).matchAll(/<(select|input)\b[^>]*>([\s\S]*?<\/select>)?/gi)) {
    const tag = m[0].match(/<(?:select|input)\b[^>]*>/i)?.[0] || m[0]; const a = attrs(tag);
    if (!a.name && !a.id) continue;
    let value = a.value ?? '';
    if (/^<select/i.test(m[0])) {
      const opts = [...m[0].matchAll(/<option\b[^>]*>([\s\S]*?)<\/option>/gi)].map((o) => { const oa = attrs(o[0].match(/<option\b[^>]*>/i)?.[0] || ''); return { value: oa.value ?? plain(o[1]), selected: /\sselected(?:\s|=|>)/i.test(o[0]) }; });
      value = (opts.find((x) => x.selected) || opts.find((x) => x.value !== '') || opts[0] || {}).value ?? '';
    }
    out.push({ name: a.name || '', id: a.id || '', value });
  }
  return out;
}

function proxyUrls(html, base) {
  const found = new Set();
  for (const m of String(html).matchAll(/["']([^"']*\/ajax\/StudentAttendance,[^"']+\.ashx(?:\?[^"']*)?)["']/gi)) {
    try { const u = new URL(decodeHtml(m[1]), base); if (u.origin === ORIGIN) { u.search = ''; found.add(u.toString()); } } catch {}
  }
  return [...found];
}

function balancedBody(source, start) {
  let depth = 0, quote = '', escape = false;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) { if (escape) escape = false; else if (ch === '\\') escape = true; else if (ch === quote) quote = ''; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth += 1; else if (ch === '}') { depth -= 1; if (depth === 0) return source.slice(start + 1, i); }
  }
  return source.slice(start + 1);
}

function parseProxyMethods(js) {
  const source = String(js || ''); const out = new Map();
  const add = (name, params) => {
    if (!name || /^_|^(?:toString|valueOf|constructor|url)$/i.test(name)) return;
    const clean = params.filter((p) => p?.name && !/^(?:onSuccess|onFailed|onFailure|onError|callback|cb|context|async)$/i.test(p.name));
    const key = `${name}|${clean.map((p) => p.name).join(',')}`; if (!out.has(key)) out.set(key, { method: name, params: clean });
  };
  const starts = [
    /(?:^|[,;{\s])(?:["']([A-Za-z_$][\w$]*)["']|([A-Za-z_$][\w$]*))\s*:\s*function\s*\(([^)]*)\)\s*\{/gm,
    /(?:[A-Za-z_$][\w$]*\.)+([A-Za-z_$][\w$]*)\s*=\s*function\s*\(([^)]*)\)\s*\{/gm,
  ];
  for (const re of starts) {
    let m;
    while ((m = re.exec(source))) {
      const prop = m[1] || m[2]; const argText = re === starts[0] ? m[3] : m[2];
      const brace = source.indexOf('{', m.index + m[0].lastIndexOf('{')); const body = balancedBody(source, brace);
      const invoke = body.match(/(?:this\.)?invoke\s*\(\s*["']([^"']+)["']/i) || body.match(/AjaxPro\.(?:invoke|Request)\s*\(\s*["']([^"']+)["']/i);
      const method = invoke?.[1] || prop;
      const params = [];
      for (const p of body.matchAll(/\.add\(\s*["']([^"']+)["']\s*,\s*([A-Za-z_$][\w$]*)\s*\)/g)) params.push({ name: p[1], variable: p[2] });
      for (const p of body.matchAll(/(?:["']([^"']+)["']|([A-Za-z_$][\w$]*))\s*:\s*([A-Za-z_$][\w$]*)/g)) params.push({ name: p[1] || p[2], variable: p[3] });
      const fnArgs = String(argText || '').split(',').map((x) => x.trim()).filter(Boolean).map((name) => ({ name, variable: name }));
      add(method, params.length ? params : fnArgs);
    }
  }
  for (const m of source.matchAll(/(?:this\.)?invoke\s*\(\s*["']([^"']+)["']\s*,\s*\{([^}]*)\}/gi)) {
    const params = [...m[2].matchAll(/(?:["']([^"']+)["']|([A-Za-z_$][\w$]*))\s*:\s*([A-Za-z_$][\w$]*)/g)].map((p) => ({ name: p[1] || p[2], variable: p[3] })); add(m[1], params);
  }
  return [...out.values()];
}

function pageMethods(html) {
  const names = new Set();
  for (const m of String(html).matchAll(/StudentAttendance(?:_class)?\.([A-Za-z_$][\w$]*)\s*\(/g)) if (!/^(?:toString|valueOf)$/i.test(m[1])) names.add(m[1]);
  return [...names].map((method) => ({ method, params: [] }));
}

function isSafe(name) { return !/(save|update|delete|insert|remove|add|edit|pay|fee|receipt|transaction|password|logout|change|upload|submit)/i.test(name); }

function controlValue(cs, test) { const c = cs.find((x) => test(`${x.name} ${x.id}`.toLowerCase())); return c ? c.value : null; }

function mapArgs(method, cs, rollNo) {
  const out = {};
  for (const p of method.params) {
    const low = `${p.name} ${p.variable || ''}`.toLowerCase(); let v = controlValue(cs, (h) => h.includes(String(p.name).toLowerCase()) || (p.variable && h.includes(String(p.variable).toLowerCase())));
    if (v == null) {
      if (/(roll|regno|hall|htno|studentno|userid)/i.test(low)) v = rollNo;
      else if (/(year|academic|acad)/i.test(low)) v = controlValue(cs, (h) => /(ddlyear|year|academic|acad)/i.test(h));
      else if (/(fromdate|from_date|datefrom|startdate)/i.test(low)) v = controlValue(cs, (h) => /(fromdate|datefrom|startdate)/i.test(h)) ?? '';
      else if (/(todate|to_date|dateto|enddate)/i.test(low)) v = controlValue(cs, (h) => /(todate|dateto|enddate)/i.test(h)) ?? '';
      else if (/(showtype|type|mode)/i.test(low)) v = controlValue(cs, (h) => /(hdntype|showtype|type|mode)/i.test(h)) || 'SA';
      else if (/scrid/i.test(low)) v = '3';
      else if (/(section|sec)/i.test(low)) v = controlValue(cs, (h) => /(section|sec)/i.test(h));
    }
    if (v == null) return null;
    out[p.name] = v;
  }
  return out;
}

async function invoke(proxyUrl, method, args, jar, referer, mode) {
  const u = new URL(proxyUrl);
  if (mode === 'query') { u.searchParams.set('_method', method); u.searchParams.set('_session', 'r'); }
  return request(u.toString(), jar, {
    method: 'POST', body: JSON.stringify(args || {}),
    headers: { Accept: '*/*', 'Content-Type': 'text/plain; charset=UTF-8', 'X-AjaxPro-Method': method, 'X-Requested-With': 'XMLHttpRequest', Origin: ORIGIN, Referer: referer },
  });
}

async function resolveDynamic(page, jar, rollNo) {
  const cs = controls(page.text), proxies = proxyUrls(page.text, page.url);
  const diagnostics = { controls: cs.map((x) => ({ name: x.name, id: x.id, hasValue: x.value !== '' })), proxies: [], attempts: [] };
  for (const proxyUrl of proxies) {
    try {
      const proxy = await request(proxyUrl, jar, { headers: { Accept: 'application/javascript,text/javascript,*/*;q=0.8', Referer: page.url } });
      const parsed = parseProxyMethods(proxy.text); const inline = pageMethods(page.text);
      const merged = new Map(); for (const m of [...parsed, ...inline]) if (isSafe(m.method)) { const k = `${m.method}|${m.params.map((p) => p.name).join(',')}`; if (!merged.has(k)) merged.set(k, m); }
      const methods = [...merged.values()].slice(0, 24);
      diagnostics.proxies.push({ path: new URL(proxyUrl).pathname, status: proxy.response.status, size: proxy.text.length, methods: methods.map((m) => ({ name: m.method, params: m.params.map((p) => p.name) })) });
      for (const m of methods) {
        const args = mapArgs(m, cs, rollNo); if (args == null) { diagnostics.attempts.push({ method: m.method, result: 'unresolved_params', params: m.params.map((p) => p.name) }); continue; }
        for (const mode of ['header', 'query']) {
          try {
            const r = await invoke(proxyUrl, m.method, args, jar, page.url, mode); const a = attendanceFromResponse(r.text);
            diagnostics.attempts.push({ method: m.method, mode, status: r.response.status, size: r.text.length, found: hasAttendance(a) });
            if (hasAttendance(a)) return { attendance: a, source: `ajax:${m.method}:${mode}`, diagnostics };
          } catch { diagnostics.attempts.push({ method: m.method, mode, result: 'request_error' }); }
        }
      }
    } catch { diagnostics.proxies.push({ path: new URL(proxyUrl).pathname, error: 'proxy_fetch_failed' }); }
  }
  return { attendance: { items: [], total: null }, source: null, diagnostics };
}

function parseProfile(html, rollNo) {
  const rows = tableRows(html); const find = (labels) => {
    const wanted = labels.map((x) => x.toLowerCase());
    for (const row of rows) for (let i = 0; i < row.length; i += 1) if (wanted.includes(String(row[i] || '').replace(/\s*:\s*$/, '').trim().toLowerCase())) for (const v of row.slice(i + 1)) if (v && v !== ':') return v;
    return '';
  };
  return { rollNo: find(['RollNo', 'Roll No', 'Hall Ticket No']) || rollNo, name: find(['Name', 'Student Name']), course: find(['Course']), branch: find(['Branch']), semester: find(['Semester', 'Sem']) };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const rollNo = String(req.body?.rollNo || '').trim().toUpperCase(), password = String(req.body?.password || '');
  if (!/^[A-Z0-9]{6,20}$/.test(rollNo) || !password || password.length > 128) return res.status(400).json({ error: 'Enter a valid roll number and E-CAP password' });
  try {
    const { jar, logged } = await loginEcap(rollNo, password);
    const page = await request(ATTENDANCE_URL, jar, { headers: { Referer: logged.url } });
    if (!page.response.ok || isLoginPage(page.text, page.url)) return res.status(401).json({ error: 'E-CAP session expired before Attendance opened.' });
    let attendance = parseAttendance(page.text), source = hasAttendance(attendance) ? 'attendance_page' : null, dynamic = null;
    if (!hasAttendance(attendance)) { const d = await resolveDynamic(page, jar, rollNo); dynamic = d.diagnostics; if (hasAttendance(d.attendance)) { attendance = d.attendance; source = d.source; } }
    let profile = { rollNo };
    try { const p = await request(PROFILE_URL, jar, { headers: { Referer: page.url } }); profile = parseProfile(p.text, rollNo); if (!hasAttendance(attendance)) { const pa = parseAttendance(p.text); if (hasAttendance(pa)) { attendance = pa; source = 'profile_page'; } } } catch {}
    if (profile.rollNo && profile.rollNo.toUpperCase() !== rollNo) return res.status(403).json({ error: 'E-CAP account does not match your Student 360 roll number.' });
    console.info('E-CAP attendance v4', JSON.stringify({ source: source || 'none', subjectCount: attendance.items.length, total: Boolean(attendance.total), dynamic }));
    if (!hasAttendance(attendance)) return res.status(422).json({ error: 'E-CAP login succeeded, but the attendance AjaxPro method still needs final parameter mapping.', stage: 'attendance_ajax', reason: 'ajax_mapping_pending' });
    return res.status(200).json({ success: true, source: 'ACET E-CAP', attendance, profile, syncedAt: new Date().toISOString() });
  } catch (error) {
    console.error('E-CAP attendance v4 failed', { message: error?.message || String(error) });
    return res.status(Number(error?.status) || 502).json({ error: error?.message || 'Unable to sync attendance from ACET E-CAP.' });
  }
}
