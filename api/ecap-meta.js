const ECAP_LOGIN_URL = 'https://info.aec.edu.in/ACET/StudentMaster.aspx';

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
    };
  });
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const response = await fetch(ECAP_LOGIN_URL, {
      redirect: 'manual',
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 Student-360/1.0',
      },
    });

    const html = await response.text();
    const forms = inspectForm(html);

    return res.status(200).json({
      ok: response.ok || (response.status >= 300 && response.status < 400),
      status: response.status,
      location: response.headers.get('location'),
      source: ECAP_LOGIN_URL,
      forms,
    });
  } catch (error) {
    console.error('E-CAP metadata discovery failed:', error);
    return res.status(502).json({ error: 'Unable to inspect E-CAP login page' });
  }
}
