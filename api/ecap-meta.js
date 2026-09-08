const ECAP_ENTRY_URL = 'https://info.aec.edu.in/ACET/StudentMaster.aspx';
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
      inputs: inputs.map((attrs) => ({
        name: attrs.name || null,
        id: attrs.id || null,
        type: (attrs.type || 'text').toLowerCase(),
      })).filter((item) => item.name || item.id),
      selects: selects.map((attrs) => ({ name: attrs.name || null, id: attrs.id || null })),
      buttons: buttons.map((attrs) => ({ name: attrs.name || null, id: attrs.id || null, type: attrs.type || null })),
    };
  });
}

function inferCredentialFields(forms) {
  const allInputs = forms.flatMap((form) => form.inputs || []);
  const password = allInputs.find((input) => input.type === 'password') || null;
  const likelyUser = allInputs.find((input) => {
    const key = `${input.name || ''} ${input.id || ''}`.toLowerCase();
    return input.type !== 'hidden' && /user|login|roll|hall|htno|admission|regno|email/.test(key);
  }) || null;
  const submit = allInputs.find((input) => ['submit', 'button', 'image'].includes(input.type)) || null;
  return { user: likelyUser, password, submit };
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
      'User-Agent': 'Mozilla/5.0 Student-360/1.0',
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
      inferred: inferCredentialFields(forms),
    });
  } catch (error) {
    console.error('E-CAP metadata discovery failed:', error);
    return res.status(502).json({ error: 'Unable to inspect E-CAP login page' });
  }
}
