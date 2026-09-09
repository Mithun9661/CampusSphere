import { motion, AnimatePresence } from 'framer-motion';
import { Link, Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../components/shared/Sidebar';
import TopNav from '../components/shared/TopNav';

export default function DashboardLayout({ title }) {
  const location = useLocation();
  const showAcademicsLink = location.pathname.startsWith('/student') && location.pathname !== '/student/academics';

  return (
    <div className="app-shell">
      {/* CampusSphere ambient brand glow */}
      <div className="orb" style={{ width: 620, height: 620, background: 'radial-gradient(circle, #4f46e5 0%, transparent 70%)', top: '-18%', left: '3%', opacity: 0.1 }} />
      <div className="orb" style={{ width: 520, height: 520, background: 'radial-gradient(circle, #06b6d4 0%, transparent 70%)', bottom: '2%', right: '3%', opacity: 0.07 }} />
      <div className="orb" style={{ width: 420, height: 420, background: 'radial-gradient(circle, #8b5cf6 0%, transparent 70%)', top: '38%', left: '42%', opacity: 0.045 }} />

      <Sidebar />

      <div className="content-column">
        <TopNav title={title} />
        <main className="page-area">
          <div className="page-content">
            {showAcademicsLink && (
              <div className="flex justify-end mb-3">
                <Link
                  to="/student/academics"
                  className="px-3 py-2 rounded-lg text-xs font-semibold"
                  style={{ background: 'rgba(6,182,212,.10)', color: '#67e8f9', border: '1px solid rgba(6,182,212,.28)', textDecoration: 'none' }}
                >
                  College Data · E-CAP
                </Link>
              </div>
            )}
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
                transition={{
                  duration: 0.4,
                  ease: [0.22, 1, 0.36, 1]
                }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}
