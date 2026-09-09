import crypto from 'node:crypto';

const ORIGIN = 'https://info.aec.edu.in';
const BASE = `${ORIGIN}/acet/`;
const LOGIN_URL = `${BASE}Default.aspx?ReturnUrl=%2facet%2fhamlog`;
const ATTENDANCE_URL = `${BASE}Academics/StudentAttendance.aspx?scrid=3&showtype=SA`;
const PROFILE_URL = `${BASE}Academics/StudentProfile.aspx?scrid=17`;
const AES_KEY = '8701661282118308';

function decodeHtml(value = '') {
  return String(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function text(value = '') {
  return decodeHtml(String(value)
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function attrs(tag = '') {
  const out = {};
  for (const match of String(tag).matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    out[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? '');
  }
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
    if (value) jar.set(key, value);
    else jar.delete(key);
  }
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function httpRequest(url, jar, options = {}) {
  let current = new URL(url);
  let method = options.method || 'GET';
  let body = options.body;
  for (let i = 0; i < 9; i += 1) {
    const headers = {
      Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152 Safari/537.36',
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
    return { response, url: current.toString(), body: await response.text() };
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
  const first = await httpRequest(LOGIN_URL, jar);
  if (!/\btxtId2\b/i.test(first.body) || !/\btxtPwd2\b/i.test(first.body)) {
    throw Object.assign(new Error('Could not open E-CAP Student/Parent login form.'), { status: 502 });
  }
  const encrypted = encryptPassword(password);
  const form = new URLSearchParams();
  Object.entries(hiddenInputs(first.body)).forEach(([k, v]) => form.set(k, v));
  const fields = {
    txtId1: '', txtPwd1: '', txtId2: rollNo, txtPwd2: encrypted,
    txtId3: '', txtPwd3: '', TextBox1: '',
    hdnpwd1: '', hdnpwd2: encrypted, hdnpwd3: '',
    'imgBtn2.x': '48', 'imgBtn2.y': '20',
  };
  Object.entries(fields).forEach(([k, v]) => form.set(k, v));
  const logged = await httpRequest(LOGIN_URL, jar, {
    method: 'POST',
    body: form.toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: ORIGIN, Referer: first.url },
  });
  if (isLoginPage(logged.body, logged.url)) {
    throw Object.assign(new Error('E-CAP did not accept this Hall Ticket/password.'), { status: 401 });
  }
  return { jar, logged };
}

function tableRows(html) {
  const rows = [];
  for (const tr of String(html).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...tr[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => text(m[1]));
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function num(value) {
  const s = String(value ?? '').replace(/,/g, '').replace(/%/g, '').trim();
  if (!s || !/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function validTriple(held, attended, percentage) {
  return held !== null && attended !== null && percentage !== null
    && held >= 0 && attended >= 0 && attended <= held
    && percentage >= 0 && percentage <= 100;
}

function finalizeAttendance(items, total = null) {
  const unique = [];
  for (const item of items || []) {
    const key = `${String(item.subject).toUpperCase()}|${item.held}|${item.attended}|${item.percentage}`;
    if (!unique.some((x) => x._key === key)) unique.push({ ...item, _key: key });
  }
  if (!total && unique.length) {
    const held = unique.reduce((sum, x) => sum + x.held, 0);
    const attended = unique.reduce((sum, x) => sum + x.attended, 0);
    total = { held, attended, percentage: held ? Number(((attended / held) * 100).toFixed(2)) : 0 };
  }
  return { items: unique.map(({ _key, ...x }) => x), total };
}

function parseAttendanceHtml(html) {
  const rows = tableRows(html);
  const items = [];
  let total = null;

  for (let i = 0; i < rows.length; i += 1) {
    const header = rows[i].map((v) => String(v || '').trim());
    if (/^subject$/i.test(header[0] || '') && header.length >= 3) {
      const heldRow = rows.slice(i + 1, i + 8).find((r) => /^held$/i.test(String(r[0] || '').trim()));
      const attendedRow = rows.slice(i + 1, i + 9).find((r) => /^attend(?:ed)?$/i.test(String(r[0] || '').trim()));
      const pctRow = rows.slice(i + 1, i + 10).find((r) => /^%$|^percentage$/i.test(String(r[0] || '').trim()));
      if (heldRow && attendedRow && pctRow) {
        for (let c = 1; c < header.length; c += 1) {
          const subject = header[c];
          const held = num(heldRow[c]);
          const attended = num(attendedRow[c]);
          const percentage = num(pctRow[c]);
          if (/^total$/i.test(subject || '')) {
            if (validTriple(held, attended, percentage)) total = { held, attended, percentage };
          } else if (subject && validTriple(held, attended, percentage)) {
            items.push({ subject, held, attended, percentage });
          }
        }
      }
    }
  }

  for (const row0 of rows) {
    const row = row0.map((v) => String(v || '').trim());
    if (/^total\s*:?$/i.test(row[0] || '')) {
      const values = row.map(num).filter((v) => v !== null);
      if (values.length >= 3) {
        const [held, attended, percentage] = values.slice(-3);
        if (validTriple(held, attended, percentage)) total = { held, attended, percentage };
      }
      continue;
    }
    if (/^\d+$/.test(row[0] || '') && row.length >= 5) {
      const subject = row[1];
      const held = num(row[2]);
      const attended = num(row[3]);
      const percentage = num(row[4]);
      if (subject && validTriple(held, attended, percentage)) items.push({ subject, held, attended, percentage });
      continue;
    }
    const numeric = row.map((cell, index) => ({ index, value: num(cell) })).filter((x) => x.value !== null);
    if (numeric.length >= 3) {
      const [h, a, p] = numeric.slice(-3);
      if (h.index < a.index && a.index < p.index && validTriple(h.value, a.value, p.value)) {
        const subject = row.slice(0, h.index).filter(Boolean).join(' ').replace(/^\d+\s*/, '').trim();
        if (subject && !/^(subject|held|attend|attendance|percentage|%)$/i.test(subject)) {
          items.push({ subject, held: h.value, attended: a.value, percentage: p.value });
        }
      }
    }
  }

  return finalizeAttendance(items, total);
}

function structuredAttendance(root) {
  const items = [];
  let total = null;

  function walk(node, depth = 0) {
    if (depth > 10 || node == null) return;
    if (Array.isArray(node)) {
      if (node.length >= 4 && typeof node[0] === 'string') {
        const held = num(node[node.length - 3]);
        const attended = num(node[node.length - 2]);
        const percentage = num(node[node.length - 1]);
        if (validTriple(held, attended, percentage)) {
          const subject = String(node[0]).trim();
          if (/^total$/i.test(subject)) total = { held, attended, percentage };
          else if (subject) items.push({ subject, held, attended, percentage });
        }
      }
      node.forEach((x) => walk(x, depth + 1));
      return;
    }
    if (typeof node !== 'object') return;

    const normalized = {};
    for (const [key, value] of Object.entries(node)) normalized[key.toLowerCase().replace(/[^a-z0-9]/g, '')] = value;
    const subject = normalized.subject ?? normalized.subjectname ?? normalized.coursename ?? normalized.course ?? normalized.subname ?? normalized.subcode;
    const held = num(normalized.held ?? normalized.classesheld ?? normalized.conducted ?? normalized.totalclasses ?? normalized.totalperiods);
    const attended = num(normalized.attended ?? normalized.attend ?? normalized.present ?? normalized.classesattended ?? normalized.presentperiods);
    let percentage = num(normalized.percentage ?? normalized.percent ?? normalized.attendancepercentage ?? normalized.attendancepercent ?? normalized.pct);
    if (percentage === null && held !== null && attended !== null && held > 0) percentage = Number(((attended / held) * 100).toFixed(2));
    if (subject && validTriple(held, attended, percentage)) {
      if (/^total$/i.test(String(subject))) total = { held, attended, percentage };
      else items.push({ subject: String(subject), held, attended, percentage });
    }
    Object.values(node).forEach((x) => walk(x, depth + 1));
  }

  walk(root);
  return finalizeAttendance(items, total);
}

function jsUnescape(value = '') {
  let out = String(value).trim();
  if ((out.startsWith("'") && out.endsWith("'")) || (out.startsWith('"') && out.endsWith('"'))) out = out.slice(1, -1);
  return out
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\\//g, '/')
    .replace(/\\\\/g, '\\');
}

function hasAttendance(value) {
  return Boolean(value?.total || value?.items?.length);
}

function attendanceFromResponse(raw) {
  const candidates = [String(raw || ''), decodeHtml(String(raw || '')), jsUnescape(raw)];
  try {
    const parsed = JSON.parse(raw);
    const structured = structuredAttendance(parsed);
    if (hasAttendance(structured)) return structured;
    const stack = [parsed];
    while (stack.length && candidates.length < 120) {
      const value = stack.pop();
      if (typeof value === 'string') candidates.push(value, jsUnescape(value));
      else if (Array.isArray(value)) stack.push(...value);
      else if (value && typeof value === 'object') stack.push(...Object.values(value));
    }
  } catch {}
  for (const candidate of candidates) {
    const parsed = parseAttendanceHtml(candidate);
    if (hasAttendance(parsed)) return parsed;
  }
  return { items: [], total: null };
}

function controls(html) {
  const out = [];
  for (const match of String(html).matchAll(/<(select|input)\b[^>]*>([\s\S]*?<\/select>)?/gi)) {
    const tag = match[0].match(/<(?:select|input)\b[^>]*>/i)?.[0] || match[0];
    const a = attrs(tag);
    if (!a.name && !a.id) continue;
    let value = a.value ?? '';
    if (/^<select/i.test(match[0])) {
      const options = [...match[0].matchAll(/<option\b[^>]*>([\s\S]*?)<\/option>/gi)].map((o) => {
        const oa = attrs(o[0].match(/<option\b[^>]*>/i)?.[0] || '');
        return { value: oa.value ?? text(o[1]), selected: /\sselected(?:\s|=|>)/i.test(o[0]) };
      });
      value = (options.find((x) => x.selected) || options.find((x) => x.value !== '') || options[0] || {}).value ?? '';
    }
    out.push({
      name: a.name || '', id: a.id || '', value,
      type: (a.type || '').toLowerCase(),
      checked: /\schecked(?:\s|=|>)/i.test(tag),
    });
  }
  return out;
}

function controlValue(list, regex) {
  const item = list.find((x) => regex.test(`${x.name} ${x.id}`));
  return item?.value ?? null;
}

function baseValues(list, rollNo) {
  return {
    rollNo,
    year: controlValue(list, /(ddlyear|acyear|academic|acad|year)/i) || '',
    fromDate: controlValue(list, /(fromdate|startdate|datefrom)/i) || '',
    toDate: controlValue(list, /(todate|enddate|dateto)/i) || '',
    type: controlValue(list, /(hdntype|showtype|mode|type)/i) || 'SA',
    exclude: list.find((x) => /(exclude|chkexclude)/i.test(`${x.name} ${x.id}`))?.checked ? 'true' : 'false',
  };
}

function scriptUrls(html, baseUrl) {
  const urls = new Set();
  for (const match of String(html).matchAll(/<script\b[^>]*>/gi)) {
    const a = attrs(match[0]);
    if (!a.src) continue;
    try {
      const url = new URL(a.src, baseUrl);
      if (url.origin === ORIGIN && (/\/ajax\/.*\.ashx/i.test(url.pathname) || /StudentAttendance|AjaxMethods|common/i.test(url.pathname))) urls.add(url.toString());
    } catch {}
  }
  for (const match of String(html).matchAll(/["']([^"']*\/ajax\/StudentAttendance,[^"']+\.ashx(?:\?[^"']*)?)["']/gi)) {
    try {
      const url = new URL(decodeHtml(match[1]), baseUrl);
      if (url.origin === ORIGIN) urls.add(url.toString());
    } catch {}
  }
  return [...urls];
}

function safeMethod(name) {
  return Boolean(name)
    && !/^(?:url|constructor|tostring|valueof|invoke|request)$/i.test(name)
    && !/(save|update|delete|insert|remove|add|edit|pay|fee|receipt|transaction|password|logout|change|upload|submit)/i.test(name);
}

function balancedBody(source, braceIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let i = braceIndex; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(braceIndex + 1, i);
    }
  }
  return source.slice(braceIndex + 1);
}

function cleanFormalParams(raw = '') {
  return String(raw).split(',').map((x) => x.trim()).filter(Boolean)
    .filter((x) => !/^(?:callback|context|onSuccess|onFailure|onFailed|onError|cb|async)$/i.test(x));
}

function extractPayload(body, params) {
  const payload = [];
  const add = (key, variable) => {
    if (!key || !variable) return;
    if (!payload.some((x) => x.key === key)) payload.push({ key, variable });
  };
  for (const match of String(body).matchAll(/["']([A-Za-z_$][\w$]*)=["']\s*\+\s*(?:enc|encodeURIComponent)\(\s*([A-Za-z_$][\w$]*)\s*\)/g)) add(match[1], match[2]);
  for (const match of String(body).matchAll(/["']([A-Za-z_$][\w$]*)=["']\s*\+\s*([A-Za-z_$][\w$]*)/g)) add(match[1], match[2]);
  if (!payload.length) params.forEach((p) => add(p, p));
  return payload;
}

function proxyMethods(js) {
  const source = String(js || '');
  const found = new Map();
  const add = (method, session = 'r', params = [], body = '') => {
    if (!safeMethod(method)) return;
    const payload = extractPayload(body, params);
    const key = `${method}|${session}|${payload.map((p) => p.key).join(',')}`;
    if (!found.has(key)) found.set(key, { method, session, payload });
  };

  const declarations = [
    /(?:^|[,{;]\s*)["']?([A-Za-z_$][\w$]*)["']?\s*:\s*function\s*\(([^)]*)\)\s*\{/gm,
    /(?:StudentAttendance(?:_class)?\.)?([A-Za-z_$][\w$]*)\s*=\s*function\s*\(([^)]*)\)\s*\{/g,
    /function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/g,
  ];

  for (const regex of declarations) {
    for (const match of source.matchAll(regex)) {
      const name = match[1];
      if (!safeMethod(name)) continue;
      const brace = (match.index || 0) + match[0].lastIndexOf('{');
      const body = balancedBody(source, brace);
      const q = body.match(/[?&]_method=([A-Za-z_$][\w$]*)&_session=([A-Za-z]+)/i);
      const requestName = body.match(/new\s+AjaxPro\.Request\s*\(\s*["']([^"']+)["']/i)?.[1]
        || body.match(/AjaxPro\.(?:Request|request)\s*\(\s*["']([^"']+)["']/i)?.[1];
      add(q?.[1] || requestName || name, q?.[2] || 'r', cleanFormalParams(match[2]), body);
    }
  }

  for (const match of source.matchAll(/[?&]_method=([A-Za-z_$][\w$]*)&_session=([A-Za-z]+)/gi)) add(match[1], match[2], [], '');
  for (const match of source.matchAll(/new\s+AjaxPro\.Request\s*\(\s*["']([^"']+)["']/gi)) add(match[1], 'r', [], '');

  return [...found.values()];
}

function pageCallMethods(html) {
  const out = [];
  for (const match of String(html).matchAll(/StudentAttendance\.([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/g)) {
    if (!safeMethod(match[1])) continue;
    const args = String(match[2]).split(',').map((x) => x.trim()).filter(Boolean)
      .filter((x) => !/^(?:callback|context|onSuccess|onFailure|onError)$/i.test(x));
    out.push({ method: match[1], session: 'r', payload: args.map((arg, i) => ({ key: `arg${i + 1}`, variable: arg })) });
  }
  return out;
}

function mapValue(key, variable, values) {
  const hint = `${key} ${variable}`.toLowerCase();
  if (/(roll|regno|hall|htno|studentno|userid|user_id)/i.test(hint)) return values.rollNo;
  if (/(year|acad|acyear|ddlyear)/i.test(hint)) return values.year;
  if (/(fromdate|datefrom|startdate|from)/i.test(hint)) return values.fromDate;
  if (/(todate|dateto|enddate|to)/i.test(hint)) return values.toDate;
  if (/(exclude|chk)/i.test(hint)) return values.exclude;
  if (/(showtype|hdntype|mode|type)/i.test(hint)) return values.type;
  if (/scrid/i.test(hint)) return '3';
  return '';
}

function candidatePayloads(method, values) {
  if (!method.payload.length) return [{}];
  const named = {};
  method.payload.forEach((p) => { named[p.key] = mapValue(p.key, p.variable, values); });
  const variants = [named];

  if (method.payload.every((p) => /^arg\d+$/i.test(p.key))) {
    const sequences = [
      [values.year, values.fromDate, values.toDate, values.exclude, values.type, values.rollNo],
      [values.year, values.fromDate, values.toDate, values.type, values.exclude, values.rollNo],
      [values.year, values.fromDate, values.toDate, values.type],
      [values.year, values.fromDate, values.toDate, values.exclude],
      [values.year, values.rollNo],
      [values.rollNo, values.year, values.fromDate, values.toDate, values.type],
    ];
    for (const sequence of sequences) {
      const payload = {};
      method.payload.forEach((p, i) => { payload[p.key] = sequence[i] ?? ''; });
      if (!variants.some((x) => JSON.stringify(x) === JSON.stringify(payload))) variants.push(payload);
    }
  }
  return variants.slice(0, 8);
}

async function invokeLegacy(proxyUrl, method, payload, jar, referer, mode) {
  const url = new URL(proxyUrl);
  url.search = '';
  url.searchParams.set('_method', method.method);
  url.searchParams.set('_session', method.session || 'r');

  let body;
  const headers = { Accept: '*/*', 'X-Requested-With': 'XMLHttpRequest', Origin: ORIGIN, Referer: referer };
  if (mode === 'json') {
    body = JSON.stringify(payload);
    headers['Content-Type'] = 'text/plain; charset=UTF-8';
    headers['X-AjaxPro-Method'] = method.method;
  } else {
    const encoded = mode === 'legacy-encoded';
    body = Object.entries(payload).map(([k, v]) => `${k}=${encoded ? encodeURIComponent(String(v ?? '')) : String(v ?? '')}`).join('\r\n');
    headers['Content-Type'] = 'text/plain; charset=UTF-8';
  }
  return httpRequest(url.toString(), jar, { method: 'POST', body, headers });
}

function safeProxyHints(source) {
  const identifiers = new Set();
  for (const match of String(source).matchAll(/["']?([A-Za-z_$][\w$]*)["']?\s*:\s*function\b/g)) identifiers.add(match[1]);
  for (const match of String(source).matchAll(/([A-Za-z_$][\w$]*)\s*=\s*function\b/g)) identifiers.add(match[1]);
  for (const match of String(source).matchAll(/[?&]_method=([A-Za-z_$][\w$]*)/g)) identifiers.add(match[1]);
  for (const match of String(source).matchAll(/new\s+AjaxPro\.Request\s*\(\s*["']([^"']+)["']/g)) identifiers.add(match[1]);
  return [...identifiers].filter(safeMethod).slice(0, 20);
}

async function resolveDynamic(page, jar, rollNo) {
  const list = controls(page.body);
  const values = baseValues(list, rollNo);
  const urls = scriptUrls(page.body, page.url);
  const diagnostics = { scripts: [], methods: [], attempts: [], pageMethods: [] };
  const methods = [];

  for (const url of urls) {
    try {
      const result = await httpRequest(url, jar, { headers: { Accept: 'application/javascript,text/javascript,*/*;q=0.8', Referer: page.url } });
      if (!result.response.ok) continue;
      const parsed = proxyMethods(result.body);
      diagnostics.scripts.push({ path: new URL(url).pathname, size: result.body.length, count: parsed.length, hints: safeProxyHints(result.body) });
      parsed.forEach((m) => methods.push({ ...m, url }));
    } catch {
      diagnostics.scripts.push({ path: new URL(url).pathname, error: 'fetch_failed' });
    }
  }

  const pageMethods = pageCallMethods(page.body);
  diagnostics.pageMethods = pageMethods.map((m) => ({ name: m.method, argCount: m.payload.length })).slice(0, 20);
  const attendanceProxy = urls.find((url) => /\/ajax\/StudentAttendance,.*\.ashx/i.test(new URL(url).pathname));
  if (attendanceProxy) pageMethods.forEach((m) => methods.push({ ...m, url: attendanceProxy }));

  const unique = [];
  for (const method of methods) {
    const key = `${method.url}|${method.method}|${method.session}|${method.payload.map((p) => p.key).join(',')}`;
    if (!unique.some((x) => x._key === key)) unique.push({ ...method, _key: key });
  }
  unique.sort((a, b) => Number(!/attend|present|report|get|load|show|view|data|detail/i.test(a.method)) - Number(!/attend|present|report|get|load|show|view|data|detail/i.test(b.method)));
  diagnostics.methods = unique.slice(0, 25).map((m) => ({ name: m.method, session: m.session, params: m.payload.map((p) => p.key) }));

  for (const method of unique.slice(0, 16)) {
    for (const payload of candidatePayloads(method, values)) {
      for (const mode of ['legacy-encoded', 'legacy-raw', 'json']) {
        try {
          const result = await invokeLegacy(method.url, method, payload, jar, page.url, mode);
          const attendance = attendanceFromResponse(result.body);
          diagnostics.attempts.push({ method: method.method, mode, status: result.response.status, size: result.body.length, found: hasAttendance(attendance), argCount: Object.keys(payload).length });
          if (hasAttendance(attendance)) return { attendance, source: `ajax:${method.method}`, diagnostics };
        } catch {
          diagnostics.attempts.push({ method: method.method, mode, result: 'request_error', argCount: Object.keys(payload).length });
        }
      }
    }
  }
  return { attendance: { items: [], total: null }, source: null, diagnostics };
}

async function tryPostback(page, jar) {
  const form = new URLSearchParams();
  Object.entries(hiddenInputs(page.body)).forEach(([k, v]) => form.set(k, v));
  for (const control of controls(page.body)) {
    if (control.name && !['button', 'submit', 'image'].includes(control.type)) form.set(control.name, control.value || '');
  }
  form.set('__EVENTTARGET', '');
  form.set('__EVENTARGUMENT', '');
  form.set('btnShow', 'Show');
  form.set('ctl00$CapPlaceHolder$btnShow', 'Show');
  try {
    const result = await httpRequest(ATTENDANCE_URL, jar, {
      method: 'POST',
      body: form.toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: ORIGIN, Referer: page.url },
    });
    return attendanceFromResponse(result.body);
  } catch {
    return { items: [], total: null };
  }
}

function parseProfile(html, rollNo) {
  const rows = tableRows(html);
  const find = (labels) => {
    const wanted = labels.map((x) => x.toLowerCase());
    for (const row of rows) {
      for (let i = 0; i < row.length; i += 1) {
        const key = String(row[i] || '').replace(/\s*:\s*$/, '').trim().toLowerCase();
        if (wanted.includes(key)) {
          for (const value of row.slice(i + 1)) if (value && value !== ':') return value;
        }
      }
    }
    return '';
  };
  return {
    rollNo: find(['rollno', 'roll no', 'hall ticket no']) || rollNo,
    name: find(['name', 'student name']),
    course: find(['course']),
    branch: find(['branch']),
    semester: find(['semester', 'sem']),
  };
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });

  const rollNo = String(request.body?.rollNo || '').trim().toUpperCase();
  const password = String(request.body?.password || '');
  if (!/^[A-Z0-9]{6,20}$/.test(rollNo) || !password || password.length > 128) {
    return response.status(400).json({ error: 'Enter a valid roll number and E-CAP password' });
  }

  try {
    const { jar, logged } = await loginEcap(rollNo, password);
    const page = await httpRequest(ATTENDANCE_URL, jar, { headers: { Referer: logged.url } });
    if (!page.response.ok || isLoginPage(page.body, page.url)) {
      return response.status(401).json({ error: 'E-CAP session expired before Attendance opened.' });
    }

    let attendance = attendanceFromResponse(page.body);
    let source = hasAttendance(attendance) ? 'attendance_page' : null;
    let diagnostics = null;

    if (!hasAttendance(attendance)) {
      const dynamic = await resolveDynamic(page, jar, rollNo);
      diagnostics = dynamic.diagnostics;
      if (hasAttendance(dynamic.attendance)) {
        attendance = dynamic.attendance;
        source = dynamic.source;
      }
    }

    if (!hasAttendance(attendance)) {
      const postback = await tryPostback(page, jar);
      if (hasAttendance(postback)) {
        attendance = postback;
        source = 'attendance_postback';
      }
    }

    let profile = { rollNo };
    try {
      const profilePage = await httpRequest(PROFILE_URL, jar, { headers: { Referer: page.url } });
      profile = parseProfile(profilePage.body, rollNo);
      if (!hasAttendance(attendance)) {
        const profileAttendance = attendanceFromResponse(profilePage.body);
        if (hasAttendance(profileAttendance)) {
          attendance = profileAttendance;
          source = 'profile_page';
        }
      }
    } catch {}

    if (profile.rollNo && profile.rollNo.toUpperCase() !== rollNo) {
      return response.status(403).json({ error: 'E-CAP account does not match your Student 360 roll number.' });
    }

    console.info('E-CAP attendance v8', JSON.stringify({
      source: source || 'none',
      subjectCount: attendance.items.length,
      total: Boolean(attendance.total),
      diagnostics,
    }));

    if (!hasAttendance(attendance)) {
      return response.status(422).json({
        error: 'E-CAP login succeeded, but the live attendance response could not be decoded yet.',
        stage: 'attendance_dynamic',
        reason: 'legacy_ajax_mapping_pending_v8',
      });
    }

    return response.status(200).json({
      success: true,
      source: 'ACET E-CAP',
      attendance,
      profile,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('E-CAP attendance v8 failed', { message: error?.message || String(error) });
    return response.status(Number(error?.status) || 502).json({ error: error?.message || 'Unable to sync attendance from ACET E-CAP.' });
  }
}
