import React from 'react';

export const Input = ({
  label,
  id,
  type = 'text',
  error,
  hint,
  icon: Icon,
  className = '',
  required = false,
  ...props
}) => {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="form-group">
      {label && (
        <label htmlFor={inputId} className="form-label">
          {label} {required && <span style={{ color: 'var(--accent-rose)' }}>*</span>}
        </label>
      )}
      <div style={{ position: 'relative', width: '100%' }}>
        {Icon && (
          <div
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
              pointerEvents: 'none',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Icon size={18} />
          </div>
        )}
        <input
          id={inputId}
          type={type}
          required={required}
          className={`form-input ${Icon ? 'pl-10' : ''} ${className}`}
          style={Icon ? { paddingLeft: '2.5rem' } : {}}
          {...props}
        />
      </div>
      {error && <p className="form-error">{error}</p>}
      {hint && !error && <p className="form-hint">{hint}</p>}
    </div>
  );
};
