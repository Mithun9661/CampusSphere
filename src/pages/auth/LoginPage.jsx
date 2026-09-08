import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Eye, EyeOff, GraduationCap, Lock, Mail, Shield, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [role, setRole] = useState('student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const switchRole = (nextRole) => {
    setRole(nextRole);
    setEmail('');
    setPassword('');
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error('Enter email and password.');
      return;
    }

    setLoading(true);
    const result = await login(email, password, role);
    setLoading(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    const actualRole = result.role || 'student';
    toast.success(`${actualRole === 'admin' ? 'Admin' : 'Student'} Login Successful`);
    navigate(`/${actualRole}/dashboard`, { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden px-6 py-10" style={{ background: '#020202' }}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full opacity-[0.08] blur-[120px]" style={{ background: '#f97316' }} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full opacity-[0.08] blur-[120px]" style={{ background: '#f59e0b' }} />
        <div className="absolute top-[30%] right-[20%] w-[30%] h-[30%] rounded-full opacity-[0.04] blur-[100px]" style={{ background: '#06b6d4' }} />
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }} className="relative w-full max-w-md">
        <div className="backdrop-blur-3xl border rounded-[2rem] p-8 md:p-10" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)', boxShadow: '0 40px 100px rgba(0,0,0,0.8), inset 0 0 0 1px rgba(255,255,255,0.05)' }}>
          <div className="flex flex-col items-center mb-9">
            <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6 relative" style={{ background: 'linear-gradient(135deg, #f97316, #f59e0b)', boxShadow: '0 20px 40px rgba(249,115,22,0.3)' }}>
              <GraduationCap size={40} color="white" />
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 8, repeat: Infinity, ease: 'linear' }} className="absolute inset-[-4px] rounded-[26px] border border-orange-500/20" />
            </div>
            <h1 className="text-4xl font-black text-white tracking-tighter">STUDENT <span className="text-orange-500">360°</span></h1>
            <p className="text-zinc-400 text-sm mt-3 font-medium flex items-center gap-2">
              <Sparkles size={14} className="text-orange-400" /> AI-Powered Academic Intelligence
            </p>
          </div>

          <div className="flex gap-2 p-1.5 rounded-2xl mb-8" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <RoleButton active={role === 'student'} onClick={() => switchRole('student')} icon={<Mail size={16} />} label="Student" />
            <RoleButton active={role === 'admin'} onClick={() => switchRole('admin')} icon={<Shield size={16} />} label="Admin" />
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">
                {role === 'student' ? 'Student Email' : 'Administrator Email'}
              </label>
              <div className="relative group">
                <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-orange-500 transition-colors" />
                <input required type="email" placeholder={role === 'student' ? 'student@example.com' : 'admin@s360.edu'} value={email} onChange={(e) => setEmail(e.target.value)} className="w-full pl-12 pr-4 py-4 rounded-2xl bg-black/40 border border-white/10 text-white outline-none focus:border-orange-500/50 focus:bg-black/60 transition-all placeholder:text-zinc-700 font-medium" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">Password</label>
              <div className="relative group">
                <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-orange-500 transition-colors" />
                <input required type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full pl-12 pr-12 py-4 rounded-2xl bg-black/40 border border-white/10 text-white outline-none focus:border-orange-500/50 focus:bg-black/60 transition-all placeholder:text-zinc-700 font-medium" />
                <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors">
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <motion.button whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.98 }} type="submit" disabled={loading} className="w-full py-4 rounded-2xl text-white font-bold flex items-center justify-center gap-2 disabled:opacity-60" style={{ background: 'linear-gradient(135deg, #f97316, #f59e0b)', boxShadow: '0 20px 40px rgba(249,115,22,0.25)' }}>
              {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>{role === 'student' ? 'Student Login' : 'Admin Login'} <ArrowRight size={18} /></>}
            </motion.button>

            {role === 'student' && (
              <div className="text-center pt-1">
                <p className="text-sm text-zinc-500">
                  New student?{' '}
                  <button type="button" onClick={() => navigate('/register')} className="text-orange-400 font-semibold hover:text-orange-300 transition-colors">
                    Create account
                  </button>
                </p>
              </div>
            )}

            {role === 'admin' && (
              <p className="text-center text-xs text-zinc-600">Admin accounts are created by the system administrator only.</p>
            )}

            <p className="text-center text-[10px] text-zinc-600 font-bold uppercase tracking-widest pt-1">Protected by Enterprise Grade Encryption</p>
          </form>
        </div>

        <p className="mt-8 text-center text-xs text-zinc-500">For technical support, contact the IT department at <span className="text-zinc-300 font-mono">support@s360.edu</span></p>
      </motion.div>
    </div>
  );
}

function RoleButton({ active, onClick, icon, label }) {
  return (
    <button type="button" onClick={onClick} className={`flex-1 py-3.5 rounded-xl text-sm font-bold transition-all duration-300 ${active ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`} style={active ? { background: 'linear-gradient(135deg, #f97316, #f59e0b)', boxShadow: '0 8px 20px rgba(249,115,22,0.3)' } : undefined}>
      <span className="flex items-center justify-center gap-2">{icon}{label}</span>
    </button>
  );
}
