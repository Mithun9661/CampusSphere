import { useEffect, useMemo, useState } from 'react';
import { Activity, BookOpen, ChevronDown, ChevronRight, GraduationCap, RefreshCw, ShieldCheck } from 'lucide-react';
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

function semesterNo(value, fallback) {
  const match = String(value || '').match(/([1-8])/);
  return match ? Number(match[1]) : fallback;
}

function buildSemesters(academic, detailed) {
  const sgpas = Array.isArray(academic?.semester_cgpa)
    ? academic.semester_cgpa.filter((v) => Number.isFinite(Number(v))).map(Number)
    : [];
  const existing = Array.isArray(academic?.semesters) ? academic.semesters : [];
  const detailSemesters = Array.isArray(detailed?.semesters) ? detailed.semesters : [];
  const count = Math.max(sgpas.length, existing.length, ...detailSemesters.map((s) => Number(s.semesterNumber) || 0), 0);
  const result = [];

  for (let i = 1; i <= count; i += 1) {
    const old = existing.find((s, index) => semesterNo(s.semester, index + 1) === i) || {};
    const detail = detailSemesters.find((s) => Number(s.semesterNumber) === i) || {};
    result.push({
      ...old,
      semester: old.semester || detail.semester || `Semester ${i}`,
      semesterNumber: i,
      sgpa: old.sgpa ?? sgpas[i - 1] ?? null,
      subjects: detail.subjects?.length ? detail.subjects : (old.subjects || []),
    });
  }
  return result;
}

function ResultTable({ subjects }) {
  const hasCode = subjects.some((s) => s.code);
  const hasMarks = subjects.some((s) => s.marks !== '' && s.marks != null);
  const hasGrade = subjects.some((s) => s.grade);
  const hasCredits = subjects.some((s) => s.credits != null);
  const hasResult = subjects.some((s) => s.result);

  return (
    <div className="overflow-x-auto mt-3">
      <table className="w-full text-xs min-w-[650px]">
        <thead>
          <tr style={{ color: muted }}>
            {hasCode && <th className="text-left py-2 pr-3">Code</th>}
            <th className="text-left py-2 pr-3">Subject</th>
            {hasMarks && <th className="text-center py-2 px-3">Marks</th>}
            {hasGrade && <th className="text-center py-2 px-3">Grade</th>}
            {hasCredits && <th className="text-center py-2 px-3">Credits</th>}
            {hasResult && <th className="text-right py-2 pl-3">Result</th>}
          </tr>
        </thead>
        <tbody>
          {subjects.map((subject, index) => (
            <tr key={`${subject.code}-${subject.subject}-${index}`} style={{ borderTop: '1px solid #1f1f22' }}>
              {hasCode && <td className="py-2.5 pr-3 text-zinc-500">{subject.code || '—'}</td>}
              <td className="py-2.5 pr-3 text-zinc-200 font-medium">{subject.subject || '—'}</td>
              {hasMarks && <td className="py-2.5 px-3 text-center text-zinc-300">{subject.marks || '—'}</td>}
              {hasGrade && <td className="py-2.5 px-3 text-center font-semibold text-white">{subject.grade || '—'}</td>}
              {hasCredits && <td className="py-2.5 px-3 text-center text-zinc-400">{subject.credits ?? '—'}</td>}
              {hasResult && <td className="py-2.5 pl-3 text-right text-zinc-300">{subject.result || '—'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
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
  const [openSemester, setOpenSemester] = useState(null);

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

  const persist = async (next, stamp, attendanceStamp = attendanceSyncedAt) => {
    const semesterCgpa = (next.semesters || [])
      .map((item) => item.sgpa)
      .filter((value) => Number.isFinite(Number(value)))
      .map(Number);
    const writeData = {
      academicSnapshot: next,
      academicSyncedAt: stamp,
    };
    if (next.cgpa != null) writeData.cgpa = next.cgpa;
    if (semesterCgpa.length) writeData.semester_cgpa = semesterCgpa;
    if (next.attendance?.items?.length || next.attendance?.total) {
      writeData.current_attendance = next.attendance;
      writeData.current_courses = (next.attendance.items || []).map((item) => item.subject);
      if (attendanceStamp) writeData.attendanceSyncedAt = attendanceStamp;
    }
    await setDoc(doc(db, 'students', rollNo), writeData, { merge: true });
  };

  const syncExamSection = async (event) => {
    event.preventDefault();
    if (!rollNo || !examPassword) return toast.error('Enter your Exam Section password');
    setSyncingExam(true);

    try {
      const body = JSON.stringify({ rollNo, password: examPassword });
      const [summaryResponse, detailResponse, autoAttendanceResponse] = await Promise.all([
        fetch('/api/ecap-connect', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body }),
        fetch('/api/exam-results', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body }),
        fetch('/api/ecap-attendance', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body }),
      ]);

      const summaryPayload = await summaryResponse.json().catch(() => ({}));
      if (!summaryResponse.ok || !summaryPayload.success) throw new Error(summaryPayload.error || 'Exam Section sync failed');
      const detailPayload = await detailResponse.json().catch(() => ({}));
      const attendancePayload = await autoAttendanceResponse.json().catch(() => ({}));

      const incoming = summaryPayload.academic || {};
      let next = {
        ...(academic || {}),
        ...incoming,
        profile: { ...(academic?.profile || {}), ...(incoming.profile || {}) },
      };
      next.semesters = buildSemesters(next, detailResponse.ok && detailPayload.success ? detailPayload : null);

      let nextAttendanceStamp = attendanceSyncedAt;
      if (autoAttendanceResponse.ok && attendancePayload.success && (attendancePayload.attendance?.items?.length || attendancePayload.attendance?.total)) {
        nextAttendanceStamp = attendancePayload.syncedAt || new Date().toISOString();
        next = {
          ...next,
          attendance: attendancePayload.attendance,
          attendanceSource: attendancePayload.source || 'ACET E-CAP',
          currentSubjects: (attendancePayload.attendance.items || []).map((item) => item.subject),
          profile: { ...(next.profile || {}), ...(attendancePayload.profile || {}) },
        };
        setAttendanceSyncedAt(nextAttendanceStamp);
      } else if (academic?.attendance?.items?.length || academic?.attendance?.total) {
        next.attendance = academic.attendance;
        next.attendanceSource = academic.attendanceSource;
      }

      const stamp = summaryPayload.syncedAt || new Date().toISOString();
      setAcademic(next);
      setSyncedAt(stamp);
      setExamPassword('');
      await persist(next, stamp, nextAttendanceStamp);

      const detailCount = next.semesters.reduce((sum, sem) => sum + (sem.subjects?.length || 0), 0);
      toast.success(detailCount ? 'Results synced with semester details' : 'CGPA/SGPA synced');
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
      await persist(next, syncedAt || new Date().toISOString(), stamp);
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
  const displaySemesters = useMemo(() => buildSemesters(academic, null), [academic]);
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
          Exam Section provides CGPA, SGPA and result data. E-CAP at info.aec.edu.in provides attendance/profile data. Passwords are used only for the current sync request and are never stored.
        </p>

        <div className="grid lg:grid-cols-2 gap-4 mt-5">
          <form onSubmit={syncExamSection} className="rounded-xl p-4" style={{ background: '#0a0a0a', border: '1px solid #27272a' }}>
            <p className="text-sm font-semibold text-white">1. Exam Section · Results</p>
            <p className="text-xs mt-1" style={{ color: muted }}>CGPA, semester SGPA, subjects, marks/grades</p>
            <div className="flex flex-col sm:flex-row gap-2 mt-3">
              <input value={rollNo} readOnly className="px-3 py-2.5 rounded-lg text-sm text-zinc-300 outline-none sm:w-36" style={{ background: '#111', border: '1px solid #27272a' }} />
              <input type="password" value={examPassword} onChange={(e) => setExamPassword(e.target.value)} placeholder="Exam Section password" autoComplete="off" className="flex-1 px-3 py-2.5 rounded-lg text-sm text-white outline-none" style={{ background: '#111', border: '1px solid #3f3f46' }} />
              <button type="submit" disabled={syncingExam} className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-60" style={{ background: '#f97316', color: 'white' }}>
                <RefreshCw size={15} className={syncingExam ? 'animate-spin' : ''} />
                {syncingExam ? 'Syncing' : 'Sync Results'}
              </button>
            </div>
            {syncedAt && <p className="text-xs mt-2" style={{ color: muted }}>Last results sync: {new Date(syncedAt).toLocaleString()}</p>}
          </form>

          <form onSubmit={syncAttendance} className="rounded-xl p-4" style={{ background: '#0a0a0a', border: '1px solid #27272a' }}>
            <p className="text-sm font-semibold text-white">2. E-CAP · Attendance</p>
            <p className="text-xs mt-1" style={{ color: muted }}>info.aec.edu.in/acet Student/Parent login</p>
            <div className="flex flex-col sm:flex-row gap-2 mt-3">
              <input value={rollNo} readOnly className="px-3 py-2.5 rounded-lg text-sm text-zinc-300 outline-none sm:w-36" style={{ background: '#111', border: '1px solid #27272a' }} />
              <input type="password" value={ecapPassword} onChange={(e) => setEcapPassword(e.target.value)} placeholder="E-CAP password" autoComplete="off" className="flex-1 px-3 py-2.5 rounded-lg text-sm text-white outline-none" style={{ background: '#111', border: '1px solid #3f3f46' }} />
              <button type="submit" disabled={syncingAttendance} className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-60" style={{ background: '#0891b2', color: 'white' }}>
                <RefreshCw size={15} className={syncingAttendance ? 'animate-spin' : ''} />
                {syncingAttendance ? 'Syncing' : 'Sync Attendance'}
              </button>
            </div>
            {attendanceSyncedAt && <p className="text-xs mt-2" style={{ color: muted }}>Last attendance sync: {new Date(attendanceSyncedAt).toLocaleString()}</p>}
          </form>
        </div>

        <div className="flex items-center gap-2 mt-4 text-xs" style={{ color: '#a1a1aa' }}>
          <ShieldCheck size={14} style={{ color: '#10b981' }} />
          Portal passwords are not written to Firestore or local storage.
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
            <div className="flex items-center gap-2 mb-4"><Activity size={18} style={{ color: '#06b6d4' }} /><h2 className="text-base font-bold text-white">Current Subject Attendance</h2></div>
            {currentSubjects.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr style={{ color: muted }}><th className="text-left py-2 pr-4">Subject</th><th className="text-right py-2 px-3">Held</th><th className="text-right py-2 px-3">Attend</th><th className="text-right py-2 pl-3">%</th></tr></thead>
                  <tbody>{currentSubjects.map((item) => <tr key={`${item.subject}-${item.held}-${item.attended}`} style={{ borderTop: '1px solid #27272a' }}><td className="py-3 pr-4 font-medium text-zinc-100">{item.subject}</td><td className="text-right py-3 px-3 text-zinc-400">{item.held}</td><td className="text-right py-3 px-3 text-zinc-400">{item.attended}</td><td className="text-right py-3 pl-3 font-semibold" style={{ color: item.percentage < 75 ? '#f87171' : '#34d399' }}>{item.percentage}%</td></tr>)}</tbody>
                </table>
              </div>
            ) : <p className="text-sm text-zinc-300">Attendance ke liye upar E-CAP password enter karke <b>Sync Attendance</b> dabao.</p>}
          </section>

          <section className="rounded-2xl p-6" style={cardStyle}>
            <div className="flex items-center gap-2 mb-4"><BookOpen size={18} style={{ color: '#f97316' }} /><h2 className="text-base font-bold text-white">Semester Results</h2></div>
            <p className="text-xs mb-4" style={{ color: muted }}>Semester par click karo to subjects, marks/grade, credits aur result details open hongi.</p>
            {displaySemesters.length ? (
              <div className="space-y-3">
                {displaySemesters.map((semester, index) => {
                  const semNo = semester.semesterNumber || index + 1;
                  const isOpen = openSemester === semNo;
                  const subjects = semester.subjects || [];
                  return (
                    <div key={`semester-${semNo}`} className="rounded-xl overflow-hidden" style={{ background: '#0a0a0a', border: '1px solid #27272a' }}>
                      <button type="button" onClick={() => setOpenSemester(isOpen ? null : semNo)} className="w-full p-4 flex items-center justify-between gap-3 text-left hover:bg-zinc-900/50 transition-colors">
                        <div className="flex items-center gap-3">
                          {isOpen ? <ChevronDown size={17} className="text-zinc-400" /> : <ChevronRight size={17} className="text-zinc-400" />}
                          <div><h3 className="text-sm font-semibold text-white">{semester.semester || `Semester ${semNo}`}</h3><p className="text-xs mt-1" style={{ color: muted }}>{subjects.length ? `${subjects.length} subject result row${subjects.length === 1 ? '' : 's'}` : 'Click to view result details'}</p></div>
                        </div>
                        <span className="text-sm font-bold whitespace-nowrap" style={{ color: '#fdba74' }}>SGPA {semester.sgpa ?? '—'}</span>
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-4" style={{ borderTop: '1px solid #1f1f22' }}>
                          {subjects.length ? <ResultTable subjects={subjects} /> : <p className="text-sm py-4" style={{ color: muted }}>Portal se SGPA mila hai, lekin is semester ke subject rows abhi expose nahi hue. Sync Results dubara karne par detailed marks pages bhi read hote hain.</p>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : <p className="text-sm" style={{ color: muted }}>No semester result data available yet.</p>}
          </section>
        </>
      ) : (
        <section className="rounded-2xl p-10 text-center" style={cardStyle}>
          <GraduationCap size={34} className="mx-auto mb-3" style={{ color: '#52525b' }} />
          <h2 className="text-base font-semibold text-white">No academic snapshot yet</h2>
          <p className="text-sm mt-1" style={{ color: muted }}>Exam Section password se results sync karo; E-CAP password se attendance sync karo.</p>
        </section>
      )}
    </div>
  );
}
