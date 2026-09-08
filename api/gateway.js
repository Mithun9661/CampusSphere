import proxyHandler from './proxy.js';

const SAFE_PROFILE_FIELDS = [
  'profile_pic',
  'first_name',
  'roll_no',
  'college',
  'branch',
  'passout_year',
  'role',
  'status',
  'block_status',
  'drop_status',
  'hold_status',
  'problems_count',
  'current_program',
  'technology',
  'section',
  'backlogs',
  'btech',
];

function sanitizeProfile(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  const safe = {};
  for (const key of SAFE_PROFILE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) safe[key] = payload[key];
  }
  return safe;
}

export default async function handler(req, res) {
  const rawPath = req.query.path;
  const targetPath = Array.isArray(rawPath) ? rawPath[0] : rawPath;

  if (targetPath?.startsWith('get-user-by-id/')) {
    const originalSend = res.send.bind(res);
    res.send = (body) => {
      let parsed = body;
      if (typeof body === 'string') {
        try { parsed = JSON.parse(body); } catch { return originalSend(body); }
      }
      return originalSend(sanitizeProfile(parsed));
    };
  }

  return proxyHandler(req, res);
}
