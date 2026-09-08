import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Plus, Edit2, Trash2, Download, X, Save, Loader2 } from 'lucide-react';
import { LoadingSkeleton } from '../../components/shared/LoadingSkeleton';
import { generateInitials, getAvatarColor, exportToCSV, calculatePlacementIndex } from '../../utils/helpers';
import toast from 'react-hot-toast';
import { collection, getDocs, doc, deleteDoc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';

const DEPTS = ['All', 'Computer Science', 'Information Tech', 'Electronics', 'Mechanical', 'Civil'];

export default function AdminStudents() {
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedCollege, setSelectedCollege] = useState('All');
  const [selectedBranch, setSelectedBranch] = useState('All');
  const [colleges, setColleges] = useState(['All']);
  const [branches, setBranches] = useState(['All']);
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editStudent, setEditStudent] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const PER_PAGE = 6;

  useEffect(() => {
    const fetchStudents = async () => {
      try {
        const [studentsSnapshot, resultsSnapshot] = await Promise.all([
          getDocs(collection(db, 'students')),
          getDocs(collection(db, 'results')),
        ]);

        const resultsList = resultsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const studentsList = studentsSnapshot.docs.map(doc => {
          const student = { id: doc.id, ...doc.data() };
          return {
            ...student,
            placementIndex: calculatePlacementIndex(student, resultsList, {
              githubStats: student.githubStats,
            }),
          };
        });

        setStudents(studentsList);
        
        // Extract unique filters
        const uniqueColleges = ['All', ...new Set(studentsList.map(s => s.college).filter(Boolean))];
        const uniqueBranches = ['All', ...new Set(studentsList.flatMap(s => s.branch || []).filter(Boolean))];
        setColleges(uniqueColleges);
        setBranches(uniqueBranches);
      } catch (error) {
        console.error("Error fetching students:", error);
        toast.error('Failed to load students');
      } finally {
        setLoading(false);
      }
    };
    fetchStudents();
  }, []);

  const filtered = students.filter(s => {
    const matchesSearch = (s.name || '').toLowerCase().includes(search.toLowerCase()) || 
                          (s.rollNo || '').toLowerCase().includes(search.toLowerCase());
    const matchesCollege = selectedCollege === 'All' || s.college === selectedCollege;
    const matchesBranch = selectedBranch === 'All' || (s.branch && s.branch.includes(selectedBranch));
    return matchesSearch && matchesCollege && matchesBranch;
  });

  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const totalPages = Math.ceil(filtered.length / PER_PAGE);

  const handleDelete = async (id) => { 
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'students', id));
      setStudents(prev => prev.filter(s => s.id !== id)); 
      setDeleteConfirm(null); 
      toast.success('Student removed'); 
    } catch (err) {
      toast.error('Failed to delete student');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSave = async (data) => {
    setIsSaving(true);
    try {
      if (editStudent?.id) {
        await updateDoc(doc(db, 'students', editStudent.id), data);
        setStudents(prev => prev.map(s => s.id === editStudent.id ? { ...s, ...data } : s));
        toast.success('Student updated');
      } else {
        const newRoll = data.rollNo || `temp_${Date.now()}`;
        await setDoc(doc(db, 'students', newRoll), data);
        setStudents(prev => [{ ...data, id: newRoll }, ...prev]);
        toast.success('Student added');
      }
      setModalOpen(false); setEditStudent(null);
    } catch (err) {
      toast.error('Failed to save student');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) return <LoadingSkeleton type="table" rows={6} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="page-title">Student Management</h1>
          <p className="page-subtitle">{filtered.length} students total</p>
        </div>
        <div style={{ display: 'flex', gap: '0.625rem' }}>
          <button onClick={() => exportToCSV(students, 'students')} className="btn btn-ghost">
            <Download size={14} /> Export
          </button>
          <button onClick={() => { setEditStudent(null); setModalOpen(true); }} className="btn btn-primary">
            <Plus size={14} /> Add Student
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#71717a' }} />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name or roll number…"
            className="input w-full" style={{ paddingLeft: 36, background: '#0a0a0a', border: '1px solid #27272a' }} />
        </div>
        
        <select value={selectedCollege} onChange={e => { setSelectedCollege(e.target.value); setPage(1); }}
          className="input" style={{ minWidth: 150, background: '#0a0a0a', border: '1px solid #27272a', color: '#fafafa' }}>
          {colleges.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select value={selectedBranch} onChange={e => { setSelectedBranch(e.target.value); setPage(1); }}
          className="input" style={{ minWidth: 150, background: '#0a0a0a', border: '1px solid #27272a', color: '#fafafa' }}>
          {branches.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="table-wrapper">
        <div className="table-scroll">
          <table className="w-full">
            <thead>
              <tr>
                {['Student', 'Roll No.', 'College', 'Branch', 'Backlogs', 'B.Tech %', 'PI Score', 'Actions'].map(h => (
                  <th key={h} className="text-left py-3 px-4" style={{ color: '#71717a', fontWeight: 600, fontSize: '0.8125rem' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {paged.map((s, i) => (
                  <motion.tr key={s.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ delay: i * 0.04 }} className="border-b border-zinc-800/50">
                    <td className="py-4 px-4">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ width: 34, height: 34, borderRadius: '50%', background: getAvatarColor(s.name || s.rollNo), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6875rem', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                          {generateInitials(s.name || s.rollNo || 'S')}
                        </div>
                        <div>
                          <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#fafafa' }}>{s.name || 'Unknown'}</p>
                          <p style={{ fontSize: '0.75rem', color: '#71717a', marginTop: 2 }}>Passout: {s.passoutYear || 'N/A'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4">{s.rollNo}</td>
                    <td className="py-4 px-4">{s.college || 'N/A'}</td>
                    <td className="py-4 px-4">{s.branch ? s.branch.join(', ') : 'N/A'}</td>
                    <td className="py-4 px-4"><span style={{ color: s.backlogs > 0 ? '#ef4444' : '#10b981', fontWeight: 600 }}>{s.backlogs || 0}</span></td>
                    <td className="py-4 px-4"><span style={{ fontWeight: 700, color: '#f59e0b' }}>{s.btech || '0'}%</span></td>
                    <td className="py-4 px-4">
                      <span
                        className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold"
                        style={{
                          background: s.placementIndex >= 80 ? 'rgba(16,185,129,0.12)' : s.placementIndex >= 65 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)',
                          color: s.placementIndex >= 80 ? '#10b981' : s.placementIndex >= 65 ? '#f59e0b' : '#ef4444',
                          border: `1px solid ${s.placementIndex >= 80 ? 'rgba(16,185,129,0.3)' : s.placementIndex >= 65 ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.3)'}`,
                        }}
                      >
                        {s.placementIndex ?? 0}/100
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div style={{ display: 'flex', gap: '0.375rem' }}>
                        <button onClick={() => { setEditStudent(s); setModalOpen(true); }}
                          style={{ width: 30, height: 30, borderRadius: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(249, 115, 22,0.1)', color: '#fdba74', border: 'none', cursor: 'pointer' }}><Edit2 size={13} /></button>
                        <button onClick={() => setDeleteConfirm(s.id)}
                          style={{ width: 30, height: 30, borderRadius: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: 'none', cursor: 'pointer' }}><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
              {paged.length === 0 && (
                <tr><td colSpan={7} className="text-center py-16 text-base" style={{ color: '#71717a' }}>No students found</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="table-pagination">
            <span>Page {page} of {totalPages}</span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn btn-ghost" style={{ padding: '0.375rem 0.75rem', fontSize: '0.8125rem' }}>Previous</button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn btn-ghost" style={{ padding: '0.375rem 0.75rem', fontSize: '0.8125rem' }}>Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {modalOpen && (
          <StudentModal 
            student={editStudent} 
            onClose={() => { setModalOpen(false); setEditStudent(null); }} 
            onSave={handleSave} 
            isSaving={isSaving} 
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteConfirm && createPortal(
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)' }} onClick={() => setDeleteConfirm(null)}>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              onClick={e => e.stopPropagation()} className="rounded-2xl p-8 max-w-sm w-full"
              style={{ background: '#0a0a0a', border: '1px solid #27272a', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)' }}>
              <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-5">
                <Trash2 size={32} className="text-red-500" />
              </div>
              <h3 className="font-bold text-xl text-white text-center mb-2">Remove Student?</h3>
              <p className="text-sm text-center mb-8" style={{ color: '#a1a1aa' }}>This action is permanent and will remove all student records and associated data.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-3.5 rounded-xl text-sm font-medium transition-colors hover:bg-zinc-800 bg-zinc-900 text-zinc-400" disabled={isDeleting}
                  style={{ opacity: isDeleting ? 0.5 : 1 }}>Cancel</button>
                <button onClick={() => handleDelete(deleteConfirm)} disabled={isDeleting} className="flex-1 py-3.5 rounded-xl flex items-center justify-center gap-2 text-sm font-bold text-white transition-transform hover:scale-[1.02]"
                  style={{ background: '#ef4444', opacity: isDeleting ? 0.5 : 1 }}>
                  {isDeleting ? <Loader2 size={16} className="animate-spin" /> : 'Delete Record'}
                </button>
              </div>
            </motion.div>
          </motion.div>,
          document.body
        )}
      </AnimatePresence>
    </div>
  );
}

function StudentModal({ student, onClose, onSave, isSaving }) {
  const [form, setForm] = useState({
    name: student?.name || '', email: student?.email || '', rollNo: student?.rollNo || '',
    department: student?.department || 'Computer Science', year: student?.year || 1,
    cgpa: student?.cgpa || 0, phone: student?.phone || '', githubUsername: student?.githubUsername || '',
  });
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  return createPortal(
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)' }} onClick={onClose}>
      <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
        onClick={e => e.stopPropagation()} className="rounded-2xl p-8 w-full max-w-lg overflow-y-auto custom-scrollbar"
        style={{ background: '#0a0a0a', border: '1px solid #27272a', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)' }}>
        
        <style>
          {`
            .custom-scrollbar::-webkit-scrollbar { width: 6px; }
            .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
            .custom-scrollbar::-webkit-scrollbar-thumb { background: #27272a; border-radius: 10px; }
          `}
        </style>

        <div className="flex items-center justify-between mb-7">
          <h3 className="font-bold text-xl text-white">{student ? 'Edit Student Profile' : 'Add New Student'}</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors"><X size={24} /></button>
        </div>
        <div className="grid grid-cols-2 gap-5">
          {[
            { label: 'Full Name', key: 'name', type: 'text', col: 2, placeholder: 'e.g. John Doe' },
            { label: 'Academic Email', key: 'email', type: 'email', col: 2, placeholder: 'e.g. john@university.edu' },
            { label: 'Roll Number', key: 'rollNo', type: 'text', col: 1, placeholder: 'e.g. 21P31A0501' },
            { label: 'Phone', key: 'phone', type: 'text', col: 1, placeholder: 'e.g. +91 98765 43210' },
            { label: 'GitHub Username', key: 'githubUsername', type: 'text', col: 1, placeholder: 'e.g. johndoe' },
            { label: 'Current CGPA', key: 'cgpa', type: 'number', col: 1, placeholder: '0.00' },
          ].map(f => (
            <div key={f.key} className={f.col === 2 ? 'col-span-2' : ''}>
              <label className="block text-sm font-semibold mb-2 text-zinc-300">{f.label}</label>
              <input type={f.type} value={form[f.key]} onChange={set(f.key)} placeholder={f.placeholder}
                className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all focus:ring-2 focus:ring-orange-500/30"
                style={{ background: '#000000', border: '1px solid #27272a', color: '#fafafa' }} />
            </div>
          ))}
          <div>
            <label className="block text-sm font-semibold mb-2 text-zinc-300">Department</label>
            <select value={form.department} onChange={set('department')} className="w-full px-4 py-3 rounded-xl text-sm outline-none"
              style={{ background: '#000000', border: '1px solid #27272a', color: '#fafafa' }}>
              {DEPTS.filter(d => d !== 'All').map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2 text-zinc-300">Current Year</label>
            <select value={form.year} onChange={set('year')} className="w-full px-4 py-3 rounded-xl text-sm outline-none"
              style={{ background: '#000000', border: '1px solid #27272a', color: '#fafafa' }}>
              {[1, 2, 3, 4].map(y => <option key={y} value={y}>Year {y}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-3 mt-8 pt-4 border-t border-zinc-800">
          <button onClick={onClose} disabled={isSaving} className="flex-1 py-3.5 rounded-xl text-sm font-medium transition-colors hover:bg-zinc-800 bg-zinc-900 text-zinc-400" style={{ opacity: isSaving ? 0.5 : 1 }}>Cancel</button>
          <button onClick={() => onSave(form)} disabled={isSaving} className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold text-white transition-all hover:scale-[1.02]"
            style={{ background: 'linear-gradient(135deg,#f97316,#f59e0b)', opacity: isSaving ? 0.7 : 1 }}>
            {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} 
            {isSaving ? 'Saving...' : (student ? 'Update Profile' : 'Add Student')}
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}
