import { motion } from 'framer-motion';
import { GraduationCap } from 'lucide-react';

export default function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#020202]">
      <div className="relative">
        {/* Animated CampusSphere rings */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          className="w-24 h-24 rounded-full border-t-2 border-indigo-500 border-r-2 border-transparent"
        />
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-2 rounded-full border-b-2 border-cyan-400 border-l-2 border-transparent"
        />

        {/* Logo in center */}
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: [0.8, 1.1, 1], opacity: 1 }}
            transition={{ duration: 0.5, repeat: Infinity, repeatType: 'reverse' }}
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, rgba(79,70,229,0.28), rgba(6,182,212,0.2))',
              boxShadow: '0 0 32px rgba(99,102,241,0.22)',
            }}
          >
            <GraduationCap size={30} className="text-white" />
          </motion.div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="absolute bottom-12 flex flex-col items-center gap-2"
      >
        <span
          className="text-xs font-black uppercase tracking-[0.3em]"
          style={{
            background: 'linear-gradient(90deg, #818cf8, #22d3ee, #a78bfa)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          CampusSphere
        </span>
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: i === 0 ? '#6366f1' : i === 1 ? '#22d3ee' : '#a78bfa' }}
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
}
