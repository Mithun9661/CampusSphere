import { motion, AnimatePresence } from 'framer-motion';
import { Link, Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../components/shared/Sidebar';
import TopNav from '../components/shared/TopNav';

export default function DashboardLayout({ title }) {
  const location = useLocation();
  const showAcademicsLink = location.pathname.startsWith('/student') && location.pathname !== '/student/academics';

  return (
    <div className="app-shell">
      {/* Ambient background orbs for premium feel */}
      <div className="orb" style={{ width: 600, height: 600, background: 'radial-gradient(circle, #f97316 0%, transparent 70%)', top: '-15%', left: '5%', opacity: 0.08 }} />
      <div className="orb" style={{ width: 500, height: 500, background: 'radial-gradient(circle, #f59e0b 0%, transparent 70%)', bottom: '5%', right: '5%', opacity: 0.05 }} />
      <div className="orb" style={{ width: 400, height: 400, background: 'radial-gradient(circle, #06b6d4 0%, transparent 70%)', top: '40%', left: '40%', opacity: 0.03 }} />

      {/* Sidebar */}
      <Sidebar />

      {/* Right column: TopNav + page */}
      <div className="content-column">
        <TopNav title={title} />
        <main className="page-area">
          <div className="page-content">
            {showAcademicsLink && (
              <div className="flex justify-end mb-3">
                <Link
                  to="/student/academics"
                  className="px-3 py-2 rounded-lg text-xs font-semibold"
                  style={{ background: 'rgba(249,115,22,.12)', color: '#fdba74', border: '1px solid rgba(249,115,22,.28)', textDecoration: 'none' }}
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
