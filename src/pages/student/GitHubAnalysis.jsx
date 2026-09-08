import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { GitBranch, Star, GitFork, Code, Activity, ExternalLink, RefreshCw, Users, BookOpen, AlertCircle } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { LoadingSkeleton } from '../../components/shared/LoadingSkeleton';
import { ErrorState } from '../../components/shared/ErrorState';
import { useAuth } from '../../context/AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { Link } from 'react-router-dom';

const COLORS = ['#f97316', '#3b82f6', '#10b981', '#8b5cf6', '#f43f5e', '#f59e0b', '#06b6d4'];

const CustomPieTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-xl p-2.5 text-xs" style={{ background: '#1c1917', border: '1px solid #3f3f46' }}>
        <p className="font-medium text-white">{payload[0].name}: {payload[0].value}%</p>
      </div>
    );
  }
  return null;
};

const CustomBarTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-xl p-2.5 text-xs" style={{ background: '#1c1917', border: '1px solid #3f3f46' }}>
        <p className="font-medium text-white">{payload[0].payload.name}</p>
        <p style={{ color: '#f59e0b' }}>Stars: {payload[0].value}</p>
      </div>
    );
  }
  return null;
};

export default function GitHubAnalysisPage() {
  const { user } = useAuth();
  const rollNo = user?.email ? user.email.split('@')[0].toUpperCase() : '';
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("Unable to fetch GitHub data.");
  const [githubUsername, setGithubUsername] = useState(null);
  
  const [githubProfile, setGithubProfile] = useState(null);
  const [repositories, setRepositories] = useState([]);
  const [techStack, setTechStack] = useState([]);
  const [starsData, setStarsData] = useState([]);

  useEffect(() => {
    fetchData();
  }, [user]);

  const fetchData = async () => {
    setLoading(true);
    setError(false);
    try {
      if (!rollNo) return;
      
      // 1. Fetch Username from Firestore
      const docRef = doc(db, 'students', rollNo);
      const docSnap = await getDoc(docRef);
      let username = null;
      
      if (docSnap.exists()) {
        username = docSnap.data().githubUsername;
      }
      
      setGithubUsername(username);

      if (!username) {
        setLoading(false);
        return; // Empty state handles this
      }

      // 2. Fetch from GitHub API
      const githubToken = import.meta.env.VITE_GITHUB_TOKEN;
      const headers = {
        'Accept': 'application/vnd.github.v3+json',
        ...(githubToken ? { Authorization: `Bearer ${githubToken}` } : {})
      };
      
      const [profileRes, reposRes] = await Promise.all([
        fetch(`https://api.github.com/users/${username}`, { headers }),
        fetch(`https://api.github.com/users/${username}/repos?per_page=100&sort=updated`, { headers })
      ]);

      if (!profileRes.ok || !reposRes.ok) {
        if (profileRes.status === 403 || reposRes.status === 403) {
          throw new Error("GitHub API Rate Limit Exceeded. Please try again later.");
        }
        if (profileRes.status === 404) {
          throw new Error("GitHub Profile not found. Please check your linked username.");
        }
        throw new Error("Failed to fetch data from GitHub API.");
      }

      const profileData = await profileRes.json();
      const reposData = await reposRes.json();

      setGithubProfile(profileData);
      
      // Filter out forks and calculate analytics
      const originalRepos = reposData.filter(repo => !repo.fork);
      setRepositories(originalRepos);

      // Extract Languages for Tech Stack
      const langCounts = {};
      let totalLangOccurrences = 0;
      
      const repoStarsData = [];

      originalRepos.forEach(repo => {
        if (repo.language) {
          langCounts[repo.language] = (langCounts[repo.language] || 0) + 1;
          totalLangOccurrences++;
        }
        if (repo.stargazers_count > 0) {
          repoStarsData.push({
            name: repo.name.length > 15 ? repo.name.substring(0,15) + '...' : repo.name,
            stars: repo.stargazers_count,
            fullName: repo.name
          });
        }
      });

      // Prepare Pie Chart data
      const stack = Object.entries(langCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 7) // Top 7 languages
        .map((entry, index) => ({
          name: entry[0],
          count: entry[1],
          percentage: Math.round((entry[1] / totalLangOccurrences) * 100),
          color: COLORS[index % COLORS.length]
        }));
      setTechStack(stack);

      // Prepare Bar Chart data
      repoStarsData.sort((a, b) => b.stars - a.stars);
      setStarsData(repoStarsData.slice(0, 10)); // Top 10 starred repos

    } catch (err) {
      console.error(err);
      setError(true);
      setErrorMessage(err.message || "Unable to fetch GitHub data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
  };

  if (loading) return <LoadingSkeleton type="card" />;

  if (error) return <ErrorState message={errorMessage} onRetry={handleRefresh} />;

  if (!githubUsername) {
    return (
      <div className="w-full min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
        <div className="w-20 h-20 rounded-3xl mb-6 flex items-center justify-center" style={{ background: '#1c1917', border: '1px solid #27272a' }}>
          <GitBranch size={36} style={{ color: '#71717a' }} />
        </div>
        <h2 className="text-2xl font-bold text-white mb-3">GitHub Not Connected</h2>
        <p className="text-sm max-w-md mx-auto mb-8 leading-relaxed" style={{ color: '#a1a1aa' }}>
          Connect your GitHub account to unlock powerful analytics, tech stack summaries, and contribution insights directly inside Student 360.
        </p>
        <Link to="/student/profile" className="px-6 py-3.5 rounded-xl text-sm font-semibold text-white transition-all hover:scale-105"
          style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)', boxShadow: '0 8px 20px rgba(249, 115, 22, 0.25)' }}>
          Link GitHub Profile
        </Link>
      </div>
    );
  }

  const totalStars = repositories.reduce((sum, r) => sum + r.stargazers_count, 0);
  const totalForks = repositories.reduce((sum, r) => sum + r.forks_count, 0);
  const creationYear = new Date(githubProfile?.created_at).getFullYear();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">GitHub Analytics</h1>
          <p className="text-sm mt-1" style={{ color: '#71717a' }}>Real-time repository insights and metrics</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-60"
          style={{ background: 'rgba(249, 115, 22,0.15)', color: '#fdba74', border: '1px solid rgba(249, 115, 22,0.3)' }}
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* GitHub Profile Header Card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl p-6 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, rgba(36,36,36,0.9), rgba(18, 18, 18,1))', border: '1px solid #3f3f46' }}
      >
        <div className="absolute -right-10 -top-10 opacity-5">
          <GitBranch size={200} />
        </div>
        <div className="flex items-center gap-6 relative z-10">
          <img src={githubProfile?.avatar_url} alt="GitHub Avatar" className="w-20 h-20 rounded-2xl shadow-2xl border-2 border-zinc-800" />
          <div>
            <h2 className="font-bold text-white text-2xl tracking-tight">{githubProfile?.name || githubUsername}</h2>
            <div className="flex items-center gap-3 mt-1.5">
              <a
                href={githubProfile?.html_url}
                target="_blank" rel="noreferrer"
                className="text-sm font-medium flex items-center gap-1.5 hover:underline"
                style={{ color: '#f97316' }}
              >
                @{githubUsername} <ExternalLink size={12} />
              </a>
              <span className="text-xs px-2.5 py-0.5 rounded-full" style={{ background: '#27272a', color: '#a1a1aa' }}>
                Since {creationYear}
              </span>
            </div>
            {githubProfile?.bio && <p className="text-sm mt-3" style={{ color: '#d4d4d8', maxWidth: '600px' }}>{githubProfile.bio}</p>}
          </div>
          <div className="ml-auto flex gap-8 text-center hidden md:flex">
            <div>
              <p className="text-2xl font-black text-white">{githubProfile?.followers}</p>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#71717a' }}>Followers</p>
            </div>
            <div>
              <p className="text-2xl font-black text-white">{githubProfile?.following}</p>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#71717a' }}>Following</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Public Repositories', value: githubProfile?.public_repos || 0, color: '#06b6d4', icon: BookOpen },
          { label: 'Total Stars Earned', value: totalStars, color: '#f59e0b', icon: Star },
          { label: 'Total Forks Received', value: totalForks, color: '#10b981', icon: GitFork },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="rounded-2xl p-5"
            style={{ background: '#121212', border: '1px solid #27272a' }}
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: `${s.color}20` }}>
                <s.icon size={22} style={{ color: s.color }} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-0.5" style={{ color: '#71717a' }}>{s.label}</p>
                <p className="text-2xl font-bold text-white">{s.value}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Charts & Tech Stack */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Language distribution */}
        <div className="rounded-2xl p-6 flex flex-col" style={{ background: '#121212', border: '1px solid #27272a', minHeight: '340px' }}>
          <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
            <Activity size={18} style={{ color: '#f97316' }} /> Tech Stack Overview
          </h3>
          <p className="text-xs mb-4" style={{ color: '#71717a' }}>Most used languages across public repos</p>
          {techStack.length > 0 ? (
            <div className="flex-1 mt-2 relative">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie 
                    data={techStack} 
                    dataKey="percentage" 
                    nameKey="name" 
                    cx="50%" 
                    cy="50%" 
                    outerRadius={80} 
                    innerRadius={50}
                    paddingAngle={4}
                    stroke="none"
                  >
                    {techStack.map((l, i) => <Cell key={i} fill={l.color} />)}
                  </Pie>
                  <Tooltip content={<CustomPieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-4 flex flex-wrap gap-2 justify-center">
                {techStack.slice(0, 5).map(lang => (
                  <span key={lang.name} className="text-xs px-2.5 py-1 rounded-md font-medium" style={{ background: `${lang.color}20`, color: lang.color, border: `1px solid ${lang.color}40` }}>
                    {lang.name}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm" style={{ color: '#71717a' }}>Not enough language data.</p>
            </div>
          )}
        </div>

        {/* Stars Bar Chart */}
        <div className="lg:col-span-2 rounded-2xl p-6 flex flex-col" style={{ background: '#121212', border: '1px solid #27272a', minHeight: '340px' }}>
          <h3 className="font-semibold text-white mb-2 flex items-center gap-2">
            <Star size={18} style={{ color: '#f59e0b' }} /> Top Starred Repositories
          </h3>
          <p className="text-xs mb-6" style={{ color: '#71717a' }}>Repositories with the highest star count</p>
          {starsData.length > 0 ? (
            <div className="flex-1">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={starsData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="name" stroke="#475569" tick={{ fontSize: 11 }} tickMargin={10} axisLine={false} tickLine={false} />
                  <YAxis stroke="#475569" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomBarTooltip />} cursor={{ fill: '#1c1917' }} />
                  <Bar dataKey="stars" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm" style={{ color: '#71717a' }}>No stars found on repositories.</p>
            </div>
          )}
        </div>
      </div>

      {/* Recent Repositories */}
      <div>
        <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
          <Code size={18} style={{ color: '#f97316' }} /> Recent Repositories
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {repositories.slice(0, 6).map((repo, i) => (
            <motion.div
              key={repo.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              whileHover={{ y: -2 }}
              className="rounded-xl p-5 cursor-pointer transition-all flex flex-col h-full"
              style={{ background: '#121212', border: '1px solid #27272a' }}
              onClick={() => window.open(repo.html_url, '_blank')}
            >
              <div className="flex items-start justify-between mb-2">
                <h4 className="font-bold text-white text-base truncate pr-4">{repo.name}</h4>
                <ExternalLink size={14} style={{ color: '#71717a', flexShrink: 0 }} />
              </div>
              <p className="text-sm line-clamp-2 flex-1 mb-4" style={{ color: '#a1a1aa' }}>
                {repo.description || 'No description provided.'}
              </p>
              <div className="flex items-center gap-4 mt-auto pt-4" style={{ borderTop: '1px solid #1c1917' }}>
                {repo.language && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#3b82f6' }} />
                    <span className="text-xs font-medium text-white">{repo.language}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <Star size={13} style={{ color: '#f59e0b' }} />
                  <span className="text-xs font-medium" style={{ color: '#a1a1aa' }}>{repo.stargazers_count}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <GitFork size={13} style={{ color: '#71717a' }} />
                  <span className="text-xs font-medium" style={{ color: '#a1a1aa' }}>{repo.forks_count}</span>
                </div>
                <div className="ml-auto text-xs" style={{ color: '#71717a' }}>
                  {new Date(repo.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
