import React from 'react';

export const Card = ({
  children,
  className = '',
  hover = false,
  onClick,
  style = {},
  ...props
}) => {
  return (
    <div
      className={`card ${hover ? 'card-hover cursor-pointer' : ''} ${className}`}
      onClick={onClick}
      style={style}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader = ({ title, action, subtitle, icon: Icon }) => {
  return (
    <div className="card-header">
      <div>
        <h3 className="card-title">
          {Icon && <Icon size={18} className="text-primary-400" />}
          <span>{title}</span>
        </h3>
        {subtitle && <p style={{ fontSize: '0.8rem', marginTop: '2px', color: 'var(--text-secondary)' }}>{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
};
