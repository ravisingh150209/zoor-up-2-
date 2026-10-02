import React from 'react';
import { Search, X } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';

export const SearchBar = ({
  value,
  onChange,
  placeholder = 'Search records, customers, products...',
  onClear,
  className = '',
}) => {
  return (
    <div className={`search-bar-wrap ${className}`}>
      <Search size={18} className="search-bar-icon" />
      <input
        type="text"
        className="form-input search-bar-input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            onChange('');
            if (onClear) onClear();
          }}
          className="btn-ghost"
          style={{
            position: 'absolute',
            right: '8px',
            top: '50%',
            transform: 'translateY(-50%)',
            padding: '4px',
            minHeight: '28px',
          }}
          aria-label="Clear search"
        >
          <X size={15} />
        </button>
      )}
    </div>
  );
};

export const Tabs = ({ tabs = [], activeTab, onChange }) => {
  return (
    <div className="tabs-container" role="tablist">
      {tabs.map((tab) => {
        const id = typeof tab === 'object' ? tab.id : tab;
        const label = typeof tab === 'object' ? tab.label : tab;
        const icon = typeof tab === 'object' ? tab.icon : null;
        const count = typeof tab === 'object' ? tab.count : null;
        const isActive = activeTab === id;

        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`tab-btn ${isActive ? 'active' : ''}`}
            onClick={() => onChange(id)}
          >
            {icon}
            <span>{label}</span>
            {count !== null && count !== undefined && (
              <span
                style={{
                  fontSize: '0.72rem',
                  padding: '2px 7px',
                  borderRadius: '999px',
                  background: isActive ? 'var(--color-primary)' : 'var(--bg-surface-elevated)',
                  color: isActive ? '#fff' : 'var(--text-secondary)',
                }}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export const ConfirmationDialog = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed with this operation?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  danger = false,
  loading = false,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelText}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmText}
          </Button>
        </>
      }
    >
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
        {message}
      </p>
    </Modal>
  );
};

export const Pagination = ({
  currentPage = 1,
  totalPages = 1,
  onPageChange,
}) => {
  if (totalPages <= 1) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '1rem 0.5rem',
        gap: '0.5rem',
      }}
    >
      <Button
        variant="secondary"
        size="sm"
        disabled={currentPage <= 1}
        onClick={() => onPageChange(currentPage - 1)}
      >
        Previous
      </Button>
      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
        Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
      </span>
      <Button
        variant="secondary"
        size="sm"
        disabled={currentPage >= totalPages}
        onClick={() => onPageChange(currentPage + 1)}
      >
        Next
      </Button>
    </div>
  );
};
