import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, LineChart, Line } from 'recharts';
import { TrendingUp, Users, Award, BookOpen, Download } from 'lucide-react';
import { LoadingSkeleton } from '../../components/shared/LoadingSkeleton';
import { exportToCSV } from '../../utils/helpers';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/firebase';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload?.length) {
    return (
      <div className="rounded-xl p-4 text-sm" style={{ background: '#1c1917', border: '1px solid #3f3f46' }}>
        <p className="font-semibold text-white mb-2">{label}</p>
        {payload.map(p => <p key={p.name} style={{ color: p.color }}>{p.name}: {p.value}</p>)}
      </div>
    );
  }
  return null;
};

const placementData = [
  { dept: 'CS', readiness: 88, placed: 89 },
  { dept: 'IT', readiness: 76, placed: 72 },
  { dept: 'ECE', readiness: 68, placed: 65 },
  { dept: 'ME', readiness: 61, placed: 58 },
  { dept: 'Civil', readiness: 55, placed: 42 },
];

const performanceData = [
  { year: '2021', cgpa: 7.8 }, { year: '2022', cgpa: 8.1 },
  { year: '2023', cgpa: 8.4 }, { year: '2024', cgpa: 8.2 },
  { year: '2025', cgpa: 8.6 }, { year: '2026', cgpa: 8.8 }
];

const radarData = [
  { subject: 'DSA', CS: 85, IT: 72, ECE: 60 },
  { subject: 'DBMS', CS: 80, IT: 78, ECE: 55 },
  { subject: 'OS', CS: 82, IT: 70, ECE: 58 },
  { subject: 'CN', CS: 79, IT: 75, ECE: 68 },
  { subject: 'ML', CS: 76, IT: 65, ECE: 50 },
  { subject: 'WT', CS: 88, IT: 80, ECE: 48 },
];

export default function AdminReports() {
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState([]);
  const [exams, setExams] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const studSnap = await getDocs(collection(db, 'students'));
        setStudents(studSnap.docs.map(d => d.data()));
        const examSnap = await getDocs(collection(db, 'exams'));
        setExams(examSnap.docs.map(d => d.data()));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return <LoadingSkeleton type="card" />;

  // Dynamic calculations
  const totalStudents = students.length;
  const avgCgpa = students.length ? (students.reduce((sum, s) => sum + (parseFloat(s.btech) || 0), 0) / students.length).toFixed(2) : "0.00";
  const placedStudents = students.filter(s => (parseFloat(s.btech) || 0) > 65).length;
  const placementRate = totalStudents ? Math.round((placedStudents / totalStudents) * 100) : 0;

  const departmentMap = {};
  students.forEach(s => {
    const branch = (s.branch && s.branch[0]) ? s.branch[0] : 'Unknown';
    if (!departmentMap[branch]) {
      departmentMap[branch] = { department: branch, students: 0, totalCgpa: 0, placed: 0 };
    }
    departmentMap[branch].students += 1;
    departmentMap[branch].totalCgpa += parseFloat(s.btech) || 0;
    if ((parseFloat(s.btech) || 0) > 65) departmentMap[branch].placed += 1;
  });

  const departmentData = Object.values(departmentMap).map(d => ({
    department: d.department,
    students: d.students,
    avgCgpa: d.students ? (d.totalCgpa / d.students).toFixed(2) : 0,
    placed: d.placed,
    readiness: d.students ? Math.round((d.placed / d.students) * 100) : 0
  })).sort((a, b) => b.students - a.students);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Reports & Analytics</h1>
          <p className="text-base mt-1.5" style={{ color: '#71717a' }}>Institutional performance insights</p>
        </div>
        <button onClick={() => exportToCSV(departmentData, 'department-report')}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
          style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}>
          <Download size={15} /> Export Report
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        {[
          { label: 'Avg Institution %', value: `${avgCgpa}%`, color: '#f97316', icon: TrendingUp },
          { label: 'Total Students', value: totalStudents, color: '#10b981', icon: Users },
          { label: 'Placement Rate', value: `${placementRate}%`, color: '#f59e0b', icon: Award },
          { label: 'Exams Conducted', value: exams.length, color: '#f59e0b', icon: BookOpen },
        ].map((k, i) => (
          <motion.div key={k.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
            className="rounded-2xl p-7" style={{ background: '#121212', border: '1px solid #27272a' }}>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ background: `${k.color}20` }}>
              <k.icon size={22} style={{ color: k.color }} />
            </div>
            <p className="text-sm font-medium mb-2" style={{ color: '#71717a' }}>{k.label}</p>
            <p className="text-3xl font-bold text-white">{k.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl p-7" style={{ background: '#121212', border: '1px solid #27272a' }}>
          <h3 className="font-bold text-base text-white mb-6">Department % Comparison</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={departmentData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="department" stroke="#475569" tick={{ fontSize: 12 }} tickMargin={8} />
              <YAxis domain={[0, 100]} stroke="#475569" tick={{ fontSize: 12 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="avgCgpa" name="Avg B.Tech %" fill="#f97316" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-2xl p-7" style={{ background: '#121212', border: '1px solid #27272a' }}>
          <h3 className="font-bold text-base text-white mb-6">Placement Readiness</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={departmentData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="department" stroke="#475569" tick={{ fontSize: 12 }} tickMargin={8} />
              <YAxis domain={[0, 100]} stroke="#475569" tick={{ fontSize: 12 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="readiness" name="Readiness %" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-2xl p-7" style={{ background: '#121212', border: '1px solid #27272a' }}>
          <h3 className="font-bold text-base text-white mb-6">Subject Performance by Department</h3>
          <ResponsiveContainer width="100%" height={240}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#27272a" />
              <PolarAngleAxis dataKey="subject" tick={{ fill: '#71717a', fontSize: 12 }} />
              <Radar name="CS" dataKey="CS" stroke="#f97316" fill="#f97316" fillOpacity={0.15} />
              <Radar name="IT" dataKey="IT" stroke="#10b981" fill="#10b981" fillOpacity={0.1} />
              <Radar name="ECE" dataKey="ECE" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.1} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-2xl p-7" style={{ background: '#121212', border: '1px solid #27272a' }}>
          <h3 className="font-bold text-base text-white mb-6">Yearly CGPA Trend</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={performanceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="year" stroke="#475569" tick={{ fontSize: 12 }} tickMargin={8} />
              <YAxis domain={[8, 10]} stroke="#475569" tick={{ fontSize: 12 }} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="cgpa" name="Avg CGPA" stroke="#f97316" strokeWidth={2.5} dot={{ fill: '#f97316', r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Department table */}
      <div className="rounded-2xl overflow-hidden" style={{ background: '#121212', border: '1px solid #27272a' }}>
        <div className="px-7 py-5" style={{ borderBottom: '1px solid #27272a' }}>
          <h3 className="font-bold text-base text-white">Department Summary</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ background: '#0a0a0a' }}>
                {['Department', 'Students', 'Avg CGPA', 'Placed', 'Placement %'].map(h => (
                  <th key={h} className="text-left px-7 py-4 text-sm font-semibold" style={{ color: '#71717a' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {departmentData.map((d, i) => (
                <tr key={d.department} className="hover:bg-white/5 transition-all"
                  style={{ borderBottom: i < departmentData.length - 1 ? '1px solid #27272a' : 'none' }}>
                  <td className="px-7 py-5 font-semibold text-white">{d.department}</td>
                  <td className="px-7 py-5 text-sm" style={{ color: '#a1a1aa' }}>{d.students}</td>
                  <td className="px-7 py-5">
                    <span className="font-bold text-base" style={{ color: '#10b981' }}>{d.avgCgpa}%</span>
                  </td>
                  <td className="px-7 py-5 text-sm" style={{ color: '#a1a1aa' }}>{d.placed}</td>
                  <td className="px-7 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-20 h-2 rounded-full overflow-hidden" style={{ background: '#1c1917' }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.round((d.placed / d.students) * 100) || 0}%`, background: '#f97316' }} />
                      </div>
                      <span className="text-sm font-semibold text-white">{Math.round((d.placed / d.students) * 100) || 0}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
