const ECAP_LOGIN_URL = 'https://examsection.acet.ac.in/Login.aspx?ReturnUrl=%2F';
const PORTAL_ORIGIN = 'https://examsection.acet.ac.in';
const MAX_REDIRECTS = 8;
const MAX_DISCOVERY_PAGES = 28;
const MAX_DISCOVERY_DEPTH = 2;

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

  throw new Error('Too many Exam Section redirects');
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

function safePortalUrl(raw, baseUrl) {
  if (!raw || /^javascript:|^mailto:|^tel:/i.test(raw)) return null;
  let url;
  try { url = new URL(raw, baseUrl); } catch { return null; }
  if (url.origin !== PORTAL_ORIGIN) return null;
  if (/\.(?:css|js|png|jpe?g|gif|svg|ico|woff2?|ttf|map|zip|docx?|xlsx?|pptx?)$/i.test(url.pathname)) return null;
  const haystack = `${url.pathname}${url.search}`.toLowerCase();
  if (/(logout|signout|change.?password|forgot|payment|transaction|receipt|fee|apply|delete|remove|cancel)/i.test(haystack)) return null;
  url.hash = '';
  return url;
}

function extractNavigation(html, baseUrl) {
  const urls = [];
  const postbacks = [];
  const seenUrls = new Set();
  const seenPostbacks = new Set();

  for (const match of html.matchAll(/<(a|frame|iframe)\b[^>]*>(?:[\s\S]*?<\/a>)?/gi)) {
    const tagName = match[1].toLowerCase();
    const open = match[0].match(new RegExp(`<${tagName}\\b[^>]*>`, 'i'))?.[0] || match[0];
    const attrs = parseAttributes(open);
    const raw = tagName === 'a' ? attrs.href : attrs.src;
    const label = tagName === 'a' ? text(match[0]).slice(0, 120) : (attrs.title || attrs.name || attrs.id || tagName);

    const postbackMatch = String(raw || '').match(/__doPostBack\(['"]([^'"]+)['"]\s*,\s*['"]([^'"]*)['"]\)/i);
    if (postbackMatch) {
      const key = `${postbackMatch[1]}|${postbackMatch[2]}`;
      if (!seenPostbacks.has(key)) {
        seenPostbacks.add(key);
        postbacks.push({ target: postbackMatch[1], argument: postbackMatch[2], label });
      }
      continue;
    }

    const url = safePortalUrl(raw, baseUrl);
    if (!url) continue;
    const key = url.toString();
    if (seenUrls.has(key)) continue;
    seenUrls.add(key);
    urls.push({ url: key, label, source: tagName });
  }

  return { urls, postbacks };
}

function pageTitle(html) {
  const match = String(html).match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return match ? text(match[1]).slice(0, 120) : '';
}

function academicSignals(html, url) {
  const plain = text(html).slice(0, 120000);
  const haystack = `${url} ${pageTitle(html)} ${plain}`.toLowerCase();
  const keywords = ['result', 'marks', 'grade', 'semester', 'academic', 'exam', 'subject', 'memo', 'sgpa', 'cgpa', 'attendance', 'performance', 'course'];
  return keywords.filter((word) => haystack.includes(word));
}

function extractAcademicNumbers(html) {
  const plain = text(html);
  const cgpa = plain.match(/\bCGPA\b\s*[:=-]?\s*([0-9]+(?:\.[0-9]+)?)/i);
  const sgpa = [...plain.matchAll(/\bSGPA\b\s*[:=-]?\s*([0-9]+(?:\.[0-9]+)?)/gi)]
    .map((m) => Number(m[1]))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 10)
    .slice(0, 12);
  const percentage = plain.match(/\b(?:overall\s*)?(?:percentage|percent)\b\s*[:=-]?\s*([0-9]+(?:\.[0-9]+)?)\s*%?/i);
  return {
    cgpa: cgpa ? Number(cgpa[1]) : null,
    sgpa,
    percentage: percentage ? Number(percentage[1]) : null,
  };
}

function routeSummary(page) {
  const url = new URL(page.url);
  const signals = academicSignals(page.html, page.url);
  return {
    path: `${url.pathname}${url.search}`,
    title: pageTitle(page.html),
    signals,
    numbers: extractAcademicNumbers(page.html),
  };
}

async function discoverAuthenticatedPages(initialPage, jar) {
  const queue = [{ url: initialPage.url, html: initialPage.html, depth: 0, alreadyLoaded: true }];
  const visited = new Set();
  const summaries = [];

  while (queue.length && visited.size < MAX_DISCOVERY_PAGES) {
    const item = queue.shift();
    const normalized = new URL(item.url).toString();
    if (visited.has(normalized)) continue;
    visited.add(normalized);

    let page = { url: normalized, html: item.html || '' };
    if (!item.alreadyLoaded) {
      try {
        const fetched = await requestWithSession(normalized, jar, { headers: { Referer: initialPage.url } });
        if (!fetched.response.ok) continue;
        if (/Login\.aspx/i.test(fetched.url) && /\btxtPwd\b/i.test(fetched.html)) continue;
        page = fetched;
      } catch {
        continue;
      }
    }

    const summary = routeSummary(page);
    if (summary.signals.length) summaries.push(summary);

    if (item.depth >= MAX_DISCOVERY_DEPTH) continue;
    const nav = extractNavigation(page.html, page.url);

    for (const link of nav.urls) {
      if (visited.has(link.url)) continue;
      queue.push({ url: link.url, depth: item.depth + 1, alreadyLoaded: false });
    }

    for (const postback of nav.postbacks) {
      const hint = `${postback.label} ${postback.target}`.toLowerCase();
      if (!/(result|mark|grade|semester|academic|exam|subject|memo|sgpa|cgpa|attendance|performance|course)/.test(hint)) continue;
      try {
        const body = buildForm(extractHiddenInputs(page.html), {
          __EVENTTARGET: postback.target,
          __EVENTARGUMENT: postback.argument,
        });
        const postPage = await requestWithSession(page.url, jar, {
          method: 'POST',
          body,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Origin: PORTAL_ORIGIN,
            Referer: page.url,
          },
        });
        if (!/Login\.aspx/i.test(postPage.url)) {
          const postUrl = new URL(postPage.url).toString();
          if (!visited.has(postUrl)) queue.push({ url: postUrl, html: postPage.html, depth: item.depth + 1, alreadyLoaded: true });
        }
      } catch {}
    }
  }

  const deduped = [];
  const seen = new Set();
  for (const item of summaries) {
    const key = `${item.path}|${item.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped.slice(0, 24);
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
    return res.status(400).json({ error: 'Enter a valid roll number and Exam Section password' });
  }

  try {
    const jar = new Map();
    const landing = await requestWithSession(ECAP_LOGIN_URL, jar);

    const studentModeBody = buildForm(extractHiddenInputs(landing.html), {
      __EVENTTARGET: 'lnkStudent',
      __EVENTARGUMENT: '',
    });
    const studentPage = await requestWithSession(ECAP_LOGIN_URL, jar, {
      method: 'POST',
      body: studentModeBody,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: PORTAL_ORIGIN,
        Referer: landing.url,
      },
    });

    if (!/\btxtUserId\b/i.test(studentPage.html) || !/\btxtPwd\b/i.test(studentPage.html)) {
      return res.status(502).json({ error: 'Could not open the ACET Student Login form.', stage: 'student_form' });
    }

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
        Origin: PORTAL_ORIGIN,
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

    const routes = await discoverAuthenticatedPages(loginResult, jar);
    console.info('Exam section authenticated academic discovery', {
      stage: 'authenticated_discovery',
      finalPath: new URL(loginResult.url).pathname,
      routes,
    });

    const useful = routes.filter((item) => item.signals.some((signal) => ['result', 'marks', 'grade', 'semester', 'sgpa', 'cgpa', 'attendance', 'academic', 'performance'].includes(signal)));
    const withNumbers = useful.filter((item) => item.numbers.cgpa != null || item.numbers.sgpa.length || item.numbers.percentage != null);

    if (withNumbers.length) {
      return res.status(200).json({
        success: true,
        academic: {
          source: 'ACET Exam Section',
          rollNo,
          discoveredPages: useful,
          cgpa: withNumbers.find((item) => item.numbers.cgpa != null)?.numbers.cgpa ?? null,
          semester_cgpa: withNumbers.flatMap((item) => item.numbers.sgpa).slice(0, 12),
          percentage: withNumbers.find((item) => item.numbers.percentage != null)?.numbers.percentage ?? null,
          semesters: [],
          attendance: { items: [], total: null },
          currentSubjects: [],
          profile: { rollNo },
        },
        syncedAt: new Date().toISOString(),
        partial: true,
      });
    }

    return res.status(409).json({
      error: useful.length
        ? 'Exam Section login succeeded and academic pages were found. Student 360 is finalizing the page parser.'
        : 'Exam Section login succeeded, but no academic page was exposed through safe navigation discovery.',
      stage: 'authenticated_discovery',
      reason: useful.length ? 'parser_mapping' : 'no_academic_route_found',
    });
  } catch (error) {
    console.error('Exam section sync failed:', error?.message || error);
    return res.status(502).json({ error: 'Unable to connect to the ACET Exam Section portal.' });
  }
}
