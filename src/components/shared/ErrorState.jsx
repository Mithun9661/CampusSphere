import { motion } from 'framer-motion';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export function ErrorState({ message = "Unable to fetch student data", onRetry }) {
  return (
    <div className="w-full h-full flex items-center justify-center min-h-[300px]">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="rounded-2xl p-8 max-w-sm w-full text-center"
        style={{
          background: '#121212',
          border: '1px solid #27272a',
          boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
        }}
      >
        <div
          className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
          style={{ background: 'rgba(239, 68, 68, 0.1)' }}
        >
          <AlertTriangle size={32} style={{ color: '#ef4444' }} />
        </div>

        <h3 className="text-lg font-bold text-white mb-2">Connection Error</h3>
        <p className="text-sm text-zinc-400 mb-6 px-4 leading-relaxed">
          {message}
        </p>

        <button
          onClick={onRetry}
          className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl text-sm font-semibold text-white transition-all duration-300 group"
          style={{
            background: 'linear-gradient(135deg, #f97316, #ea580c)',
            boxShadow: '0 8px 20px rgba(249, 115, 22, 0.25)',
          }}
        >
          <RefreshCw size={16} className="group-hover:rotate-180 transition-transform duration-500" />
          Try Again
        </button>
      </motion.div>
    </div>
  );
}
