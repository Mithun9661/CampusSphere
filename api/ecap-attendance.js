import crypto from 'node:crypto';

const ECAP_LOGIN_URL = 'https://info.aec.edu.in/acet/default.aspx';
const ECAP_ATTENDANCE_URL = 'https://info.aec.edu.in/acet/Academics/StudentAttendance.aspx?scrid=3&showtype=SA';
const ECAP_PROFILE_URL = 'https://info.aec.edu.in/acet/Academics/StudentProfile.aspx?scrid=17';
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
      Accept: 'text/html,application/xhtml+xml',
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
  if (!cleaned || !/^-?\d+(?:\.\d+)?$/.test(cleaned)) return null;
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

function parseAttendance(html) {
  const rows = parseRows(html);
  const items = [];
  let total = null;

  for (const row of rows) {
    const normalized = row.map((v) => String(v || '').trim());
    const first = normalized[0]?.toUpperCase();

    if (first === 'TOTAL' || first === 'TOTAL :') {
      const numbers = normalized.map(num).filter((v) => v !== null);
      if (numbers.length >= 3) {
        const [held, attended, percentage] = numbers.slice(-3);
        if (held >= 0 && attended >= 0 && percentage >= 0 && percentage <= 100) total = { held, attended, percentage };
      }
      continue;
    }

    const pctIndex = normalized.findIndex((cell) => {
      const value = num(cell);
      return value !== null && value >= 0 && value <= 100 && /%/.test(cell);
    });

    let subject = '';
    let held = null;
    let attended = null;
    let percentage = null;

    if (/^\d+$/.test(normalized[0] || '') && normalized.length >= 5) {
      subject = normalized[1] || '';
      held = num(normalized[2]);
      attended = num(normalized[3]);
      percentage = num(normalized[4]);
    } else if (pctIndex >= 2) {
      percentage = num(normalized[pctIndex]);
      attended = num(normalized[pctIndex - 1]);
      held = num(normalized[pctIndex - 2]);
      subject = normalized.slice(0, pctIndex - 2).filter(Boolean).join(' ').replace(/^\d+\s*/, '');
    }

    if (subject && held !== null && attended !== null && percentage !== null && held >= attended && percentage >= 0 && percentage <= 100) {
      const key = `${subject.toUpperCase()}|${held}|${attended}|${percentage}`;
      if (!items.some((x) => x._key === key)) items.push({ _key: key, subject, held, attended, percentage });
    }
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
        Origin: 'https://info.aec.edu.in',
        Referer: landing.url,
      },
    });

    if (isLoginPage(login.html, login.url)) {
      const reason = loginFailure(login.html);
      console.warn('Legacy E-CAP login not accepted', { stage: 'login', reason });
      return res.status(401).json({
        error: reason === 'account_locked'
          ? 'E-CAP account appears locked/blocked.'
          : 'E-CAP did not accept this Hall Ticket/password.',
        stage: 'login',
        reason,
      });
    }

    const attendancePage = await requestWithSession(ECAP_ATTENDANCE_URL, jar, { headers: { Referer: login.url } });
    if (isLoginPage(attendancePage.html, attendancePage.url)) {
      return res.status(401).json({ error: 'E-CAP session expired before attendance could be opened.', stage: 'attendance' });
    }

    const attendance = parseAttendance(attendancePage.html);
    let profile = { rollNo };
    try {
      const profilePage = await requestWithSession(ECAP_PROFILE_URL, jar, { headers: { Referer: attendancePage.url } });
      const rows = parseRows(profilePage.html);
      profile = {
        rollNo: findLabelValue(rows, 'RollNo') || rollNo,
        name: findLabelValue(rows, 'Name'),
        course: findLabelValue(rows, 'Course'),
        branch: findLabelValue(rows, 'Branch'),
        semester: findLabelValue(rows, 'Semester'),
      };
    } catch {}

    if (profile.rollNo && profile.rollNo.toUpperCase() !== rollNo) {
      return res.status(403).json({ error: 'E-CAP account does not match your Student 360 roll number.' });
    }

    console.info('Legacy E-CAP attendance sync', {
      stage: 'attendance',
      subjectCount: attendance.items.length,
      totalAvailable: Boolean(attendance.total),
    });

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
