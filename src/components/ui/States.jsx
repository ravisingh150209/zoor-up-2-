import React from 'react';
import { AlertCircle, RefreshCw, Inbox, Loader2 } from 'lucide-react';
import { Button } from './Button';

export const LoadingState = ({ message = 'Loading ZoorUp data...', fullPage = false }) => {
  return (
    <div
      className={`state-container ${fullPage ? 'min-h-[60vh]' : ''}`}
      style={{ border: 'none' }}
    >
      <div className="state-icon-wrap animate-spin text-primary-400">
        <Loader2 size={32} />
      </div>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', fontWeight: 500 }}>
        {message}
      </p>
    </div>
  );
};

export const ErrorState = ({
  title = 'Something went wrong',
  message = 'We encountered an error loading the information.',
  onRetry,
}) => {
  return (
    <div className="state-container">
      <div className="state-icon-wrap" style={{ color: 'var(--danger-text)', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)' }}>
        <AlertCircle size={32} />
      </div>
      <div>
        <h4 style={{ color: 'var(--text-primary)', marginBottom: '0.35rem' }}>{title}</h4>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', maxWidth: '420px' }}>
          {message}
        </p>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" icon={RefreshCw} onClick={onRetry}>
          Try Again
        </Button>
      )}
    </div>
  );
};

export const EmptyState = ({
  icon: Icon = Inbox,
  title = 'No items found',
  description = 'There are no records matching your current filter or category.',
  actionText,
  onAction,
}) => {
  return (
    <div className="state-container">
      <div className="state-icon-wrap">
        <Icon size={30} />
      </div>
      <div>
        <h4 style={{ color: 'var(--text-primary)', marginBottom: '0.35rem' }}>{title}</h4>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', maxWidth: '420px' }}>
          {description}
        </p>
      </div>
      {actionText && onAction && (
        <Button variant="primary" size="sm" onClick={onAction}>
          {actionText}
        </Button>
      )}
    </div>
  );
};
