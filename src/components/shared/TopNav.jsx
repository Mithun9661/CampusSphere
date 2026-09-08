import { useState, useEffect } from 'react';
import { Search, Bell, Menu } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { generateInitials, getAvatarColor, formatDate } from '../../utils/helpers';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/firebase';

export default function TopNav({ title = 'Dashboard' }) {
  const { user } = useAuth();
  const { toggleSidebar } = useApp();
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchVal, setSearchVal] = useState('');

  const initials   = generateInitials(user?.name || '');
  const avatarBg   = getAvatarColor(user?.name || '');
  const rollNo     = user?.email ? user.email.split('@')[0].toUpperCase() : '';
  const [notifications, setNotifications] = useState([]);

  // Fetch notifications
  useEffect(() => {
    const fetchNotifs = async () => {
      try {
        const snap = await getDocs(collection(db, 'notifications'));
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        setNotifications(list.slice(0, 5)); // Keep latest 5
      } catch (err) {
        console.error(err);
      }
    };
    fetchNotifs();
  }, []);

  const unread     = notifications.filter(n => !n.read).length;
  const typeColor  = t => ({ info: '#f97316', success: '#10b981', achievement: '#f59e0b', warning: '#f97316', reminder: '#06b6d4' }[t] || '#f97316');

  return (
    <header className="top-nav">
      {/* Mobile menu toggle */}
      <button
        onClick={toggleSidebar}
        className="flex items-center justify-center rounded-xl transition-all hover:bg-white/5 active:scale-95"
        style={{ 
          width: 38, 
          height: 38, 
          border: '1px solid #27272a',
          background: 'rgba(255,255,255,0.03)',
          color: '#a1a1aa',
          cursor: 'pointer'
        }}
      >
        <Menu size={20} />
      </button>

      {/* Page breadcrumb */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#fafafa' }}>{title}</span>
        <span style={{ fontSize: '0.6875rem', color: '#475569' }}>STUDENT 360</span>
      </div>

      {/* Search bar */}
      <div style={{ flex: 1, maxWidth: 320, margin: '0 1.5rem', display: 'none' }} className="md:!flex">
        <div style={{ position: 'relative', width: '100%' }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#475569' }} />
          <input
            value={searchVal}
            onChange={e => setSearchVal(e.target.value)}
            placeholder="Search…"
            style={{
              width: '100%',
              paddingLeft: 36,
              paddingRight: 12,
              paddingTop: 8,
              paddingBottom: 8,
              borderRadius: '0.625rem',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid #27272a',
              color: '#fafafa',
              fontSize: '0.8125rem',
              outline: 'none',
              transition: 'border-color 0.15s',
            }}
            onFocus={e => e.target.style.borderColor = '#f97316'}
            onBlur={e => e.target.style.borderColor = '#27272a'}
          />
        </div>
      </div>

      {/* Right section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginLeft: 'auto' }}>

        {/* Bell */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setNotifOpen(p => !p)}
            style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '0.625rem', border: 'none', background: 'transparent', color: '#71717a', cursor: 'pointer', position: 'relative', transition: 'background 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.07)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <Bell size={17} />
            {unread > 0 && (
              <span style={{
                position: 'absolute', top: 4, right: 4,
                width: 8, height: 8, borderRadius: '50%',
                background: '#ef4444',
              }} />
            )}
          </button>

          <AnimatePresence>
            {notifOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setNotifOpen(false)} />
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.97 }}
                  transition={{ duration: 0.14 }}
                  style={{
                    position: 'absolute', right: 0, top: 44,
                    width: 360, borderRadius: '0.875rem', zIndex: 50,
                    background: '#121212', border: '1px solid #27272a',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.55)',
                    overflow: 'hidden',
                  }}
                >
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.875rem 1.125rem', borderBottom: '1px solid #27272a' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#fafafa' }}>Notifications</span>
                    <span className="badge badge-indigo">{unread} new</span>
                  </div>

                  {/* Items */}
                  <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                    {notifications.map(n => (
                      <div key={n.id} style={{ display: 'flex', gap: '0.75rem', padding: '0.75rem 1.125rem', borderBottom: '1px solid #27272a', opacity: n.read ? 0.55 : 1, cursor: 'pointer', transition: 'background 0.12s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: n.read ? '#334155' : typeColor(n.type), flexShrink: 0, marginTop: 5 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#fafafa' }}>{n.title}</p>
                          <p style={{ fontSize: '0.75rem', color: '#71717a', marginTop: 2, lineHeight: 1.4 }}>{n.message}</p>
                          <p style={{ fontSize: '0.6875rem', color: '#334155', marginTop: 4 }}>{formatDate(n.date)}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Footer */}
                  <div style={{ textAlign: 'center', padding: '0.75rem', borderTop: '1px solid #27272a' }}>
                    <button style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#f97316', background: 'none', border: 'none', cursor: 'pointer' }}>
                      View all notifications
                    </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 28, background: '#27272a' }} />

        {/* User */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: avatarBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6875rem', fontWeight: 700, color: '#fff', flexShrink: 0, overflow: 'hidden' }}>
            {rollNo ? (
              <>
                <img 
                  src={`https://info.aec.edu.in/acet/StudentPhotos/${rollNo}.jpg`} 
                  alt="Profile" 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => { e.target.style.display = 'none'; e.target.nextElementSibling.style.display = 'block'; }}
                />
                <span style={{ display: 'none' }}>{initials}</span>
              </>
            ) : (
              <span>{initials}</span>
            )}
          </div>
          <div className="hidden sm:block">
            <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#fafafa', lineHeight: 1.2 }}>{user?.name}</p>
            <p style={{ fontSize: '0.6875rem', color: '#475569', textTransform: 'capitalize' }}>{user?.role}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
