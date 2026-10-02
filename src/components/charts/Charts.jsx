import React from 'react';

export const SalesBarChart = ({ data = [], height = 180 }) => {
  if (!data || data.length === 0) return null;

  const maxSales = Math.max(...data.map(d => d.sales), 1000);

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          height: `${height}px`,
          padding: '0.5rem 0',
          gap: '0.5rem',
        }}
      >
        {data.map((item, idx) => {
          const heightPercent = Math.round((item.sales / maxSales) * 100);
          return (
            <div
              key={idx}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                height: '100%',
                justifyContent: 'flex-end',
                group: 'relative',
              }}
            >
              <div
                title={`₹${item.sales} (${item.orders} orders)`}
                style={{
                  width: '80%',
                  maxWidth: '36px',
                  height: `${Math.max(6, heightPercent)}%`,
                  background: 'linear-gradient(180deg, #243B5F 0%, #1A2B49 100%)',
                  borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
                  transition: 'height 0.4s ease',
                  position: 'relative',
                }}
              />
              <span
                style={{
                  fontSize: '0.72rem',
                  color: 'var(--text-secondary)',
                  marginTop: '6px',
                }}
              >
                {item.day}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const CategoryDistribution = ({ items = [] }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      {items.map((cat, idx) => (
        <div key={idx}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '0.825rem',
              marginBottom: '4px',
            }}
          >
            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{cat.name}</span>
            <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{cat.percentage}%</span>
          </div>
          <div
            style={{
              width: '100%',
              height: '8px',
              background: 'var(--bg-surface-elevated)',
              borderRadius: '999px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${cat.percentage}%`,
                height: '100%',
                background: cat.color || 'var(--primary-500)',
                borderRadius: '999px',
                transition: 'width 0.5s ease',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};
