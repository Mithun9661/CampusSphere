import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { generateInitials, getAvatarColor } from '../../utils/helpers';
import { Trophy, Star, Plus, Loader2, Search, X } from 'lucide-react';
import { LoadingSkeleton } from '../../components/shared/LoadingSkeleton';
import toast from 'react-hot-toast';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase/firebase';

const BADGES = [
  { id: 'b1', name: 'Algorithm Pro', icon: '🧠', color: '#f59e0b' },
  { id: 'b2', name: 'Code Ninja', icon: '🥷', color: '#10b981' },
  { id: 'b3', name: 'Top Performer', icon: '⭐', color: '#f97316' },
  { id: 'b4', name: 'Database Guru', icon: '🗄️', color: '#06b6d4' },
  { id: 'b5', name: 'Web Master', icon: '🌐', color: '#8b5cf6' },
];

export default function AdminBadges() {
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState([]);
  const [awardedList, setAwardedList] = useState([]);
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const studSnap = await getDocs(collection(db, 'students'));
        const studentsData = studSnap.docs.map(d => ({ 
          id: d.id, 
          ...d.data() 
        }));
        setStudents(studentsData);
        
        const awSnap = await getDocs(collection(db, 'awardedBadges'));
        const awardedData = awSnap.docs.map(d => ({ docId: d.id, ...d.data() }));
        setAwardedList(awardedData);
      } catch (err) {
        console.error('Error loading badges:', err);
        toast.error('Failed to load data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  /**
   * Award badge to student
   */
  const awardBadge = async (studentRollNo, badgeId) => {
    // Check if badge already awarded
    const already = awardedList.find(a => a.studentRollNo === studentRollNo && a.badgeId === badgeId);
    if (already) { 
      toast.error('Badge already awarded to this student'); 
      setActiveDropdown(null); 
      return; 
    }

    setIsSaving(true);
    try {
      const student = students.find(s => s.rollNo === studentRollNo);
      const docId = `${studentRollNo}_${badgeId}`;
      const payload = { 
        studentId: student?.id || null,
        studentRollNo,
        studentName: student?.name || studentRollNo,
        badgeId, 
        awardedDate: new Date().toISOString().slice(0, 10),
        awardedAt: new Date().toISOString()
      };
      
      await setDoc(doc(db, 'awardedBadges', docId), payload);
      
      // Update local state
      setAwardedList(p => [...p, { docId, ...payload }]);
      
      const badge = BADGES.find(b => b.id === badgeId);
      toast.success(`${badge?.name} awarded to ${student?.name || studentRollNo}!`);
      setActiveDropdown(null);
    } catch (e) {
      console.error('Error awarding badge:', e);
      toast.error('Error awarding badge: ' + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Remove awarded badge
   */
  const removeBadge = async (studentRollNo, badgeId) => {
    if (!window.confirm('Remove this badge?')) return;
    
    setIsSaving(true);
    try {
      const docId = `${studentRollNo}_${badgeId}`;
      await deleteDoc(doc(db, 'awardedBadges', docId));
      
      setAwardedList(p => p.filter(a => !(a.studentRollNo === studentRollNo && a.badgeId === badgeId)));
      
      const badge = BADGES.find(b => b.id === badgeId);
      toast.success(`${badge?.name} removed!`);
    } catch (e) {
      console.error('Error removing badge:', e);
      toast.error('Error removing badge');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) return <LoadingSkeleton type="card" />;

  // Filter students by search query
  const filteredStudents = students.filter(s => 
    (s.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (s.rollNo || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Badge Management</h1>
        <p className="text-sm mt-1" style={{ color: '#71717a' }}>Award and manage student achievement badges</p>
      </div>

      {/* Badge catalog */}
      <div>
        <h3 className="font-semibold text-white mb-3">Available Badges</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {BADGES.map((badge, i) => (
            <motion.div key={badge.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }}
              className="rounded-2xl p-4 text-center"
              style={{ background: `${badge.color}10`, border: `1px solid ${badge.color}30` }}>
              <div className="text-3xl mb-2">{badge.icon}</div>
              <p className="text-xs font-semibold text-white">{badge.name}</p>
              <p className="text-xs mt-1" style={{ color: '#71717a' }}>
                {awardedList.filter(a => a.badgeId === badge.id).length} awarded
              </p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Student badge assignments */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-white">Award Badges to Students</h3>
          <span className="text-xs" style={{ color: '#71717a' }}>{filteredStudents.length} students</span>
        </div>

        {/* Search box */}
        <div className="relative mb-4">
          <Search size={16} className="absolute left-3.5 top-3.5 pointer-events-none" style={{ color: '#71717a' }} />
          <input
            type="text"
            placeholder="Search by name or roll number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none transition-all"
            style={{ background: '#0a0a0a', border: '1px solid #27272a', color: '#fafafa' }}
          />
        </div>

        {filteredStudents.length === 0 ? (
          <div className="text-center py-8">
            <p style={{ color: '#71717a' }}>No students found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredStudents.map((student, i) => {
              const studentAwards = awardedList.filter(a => a.studentRollNo === student.rollNo);
              const studentBadges = studentAwards.map(a => BADGES.find(b => b.id === a.badgeId)).filter(Boolean);

              return (
                <motion.div key={student.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
                  className="flex items-center gap-4 p-4 rounded-2xl"
                  style={{ background: '#121212', border: '1px solid #27272a' }}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                    style={{ background: getAvatarColor(student.name) }}>
                    {generateInitials(student.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white text-sm">{student.name || student.rollNo || 'Student'}</p>
                    <p className="text-xs" style={{ color: '#71717a' }}>
                      {student.rollNo} · {student.branch?.[0] || 'N/A'} · B.Tech: {student.btech || 0}%
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap max-w-xs">
                    {studentBadges.map(b => (
                      <div key={b.id} className="relative group">
                        <span 
                          title={b.name} 
                          className="text-lg cursor-pointer transition-transform hover:scale-125"
                          style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}>
                          {b.icon}
                        </span>
                        <button
                          onClick={() => removeBadge(student.rollNo, b.id)}
                          disabled={isSaving}
                          className="absolute -top-2 -right-2 hidden group-hover:flex items-center justify-center w-5 h-5 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                          style={{ background: '#ef4444', color: 'white' }}
                          title="Remove badge"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                    {studentBadges.length === 0 && (
                      <span className="text-xs" style={{ color: '#475569' }}>No badges</span>
                    )}
                  </div>
                  <div className="relative">
                    <button onClick={() => setActiveDropdown(activeDropdown === student.rollNo ? null : student.rollNo)} 
                      disabled={isSaving}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-orange-500/20"
                      style={{ background: 'rgba(249,115,22,0.15)', color: '#f97316', border: '1px solid rgba(249,115,22,0.3)', opacity: isSaving ? 0.5 : 1 }}>
                      {isSaving && activeDropdown === student.rollNo ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} 
                      Award
                    </button>
                    {activeDropdown === student.rollNo && (
                      <div className="absolute right-0 top-full mt-2 w-48 rounded-xl overflow-hidden z-20"
                        style={{ background: '#1c1917', border: '1px solid #3f3f46', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
                        {BADGES.map(b => {
                          const alreadyAwarded = awardedList.find(a => a.studentRollNo === student.rollNo && a.badgeId === b.id);
                          return (
                            <button key={b.id} 
                              onClick={() => awardBadge(student.rollNo, b.id)}
                              disabled={alreadyAwarded}
                              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/10 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <span className="text-lg">{b.icon}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-white">{b.name}</p>
                                {alreadyAwarded && <p className="text-[10px]" style={{ color: '#71717a' }}>Already awarded</p>}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
