import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Calendar, Award, User, GitBranch,
  AlertTriangle, Trophy, GraduationCap,
  Users, ClipboardList, BarChart3, Bell, Star, LogOut,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { generateInitials, getAvatarColor } from '../../utils/helpers';

const studentNav = [
  { icon: LayoutDashboard, label: 'Dashboard',       path: '/student/dashboard' },
  { icon: Calendar,        label: 'Upcoming Exams',  path: '/student/exams' },
  { icon: Award,           label: 'Results',         path: '/student/results' },
  { icon: User,            label: 'Profile',         path: '/student/profile' },
  { icon: GitBranch,       label: 'GitHub Analysis', path: '/student/github' },
  { icon: AlertTriangle,   label: 'Violations',      path: '/student/violations' },
  { icon: Trophy,          label: 'Achievements',    path: '/student/achievements' },
];

const adminNav = [
  { icon: LayoutDashboard, label: 'Dashboard',       path: '/admin/dashboard' },
  { icon: Users,           label: 'Students',        path: '/admin/students' },
  { icon: ClipboardList,   label: 'Exams',           path: '/admin/exams' },
  { icon: Award,           label: 'Results',         path: '/admin/results' },
  { icon: BarChart3,       label: 'Reports',         path: '/admin/reports' },
  { icon: AlertTriangle,   label: 'Violations',      path: '/admin/violations' },
  { icon: GitBranch,       label: 'GitHub Analysis', path: '/admin/github' },
  { icon: Star,            label: 'Badges',          path: '/admin/badges' },
  { icon: Bell,            label: 'Notifications',   path: '/admin/notifications' },
];

export default function Sidebar() {
  const { user, role, logout } = useAuth();
  const { sidebarCollapsed } = useApp();
  const navigate = useNavigate();

  const navItems = role === 'admin' ? adminNav : studentNav;
  const initials = generateInitials(user?.name || '');
  const avatarBg = getAvatarColor(user?.name || '');
  const collapsed = sidebarCollapsed;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <motion.aside
      animate={{ width: collapsed ? 68 : 256 }}
      transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
      className="sidebar no-select"
      style={{ overflow: 'hidden' }}
    >
      <div className="sidebar-header">
        <motion.div
          whileHover={{ scale: 1.06 }}
          className="flex items-center justify-center rounded-xl flex-shrink-0"
          style={{
            width: 36,
            height: 36,
            background: 'linear-gradient(135deg,#4f46e5,#06b6d4)',
            boxShadow: '0 8px 24px rgba(79,70,229,.28)',
          }}
        >
          <GraduationCap size={18} color="white" />
        </motion.div>

        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.18 }}
              style={{ marginLeft: '0.625rem', overflow: 'hidden' }}
            >
              <span
                style={{
                  fontWeight: 800,
                  fontSize: '0.9375rem',
                  letterSpacing: '-0.02em',
                  display: 'block',
                  lineHeight: 1.2,
                  background: 'linear-gradient(90deg,#a5b4fc,#67e8f9)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                CampusSphere
              </span>
              <span style={{ fontSize: '0.6875rem', color: '#64748b', fontWeight: 500 }}>
                {role === 'admin' ? 'Admin Portal' : 'Student Portal'}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden', padding: '0.5rem 0.75rem 0' }}
          >
            <div style={{
              padding: '0.375rem 0.75rem',
              borderRadius: '0.5rem',
              background: role === 'admin' ? 'rgba(139,92,246,.10)' : 'rgba(6,182,212,.09)',
              border: `1px solid ${role === 'admin' ? 'rgba(139,92,246,.25)' : 'rgba(6,182,212,.22)'}`,
              fontSize: '0.75rem',
              fontWeight: 600,
              color: role === 'admin' ? '#c4b5fd' : '#67e8f9',
              letterSpacing: '0.01em',
            }}>
              {role === 'admin' ? '⚙️  Administrator' : '🎓  Student'}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!collapsed && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ padding: '0.875rem 1.25rem 0.25rem', fontSize: '0.6875rem', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em' }}
          >
            Menu
          </motion.p>
        )}
      </AnimatePresence>

      <div className="sidebar-body">
        {navItems.map((item) => (
          <NavLink key={item.path} to={item.path} style={{ display: 'block', textDecoration: 'none' }}>
            {({ isActive }) => (
              <div
                className={`nav-item ${isActive ? 'active' : ''}`}
                title={collapsed ? item.label : undefined}
                style={{
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  ...(isActive ? {
                    background: 'linear-gradient(135deg, rgba(79,70,229,.20), rgba(6,182,212,.09))',
                    borderColor: 'rgba(99,102,241,.36)',
                    boxShadow: '0 0 16px rgba(79,70,229,.16)',
                    color: '#e0e7ff',
                  } : {}),
                }}
              >
                <item.icon size={17} className="nav-item-icon" style={{ flexShrink: 0, color: isActive ? '#a5b4fc' : '#71717a' }} />
                <AnimatePresence>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="nav-item-label"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            )}
          </NavLink>
        ))}
      </div>

      <div className="sidebar-footer">
        <button
          onClick={handleLogout}
          className="nav-item"
          title={collapsed ? 'Sign Out' : undefined}
          style={{ width: '100%', justifyContent: collapsed ? 'center' : 'flex-start', border: 'none', background: 'transparent', cursor: 'pointer' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <LogOut size={17} style={{ flexShrink: 0, color: '#ef4444' }} />
          <AnimatePresence>
            {!collapsed && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ fontSize: '0.875rem', fontWeight: 500, color: '#ef4444', whiteSpace: 'nowrap' }}>
                Sign Out
              </motion.span>
            )}
          </AnimatePresence>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.5rem 0.75rem', borderRadius: '0.75rem', background: 'rgba(255,255,255,0.03)', marginTop: '0.25rem', overflow: 'hidden' }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: avatarBg,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.6875rem',
            fontWeight: 700,
            color: '#fff',
          }}>
            {initials}
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ minWidth: 0 }}>
                <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#fafafa', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>{user?.name}</p>
                <p style={{ fontSize: '0.6875rem', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>{user?.email}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.aside>
  );
}
