import https from 'https';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const rawTargetPath = req.query.path;
  const targetPath = Array.isArray(rawTargetPath) ? rawTargetPath[0] : rawTargetPath;
  if (!targetPath) return res.status(400).json({ error: 'Missing path parameter' });

  // The old Maya coding endpoints now return 404. Keep them harmless because the
  // legacy profile component can still request them while the new live cards load.
  const retiredCodingEndpoints = new Set([
    'get-leetcode-details-by-rollno',
    'get-geeksforgeeks-details-by-rollno',
    'get-codechef-details-by-rollno',
    'get-hackerrank-details-by-rollno',
  ]);
  if (retiredCodingEndpoints.has(targetPath)) return res.status(200).json({});

  // Keep both names during rollout so already-built clients do not break.
  if (targetPath === 'coding-profiles' || targetPath === 'coding-stats') {
    return handleCodingProfiles(req, res);
  }

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
          if (contentType && contentType.includes('application/json')) res.send(JSON.parse(data));
          else res.send(data);
        } catch {
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

async function handleResultSubmission(req, res, targetPath) {
  try {
    if (req.method === 'POST' && targetPath === 'submit-result') {
      const { submitExamResult } = await import('../scripts/importResults.js');
      const resultData = req.body;
      if (!resultData) return res.status(400).json({ error: 'Missing result data' });

      const result = await submitExamResult(resultData);
      if (result.success) {
        return res.status(200).json({ success: true, message: 'Result submitted successfully', resultId: result.resultId });
      }
      return res.status(500).json({ success: false, error: result.error });
    }

    if (req.method === 'GET' && targetPath.startsWith('results/student/')) {
      const rollNo = targetPath.split('/')[2];
      const { getStudentResults } = await import('../scripts/importResults.js');
      const results = await getStudentResults(rollNo);
      return res.status(200).json({ success: true, results });
    }

    if (req.method === 'GET' && targetPath.startsWith('results/exam/')) {
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

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function validHandle(value) {
  const username = String(value || '').trim().replace(/^@/, '');
  return /^[A-Za-z0-9_.-]{1,64}$/.test(username) ? username : '';
}

async function fetchJson(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Student-360/1.0',
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchLeetCodeProfile(username) {
  const query = `
    query student360PublicProfile($username: String!) {
      matchedUser(username: $username) {
        submitStats {
          acSubmissionNum { difficulty count submissions }
        }
        profile { ranking reputation solutionCount }
      }
      userContestRanking(username: $username) {
        rating
        attendedContestsCount
        globalRanking
      }
    }
  `;

  try {
    const payload = await fetchJson('https://leetcode.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Referer: 'https://leetcode.com/',
        Origin: 'https://leetcode.com',
      },
      body: JSON.stringify({ query, variables: { username } }),
    });

    const matchedUser = payload?.data?.matchedUser;
    if (!matchedUser) throw new Error('LeetCode user not found');
    const counts = matchedUser.submitStats?.acSubmissionNum || [];
    const countFor = (difficulty) => Number(counts.find((item) => item.difficulty === difficulty)?.count || 0);
    const contest = payload?.data?.userContestRanking;

    return {
      platform: 'leetcode',
      username,
      totalSolved: countFor('All'),
      easySolved: countFor('Easy'),
      mediumSolved: countFor('Medium'),
      hardSolved: countFor('Hard'),
      globalRank: contest?.globalRanking || matchedUser.profile?.ranking || null,
      rating: contest?.rating ? Math.round(contest.rating) : null,
      contestsParticipated: Number(contest?.attendedContestsCount || 0),
    };
  } catch (primaryError) {
    // Fresh no-auth fallback used only if LeetCode blocks the serverless GraphQL request.
    const [statsPayload, contestPayload] = await Promise.all([
      fetchJson(`https://leetcode-stats.tashif.codes/${encodeURIComponent(username)}/stats`),
      fetchJson(`https://leetcode-stats.tashif.codes/${encodeURIComponent(username)}/contests`).catch(() => null),
    ]);
    const stats = statsPayload?.data || statsPayload || {};
    const contests = contestPayload?.data || contestPayload || {};
    if (!statsPayload || statsPayload?.status === 'error') throw primaryError;
    return {
      platform: 'leetcode',
      username,
      totalSolved: Number(stats.totalSolved || 0),
      easySolved: Number(stats.byDifficulty?.easy || 0),
      mediumSolved: Number(stats.byDifficulty?.medium || 0),
      hardSolved: Number(stats.byDifficulty?.hard || 0),
      globalRank: contests.globalRanking || null,
      rating: contests.rating || null,
      contestsParticipated: Number(contests.count || 0),
    };
  }
}

async function fetchGfgProfile(username) {
  try {
    const [statsPayload, heatmapPayload] = await Promise.all([
      fetchJson(`https://gfg-stats.tashif.codes/${encodeURIComponent(username)}/stats`),
      fetchJson(`https://gfg-stats.tashif.codes/${encodeURIComponent(username)}/heatmap`).catch(() => null),
    ]);
    const stats = statsPayload?.data || statsPayload || {};
    const heatmap = heatmapPayload?.data || heatmapPayload || {};
    if (!statsPayload || statsPayload?.status === 'error') throw new Error('GFG user not found');
    return {
      platform: 'gfg',
      username,
      totalSolved: Number(stats.totalSolved || 0),
      easySolved: Number(stats.byDifficulty?.easy || 0),
      mediumSolved: Number(stats.byDifficulty?.medium || 0),
      hardSolved: Number(stats.byDifficulty?.hard || 0),
      streak: Number(heatmap.currentStreak || 0),
    };
  } catch (primaryError) {
    // GeeksForGeeks' public practice endpoint is a structured-data fallback.
    const payload = await fetchJson('https://practiceapi.geeksforgeeks.org/api/v1/user/problems/submissions/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle: username }),
    });
    if (payload?.status !== 'success' || !payload?.result) throw primaryError;
    const result = payload.result;
    const size = (key) => result[key] ? Object.keys(result[key]).length : 0;
    return {
      platform: 'gfg',
      username,
      totalSolved: Number(payload.count || (size('School') + size('Basic') + size('Easy') + size('Medium') + size('Hard'))),
      easySolved: size('Easy'),
      mediumSolved: size('Medium'),
      hardSolved: size('Hard'),
      streak: 0,
    };
  }
}

function normalizeCodeChefProfile(username, payload, ratingPayload) {
  const profile = payload?.profile || payload?.data?.profile || payload?.data || payload || {};
  const history = ratingPayload?.ratingData || ratingPayload?.data?.ratingData || ratingPayload?.data?.history || ratingPayload?.history || [];
  return {
    platform: 'codechef',
    username,
    rating: Number(profile.currentRating ?? profile.rating ?? 0),
    maxRating: Number(profile.highestRating ?? profile.maxRating ?? 0),
    totalSolved: Number(profile.totalSolved ?? profile.totalProblems ?? 0),
    contestsParticipated: Array.isArray(history) ? history.length : Number(profile.contests || 0),
    globalRank: profile.globalRank || null,
    countryRank: profile.countryRank || null,
    stars: profile.stars || 0,
  };
}

async function fetchCodeChefProfile(username) {
  try {
    const [profilePayload, ratingPayload] = await Promise.all([
      fetchJson(`https://codechef-stats.tashif.codes/profile/${encodeURIComponent(username)}`),
      fetchJson(`https://codechef-stats.tashif.codes/rating/${encodeURIComponent(username)}`).catch(() => null),
    ]);
    if (profilePayload?.success === false || profilePayload?.status === 'error') throw new Error('CodeChef user not found');
    return normalizeCodeChefProfile(username, profilePayload, ratingPayload);
  } catch (primaryError) {
    // Lightweight HTML fallback; no browser-side scraping and no extra dependency.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`https://www.codechef.com/users/${encodeURIComponent(username)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 Student-360/1.0', Accept: 'text/html' },
        signal: controller.signal,
      });
      if (!response.ok) throw primaryError;
      const html = await response.text();
      const currentRating = html.match(/class=["'][^"']*rating-number[^"']*["'][^>]*>\s*([^<]+)/i)?.[1]?.replace(/[^0-9.]/g, '') || '0';
      const highestRating = html.match(/Highest\s+Rating[^0-9]*(\d+)/i)?.[1] || '0';
      const totalSolved = html.match(/Total\s+Problems\s+Solved[^0-9]*(\d+)/i)?.[1] || '0';
      const contests = html.match(/Contests\s*\((\d+)\)/i)?.[1] || '0';
      const ranks = [...html.matchAll(/rating-ranks[\s\S]{0,1600}?<strong[^>]*>\s*([0-9,]+)\s*<\/strong>/gi)].map((m) => m[1].replace(/,/g, ''));
      return {
        platform: 'codechef',
        username,
        rating: Number(currentRating || 0),
        maxRating: Number(highestRating || 0),
        totalSolved: Number(totalSolved || 0),
        contestsParticipated: Number(contests || 0),
        globalRank: ranks[0] || null,
        countryRank: ranks[1] || null,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

async function fetchHackerRankProfile(username) {
  try {
    const [statsPayload, badgesPayload, profilePayload] = await Promise.all([
      fetchJson(`https://hackerrank-stats.tashif.codes/${encodeURIComponent(username)}`),
      fetchJson(`https://hackerrank-stats.tashif.codes/${encodeURIComponent(username)}/badges`).catch(() => null),
      fetchJson(`https://hackerrank-stats.tashif.codes/${encodeURIComponent(username)}/profile`).catch(() => null),
    ]);
    const stats = statsPayload?.data || statsPayload || {};
    const badgesData = badgesPayload?.data || badgesPayload || {};
    const profile = profilePayload?.data || profilePayload || {};
    if (!statsPayload || statsPayload?.status === 'error') throw new Error('HackerRank user not found');
    const badges = badgesData.list || badgesData.badges || profile.badges || [];
    const certifications = profile.certifications || profile.certificates || [];
    return {
      platform: 'hackerrank',
      username,
      totalSolved: Number(stats.totalSolved || 0),
      ranking: stats.ranking || null,
      practiceScore: stats.practiceScore ?? null,
      reputation: Number(stats.reputation || 0),
      badges: Array.isArray(badges) ? badges : Number(badgesData.count || badges || 0),
      certifications: Array.isArray(certifications) ? certifications.length : Number(certifications || 0),
    };
  } catch (primaryError) {
    // Direct HackerRank public REST fallback for the most useful public fields.
    const [profilePayload, badgesPayload, scoresPayload] = await Promise.all([
      fetchJson(`https://www.hackerrank.com/rest/contests/master/hackers/${encodeURIComponent(username)}/profile`),
      fetchJson(`https://www.hackerrank.com/rest/hackers/${encodeURIComponent(username)}/badges`).catch(() => null),
      fetchJson(`https://www.hackerrank.com/rest/hackers/${encodeURIComponent(username)}/scores_elo`).catch(() => null),
    ]);
    const model = profilePayload?.model || profilePayload?.data || profilePayload || {};
    if (!model || profilePayload?.status === false) throw primaryError;
    const badges = badgesPayload?.models || badgesPayload?.badges || [];
    const scoreModels = scoresPayload?.models || scoresPayload?.data || [];
    const practiceScore = Array.isArray(scoreModels)
      ? scoreModels.reduce((sum, item) => sum + Number(item?.practice?.score || item?.score || 0), 0)
      : 0;
    return {
      platform: 'hackerrank',
      username,
      totalSolved: Number(model.solved_challenges || model.total_solved || 0),
      ranking: model.rank || model.ranking || null,
      practiceScore,
      reputation: Number(model.reputation || 0),
      badges: Array.isArray(badges) ? badges : [],
      certifications: Array.isArray(model.certifications) ? model.certifications.length : Number(model.certifications || 0),
    };
  }
}

async function handleCodingProfiles(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const requested = {
    leetcode: validHandle(firstQueryValue(req.query.leetcode)),
    gfg: validHandle(firstQueryValue(req.query.gfg)),
    codechef: validHandle(firstQueryValue(req.query.codechef)),
    hackerrank: validHandle(firstQueryValue(req.query.hackerrank)),
  };

  const invalidKeys = Object.keys(requested).filter((key) => firstQueryValue(req.query[key]) && !requested[key]);
  if (invalidKeys.length) return res.status(400).json({ error: `Invalid username for: ${invalidKeys.join(', ')}` });

  const jobs = [];
  if (requested.leetcode) jobs.push(['leetcode', fetchLeetCodeProfile(requested.leetcode)]);
  if (requested.gfg) jobs.push(['gfg', fetchGfgProfile(requested.gfg)]);
  if (requested.codechef) jobs.push(['codechef', fetchCodeChefProfile(requested.codechef)]);
  if (requested.hackerrank) jobs.push(['hackerrank', fetchHackerRankProfile(requested.hackerrank)]);
  if (!jobs.length) return res.status(400).json({ error: 'At least one coding profile username is required' });

  const settled = await Promise.allSettled(jobs.map(([, promise]) => promise));
  const profiles = [];
  const errors = {};

  settled.forEach((result, index) => {
    const platform = jobs[index][0];
    if (result.status === 'fulfilled') profiles.push(result.value);
    else {
      errors[platform] = result.reason?.message || 'Unable to fetch profile';
      console.warn(`Coding profile fetch failed for ${platform}:`, result.reason);
    }
  });

  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=1800');
  return res.status(200).json({
    success: profiles.length > 0,
    profiles,
    errors,
    requested: Object.keys(requested).filter((key) => requested[key]),
  });
}
