import https from 'https';

export default async function handler(req, res) {
  // Allow cross-origin requests
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const targetPath = req.query.path;
  if (!targetPath) {
    return res.status(400).json({ error: 'Missing path parameter' });
  }

  // Aggregate coding platform profile stats through a server-side request so the
  // browser does not depend on third-party CORS behavior.
  if (targetPath === 'coding-stats') {
    return handleCodingStats(req, res);
  }

  // Handle result submission locally
  if (targetPath.startsWith('submit-result') || targetPath.startsWith('results/')) {
    return handleResultSubmission(req, res, targetPath);
  }

  const options = {
    hostname: 'api.maya.adityauniversity.in',
    port: 443,
    path: `/node/api/${targetPath}`,
    method: req.method,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Origin': 'https://maya.adityauniversity.in',
      'Referer': 'https://maya.adityauniversity.in/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  };

  return new Promise((resolve) => {
    const proxyReq = https.request(options, (proxyRes) => {
      let data = '';
      proxyRes.on('data', (chunk) => { data += chunk; });
      proxyRes.on('end', () => {
        res.status(proxyRes.statusCode);
        const contentType = proxyRes.headers['content-type'];
        if (contentType) res.setHeader('Content-Type', contentType);
        
        try {
          // If it's JSON, send as object, otherwise send as raw text/buffer
          if (contentType && contentType.includes('application/json')) {
            res.send(JSON.parse(data));
          } else {
            res.send(data);
          }
        } catch (e) {
          res.send(data);
        }
        resolve();
      });
    });

    proxyReq.on('error', (e) => {
      console.error(`Proxy error for ${targetPath}:`, e);
      res.status(500).json({ error: 'Proxy Request Failed', message: e.message });
      resolve();
    });

    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
      const bodyData = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      proxyReq.write(bodyData);
    }

    proxyReq.end();
  });
}

/**
 * Handle result submission from Electron app
 */
async function handleResultSubmission(req, res, targetPath) {
  try {
    if (req.method === 'POST' && targetPath === 'submit-result') {
      // Import the result submission function dynamically
      const { submitExamResult } = await import('../scripts/importResults.js');

      const resultData = req.body;
      if (!resultData) {
        return res.status(400).json({ error: 'Missing result data' });
      }

      const result = await submitExamResult(resultData);

      if (result.success) {
        return res.status(200).json({
          success: true,
          message: 'Result submitted successfully',
          resultId: result.resultId
        });
      } else {
        return res.status(500).json({
          success: false,
          error: result.error
        });
      }
    }

    if (req.method === 'GET' && targetPath.startsWith('results/student/')) {
      // Get results for a specific student
      const rollNo = targetPath.split('/')[2];
      const { getStudentResults } = await import('../scripts/importResults.js');

      const results = await getStudentResults(rollNo);
      return res.status(200).json({ success: true, results });
    }

    if (req.method === 'GET' && targetPath.startsWith('results/exam/')) {
      // Get results for a specific exam
      const examId = targetPath.split('/')[2];
      const { getExamResults } = await import('../scripts/importResults.js');

      const results = await getExamResults(examId);
      return res.status(200).json({ success: true, results });
    }

    return res.status(404).json({ error: 'Result endpoint not found' });

  } catch (error) {
    console.error('Result submission error:', error);
    return res.status(500).json({ error: 'Failed to process result', details: error.message });
  }
}


/**
 * Fetch public coding-platform statistics for connected usernames.
 * Uses one aggregation service so LeetCode, GFG, CodeChef and HackerRank
 * have a consistent response shape and failures stay isolated per profile.
 */
async function handleCodingStats(req, res) {
  try {
    const allowed = ['leetcode', 'gfg', 'codechef', 'hackerrank'];
    const params = new URLSearchParams();
    for (const key of allowed) {
      const raw = req.query?.[key];
      const value = Array.isArray(raw) ? raw[0] : raw;
      if (value && /^[a-zA-Z0-9_.@-]{1,80}$/.test(value)) params.set(key, value);
    }

    if ([...params.keys()].length === 0) {
      return res.status(400).json({ error: 'At least one coding profile username is required' });
    }

    const upstream = await fetch(`https://coding-profile-service.onrender.com/stats?${params.toString()}`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Student-360/1.0' }
    });

    if (!upstream.ok) {
      return res.status(502).json({ error: 'Coding profile provider unavailable', status: upstream.status });
    }

    const payload = await upstream.json();
    const profiles = Array.isArray(payload?.profiles) ? payload.profiles : [];
    const result = {};

    for (const profile of profiles) {
      const platform = String(profile?.platform || '').toLowerCase();
      if (platform === 'geeksforgeeks') result.gfg = profile;
      else if (allowed.includes(platform)) result[platform] = profile;
    }

    // Some deployments return keyed objects instead of a profiles array.
    for (const key of allowed) {
      if (!result[key] && payload?.[key] && typeof payload[key] === 'object') result[key] = payload[key];
    }
    if (!result.gfg && payload?.geeksforgeeks) result.gfg = payload.geeksforgeeks;

    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
    return res.status(200).json(result);
  } catch (error) {
    console.error('Coding stats proxy error:', error);
    return res.status(500).json({ error: 'Failed to fetch coding profile stats' });
  }
}
