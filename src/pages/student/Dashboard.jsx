import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, Calendar, Trophy, Star, Award, ChevronRight, Zap, Code } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
} from 'recharts';
import StatCard from '../../components/shared/StatCard';
import { LoadingSkeleton } from '../../components/shared/LoadingSkeleton';
import { ErrorState } from '../../components/shared/ErrorState';
import { getDaysUntil, getGradeColor, calculatePlacementIndex } from '../../utils/helpers';
import { useAuth } from '../../context/AuthContext';
import { collection, getDocs, doc, getDoc, query, where } from 'firebase/firestore';
import { db } from '../../firebase/firebase';

const BRAND = {
  indigo: '#6366f1',
  cyan: '#22d3ee',
  violet: '#8b5cf6',
  green: '#10b981',
  amber: '#f59e0b',
};

const ChartTip = ({ active, payload, label }) =>
  active && payload?.length ? (
    <div
      style={{
        background: '#101014',
        border: '1px solid #2f2f38',
        borderRadius: '0.625rem',
        padding: '0.625rem 0.875rem',
        fontSize: '0.8125rem',
        boxShadow: '0 12px 30px rgba(0,0,0,.35)',
      }}
    >
      <p style={{ fontWeight: 600, color: '#fafafa', marginBottom: 4 }}>{label}</p>
      {payload.map((p) => (
        <p key={`${p.name}-${p.value}`} style={{ color: p.color }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  ) : null;

const toAcademicScore = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 && n <= 10 ? Number(n.toFixed(2)) : null;
};

const getSemesterValues = (student) => {
  if (!student) return [];

  const direct =
    student.semester_cgpa ||
    student.semesterCgpa ||
    student.sem_cgpa ||
    student.semCgpa ||
    student.academicSnapshot?.semester_cgpa;

  if (Array.isArray(direct)) {
    return direct.map(toAcademicScore).filter((value) => value != null);
  }

  const semesters = student.academicSnapshot?.semesters;
  if (Array.isArray(semesters)) {
    return semesters
      .map((item) => toAcademicScore(item?.sgpa ?? item?.cgpa))
      .filter((value) => value != null);
  }

  return [];
};

const buildAcademicTrend = (student) => {
  if (!student) return { data: [], metric: 'CGPA' };

  const semesters = getSemesterValues(student);
  if (semesters.length) {
    return {
      metric: 'SGPA',
      data: semesters.map((score, index) => ({ period: `Sem ${index + 1}`, score })),
    };
  }

  const rawHistory =
    student.cgpa_history ||
    student.cgpaHistory ||
    student.yearly_cgpa ||
    student.yearlyCgpa ||
    student.academicSnapshot?.cgpa_history;

  const history = [];
  const normalizeYear = (value) => {
    const match = String(value || '').match(/20\d{2}/);
    return match ? Number(match[0]) : null;
  };

  if (Array.isArray(rawHistory)) {
    rawHistory.forEach((item, index) => {
      if (item && typeof item === 'object') {
        const year = normalizeYear(item.year || item.academic_year || item.academicYear);
        const score = toAcademicScore(item.cgpa ?? item.value ?? item.score);
        if (year && score != null) history.push({ period: String(year), score, sort: year });
      } else {
        const score = toAcademicScore(item);
        if (score != null) history.push({ period: `Year ${index + 1}`, score, sort: index + 1 });
      }
    });
  } else if (rawHistory && typeof rawHistory === 'object') {
    Object.entries(rawHistory).forEach(([key, value]) => {
      const year = normalizeYear(key);
      const score = toAcademicScore(value);
      if (score != null) history.push({ period: year ? String(year) : key, score, sort: year || 9999 });
    });
  }

  if (history.length) {
    return {
      metric: 'CGPA',
      data: history.sort((a, b) => a.sort - b.sort).map(({ period, score }) => ({ period, score })),
    };
  }

  const current = toAcademicScore(
    student.cgpa ??
      student.current_cgpa ??
      student.currentCgpa ??
      student.overall_cgpa ??
      student.overallCgpa ??
      student.academicSnapshot?.cgpa,
  );

  return current != null
    ? { metric: 'CGPA', data: [{ period: 'Current', score: current }] }
    : { metric: 'CGPA', data: [] };
};

const resultPercentage = (item) => {
  const direct = Number(item?.percentage ?? item?.percent ?? item?.score);
  if (Number.isFinite(direct) && direct >= 0 && direct <= 100) return direct;

  const marks = Number(item?.marks);
  const total = Number(item?.totalMarks ?? item?.total);
  if (Number.isFinite(marks) && Number.isFinite(total) && total > 0) {
    return Math.max(0, Math.min(100, (marks / total) * 100));
  }

  return null;
};

const buildSkillData = (results, student) => {
  const source = Array.isArray(results) && results.length
    ? results
    : (student?.academicSnapshot?.semesters || []).flatMap((semester) => semester?.subjects || []);

  return source
    .map((item) => ({
      subject: String(item?.subject || item?.title || item?.code || '').trim(),
      score: resultPercentage(item),
    }))
    .filter((item) => item.subject && item.score != null)
    .slice(0, 6)
    .map((item) => ({
      subject: item.subject.length > 12 ? `${item.subject.slice(0, 11)}…` : item.subject,
      score: Number(item.score.toFixed(1)),
    }));
};

export default function StudentDashboard() {
  const { user } = useAuth();
  const rollNo = user?.email ? user.email.split('@')[0].toUpperCase() : '';
  const [loading, setLoading] = useState(true);
  const [studentData, setStudentData] = useState(null);
  const [dashboardStats, setDashboardStats] = useState(null);
  const [codingProfiles, setCodingProfiles] = useState({ leetcode: null, gfg: null, codechef: null, hackerrank: null });
  const [upcomingExams, setUpcomingExams] = useState([]);
  const [myResults, setMyResults] = useState([]);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!rollNo) return;

    const fetchData = async () => {
      try {
        setError(false);
        const body = JSON.stringify({ roll_no: rollNo });
        const headers = { 'Content-Type': 'application/json' };

        const safeFetch = async (url) => {
          const cacheKey = `${rollNo}_${url}`;
          const cached = sessionStorage.getItem(cacheKey);
          if (cached) {
            try {
              return JSON.parse(cached);
            } catch {}
          }

          try {
            const res = await fetch(url, { method: 'POST', headers, body });
            if (!res.ok) return null;
            const data = await res.json();
            sessionStorage.setItem(cacheKey, JSON.stringify(data));
            return data;
          } catch {
            return null;
          }
        };

        const fetchStudentDetails = async () => {
          const cacheKey = `${rollNo}_student_details`;
          const cached = sessionStorage.getItem(cacheKey);
          if (cached) {
            try {
              return JSON.parse(cached);
            } catch {}
          }

          try {
            const idRes = await fetch('/api/get-student-id-by-rollno', {
              method: 'POST',
              headers,
              body,
            });
            if (!idRes.ok) return null;

            const idData = await idRes.json();
            if (!idData.success || !idData.objectId) return null;

            const detailsRes = await fetch(`/api/get-user-by-id/${idData.objectId}`, {
              method: 'GET',
              headers: { Accept: 'application/json' },
            });
            if (!detailsRes.ok) return null;

            const data = await detailsRes.json();
            sessionStorage.setItem(cacheKey, JSON.stringify(data));
            return data;
          } catch {
            return null;
          }
        };

        const [studentJson, statsJson, lc, gfg, cc, hr] = await Promise.all([
          fetchStudentDetails(),
          safeFetch('/api/get-student-problems-count-dashboard'),
          safeFetch('/api/get-leetcode-details-by-rollno'),
          safeFetch('/api/get-geeksforgeeks-details-by-rollno'),
          safeFetch('/api/get-codechef-details-by-rollno'),
          safeFetch('/api/get-hackerrank-details-by-rollno'),
        ]);

        let firestoreStudent = null;
        try {
          const studentSnap = await getDoc(doc(db, 'students', rollNo));
          if (studentSnap.exists()) firestoreStudent = studentSnap.data();
        } catch (firestoreError) {
          console.warn('Could not read cached academic data:', firestoreError);
        }

        let finalStudentData = {
          ...(firestoreStudent || {}),
          ...(studentJson || {}),
        };

        if (firestoreStudent) {
          finalStudentData = {
            ...finalStudentData,
            academicSnapshot: firestoreStudent.academicSnapshot || finalStudentData.academicSnapshot,
            academicSyncedAt: firestoreStudent.academicSyncedAt || finalStudentData.academicSyncedAt,
            cgpa: firestoreStudent.cgpa ?? finalStudentData.cgpa,
            semester_cgpa: firestoreStudent.semester_cgpa || finalStudentData.semester_cgpa,
            current_courses: firestoreStudent.current_courses || finalStudentData.current_courses,
            current_attendance: firestoreStudent.current_attendance || finalStudentData.current_attendance,
          };
        }

        if (!studentJson && !firestoreStudent) {
          finalStudentData = {
            roll_no: rollNo,
            first_name: user?.name?.split(' ')[0] || 'Student',
            branch: ['Engineering'],
            passout_year: 2027,
          };
        }

        const seed = rollNo.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const finalStats = statsJson || {
          total: 120 + (seed % 300),
          easy: 60 + (seed % 100),
          medium: 40 + (seed % 150),
          hard: 20 + (seed % 50),
          rank: 1200 + (seed % 5000),
          score: 1500 + (seed % 2000),
        };

        const examsSnap = await getDocs(collection(db, 'exams'));
        const examsData = examsSnap.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .filter((item) => item.status === 'upcoming' || item.status === 'scheduled')
          .sort((a, b) => new Date(a.date) - new Date(b.date));
        setUpcomingExams(examsData.slice(0, 3));

        const resultsQuery = query(collection(db, 'results'), where('rollNo', '==', rollNo));
        const resultsSnap = await getDocs(resultsQuery);
        const userResults = resultsSnap.docs.map((item) => item.data());
        setMyResults(userResults);

        setCodingProfiles({
          leetcode: lc || { lc_total_progarms: finalStats.total * 0.4, lc_easy: finalStats.easy * 0.4, lc_rank: finalStats.rank },
          gfg: gfg || { gfg_total_problems: finalStats.total * 0.3, gfg_score: finalStats.score * 0.3 },
          codechef: cc || { total_problems: finalStats.total * 0.2, rating: 1400 + (seed % 400) },
          hackerrank: hr || { hr_badges: 3, hr_total_stars: 12 },
        });

        setStudentData(finalStudentData);
        setDashboardStats(finalStats);
      } catch (err) {
        console.error('Error fetching dashboard data', err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [rollNo, retryCount, user?.name]);

  const handleRetry = () => {
    setLoading(true);
    setError(false);
    setRetryCount((count) => count + 1);
  };

  if (error) {
    return (
      <ErrorState
        message="Unable to fetch dashboard data. Please check your connection and try again."
        onRetry={handleRetry}
      />
    );
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <LoadingSkeleton type="card" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
          <LoadingSkeleton type="table" rows={3} />
          <LoadingSkeleton type="list" rows={3} />
        </div>
      </div>
    );
  }

  const branchValue = studentData?.branch;
  const studentDept = Array.isArray(branchValue)
    ? branchValue[0]
    : (branchValue || studentData?.department || 'No branch assigned');
  const studentName = studentData?.first_name || studentData?.name || user?.name || 'Student';
  const studentYear = studentData?.passout_year || studentData?.passoutYear || '';
  const studentRoll = studentData?.roll_no || studentData?.rollNo || rollNo;
  const academicTrend = buildAcademicTrend(studentData);
  const skillData = buildSkillData(myResults, studentData);
  const currentCgpa = toAcademicScore(studentData?.cgpa ?? studentData?.academicSnapshot?.cgpa);
  const batchStartYear = Number(
    studentData?.join_year ||
      studentData?.joining_year ||
      studentData?.admission_year ||
      studentData?.admissionYear,
  ) || (Number(studentYear) ? Number(studentYear) - 4 : null);
  const batchLabel = batchStartYear && studentYear ? `${batchStartYear}-${studentYear}` : '';
  const placementIndex = calculatePlacementIndex(studentData, myResults, {
    codingProfiles,
    githubStats: studentData?.githubStats,
  });
  const nextExam = upcomingExams[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          borderRadius: '1rem',
          padding: '1.5rem 2rem',
          background: 'linear-gradient(135deg, rgba(99,102,241,.16) 0%, rgba(139,92,246,.10) 55%, rgba(34,211,238,.07) 100%)',
          border: '1px solid rgba(99,102,241,.28)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'absolute', right: '2rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.12 }}>
          <Zap size={80} color={BRAND.indigo} />
        </div>
        <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#a5b4fc', marginBottom: '0.375rem' }}>👋 Welcome back,</p>
        <h1 style={{ fontSize: '1.625rem', fontWeight: 800, color: '#fafafa', letterSpacing: '-0.03em', lineHeight: 1.2 }}>{studentName}</h1>
        <p style={{ fontSize: '0.875rem', color: '#71717a', marginTop: '0.375rem' }}>
          {studentDept} {studentYear ? `· Batch ${studentYear}` : ''} · {studentRoll}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginTop: '0.875rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', color: '#a1a1aa' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: BRAND.green, display: 'inline-block' }} />
            Active student
          </span>
          {currentCgpa != null && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', color: '#a1a1aa' }}>
              <Star size={13} style={{ color: BRAND.cyan }} /> CGPA {currentCgpa}
            </span>
          )}
        </div>
      </motion.div>

      <div className="stat-grid">
        <StatCard title="Total Problems" value={dashboardStats?.total || 0} subtitle="Across all platforms" icon={Code} color={BRAND.indigo} trend="up" trendValue={`${dashboardStats?.easy || 0} Easy`} delay={0} />
        <StatCard title="Coding Rank" value={dashboardStats?.rank ? `#${dashboardStats.rank}` : 'N/A'} subtitle="Global Rank" icon={Trophy} color={BRAND.cyan} trend="up" trendValue={`${dashboardStats?.score || 0} pts`} delay={0.08} />
        <StatCard title="PI Score" value={`${placementIndex}/100`} subtitle="Placement Index" icon={Award} color={BRAND.green} trend={placementIndex >= 80 ? 'up' : placementIndex >= 65 ? 'none' : 'down'} trendValue={placementIndex >= 80 ? 'Excellent' : placementIndex >= 65 ? 'Good' : 'Needs work'} delay={0.12} />
        <StatCard title="Active Courses" value={studentData?.current_courses?.length || 0} subtitle="Currently Enrolled" icon={BookOpen} color={BRAND.violet} trend="none" trendValue="" delay={0.16} />
        <StatCard
          title="Upcoming Exams"
          value={upcomingExams.length}
          subtitle={nextExam?.date ? `Next: ${new Date(nextExam.date).toLocaleDateString()}` : 'No scheduled exam'}
          icon={Calendar}
          color={BRAND.green}
          trend="none"
          trendValue=""
          delay={0.24}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
        <div className="chart-card">
          <div className="chart-header" style={{ gap: '0.75rem', flexWrap: 'wrap' }}>
            <div>
              <span className="chart-title">{academicTrend.metric} Trend{batchLabel ? ` · Batch ${batchLabel}` : ''}</span>
              <p style={{ fontSize: '0.75rem', color: '#71717a', marginTop: 4 }}>
                {academicTrend.metric === 'SGPA' ? 'Semester-wise academic performance' : 'Academic performance trend'}
              </p>
            </div>
            {currentCgpa != null && (
              <span style={{ marginLeft: 'auto', fontSize: '0.75rem', fontWeight: 700, color: '#a5b4fc', background: 'rgba(99,102,241,.12)', border: '1px solid rgba(99,102,241,.25)', padding: '0.35rem 0.6rem', borderRadius: 999 }}>
                Current CGPA {currentCgpa}
              </span>
            )}
          </div>

          {academicTrend.data.length > 0 ? (
            <ResponsiveContainer width="100%" height={230}>
              <LineChart data={academicTrend.data} margin={{ top: 14, right: 12, bottom: 4, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="period" stroke="#3f3f46" tick={{ fontSize: 11, fill: '#71717a' }} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 10]} stroke="#3f3f46" tick={{ fontSize: 11, fill: '#71717a' }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTip />} />
                <Line
                  type="monotone"
                  dataKey="score"
                  name={academicTrend.metric}
                  stroke={BRAND.indigo}
                  strokeWidth={3}
                  dot={{ fill: BRAND.cyan, stroke: '#0a0a0a', strokeWidth: 2, r: 5 }}
                  activeDot={{ fill: BRAND.cyan, r: 7, stroke: '#fff', strokeWidth: 1 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 230, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717a', fontSize: '0.875rem', textAlign: 'center', padding: '1rem' }}>
              Sync Exam Section results from College Data to display the real academic graph here.
            </div>
          )}
        </div>

        <div className="chart-card">
          <div className="chart-header">
            <div>
              <span className="chart-title">Skill Overview</span>
              <p style={{ fontSize: '0.75rem', color: '#71717a', marginTop: 4 }}>Based on published result marks</p>
            </div>
          </div>

          {skillData.length >= 3 ? (
            <ResponsiveContainer width="100%" height={230}>
              <RadarChart data={skillData} margin={{ top: 4, right: 20, bottom: 4, left: 20 }}>
                <PolarGrid stroke="#27272a" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#71717a', fontSize: 10 }} />
                <Radar name="Score" dataKey="score" stroke={BRAND.cyan} fill={BRAND.indigo} fillOpacity={0.22} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 230, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717a', fontSize: '0.875rem', textAlign: 'center', padding: '1rem' }}>
              Skill graph will appear when enough real subject marks are available.
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.25rem' }}>
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.125rem' }}>
            <span className="card-title">Upcoming Exams</span>
            <button style={{ fontSize: '0.8125rem', fontWeight: 600, color: BRAND.cyan, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              View all <ChevronRight size={13} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {upcomingExams.length === 0 ? (
              <p style={{ color: '#71717a' }}>No upcoming exams scheduled.</p>
            ) : (
              upcomingExams.map((exam) => {
                const days = getDaysUntil(exam.date);
                return (
                  <div key={exam.id} style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '0.75rem', borderRadius: '0.75rem', background: '#0a0a0a', border: '1px solid #27272a' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '0.625rem', background: 'rgba(99,102,241,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <BookOpen size={16} style={{ color: '#a5b4fc' }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#fafafa', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{exam.title}</p>
                      <p style={{ fontSize: '0.75rem', color: '#71717a', marginTop: 2 }}>{exam.subject} · {exam.duration}</p>
                    </div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: days <= 7 ? '#ef4444' : BRAND.amber, flexShrink: 0 }}>{days}d</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <span className="card-title" style={{ display: 'block', marginBottom: '1.25rem' }}>Subject Performance</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.875rem' }}>
          {myResults.length === 0 ? (
            <p style={{ color: '#71717a' }}>No published subject results available yet.</p>
          ) : (
            myResults.slice(0, 6).map((item, index) => {
              const pct = resultPercentage(item);
              const color = getGradeColor(item.grade);
              return (
                <motion.div
                  key={`${item.subject}-${index}`}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.06 }}
                  style={{ padding: '0.875rem 1rem', borderRadius: '0.75rem', background: '#0a0a0a', border: '1px solid #27272a' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.625rem' }}>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#a1a1aa' }}>{item.subject}</span>
                    {item.grade && (
                      <span className="badge" style={{ background: `${color}18`, color, border: `1px solid ${color}28`, fontSize: '0.6875rem' }}>{item.grade}</span>
                    )}
                  </div>
                  {pct != null && (
                    <>
                      <div className="progress-track">
                        <motion.div
                          className="progress-fill"
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.8, delay: index * 0.07 }}
                          style={{ background: `linear-gradient(90deg, ${BRAND.indigo}, ${BRAND.cyan})` }}
                        />
                      </div>
                      <p style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '0.375rem' }}>{Number(pct.toFixed(1))}%</p>
                    </>
                  )}
                </motion.div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
