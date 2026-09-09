import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Edit2, Loader2, Plus, Save, Search, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { collection, deleteDoc, doc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { LoadingSkeleton } from '../../components/shared/LoadingSkeleton';
import { calculatePlacementIndex, exportToCSV, generateInitials, getAvatarColor } from '../../utils/helpers';

const DEPTS = ['Computer Science', 'Information Tech', 'Electronics', 'Mechanical', 'Civil'];
const clean = (value) => value === undefined || value === null ? '' : String(value).trim();
const first = (...values) => values.find((value) => value !== undefined && value !== null && clean(value) !== '');
const num = (...values) => {
  const value = first(...values);
  if (value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const branchArray = (value) => Array.isArray(value) ? value.map(clean).filter(Boolean) : (clean(value) ? [clean(value)] : []);

function normalizeStudent(id, data = {}) {
  const academic = data.academicSnapshot || {};
  const profile = academic.profile || {};
  const rollNo = clean(first(data.rollNo, data.roll_no, profile.rollNo, profile.roll_no, id)).toUpperCase();
  const name = clean(first(data.name, data.first_name, profile.name, profile.first_name, rollNo, 'Student'));
  const passoutYear = first(data.passoutYear, data.passout_year, profile.passoutYear, profile.passout_year, academic.passoutYear, academic.passout_year) ?? '';
  const college = clean(first(data.college, profile.college, academic.college));
  const branch = branchArray(first(data.branch, profile.branch, academic.branch));
  const btech = num(data.btech, data.btechPercentage, profile.btech, profile.btechPercentage, academic.btech, academic.overallPercentage, academic.percentage);
  const cgpa = num(data.cgpa, academic.cgpa, profile.cgpa);
  const backlogs = num(data.backlogs, profile.backlogs, academic.backlogs) ?? 0;
  return {
    ...data,
    id,
    name,
    first_name: data.first_name || name,
    rollNo,
    roll_no: data.roll_no || rollNo,
    passoutYear,
    passout_year: data.passout_year ?? passoutYear,
    college,
    branch,
    btech,
    cgpa,
    backlogs,
  };
}

function normalizeResult(id, data = {}) {
  const rollNo = clean(first(data.rollNo, data.roll_no, data.studentRollNo)).toUpperCase();
  return { id, ...data, rollNo, roll_no: data.roll_no || rollNo };
}

async function fetchLiveCollegeProfile(student) {
  if (!student?.rollNo) return null;
  try {
    const idResponse = await fetch('/api/get-student-id-by-rollno', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ roll_no: student.rollNo }),
    });
    const idPayload = idResponse.ok ? await idResponse.json().catch(() => null) : null;
    if (!idPayload?.success || !idPayload?.objectId) return null;

    const profileResponse = await fetch(`/api/get-user-by-id/${encodeURIComponent(idPayload.objectId)}`, {
      headers: { Accept: 'application/json' },
    });
    if (!profileResponse.ok) return null;
    const profile = await profileResponse.json().catch(() => null);
    if (!profile || typeof profile !== 'object') return null;

    const cache = {};
    const liveCollege = clean(profile.college);
    const liveBranch = branchArray(profile.branch);
    const livePassout = first(profile.passout_year, profile.passoutYear);
    const liveBacklogs = num(profile.backlogs);
    const liveBtech = num(profile.btech);

    if (liveCollege) cache.college = liveCollege;
    if (!student.branch?.length && liveBranch.length) cache.branch = liveBranch;
    if (livePassout !== undefined && clean(livePassout)) cache.passout_year = livePassout;
    if (liveBacklogs !== null) cache.backlogs = liveBacklogs;
    if (liveBtech !== null) cache.btech = liveBtech;

    if (Object.keys(cache).length) {
      await setDoc(doc(db, 'students', student.id), cache, { merge: true });
    }

    return normalizeStudent(student.id, { ...student, ...cache });
  } catch (error) {
    console.warn(`Live college profile unavailable for ${student?.rollNo || student?.id}:`, error);
    return null;
  }
}

export default function AdminStudents() {
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState([]);
  const [results, setResults] = useState([]);
  const [search, setSearch] = useState('');
  const [college, setCollege] = useState('All');
  const [branch, setBranch] = useState('All');
  const [modalStudent, setModalStudent] = useState(undefined);
  const [deleteId, setDeleteId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [studentSnap, resultSnap] = await Promise.all([
          getDocs(collection(db, 'students')),
          getDocs(collection(db, 'results')),
        ]);
        const resultList = resultSnap.docs.map((item) => normalizeResult(item.id, item.data()));
        let studentList = studentSnap.docs.map((item) => {
          const student = normalizeStudent(item.id, item.data());
          return {
            ...student,
            placementIndex: calculatePlacementIndex(student, resultList, {
              githubStats: student.githubStats,
              codingProfiles: student.codingProfiles,
            }),
          };
        });

        setResults(resultList);
        setStudents(studentList);

        const enriched = await Promise.all(studentList.map(async (student) => {
          const needsLiveProfile = !student.college || !student.passoutYear || student.btech === null;
          if (!needsLiveProfile) return student;
          const live = await fetchLiveCollegeProfile(student);
          if (!live) return student;
          return {
            ...live,
            placementIndex: calculatePlacementIndex(live, resultList, {
              githubStats: live.githubStats,
              codingProfiles: live.codingProfiles,
            }),
          };
        }));

        studentList = enriched;
        setStudents(studentList);
      } catch (error) {
        console.error('Admin students load failed:', error);
        toast.error('Failed to load students');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const colleges = useMemo(() => ['All', ...new Set(students.map((s) => s.college).filter(Boolean))], [students]);
  const branches = useMemo(() => ['All', ...new Set(students.flatMap((s) => s.branch || []).filter(Boolean))], [students]);
  const filtered = useMemo(() => students.filter((student) => {
    const query = search.trim().toLowerCase();
    const searchOk = !query || student.name.toLowerCase().includes(query) || student.rollNo.toLowerCase().includes(query);
    const collegeOk = college === 'All' || student.college === college;
    const branchOk = branch === 'All' || student.branch.includes(branch);
    return searchOk && collegeOk && branchOk;
  }), [students, search, college, branch]);

  const saveStudent = async (form) => {
    setSaving(true);
    try {
      const rollNo = clean(form.rollNo || modalStudent?.rollNo).toUpperCase();
      if (!rollNo) throw new Error('Roll number is required');
      const payload = {
        name: clean(form.name),
        first_name: clean(form.name),
        email: clean(form.email).toLowerCase(),
        rollNo,
        roll_no: rollNo,
        phone: clean(form.phone),
        githubUsername: clean(form.githubUsername),
        department: form.department || 'Computer Science',
        year: Number(form.year) || 1,
        cgpa: Number(form.cgpa) || 0,
      };
      const targetId = modalStudent?.id || rollNo;
      if (modalStudent?.id) await updateDoc(doc(db, 'students', targetId), payload);
      else await setDoc(doc(db, 'students', targetId), payload);
      const next = normalizeStudent(targetId, { ...(modalStudent || {}), ...payload });
      next.placementIndex = calculatePlacementIndex(next, results, {
        githubStats: next.githubStats,
        codingProfiles: next.codingProfiles,
      });
      setStudents((current) => modalStudent?.id
        ? current.map((student) => student.id === targetId ? next : student)
        : [next, ...current]);
      toast.success(modalStudent?.id ? 'Student updated' : 'Student added');
      setModalStudent(undefined);
    } catch (error) {
      console.error('Student save failed:', error);
      toast.error(error.message || 'Failed to save student');
    } finally {
      setSaving(false);
    }
  };

  const removeStudent = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'students', deleteId));
      setStudents((current) => current.filter((student) => student.id !== deleteId));
      setDeleteId(null);
      toast.success('Student removed');
    } catch (error) {
      console.error('Student delete failed:', error);
      toast.error('Failed to delete student');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <LoadingSkeleton type="table" rows={6} />;

  return (
    <div className="space-y-6">
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="page-title">Student Management</h1>
          <p className="page-subtitle">{filtered.length} students total</p>
        </div>
        <div className="flex gap-2.5">
          <button onClick={() => exportToCSV(students, 'students')} className="btn btn-ghost"><Download size={14} /> Export</button>
          <button onClick={() => setModalStudent(null)} className="btn btn-primary"><Plus size={14} /> Add Student</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 items-center">
        <div className="relative flex-1 min-w-60">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or roll number…" className="input w-full pl-9" style={{ background: '#0a0a0a', border: '1px solid #27272a' }} />
        </div>
        <select value={college} onChange={(e) => setCollege(e.target.value)} className="input min-w-40" style={{ background: '#0a0a0a', border: '1px solid #27272a', color: '#fafafa' }}>
          {colleges.map((value) => <option key={value}>{value}</option>)}
        </select>
        <select value={branch} onChange={(e) => setBranch(e.target.value)} className="input min-w-40" style={{ background: '#0a0a0a', border: '1px solid #27272a', color: '#fafafa' }}>
          {branches.map((value) => <option key={value}>{value}</option>)}
        </select>
      </div>

      <div className="table-wrapper">
        <div className="table-scroll">
          <table className="w-full">
            <thead><tr>{['Student', 'Roll No.', 'College', 'Branch', 'Backlogs', 'B.Tech %', 'PI Score', 'Actions'].map((head) => <th key={head} className="text-left py-3 px-4" style={{ color: '#71717a', fontWeight: 600, fontSize: '0.8125rem' }}>{head}</th>)}</tr></thead>
            <tbody>
              {filtered.map((student, index) => (
                <motion.tr key={student.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: index * 0.03 }} className="border-b border-zinc-800/50">
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: getAvatarColor(student.name) }}>{generateInitials(student.name)}</div>
                      <div><p className="text-sm font-semibold text-white">{student.name}</p><p className="text-xs text-zinc-500 mt-0.5">Passout: {student.passoutYear || 'N/A'}</p></div>
                    </div>
                  </td>
                  <td className="py-4 px-4">{student.rollNo || 'N/A'}</td>
                  <td className="py-4 px-4">{student.college || 'N/A'}</td>
                  <td className="py-4 px-4">{student.branch.length ? student.branch.join(', ') : 'N/A'}</td>
                  <td className="py-4 px-4"><span style={{ color: student.backlogs > 0 ? '#ef4444' : '#10b981', fontWeight: 600 }}>{student.backlogs}</span></td>
                  <td className="py-4 px-4"><span className="font-bold text-amber-400">{student.btech === null ? 'N/A' : `${student.btech}%`}</span></td>
                  <td className="py-4 px-4"><span className="inline-flex px-3 py-1 rounded-full text-xs font-bold" style={{ background: 'rgba(249,115,22,.12)', color: '#fb923c', border: '1px solid rgba(249,115,22,.3)' }}>{student.placementIndex ?? 0}/100</span></td>
                  <td className="py-4 px-4"><div className="flex gap-1.5"><button onClick={() => setModalStudent(student)} className="w-8 h-8 rounded-lg flex items-center justify-center text-orange-300" style={{ background: 'rgba(249,115,22,.1)' }}><Edit2 size={13} /></button><button onClick={() => setDeleteId(student.id)} className="w-8 h-8 rounded-lg flex items-center justify-center text-red-500" style={{ background: 'rgba(239,68,68,.1)' }}><Trash2 size={13} /></button></div></td>
                </motion.tr>
              ))}
              {!filtered.length && <tr><td colSpan={8} className="text-center py-16 text-zinc-500">No students found</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>{modalStudent !== undefined && <StudentModal student={modalStudent} onClose={() => setModalStudent(undefined)} onSave={saveStudent} saving={saving} />}</AnimatePresence>
      <AnimatePresence>{deleteId && createPortal(<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.85)' }} onClick={() => setDeleteId(null)}><motion.div initial={{ scale: .95 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()} className="rounded-2xl p-8 max-w-sm w-full" style={{ background: '#0a0a0a', border: '1px solid #27272a' }}><h3 className="font-bold text-xl text-white text-center mb-2">Remove Student?</h3><p className="text-sm text-zinc-400 text-center mb-6">This removes the Firestore student record.</p><div className="flex gap-3"><button onClick={() => setDeleteId(null)} className="flex-1 py-3 rounded-xl bg-zinc-900 text-zinc-400">Cancel</button><button onClick={removeStudent} disabled={deleting} className="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold flex justify-center">{deleting ? <Loader2 size={16} className="animate-spin" /> : 'Delete'}</button></div></motion.div></motion.div>, document.body)}</AnimatePresence>
    </div>
  );
}

function StudentModal({ student, onClose, onSave, saving }) {
  const [form, setForm] = useState({
    name: student?.name || '',
    email: student?.email || '',
    rollNo: student?.rollNo || student?.roll_no || '',
    department: student?.department || 'Computer Science',
    year: student?.year || 1,
    cgpa: student?.cgpa || 0,
    phone: student?.phone || '',
    githubUsername: student?.githubUsername || '',
  });
  const change = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  return createPortal(
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.85)' }} onClick={onClose}>
      <motion.div initial={{ scale: .96, y: 16 }} animate={{ scale: 1, y: 0 }} onClick={(e) => e.stopPropagation()} className="rounded-2xl p-8 w-full max-w-lg" style={{ background: '#0a0a0a', border: '1px solid #27272a' }}>
        <div className="flex justify-between items-center mb-6"><h3 className="font-bold text-xl text-white">{student ? 'Edit Student Profile' : 'Add New Student'}</h3><button onClick={onClose} className="text-zinc-500"><X size={22} /></button></div>
        <div className="grid grid-cols-2 gap-4">
          {[['Full Name','name','text'],['Academic Email','email','email'],['Roll Number','rollNo','text'],['Phone','phone','text'],['GitHub Username','githubUsername','text'],['Current CGPA','cgpa','number']].map(([label,key,type]) => <div key={key} className={key === 'name' || key === 'email' ? 'col-span-2' : ''}><label className="block text-sm font-semibold mb-2 text-zinc-300">{label}</label><input type={type} value={form[key]} onChange={change(key)} className="w-full px-4 py-3 rounded-xl text-sm outline-none" style={{ background: '#000', border: '1px solid #27272a', color: '#fafafa' }} /></div>)}
          <div><label className="block text-sm font-semibold mb-2 text-zinc-300">Department</label><select value={form.department} onChange={change('department')} className="w-full px-4 py-3 rounded-xl text-sm" style={{ background: '#000', border: '1px solid #27272a', color: '#fafafa' }}>{DEPTS.map((value) => <option key={value}>{value}</option>)}</select></div>
          <div><label className="block text-sm font-semibold mb-2 text-zinc-300">Current Year</label><select value={form.year} onChange={change('year')} className="w-full px-4 py-3 rounded-xl text-sm" style={{ background: '#000', border: '1px solid #27272a', color: '#fafafa' }}>{[1,2,3,4].map((value) => <option key={value} value={value}>Year {value}</option>)}</select></div>
        </div>
        <div className="flex gap-3 mt-7"><button onClick={onClose} disabled={saving} className="flex-1 py-3 rounded-xl bg-zinc-900 text-zinc-400">Cancel</button><button onClick={() => onSave(form)} disabled={saving} className="flex-1 py-3 rounded-xl text-white font-bold flex items-center justify-center gap-2" style={{ background: 'linear-gradient(135deg,#f97316,#f59e0b)' }}>{saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}{saving ? 'Saving...' : (student ? 'Update Profile' : 'Add Student')}</button></div>
      </motion.div>
    </motion.div>,
    document.body
  );
}
