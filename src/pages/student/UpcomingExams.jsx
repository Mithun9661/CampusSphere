import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Clock, BookOpen, ExternalLink, ChevronRight, AlertCircle, Monitor, Code, UserCheck, Lock, CheckCircle, X, Loader2 } from 'lucide-react';
import { LoadingSkeleton } from '../../components/shared/LoadingSkeleton';
import { formatDate, getDaysUntil, getDifficultyColor } from '../../utils/helpers';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import toast from 'react-hot-toast';

const CountdownBadge = ({ days }) => {
  const color = days <= 3 ? '#ef4444' : days <= 7 ? '#f59e0b' : '#f97316';
  const label = days < 0 ? 'Past' : days === 0 ? 'Today!' : `${days}d left`;
  return (
    <span className="text-sm px-3 py-1.5 rounded-full font-semibold" style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}>
      {label}
    </span>
  );
};

export default function UpcomingExamsPage() {
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [exams, setExams] = useState([]);
  const [codeModalOpen, setCodeModalOpen] = useState(false);
  const [selectedExam, setSelectedExam] = useState(null);
  const [enteredCode, setEnteredCode] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState('');

  const fetchExams = async () => {
    setLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, 'exams'));
      const examsData = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.status === 'upcoming' || data.status === 'scheduled') {
          examsData.push({ id: doc.id, ...data });
        }
      });
      // Sort by date (ascending for upcoming exams)
      examsData.sort((a, b) => new Date(a.date) - new Date(b.date));
      setExams(examsData);
    } catch (error) {
      console.error("Error fetching exams: ", error);
      toast.error('Failed to load upcoming exams');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExams();
  }, []);

  /**
   * Validate exam code against examInvites collection
   */
  const validateExamCode = async (code) => {
    setIsValidating(true);
    setValidationError('');
    try {
      if (!selectedExam) {
        setValidationError('No exam selected');
        return false;
      }

      // Query examInvites collection for matching exam and code
      const q = query(
        collection(db, 'examInvites'),
        where('examId', '==', selectedExam.id),
        where('examCode', '==', code)
      );

      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setValidationError('Invalid exam code. Please check and try again.');
        return false;
      }

      // Valid code - get the invite document
      const inviteDoc = querySnapshot.docs[0].data();

      // Code is valid - redirect to exam portal
      toast.success('Code verified! Accessing exam portal...');
      console.log('Valid exam invite:', inviteDoc);

      // Simulate redirect to exam portal after short delay
      setTimeout(() => {
        if (selectedExam.examLink && selectedExam.examLink !== '#') {
          window.open(selectedExam.examLink, '_blank');
        } else {
          toast.info('Exam portal link not yet configured');
        }
      }, 500);

      // Close modal after successful validation
      setTimeout(() => {
        setCodeModalOpen(false);
        setEnteredCode('');
        setSelectedExam(null);
      }, 1000);

      return true;
    } catch (error) {
      console.error('Error validating exam code:', error);
      setValidationError('Error validating code. Please try again.');
      return false;
    } finally {
      setIsValidating(false);
    }
  };

  const handleAccessExam = (exam) => {
    setSelectedExam(exam);
    setEnteredCode('');
    setValidationError('');
    setCodeModalOpen(true);
  };

  const handleCodeSubmit = async (e) => {
    e.preventDefault();
    if (!enteredCode.trim()) {
      setValidationError('Please enter the 6-digit code');
      return;
    }
    await validateExamCode(enteredCode);
  };

  if (loading) return <LoadingSkeleton type="list" rows={5} />;

  const filteredExams = exams.filter(e => filter === 'all' || e.status === filter);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Upcoming Exams</h1>
          <p className="text-base mt-1.5" style={{ color: '#71717a' }}>Scheduled examinations and important dates</p>
        </div>
        <div className="flex items-center gap-2">
          {['all', 'upcoming', 'scheduled'].map(f => (
            <button
              key={f} onClick={() => setFilter(f)}
              className="px-4 py-2 rounded-xl text-sm font-medium capitalize transition-all"
              style={filter === f
                ? { background: 'rgba(249, 115, 22,0.18)', color: '#fdba74', border: '1px solid rgba(249, 115, 22,0.4)' }
                : { color: '#71717a', border: '1px solid #27272a' }
              }
            >{f}</button>
          ))}
        </div>
      </div>

      {/* Alert */}
      {exams.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="flex items-start gap-4 px-6 py-5 rounded-2xl"
          style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.28)' }}>
          <AlertCircle size={18} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 2 }} />
          <div>
            <p className="font-semibold text-sm" style={{ color: '#f59e0b' }}>Exam Season Approaching</p>
            <p className="text-sm mt-1" style={{ color: '#b45309' }}>You have {exams.length} upcoming exams. Stay prepared!</p>
          </div>
        </motion.div>
      )}

      {/* Exam cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <AnimatePresence>
          {filteredExams.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="col-span-full py-12 text-center text-zinc-500">
              No upcoming exams at the moment.
            </motion.div>
          ) : (
            filteredExams.map((exam, i) => {
              const days = getDaysUntil(exam.date);
              const diffColor = getDifficultyColor(exam.difficulty);
              const ExamTypeIcon = exam.examType === 'Coding' ? Code : exam.examType === 'AI Interview' ? UserCheck : Monitor;

              return (
                <motion.div
                  key={exam.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }} transition={{ delay: i * 0.1 }} whileHover={{ y: -2 }}
                  className="rounded-2xl p-7 cursor-pointer transition-all flex flex-col"
                  style={{ background: '#121212', border: '1px solid #27272a' }}
                >
                  <div className="flex items-start justify-between mb-5">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(249, 115, 22,0.15)' }}>
                        <ExamTypeIcon size={22} style={{ color: '#fdba74' }} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-white">{exam.title}</h3>
                          <span className="text-[10px] px-2 py-0.5 rounded uppercase font-bold" style={{ background: 'rgba(255,255,255,0.1)', color: '#a1a1aa' }}>
                            {exam.examType || 'MCQ'}
                          </span>
                        </div>
                        <p className="text-sm mt-1" style={{ color: '#71717a' }}>{exam.subject} &middot; {exam.department}</p>
                      </div>
                    </div>
                    <CountdownBadge days={days} />
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-5">
                    <div className="flex items-center gap-2.5">
                      <Calendar size={15} style={{ color: '#ffffff' }} />
                      <span className="text-sm" style={{ color: '#a1a1aa' }}>{formatDate(exam.date)}</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <Clock size={15} style={{ color: '#ffffff' }} />
                      <span className="text-sm" style={{ color: '#a1a1aa' }}>{exam.time}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 mb-5 flex-wrap">
                    <span className="text-xs px-3 py-1 rounded-full" style={{ background: `${diffColor}20`, color: diffColor }}>{exam.difficulty}</span>
                    <span className="text-xs px-3 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.05)', color: '#a1a1aa' }}>{exam.totalMarks} marks</span>
                    <span className="text-xs px-3 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.05)', color: '#a1a1aa' }}>{exam.duration}</span>
                  </div>

                  <div className="pt-4 mt-auto" style={{ borderTop: '1px solid #27272a' }}>
                    <p className="text-sm mb-3" style={{ color: '#71717a' }}>Syllabus: <span style={{ color: '#a1a1aa' }}>{exam.syllabus}</span></p>
                    <button 
                      onClick={() => handleAccessExam(exam)}
                      className="flex items-center gap-2 text-sm font-semibold hover:underline w-max transition-colors"
                      style={{ color: '#f97316' }}>
                      <Lock size={14} /> Access Exam Portal
                    </button>
                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>

      {/* Tips */}
      <div className="rounded-2xl p-7" style={{ background: '#121212', border: '1px solid #27272a' }}>
        <h3 className="font-semibold text-base text-white mb-5">📚 Preparation Tips</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { tip: 'Start revisions at least 2 weeks before the exam date', color: '#f97316' },
            { tip: 'Practice previous year papers for better performance', color: '#10b981' },
            { tip: 'Focus on high-weight topics from the syllabus', color: '#f59e0b' },
          ].map((t, i) => (
            <div key={i} className="p-5 rounded-xl flex items-start gap-3" style={{ background: `${t.color}0d`, border: `1px solid ${t.color}28` }}>
              <ChevronRight size={15} style={{ color: t.color, flexShrink: 0, marginTop: 2 }} />
              <p className="text-sm leading-relaxed" style={{ color: '#a1a1aa' }}>{t.tip}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Exam Code Validation Modal */}
      <AnimatePresence>
        {codeModalOpen && selectedExam && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
            onClick={() => setCodeModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="rounded-2xl p-8 w-full max-w-md"
              style={{ background: '#121212', border: '1px solid #27272a', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'rgba(249, 115, 22, 0.2)' }}>
                    <Lock size={20} style={{ color: '#f97316' }} />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-white">Verify Exam Access</h3>
                    <p className="text-xs" style={{ color: '#71717a' }}>{selectedExam.title}</p>
                  </div>
                </div>
                <button
                  onClick={() => setCodeModalOpen(false)}
                  style={{ color: '#ffffff' }}
                  className="hover:text-orange-400 transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Content */}
              <form onSubmit={handleCodeSubmit} className="space-y-5">
                <div>
                  <p className="text-sm mb-4" style={{ color: '#a1a1aa' }}>
                    Please enter the 6-digit verification code sent to your email to proceed with the exam.
                  </p>
                  <label className="block text-sm font-semibold mb-2" style={{ color: '#ffffff' }}>Exam Code</label>
                  <input
                    type="text"
                    value={enteredCode}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setEnteredCode(val);
                      setValidationError('');
                    }}
                    placeholder="000000"
                    maxLength="6"
                    className="w-full px-4 py-3 rounded-xl outline-none text-center text-xl font-bold tracking-widest transition-all focus:ring-2 focus:ring-orange-500/50"
                    style={{ background: '#0a0a0a', border: '1px solid #27272a', color: '#fafafa' }}
                    disabled={isValidating}
                  />
                </div>

                {/* Error Message */}
                {validationError && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 rounded-lg flex items-start gap-2"
                    style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}
                  >
                    <AlertCircle size={16} style={{ color: '#ef4444', flexShrink: 0, marginTop: 2 }} />
                    <p className="text-sm" style={{ color: '#ef4444' }}>{validationError}</p>
                  </motion.div>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={!enteredCode || isValidating}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: enteredCode && !isValidating
                      ? 'linear-gradient(135deg,#f97316,#f59e0b)'
                      : 'rgba(249, 115, 22, 0.5)',
                  }}
                >
                  {isValidating ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      <CheckCircle size={16} />
                      Verify & Access
                    </>
                  )}
                </button>

                <p className="text-xs text-center" style={{ color: '#71717a' }}>
                  Check your email for the verification code
                </p>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
