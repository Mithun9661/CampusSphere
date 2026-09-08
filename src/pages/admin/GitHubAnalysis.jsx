import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { generateInitials, getAvatarColor } from '../../utils/helpers';
import { GitBranch, TrendingUp, Star, Activity, RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LabelList } from 'recharts';
import { LoadingSkeleton } from '../../components/shared/LoadingSkeleton';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';

export default function AdminGitHub() {
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState([]);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const snap = await getDocs(collection(db, 'students'));
        setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return <LoadingSkeleton type="card" />;

  // Computed data
  const studentsWithGithub = students.filter(s => s.githubUsername);

  const fetchGitHubData = async (username) => {
    try {
      const [profileRes, reposRes] = await Promise.all([
        fetch(`https://api.github.com/users/${username}`),
        fetch(`https://api.github.com/users/${username}/repos?per_page=100&sort=updated`)
      ]);
      if (!profileRes.ok || !reposRes.ok) return null;
      const profile = await profileRes.json();
      const repos = await reposRes.json();
      let totalStars = 0;
      const languages = {};
      repos.forEach(repo => {
        totalStars += repo.stargazers_count;
        if (repo.language) languages[repo.language] = (languages[repo.language] || 0) + 1;
      });
      const topLanguages = Object.entries(languages).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })).slice(0, 5);
      return {
        followers: profile.followers, following: profile.following, public_repos: profile.public_repos,
        totalStars, topLanguages, avatarUrl: profile.avatar_url, lastSynced: new Date().toISOString()
      };
    } catch (error) { return null; }
  };

  const handleSync = async () => {
    setSyncing(true);
    let updatedStudents = [...students];
    for (const student of studentsWithGithub) {
      const githubStats = await fetchGitHubData(student.githubUsername);
      if (githubStats) {
        try {
          await updateDoc(doc(db, 'students', student.id), { githubStats });
          updatedStudents = updatedStudents.map(s => s.id === student.id ? { ...s, githubStats } : s);
        } catch (err) { console.error(err); }
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    setStudents(updatedStudents);
    setSyncing(false);
  };

  const totalRepos = studentsWithGithub.reduce((acc, s) => acc + (s.githubStats?.public_repos || 0), 0);
  const totalFollowers = studentsWithGithub.reduce((acc, s) => acc + (s.githubStats?.followers || 0), 0);

  const leaderboard = studentsWithGithub.map(s => {
    const repos = s.githubStats?.public_repos || 0;
    const followers = s.githubStats?.followers || 0;
    // Simple mock score formula using repos and followers
    const score = Math.min(100, Math.floor((repos * 2) + (followers * 5)));
    return { ...s, repos, commits: repos * 15, score };
  }).sort((a, b) => b.score - a.score);

  // Aggregate languages
  const languageCounts = {};
  studentsWithGithub.forEach(s => {
    (s.githubStats?.topLanguages || []).forEach(l => {
      languageCounts[l.name] = (languageCounts[l.name] || 0) + (l.count || 0);
    });
  });
  const totalLangSize = Object.values(languageCounts).reduce((a,b) => a+b, 0);
  const PIE_COLORS = ['#f97316', '#10b981', '#06b6d4', '#f59e0b', '#8b5cf6', '#ef4444'];
  const languageData = Object.entries(languageCounts).sort((a,b) => b[1]-a[1]).slice(0,5).map(([name, size], i) => ({
    name,
    percentage: totalLangSize ? Math.round((size / totalLangSize) * 100) : 0,
    color: PIE_COLORS[i % PIE_COLORS.length]
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">GitHub Analysis</h1>
          <p className="text-sm mt-1" style={{ color: '#71717a' }}>Institution-wide GitHub contribution monitoring</p>
        </div>
        <button onClick={handleSync} disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
          style={{ background: 'rgba(249, 115, 22, 0.1)', color: '#f97316', border: '1px solid rgba(249, 115, 22, 0.3)', opacity: syncing ? 0.6 : 1, cursor: syncing ? 'not-allowed' : 'pointer' }}>
          <motion.div animate={syncing ? { rotate: 360 } : {}} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
            <RefreshCw size={15} />
          </motion.div>
          {syncing ? 'Syncing...' : 'Sync GitHub Data'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Students Linked', value: studentsWithGithub.length, color: '#f97316', icon: GitBranch },
          { label: 'Total Followers', value: totalFollowers, color: '#10b981', icon: Activity },
          { label: 'Public Repos', value: totalRepos, color: '#f59e0b', icon: Star },
          { label: 'Avg Score', value: `${leaderboard.length ? Math.floor(leaderboard.reduce((a, b) => a + b.score, 0) / leaderboard.length) : 0}/100`, color: '#f59e0b', icon: TrendingUp },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
            className="rounded-2xl p-5" style={{ background: '#121212', border: '1px solid #27272a' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: `${s.color}20` }}>
              <s.icon size={18} style={{ color: s.color }} />
            </div>
            <p className="text-xs mb-1" style={{ color: '#71717a' }}>{s.label}</p>
            <p className="text-2xl font-bold text-white">{s.value}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Language distribution */}
        <div className="rounded-2xl p-6 flex flex-col" style={{ background: '#121212', border: '1px solid #27272a', minHeight: '340px' }}>
          <h3 className="font-semibold text-white mb-6">Top Languages (Institution)</h3>
          <div className="flex flex-col items-center justify-center gap-6 flex-1">
            <ResponsiveContainer width={180} height={180}>
              <PieChart>
                <Pie data={languageData} dataKey="percentage" cx="50%" cy="50%" outerRadius={85} innerRadius={55}>
                  {languageData.map((l, i) => <Cell key={i} fill={l.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#1c1917', border: '1px solid #3f3f46', borderRadius: '8px' }} itemStyle={{ color: '#fafafa' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="w-full space-y-3 mt-auto">
              {languageData.map(l => (
                <div key={l.name} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: l.color }} />
                  <span className="text-sm text-white flex-1">{l.name}</span>
                  <span className="text-sm font-semibold" style={{ color: '#a1a1aa' }}>{l.percentage}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Contribution scores */}
        <div className="lg:col-span-2 rounded-2xl p-6 flex flex-col" style={{ background: '#121212', border: '1px solid #27272a', minHeight: '340px' }}>
          <h3 className="font-semibold text-white mb-6">Top Contributors</h3>
          <div className="flex-1 flex flex-col justify-center">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={leaderboard.slice(0, 5)} layout="vertical" margin={{ left: 10, right: 35, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} stroke="#475569" tick={{ fontSize: 10 }} tickMargin={4} height={20} />
                <YAxis type="category" dataKey="name" stroke="#475569" tick={{ fontSize: 11 }} width={85} />
                <Bar dataKey="score" name="Score" fill="#f97316" radius={[0, 4, 4, 0]} barSize={28}>
                  <LabelList dataKey="score" position="right" fill="#a1a1aa" fontSize={11} fontWeight={500} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Leaderboard table */}
      <div className="rounded-2xl overflow-hidden" style={{ background: '#121212', border: '1px solid #27272a' }}>
        <div className="px-5 py-4" style={{ borderBottom: '1px solid #27272a' }}>
          <h3 className="font-semibold text-white">GitHub Contribution Leaderboard</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ background: '#0a0a0a' }}>
                {['Rank', 'Student', 'Department', 'Repos', 'Commits', 'Score'].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-medium" style={{ color: '#71717a' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((s, i) => (
                <tr key={s.id} className="hover:bg-white/5 transition-all" style={{ borderBottom: '1px solid #27272a' }}>
                  <td className="px-5 py-3.5">
                    <span className="text-sm font-bold" style={{ color: i === 0 ? '#f59e0b' : i === 1 ? '#a1a1aa' : i === 2 ? '#f97316' : '#71717a' }}>
                      #{i + 1}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
                        style={{ background: getAvatarColor(s.name) }}>
                        {generateInitials(s.name)}
                      </div>
                      <span className="text-sm text-white">{s.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-sm" style={{ color: '#a1a1aa' }}>{s.branch ? s.branch.join(', ') : 'N/A'}</td>
                  <td className="px-5 py-3.5 text-sm text-white">{s.repos}</td>
                  <td className="px-5 py-3.5 text-sm text-white">{s.commits}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: '#1c1917' }}>
                        <div className="h-full rounded-full" style={{ width: `${s.score}%`, background: s.score >= 80 ? '#10b981' : s.score >= 60 ? '#f97316' : '#f59e0b' }} />
                      </div>
                      <span className="text-sm font-semibold text-white">{s.score}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
