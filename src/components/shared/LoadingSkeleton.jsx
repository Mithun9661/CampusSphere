export function LoadingSkeleton({ rows = 5, type = 'table' }) {
  if (type === 'card') {
    return (
      <div className="stat-grid" style={{ marginBottom: '1.5rem' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="stat-card">
            <div className="shimmer" style={{ width: 40, height: 40, borderRadius: '0.625rem', marginBottom: '1rem' }} />
            <div className="shimmer" style={{ height: 10, width: '60%', borderRadius: 999, marginBottom: '0.5rem' }} />
            <div className="shimmer" style={{ height: 28, width: '40%', borderRadius: 999 }} />
          </div>
        ))}
      </div>
    );
  }

  if (type === 'list') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem', background: '#121212', border: '1px solid #27272a', borderRadius: '0.875rem' }}>
            <div className="shimmer" style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0 }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div className="shimmer" style={{ height: 10, width: '35%', borderRadius: 999 }} />
              <div className="shimmer" style={{ height: 10, width: '55%', borderRadius: 999 }} />
            </div>
            <div className="shimmer" style={{ height: 24, width: 64, borderRadius: 999 }} />
          </div>
        ))}
      </div>
    );
  }

  // Table skeleton
  return (
    <div className="table-wrapper">
      <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid #27272a' }}>
        <div className="shimmer" style={{ height: 12, width: 140, borderRadius: 999 }} />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.875rem 1.25rem', borderBottom: i < rows - 1 ? '1px solid #27272a' : 'none' }}>
          <div className="shimmer" style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0 }} />
          <div className="shimmer" style={{ height: 10, width: '22%', borderRadius: 999 }} />
          <div className="shimmer" style={{ height: 10, width: '18%', borderRadius: 999, marginLeft: 'auto' }} />
          <div className="shimmer" style={{ height: 10, width: '14%', borderRadius: 999 }} />
          <div className="shimmer" style={{ height: 22, width: 60, borderRadius: 999 }} />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="chart-card">
      <div className="shimmer" style={{ height: 12, width: 140, borderRadius: 999, marginBottom: '1.25rem' }} />
      <div className="shimmer" style={{ height: 200, width: '100%', borderRadius: '0.625rem' }} />
    </div>
  );
}
