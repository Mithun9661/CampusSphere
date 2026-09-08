import { useCallback, useEffect, useMemo, useState } from 'react';
import { Code, ExternalLink, RefreshCw, Save, Star, Trophy, X } from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import ProfilePage from './Profile';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebase/firebase';

const PLATFORMS = {
  leetcode: {
    label: 'LeetCode',
    color: '#f97316',
    icon: Star,
    field: 'leetcodeUsername',
    url: (username) => `https://leetcode.com/u/${username}/`,
  },
  gfg: {
    label: 'GeeksForGeeks',
    color: '#10b981',
    icon: Star,
    field: 'gfgUsername',
    url: (username) => `https://www.geeksforgeeks.org/user/${username}/`,
  },
  codechef: {
    label: 'CodeChef',
    color: '#8b5cf6',
    icon: Trophy,
    field: 'codechefUsername',
    url: (username) => `https://www.codechef.com/users/${username}`,
  },
  hackerrank: {
    label: 'HackerRank',
    color: '#06b6d4',
    icon: Code,
    field: 'hackerrankUsername',
    url: (username) => `https://www.hackerrank.com/profile/${username}`,
  },
};

const EMPTY_HANDLES = { leetcode: '', gfg: '', codechef: '', hackerrank: '' };
const EMPTY_STATS = { leetcode: null, gfg: null, codechef: null, hackerrank: null };

function extractUsername(value, platform) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (!/^https?:\/\//i.test(raw)) return raw.replace(/^@/, '').replace(/\/$/, '');

  try {
    const path = new URL(raw).pathname.split('/').filter(Boolean);
    const marker = platform === 'leetcode' ? 'u' : platform === 'codechef' ? 'users' : platform === 'hackerrank' ? 'profile' : 'user';
    const markerIndex = path.indexOf(marker);
    return ((markerIndex >= 0 ? path[markerIndex + 1] : path[path.length - 1]) || '').replace(/^@/, '');
  } catch {
    return '';
  }
}

function normalizeResponse(payload) {
  const result = { ...EMPTY_STATS };
  const profiles = Array.isArray(payload?.profiles) ? payload.profiles : [];
  for (const profile of profiles) {
    const platform = String(profile?.platform || '').toLowerCase();
    if (platform in result) result[platform] = profile;
  }
  return result;
}

async function fetchCodingStats(handles) {
  const params = new URLSearchParams();
  Object.entries(handles).forEach(([platform, username]) => {
    if (username) params.set(platform, username);
  });
  if (![...params.keys()].length) return { ...EMPTY_STATS };

  const response = await fetch(`/api/coding-profiles?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Coding stats request failed with ${response.status}`);
  return normalizeResponse(await response.json());
}

function getRows(platform, profile) {
  if (platform === 'leetcode') {
    return [
      ['Total Solved', profile.totalSolved ?? 0],
      ['Easy', profile.easySolved ?? 0],
      ['Medium', profile.mediumSolved ?? 0],
      ['Hard', profile.hardSolved ?? 0],
      ['Global Rank', profile.globalRank ? `#${profile.globalRank}` : 'N/A'],
    ];
  }

  if (platform === 'gfg') {
    return [
      ['Total Solved', profile.totalSolved ?? profile.totalProblemsSolved ?? 0],
      ['Easy', profile.easySolved ?? profile.Easy ?? 0],
      ['Medium', profile.mediumSolved ?? profile.Medium ?? 0],
      ['Hard', profile.hardSolved ?? profile.Hard ?? 0],
      ['Streak', `${profile.streak ?? profile.currentStreak ?? 0} days`],
    ];
  }

  if (platform === 'codechef') {
    return [
      ['Rating', profile.rating ?? 0],
      ['Max Rating', profile.maxRating ?? profile.highestRating ?? 0],
      ['Total Solved', profile.totalSolved ?? profile.totalProblems ?? 0],
      ['Contests', profile.contestsParticipated ?? profile.contests ?? 0],
      ['Global Rank', profile.globalRank ? `#${profile.globalRank}` : 'N/A'],
    ];
  }

  const badgeCount = Array.isArray(profile.badges) ? profile.badges.length : (profile.badges ?? 0);
  return [
    ['Total Solved', profile.totalSolved ?? 0],
    ['Badges', badgeCount],
    ['Certifications', profile.certifications ?? 0],
    ['Practice Score', profile.practiceScore ?? 'N/A'],
    ['Rank', profile.ranking ? `#${profile.ranking}` : 'N/A'],
  ];
}

export default function ProfileLivePage() {
  const { user } = useAuth();
  const rollNo = user?.email ? user.email.split('@')[0].toUpperCase() : '';
  const [handles, setHandles] = useState({ ...EMPTY_HANDLES });
  const [draft, setDraft] = useState({ ...EMPTY_HANDLES });
  const [stats, setStats] = useState({ ...EMPTY_STATS });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(false);

  const hasConnectedProfile = useMemo(() => Object.values(handles).some(Boolean), [handles]);

  const refresh = useCallback(async (nextHandles = handles, quiet = false) => {
    if (!Object.values(nextHandles).some(Boolean)) {
      setStats({ ...EMPTY_STATS });
      return;
    }

    setRefreshing(true);
    try {
      setStats(await fetchCodingStats(nextHandles));
      if (!quiet) toast.success('Coding profile data refreshed');
    } catch (error) {
      console.error('Coding profile refresh failed:', error);
      if (!quiet) toast.error('Coding profile data is temporarily unavailable');
    } finally {
      setRefreshing(false);
    }
  }, [handles]);

  useEffect(() => {
    if (!rollNo) return;
    let cancelled = false;

    (async () => {
      try {
        const snap = await getDoc(doc(db, 'students', rollNo));
        const data = snap.exists() ? snap.data() : {};
        const saved = {
          leetcode: extractUsername(data.leetcodeUsername || data.leetcodeUrl, 'leetcode'),
          gfg: extractUsername(data.gfgUsername || data.gfgUrl, 'gfg'),
          codechef: extractUsername(data.codechefUsername || data.codechefUrl, 'codechef'),
          hackerrank: extractUsername(data.hackerrankUsername || data.hackerrankUrl, 'hackerrank'),
        };
        if (cancelled) return;
        setHandles(saved);
        setDraft(saved);
        if (Object.values(saved).some(Boolean)) {
          try {
            setStats(await fetchCodingStats(saved));
          } catch (error) {
            console.warn('Initial coding stats fetch failed:', error);
          }
        }
      } catch (error) {
        console.warn('Could not load coding integrations:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [rollNo]);

  const saveProfiles = async () => {
    const next = {};
    for (const platform of Object.keys(PLATFORMS)) {
      next[platform] = extractUsername(draft[platform], platform);
      if (next[platform] && !/^[A-Za-z0-9_.-]{1,64}$/.test(next[platform])) {
        toast.error(`Invalid ${PLATFORMS[platform].label} username`);
        return;
      }
    }

    try {
      const updates = {};
      for (const [platform, meta] of Object.entries(PLATFORMS)) {
        updates[meta.field] = next[platform];
        updates[`${platform}Url`] = next[platform] ? meta.url(next[platform]) : '';
      }
      await setDoc(doc(db, 'students', rollNo), updates, { merge: true });
      setHandles(next);
      setDraft(next);
      setEditing(false);
      toast.success('Coding profiles connected');
      await refresh(next, true);
    } catch (error) {
      console.error('Could not save coding profiles:', error);
      toast.error('Could not save coding profiles');
    }
  };

  return (
    <div className="profile-live-wrapper max-w-5xl space-y-7">
      <style>{`.profile-live-wrapper .legacy-profile > div > div:last-child { display: none !important; }`}</style>
      <div className="legacy-profile"><ProfilePage /></div>

      <section className="rounded-2xl p-7" style={{ background: '#121212', border: '1px solid #27272a' }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Code size={19} style={{ color: '#f97316' }} /> Coding Profile Integrations
            </h2>
            <p className="text-xs mt-1" style={{ color: '#71717a' }}>Connect once. Student 360 fetches the public stats automatically.</p>
          </div>
          <div className="flex gap-2">
            {!editing ? (
              <button type="button" onClick={() => { setDraft(handles); setEditing(true); }} className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: 'rgba(249,115,22,.14)', color: '#fdba74', border: '1px solid rgba(249,115,22,.3)' }}>
                {hasConnectedProfile ? 'Manage Profiles' : 'Connect Profiles'}
              </button>
            ) : (
              <>
                <button type="button" onClick={saveProfiles} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: '#f97316', color: 'white' }}><Save size={13} /> Save</button>
                <button type="button" onClick={() => { setDraft(handles); setEditing(false); }} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: '#1c1917', color: '#a1a1aa' }}><X size={13} /> Cancel</button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Object.entries(PLATFORMS).map(([platform, meta]) => (
            <div key={platform} className="rounded-xl p-4" style={{ background: '#0a0a0a', border: '1px solid #27272a' }}>
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className="text-sm font-semibold text-white">{meta.label}</span>
                {handles[platform] && !editing && (
                  <a href={meta.url(handles[platform])} target="_blank" rel="noreferrer" style={{ color: meta.color }}><ExternalLink size={14} /></a>
                )}
              </div>
              {editing ? (
                <input
                  value={draft[platform]}
                  onChange={(event) => setDraft((current) => ({ ...current, [platform]: event.target.value }))}
                  placeholder={`${meta.label} username or profile URL`}
                  className="w-full px-3 py-2.5 rounded-lg text-sm text-white outline-none"
                  style={{ background: '#121212', border: '1px solid #3f3f46' }}
                />
              ) : (
                <p className="text-xs" style={{ color: handles[platform] ? '#d4d4d8' : '#71717a' }}>
                  {handles[platform] ? `@${handles[platform]}` : 'Not connected'}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2"><Code size={20} style={{ color: '#f97316' }} /> Coding Profiles</h2>
          <button type="button" disabled={!hasConnectedProfile || refreshing} onClick={() => refresh()} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed" style={{ background: '#1c1917', color: '#d4d4d8', border: '1px solid #27272a' }}>
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> {refreshing ? 'Refreshing...' : 'Refresh Data'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {Object.entries(PLATFORMS).map(([platform, meta]) => (
            <CodingCard key={platform} platform={platform} meta={meta} username={handles[platform]} profile={stats[platform]} loading={loading || refreshing} onConnect={() => { setDraft(handles); setEditing(true); }} />
          ))}
        </div>
      </section>
    </div>
  );
}

function CodingCard({ platform, meta, username, profile, loading, onConnect }) {
  const Icon = meta.icon;
  return (
    <div className="rounded-2xl p-6" style={{ background: '#121212', border: '1px solid #27272a' }}>
      <div className="flex items-center justify-between gap-2 mb-4">
        <h3 className="font-bold text-base text-white">{meta.label}</h3>
        {username ? (
          <a href={meta.url(username)} target="_blank" rel="noreferrer" title={`Open ${meta.label}`} style={{ color: meta.color }}><Icon size={16} /></a>
        ) : <Icon size={16} style={{ color: meta.color }} />}
      </div>

      {!username ? (
        <div className="min-h-[190px] flex flex-col items-center justify-center text-center gap-3">
          <p className="text-xs" style={{ color: '#71717a' }}>Profile not connected</p>
          <button type="button" onClick={onConnect} className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ color: meta.color, background: `${meta.color}1f`, border: `1px solid ${meta.color}55` }}>Connect {meta.label}</button>
        </div>
      ) : loading && !profile ? (
        <div className="min-h-[190px] flex items-center justify-center"><RefreshCw size={18} className="animate-spin" style={{ color: meta.color }} /></div>
      ) : profile ? (
        <>
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[11px] truncate max-w-[130px]" style={{ color: '#71717a' }}>@{username}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ color: '#10b981', background: 'rgba(16,185,129,.12)' }}>LIVE</span>
          </div>
          <div className="space-y-1">
            {getRows(platform, profile).map(([label, value]) => <Metric key={label} label={label} value={value} />)}
          </div>
        </>
      ) : (
        <div className="min-h-[190px] flex flex-col items-center justify-center text-center gap-2">
          <p className="text-xs font-medium text-white">Stats temporarily unavailable</p>
          <p className="text-[11px]" style={{ color: '#71717a' }}>Click Refresh Data to try again.</p>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2" style={{ borderBottom: '1px solid #1c1917' }}>
      <span className="text-xs" style={{ color: '#71717a' }}>{label}</span>
      <span className="text-xs text-white font-semibold text-right">{value}</span>
    </div>
  );
}
