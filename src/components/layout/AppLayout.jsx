import React, { useState, useEffect } from 'react';
import { Outlet, useLocation, Link } from 'react-router-dom';
import { Clock, AlertTriangle, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { subscriptionService } from '../../services/subscriptionService';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { MobileBottomNav } from './MobileBottomNav';
import { ErrorBoundary } from '../ui/ErrorBoundary';

export const AppLayout = ({ title = 'ZoorUp Workspace' }) => {
  const { user } = useAuth();
  const [subData, setSubData] = useState(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  // Close mobile sidebar on route change automatically
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  // Close mobile sidebar if resized to desktop viewport
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setMobileSidebarOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Lock body scroll when mobile drawer is open to prevent background scrolling
  useEffect(() => {
    if (mobileSidebarOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    } else {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, [mobileSidebarOpen]);

  useEffect(() => {
    let isMounted = true;
    if (user?.role === 'business' && user?.business_id) {
      subscriptionService.getSubscription(user.business_id)
        .then((data) => {
          if (isMounted) setSubData(data);
        })
        .catch(() => {});
    }

    const handleSubscriptionUpdate = (e) => {
      if (user?.business_id && (!e.detail?.storeId || e.detail.storeId === user.business_id)) {
        subscriptionService.getSubscription(user.business_id)
          .then((data) => {
            if (isMounted) setSubData(data);
          })
          .catch(() => {});
      }
    };

    window.addEventListener('zoorup:subscription-updated', handleSubscriptionUpdate);
    return () => {
      isMounted = false;
      window.removeEventListener('zoorup:subscription-updated', handleSubscriptionUpdate);
    };
  }, [user?.role, user?.business_id]);

  // Dynamic title based on route path
  const getPageTitle = () => {
    const p = location.pathname;
    if (p.includes('/customers')) return 'Customer Management';
    if (p.includes('/staff')) return 'Staff & Access Control';
    if (p.includes('/products')) return 'Products & Services';
    if (p.includes('/orders')) return 'Order Management';
    if (p.includes('/billing')) return 'Billing & POS Invoices';
    if (p.includes('/payments')) return 'Payments & Gateways';
    if (p.includes('/inventory')) return 'Inventory & Stock Alerts';
    if (p.includes('/expenses')) return 'Expense Tracking';
    if (p.includes('/suppliers')) return 'Supplier Directory';
    if (p.includes('/delivery')) return 'Delivery Operations';
    if (p.includes('/qr-menu')) return 'QR Menu & Catalog';
    if (p.includes('/qr-scanner')) return 'QR Scanner';
    if (p.includes('/loyalty')) return 'Loyalty & Reward Tiers';
    if (p.includes('/offers')) return 'Coupons & Discount Offers';
    if (p.includes('/chat')) return 'Customer Messages';
    if (p.includes('/notifications')) return 'Notifications Center';
    if (p.includes('/analytics')) return 'Analytics & Metrics';
    if (p.includes('/reports')) return 'Reports & Data Exports';
    if (p.includes('/subscription')) return 'SaaS Subscription Plan';
    if (p.includes('/profile')) return 'Business Profile';
    if (p.includes('/settings')) return 'Settings';
    if (p.includes('/admin')) return 'Platform Administration';
    if (p.includes('/customer')) return 'Customer Hub';
    return title;
  };

  return (
    <div className="app-container">
      <Sidebar
        isOpen={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(!collapsed)}
        subData={subData}
      />

      <div className="main-content">
        <Topbar
          onMenuClick={() => setMobileSidebarOpen(true)}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(!collapsed)}
          title={getPageTitle()}
        />

        {/* 30-Day Free Trial Non-Blocking Reminder Banners (Requirement 18) */}
        {user?.role === 'business' && subData && !location.pathname.includes('/subscription') && (
          <>
            {subData.subscription_status === 'TRIAL' && subData.trial_days_remaining <= 7 && (
              <div
                style={{
                  padding: '0.65rem 1.25rem',
                  background:
                    subData.trial_days_remaining <= 1 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                  borderBottom:
                    subData.trial_days_remaining <= 1 ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '0.825rem',
                  zIndex: 20,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Clock
                    size={16}
                    style={{
                      color: subData.trial_days_remaining <= 1 ? 'var(--danger-text)' : 'var(--warning-text)',
                    }}
                  />
                  <span>
                    <strong>
                      {subData.trial_days_remaining <= 1
                        ? 'Your free trial ends tomorrow!'
                        : `${subData.trial_days_remaining} days left in your 30-day free trial.`}
                    </strong>{' '}
                    Subscribe today to ensure continuous access to your premium business features.
                  </span>
                </div>
                <Link
                  to="/business/subscription"
                  style={{
                    color: 'var(--primary-400)',
                    fontWeight: 700,
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  Upgrade Now <ArrowRight size={14} />
                </Link>
              </div>
            )}

            {subData.subscription_status === 'EXPIRED' && (
              <div
                style={{
                  padding: '0.75rem 1.25rem',
                  background: 'rgba(239, 68, 68, 0.2)',
                  borderBottom: '1px solid rgba(239, 68, 68, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '0.825rem',
                  zIndex: 20,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <AlertTriangle size={16} style={{ color: 'var(--danger-text)' }} />
                  <span>
                    <strong>Your 30-day free trial has expired.</strong> Premium tools are currently locked. Your store data remains completely safe.
                  </span>
                </div>
                <Link
                  to="/business/subscription"
                  style={{
                    color: 'var(--danger-text)',
                    fontWeight: 700,
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  Choose a Plan <ArrowRight size={14} />
                </Link>
              </div>
            )}
          </>
        )}

        <main className="page-wrapper animate-fade-in">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>

        <MobileBottomNav />
      </div>
    </div>
  );
};
