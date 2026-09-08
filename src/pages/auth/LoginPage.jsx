import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
  GraduationCap,
  Eye,
  EyeOff,
  Shield,
  Mail,
  Lock,
  ArrowRight,
  Sparkles
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const [role, setRole] = useState('student');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const { login, loginWithMicrosoft } = useAuth();

  const handleMicrosoftLogin = async () => {
    const result = await loginWithMicrosoft();
    if (result.success) {
      toast.success("Student Login Successful");
      navigate("/student/dashboard");
    } else {
      toast.error(result.error || "Microsoft login failed");
    }
  };

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    
    const result = await login(email, password, role);
    
    if (result.success) {
      const displayRole = result.role || 'user';
      toast.success(`${displayRole.charAt(0).toUpperCase() + displayRole.slice(1)} Login Successful`);
      navigate(`/${displayRole}/dashboard`);
    } else {
      toast.error(result.error);
    }
    setLoading(false);
  };

  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        staggerChildren: 0.1,
        ease: [0.22, 1, 0.36, 1]
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden px-6 py-10"
      style={{ background: '#020202' }}
    >
      {/* Background Effects - Premium Ambient Glows */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full opacity-[0.08] blur-[120px]" style={{ background: '#f97316' }} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full opacity-[0.08] blur-[120px]" style={{ background: '#f59e0b' }} />
        <div className="absolute top-[30%] right-[20%] w-[30%] h-[30%] rounded-full opacity-[0.04] blur-[100px]" style={{ background: '#06b6d4' }} />
        
        {/* Animated grid overlay */}
        <div 
          className="absolute inset-0 opacity-[0.03]" 
          style={{ 
            backgroundImage: `radial-gradient(#ffffff 1px, transparent 1px)`, 
            backgroundSize: '40px 40px' 
          }} 
        />
      </div>

      {/* Login Card */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative w-full max-w-md"
      >
        <div
          className="backdrop-blur-3xl border rounded-[2rem] p-8 md:p-10"
          style={{
            background: 'rgba(255,255,255,0.03)',
            borderColor: 'rgba(255,255,255,0.08)',
            boxShadow: '0 40px 100px rgba(0,0,0,0.8), inset 0 0 0 1px rgba(255,255,255,0.05)',
          }}
        >
          {/* Logo */}
          <motion.div variants={itemVariants} className="flex flex-col items-center mb-10">
            <div
              className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6 relative group"
              style={{
                background: 'linear-gradient(135deg, #f97316, #f59e0b)',
                boxShadow: '0 20px 40px rgba(249,115,22,0.3)',
              }}
            >
              <GraduationCap size={40} color="white" />
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                className="absolute inset-[-4px] rounded-[26px] border border-orange-500/20 pointer-events-none" 
              />
            </div>

            <h1 className="text-4xl font-black text-white tracking-tighter flex items-center gap-2">
              STUDENT <span className="text-orange-500">360°</span>
            </h1>

            <p className="text-zinc-400 text-sm mt-3 font-medium flex items-center gap-2">
              <Sparkles size={14} className="text-orange-400" />
              AI-Powered Academic Intelligence
            </p>
          </motion.div>

          {/* Role Toggle */}
          <motion.div
            variants={itemVariants}
            className="flex gap-2 p-1.5 rounded-2xl mb-8"
            style={{
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            {['student', 'admin'].map((item) => (
              <button
                key={item}
                onClick={() => {
                  setRole(item);
                  setEmail('');
                  setPassword('');
                }}
                className={`flex-1 py-3.5 rounded-xl text-sm font-bold transition-all duration-500 relative overflow-hidden ${
                  role === item ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {role === item && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute inset-0 z-0"
                    style={{
                      background: 'linear-gradient(135deg, #f97316, #f59e0b)',
                      boxShadow: '0 8px 20px rgba(249,115,22,0.3)',
                    }}
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                  />
                )}
                <div className="flex items-center justify-center gap-2 relative z-10">
                  {item === 'student' ? <Mail size={16} /> : <Shield size={16} />}
                  {item === 'student' ? 'Student' : 'Admin'}
                </div>
              </button>
            ))}
          </motion.div>

          {/* Form Content */}
          <motion.div variants={itemVariants} className="space-y-5">
            <AnimatePresence mode="wait">
              {role === 'student' ? (
                <motion.form
                  key="student-form"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.3 }}
                  onSubmit={handleLogin}
                  className="space-y-5"
                >
                  {/* Email Input */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">
                      Student Email
                    </label>
                    <div className="relative group">
                      <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-orange-500 transition-colors" />
                      <input
                        type="email"
                        placeholder="student@s360.edu"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-12 pr-4 py-4 rounded-2xl bg-black/40 border border-white/10 text-white outline-none focus:border-orange-500/50 focus:bg-black/60 transition-all placeholder:text-zinc-700 font-medium"
                      />
                    </div>
                  </div>

                  {/* Password Input */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">
                      Password
                    </label>
                    <div className="relative group">
                      <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-orange-500 transition-colors" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pl-12 pr-12 py-4 rounded-2xl bg-black/40 border border-white/10 text-white outline-none focus:border-orange-500/50 focus:bg-black/60 transition-all placeholder:text-zinc-700 font-medium"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    disabled={loading}
                    className="w-full py-4 rounded-2xl text-white font-bold flex items-center justify-center gap-2 group relative overflow-hidden"
                    style={{
                      background: 'linear-gradient(135deg, #f97316, #f59e0b)',
                      boxShadow: '0 20px 40px rgba(249,115,22,0.25)',
                    }}
                  >
                    <motion.div 
                      className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 skew-x-[-20deg]" 
                    />
                    {loading ? (
                      <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        Student Login
                        <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </motion.button>
                </motion.form>
              ) : (
                <motion.form
                  key="admin-form"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.3 }}
                  onSubmit={handleLogin}
                  className="space-y-5"
                >
                  {/* Email Input */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">
                      Administrator ID
                    </label>
                    <div className="relative group">
                      <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-orange-500 transition-colors" />
                      <input
                        type="email"
                        placeholder="admin@s360.edu"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-12 pr-4 py-4 rounded-2xl bg-black/40 border border-white/10 text-white outline-none focus:border-orange-500/50 focus:bg-black/60 transition-all placeholder:text-zinc-700 font-medium"
                      />
                    </div>
                  </div>

                  {/* Password Input */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest ml-1">
                      Security Credential
                    </label>
                    <div className="relative group">
                      <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-orange-500 transition-colors" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pl-12 pr-12 py-4 rounded-2xl bg-black/40 border border-white/10 text-white outline-none focus:border-orange-500/50 focus:bg-black/60 transition-all placeholder:text-zinc-700 font-medium"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    disabled={loading}
                    className="w-full py-4 rounded-2xl text-white font-bold flex items-center justify-center gap-2 group relative overflow-hidden"
                    style={{
                      background: 'linear-gradient(135deg, #f97316, #f59e0b)',
                      boxShadow: '0 20px 40px rgba(249,115,22,0.25)',
                    }}
                  >
                    <motion.div 
                      className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 skew-x-[-20deg]" 
                    />
                    {loading ? (
                      <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        Authorize System
                        <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </motion.button>
                </motion.form>
              )}
            </AnimatePresence>
            
            <p className="text-center text-[10px] text-zinc-600 font-bold uppercase tracking-widest pt-2">
              Protected by Enterprise Grade Encryption
            </p>
          </motion.div>
        </div>
        
        {/* Support Hint */}
        <motion.div 
          variants={itemVariants}
          className="mt-8 text-center"
        >
          <p className="text-xs text-zinc-500">
            For technical support, contact the IT department at <span className="text-zinc-300 font-mono">support@s360.edu</span>
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}