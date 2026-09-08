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

function controlContext(form, marker) {
  const index = form.toLowerCase().indexOf(marker.toLowerCase());
  if (index < 0) return null;
  return visibleText(form.slice(Math.max(0, index - 700), Math.min(form.length, index + 700))).slice(0, 650) || null;
}

function inspectForm(html) {
  const forms = [...html.matchAll(/<form\b[\s\S]*?<\/form>/gi)].map((m) => m[0]);
  return forms.map((form, index) => {
    const openTag = form.match(/<form\b[^>]*>/i)?.[0] || '';
    const formAttrs = parseAttributes(openTag);
    const inputs = [...form.matchAll(/<input\b[^>]*>/gi)].map((m) => parseAttributes(m[0]));
    const selects = [...form.matchAll(/<select\b[^>]*>/gi)].map((m) => parseAttributes(m[0]));
    const buttons = [...form.matchAll(/<button\b[^>]*>/gi)].map((m) => parseAttributes(m[0]));

    return {
      index,
      id: formAttrs.id || null,
      name: formAttrs.name || null,
      method: (formAttrs.method || 'GET').toUpperCase(),
      action: formAttrs.action || null,
      inputs: inputs.map((attrs) => {
        const type = (attrs.type || 'text').toLowerCase();
        const marker = attrs.id || attrs.name || '';
        return {
          name: attrs.name || null,
          id: attrs.id || null,
          type,
          ...(type === 'hidden' ? {
            hasValue: Boolean(attrs.value),
            valueLength: String(attrs.value || '').length,
          } : {
            title: attrs.title || null,
            alt: attrs.alt || null,
            onclick: attrs.onclick || null,
            onkeyup: attrs.onkeyup || null,
            onblur: attrs.onblur || null,
            tabindex: attrs.tabindex || null,
            context: marker ? controlContext(form, marker) : null,
          }),
        };
      }).filter((item) => item.name || item.id),
      selects: selects.map((attrs) => ({ name: attrs.name || null, id: attrs.id || null })),
      buttons: buttons.map((attrs) => ({ name: attrs.name || null, id: attrs.id || null, type: attrs.type || null, onclick: attrs.onclick || null })),
    };
  });
}

function scriptSnippets(html) {
  const scripts = [...html.matchAll(/<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const needles = ['login', 'student', 'password', 'username', 'roll', 'captcha', 'WebForm_DoPostBackWithOptions', '__doPostBack'];
  const snippets = [];
  for (const code of scripts) {
    const flat = code.replace(/\s+/g, ' ').trim();
    for (const needle of needles) {
      let from = 0;
      while (true) {
        const index = flat.toLowerCase().indexOf(needle.toLowerCase(), from);
        if (index < 0) break;
        snippets.push({ needle, snippet: flat.slice(Math.max(0, index - 220), Math.min(flat.length, index + 420)) });
        from = index + needle.length;
        if (snippets.length >= 40) return snippets;
      }
    }
  }
  return snippets;
}

function inspectScripts(html, baseUrl) {
  const external = [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*>/gi)]
    .map((m) => m[1] || m[2])
    .filter(Boolean)
    .map((src) => {
      try { return new URL(decodeHtml(src), baseUrl).toString(); } catch { return decodeHtml(src); }
    });

  return { external, snippets: scriptSnippets(html) };
}

function inferCredentialFields(forms) {
  const allInputs = forms.flatMap((form) => form.inputs || []);
  const password = allInputs.find((input) => input.type === 'password') || null;
  const user = allInputs.find((input) => {
    const key = `${input.name || ''} ${input.id || ''} ${input.context || ''}`.toLowerCase();
    return input.type !== 'hidden' && /student|user|login|roll|hall|htno|reg|email|id/.test(key);
  }) || null;
  const submit = allInputs.find((input) => ['submit', 'button', 'image'].includes(input.type)) || null;
  return { user, password, submit };
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

    return { response, finalUrl: url.toString(), hops };
  }

  throw new Error('Too many E-CAP redirects');
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { response, finalUrl, hops } = await fetchWithCookieRedirects(ECAP_ENTRY_URL);
    const html = await response.text();
    const forms = inspectForm(html);

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: response.ok,
      status: response.status,
      source: ECAP_ENTRY_URL,
      finalUrl,
      hops,
      forms,
      scripts: inspectScripts(html, finalUrl),
      inferred: inferCredentialFields(forms),
    });
  } catch (error) {
    console.error('E-CAP metadata discovery failed:', error);
    return res.status(502).json({ error: 'Unable to inspect E-CAP login page' });
  }
}
