import React from 'react';

export const Badge = ({
  children,
  variant = 'neutral',
  className = '',
  icon: Icon,
  ...props
}) => {
  return (
    <span className={`badge badge-${variant} ${className}`} {...props}>
      {Icon && <Icon size={12} />}
      <span>{children}</span>
    </span>
  );
};
