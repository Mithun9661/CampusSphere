import crypto from 'node:crypto';

const ECAP_ENTRY_URL = 'https://info.aec.edu.in/ACET/StudentMaster.aspx';
const ECAP_LOGIN_URL = 'https://info.aec.edu.in/acet/default.aspx';
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
  while ((match = re.exec(tag))) {
    attrs[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? '');
  }
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
    if (value) jar.set(name, value);
    else jar.delete(name);
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
  for (const match of html.matchAll(/<input\b[^>]*>/gi)) {
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

function portalFailureReason(html) {
  const plain = text(html).toLowerCase();
  if (/invalid[^.]{0,40}(password|user|login|credential)|wrong[^.]{0,30}(password|user)/i.test(plain)) return 'invalid_credentials';
  if (/locked|blocked|disabled/i.test(plain)) return 'account_locked';
  if (/captcha|verification code/i.test(plain)) return 'verification_required';
  if (/user name|password/i.test(plain)) return 'login_form_returned';
  return 'login_not_accepted';
}

function parseRows(html) {
  const rows = [];
  for (const rowMatch of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [];
    for (const cellMatch of rowMatch[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)) cells.push(text(cellMatch[1]));
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function asNumber(value) {
  const cleaned = String(value ?? '').replace(/,/g, '').trim();
  if (!cleaned || !/^-?\d+(?:\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function findLabelValue(rows, label) {
  const target = label.toLowerCase();
  for (const row of rows) {
    for (let i = 0; i < row.length; i += 1) {
      if (row[i].trim().toLowerCase() === target) {
        const candidates = row.slice(i + 1).filter((v) => v && v !== ':');
        if (candidates.length) return candidates[0];
      }
    }
  }
  return '';
}

function parseCurrentAttendance(rows) {
  const items = [];
  let total = null;
  for (const row of rows) {
    if (row.length >= 5 && /^\d+$/.test(row[0]) && row[1]) {
      const held = asNumber(row[2]);
      const attended = asNumber(row[3]);
      const percentage = asNumber(row[4]);
      if (held !== null && attended !== null && percentage !== null) items.push({ subject: row[1], held, attended, percentage });
    }
    if (row[0]?.toUpperCase() === 'TOTAL' && row.length >= 4) {
      const held = asNumber(row[row.length - 3]);
      const attended = asNumber(row[row.length - 2]);
      const percentage = asNumber(row[row.length - 1]);
      if (held !== null && attended !== null && percentage !== null) total = { held, attended, percentage };
    }
  }
  return { items, total };
}

function parseSemesterResults(html) {
  const stopAt = html.search(/PREVIOUS\s+SEMESTERS\s+ATTENDANCE/i);
  const source = stopAt >= 0 ? html.slice(0, stopAt) : html;
  const semesters = [];
  const re = /<span\b[^>]*class\s*=\s*["'][^"']*reportHeading2[^"']*["'][^>]*>([\s\S]*?Semester[\s\S]*?)<\/span>\s*<table\b[^>]*>([\s\S]*?)<\/table>/gi;

  for (const match of source.matchAll(re)) {
    const label = text(match[1]);
    const rows = parseRows(match[2]);
    const header = rows.find((row) => row.some((cell) => cell.toUpperCase() === 'SGPA'));
    const gradeRow = rows.find((row) => row[0]?.toLowerCase() === 'grade');
    const creditRow = rows.find((row) => row[0]?.toLowerCase() === 'credits');
    if (!header || !gradeRow || !creditRow || header.length < 3) continue;

    const subjects = [];
    for (let i = 1; i < header.length - 1; i += 1) {
      if (!header[i]) continue;
      subjects.push({ subject: header[i], grade: gradeRow[i] || '', credits: asNumber(creditRow[i]) });
    }

    semesters.push({
      semester: label,
      sgpa: asNumber(gradeRow[gradeRow.length - 1]),
      credits: creditRow[creditRow.length - 1] || '',
      subjects,
    });
  }
  return semesters;
}

function parseAcademicProfile(html, expectedRollNo) {
  const rows = parseRows(html);
  const attendance = parseCurrentAttendance(rows);
  const semesters = parseSemesterResults(html);
  const plain = text(html);
  const cgpaMatch = plain.match(/CGPA\s*:\s*([0-9.]+)\s+Credits\s*:\s*([0-9.]+\s*\/\s*[0-9.]+)\s+([0-9.]+)\s*%/i);
  const rollNo = findLabelValue(rows, 'RollNo');

  if (expectedRollNo && rollNo && rollNo.toUpperCase() !== expectedRollNo.toUpperCase()) {
    throw new Error('E-CAP account does not match the signed-in Student-360 account');
  }

  return {
    profile: {
      rollNo,
      name: findLabelValue(rows, 'Name'),
      course: findLabelValue(rows, 'Course'),
      branch: findLabelValue(rows, 'Branch'),
      semester: findLabelValue(rows, 'Semester'),
    },
    cgpa: cgpaMatch ? asNumber(cgpaMatch[1]) : null,
    earnedCredits: cgpaMatch ? cgpaMatch[2].replace(/\s+/g, '') : '',
    percentage: cgpaMatch ? asNumber(cgpaMatch[3]) : null,
    semesters,
    attendance,
    currentSubjects: attendance.items.map((item) => item.subject),
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
    const loginPage = await requestWithSession(ECAP_ENTRY_URL, jar);
    const hidden = extractHiddenInputs(loginPage.html);
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
    form.set('imgBtn2.x', '58');
    form.set('imgBtn2.y', '31');

    const loginResult = await requestWithSession(ECAP_LOGIN_URL, jar, {
      method: 'POST',
      body: form.toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: 'https://info.aec.edu.in',
        Referer: loginPage.url,
      },
    });

    if (/\btxtPwd2\b/i.test(loginResult.html) && /default\.aspx/i.test(loginResult.url)) {
      const reason = portalFailureReason(loginResult.html);
      console.warn('E-CAP login not accepted', { stage: 'login', reason });
      return res.status(401).json({
        error: reason === 'account_locked'
          ? 'E-CAP account appears locked/blocked. Please verify on the official E-CAP portal.'
          : reason === 'verification_required'
            ? 'E-CAP is asking for additional verification. Open the official portal once and complete it.'
            : 'E-CAP did not accept this login. Please verify the same roll number/password on the official E-CAP portal.',
        stage: 'login',
        reason,
      });
    }

    const profileResult = await requestWithSession(ECAP_PROFILE_URL, jar, { headers: { Referer: loginResult.url } });

    if (/default\.aspx/i.test(profileResult.url) || !/PERFORMANCE|BIO-DATA|ATTENDANCE/i.test(profileResult.html)) {
      console.warn('E-CAP profile access not accepted', { stage: 'profile' });
      return res.status(401).json({ error: 'E-CAP login completed but the student profile could not be opened.', stage: 'profile' });
    }

    const academic = parseAcademicProfile(profileResult.html, rollNo);
    return res.status(200).json({ success: true, academic, syncedAt: new Date().toISOString() });
  } catch (error) {
    console.error('E-CAP academic sync failed:', error?.message || error);
    return res.status(502).json({ error: error?.message || 'Unable to sync E-CAP academic data' });
  }
}
