import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Home,
  Users,
  QrCode,
  MoreHorizontal,
  Compass,
  Award,
  User,
  Package,
  Receipt,
  Warehouse,
  BarChart3,
  MessageSquare,
  Settings,
  Scan,
  Calendar,
  CreditCard
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Drawer } from '../ui/Drawer';

export const MobileBottomNav = () => {
  const { user } = useAuth();
  const [moreDrawerOpen, setMoreDrawerOpen] = useState(false);
  const role = user?.role || 'business';

  // More modules for Business Owner
  const businessMoreModules = [
    { to: '/business/customers', icon: Users, label: 'Customers CRM', desc: 'Profiles & visits' },
    { to: '/business/products', icon: Package, label: 'Products & Services', desc: 'Catalog, SKU & prices' },
    { to: '/business/payments', icon: CreditCard, label: 'Payments & UPI', desc: 'Direct UPI & Transactions' },
    { to: '/business/inventory', icon: Warehouse, label: 'Inventory & Stock', desc: 'Stock alerts & counts' },
    { to: '/business/loyalty', icon: Award, label: 'Loyalty & Rewards', desc: 'Points & tiers' },
    { to: '/business/chat', icon: MessageSquare, label: 'Customer Chat', desc: 'Direct messages' },
    { to: '/business/analytics', icon: BarChart3, label: 'Analytics', desc: 'Sales & customer metrics' },
    { to: '/business/staff', icon: Users, label: 'Staff Management', desc: 'Roles & permissions' },
    { to: '/business/settings', icon: Settings, label: 'Settings & Profile', desc: 'Store configurations' },
  ];

  if (role === 'business' || role === 'staff') {
    return (
      <>
        <nav className="mobile-bottom-nav" aria-label="Mobile Navigation">
          <NavLink
            to="/business"
            end
            className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}
          >
            <Home size={20} />
            <span>Home</span>
          </NavLink>

          <NavLink
            to="/business/billing"
            className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}
          >
            <Receipt size={20} />
            <span>Billing</span>
          </NavLink>

          <NavLink
            to="/business/table-booking"
            className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}
          >
            <Calendar size={20} />
            <span>Tables</span>
          </NavLink>

          <NavLink
            to="/business/qr-menu"
            className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}
          >
            <QrCode size={20} />
            <span>QR</span>
          </NavLink>

          <button
            type="button"
            className={`mobile-nav-item ${moreDrawerOpen ? 'active' : ''}`}
            onClick={() => setMoreDrawerOpen(true)}
          >
            <MoreHorizontal size={20} />
            <span>More</span>
          </button>
        </nav>

        {/* More Drawer */}
        <Drawer
          isOpen={moreDrawerOpen}
          onClose={() => setMoreDrawerOpen(false)}
          title="More Business Tools"
          width="320px"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {businessMoreModules.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMoreDrawerOpen(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.85rem',
                    padding: '0.75rem',
                    background: '#FFFFFF',
                    border: '1px solid var(--border-default)',
                    borderRadius: '12px',
                    textDecoration: 'none',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '10px',
                      background: 'var(--color-accent-light)',
                      border: '1px solid #FDE68A',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--color-accent)',
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={18} />
                  </div>
                  <div>
                    <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                      {item.label}
                    </h4>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '2px 0 0' }}>
                      {item.desc}
                    </p>
                  </div>
                </NavLink>
              );
            })}
          </div>
        </Drawer>
      </>
    );
  }

  if (role === 'customer') {
    return (
      <nav className="mobile-bottom-nav" aria-label="Customer Mobile Navigation">
        <NavLink
          to="/customer"
          end
          className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}
        >
          <Home size={20} />
          <span>Home</span>
        </NavLink>

        <NavLink
          to="/customer/businesses"
          className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}
        >
          <Compass size={20} />
          <span>Stores</span>
        </NavLink>

        <NavLink
          to="/customer/scan-qr"
          className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}
          style={{
            position: 'relative',
            marginTop: '-16px',
          }}
        >
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #1A2B49 0%, #0F172A 100%)',
              border: '2.5px solid #F59E0B',
              boxShadow: '0 4px 14px rgba(245, 158, 11, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#F59E0B',
            }}
          >
            <Scan size={22} />
          </div>
          <span style={{ fontWeight: 700, color: '#1A2B49', marginTop: '2px', fontSize: '0.72rem' }}>Scan</span>
        </NavLink>

        <NavLink
          to="/customer/table-booking"
          className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}
        >
          <Calendar size={20} />
          <span>Book Table</span>
        </NavLink>

        <NavLink
          to="/customer/loyalty"
          className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}
        >
          <Award size={20} />
          <span>Rewards</span>
        </NavLink>

        <NavLink
          to="/customer/profile"
          className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}
        >
          <User size={20} />
          <span>Profile</span>
        </NavLink>
      </nav>
    );
  }

  return null;
};
