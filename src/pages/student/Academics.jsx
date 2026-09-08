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
  const [examPassword, setExamPassword] = useState('');
  const [ecapPassword, setEcapPassword] = useState('');
  const [syncingExam, setSyncingExam] = useState(false);
  const [syncingAttendance, setSyncingAttendance] = useState(false);
  const [academic, setAcademic] = useState(null);
  const [studentMeta, setStudentMeta] = useState({});
  const [syncedAt, setSyncedAt] = useState('');
  const [attendanceSyncedAt, setAttendanceSyncedAt] = useState('');

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
        if (data.attendanceSyncedAt) setAttendanceSyncedAt(data.attendanceSyncedAt);
      } catch (error) {
        console.warn('Could not load cached academic snapshot:', error);
      }
    })();
    return () => { active = false; };
  }, [rollNo]);

  const syncExamSection = async (event) => {
    event.preventDefault();
    if (!rollNo || !examPassword) return toast.error('Enter your Exam Section password');

    setSyncingExam(true);
    try {
      const response = await fetch('/api/ecap-connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ rollNo, password: examPassword }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Exam Section sync failed');

      const incoming = payload.academic || {};
      const next = {
        ...(academic || {}),
        ...incoming,
        attendance: academic?.attendance?.items?.length || academic?.attendance?.total
          ? academic.attendance
          : incoming.attendance,
        attendanceSource: academic?.attendanceSource || incoming.attendanceSource,
        currentSubjects: academic?.attendance?.items?.length
          ? academic.attendance.items.map((item) => item.subject)
          : incoming.currentSubjects,
        profile: { ...(academic?.profile || {}), ...(incoming.profile || {}) },
      };
      const stamp = payload.syncedAt || new Date().toISOString();
      setAcademic(next);
      setSyncedAt(stamp);
      setExamPassword('');

      const semesterCgpa = Array.isArray(next.semester_cgpa)
        ? next.semester_cgpa.filter((value) => Number.isFinite(Number(value))).map(Number)
        : (next.semesters || []).map((item) => item.sgpa).filter((value) => Number.isFinite(Number(value))).map(Number);

      const writeData = { academicSnapshot: next, academicSyncedAt: stamp };
      if (next.cgpa != null) writeData.cgpa = next.cgpa;
      if (semesterCgpa.length) writeData.semester_cgpa = semesterCgpa;
      await setDoc(doc(db, 'students', rollNo), writeData, { merge: true });
      toast.success(payload.partial ? 'Exam Section data synced (partial)' : 'Exam Section data synced');
    } catch (error) {
      console.error('Exam Section sync failed:', error);
      toast.error(error.message || 'Could not sync Exam Section');
    } finally {
      setSyncingExam(false);
    }
  };

  const syncAttendance = async (event) => {
    event.preventDefault();
    if (!rollNo || !ecapPassword) return toast.error('Enter your E-CAP Student/Parent password');

    setSyncingAttendance(true);
    try {
      const response = await fetch('/api/ecap-attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ rollNo, password: ecapPassword }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.error || 'E-CAP attendance sync failed');

      const stamp = payload.syncedAt || new Date().toISOString();
      const attendance = payload.attendance || { items: [], total: null };
      const next = {
        ...(academic || {}),
        attendance,
        attendanceSource: payload.source || 'ACET E-CAP',
        currentSubjects: (attendance.items || []).map((item) => item.subject),
        profile: { ...(academic?.profile || {}), ...(payload.profile || {}) },
      };
      setAcademic(next);
      setAttendanceSyncedAt(stamp);
      setEcapPassword('');

      await setDoc(doc(db, 'students', rollNo), {
        academicSnapshot: next,
        current_attendance: attendance,
        current_courses: next.currentSubjects,
        attendanceSyncedAt: stamp,
      }, { merge: true });
      toast.success('Real E-CAP attendance synced');
    } catch (error) {
      console.error('E-CAP attendance sync failed:', error);
      toast.error(error.message || 'Could not sync E-CAP attendance');
    } finally {
      setSyncingAttendance(false);
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
        <div className="flex items-center gap-2">
          <GraduationCap size={21} style={{ color: '#f97316' }} />
          <h1 className="text-xl font-bold text-white">College Academics</h1>
        </div>
        <p className="text-sm mt-2 max-w-3xl" style={{ color: muted }}>
          Student 360 uses two official ACET student sources: Exam Section for CGPA/SGPA/marks, and E-CAP Student/Parent login for attendance/profile. Passwords are used only for the current sync request and are never stored.
        </p>

        <div className="grid lg:grid-cols-2 gap-4 mt-5">
          <form onSubmit={syncExamSection} className="rounded-xl p-4" style={{ background: '#0a0a0a', border: '1px solid #27272a' }}>
            <p className="text-sm font-semibold text-white">1. Exam Section · Results</p>
            <p className="text-xs mt-1" style={{ color: muted }}>CGPA, SGPA and exam marks</p>
            <div className="flex flex-col sm:flex-row gap-2 mt-3">
              <input value={rollNo} readOnly className="px-3 py-2.5 rounded-lg text-sm text-zinc-300 outline-none sm:w-36" style={{ background: '#111', border: '1px solid #27272a' }} />
              <input type="password" value={examPassword} onChange={(e) => setExamPassword(e.target.value)} placeholder="Exam Section password" autoComplete="off" className="flex-1 px-3 py-2.5 rounded-lg text-sm text-white outline-none" style={{ background: '#111', border: '1px solid #3f3f46' }} />
              <button type="submit" disabled={syncingExam} className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-60" style={{ background: '#f97316', color: 'white' }}>
                <RefreshCw size={15} className={syncingExam ? 'animate-spin' : ''} />
                {syncingExam ? 'Syncing' : 'Sync Results'}
              </button>
            </div>
            {syncedAt && <p className="text-xs mt-2" style={{ color: '#71717a' }}>Last results sync: {new Date(syncedAt).toLocaleString()}</p>}
          </form>

          <form onSubmit={syncAttendance} className="rounded-xl p-4" style={{ background: '#0a0a0a', border: '1px solid #27272a' }}>
            <p className="text-sm font-semibold text-white">2. E-CAP · Attendance</p>
            <p className="text-xs mt-1" style={{ color: muted }}>Uses info.aec.edu.in/acet Student/Parent login</p>
            <div className="flex flex-col sm:flex-row gap-2 mt-3">
              <input value={rollNo} readOnly className="px-3 py-2.5 rounded-lg text-sm text-zinc-300 outline-none sm:w-36" style={{ background: '#111', border: '1px solid #27272a' }} />
              <input type="password" value={ecapPassword} onChange={(e) => setEcapPassword(e.target.value)} placeholder="E-CAP password" autoComplete="off" className="flex-1 px-3 py-2.5 rounded-lg text-sm text-white outline-none" style={{ background: '#111', border: '1px solid #3f3f46' }} />
              <button type="submit" disabled={syncingAttendance} className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-60" style={{ background: '#0891b2', color: 'white' }}>
                <RefreshCw size={15} className={syncingAttendance ? 'animate-spin' : ''} />
                {syncingAttendance ? 'Syncing' : 'Sync Attendance'}
              </button>
            </div>
            {attendanceSyncedAt && <p className="text-xs mt-2" style={{ color: '#71717a' }}>Last attendance sync: {new Date(attendanceSyncedAt).toLocaleString()}</p>}
          </form>
        </div>

        <div className="flex items-center gap-2 mt-4 text-xs" style={{ color: '#a1a1aa' }}>
          <ShieldCheck size={14} style={{ color: '#10b981' }} />
          Neither portal password is written to Firestore or local storage.
        </div>
      </section>

      {academic ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="CGPA" value={academic.cgpa} hint={academic.earnedCredits ? `Credits ${academic.earnedCredits}` : ''} />
            <Stat label="Overall %" value={academic.percentage != null ? `${academic.percentage}%` : '—'} />
            <Stat label="Current Attendance" value={attendance != null ? `${attendance}%` : 'N/A'} hint={academic.attendance?.total ? `${academic.attendance.total.attended}/${academic.attendance.total.held} classes · ${academic.attendanceSource || 'E-CAP'}` : 'Sync from E-CAP'} />
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
                  <thead><tr style={{ color: muted }}><th className="text-left py-2 pr-4">Subject</th><th className="text-right py-2 px-3">Held</th><th className="text-right py-2 px-3">Attend</th><th className="text-right py-2 pl-3">%</th></tr></thead>
                  <tbody>
                    {currentSubjects.map((item) => (
                      <tr key={`${item.subject}-${item.held}-${item.attended}`} style={{ borderTop: '1px solid #27272a' }}>
                        <td className="py-3 pr-4 font-medium text-zinc-100">{item.subject}</td>
                        <td className="text-right py-3 px-3 text-zinc-400">{item.held}</td>
                        <td className="text-right py-3 px-3 text-zinc-400">{item.attended}</td>
                        <td className="text-right py-3 pl-3 font-semibold" style={{ color: item.percentage < 75 ? '#f87171' : '#34d399' }}>{item.percentage}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-sm text-zinc-300">Enter your E-CAP Student/Parent password above and press Sync Attendance.</p>}
          </section>

          <section className="rounded-2xl p-6" style={cardStyle}>
            <div className="flex items-center gap-2 mb-4"><BookOpen size={18} style={{ color: '#f97316' }} /><h2 className="text-base font-bold text-white">Semester Results</h2></div>
            {displaySemesters.length ? (
              <div className="space-y-4">
                {displaySemesters.map((semester, index) => (
                  <div key={`${semester.semester}-${index}`} className="rounded-xl p-4" style={{ background: '#0a0a0a', border: '1px solid #27272a' }}>
                    <div className="flex items-center justify-between gap-3 mb-3"><h3 className="text-sm font-semibold text-white">{semester.semester || `Semester ${index + 1}`}</h3><span className="text-sm font-bold" style={{ color: '#fdba74' }}>SGPA {semester.sgpa ?? '—'}</span></div>
                    {(semester.subjects || []).length ? (
                      <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr style={{ color: muted }}><th className="text-left py-2">Subject</th><th className="text-center py-2">Grade</th><th className="text-right py-2">Credits</th></tr></thead><tbody>{semester.subjects.map((subject) => <tr key={`${semester.semester}-${subject.subject}`} style={{ borderTop: '1px solid #1f1f22' }}><td className="py-2.5 text-zinc-300">{subject.subject}</td><td className="py-2.5 text-center font-semibold text-white">{subject.grade || '—'}</td><td className="py-2.5 text-right text-zinc-400">{subject.credits ?? '—'}</td></tr>)}</tbody></table></div>
                    ) : <p className="text-xs" style={{ color: muted }}>SGPA was read from the portal. Subject-wise marks/grades are still being mapped from the Exam Section marks pages.</p>}
                  </div>
                ))}
              </div>
            ) : <p className="text-sm" style={{ color: muted }}>No semester-wise SGPA was exposed in the current Exam Section response.</p>}
          </section>
        </>
      ) : (
        <section className="rounded-2xl p-10 text-center" style={cardStyle}>
          <GraduationCap size={34} className="mx-auto mb-3" style={{ color: '#52525b' }} />
          <h2 className="text-base font-semibold text-white">No academic snapshot yet</h2>
          <p className="text-sm mt-1" style={{ color: muted }}>Sync results from Exam Section, then attendance from E-CAP.</p>
        </section>
      )}
    </div>
  );
}
