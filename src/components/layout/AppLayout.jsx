import React, { useState, useEffect } from 'react';
import { Outlet, useLocation, Link } from 'react-router-dom';
import { Clock, AlertTriangle, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { MobileBottomNav } from './MobileBottomNav';
import { ErrorBoundary } from '../ui/ErrorBoundary';

export const AppLayout = ({ title = 'ZoorUp Workspace' }) => {
  const { user } = useAuth();
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

  // Dynamic title based on route path
  const getPageTitle = () => {
    const p = location.pathname;
    if (p.includes('/customers')) return 'Customer Management';
    if (p.includes('/staff')) return 'Staff & Access Control';
    if (p.includes('/products')) return 'Products & Services';
    if (p.includes('/orders')) return 'Order Management';
    if (p.includes('/billing')) return 'Billing & POS Invoices';
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
      />

      <div className="main-content">
        <Topbar
          onMenuClick={() => setMobileSidebarOpen(true)}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(!collapsed)}
          title={getPageTitle()}
        />

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