import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { User, BookOpen, Code, Edit3, Save, X, Trophy, Star, ExternalLink } from 'lucide-react';
import { LoadingSkeleton } from '../../components/shared/LoadingSkeleton';
import { ErrorState } from '../../components/shared/ErrorState';
import { generateInitials, getAvatarColor, calculatePlacementIndex } from '../../utils/helpers';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import { doc, getDoc, setDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase/firebase';

export default function ProfilePage() {
  const { user } = useAuth();
  const rollNo = user?.email ? user.email.split('@')[0].toUpperCase() : '';
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [studentData, setStudentData] = useState(null);
  const [studentResults, setStudentResults] = useState([]);
  const [codingProfiles, setCodingProfiles] = useState({ leetcode: null, gfg: null, codechef: null, hackerrank: null });
  const [form, setForm] = useState({ phone: '', githubUrl: '' });
  const [githubConnected, setGithubConnected] = useState(false);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!rollNo) return;
    const fetchProfileData = async () => {
      try {
        const body = JSON.stringify({ roll_no: rollNo });
        const headers = { 'Content-Type': 'application/json' };
        
        const safeFetch = async (url) => {
          const cacheKey = `${rollNo}_${url}`;
          const cached = sessionStorage.getItem(cacheKey);
          if (cached) {
            try { return JSON.parse(cached); } catch (e) {}
          }
          try {
            const res = await fetch(url, { method: 'POST', headers, body, timeout: 10000 });
            if (!res.ok) {
              console.warn(`⚠️ API returned status ${res.status} for ${url}`);
              return null;
            }
            const data = await res.json();
            sessionStorage.setItem(cacheKey, JSON.stringify(data));
            return data;
          } catch (e) {
            console.warn(`⚠️ Fetch failed for ${url}:`, e.message);
            return null;
          }
        };

        const fetchStudentDetails = async () => {
          const cacheKey = `${rollNo}_student_details`;
          const cached = sessionStorage.getItem(cacheKey);
          if (cached) {
            try { return JSON.parse(cached); } catch (e) {}
          }
          try {
            const idRes = await fetch('/api/get-student-id-by-rollno', {
              method: 'POST',
              headers,
              body,
              timeout: 10000
            });
            if (!idRes.ok) {
              console.warn(`⚠️ get-student-id-by-rollno returned status ${idRes.status}`);
              return null;
            }
            const idData = await idRes.json();
            if (!idData.success || !idData.objectId) {
              console.warn(`⚠️ get-student-id-by-rollno failed:`, idData);
              return null;
            }
            
            const detailsRes = await fetch(`/api/get-user-by-id/${idData.objectId}`, {
              method: 'GET',
              headers: { 'Accept': 'application/json' },
              timeout: 10000
            });
            if (!detailsRes.ok) {
              console.warn(`⚠️ get-user-by-id returned status ${detailsRes.status}`);
              return null;
            }
            const data = await detailsRes.json();
            sessionStorage.setItem(cacheKey, JSON.stringify(data));
            return data;
          } catch (e) {
            console.warn(`⚠️ fetchStudentDetails failed:`, e.message);
            return null;
          }
        };

        // Try all APIs in parallel with timeout
        const [studentJson, lc, gfg, cc, hr] = await Promise.all([
          fetchStudentDetails(),
          safeFetch('/api/get-leetcode-details-by-rollno'),
          safeFetch('/api/get-geeksforgeeks-details-by-rollno'),
          safeFetch('/api/get-codechef-details-by-rollno'),
          safeFetch('/api/get-hackerrank-details-by-rollno')
        ]);

        // If primary API failed, try Firestore fallback
        let finalStudentData = studentJson;
        if (!studentJson) {
          console.log('📚 API unavailable, fetching from Firestore...');
          try {
            const docRef = doc(db, 'students', rollNo);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
              finalStudentData = docSnap.data();
              console.log('✅ Student data retrieved from Firestore');
            }
          } catch (firestoreErr) {
            console.error('❌ Firestore fallback failed:', firestoreErr);
          }
        }

        if (finalStudentData) setStudentData(finalStudentData);

        // Fetch results for PI score calculation
        try {
          const resultsQuery = query(collection(db, 'results'), where('rollNo', '==', rollNo));
          const resultsSnap = await getDocs(resultsQuery);
          setStudentResults(resultsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (resultsErr) {
          console.warn('⚠️ Failed to load student results for PI score:', resultsErr);
        }

        setCodingProfiles({ 
          leetcode: lc, 
          gfg: gfg, 
          codechef: cc, 
          hackerrank: hr 
        });

        // Fetch Firestore profile data
        let firestoreGithubUrl = '';
        if (rollNo) {
          const docRef = doc(db, 'students', rollNo);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            firestoreGithubUrl = data.githubUrl || '';
            if (firestoreGithubUrl) setGithubConnected(true);
          }
        }

        if (finalStudentData) {
          setForm({ phone: finalStudentData.mobile || '', githubUrl: firestoreGithubUrl });
        }
      } catch (err) {
        console.error("❌ Profile fetch error:", err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };
    fetchProfileData();
  }, [rollNo, retryCount]);

  const handleRetry = () => {
    setLoading(true);
    setError(false);
    setRetryCount(c => c + 1);
  };

  if (error) return <ErrorState message="Unable to fetch student profile. Please check your connection and try again." onRetry={handleRetry} />;

  if (loading) return <LoadingSkeleton type="list" rows={4} />;

  const initials = generateInitials(studentData?.first_name || user?.name || '');
  const avatarColor = getAvatarColor(studentData?.first_name || user?.name || '');
  const placementIndex = calculatePlacementIndex(studentData, studentResults, {
    codingProfiles,
    githubStats: studentData?.githubStats,
  });

  const handleSave = async () => {
    setLoading(true);
    try {
      if (user?.uid) {
        let githubUsername = '';
        // Extract username if URL is provided
        if (form.githubUrl) {
          const match = form.githubUrl.match(/github\.com\/([a-zA-Z0-9-]+)\/?/);
          if (match && match[1]) {
            githubUsername = match[1];
          } else {
            toast.error('Invalid GitHub URL. Must be in format https://github.com/username');
            setLoading(false);
            return;
          }
        }

        await setDoc(doc(db, 'students', rollNo), {
          githubUrl: form.githubUrl,
          githubUsername: githubUsername
        }, { merge: true });
        
        // Clear sessionStorage cache to force fresh fetch
        sessionStorage.removeItem(`${rollNo}_student_details`);
        
        setGithubConnected(!!form.githubUrl);
        toast.success('Profile updated successfully!');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to update profile');
    } finally {
      setEditing(false);
      setLoading(false);
    }
  };

  const { leetcode, gfg, codechef, hackerrank } = codingProfiles;

  return (
    <div className="space-y-7 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">My Profile</h1>
        <p className="text-base mt-1.5" style={{ color: '#71717a' }}>View and manage your academic profile</p>
      </div>

      {/* Profile banner card */}
      <div className="rounded-2xl p-8" style={{ background: '#121212', border: '1px solid #27272a' }}>
        <div className="flex items-start gap-7">
          <motion.div whileHover={{ scale: 1.05 }} className="relative shrink-0">
            <div
              className="w-24 h-24 rounded-2xl flex items-center justify-center text-3xl font-black text-white shadow-xl overflow-hidden"
              style={{ background: `linear-gradient(135deg, ${avatarColor}, ${avatarColor}88)` }}
            >
              {rollNo ? (
                <>
                  <img 
                    src={`https://info.aec.edu.in/acet/StudentPhotos/${rollNo}.jpg`} 
                    alt="Profile" 
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => { e.target.style.display = 'none'; e.target.nextElementSibling.style.display = 'block'; }}
                  />
                  <span style={{ display: 'none' }}>{initials}</span>
                </>
              ) : <span>{initials}</span>}
            </div>
            <div className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full border-2"
              style={{ background: '#10b981', borderColor: '#121212' }} />
          </motion.div>

          <div className="flex-1">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white">{studentData?.first_name || user?.name}</h2>
                <p className="text-base mt-1" style={{ color: '#71717a' }}>{studentData?.email || user?.email}</p>
                <div className="flex items-center gap-4 mt-3">
                  <span className="text-sm px-3 py-1.5 rounded-full font-semibold" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>Active Student</span>
                  <span className="text-sm font-medium" style={{ color: '#71717a' }}>{studentData?.roll_no || rollNo}</span>
                </div>
              </div>
              {!editing ? (
                <button onClick={() => setEditing(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
                  style={{ background: 'rgba(249, 115, 22,0.15)', color: '#fdba74', border: '1px solid rgba(249, 115, 22,0.3)' }}>
                  <Edit3 size={14} /> Edit Profile
                </button>
              ) : (
                <div className="flex gap-2">
                  <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
                    style={{ background: '#f97316', color: 'white' }}>
                    <Save size={14} /> Save
                  </button>
                  <button onClick={() => setEditing(false)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
                    style={{ background: '#1c1917', color: '#71717a' }}>
                    <X size={14} /> Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Personal Info */}
        <div className="rounded-2xl p-7" style={{ background: '#121212', border: '1px solid #27272a' }}>
          <h3 className="font-bold text-base text-white mb-5 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(249, 115, 22,0.15)' }}>
              <User size={16} style={{ color: '#f97316' }} />
            </div>
            Personal Information
          </h3>
          <div className="space-y-4">
            <InfoRow label="Full Name" value={studentData?.first_name || user?.name} />
            <InfoRow label="Email" value={studentData?.email || user?.email} />
            <InfoRow label="Phone" value={editing ? (
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="text-sm text-white bg-transparent border-b w-full outline-none pb-0.5"
                style={{ borderColor: '#f97316' }} />
            ) : studentData?.mobile} />
            <InfoRow label="Gender" value={studentData?.gender} />
          </div>
        </div>

        {/* Academic Info */}
        <div className="rounded-2xl p-7" style={{ background: '#121212', border: '1px solid #27272a' }}>
          <h3 className="font-bold text-base text-white mb-5 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(245, 158, 11,0.15)' }}>
              <BookOpen size={16} style={{ color: '#f59e0b' }} />
            </div>
            Academic Information
          </h3>
          <div className="space-y-4">
            <InfoRow label="Roll Number" value={studentData?.roll_no || rollNo} />
            <InfoRow label="College" value={studentData?.college} />
            <InfoRow label="Department" value={studentData?.branch?.join(', ')} />
            <InfoRow label="Passout Year" value={studentData?.passout_year} />
            <InfoRow label="PI Score" value={`${placementIndex}/100`} />
          </div>
        </div>
      </div>

      {/* Integrations Section */}
      <div className="rounded-2xl p-7" style={{ background: '#121212', border: '1px solid #27272a' }}>
        <h3 className="font-bold text-base text-white mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255, 255, 255, 0.1)' }}>
              <Code size={16} style={{ color: '#ffffff' }} />
            </div>
            Integrations
          </div>
          {githubConnected && !editing && (
            <span className="text-xs px-2.5 py-1 rounded-md font-semibold flex items-center gap-1.5" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Connected
            </span>
          )}
        </h3>
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 py-2">
            <div>
              <p className="text-sm font-medium text-white">GitHub Profile</p>
              <p className="text-xs mt-0.5" style={{ color: '#71717a' }}>Link your GitHub account for advanced analytics</p>
            </div>
            <div className="w-full sm:w-1/2">
              {editing ? (
                <input
                  type="url"
                  placeholder="https://github.com/username"
                  value={form.githubUrl}
                  onChange={(e) => setForm({ ...form, githubUrl: e.target.value })}
                  className="w-full text-sm text-white px-4 py-2.5 rounded-xl outline-none"
                  style={{ background: '#0a0a0a', border: '1px solid #3f3f46', borderColor: form.githubUrl ? '#f97316' : '#27272a' }}
                />
              ) : (
                <div className="text-sm font-medium text-right w-full flex justify-end">
                  {form.githubUrl ? (
                    <a href={form.githubUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:underline" style={{ color: '#f97316' }}>
                      {form.githubUrl.replace('https://', '')} <ExternalLink size={12} />
                    </a>
                  ) : (
                    <button 
                      onClick={() => setEditing(true)}
                      className="px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all hover:scale-105" 
                      style={{ background: '#f97316', color: 'white', border: '1px solid #ea580c' }}
                    >
                      Connect GitHub
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Coding Profiles Section */}
      <div>
        <h2 className="text-xl font-bold text-white mt-4 mb-4 flex items-center gap-2">
          <Code size={20} style={{ color: '#f97316' }} /> Coding Profiles
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* LeetCode */}
          <div className="rounded-2xl p-6" style={{ background: '#121212', border: '1px solid #27272a' }}>
            <h3 className="font-bold text-base text-white mb-4 flex items-center justify-between">
              LeetCode
              <a href={leetcode?.lc_profile || '#'} target="_blank" rel="noreferrer" style={{ color: '#f97316' }}>
                <Star size={16} />
              </a>
            </h3>
            <div className="space-y-3">
              <InfoRow label="Total Solved" value={leetcode?.lc_total_progarms || 0} />
              <InfoRow label="Easy" value={leetcode?.lc_easy || 0} />
              <InfoRow label="Medium" value={leetcode?.lc_medium || 0} />
              <InfoRow label="Hard" value={leetcode?.lc_hard || 0} />
              <InfoRow label="Global Rank" value={leetcode?.lc_rank ? `#${leetcode.lc_rank}` : 'N/A'} />
            </div>
          </div>

          {/* GeeksForGeeks */}
          <div className="rounded-2xl p-6" style={{ background: '#121212', border: '1px solid #27272a' }}>
            <h3 className="font-bold text-base text-white mb-4 flex items-center justify-between">
              GeeksForGeeks
              <a href={gfg?.gfg_profile || '#'} target="_blank" rel="noreferrer" style={{ color: '#10b981' }}>
                <Star size={16} />
              </a>
            </h3>
            <div className="space-y-3">
              <InfoRow label="Total Problems" value={gfg?.gfg_total_problems || 0} />
              <InfoRow label="Score" value={gfg?.gfg_score || 0} />
              <InfoRow label="Streak" value={`${gfg?.gfg_streak || 0} days`} />
              <InfoRow label="School" value={gfg?.gfg_school || 0} />
              <InfoRow label="Basic" value={gfg?.gfg_basic || 0} />
            </div>
          </div>

          {/* CodeChef */}
          <div className="rounded-2xl p-6" style={{ background: '#121212', border: '1px solid #27272a' }}>
            <h3 className="font-bold text-base text-white mb-4 flex items-center justify-between">
              CodeChef
              <a href={codechef?.cc_profile || '#'} target="_blank" rel="noreferrer" style={{ color: '#8b5cf6' }}>
                <Trophy size={16} />
              </a>
            </h3>
            <div className="space-y-3">
              <InfoRow label="Rating" value={codechef?.rating || 0} />
              <InfoRow label="Stars" value={`${codechef?.star_rating || 0} ★`} />
              <InfoRow label="Total Solved" value={codechef?.total_problems || 0} />
              <InfoRow label="Contests" value={codechef?.contests || 0} />
              <InfoRow label="Streak" value={`${codechef?.streak || 0} days`} />
            </div>
          </div>

          {/* HackerRank */}
          <div className="rounded-2xl p-6" style={{ background: '#121212', border: '1px solid #27272a' }}>
            <h3 className="font-bold text-base text-white mb-4 flex items-center justify-between">
              HackerRank
              <a href={hackerrank?.hr_profile || '#'} target="_blank" rel="noreferrer" style={{ color: '#06b6d4' }}>
                <Code size={16} />
              </a>
            </h3>
            <div className="space-y-3">
              <InfoRow label="Badges" value={hackerrank?.hr_badges || 0} />
              <InfoRow label="Total Stars" value={`${hackerrank?.hr_total_stars || 0} ★`} />
              <InfoRow label="C/C++" value={(hackerrank?.hr_c || 0) + (hackerrank?.hr_cpp || 0)} />
              <InfoRow label="Java" value={hackerrank?.hr_java || 0} />
              <InfoRow label="Python" value={hackerrank?.hr_python || 0} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2" style={{ borderBottom: '1px solid #1c1917' }}>
      <span className="text-xs font-medium shrink-0" style={{ color: '#71717a' }}>{label}</span>
      <span className="text-xs text-white text-right font-medium">{value}</span>
    </div>
  );
}
