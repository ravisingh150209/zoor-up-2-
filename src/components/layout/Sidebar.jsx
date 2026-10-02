import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Package,
  ShoppingBag,
  Receipt,
  CreditCard,
  Warehouse,
  TrendingDown,
  Truck,
  QrCode,
  Scan,
  Award,
  Tag,
  Gift,
  Clock,
  MessageSquare,
  Bell,
  BarChart3,
  Zap,
  Store,
  Settings,
  ShieldCheck,
  Compass,
  Home,
  Calendar,
  X
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { subscriptionService } from '../../services/subscriptionService';
import { ZoorUpLogo } from '../ui/ZoorUpLogo';

export const Sidebar = ({ isOpen, onClose, collapsed = false, onToggleCollapse, subData: propSubData }) => {
  const { user } = useAuth();
  const role = user?.role || 'business';
  const [internalSubData, setInternalSubData] = React.useState(null);
  const subData = propSubData !== undefined ? propSubData : internalSubData;

  React.useEffect(() => {
    if (propSubData === undefined && role === 'business' && user?.business_id) {
      subscriptionService.getSubscription(user.business_id).then(setInternalSubData).catch(() => {});
    }
  }, [propSubData, role, user?.business_id]);

  // Handle ESC key press to close mobile drawer
  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Navigation configurations
  const businessLinks = [
    { to: '/business', icon: LayoutDashboard, label: 'Dashboard', exact: true },
    { to: '/business/customers', icon: Users, label: 'Customers' },
    { to: '/business/products', icon: Package, label: 'Products / Services' },
    { to: '/business/qr-menu', icon: QrCode, label: 'Digital Menu' },
    { to: '/business/loyalty', icon: Award, label: 'Loyalty' },
    { to: '/business/rewards', icon: Gift, label: 'Rewards' },
    { to: '/business/offers', icon: Tag, label: 'Offers' },
    { to: '/business/table-booking', icon: Calendar, label: 'Table Booking' },
    { to: '/business/payments', icon: CreditCard, label: 'Payments / Transactions' },
    { to: '/business/staff', icon: UserCheck, label: 'Staff' },
    { to: '/business/settings', icon: Settings, label: 'Settings' },
  ];

  const adminLinks = [
    { to: '/admin', icon: LayoutDashboard, label: 'Overview', exact: true },
    { to: '/admin/businesses', icon: Store, label: 'Businesses' },
    { to: '/admin/plans', icon: Zap, label: 'SaaS Plans & Pricing' },
    { to: '/admin/settings', icon: Settings, label: 'Platform Settings' },
  ];

  const customerLinks = [
    { to: '/customer', icon: Home, label: 'Home', exact: true },
    { to: '/customer/loyalty', icon: Award, label: 'Rewards' },
    { to: '/customer/offers', icon: Tag, label: 'Offers' },
    { to: '/customer/scan-qr', icon: Scan, label: 'Scan QR' },
    { to: '/customer/table-booking', icon: Calendar, label: 'Book a Table' },
    { to: '/customer/activity', icon: Clock, label: 'Activity' },
    { to: '/customer/profile', icon: Settings, label: 'Profile' },
  ];

  let currentLinks = businessLinks;
  if (role === 'admin') currentLinks = adminLinks;
  else if (role === 'customer') currentLinks = customerLinks;
  else if (role === 'staff') {
    const perms = user?.permissions || ['dashboard', 'orders', 'products', 'billing', 'table-booking'];
    currentLinks = businessLinks.filter(item => {
      if (item.to === '/business') return perms.includes('dashboard');
      if (item.to.includes('customer')) return perms.includes('customers');
      if (item.to.includes('orders')) return perms.includes('orders');
      if (item.to.includes('products')) return perms.includes('products');
      if (item.to.includes('billing')) return perms.includes('billing');
      if (item.to.includes('table-booking')) return true;
      if (item.to.includes('inventory')) return perms.includes('inventory');
      if (item.to.includes('chat')) return perms.includes('chat');
      if (item.to.includes('qr')) return true;
      return false;
    });
  }

  return (
    <>
      {/* Mobile Drawer Overlay Backdrop */}
      <div
        className={`sidebar-backdrop ${isOpen ? 'active' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sidebar Container */}
      <aside
        className={`app-sidebar ${collapsed ? 'collapsed' : 'expanded'} ${isOpen ? 'mobile-open' : ''}`}
        aria-label="Application Sidebar Navigation"
      >
        {/* Brand Header */}
        <div
          style={{
            height: 'var(--topbar-height)',
            padding: collapsed ? '0 0.75rem' : '0 1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            flexShrink: 0,
          }}
        >
          <Link
            to={
              role === 'admin'
                ? '/admin'
                : role === 'customer'
                ? '/customer'
                : '/business'
            }
            onClick={() => onClose && onClose()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: collapsed ? '0' : '0.65rem',
              justifyContent: collapsed ? 'center' : 'flex-start',
              textDecoration: 'none',
              width: collapsed ? '100%' : 'auto',
              minWidth: 0,
            }}
            aria-label="ZOOR UP Home"
          >
            <ZoorUpLogo
              size={collapsed ? 'sm' : 'md'}
              width={collapsed ? 36 : 42}
              height={collapsed ? 36 : 42}
              collapsed={collapsed}
              priority
            />
            {!collapsed && (
              <div style={{ minWidth: 0 }}>
                <span
                  style={{
                    fontSize: '1.2rem',
                    fontWeight: 800,
                    letterSpacing: '-0.03em',
                    color: '#FFFFFF',
                    display: 'block',
                    lineHeight: 1.15,
                  }}
                >
                  ZOOR<span style={{ color: '#F59E0B' }}>UP</span>
                </span>
                <span
                  style={{
                    display: 'block',
                    fontSize: '0.6rem',
                    color: '#94A3B8',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginTop: '2px',
                  }}
                >
                  Smart Management
                </span>
              </div>
            )}
          </Link>

          {/* Close button on mobile/tablet (<= 1023px) */}
          <button
            onClick={onClose}
            className="sidebar-close-btn"
            title="Close navigation"
            aria-label="Close navigation"
          >
            <X size={22} />
          </button>
        </div>

        {/* Navigation list */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: collapsed ? '0.75rem 0.4rem' : '0.75rem 0.65rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.2rem',
          }}
        >
          {currentLinks.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.exact}
                onClick={() => onClose && onClose()}
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: collapsed ? '0.65rem' : '0.55rem 0.85rem',
                  borderRadius: '10px',
                  fontSize: '0.85rem',
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? '#FFFFFF' : '#CBD5E1',
                  background: isActive ? 'rgba(245, 158, 11, 0.15)' : 'transparent',
                  borderLeft: isActive ? '3px solid #F59E0B' : '3px solid transparent',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  transition: 'all var(--transition-fast)',
                })}
                title={collapsed ? item.label : undefined}
              >
                {({ isActive }) => (
                  <>
                    <Icon size={18} color={isActive ? '#F59E0B' : '#CBD5E1'} />
                    {!collapsed && <span>{item.label}</span>}
                  </>
                )}
              </NavLink>
            );
          })}
        </div>

        {/* Footer info & subscription status */}
        {!collapsed && role === 'business' && (
          <Link
            to="/business/subscription"
            onClick={() => onClose && onClose()}
            style={{
              display: 'block',
              padding: '0.85rem 1rem',
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
              background: 'rgba(255, 255, 255, 0.04)',
              fontSize: '0.75rem',
              textDecoration: 'none',
              transition: 'background 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ color: '#CBD5E1' }}>Subscription</span>
              <span
                style={{
                  color:
                    subData?.subscription_status === 'EXPIRED'
                      ? '#EF4444'
                      : subData?.subscription_status === 'TRIAL'
                      ? '#F59E0B'
                      : '#22C55E',
                  fontWeight: 700,
                }}
              >
                {subData?.subscription_status === 'EXPIRED'
                  ? 'TRIAL EXPIRED'
                  : subData?.subscription_status === 'TRIAL'
                  ? `${subData?.plan || 'FREE'} TRIAL`
                  : `${subData?.plan || 'FREE'} PLAN`}
              </span>
            </div>
            <p style={{ color: '#94A3B8', margin: 0 }}>
              {subData?.subscription_status === 'TRIAL'
                ? `⏳ ${subData?.trial_days_remaining ?? 30} days left • Upgrade`
                : subData?.subscription_status === 'EXPIRED'
                ? '⚠️ Premium locked • Upgrade now'
                : subData?.plan === 'FREE' || !subData?.plan
                ? 'Standard Free Plan • Upgrade'
                : '✓ Active subscription'}
            </p>
          </Link>
        )}
      </aside>
    </>
  );
};
