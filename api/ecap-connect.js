const ECAP_LOGIN_URL = 'https://examsection.acet.ac.in/Login.aspx?ReturnUrl=%2F';
const MAX_REDIRECTS = 8;

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
  for (const match of html.matchAll(/<input\b[^>]*>/gi)) {
    const attrs = parseAttributes(match[0]);
    if ((attrs.type || '').toLowerCase() === 'hidden' && attrs.name) hidden[attrs.name] = attrs.value || '';
  }
  return hidden;
}

function buildForm(hidden, values) {
  const form = new URLSearchParams();
  Object.entries(hidden).forEach(([key, value]) => form.set(key, value));
  Object.entries(values).forEach(([key, value]) => form.set(key, value));
  return form.toString();
}

function portalFailureReason(html) {
  const plain = text(html).toLowerCase();
  if (/invalid|incorrect|wrong|not valid|does not exist/.test(plain) && /user|password|login|credential|id/.test(plain)) return 'invalid_credentials';
  if (/locked|blocked|disabled/.test(plain)) return 'account_locked';
  if (/captcha|verification code|otp/.test(plain)) return 'verification_required';
  if (/student login/.test(plain) && /password/.test(plain)) return 'login_form_returned';
  return 'login_not_accepted';
}

function discoverAcademicLinks(html, baseUrl) {
  const links = [];
  const seen = new Set();
  for (const match of html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)) {
    const open = match[0].match(/<a\b[^>]*>/i)?.[0] || '';
    const attrs = parseAttributes(open);
    const label = text(match[0]);
    const href = attrs.href || '';
    if (!href || /^javascript:/i.test(href)) continue;
    let url;
    try { url = new URL(href, baseUrl); } catch { continue; }
    if (url.hostname !== 'examsection.acet.ac.in') continue;
    const haystack = `${label} ${url.pathname} ${url.search}`.toLowerCase();
    if (!/(result|marks|grade|semester|academic|student|profile|memo|sgpa|cgpa|attendance)/.test(haystack)) continue;
    const key = `${label}|${url.pathname}${url.search}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ label: label.slice(0, 80), path: `${url.pathname}${url.search}` });
  }
  return links.slice(0, 20);
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

    // Step 1: open portal login page.
    const landing = await requestWithSession(ECAP_LOGIN_URL, jar);

    // Step 2: switch the ASP.NET login page to Student Login.
    const studentModeBody = buildForm(extractHiddenInputs(landing.html), {
      __EVENTTARGET: 'lnkStudent',
      __EVENTARGUMENT: '',
    });
    const studentPage = await requestWithSession(ECAP_LOGIN_URL, jar, {
      method: 'POST',
      body: studentModeBody,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: 'https://examsection.acet.ac.in',
        Referer: landing.url,
      },
    });

    if (!/\btxtUserId\b/i.test(studentPage.html) || !/\btxtPwd\b/i.test(studentPage.html)) {
      console.warn('Exam section student form unavailable', { stage: 'student_form' });
      return res.status(502).json({ error: 'Could not open the ACET Student Login form.', stage: 'student_form' });
    }

    // Step 3: submit the exact student form. Password is only kept in memory for this request.
    const loginBody = buildForm(extractHiddenInputs(studentPage.html), {
      __EVENTTARGET: '',
      __EVENTARGUMENT: '',
      txtUserId: rollNo,
      txtPwd: password,
      btnLogin: 'Login',
    });
    const loginResult = await requestWithSession(ECAP_LOGIN_URL, jar, {
      method: 'POST',
      body: loginBody,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: 'https://examsection.acet.ac.in',
        Referer: studentPage.url,
      },
    });

    const stillLogin = /\btxtUserId\b/i.test(loginResult.html) && /\btxtPwd\b/i.test(loginResult.html);
    if (stillLogin) {
      const reason = portalFailureReason(loginResult.html);
      console.warn('Exam section login not accepted', { stage: 'login', reason });
      return res.status(401).json({
        error: reason === 'account_locked'
          ? 'Exam Section account appears locked/blocked.'
          : reason === 'verification_required'
            ? 'Exam Section is asking for additional verification.'
            : 'Exam Section did not accept this UserID/password.',
        stage: 'login',
        reason,
      });
    }

    const links = discoverAcademicLinks(loginResult.html, loginResult.url);
    console.info('Exam section login accepted', {
      stage: 'authenticated',
      finalPath: new URL(loginResult.url).pathname,
      academicLinks: links,
    });

    return res.status(409).json({
      error: 'Exam Section login succeeded. Student 360 is mapping the authenticated academic pages now.',
      stage: 'authenticated',
      reason: 'academic_route_discovery',
    });
  } catch (error) {
    console.error('Exam section sync failed:', error?.message || error);
    return res.status(502).json({ error: 'Unable to connect to the ACET Exam Section portal.' });
  }
}
