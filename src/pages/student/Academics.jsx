import { useEffect, useMemo, useState } from 'react';
import { Activity, BookOpen, GraduationCap, RefreshCw, ShieldCheck } from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebase/firebase';

const cardStyle = { background: '#121212', border: '1px solid #27272a' };
const muted = '#71717a';

function Stat({ label, value, hint }) {
  return (
    <div className="rounded-xl p-4" style={cardStyle}>
      <p className="text-xs" style={{ color: muted }}>{label}</p>
      <p className="text-2xl font-bold text-white mt-1">{value ?? '—'}</p>
      {hint && <p className="text-xs mt-1" style={{ color: '#52525b' }}>{hint}</p>}
    </div>
  );
}

export default function AcademicsPage() {
  const { user } = useAuth();
  const rollNo = useMemo(() => user?.email?.split('@')[0]?.toUpperCase() || user?.roll_no || '', [user]);
  const [password, setPassword] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [academic, setAcademic] = useState(null);
  const [studentMeta, setStudentMeta] = useState({});
  const [syncedAt, setSyncedAt] = useState('');

  useEffect(() => {
    if (!rollNo) return;
    let active = true;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'students', rollNo));
        if (!active || !snap.exists()) return;
        const data = snap.data();
        setStudentMeta(data || {});
        if (data.academicSnapshot) setAcademic(data.academicSnapshot);
        if (data.academicSyncedAt) setSyncedAt(data.academicSyncedAt);
      } catch (error) {
        console.warn('Could not load cached academic snapshot:', error);
      }
    })();
    return () => { active = false; };
  }, [rollNo]);

  const sync = async (event) => {
    event.preventDefault();
    if (!rollNo || !password) {
      toast.error('Enter your Exam Section password');
      return;
    }

    setSyncing(true);
    try {
      const response = await fetch('/api/ecap-connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ rollNo, password }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Exam Section sync failed');

      const next = payload.academic;
      const stamp = payload.syncedAt || new Date().toISOString();
      setAcademic(next);
      setSyncedAt(stamp);
      setPassword('');

      const parsedSemesterCgpa = (next.semesters || [])
        .map((item) => item.sgpa)
        .filter((value) => Number.isFinite(Number(value)))
        .map(Number);
      const directSemesterCgpa = Array.isArray(next.semester_cgpa)
        ? next.semester_cgpa.filter((value) => Number.isFinite(Number(value))).map(Number)
        : [];
      const semesterCgpa = directSemesterCgpa.length ? directSemesterCgpa : parsedSemesterCgpa;

      const writeData = {
        academicSnapshot: next,
        academicSyncedAt: stamp,
      };
      if (next.cgpa != null) writeData.cgpa = next.cgpa;
      if (semesterCgpa.length) writeData.semester_cgpa = semesterCgpa;
      if (next.attendance?.items?.length || next.attendance?.total) writeData.current_attendance = next.attendance;
      if (next.currentSubjects?.length) writeData.current_courses = next.currentSubjects;

      await setDoc(doc(db, 'students', rollNo), writeData, { merge: true });
      toast.success(payload.partial ? 'Exam Section data synced (partial)' : 'Real academic data synced');
    } catch (error) {
      console.error('Academic sync failed:', error);
      toast.error(error.message || 'Could not sync Exam Section');
    } finally {
      setSyncing(false);
    }
  };

  const attendance = academic?.attendance?.total?.percentage;
  const currentSubjects = academic?.attendance?.items || [];
  const directSemesterCgpa = Array.isArray(academic?.semester_cgpa)
    ? academic.semester_cgpa.filter((value) => Number.isFinite(Number(value))).map(Number)
    : [];
  const displaySemesters = academic?.semesters?.length
    ? academic.semesters
    : directSemesterCgpa.map((sgpa, index) => ({ semester: `Semester ${index + 1}`, sgpa, subjects: [] }));
  const branch = academic?.profile?.branch || studentMeta?.branch || studentMeta?.department || user?.branch || '—';
  const semesterHint = academic?.profile?.semester || studentMeta?.semester || '';

  return (
    <div className="max-w-6xl space-y-6">
      <section className="rounded-2xl p-6" style={cardStyle}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div>
            <div className="flex items-center gap-2">
              <GraduationCap size={21} style={{ color: '#f97316' }} />
              <h1 className="text-xl font-bold text-white">College Academics</h1>
            </div>
            <p className="text-sm mt-2 max-w-2xl" style={{ color: muted }}>
              Sync real CGPA, SGPA and marks from the ACET Exam Section portal. Attendance is shown only when the connected college source exposes it. Your portal password is used only for this sync request and is never stored.
            </p>
          </div>

          <form onSubmit={sync} className="flex flex-col sm:flex-row gap-2 min-w-0 lg:min-w-[430px]">
            <input
              value={rollNo}
              readOnly
              className="px-3 py-2.5 rounded-lg text-sm text-zinc-300 outline-none sm:w-36"
              style={{ background: '#0a0a0a', border: '1px solid #27272a' }}
            />
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Exam Section password"
              autoComplete="off"
              className="flex-1 px-3 py-2.5 rounded-lg text-sm text-white outline-none"
              style={{ background: '#0a0a0a', border: '1px solid #3f3f46' }}
            />
            <button
              type="submit"
              disabled={syncing}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-60"
              style={{ background: '#f97316', color: 'white' }}
            >
              <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing' : academic ? 'Refresh' : 'Connect'}
            </button>
          </form>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-4 text-xs" style={{ color: '#a1a1aa' }}>
          <ShieldCheck size={14} style={{ color: '#10b981' }} />
          Password is never written to your Student 360 database.
          {syncedAt && <span>Last sync: {new Date(syncedAt).toLocaleString()}</span>}
        </div>
      </section>

      {academic ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="CGPA" value={academic.cgpa} hint={academic.earnedCredits ? `Credits ${academic.earnedCredits}` : ''} />
            <Stat label="Overall %" value={academic.percentage != null ? `${academic.percentage}%` : '—'} />
            <Stat
              label="Current Attendance"
              value={attendance != null ? `${attendance}%` : 'N/A'}
              hint={academic.attendance?.total ? `${academic.attendance.total.attended}/${academic.attendance.total.held} classes` : 'Not exposed by Exam Section'}
            />
            <Stat label="Branch" value={branch} hint={semesterHint} />
          </div>

          <section className="rounded-2xl p-6" style={cardStyle}>
            <div className="flex items-center gap-2 mb-4">
              <Activity size={18} style={{ color: '#06b6d4' }} />
              <h2 className="text-base font-bold text-white">Current Subject Attendance</h2>
            </div>
            {currentSubjects.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ color: muted }}>
                      <th className="text-left py-2 pr-4">Subject</th>
                      <th className="text-right py-2 px-3">Held</th>
                      <th className="text-right py-2 px-3">Attend</th>
                      <th className="text-right py-2 pl-3">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentSubjects.map((item) => (
                      <tr key={item.subject} style={{ borderTop: '1px solid #27272a' }}>
                        <td className="py-3 pr-4 font-medium text-zinc-100">{item.subject}</td>
                        <td className="text-right py-3 px-3 text-zinc-400">{item.held}</td>
                        <td className="text-right py-3 px-3 text-zinc-400">{item.attended}</td>
                        <td className="text-right py-3 pl-3 font-semibold" style={{ color: item.percentage < 75 ? '#f87171' : '#34d399' }}>{item.percentage}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div>
                <p className="text-sm text-zinc-300">Attendance is not provided by the ACET Exam Section response.</p>
                <p className="text-xs mt-1" style={{ color: muted }}>This will stay N/A instead of showing fake or guessed attendance.</p>
              </div>
            )}
          </section>

          <section className="rounded-2xl p-6" style={cardStyle}>
            <div className="flex items-center gap-2 mb-4">
              <BookOpen size={18} style={{ color: '#f97316' }} />
              <h2 className="text-base font-bold text-white">Semester Results</h2>
            </div>
            {displaySemesters.length ? (
              <div className="space-y-4">
                {displaySemesters.map((semester, index) => (
                  <div key={`${semester.semester}-${index}`} className="rounded-xl p-4" style={{ background: '#0a0a0a', border: '1px solid #27272a' }}>
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <h3 className="text-sm font-semibold text-white">{semester.semester || `Semester ${index + 1}`}</h3>
                      <span className="text-sm font-bold" style={{ color: '#fdba74' }}>SGPA {semester.sgpa ?? '—'}</span>
                    </div>
                    {(semester.subjects || []).length ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead><tr style={{ color: muted }}><th className="text-left py-2">Subject</th><th className="text-center py-2">Grade</th><th className="text-right py-2">Credits</th></tr></thead>
                          <tbody>
                            {(semester.subjects || []).map((subject) => (
                              <tr key={`${semester.semester}-${subject.subject}`} style={{ borderTop: '1px solid #1f1f22' }}>
                                <td className="py-2.5 text-zinc-300">{subject.subject}</td>
                                <td className="py-2.5 text-center font-semibold text-white">{subject.grade || '—'}</td>
                                <td className="py-2.5 text-right text-zinc-400">{subject.credits ?? '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-xs" style={{ color: muted }}>SGPA was read from the portal. Subject-wise marks/grades are still being mapped from the Exam Section marks pages.</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm" style={{ color: muted }}>No semester-wise SGPA was exposed in the current Exam Section response.</p>
            )}
          </section>
        </>
      ) : (
        <section className="rounded-2xl p-10 text-center" style={cardStyle}>
          <GraduationCap size={34} className="mx-auto mb-3" style={{ color: '#52525b' }} />
          <h2 className="text-base font-semibold text-white">No academic snapshot yet</h2>
          <p className="text-sm mt-1" style={{ color: muted }}>Enter your ACET Exam Section password above and press Connect.</p>
        </section>
      )}
    </div>
  );
}
