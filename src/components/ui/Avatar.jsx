import React from 'react';

export const Avatar = ({
  src,
  alt = 'Avatar',
  name = '',
  size = 'md',
  className = '',
}) => {
  const sizeMap = {
    sm: { width: '32px', height: '32px', fontSize: '0.75rem' },
    md: { width: '42px', height: '42px', fontSize: '0.9rem' },
    lg: { width: '56px', height: '56px', fontSize: '1.15rem' },
    xl: { width: '72px', height: '72px', fontSize: '1.4rem' },
  };

  const currentSize = sizeMap[size] || sizeMap.md;
  const initials = name
    ? name
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'ZU';

  return (
    <div
      className={`relative inline-flex items-center justify-center rounded-full overflow-hidden flex-shrink-0 ${className}`}
      style={{
        ...currentSize,
        backgroundColor: 'var(--color-accent-light)',
        border: '1px solid #FDE68A',
        color: 'var(--color-accent-dark)',
        fontWeight: 700,
      }}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
};
