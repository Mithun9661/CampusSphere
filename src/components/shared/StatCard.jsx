import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export default function StatCard({ title, value, subtitle, icon: Icon, color = '#f97316', trend, trendValue, delay = 0 }) {
  const trendColor = trend === 'up' ? '#10b981' : trend === 'down' ? '#ef4444' : '#71717a';
  const TrendIcon  = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35, ease: 'easeOut' }}
      className="stat-card"
      style={{
        boxShadow: `inset 0 0 10px ${color}10`,
      }}
    >
      {/* Subtle accent glow */}
      <div style={{
        position: 'absolute', top: '-10%', left: '-10%',
        width: 120, height: 120, borderRadius: '50%',
        background: color, opacity: 0.1, filter: 'blur(30px)',
        pointerEvents: 'none',
      }} />

      <div className="stat-card-content">
        <p className="stat-card-label">{title}</p>
        <p className="stat-card-value">{value}</p>
        {subtitle && <p className="stat-card-sub">{subtitle}</p>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.75rem' }}>
        <div className="stat-card-icon" style={{ background: `${color}1a`, border: `1px solid ${color}28` }}>
          {Icon && <Icon size={22} style={{ color }} />}
        </div>
        
        {trend && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '0.25rem 0.625rem', borderRadius: 999,
            background: `${trendColor}15`, color: trendColor,
            fontSize: '0.6875rem', fontWeight: 600,
          }}>
            <TrendIcon size={12} />
            {trendValue}
          </div>
        )}
      </div>
    </motion.div>
  );
}
