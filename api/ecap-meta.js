const ECAP_ENTRY_URL = 'https://examsection.acet.ac.in/Login.aspx?ReturnUrl=%2F';
const MAX_REDIRECTS = 8;

function decodeHtml(value = '') {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
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

function visibleText(html) {
  return decodeHtml(String(html || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function safeInput(attrs) {
  const type = (attrs.type || 'text').toLowerCase();
  return {
    name: attrs.name || null,
    id: attrs.id || null,
    type,
    className: attrs.class || null,
    placeholder: attrs.placeholder || null,
    title: attrs.title || null,
    autocomplete: attrs.autocomplete || null,
    onclick: attrs.onclick || null,
  };
}

function inspectForms(html) {
  return [...html.matchAll(/<form\b[\s\S]*?<\/form>/gi)].map((m, index) => {
    const form = m[0];
    const formAttrs = parseAttributes(form.match(/<form\b[^>]*>/i)?.[0] || '');
    return {
      index,
      id: formAttrs.id || null,
      name: formAttrs.name || null,
      method: (formAttrs.method || 'GET').toUpperCase(),
      action: formAttrs.action || null,
      inputs: [...form.matchAll(/<input\b[^>]*>/gi)].map((x) => safeInput(parseAttributes(x[0]))),
      buttons: [...form.matchAll(/<button\b[^>]*>/gi)].map((x) => {
        const a = parseAttributes(x[0]);
        return { name: a.name || null, id: a.id || null, type: a.type || null, className: a.class || null, onclick: a.onclick || null };
      }),
    };
  });
}

function inspectPageInputs(html) {
  return [...html.matchAll(/<input\b[^>]*>/gi)].map((m) => safeInput(parseAttributes(m[0])));
}

function inspectLinks(html, baseUrl) {
  return [...html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)].map((m) => {
    const open = m[0].match(/<a\b[^>]*>/i)?.[0] || '';
    const attrs = parseAttributes(open);
    let href = attrs.href || null;
    if (href && !/^javascript:/i.test(href)) {
      try { href = new URL(href, baseUrl).toString(); } catch {}
    }
    return { text: visibleText(m[0]).slice(0, 120), href, id: attrs.id || null, className: attrs.class || null, onclick: attrs.onclick || null };
  }).filter((item) => item.text || item.href || item.onclick);
}

function snippets(code) {
  const needles = ['login', 'student', 'password', 'username', 'roll', 'captcha', 'postback', 'ajax'];
  const flat = String(code || '').replace(/\s+/g, ' ').trim();
  const out = [];
  for (const needle of needles) {
    let from = 0;
    while (true) {
      const index = flat.toLowerCase().indexOf(needle, from);
      if (index < 0) break;
      out.push({ needle, snippet: flat.slice(Math.max(0, index - 220), Math.min(flat.length, index + 420)) });
      from = index + needle.length;
      if (out.length >= 40) return out;
    }
  }
  return out;
}

function externalScriptUrls(html, baseUrl) {
  return [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*>/gi)]
    .map((m) => m[1] || m[2])
    .filter(Boolean)
    .map((src) => {
      try { return new URL(decodeHtml(src), baseUrl).toString(); } catch { return decodeHtml(src); }
    });
}

function getSetCookieHeaders(headers) {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const raw = headers.get('set-cookie');
  if (!raw) return [];
  return raw.split(/,(?=\s*[^;,=]+=[^;,]*)/g);
}

function updateCookieJar(jar, setCookieHeaders) {
  for (const cookie of setCookieHeaders) {
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

async function fetchWithCookieRedirects(startUrl) {
  const jar = new Map();
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
    const response = await fetch(url, { redirect: 'manual', headers });
    updateCookieJar(jar, getSetCookieHeaders(response.headers));
    const location = response.headers.get('location');
    hops.push({ status: response.status, url: url.toString(), location: location || null });
    if (response.status >= 300 && response.status < 400 && location) {
      url = new URL(location, url);
      continue;
    }
    return { response, finalUrl: url.toString(), hops, jar };
  }
  throw new Error('Too many E-CAP redirects');
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { response, finalUrl, hops, jar } = await fetchWithCookieRedirects(ECAP_ENTRY_URL);
    const html = await response.text();
    const external = externalScriptUrls(html, finalUrl);
    const externalSnippets = [];
    for (const url of external.slice(0, 8)) {
      try {
        const headers = { 'User-Agent': 'Mozilla/5.0 Student-360/1.0' };
        const cookies = cookieHeader(jar);
        if (cookies) headers.Cookie = cookies;
        const scriptResponse = await fetch(url, { headers });
        if (!scriptResponse.ok) continue;
        const code = await scriptResponse.text();
        const found = snippets(code);
        if (found.length) externalSnippets.push({ url, snippets: found });
      } catch {}
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: response.ok,
      status: response.status,
      source: ECAP_ENTRY_URL,
      finalUrl,
      hops,
      title: html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) ? visibleText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)[1]) : '',
      forms: inspectForms(html),
      pageInputs: inspectPageInputs(html),
      links: inspectLinks(html, finalUrl),
      scripts: {
        external,
        inline: snippets([...html.matchAll(/<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join('\n')),
        externalSnippets,
      },
    });
  } catch (error) {
    console.error('E-CAP metadata discovery failed:', error);
    return res.status(502).json({ error: 'Unable to inspect E-CAP login page' });
  }
}
