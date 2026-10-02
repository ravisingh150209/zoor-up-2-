import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Menu, Bell, User, LogOut, ChevronDown, Sparkles, Store, Shield, Truck, QrCode } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';
import { ZoorUpLogo } from '../ui/ZoorUpLogo';
import { notificationService } from '../../services/notificationService';

export const Topbar = ({ onMenuClick, collapsed = false, onToggleCollapse, title = 'Dashboard' }) => {
  const { user, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;
    const updateCount = async () => {
      if (user) {
        try {
          const count = await notificationService.getUnreadCount(user);
          if (isMounted) setUnreadCount(count);
        } catch (_) {}
      }
    };
    updateCount();
    const interval = setInterval(updateCount, 15000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [user]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const getRoleBadge = () => {
    switch (user?.role) {
      case 'admin':
        return <Badge variant="danger" icon={Shield}>Platform Admin</Badge>;
      case 'business':
        return <Badge variant="info" icon={Store}>Business Owner</Badge>;
      case 'staff':
        return <Badge variant="warning" icon={User}>Staff ({user?.role_title || 'Operator'})</Badge>;
      case 'customer':
        return <Badge variant="primary" icon={Sparkles}>{user?.rank || 'Gold'} Member</Badge>;
      default:
        return <Badge variant="neutral">User</Badge>;
    }
  };

  return (
    <header className="topbar-header">
      {/* Left: Mobile hamburger, Mobile Logo & Page Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0, flexShrink: 1 }}>
        {/* Mobile & Tablet Hamburger Button (<= 1023px) */}
        <button
          onClick={onMenuClick}
          className="hamburger-btn"
          aria-label="Open navigation menu"
          title="Open Menu"
        >
          <Menu size={22} />
        </button>

        {/* Desktop Collapse Sidebar Toggle (>= 1024px) */}
        <button
          onClick={onToggleCollapse}
          className="hide-on-tablet-down btn-ghost"
          style={{ width: '38px', height: '38px', padding: '6px', borderRadius: 'var(--radius-md)' }}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <Menu size={20} />
        </button>

        {/* Mobile Header Logo (<= 1023px) */}
        <Link
          to="/"
          className="show-on-tablet-down"
          style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', textDecoration: 'none', flexShrink: 0 }}
          aria-label="ZOOR UP Home"
        >
          <ZoorUpLogo size="sm" width={32} height={32} priority />
        </Link>

        {/* Page Title & Business Name */}
        <div style={{ minWidth: 0, overflow: 'hidden' }}>
          <h2
            style={{
              fontSize: '1.05rem',
              fontWeight: 700,
              margin: 0,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              color: 'var(--text-primary)',
            }}
          >
            {title}
          </h2>
          {user?.business_name && (
            <p
              className="hide-on-mobile"
              style={{
                fontSize: '0.725rem',
                color: 'var(--text-secondary)',
                margin: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {user.business_name}
            </p>
          )}
        </div>
      </div>

      {/* Right: Quick actions, Role badge & User Menu */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexShrink: 0 }}>
        <div className="hide-on-tablet-down" style={{ display: 'flex', alignItems: 'center' }}>
          {getRoleBadge()}
        </div>

        {/* Public Store link for Business owner */}
        {user?.role === 'business' && (user?.business_slug || user?.business_id) && (
          <Link
            to={`/m/${user.business_slug || user.business_id}`}
            target="_blank"
            className="btn btn-outline btn-sm hide-on-tablet-down"
            style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
          >
            <QrCode size={14} />
            <span>Live QR Store</span>
          </Link>
        )}

        {/* Notifications Icon */}
        <Link
          to={user?.role === 'business' ? '/business/notifications' : '/customer/notifications'}
          className="btn-ghost"
          style={{
            position: 'relative',
            width: '38px',
            height: '38px',
            minWidth: '38px',
            minHeight: '38px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4px',
            borderRadius: 'var(--radius-md)',
          }}
          aria-label="Notifications"
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: '4px',
                right: '4px',
                minWidth: '16px',
                height: '16px',
                padding: '0 4px',
                borderRadius: '8px',
                background: '#EF4444',
                color: '#FFFFFF',
                fontSize: '0.65rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
              }}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Link>

        {/* User Profile dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.25rem 0.65rem',
              borderRadius: '999px',
              background: '#FFFFFF',
              border: '1px solid var(--border-default)',
              cursor: 'pointer',
            }}
            aria-expanded={dropdownOpen}
            aria-label="User account dropdown"
          >
            <Avatar src={user?.avatar} name={user?.name || user?.email} size="sm" />
            <span
              className="hide-on-tablet-down"
              style={{
                fontSize: '0.825rem',
                fontWeight: 600,
                maxWidth: '100px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: 'var(--text-primary)',
              }}
            >
              {user?.name || 'Account'}
            </span>
            <ChevronDown size={14} className="hide-on-tablet-down" style={{ color: 'var(--text-muted)' }} />
          </button>

          {dropdownOpen && (
            <div
              className="card animate-fade-in"
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                width: '230px',
                padding: '0.5rem',
                background: '#FFFFFF',
                borderRadius: '12px',
                boxShadow: '0 8px 24px rgba(26, 43, 73, 0.08)',
                zIndex: 100,
                border: '1px solid var(--border-default)',
              }}
            >
              <div style={{ padding: '0.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
                <p style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                  {user?.name}
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user?.customer_id || user?.email}
                </p>
              </div>


              <button
                onClick={handleLogout}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem',
                  fontSize: '0.825rem',
                  color: 'var(--accent-rose)',
                  marginTop: '0.25rem',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <LogOut size={14} />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
