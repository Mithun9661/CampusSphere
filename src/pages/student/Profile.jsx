import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { User, BookOpen, Code, Edit3, Save, X, Trophy, Star, ExternalLink } from 'lucide-react';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { db } from '../../firebase/firebase';
import { useAuth } from '../../context/AuthContext';
import { LoadingSkeleton } from '../../components/shared/LoadingSkeleton';
import { ErrorState } from '../../components/shared/ErrorState';
import { calculatePlacementIndex, generateInitials, getAvatarColor } from '../../utils/helpers';

const emptyProfiles = { leetcode: null, gfg: null, codechef: null, hackerrank: null };
const emptyForm = { phone: '', githubUrl: '', leetcodeUsername: '', gfgUsername: '', codechefUsername: '', hackerrankUsername: '' };

export default function ProfilePage() {
  const { user } = useAuth();
  const rollNo = user?.email?.split('@')[0]?.toUpperCase() || '';
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [studentData, setStudentData] = useState(null);
  const [studentResults, setStudentResults] = useState([]);
  const [codingProfiles, setCodingProfiles] = useState(emptyProfiles);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (!rollNo) return;
    const load = async () => {
      setLoading(true);
      setError(false);
      try {
        const headers = { 'Content-Type': 'application/json' };
        const body = JSON.stringify({ roll_no: rollNo });
        let primary = null;
        try {
          const idRes = await fetch('/api/get-student-id-by-rollno', { method: 'POST', headers, body });
          const idData = idRes.ok ? await idRes.json() : null;
          if (idData?.success && idData?.objectId) {
            const detailsRes = await fetch(`/api/get-user-by-id/${idData.objectId}`);
            if (detailsRes.ok) primary = await detailsRes.json();
          }
        } catch (e) { console.warn('Student API unavailable', e); }

        const studentRef = doc(db, 'students', rollNo);
        const snap = await getDoc(studentRef);
        const saved = snap.exists() ? snap.data() : {};
        const finalStudent = primary || saved;
        setStudentData(finalStudent);
        setForm({
          phone: finalStudent?.mobile || saved.mobile || '',
          githubUrl: saved.githubUrl || '',
          leetcodeUsername: saved.leetcodeUsername || '',
          gfgUsername: saved.gfgUsername || '',
          codechefUsername: saved.codechefUsername || '',
          hackerrankUsername: saved.hackerrankUsername || ''
        });

        try {
          const rq = query(collection(db, 'results'), where('rollNo', '==', rollNo));
          const rs = await getDocs(rq);
          setStudentResults(rs.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) { console.warn('Results unavailable', e); }

        const handles = {
          leetcode: saved.leetcodeUsername || '',
          gfg: saved.gfgUsername || '',
          codechef: saved.codechefUsername || '',
          hackerrank: saved.hackerrankUsername || ''
        };
        let live = {};
        if (Object.values(handles).some(Boolean)) {
          const params = new URLSearchParams();
          Object.entries(handles).forEach(([k, v]) => v && params.set(k, v));
          try {
            const r = await fetch(`/api/coding-stats?${params}`);
            if (r.ok) live = await r.json();
          } catch (e) { console.warn('Live coding stats unavailable', e); }
        }

        const fallback = async (path) => {
          try {
            const r = await fetch(path, { method: 'POST', headers, body });
            return r.ok ? await r.json() : null;
          } catch { return null; }
        };
        const [lc, gfg, cc, hr] = await Promise.all([
          live.leetcode ? null : fallback('/api/get-leetcode-details-by-rollno'),
          live.gfg ? null : fallback('/api/get-geeksforgeeks-details-by-rollno'),
          live.codechef ? null : fallback('/api/get-codechef-details-by-rollno'),
          live.hackerrank ? null : fallback('/api/get-hackerrank-details-by-rollno')
        ]);
        setCodingProfiles({ leetcode: live.leetcode || lc, gfg: live.gfg || gfg, codechef: live.codechef || cc, hackerrank: live.hackerrank || hr });
      } catch (e) {
        console.error(e);
        setError(true);
      } finally { setLoading(false); }
    };
    load();
  }, [rollNo, refreshKey]);

  const save = async () => {
    try {
      let githubUsername = '';
      if (form.githubUrl) {
        const m = form.githubUrl.match(/github\.com\/([a-zA-Z0-9-]+)\/?/);
        if (!m) return toast.error('Invalid GitHub URL');
        githubUsername = m[1];
      }
      await setDoc(doc(db, 'students', rollNo), {
        githubUrl: form.githubUrl.trim(), githubUsername,
        leetcodeUsername: form.leetcodeUsername.trim(), gfgUsername: form.gfgUsername.trim(),
        codechefUsername: form.codechefUsername.trim(), hackerrankUsername: form.hackerrankUsername.trim()
      }, { merge: true });
      toast.success('Coding profiles connected');
      setEditing(false);
      setRefreshKey(v => v + 1);
    } catch (e) { console.error(e); toast.error('Failed to update profile'); }
  };

  if (error) return <ErrorState message="Unable to fetch student profile." onRetry={() => setRefreshKey(v => v + 1)} />;
  if (loading) return <LoadingSkeleton type="list" rows={4} />;

  const initials = generateInitials(studentData?.first_name || user?.name || '');
  const avatarColor = getAvatarColor(studentData?.first_name || user?.name || '');
  const pi = calculatePlacementIndex(studentData, studentResults, { codingProfiles, githubStats: studentData?.githubStats });
  const { leetcode, gfg, codechef, hackerrank } = codingProfiles;

  return <div className="space-y-7 max-w-5xl">
    <div><h1 className="text-2xl font-bold text-white">My Profile</h1><p className="text-base mt-1.5" style={{color:'#71717a'}}>View and manage your academic profile</p></div>

    <div className="rounded-2xl p-8" style={{background:'#121212',border:'1px solid #27272a'}}>
      <div className="flex items-start gap-7">
        <motion.div whileHover={{scale:1.05}} className="relative shrink-0">
          <div className="w-24 h-24 rounded-2xl flex items-center justify-center text-3xl font-black text-white overflow-hidden" style={{background:`linear-gradient(135deg, ${avatarColor}, ${avatarColor}88)`}}>
            <img src={`https://info.aec.edu.in/acet/StudentPhotos/${rollNo}.jpg`} alt="Profile" className="w-full h-full object-cover" onError={e=>{e.currentTarget.style.display='none';}} />
            <span className="absolute">{initials}</span>
          </div>
        </motion.div>
        <div className="flex-1 flex justify-between gap-4">
          <div><h2 className="text-2xl font-bold text-white">{studentData?.first_name || user?.name}</h2><p className="mt-1" style={{color:'#71717a'}}>{studentData?.email || user?.email}</p><p className="text-sm mt-3" style={{color:'#71717a'}}>{studentData?.roll_no || rollNo}</p></div>
          <div>{!editing ? <button onClick={()=>setEditing(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold" style={{background:'rgba(249,115,22,.15)',color:'#fdba74'}}><Edit3 size={14}/> Edit Profile</button> : <div className="flex gap-2"><button onClick={save} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold" style={{background:'#f97316',color:'#fff'}}><Save size={14}/> Save</button><button onClick={()=>setEditing(false)} className="p-2.5 rounded-xl" style={{background:'#1c1917',color:'#aaa'}}><X size={14}/></button></div>}</div>
        </div>
      </div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <InfoCard icon={<User size={16}/>} title="Personal Information"><InfoRow label="Full Name" value={studentData?.first_name || user?.name}/><InfoRow label="Email" value={studentData?.email || user?.email}/><InfoRow label="Phone" value={studentData?.mobile || '-'}/><InfoRow label="Gender" value={studentData?.gender || '-'}/></InfoCard>
      <InfoCard icon={<BookOpen size={16}/>} title="Academic Information"><InfoRow label="Roll Number" value={studentData?.roll_no || rollNo}/><InfoRow label="College" value={studentData?.college || '-'}/><InfoRow label="Department" value={Array.isArray(studentData?.branch)?studentData.branch.join(', '):(studentData?.branch || '-')}/><InfoRow label="Passout Year" value={studentData?.passout_year || '-'}/><InfoRow label="PI Score" value={`${pi}/100`}/></InfoCard>
    </div>

    <div className="rounded-2xl p-7" style={{background:'#121212',border:'1px solid #27272a'}}>
      <h3 className="font-bold text-white mb-5 flex items-center gap-3"><Code size={18}/> Integrations</h3>
      <Integration label="GitHub" editing={editing} value={form.githubUrl} placeholder="https://github.com/username" onChange={v=>setForm({...form,githubUrl:v})} link={form.githubUrl}/>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5 pt-5" style={{borderTop:'1px solid #27272a'}}>
        <Integration label="LeetCode" editing={editing} value={form.leetcodeUsername} placeholder="LeetCode username" onChange={v=>setForm({...form,leetcodeUsername:v})}/>
        <Integration label="GeeksForGeeks" editing={editing} value={form.gfgUsername} placeholder="GFG username" onChange={v=>setForm({...form,gfgUsername:v})}/>
        <Integration label="CodeChef" editing={editing} value={form.codechefUsername} placeholder="CodeChef username" onChange={v=>setForm({...form,codechefUsername:v})}/>
        <Integration label="HackerRank" editing={editing} value={form.hackerrankUsername} placeholder="HackerRank username" onChange={v=>setForm({...form,hackerrankUsername:v})}/>
      </div>
    </div>

    <div><h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><Code size={20} style={{color:'#f97316'}}/> Coding Profiles</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatBox title="LeetCode" icon={<Star size={16}/>} link={form.leetcodeUsername&&`https://leetcode.com/u/${form.leetcodeUsername}`} rows={[["Total Solved",leetcode?.lc_total_progarms??leetcode?.totalSolved??0],["Easy",leetcode?.lc_easy??leetcode?.easySolved??0],["Medium",leetcode?.lc_medium??leetcode?.mediumSolved??0],["Hard",leetcode?.lc_hard??leetcode?.hardSolved??0],["Global Rank",(leetcode?.lc_rank??leetcode?.ranking)?`#${leetcode?.lc_rank??leetcode?.ranking}`:'N/A']]}/>
        <StatBox title="GeeksForGeeks" icon={<Star size={16}/>} link={form.gfgUsername&&`https://www.geeksforgeeks.org/profile/${form.gfgUsername}`} rows={[["Total Problems",gfg?.gfg_total_problems??gfg?.totalSolved??gfg?.totalProblemsSolved??0],["Score",gfg?.gfg_score??gfg?.codingScore??gfg?.score??0],["Streak",`${gfg?.gfg_streak??gfg?.currentStreak??0} days`],["School",gfg?.gfg_school??gfg?.school??0],["Basic",gfg?.gfg_basic??gfg?.basic??0]]}/>
        <StatBox title="CodeChef" icon={<Trophy size={16}/>} link={form.codechefUsername&&`https://www.codechef.com/users/${form.codechefUsername}`} rows={[["Rating",codechef?.rating??codechef?.currentRating??0],["Stars",`${codechef?.star_rating??codechef?.stars??0} ★`],["Total Solved",codechef?.total_problems??codechef?.totalSolved??codechef?.problemsSolved??0],["Contests",codechef?.contests??codechef?.contestsParticipated??0],["Streak",`${codechef?.streak??codechef?.currentStreak??0} days`]]}/>
        <StatBox title="HackerRank" icon={<Code size={16}/>} link={form.hackerrankUsername&&`https://www.hackerrank.com/profile/${form.hackerrankUsername}`} rows={[["Badges",hackerrank?.hr_badges??hackerrank?.badges??hackerrank?.badgesCount??0],["Total Stars",`${hackerrank?.hr_total_stars??hackerrank?.totalStars??0} ★`],["C/C++",(hackerrank?.hr_c??hackerrank?.c??0)+(hackerrank?.hr_cpp??hackerrank?.cpp??0)],["Java",hackerrank?.hr_java??hackerrank?.java??0],["Python",hackerrank?.hr_python??hackerrank?.python??0]]}/>
      </div>
    </div>
  </div>;
}

function Integration({label,editing,value,placeholder,onChange,link}) { return <div><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium text-white">{label}</p>{!editing&&value&&<span className="text-xs" style={{color:'#10b981'}}>● Connected</span>}</div>{editing?<input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className="w-full mt-2 text-sm text-white px-4 py-2.5 rounded-xl outline-none" style={{background:'#0a0a0a',border:'1px solid #27272a'}}/>:<p className="text-xs mt-2" style={{color:value?'#a1a1aa':'#71717a'}}>{value?(link?<a href={link} target="_blank" rel="noreferrer" className="flex items-center gap-1">{value}<ExternalLink size={11}/></a>:`@${value}`):'Not connected'}</p>}</div>; }
function InfoCard({icon,title,children}) { return <div className="rounded-2xl p-7" style={{background:'#121212',border:'1px solid #27272a'}}><h3 className="font-bold text-white mb-5 flex items-center gap-3">{icon}{title}</h3><div className="space-y-3">{children}</div></div>; }
function StatBox({title,icon,link,rows}) { return <div className="rounded-2xl p-6" style={{background:'#121212',border:'1px solid #27272a'}}><h3 className="font-bold text-white mb-4 flex items-center justify-between">{title}{link?<a href={link} target="_blank" rel="noreferrer" style={{color:'#f97316'}}>{icon}</a>:icon}</h3><div className="space-y-3">{rows.map(([k,v])=><InfoRow key={k} label={k} value={v}/>)}</div></div>; }
function InfoRow({label,value}) { return <div className="flex items-start justify-between gap-4 py-2" style={{borderBottom:'1px solid #1c1917'}}><span className="text-xs font-medium shrink-0" style={{color:'#71717a'}}>{label}</span><span className="text-xs text-white text-right font-medium">{value ?? '-'}</span></div>; }
