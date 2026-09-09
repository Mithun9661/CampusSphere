import crypto from 'node:crypto';

const ORIGIN = 'https://info.aec.edu.in';
const BASE = `${ORIGIN}/acet/`;
const LOGIN_URL = `${BASE}default.aspx`;
const ATTENDANCE_URL = `${BASE}Academics/StudentAttendance.aspx?scrid=3&showtype=SA`;
const PROFILE_URL = `${BASE}Academics/StudentProfile.aspx?scrid=17`;
const AES_KEY = '8701661282118308';
const MAX_REDIRECTS = 8;

function decodeHtml(v = '') {
  return String(v)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function plain(v = '') {
  return decodeHtml(String(v)
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
  while ((m = re.exec(tag))) out[m[1].toLowerCase()] = decodeHtml(m[2] ?? m[3] ?? m[4] ?? '');
  return out;
}

function getSetCookies(headers) {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const raw = headers.get('set-cookie');
  return raw ? raw.split(/,(?=\s*[^;,=]+=[^;,]*)/g) : [];
}

function mergeCookies(jar, headers) {
  for (const raw of getSetCookies(headers)) {
    const pair = String(raw).split(';', 1)[0];
    const i = pair.indexOf('=');
    if (i <= 0) continue;
    const key = pair.slice(0, i).trim();
    const value = pair.slice(i + 1).trim();
    if (value) jar.set(key, value); else jar.delete(key);
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

function isLoginPage(html, url) {
  return /default\.aspx/i.test(url) && /\btxtId2\b/i.test(html) && /\btxtPwd2\b/i.test(html);
}

async function loginEcap(rollNo, password) {
  const jar = new Map();
  const landing = await request(LOGIN_URL, jar);
  if (!/\btxtId2\b/i.test(landing.text) || !/\btxtPwd2\b/i.test(landing.text)) {
    throw Object.assign(new Error('Could not open E-CAP login form.'), { status: 502 });
  }
  const encrypted = encryptPassword(password);
  const form = new URLSearchParams();
  Object.entries(hiddenInputs(landing.text)).forEach(([k, v]) => form.set(k, v));
  form.set('txtId1', ''); form.set('txtPwd1', '');
  form.set('txtId2', rollNo); form.set('txtPwd2', encrypted);
  form.set('txtId3', ''); form.set('txtPwd3', ''); form.set('TextBox1', '');
  form.set('hdnpwd1', ''); form.set('hdnpwd2', encrypted); form.set('hdnpwd3', '');
  form.set('imgBtn2.x', '48'); form.set('imgBtn2.y', '20');
  const logged = await request(LOGIN_URL, jar, {
    method: 'POST',
    body: form.toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: ORIGIN, Referer: landing.url },
  });
  if (isLoginPage(logged.text, logged.url)) {
    throw Object.assign(new Error('E-CAP did not accept this Hall Ticket/password.'), { status: 401 });
  }
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
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function validTriple(held, attended, percentage) {
  return held !== null && attended !== null && percentage !== null && held >= 0 && attended >= 0 && attended <= held && percentage >= 0 && percentage <= 100;
}

function parseAttendanceRows(html) {
  const items = [];
  let total = null;
  for (const cells0 of tableRows(html)) {
    const cells = cells0.map((v) => String(v || '').trim());
    if (/^TOTAL\s*:?$/i.test(cells[0] || '')) {
      const ns = cells.map(num).filter((v) => v !== null);
      if (ns.length >= 3) {
        const [held, attended, percentage] = ns.slice(-3);
        if (validTriple(held, attended, percentage)) total = { held, attended, percentage };
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
      held = num(cells[2]);
      attended = num(cells[3]);
      percentage = num(cells[4]);
    } else if (numeric.length >= 3) {
      const [h, a, p] = numeric.slice(-3);
      if (h.index < a.index && a.index < p.index) {
        held = h.value; attended = a.value; percentage = p.value;
        subject = cells.slice(0, h.index).filter(Boolean).join(' ').replace(/^\d+\s*/, '').trim();
      }
    }
    if (!subject || !validTriple(held, attended, percentage)) continue;
    if (/^(sl\.?\s*no|course|subject|held|attend(?:ed)?|attendance|percentage|%)$/i.test(subject)) continue;
    const key = `${subject.toUpperCase()}|${held}|${attended}|${percentage}`;
    if (!items.some((x) => x._key === key)) items.push({ _key: key, subject, held, attended, percentage });
  }
  if (!total && items.length) {
    const held = items.reduce((s, x) => s + x.held, 0);
    const attended = items.reduce((s, x) => s + x.attended, 0);
    total = { held, attended, percentage: held ? Number(((attended / held) * 100).toFixed(2)) : 0 };
  }
  return { items: items.map(({ _key, ...x }) => x), total };
}

function parseAttendanceMatrix(html) {
  const rs = tableRows(html);
  for (let i = 0; i < rs.length; i += 1) {
    const header = rs[i].map((x) => String(x || '').trim());
    if (!/^subject$/i.test(header[0] || '') || header.length < 3) continue;
    const heldRow = rs.slice(i + 1, i + 7).find((r) => /^held$/i.test(String(r[0] || '').trim()));
    const attRow = rs.slice(i + 1, i + 8).find((r) => /^attend(?:ed)?$/i.test(String(r[0] || '').trim()));
    const pctRow = rs.slice(i + 1, i + 9).find((r) => /^%$|^percentage$/i.test(String(r[0] || '').trim()));
    if (!heldRow || !attRow || !pctRow) continue;
    const items = [];
    let total = null;
    for (let c = 1; c < header.length; c += 1) {
      const subject = header[c];
      const held = num(heldRow[c]);
      const attended = num(attRow[c]);
      const percentage = num(pctRow[c]);
      if (/^total$/i.test(subject || '')) {
        if (validTriple(held, attended, percentage)) total = { held, attended, percentage };
        continue;
      }
      if (subject && validTriple(held, attended, percentage)) items.push({ subject, held, attended, percentage });
    }
    if (items.length) {
      if (!total) {
        const held = items.reduce((s, x) => s + x.held, 0);
        const attended = items.reduce((s, x) => s + x.attended, 0);
        total = { held, attended, percentage: held ? Number(((attended / held) * 100).toFixed(2)) : 0 };
      }
      return { items, total };
    }
  }
  return { items: [], total: null };
}

function hasAttendance(a) {
  return Boolean(a?.total || a?.items?.length);
}

function parseAttendance(html) {
  const matrix = parseAttendanceMatrix(html);
  if (hasAttendance(matrix)) return matrix;
  return parseAttendanceRows(html);
}

function structuredAttendance(value) {
  const items = [];
  function walk(node, depth = 0) {
    if (depth > 8 || node == null) return;
    if (Array.isArray(node)) { node.forEach((x) => walk(x, depth + 1)); return; }
    if (typeof node !== 'object') return;
    const n = {};
    for (const [k, v] of Object.entries(node)) n[k.toLowerCase().replace(/[^a-z0-9]/g, '')] = v;
    const subject = n.subject ?? n.subjectname ?? n.coursename ?? n.course ?? n.subname ?? n.subcode;
    const held = num(n.held ?? n.classesheld ?? n.conducted ?? n.totalclasses ?? n.total);
    const attended = num(n.attended ?? n.present ?? n.classesattended ?? n.attend);
    let percentage = num(n.percentage ?? n.percent ?? n.attendancepercentage ?? n.attendancepercent ?? n.pct);
    if (percentage === null && held !== null && attended !== null && held > 0) percentage = Number(((attended / held) * 100).toFixed(2));
    if (subject && validTriple(held, attended, percentage)) items.push({ subject: String(subject), held, attended, percentage });
    Object.values(node).forEach((x) => walk(x, depth + 1));
  }
  walk(value);
  if (!items.length) return { items: [], total: null };
  const unique = [];
  for (const x of items) {
    const key = `${x.subject.toUpperCase()}|${x.held}|${x.attended}|${x.percentage}`;
    if (!unique.some((u) => u._key === key)) unique.push({ ...x, _key: key });
  }
  const held = unique.reduce((s, x) => s + x.held, 0);
  const attended = unique.reduce((s, x) => s + x.attended, 0);
  return { items: unique.map(({ _key, ...x }) => x), total: { held, attended, percentage: held ? Number(((attended / held) * 100).toFixed(2)) : 0 } };
}

function attendanceFromResponse(raw) {
  const candidates = [String(raw || '')];
  try {
    const parsed = JSON.parse(raw);
    const structured = structuredAttendance(parsed);
    if (hasAttendance(structured)) return structured;
    const stack = [parsed];
    while (stack.length && candidates.length < 100) {
      const v = stack.pop();
      if (typeof v === 'string') candidates.push(v);
      else if (Array.isArray(v)) stack.push(...v);
      else if (v && typeof v === 'object') stack.push(...Object.values(v));
    }
  } catch {}
  for (const c of candidates) {
    const a = parseAttendance(c);
    if (hasAttendance(a)) return a;
    const d = decodeHtml(c);
    if (d !== c) {
      const b = parseAttendance(d);
      if (hasAttendance(b)) return b;
    }
  }
  return { items: [], total: null };
}

function controls(html) {
  const out = [];
  for (const m of String(html).matchAll(/<(select|input)\b[^>]*>([\s\S]*?<\/select>)?/gi)) {
    const tag = m[0].match(/<(?:select|input)\b[^>]*>/i)?.[0] || m[0];
    const a = attrs(tag);
    if (!a.name && !a.id) continue;
    let value = a.value ?? '';
    if (/^<select/i.test(m[0])) {
      const opts = [...m[0].matchAll(/<option\b[^>]*>([\s\S]*?)<\/option>/gi)].map((o) => {
        const oa = attrs(o[0].match(/<option\b[^>]*>/i)?.[0] || '');
        return { value: oa.value ?? plain(o[1]), selected: /\sselected(?:\s|=|>)/i.test(o[0]) };
      });
      value = (opts.find((x) => x.selected) || opts.find((x) => x.value !== '') || opts[0] || {}).value ?? '';
    }
    out.push({ name: a.name || '', id: a.id || '', value, type: (a.type || '').toLowerCase(), checked: /\schecked(?:\s|=|>)/i.test(tag), onclick: a.onclick || '' });
  }
  return out;
}

function scriptUrls(html, base) {
  const out = new Set();
  for (const m of String(html).matchAll(/<script\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    if (!a.src) continue;
    try {
      const u = new URL(a.src, base);
      if (u.origin === ORIGIN && (/(StudentAttendance|AjaxMethods|common)\b/i.test(u.pathname) || /\/ajax\/.*\.ashx/i.test(u.pathname))) out.add(u.toString());
    } catch {}
  }
  for (const m of String(html).matchAll(/["']([^"']*\/ajax\/StudentAttendance,[^"']+\.ashx(?:\?[^"']*)?)["']/gi)) {
    try {
      const u = new URL(decodeHtml(m[1]), base);
      if (u.origin === ORIGIN) out.add(u.toString());
    } catch {}
  }
  return [...out].slice(0, 12);
}

function safeMethod(name) {
  return Boolean(name) && !/^(?:invoke|toString|valueOf|constructor|url|request)$/i.test(name)
    && !/(save|update|delete|insert|remove|add|edit|pay|fee|receipt|transaction|password|logout|change|upload|submit)/i.test(name);
}

function cleanParams(text) {
  return String(text || '').split(',').map((x) => x.trim()).filter(Boolean)
    .filter((x) => !/^(?:onSuccess|onFailed|onFailure|onError|callback|cb|context|async)$/i.test(x))
    .map((name) => ({ name, variable: name }));
}

function methodCandidates(source) {
  const text = String(source || '');
  const out = new Map();
  const add = (method, params = [], sourceKind = '') => {
    if (!safeMethod(method)) return;
    const clean = params.filter((p) => p?.name);
    const key = `${method}|${clean.map((p) => p.name).join(',')}`;
    if (!out.has(key)) out.set(key, { method, params: clean, sourceKind });
  };

  for (const m of text.matchAll(/\binvoke\s*\(\s*["']([^"']+)["']/gi)) add(m[1], [], 'invoke');
  for (const m of text.matchAll(/[_?&]method=([A-Za-z_$][\w$]*)/gi)) add(m[1], [], 'query');
  for (const m of text.matchAll(/(?:[A-Za-z_$][\w$]*\.)+([A-Za-z_$][\w$]*)\s*=\s*function\s*\(([^)]*)\)/g)) add(m[1], cleanParams(m[2]), 'assignment');
  for (const m of text.matchAll(/(?:[A-Za-z_$][\w$]*\.)*prototype\.([A-Za-z_$][\w$]*)\s*=\s*function\s*\(([^)]*)\)/g)) add(m[1], cleanParams(m[2]), 'prototype');
  for (const m of text.matchAll(/(?:^|[,;{\s])([A-Za-z_$][\w$]*)\s*:\s*function\s*\(([^)]*)\)/gm)) add(m[1], cleanParams(m[2]), 'object');
  for (const m of text.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/g)) add(m[1], cleanParams(m[2]), 'function');
  for (const m of text.matchAll(/(?:StudentAttendance(?:_class)?|[A-Za-z_$][\w$]*Attendance)\.([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/g)) {
    const args = String(m[2] || '').split(',').map((x) => x.trim()).filter(Boolean)
      .filter((x) => !/^(?:onSuccess|onFailed|onFailure|onError|callback|cb|context|async)$/i.test(x))
      .map((variable, i) => ({ name: `arg${i + 1}`, variable }));
    add(m[1], args, 'call');
  }
  for (const m of text.matchAll(/AjaxPro\.(?:Request|request)\s*\(\s*[^,]+,\s*["']([^"']+)["']/gi)) add(m[1], [], 'ajaxpro-request');
  for (const m of text.matchAll(/X-AjaxPro-Method[\s\S]{0,160}?["']([A-Za-z_$][\w$]*)["']/gi)) add(m[1], [], 'header');
  return [...out.values()];
}

function safeSnippets(text) {
  const lines = String(text || '').split(/\r?\n/);
  return lines.filter((line) => /(StudentAttendance|AjaxPro|callWebMethod|btnShow|ddlYear|FromDate|ToDate|chkexclude|hdnType|_method|attendance|present|held)/i.test(line))
    .slice(0, 8)
    .map((line) => line.replace(/\s+/g, ' ').trim().slice(0, 360));
}

function controlValue(cs, test) {
  const c = cs.find((x) => test(`${x.name} ${x.id}`.toLowerCase()));
  return c ? c.value : null;
}

function baseValues(cs, rollNo) {
  const year = controlValue(cs, (h) => /(ddlyear|year|academic|acad)/i.test(h));
  const from = controlValue(cs, (h) => /(fromdate|datefrom|startdate)/i.test(h)) ?? '';
  const to = controlValue(cs, (h) => /(todate|dateto|enddate)/i.test(h)) ?? '';
  const type = controlValue(cs, (h) => /(hdntype|showtype|type|mode)/i.test(h)) || 'SA';
  const excludeControl = cs.find((x) => /(exclude|chkexclude)/i.test(`${x.name} ${x.id}`));
  const exclude = excludeControl?.checked ? 'true' : 'false';
  return { year, from, to, type, exclude, rollNo };
}

function mapNamedArgs(method, cs, rollNo) {
  const out = {};
  const base = baseValues(cs, rollNo);
  for (const p of method.params) {
    const low = `${p.name} ${p.variable || ''}`.toLowerCase();
    let v = null;
    if (!/^arg\d+$/i.test(p.name)) {
      v = controlValue(cs, (h) => h.includes(String(p.name).toLowerCase()) || (p.variable && h.includes(String(p.variable).toLowerCase())));
    }
    if (v == null) {
      if (/(roll|regno|hall|htno|studentno|userid|user_id)/i.test(low)) v = base.rollNo;
      else if (/(year|academic|acad)/i.test(low)) v = base.year;
      else if (/(fromdate|datefrom|startdate)/i.test(low)) v = base.from;
      else if (/(todate|dateto|enddate)/i.test(low)) v = base.to;
      else if (/(exclude|chk)/i.test(low)) v = base.exclude;
      else if (/(showtype|type|mode)/i.test(low)) v = base.type;
      else if (/scrid/i.test(low)) v = '3';
    }
    if (v == null) return null;
    out[p.name] = v;
  }
  return out;
}

function argVariants(method, cs, rollNo) {
  if (!method.params.length) return [{}];
  const named = mapNamedArgs(method, cs, rollNo);
  if (named) return [named];
  const b = baseValues(cs, rollNo);
  const sequences = [
    [b.year, b.from, b.to, b.exclude, b.type, b.rollNo],
    [b.year, b.from, b.to, b.type, b.exclude, b.rollNo],
    [b.year, b.from, b.to, b.type, b.rollNo],
    [b.year, b.from, b.to, b.exclude, b.rollNo],
    [b.year, b.from, b.to, b.rollNo],
    [b.year, b.type, b.rollNo],
    [b.year, b.rollNo],
    [b.rollNo, b.year, b.from, b.to, b.type],
  ];
  const variants = [];
  for (const seq of sequences) {
    const out = {};
    let ok = true;
    method.params.forEach((p, i) => {
      const v = seq[i];
      if (v == null) ok = false;
      out[p.name] = v;
    });
    if (ok && !variants.some((x) => JSON.stringify(x) === JSON.stringify(out))) variants.push(out);
  }
  return variants;
}

async function invokeProxy(proxyUrl, method, args, jar, referer, mode) {
  const u = new URL(proxyUrl);
  u.search = '';
  if (mode === 'query') {
    u.searchParams.set('_method', method);
    u.searchParams.set('_session', 'r');
  }
  const headers = {
    Accept: '*/*',
    'Content-Type': 'text/plain; charset=UTF-8',
    'X-AjaxPro-Method': method,
    'X-Requested-With': 'XMLHttpRequest',
    Origin: ORIGIN,
    Referer: referer,
  };
  return request(u.toString(), jar, { method: 'POST', body: JSON.stringify(args || {}), headers });
}

async function tryFormPostbacks(page, jar, cs) {
  const baseForm = new URLSearchParams();
  Object.entries(hiddenInputs(page.text)).forEach(([k, v]) => baseForm.set(k, v));
  for (const c of cs) if (c.name && c.type !== 'button' && c.type !== 'submit' && c.type !== 'image') baseForm.set(c.name, c.value || '');
  const variants = [
    { '__EVENTTARGET': 'ctl00$CapPlaceHolder$btnShow', 'ctl00$CapPlaceHolder$btnShow': 'Show' },
    { '__EVENTTARGET': 'btnShow', btnShow: 'Show' },
    { '__EVENTTARGET': '', btnShow: 'Show', 'ctl00$CapPlaceHolder$btnShow': 'Show' },
  ];
  const attempts = [];
  for (const extra of variants) {
    const form = new URLSearchParams(baseForm);
    for (const [k, v] of Object.entries(extra)) form.set(k, v);
    form.set('__EVENTARGUMENT', '');
    try {
      const r = await request(ATTENDANCE_URL, jar, {
        method: 'POST',
        body: form.toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: ORIGIN, Referer: page.url },
      });
      const a = parseAttendance(r.text);
      attempts.push({ target: extra.__EVENTTARGET || 'button', status: r.response.status, size: r.text.length, found: hasAttendance(a) });
      if (hasAttendance(a)) return { attendance: a, source: `postback:${extra.__EVENTTARGET || 'button'}`, attempts };
    } catch {
      attempts.push({ target: extra.__EVENTTARGET || 'button', result: 'request_error' });
    }
  }
  return { attendance: { items: [], total: null }, source: null, attempts };
}

async function resolveDynamic(page, jar, rollNo) {
  const cs = controls(page.text);
  const urls = scriptUrls(page.text, page.url);
  const diagnostics = {
    controls: cs.map((x) => ({ name: x.name, id: x.id, type: x.type, hasValue: x.value !== '', hasOnclick: Boolean(x.onclick) })),
    pageSignals: safeSnippets(page.text),
    scripts: [],
    methods: [],
    attempts: [],
    postbacks: [],
  };

  const postback = await tryFormPostbacks(page, jar, cs);
  diagnostics.postbacks = postback.attempts;
  if (hasAttendance(postback.attendance)) return { attendance: postback.attendance, source: postback.source, diagnostics };

  const sources = [{ url: page.url, text: page.text }];
  for (const url of urls) {
    try {
      const r = await request(url, jar, { headers: { Accept: 'application/javascript,text/javascript,*/*;q=0.8', Referer: page.url } });
      if (r.response.ok) {
        sources.push({ url, text: r.text });
        diagnostics.scripts.push({ path: new URL(url).pathname, size: r.text.length, signals: safeSnippets(r.text) });
      }
    } catch {
      diagnostics.scripts.push({ path: new URL(url).pathname, error: 'fetch_failed' });
    }
  }

  const methods = new Map();
  for (const s of sources) {
    for (const m of methodCandidates(s.text)) {
      const key = `${m.method}|${m.params.map((p) => p.name).join(',')}`;
      if (!methods.has(key)) methods.set(key, { ...m, source: s.url });
    }
  }
  const callable = [...methods.values()]
    .filter((m) => /attend|present|report|get|load|show|view|bind|fill|student|details|data/i.test(m.method))
    .slice(0, 30);
  diagnostics.methods = callable.map((m) => ({ name: m.method, params: m.params.map((p) => p.name), kind: m.sourceKind, source: new URL(m.source).pathname }));

  const proxies = urls.filter((u) => {
    try { return /\/ajax\/StudentAttendance,.*\.ashx/i.test(new URL(u).pathname); } catch { return false; }
  });
  if (!proxies.length) return { attendance: { items: [], total: null }, source: null, diagnostics };

  for (const m of callable) {
    const variants = argVariants(m, cs, rollNo);
    if (!variants.length) {
      diagnostics.attempts.push({ method: m.method, result: 'unresolved_params', params: m.params.map((p) => p.name) });
      continue;
    }
    for (const args of variants.slice(0, 4)) {
      for (const proxy of proxies) {
        for (const mode of ['header', 'query']) {
          try {
            const r = await invokeProxy(proxy, m.method, args, jar, page.url, mode);
            const a = attendanceFromResponse(r.text);
            diagnostics.attempts.push({ method: m.method, mode, status: r.response.status, size: r.text.length, found: hasAttendance(a), argCount: Object.keys(args).length });
            if (hasAttendance(a)) return { attendance: a, source: `ajax:${m.method}:${mode}`, diagnostics };
          } catch {
            diagnostics.attempts.push({ method: m.method, mode, result: 'request_error', argCount: Object.keys(args).length });
          }
        }
      }
    }
  }
  return { attendance: { items: [], total: null }, source: null, diagnostics };
}

function parseProfile(html, rollNo) {
  const rs = tableRows(html);
  const find = (labels) => {
    const wanted = labels.map((x) => x.toLowerCase());
    for (const row of rs) {
      for (let i = 0; i < row.length; i += 1) {
        const k = String(row[i] || '').replace(/\s*:\s*$/, '').trim().toLowerCase();
        if (wanted.includes(k)) {
          for (const v of row.slice(i + 1)) if (v && v !== ':') return v;
        }
      }
    }
    return '';
  };
  return {
    rollNo: find(['RollNo', 'Roll No', 'Hall Ticket No']) || rollNo,
    name: find(['Name', 'Student Name']),
    course: find(['Course']),
    branch: find(['Branch']),
    semester: find(['Semester', 'Sem']),
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const rollNo = String(req.body?.rollNo || '').trim().toUpperCase();
  const password = String(req.body?.password || '');
  if (!/^[A-Z0-9]{6,20}$/.test(rollNo) || !password || password.length > 128) {
    return res.status(400).json({ error: 'Enter a valid roll number and E-CAP password' });
  }
  try {
    const { jar, logged } = await loginEcap(rollNo, password);
    const page = await request(ATTENDANCE_URL, jar, { headers: { Referer: logged.url } });
    if (!page.response.ok || isLoginPage(page.text, page.url)) {
      return res.status(401).json({ error: 'E-CAP session expired before Attendance opened.' });
    }

    let attendance = parseAttendance(page.text);
    let source = hasAttendance(attendance) ? 'attendance_page' : null;
    let dynamic = null;
    if (!hasAttendance(attendance)) {
      const d = await resolveDynamic(page, jar, rollNo);
      dynamic = d.diagnostics;
      if (hasAttendance(d.attendance)) {
        attendance = d.attendance;
        source = d.source;
      }
    }

    let profile = { rollNo };
    try {
      const p = await request(PROFILE_URL, jar, { headers: { Referer: page.url } });
      profile = parseProfile(p.text, rollNo);
      if (!hasAttendance(attendance)) {
        const pa = parseAttendance(p.text);
        if (hasAttendance(pa)) {
          attendance = pa;
          source = 'profile_page';
        }
      }
    } catch {}

    if (profile.rollNo && profile.rollNo.toUpperCase() !== rollNo) {
      return res.status(403).json({ error: 'E-CAP account does not match your Student 360 roll number.' });
    }

    console.info('E-CAP attendance v6', JSON.stringify({ source: source || 'none', subjectCount: attendance.items.length, total: Boolean(attendance.total), dynamic }));
    if (!hasAttendance(attendance)) {
      return res.status(422).json({
        error: 'E-CAP login succeeded, but the attendance live report method/response could not be resolved yet.',
        stage: 'attendance_dynamic',
        reason: 'dynamic_mapping_pending_v6',
      });
    }
    return res.status(200).json({ success: true, source: 'ACET E-CAP', attendance, profile, syncedAt: new Date().toISOString() });
  } catch (error) {
    console.error('E-CAP attendance v6 failed', { message: error?.message || String(error) });
    return res.status(Number(error?.status) || 502).json({ error: error?.message || 'Unable to sync attendance from ACET E-CAP.' });
  }
}
