import React, { useState, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';

export const Table = ({
  columns = [],
  data = [],
  keyField = 'id',
  onRowClick,
  emptyMessage = 'No records found',
  mobileCardRender, // Optional custom card renderer for mobile
}) => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkWidth = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkWidth();
    window.addEventListener('resize', checkWidth);
    return () => window.removeEventListener('resize', checkWidth);
  }, []);

  if (!data || data.length === 0) {
    return (
      <div
        style={{
          padding: '2.5rem',
          textAlign: 'center',
          color: 'var(--text-secondary)',
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <p>{emptyMessage}</p>
      </div>
    );
  }

  // Mobile Card View Mode
  if (isMobile) {
    return (
      <div className="table-cards-mobile">
        {data.map((row, index) => {
          if (mobileCardRender) {
            return (
              <div key={row[keyField] || index} onClick={() => onRowClick && onRowClick(row)}>
                {mobileCardRender(row, index)}
              </div>
            );
          }

          // Default smart mobile card transformation
          return (
            <div
              key={row[keyField] || index}
              className="card card-hover"
              onClick={() => onRowClick && onRowClick(row)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.65rem',
                position: 'relative',
              }}
            >
              {columns.map((col, colIdx) => {
                const val = col.render ? col.render(row[col.accessor], row) : row[col.accessor];
                return (
                  <div
                    key={col.accessor || colIdx}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingBottom: colIdx < columns.length - 1 ? '0.45rem' : '0',
                      borderBottom: colIdx < columns.length - 1 ? '1px dashed var(--border-subtle)' : 'none',
                    }}
                  >
                    <span style={{ fontSize: '0.785rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                      {col.header}
                    </span>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {val}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  }

  // Desktop Table Mode
  return (
    <div className="table-responsive-container">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((col, idx) => (
              <th
                key={col.accessor || idx}
                style={{
                  textAlign: col.align || 'left',
                  width: col.width || 'auto',
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIdx) => (
            <tr
              key={row[keyField] || rowIdx}
              onClick={() => onRowClick && onRowClick(row)}
              style={{ cursor: onRowClick ? 'pointer' : 'default' }}
            >
              {columns.map((col, colIdx) => {
                const val = col.render ? col.render(row[col.accessor], row) : row[col.accessor];
                return (
                  <td
                    key={col.accessor || colIdx}
                    style={{ textAlign: col.align || 'left' }}
                  >
                    {val}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
