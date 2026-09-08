const ECAP_URL = 'https://info.aec.edu.in/acet/default.aspx';
const MAX_REDIRECTS = 8;

function decodeHtml(value = '') {
  return String(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function parseAttributes(tag) {
  const attrs = {};
  const re = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match;
  while ((match = re.exec(tag))) attrs[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? '');
  return attrs;
}

function visibleText(html) {
  return decodeHtml(String(html || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
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

async function fetchWithRedirects(startUrl, jar) {
  let url = new URL(startUrl);
  const hops = [];
  for (let i = 0; i <= MAX_REDIRECTS; i += 1) {
    const headers = {
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
    };
    const cookies = cookieHeader(jar);
    if (cookies) headers.Cookie = cookies;
    const response = await fetch(url, { headers, redirect: 'manual' });
    updateCookieJar(jar, response.headers);
    const location = response.headers.get('location');
    hops.push({ status: response.status, path: `${url.pathname}${url.search}`, location: location ? new URL(location, url).pathname : null });
    if (response.status >= 300 && response.status < 400 && location) {
      const next = new URL(location, url);
      if (next.toString() === url.toString()) break;
      url = next;
      continue;
    }
    return { response, html: await response.text(), url: url.toString(), hops };
  }
  throw new Error('Too many legacy E-CAP redirects');
}

function inputs(html) {
  return [...String(html).matchAll(/<input\b[^>]*>/gi)].map((m) => {
    const a = parseAttributes(m[0]);
    return {
      name: a.name || null,
      id: a.id || null,
      type: (a.type || 'text').toLowerCase(),
      valueHint: (a.type || '').toLowerCase() === 'hidden' ? null : (a.value || null),
      onclick: a.onclick || null,
    };
  });
}

function buttons(html) {
  return [...String(html).matchAll(/<(?:input|button)\b[^>]*>/gi)]
    .map((m) => parseAttributes(m[0]))
    .filter((a) => ['submit', 'button', 'image'].includes((a.type || '').toLowerCase()) || a.onclick)
    .map((a) => ({ name: a.name || null, id: a.id || null, type: a.type || null, value: a.value || null, onclick: a.onclick || null }));
}

function scriptHints(html) {
  const scripts = [...String(html).matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join('\n');
  const flat = scripts.replace(/\s+/g, ' ');
  const needles = ['txtId', 'txtPwd', 'hdnpwd', 'imgBtn', 'encrypt', 'AES', 'student'];
  const out = [];
  for (const needle of needles) {
    const i = flat.toLowerCase().indexOf(needle.toLowerCase());
    if (i >= 0) out.push({ needle, snippet: flat.slice(Math.max(0, i - 180), Math.min(flat.length, i + 360)) });
  }
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const jar = new Map();
    const page = await fetchWithRedirects(ECAP_URL, jar);
    return res.status(200).json({
      ok: page.response.ok,
      status: page.response.status,
      source: ECAP_URL,
      finalPath: new URL(page.url).pathname,
      hops: page.hops,
      title: visibleText(page.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ''),
      inputs: inputs(page.html),
      buttons: buttons(page.html),
      textHints: visibleText(page.html).match(/.{0,70}(?:student|parent|hall ticket|roll|password|login).{0,100}/ig)?.slice(0, 12) || [],
      scriptHints: scriptHints(page.html),
    });
  } catch (error) {
    console.error('Legacy E-CAP metadata discovery failed:', error?.message || error);
    return res.status(502).json({ error: 'Unable to inspect legacy E-CAP login page' });
  }
}
