import crypto from 'node:crypto';

const ECAP_LOGIN_URL = 'https://info.aec.edu.in/acet/default.aspx';
const ECAP_ATTENDANCE_URL = 'https://info.aec.edu.in/acet/Academics/StudentAttendance.aspx?scrid=3&showtype=SA';
const ECAP_PROFILE_URL = 'https://info.aec.edu.in/acet/Academics/StudentProfile.aspx?scrid=17';
const ECAP_ORIGIN = 'https://info.aec.edu.in';
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

function text(value = '') {
  return decodeHtml(String(value)
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function parseAttributes(tag) {
  const attrs = {};
  const re = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match;
  while ((match = re.exec(tag))) attrs[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? '');
  return attrs;
}

function getSetCookieHeaders(headers) {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const raw = headers.get('set-cookie');
  return raw ? raw.split(/,(?=\s*[^;,=]+=[^;,]*)/g) : [];
}

function updateCookieJar(jar, headers) {
  for (const cookie of getSetCookieHeaders(headers)) {
    const pair = String(cookie).split(';', 1)[0];
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (value) jar.set(name, value); else jar.delete(name);
  }
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

async function requestWithSession(url, jar, options = {}) {
  let currentUrl = new URL(url);
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

    const response = await fetch(currentUrl, { method, body, headers, redirect: 'manual' });
    updateCookieJar(jar, response.headers);
    const location = response.headers.get('location');

    if (response.status >= 300 && response.status < 400 && location) {
      currentUrl = new URL(location, currentUrl);
      if ([301, 302, 303].includes(response.status) && method !== 'GET') {
        method = 'GET';
        body = undefined;
      }
      continue;
    }

    return { response, url: currentUrl.toString(), html: await response.text() };
  }

  throw new Error('Too many E-CAP redirects');
}

function extractHiddenInputs(html) {
  const hidden = {};
  for (const match of String(html).matchAll(/<input\b[^>]*>/gi)) {
    const attrs = parseAttributes(match[0]);
    if ((attrs.type || '').toLowerCase() === 'hidden' && attrs.name) hidden[attrs.name] = attrs.value || '';
  }
  return hidden;
}

function encryptPassword(password) {
  const key = Buffer.from(AES_KEY, 'utf8');
  const cipher = crypto.createCipheriv('aes-128-cbc', key, key);
  return Buffer.concat([cipher.update(String(password), 'utf8'), cipher.final()]).toString('base64');
}

function parseRows(html) {
  const rows = [];
  for (const rowMatch of String(html).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [];
    for (const cellMatch of rowMatch[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)) {
      cells.push(text(cellMatch[1]));
    }
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function num(value) {
  const cleaned = String(value ?? '').replace(/,/g, '').replace(/%/g, '').trim();
  if (!cleaned || !/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function findLabelValue(rows, label) {
  const target = label.toLowerCase();
  for (const row of rows) {
    for (let i = 0; i < row.length; i += 1) {
      if (row[i].trim().toLowerCase() !== target) continue;
      for (const candidate of row.slice(i + 1)) {
        if (candidate && candidate !== ':') return candidate;
      }
    }
  }
  return '';
}

function presentPerformanceHtml(html) {
  const raw = String(html || '');
  const start = raw.search(/PERFORMANCE\s*\(\s*Present\s*\)/i);
  if (start < 0) return raw;
  const tail = raw.slice(start);
  const end = tail.search(/PERFORMANCE\s*\(\s*Past\s*\)/i);
  return end > 0 ? tail.slice(0, end) : tail;
}

function parseAttendance(html) {
  const rows = parseRows(presentPerformanceHtml(html));
  const items = [];
  let total = null;

  for (const row of rows) {
    const cells = row.map((value) => String(value || '').trim());
    const first = (cells[0] || '').toUpperCase().replace(/\s+/g, ' ');

    if (first === 'TOTAL' || first === 'TOTAL :') {
      const values = cells.map(num).filter((value) => value !== null);
      if (values.length >= 3) {
        const [held, attended, percentage] = values.slice(-3);
        if (held >= 0 && attended >= 0 && attended <= held && percentage >= 0 && percentage <= 100) {
          total = { held, attended, percentage };
        }
      }
      continue;
    }

    let subject = '';
    let held = null;
    let attended = null;
    let percentage = null;

    if (/^\d+$/.test(cells[0] || '') && cells.length >= 5) {
      subject = cells[1] || '';
      held = num(cells[2]);
      attended = num(cells[3]);
      percentage = num(cells[4]);
    } else {
      const numeric = cells.map((cell, index) => ({ index, value: num(cell) })).filter((item) => item.value !== null);
      if (numeric.length >= 3) {
        const [heldCell, attendedCell, pctCell] = numeric.slice(-3);
        if (heldCell.index < attendedCell.index && attendedCell.index < pctCell.index) {
          held = heldCell.value;
          attended = attendedCell.value;
          percentage = pctCell.value;
          subject = cells.slice(0, heldCell.index).filter(Boolean).join(' ').replace(/^\d+\s*/, '').trim();
        }
      }
    }

    if (!subject || held === null || attended === null || percentage === null) continue;
    if (/^(sl\.?\s*no|course|subject|held|attend|attendance|percentage|%)$/i.test(subject)) continue;
    if (held < 0 || attended < 0 || attended > held || percentage < 0 || percentage > 100) continue;

    const key = `${subject.toUpperCase()}|${held}|${attended}|${percentage}`;
    if (!items.some((item) => item._key === key)) items.push({ _key: key, subject, held, attended, percentage });
  }

  if (!total && items.length) {
    const held = items.reduce((sum, item) => sum + item.held, 0);
    const attended = items.reduce((sum, item) => sum + item.attended, 0);
    total = { held, attended, percentage: held ? Number(((attended / held) * 100).toFixed(2)) : 0 };
  }

  return { items: items.map(({ _key, ...item }) => item), total };
}

function isLoginPage(html, url) {
  return /default\.aspx/i.test(url) && /\btxtId2\b/i.test(html) && /\btxtPwd2\b/i.test(html);
}

function loginFailure(html) {
  const plain = text(html).toLowerCase();
  if (/invalid|incorrect|wrong|not valid/.test(plain) && /password|user|login|id/.test(plain)) return 'invalid_credentials';
  if (/locked|blocked|disabled/.test(plain)) return 'account_locked';
  return 'login_not_accepted';
}

function hasAttendance(attendance) {
  return Boolean(attendance?.total || attendance?.items?.length);
}

function safePortalUrl(raw, baseUrl) {
  if (!raw || /^javascript:|^mailto:|^tel:/i.test(raw)) return null;
  try {
    const url = new URL(decodeHtml(raw), baseUrl);
    if (url.origin !== ECAP_ORIGIN) return null;
    if (/(logout|signout|payment|receipt|transaction|delete|remove|update|edit|change.?password)/i.test(`${url.pathname}${url.search}`)) return null;
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

function extractCandidateUrls(html, baseUrl) {
  const result = [];
  const seen = new Set();
  const add = (raw) => {
    const url = safePortalUrl(raw, baseUrl);
    if (!url) return;
    const key = url.toString();
    if (seen.has(key)) return;
    const haystack = `${url.pathname}${url.search}`;
    if (!/(attendance|profile|report|studentmaster|academic|ajax|present|performance)/i.test(haystack)) return;
    seen.add(key);
    result.push(key);
  };

  for (const match of String(html).matchAll(/<(?:a|iframe|frame|script|form)\b[^>]*>/gi)) {
    const attrs = parseAttributes(match[0]);
    add(attrs.href || attrs.src || attrs.action || '');
  }
  for (const match of String(html).matchAll(/["']([^"']*(?:Attendance|Profile|Report|StudentMaster|Academic|ajax)[^"']*(?:\.aspx|\.ashx)(?:\?[^"']*)?)["']/gi)) {
    add(match[1]);
  }
  return result.slice(0, 16);
}

function extractSelectValues(html) {
  const values = {};
  const diagnostics = [];
  for (const match of String(html).matchAll(/<select\b[^>]*>([\s\S]*?)<\/select>/gi)) {
    const open = match[0].match(/<select\b[^>]*>/i)?.[0] || '';
    const attrs = parseAttributes(open);
    if (!attrs.name) continue;
    const options = [...match[1].matchAll(/<option\b[^>]*>([\s\S]*?)<\/option>/gi)].map((optionMatch) => {
      const optionOpen = optionMatch[0].match(/<option\b[^>]*>/i)?.[0] || '';
      const optionAttrs = parseAttributes(optionOpen);
      return {
        value: optionAttrs.value ?? text(optionMatch[1]),
        selected: /\sselected(?:\s|=|>)/i.test(optionOpen),
      };
    });
    const selected = options.find((option) => option.selected) || options.find((option) => option.value !== '') || options[0];
    if (selected) values[attrs.name] = selected.value;
    diagnostics.push({ name: attrs.name, optionCount: options.length, selectedPresent: Boolean(selected) });
  }
  return { values, diagnostics };
}

function extractReadOnlyButtons(html) {
  const buttons = [];
  for (const match of String(html).matchAll(/<(?:input|button)\b[^>]*>(?:[\s\S]*?<\/button>)?/gi)) {
    const open = match[0].match(/<(?:input|button)\b[^>]*>/i)?.[0] || match[0];
    const attrs = parseAttributes(open);
    const type = (attrs.type || '').toLowerCase();
    if (!attrs.name || !['submit', 'image', 'button'].includes(type)) continue;
    const label = `${attrs.value || ''} ${attrs.title || ''} ${text(match[0])}`.trim();
    const hint = `${attrs.name} ${attrs.id || ''} ${label}`;
    if (/(delete|remove|update|edit|save|pay|fee|logout|password)/i.test(hint)) continue;
    if (!/(show|view|display|search|attendance|report|submit|go|ok)/i.test(hint)) continue;
    buttons.push({ name: attrs.name, type, value: attrs.value || label || 'Submit' });
  }
  return buttons.slice(0, 5);
}

async function tryAttendancePostbacks(page, jar) {
  const hidden = extractHiddenInputs(page.html);
  const selects = extractSelectValues(page.html);
  const buttons = extractReadOnlyButtons(page.html);

  for (const button of buttons) {
    const form = new URLSearchParams();
    Object.entries(hidden).forEach(([key, value]) => form.set(key, value));
    Object.entries(selects.values).forEach(([key, value]) => form.set(key, value));
    form.set('__EVENTTARGET', '');
    form.set('__EVENTARGUMENT', '');
    if (button.type === 'image') {
      form.set(`${button.name}.x`, '40');
      form.set(`${button.name}.y`, '18');
    } else {
      form.set(button.name, button.value || 'Submit');
    }

    try {
      const posted = await requestWithSession(page.url, jar, {
        method: 'POST',
        body: form.toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Origin: ECAP_ORIGIN,
          Referer: page.url,
        },
      });
      if (isLoginPage(posted.html, posted.url)) continue;
      const attendance = parseAttendance(posted.html);
      if (hasAttendance(attendance)) return { attendance, source: `postback:${button.name}`, page: posted };
    } catch {}
  }

  return { attendance: { items: [], total: null }, source: null, diagnostics: { selects: selects.diagnostics, buttons: buttons.map((button) => button.name) } };
}

async function discoverAttendanceFromLinkedPages(seedPages, jar) {
  const queue = [];
  const visited = new Set();
  for (const page of seedPages) {
    for (const url of extractCandidateUrls(page.html, page.url)) queue.push({ url, referer: page.url });
  }

  const diagnostics = [];
  while (queue.length && visited.size < 14) {
    const item = queue.shift();
    if (visited.has(item.url)) continue;
    visited.add(item.url);
    try {
      const page = await requestWithSession(item.url, jar, { headers: { Referer: item.referer } });
      if (!page.response.ok || isLoginPage(page.html, page.url)) continue;
      const attendance = parseAttendance(page.html);
      diagnostics.push({ path: `${new URL(page.url).pathname}${new URL(page.url).search}`, size: page.html.length, hasAttendance: hasAttendance(attendance) });
      if (hasAttendance(attendance)) return { attendance, source: `linked:${new URL(page.url).pathname}`, diagnostics };
      if (/\.aspx(?:\?|$)/i.test(page.url)) {
        const postback = await tryAttendancePostbacks(page, jar);
        if (hasAttendance(postback.attendance)) return { attendance: postback.attendance, source: `${new URL(page.url).pathname}:${postback.source}`, diagnostics };
      }
      for (const next of extractCandidateUrls(page.html, page.url)) {
        if (!visited.has(next)) queue.push({ url: next, referer: page.url });
      }
    } catch {}
  }
  return { attendance: { items: [], total: null }, source: null, diagnostics };
}

function safePageDiagnostics(page) {
  const selects = extractSelectValues(page.html);
  const buttons = extractReadOnlyButtons(page.html);
  return {
    path: `${new URL(page.url).pathname}${new URL(page.url).search}`,
    status: page.response.status,
    size: page.html.length,
    tableCount: (page.html.match(/<table\b/gi) || []).length,
    attendanceWord: /attendance/i.test(text(page.html)),
    heldWord: /\bheld\b/i.test(text(page.html)),
    attendWord: /\battend(?:ed)?\b/i.test(text(page.html)),
    presentPerformance: /PERFORMANCE\s*\(\s*Present\s*\)/i.test(page.html),
    selects: selects.diagnostics,
    buttons: buttons.map((button) => button.name),
    candidates: extractCandidateUrls(page.html, page.url).map((url) => `${new URL(url).pathname}${new URL(url).search}`).slice(0, 10),
  };
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
    const jar = new Map();
    const landing = await requestWithSession(ECAP_LOGIN_URL, jar);
    if (!/\btxtId2\b/i.test(landing.html) || !/\btxtPwd2\b/i.test(landing.html)) {
      return res.status(502).json({ error: 'Could not open the E-CAP Student/Parent login form.' });
    }

    const hidden = extractHiddenInputs(landing.html);
    const encrypted = encryptPassword(password);
    const form = new URLSearchParams();
    Object.entries(hidden).forEach(([key, value]) => form.set(key, value));
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

    const login = await requestWithSession(ECAP_LOGIN_URL, jar, {
      method: 'POST',
      body: form.toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: ECAP_ORIGIN,
        Referer: landing.url,
      },
    });

    if (isLoginPage(login.html, login.url)) {
      const reason = loginFailure(login.html);
      console.warn('Legacy E-CAP login not accepted', { stage: 'login', reason });
      return res.status(401).json({
        error: reason === 'account_locked' ? 'E-CAP account appears locked/blocked.' : 'E-CAP did not accept this Hall Ticket/password.',
        stage: 'login',
        reason,
      });
    }

    const attendancePage = await requestWithSession(ECAP_ATTENDANCE_URL, jar, { headers: { Referer: login.url } });
    if (isLoginPage(attendancePage.html, attendancePage.url)) {
      return res.status(401).json({ error: 'E-CAP session expired before attendance could be opened.', stage: 'attendance' });
    }

    let attendance = parseAttendance(attendancePage.html);
    let source = hasAttendance(attendance) ? 'attendance_page' : null;

    if (!hasAttendance(attendance)) {
      const postback = await tryAttendancePostbacks(attendancePage, jar);
      if (hasAttendance(postback.attendance)) {
        attendance = postback.attendance;
        source = postback.source;
      }
    }

    let profile = { rollNo };
    let profilePage = null;
    if (!hasAttendance(attendance)) {
      try {
        profilePage = await requestWithSession(ECAP_PROFILE_URL, jar, { headers: { Referer: attendancePage.url } });
        const rows = parseRows(profilePage.html);
        profile = {
          rollNo: findLabelValue(rows, 'RollNo') || rollNo,
          name: findLabelValue(rows, 'Name'),
          course: findLabelValue(rows, 'Course'),
          branch: findLabelValue(rows, 'Branch'),
          semester: findLabelValue(rows, 'Semester'),
        };
        const profileAttendance = parseAttendance(profilePage.html);
        if (hasAttendance(profileAttendance)) {
          attendance = profileAttendance;
          source = 'profile_report';
        } else {
          const profilePostback = await tryAttendancePostbacks(profilePage, jar);
          if (hasAttendance(profilePostback.attendance)) {
            attendance = profilePostback.attendance;
            source = `profile:${profilePostback.source}`;
          }
        }
      } catch (error) {
        console.warn('Legacy E-CAP profile fallback unavailable', { message: error?.message || String(error) });
      }
    }

    if (profile.rollNo && profile.rollNo.toUpperCase() !== rollNo) {
      return res.status(403).json({ error: 'E-CAP account does not match your Student 360 roll number.' });
    }

    let linkedDiagnostics = [];
    if (!hasAttendance(attendance)) {
      const discovery = await discoverAttendanceFromLinkedPages([attendancePage, ...(profilePage ? [profilePage] : []), login], jar);
      linkedDiagnostics = discovery.diagnostics;
      if (hasAttendance(discovery.attendance)) {
        attendance = discovery.attendance;
        source = discovery.source;
      }
    }

    console.info('Legacy E-CAP attendance sync', {
      stage: 'attendance',
      source: source || 'none',
      subjectCount: attendance.items.length,
      totalAvailable: Boolean(attendance.total),
      attendancePage: safePageDiagnostics(attendancePage),
      profilePage: profilePage ? safePageDiagnostics(profilePage) : null,
      linkedDiagnostics,
    });

    if (!hasAttendance(attendance)) {
      return res.status(422).json({
        error: 'E-CAP login succeeded, but attendance is loaded through a separate dynamic report that Student 360 has not resolved yet.',
        stage: 'attendance_parse',
        reason: 'dynamic_attendance_not_resolved',
      });
    }

    return res.status(200).json({
      success: true,
      source: 'ACET E-CAP',
      attendance,
      profile,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Legacy E-CAP attendance sync failed:', error?.message || error);
    return res.status(502).json({ error: 'Unable to sync attendance from ACET E-CAP.' });
  }
}
