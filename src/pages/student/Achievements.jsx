import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Lock, Star, Zap } from 'lucide-react';
import { LoadingSkeleton } from '../../components/shared/LoadingSkeleton';
import { formatDate } from '../../utils/helpers';
import { useAuth } from '../../context/AuthContext';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase/firebase';

const BADGES = [
  { id: 'b1', name: 'Algorithm Pro', icon: '🧠', color: '#f59e0b', description: 'Master of algorithms', criteria: 'Score 80%+ in DSA exam' },
  { id: 'b2', name: 'Code Ninja', icon: '🥷', color: '#10b981', description: 'Fast and flawless coding', criteria: 'Score 80%+ in WT exam' },
  { id: 'b3', name: 'Top Performer', icon: '⭐', color: '#f97316', description: 'Overall top performance', criteria: 'Score 80%+ in any exam' },
  { id: 'b4', name: 'Database Guru', icon: '🗄️', color: '#06b6d4', description: 'Expert in SQL & NoSQL', criteria: 'Score 80%+ in DBMS exam' },
  { id: 'b5', name: 'Web Master', icon: '🌐', color: '#8b5cf6', description: 'Frontend and backend master', criteria: 'Score 80%+ in CN exam' },
];

function BadgeCard({ badge, earned, earnedData, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.07, type: 'spring', stiffness: 150 }}
      whileHover={{ y: -5, transition: { duration: 0.2 } }}
      className="relative rounded-2xl p-6 text-center cursor-default"
      style={{
        background: earned ? `linear-gradient(135deg, ${badge.color}12, #121212)` : '#0a0a0a',
        border: earned ? `1px solid ${badge.color}38` : '1px solid #27272a',
        opacity: earned ? 1 : 0.5,
      }}
    >
      {earned && (
        <div className="absolute top-4 right-4">
          <Star size={14} style={{ color: badge.color }} fill={badge.color} />
        </div>
      )}
      {!earned && (
        <div className="absolute top-4 right-4">
          <Lock size={14} style={{ color: '#475569' }} />
        </div>
      )}

      <motion.div
        animate={earned ? { rotate: [0, -5, 5, 0] } : {}}
        transition={{ duration: 0.5, delay: index * 0.1 }}
        className="text-5xl mb-4"
      >
        {badge.icon}
      </motion.div>

      <h3 className="font-bold text-sm text-white mb-2">{badge.name}</h3>
      <p className="text-sm leading-relaxed mb-4" style={{ color: '#71717a' }}>{badge.description}</p>

      {earned ? (
        <div>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold"
            style={{ background: `${badge.color}20`, color: badge.color }}>
            <Trophy size={13} /> Earned
          </div>
          {earnedData && (
            <p className="text-xs mt-3" style={{ color: '#475569' }}>
              {formatDate(earnedData.awardedDate)} &middot; Score: {earnedData.examScore}%
            </p>
          )}
        </div>
      ) : (
        <div className="text-xs px-3 py-2 rounded-full leading-relaxed" style={{ background: '#1c1917', color: '#475569' }}>
          {badge.criteria}
        </div>
      )}
    </motion.div>
  );
}

export default function AchievementsPage() {
  const { user } = useAuth();
  const rollNo = user?.email ? user.email.split('@')[0].toUpperCase() : '';
  const [loading, setLoading] = useState(true);
  const [studentBadgeIds, setStudentBadgeIds] = useState([]);

  useEffect(() => {
    if (!rollNo) return;
    const fetchBadges = async () => {
      try {
        const studSnap = await getDocs(query(collection(db, 'students'), where('rollNo', '==', rollNo)));
        let badgeDocs = [];

        if (!studSnap.empty) {
          const studentId = studSnap.docs[0].id;
          const awSnap = await getDocs(query(collection(db, 'awardedBadges'), where('studentId', '==', studentId)));
          badgeDocs = awSnap.docs.map(d => d.data());

          if (badgeDocs.length === 0) {
            const rollSnap = await getDocs(query(collection(db, 'awardedBadges'), where('studentRollNo', '==', rollNo)));
            badgeDocs = rollSnap.docs.map(d => d.data());
          }
        } else {
          const rollSnap = await getDocs(query(collection(db, 'awardedBadges'), where('studentRollNo', '==', rollNo)));
          badgeDocs = rollSnap.docs.map(d => d.data());
        }

        setStudentBadgeIds(badgeDocs);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchBadges();
  }, [rollNo]);

  const earnedIds = new Set(studentBadgeIds.map(sb => sb.badgeId));

  if (loading) return <LoadingSkeleton type="card" />;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Achievements & Badges</h1>
          <p className="text-base mt-1.5" style={{ color: '#71717a' }}>Earn badges by scoring 80%+ in exams</p>
        </div>
        <div className="flex items-center gap-3 px-5 py-3 rounded-xl" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.28)' }}>
          <Trophy size={18} style={{ color: '#f59e0b' }} />
          <span className="font-bold text-lg text-white">{earnedIds.size}</span>
          <span className="text-sm font-medium" style={{ color: '#f59e0b' }}>/ {BADGES.length} Earned</span>
        </div>
      </div>

      {/* Progress */}
      <div className="rounded-2xl p-7" style={{ background: '#121212', border: '1px solid #27272a' }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Zap size={18} style={{ color: '#f59e0b' }} />
            <span className="font-semibold text-base text-white">Achievement Progress</span>
          </div>
          <span className="text-lg font-bold" style={{ color: '#f59e0b' }}>{Math.round((earnedIds.size / BADGES.length) * 100) || 0}%</span>
        </div>
        <div className="h-4 rounded-full overflow-hidden" style={{ background: '#1c1917' }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${(earnedIds.size / BADGES.length) * 100}%` }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            className="h-full rounded-full"
            style={{ background: 'linear-gradient(90deg, #f59e0b, #f97316)' }}
          />
        </div>
        <p className="text-sm mt-3" style={{ color: '#71717a' }}>
          {earnedIds.size} earned &middot; {BADGES.length - earnedIds.size} remaining
        </p>
      </div>

      {earnedIds.size > 0 && (
        <div>
          <h2 className="font-bold text-base text-white mb-5 flex items-center gap-2.5">
            <Trophy size={18} style={{ color: '#f59e0b' }} /> Earned Badges
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
            {BADGES.filter(b => earnedIds.has(b.id)).map((badge, i) => {
              const earnedData = studentBadgeIds.find(sb => sb.badgeId === badge.id);
              return <BadgeCard key={badge.id} badge={badge} earned={true} earnedData={earnedData} index={i} />;
            })}
          </div>
        </div>
      )}

      <div>
        <h2 className="font-bold text-base text-white mb-5 flex items-center gap-2.5">
          <Lock size={18} style={{ color: '#475569' }} /> Locked Badges
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
          {BADGES.filter(b => !earnedIds.has(b.id)).map((badge, i) => (
            <BadgeCard key={badge.id} badge={badge} earned={false} index={i + earnedIds.size} />
          ))}
        </div>
      </div>
    </div>
  );
}
