import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { formatDate, getGradeColor, generateInitials, getAvatarColor, exportToCSV } from '../../utils/helpers';
import { Download, CheckCircle } from 'lucide-react';
import { LoadingSkeleton } from '../../components/shared/LoadingSkeleton';
import toast from 'react-hot-toast';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/firebase';

export default function AdminResults() {
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState([]);
  const [filter, setFilter] = useState('all'); // all, electron_app, manual

  useEffect(() => {
    const fetchResults = async () => {
      try {
        const snap = await getDocs(collection(db, 'results'));
        let list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Filter by source if specified
        if (filter !== 'all') {
          list = list.filter(r => r.source === filter);
        }

        setResults(list);
      } catch (err) {
        toast.error("Failed to load results");
      } finally {
        setLoading(false);
      }
    };
    fetchResults();
  }, [filter]);

  if (loading) return <LoadingSkeleton type="table" rows={5} />;

  return (
    <div className="space-y-7">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Results Management</h1>
          <p className="text-base mt-1.5" style={{ color: '#71717a' }}>{results.length} result records</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => exportToCSV(results, 'results')}
            className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}>
            <Download size={15} /> Export
          </button>
          <button onClick={() => toast.success('Results published to all students!')}
            className="flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg,#10b981,#06b6d4)' }}>
            <CheckCircle size={15} /> Publish Results
          </button>
        </div>
      </div>

      {/* Filter buttons */}
      <div className="flex gap-2.5">
        {[
          { key: 'all', label: 'All Results', count: results.length },
          { key: 'electron_app', label: 'Electron App', count: results.filter(r => r.source === 'electron_app').length },
          { key: 'manual', label: 'Manual Entry', count: results.filter(r => r.source === 'manual').length }
        ].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className="px-4 py-2.5 rounded-xl text-sm font-medium capitalize transition-all"
            style={filter === f.key
              ? { background: 'rgba(249, 115, 22,0.2)', color: '#fdba74', border: '1px solid rgba(249, 115, 22,0.4)' }
              : { color: '#71717a', border: '1px solid #27272a' }
            }>
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: '#121212', border: '1px solid #27272a' }}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ background: '#0a0a0a' }}>
                {['Student', 'Subject', 'Marks', 'Total', 'Percentage', 'Grade', 'Status', 'Source', 'Date'].map(h => (
                  <th key={h} className="text-left px-6 py-4 text-sm font-semibold" style={{ color: '#71717a' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-16 text-base" style={{ color: '#71717a' }}>No results found</td></tr>
              ) : results.map((r, i) => {
                const color = getGradeColor(r.grade);
                return (
                  <motion.tr key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}
                    className="hover:bg-white/5 transition-all" style={{ borderBottom: '1px solid #27272a' }}>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                          style={{ background: getAvatarColor(r.studentName || '') }}>
                          {generateInitials(r.studentName || '?')}
                        </div>
                        <span className="text-sm font-semibold text-white">{r.studentName || 'Unknown'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-sm" style={{ color: '#a1a1aa' }}>{r.subject}</td>
                    <td className="px-6 py-5 text-sm font-bold text-white">{r.marks}</td>
                    <td className="px-6 py-5 text-sm" style={{ color: '#71717a' }}>{r.totalMarks}</td>
                    <td className="px-6 py-5 text-sm font-bold" style={{ color }}>{r.percentage}%</td>
                    <td className="px-6 py-5">
                      <span className="text-sm px-3 py-1.5 rounded-full font-bold" style={{ background: `${color}20`, color }}>{r.grade}</span>
                    </td>
                    <td className="px-6 py-5">
                      <span className="text-sm px-3 py-1.5 rounded-full font-semibold status-active">{r.status === 'passed' ? 'Passed' : 'Failed'}</span>
                    </td>
                    <td className="px-6 py-5">
                      <span className={`text-sm px-3 py-1.5 rounded-full font-medium ${
                        r.source === 'electron_app' ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-500/20 text-gray-400'
                      }`}>
                        {r.source === 'electron_app' ? 'Electron App' : 'Manual'}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-sm" style={{ color: '#71717a' }}>{formatDate(r.date || r.submittedAt)}</td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
