import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Calendar,
  Eye,
  EyeOff,
  GraduationCap,
  IdCard,
  Lock,
  Mail,
  Sparkles,
  User,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';

export default function RegisterPage() {
  const navigate = useNavigate();
  const { registerStudent } = useAuth();

  const [form, setForm] = useState({
    name: '',
    rollNo: '',
    email: '',
    branch: '',
    passoutYear: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleRegister = async (e) => {
    e.preventDefault();

    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    const rollNo = form.rollNo.trim().toUpperCase();
    const branch = form.branch.trim();
    const passoutYear = form.passoutYear.trim();

    if (!name || !email || !rollNo || !branch || !passoutYear || !form.password) {
      toast.error('Please fill all required fields.');
      return;
    }

    if (form.password.length < 6) {
      toast.error('Password must be at least 6 characters.');
      return;
    }

    if (form.password !== form.confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }

    setLoading(true);
    const result = await registerStudent({
      name,
      email,
      rollNo,
      branch,
      passoutYear,
      password: form.password,
    });
    setLoading(false);

    if (result.success) {
      toast.success('Student account created successfully!');
      navigate('/student/dashboard', { replace: true });
    } else {
      toast.error(result.error || 'Registration failed.');
    }
  };

  const inputClass = 'w-full pl-12 pr-4 py-3.5 rounded-2xl bg-black/40 border border-white/10 text-white outline-none focus:border-orange-500/50 focus:bg-black/60 transition-all placeholder:text-zinc-700 font-medium';

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden px-5 py-8" style={{ background: '#020202' }}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full opacity-[0.08] blur-[120px]" style={{ background: '#f97316' }} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full opacity-[0.08] blur-[120px]" style={{ background: '#f59e0b' }} />
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="relative w-full max-w-2xl">
        <div className="backdrop-blur-3xl border rounded-[2rem] p-7 md:p-9" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)', boxShadow: '0 40px 100px rgba(0,0,0,0.8)' }}>
          <div className="flex items-center justify-between gap-4 mb-8">
            <Link to="/login" className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-400 hover:text-white transition-colors" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <ArrowLeft size={18} />
            </Link>
            <div className="text-center flex-1">
              <div className="flex items-center justify-center gap-2">
                <GraduationCap size={28} className="text-orange-500" />
                <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">Create Student Account</h1>
              </div>
              <p className="text-zinc-500 text-sm mt-2 flex items-center justify-center gap-2">
                <Sparkles size={13} className="text-orange-400" />
                Registration is available for students only
              </p>
            </div>
            <div className="w-10" />
          </div>

          <form onSubmit={handleRegister} className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="Full Name" icon={<User size={18} />}>
              <input required type="text" placeholder="Your full name" value={form.name} onChange={(e) => updateField('name', e.target.value)} className={inputClass} />
            </Field>

            <Field label="Roll Number" icon={<IdCard size={18} />}>
              <input required type="text" placeholder="23P31A42XX" value={form.rollNo} onChange={(e) => updateField('rollNo', e.target.value.toUpperCase())} className={inputClass} />
            </Field>

            <div className="md:col-span-2">
              <Field label="Email" icon={<Mail size={18} />}>
                <input required type="email" placeholder="student@example.com" value={form.email} onChange={(e) => updateField('email', e.target.value)} className={inputClass} />
              </Field>
            </div>

            <Field label="Branch / Department" icon={<BookOpen size={18} />}>
              <input required type="text" placeholder="CSE - AI & ML" value={form.branch} onChange={(e) => updateField('branch', e.target.value)} className={inputClass} />
            </Field>

            <Field label="Passout Year" icon={<Calendar size={18} />}>
              <input required type="number" min="2024" max="2040" placeholder="2027" value={form.passoutYear} onChange={(e) => updateField('passoutYear', e.target.value)} className={inputClass} />
            </Field>

            <Field label="Password" icon={<Lock size={18} />}>
              <div className="relative">
                <input required type={showPassword ? 'text' : 'password'} placeholder="Minimum 6 characters" value={form.password} onChange={(e) => updateField('password', e.target.value)} className={`${inputClass} pr-12`} />
                <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors">
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </Field>

            <Field label="Confirm Password" icon={<Lock size={18} />}>
              <input required type={showPassword ? 'text' : 'password'} placeholder="Re-enter password" value={form.confirmPassword} onChange={(e) => updateField('confirmPassword', e.target.value)} className={inputClass} />
            </Field>

            <div className="md:col-span-2 pt-2">
              <motion.button whileHover={{ scale: 1.01, y: -1 }} whileTap={{ scale: 0.99 }} type="submit" disabled={loading} className="w-full py-4 rounded-2xl text-white font-bold flex items-center justify-center gap-2 disabled:opacity-60" style={{ background: 'linear-gradient(135deg, #f97316, #f59e0b)', boxShadow: '0 20px 40px rgba(249,115,22,0.22)' }}>
                {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>Create Student Account <ArrowRight size={18} /></>}
              </motion.button>
            </div>
          </form>

          <p className="text-center text-sm text-zinc-500 mt-6">
            Already registered?{' '}
            <Link to="/login" className="text-orange-400 font-semibold hover:text-orange-300">Sign in</Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}

function Field({ label, icon, children }) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">{label}</label>
      <div className="relative group">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-orange-500 transition-colors z-10">{icon}</span>
        {children}
      </div>
    </div>
  );
}
