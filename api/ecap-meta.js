const ECAP_ENTRY_URL = 'https://info.aec.edu.in/ACET/StudentMaster.aspx';

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
    const buttons = [...form.matchAll(/<(?:button)\b[^>]*>/gi)].map((m) => parseAttributes(m[0]));

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

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const response = await fetch(ECAP_ENTRY_URL, {
      redirect: 'follow',
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 Student-360/1.0',
      },
    });

    const html = await response.text();
    const forms = inspectForm(html);

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: response.ok,
      status: response.status,
      source: ECAP_ENTRY_URL,
      finalUrl: response.url,
      forms,
      inferred: inferCredentialFields(forms),
    });
  } catch (error) {
    console.error('E-CAP metadata discovery failed:', error);
    return res.status(502).json({ error: 'Unable to inspect E-CAP login page' });
  }
}
