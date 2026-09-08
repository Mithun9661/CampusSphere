import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { Bell, Plus, Send, X, Save, Loader2 } from 'lucide-react';
import { LoadingSkeleton } from '../../components/shared/LoadingSkeleton';
import { formatDate } from '../../utils/helpers';
import toast from 'react-hot-toast';
import { collection, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/firebase';

const TYPE_COLORS = { info: '#f97316', success: '#10b981', achievement: '#f59e0b', warning: '#f97316', reminder: '#06b6d4' };

export default function AdminNotifications() {
  const [loading, setLoading] = useState(true);
  const [notifs, setNotifs] = useState([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({ title: '', message: '', type: 'info' });

  useEffect(() => {
    const fetchNotifs = async () => {
      try {
        const snap = await getDocs(collection(db, 'notifications'));
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // Sort by date or id descending roughly
        list.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        setNotifs(list);
      } catch (err) {
        toast.error('Failed to load notifications');
      } finally {
        setLoading(false);
      }
    };
    fetchNotifs();
  }, []);

  const handleSend = async () => {
    if (!form.title || !form.message) { toast.error('Fill all fields'); return; }
    setIsSaving(true);
    try {
      const newId = `notif_${Date.now()}`;
      const payload = { ...form, date: new Date().toISOString().slice(0, 10), read: false };
      await setDoc(doc(db, 'notifications', newId), payload);
      setNotifs(p => [{ id: newId, ...payload }, ...p]);
      toast.success('Notification sent to all students!');
      setComposeOpen(false);
      setForm({ title: '', message: '', type: 'info' });
    } catch (err) {
      toast.error('Failed to send notification');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) return <LoadingSkeleton type="list" rows={5} />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Notifications</h1>
          <p className="text-sm mt-1" style={{ color: '#71717a' }}>Manage and send institutional notifications</p>
        </div>
        <motion.button 
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            console.log('Compose clicked');
            setComposeOpen(true);
          }}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg relative z-10"
          style={{ 
            background: 'linear-gradient(135deg, #f97316, #f59e0b)',
            cursor: 'pointer'
          }}
        >
          <Plus size={18} /> Compose Broadcast
        </motion.button>
      </div>

      <div className="space-y-3">
        <AnimatePresence>
          {notifs.map((n, i) => {
            const color = TYPE_COLORS[n.type] || '#f97316';
            return (
              <motion.div key={n.id} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-start gap-4 p-4 rounded-2xl"
                style={{ background: '#121212', border: `1px solid ${n.read ? '#27272a' : color + '30'}`, opacity: n.read ? 0.7 : 1 }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}20` }}>
                  <Bell size={16} style={{ color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-semibold text-sm text-white">{n.title}</p>
                    <span className="text-xs px-2 py-0.5 rounded-full capitalize" style={{ background: `${color}20`, color }}>{n.type}</span>
                    {!n.read && <span className="w-2 h-2 rounded-full" style={{ background: color }} />}
                  </div>
                  <p className="text-sm" style={{ color: '#a1a1aa' }}>{n.message}</p>
                  <p className="text-xs mt-1" style={{ color: '#475569' }}>{formatDate(n.date)}</p>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {composeOpen && (
          <ComposeModal 
            onClose={() => setComposeOpen(false)} 
            onSend={handleSend} 
            isSaving={isSaving} 
            form={form} 
            setForm={setForm}
            TYPE_COLORS={TYPE_COLORS}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ComposeModal({ onClose, onSend, isSaving, form, setForm, TYPE_COLORS }) {
  return createPortal(
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
        onClick={e => e.stopPropagation()}
        className="rounded-2xl p-8 w-full max-w-md"
        style={{ background: '#0a0a0a', border: '1px solid #27272a', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)' }}>
        
        <div className="flex items-center justify-between mb-7">
          <h3 className="font-bold text-xl text-white">Compose Broadcast</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors"><X size={24} /></button>
        </div>
        
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-semibold mb-2 text-zinc-300">Notification Title</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Important: Technical Interview Rescheduled"
              className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all focus:ring-2 focus:ring-orange-500/30"
              style={{ background: '#000000', border: '1px solid #27272a', color: '#fafafa' }} />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2 text-zinc-300">Broadcast Type</label>
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl text-sm outline-none"
              style={{ background: '#000000', border: '1px solid #27272a', color: '#fafafa' }}>
              {Object.keys(TYPE_COLORS).map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-2 text-zinc-300">Message Content</label>
            <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
              rows={4} placeholder="Type your message here..."
              className="w-full px-4 py-3 rounded-xl text-sm resize-none outline-none transition-all focus:ring-2 focus:ring-orange-500/30"
              style={{ background: '#000000', border: '1px solid #27272a', color: '#fafafa' }} />
          </div>
        </div>
        
        <div className="flex gap-3 mt-8 pt-4 border-t border-zinc-800">
          <button onClick={onClose} disabled={isSaving} className="flex-1 py-3.5 rounded-xl text-sm font-medium hover:bg-zinc-800 bg-zinc-900 text-zinc-400"
            style={{ opacity: isSaving ? 0.5 : 1 }}>Cancel</button>
          <button onClick={onSend} disabled={isSaving} className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-semibold text-white transition-all hover:scale-[1.02]"
            style={{ background: 'linear-gradient(135deg,#f97316,#f59e0b)', opacity: isSaving ? 0.7 : 1 }}>
            {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} 
            {isSaving ? 'Sending...' : 'Send Broadcast'}
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}
