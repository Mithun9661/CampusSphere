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

  // The original Maya coding-profile endpoints were removed. The legacy Profile
  // component can still call them while the live wrapper is mounted, so stop those
  // calls here instead of forwarding them upstream and generating repeated 404s.
  const removedCodingEndpoints = new Set([
    'get-leetcode-details-by-rollno',
    'get-geeksforgeeks-details-by-rollno',
    'get-codechef-details-by-rollno',
    'get-hackerrank-details-by-rollno',
  ]);
  if (removedCodingEndpoints.has(targetPath)) {
    return res.status(200).json({});
  }

  // Fetch the four public coding profiles through our server-side aggregator.
  if (targetPath === 'coding-profiles') {
    return handleCodingProfiles(req, res);
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
 * Fetch public coding-platform statistics for linked student profiles.
 * Supported query params: leetcode, gfg, codechef, hackerrank.
 */
async function handleCodingProfiles(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supported = ['leetcode', 'gfg', 'codechef', 'hackerrank'];
  const params = new URLSearchParams();
  const requested = {};

  for (const platform of supported) {
    const rawValue = Array.isArray(req.query?.[platform]) ? req.query[platform][0] : req.query?.[platform];
    const username = String(rawValue || '').trim().replace(/^@/, '');
    if (!username) continue;
    if (!/^[A-Za-z0-9_.-]{1,64}$/.test(username)) {
      return res.status(400).json({ error: `Invalid ${platform} username` });
    }
    requested[platform] = username;
    params.set(platform, username);
  }

  if (Object.keys(requested).length === 0) {
    return res.status(400).json({ error: 'At least one coding profile username is required' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);

  try {
    const upstreamUrl = `https://coding-profile-service.onrender.com/stats?${params.toString()}`;
    const response = await fetch(upstreamUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Student-360/1.0',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error('Coding profile provider error:', response.status, text.slice(0, 300));
      return res.status(502).json({ error: 'Coding profile provider is temporarily unavailable' });
    }

    const data = await response.json();
    const profiles = Array.isArray(data?.profiles) ? data.profiles : [];
    const filteredProfiles = profiles.filter((profile) => {
      const platform = String(profile?.platform || '').toLowerCase();
      return supported.includes(platform) && requested[platform];
    });

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=1800');
    return res.status(200).json({
      success: true,
      profiles: filteredProfiles,
      requested: Object.keys(requested),
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      return res.status(504).json({ error: 'Coding profile provider timed out' });
    }
    console.error('Coding profile fetch failed:', error);
    return res.status(502).json({ error: 'Failed to fetch coding profile stats' });
  } finally {
    clearTimeout(timeout);
  }
}
