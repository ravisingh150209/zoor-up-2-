import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  IndianRupee,
  ShoppingBag,
  Users,
  AlertTriangle,
  TrendingUp,
  Award,
  Tag,
  Zap,
  Plus,
  QrCode,
  Scan,
  Receipt,
  ArrowUpRight,
  ArrowRight,
  Sparkles,
  Calendar,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { businessService } from '../../services/businessService';
import { orderService, ORDER_STATUSES } from '../../services/orderService';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Card, CardHeader } from '../../components/ui/Card';
import { SalesBarChart, CategoryDistribution } from '../../components/charts/Charts';
import { LoadingState, ErrorState } from '../../components/ui/States';
import { ZoorUpLogo } from '../../components/ui/ZoorUpLogo';
import { useAuth } from '../../context/AuthContext';

export const BusinessDashboard = () => {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const requestGeneration = useRef(0);
  const navigate = useNavigate();

  useEffect(() => {
    setData(null);
    setRecentOrders([]);
    loadDashboard();
    return () => { requestGeneration.current += 1; };
  }, [user?.id, user?.business_id]);

  const loadDashboard = async () => {
    const generation = ++requestGeneration.current;
    setLoading(true);
    setLoadError('');
    try {
      const bizId = user?.business_id;
      const result = await businessService.getDashboardStats(bizId);
      let orders = [];
      try {
        orders = await orderService.getOrders(bizId);
      } catch (orderErr) {
        console.warn('Could not load recent orders:', orderErr);
        orders = [];
      }
      if (generation === requestGeneration.current) {
        setData(result);
        setRecentOrders(Array.isArray(orders) ? orders.slice(0, 5) : []);
      }
    } catch (e) {
      console.error(e);
      if (generation === requestGeneration.current) setLoadError(e.message || 'Unable to load business orders.');
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  };

  if (loading) {
    return <LoadingState message="Loading business intelligence metrics..." fullPage />;
  }
  if (loadError || !data) {
    return <ErrorState title="Unable to load business dashboard" message={loadError || 'Business data is unavailable.'} onRetry={loadDashboard} />;
  }

  const { stats, charts, business } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', maxWidth: '100%', overflowX: 'hidden' }}>
      {/* Onboarding in progress banner if not finished */}
      {business && !business.onboarding_completed && (
        <div
          style={{
            padding: '1rem 1.25rem',
            background: '#FEF3C7',
            border: '1px solid #FDE68A',
            borderRadius: 'var(--radius-lg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Sparkles style={{ color: '#D97706' }} size={22} />
            <div>
              <strong style={{ color: '#1A2B49', fontSize: '0.9rem' }}>
                Your business is ACTIVE! Complete Setup Wizard
              </strong>
              <p style={{ color: '#64748B', fontSize: '0.8rem', margin: 0 }}>
                Finish configuring your category, address, hours, first item & digital QR code.
              </p>
            </div>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate('/business/onboarding')}
            icon={ArrowRight}
          >
            Continue Onboarding
          </Button>
        </div>
      )}

      {/* Top Welcome & Quick Actions */}
      <div
        className="card"
        style={{
          background: '#FFFFFF',
          border: '1px solid var(--border-default)',
          borderRadius: '16px',
          boxShadow: 'var(--shadow-card)',
          padding: '1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          {(business.logo_url || business.logo) ? (
            <img
              src={business.logo_url || business.logo}
              alt={business.name}
              style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-md)', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)' }}
            />
          ) : (
            <ZoorUpLogo size="sm" width={48} height={48} priority />
          )}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <h2 style={{ fontSize: '1.45rem', fontWeight: 800 }}>
                {business.name}
              </h2>
              <Badge variant="success">Active Store</Badge>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              {business.category} • {business.city}, {business.state} • Operational Hours: {business.open_time} - {business.close_time}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Button
            variant="secondary"
            size="sm"
            icon={Scan}
            onClick={() => navigate('/business/qr-scanner')}
          >
            Scan Customer QR
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={Receipt}
            onClick={() => navigate('/business/billing')}
          >
            POS Billing
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={() => navigate('/business/products')}
          >
            Add Item
          </Button>
        </div>
      </div>

      {/* Primary KPI Grid (6 responsive stat cards) */}
      <div className="grid-stats">
        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span className="stat-label">Today's Sales</span>
              <div className="stat-value">₹{stats.todaySales.toLocaleString()}</div>
            </div>
            <div className="stat-icon">
              <IndianRupee size={22} />
            </div>
          </div>
          <div className="stat-meta" style={{ color: '#166534' }}>
            <TrendingUp size={14} color="#166534" />
            <span>{stats.todayOrdersCount} orders processed today</span>
          </div>
        </div>

        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span className="stat-label">Total Customers</span>
              <div className="stat-value">{stats.totalCustomers}</div>
            </div>
            <div className="stat-icon">
              <Users size={22} />
            </div>
          </div>
          <div className="stat-meta" style={{ color: '#D97706' }}>
            <Sparkles size={14} color="#F59E0B" />
            <span>+{stats.newCustomers} new members this month</span>
          </div>
        </div>

        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span className="stat-label">Active Orders</span>
              <div className="stat-value">{stats.pendingOrders}</div>
            </div>
            <div className="stat-icon">
              <ShoppingBag size={22} />
            </div>
          </div>
          <div className="stat-meta" style={{ color: '#64748B' }}>
            <Clock size={14} color="#F59E0B" />
            <span>{stats.completedOrders} orders delivered</span>
          </div>
        </div>

        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span className="stat-label">Low Stock Alert</span>
              <div className="stat-value" style={{ color: stats.lowStockCount > 0 ? '#991B1B' : '#1A2B49' }}>
                {stats.lowStockCount} items
              </div>
            </div>
            <div className="stat-icon" style={{ background: stats.lowStockCount > 0 ? '#FEE2E2' : 'var(--color-accent-light)', color: stats.lowStockCount > 0 ? '#991B1B' : '#F59E0B', border: stats.lowStockCount > 0 ? '1px solid #FECACA' : '1px solid #FDE68A' }}>
              <AlertTriangle size={22} />
            </div>
          </div>
          <div className="stat-meta">
            <Link to="/business/inventory" style={{ color: '#1A2B49', fontWeight: 600, textDecoration: 'none' }}>
              Restock inventory →
            </Link>
          </div>
        </div>

        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span className="stat-label">Net Profit</span>
              <div className="stat-value" style={{ color: '#166534' }}>₹{stats.netProfit.toLocaleString()}</div>
            </div>
            <div className="stat-icon">
              <TrendingUp size={22} />
            </div>
          </div>
          <div className="stat-meta" style={{ color: '#64748B' }}>
            <span>Expenses: ₹{stats.totalExpense.toLocaleString()}</span>
          </div>
        </div>

        <div className="stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span className="stat-label">Loyalty Points</span>
              <div className="stat-value" style={{ color: '#D97706' }}>{stats.totalPointsIssued} pts</div>
            </div>
            <div className="stat-icon">
              <Award size={22} />
            </div>
          </div>
          <div className="stat-meta" style={{ color: '#64748B' }}>
            <span>₹100 spend = 10 reward pts</span>
          </div>
        </div>
      </div>

      {/* Charts & Category Breakdown Grid */}
      <div className="grid-2">
        <Card>
          <CardHeader
            title="Weekly Sales Velocity"
            subtitle="Daily revenue (₹) across the last 7 days"
            icon={TrendingUp}
            action={
              <Link to="/business/analytics" style={{ color: '#1A2B49', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}>
                Full Analytics <ArrowUpRight size={14} color="#F59E0B" />
              </Link>
            }
          />
          <SalesBarChart data={charts.salesChart} height={190} />
        </Card>

        <Card>
          <CardHeader
            title="Sales by Category"
            subtitle="Top revenue generating departments"
            icon={Tag}
          />
          <CategoryDistribution items={charts.categoryDistribution} />
        </Card>
      </div>

      {/* Recent Orders & Storefront QR Showcase */}
      <div className="grid-2">
        {/* Recent Orders List */}
        <Card>
          <CardHeader
            title="Recent Live Orders"
            subtitle="Latest orders from digital menu & walk-in counter"
            icon={ShoppingBag}
            action={
              <Link to="/business/orders" style={{ color: '#1A2B49', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}>
                View All Orders <ArrowRight size={14} color="#F59E0B" />
              </Link>
            }
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {recentOrders.map((order) => {
              const statusBadge = ORDER_STATUSES[order.status] || { label: order.status, color: 'neutral' };
              return (
                <div
                  key={order.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.75rem',
                    background: 'var(--bg-surface-elevated)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                        {order.id}
                      </strong>
                      <Badge variant={statusBadge.color}>{statusBadge.label}</Badge>
                    </div>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      {order.customer_name} • {order.items.length} item(s) • {order.order_type}
                    </p>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>₹{order.total}</div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Digital QR Menu Standee Preview */}
        <Card>
          <CardHeader
            title="Digital Storefront & QR"
            subtitle="Customer mobile scanning & direct ordering"
            icon={QrCode}
            action={
              <Link to="/business/qr-menu" style={{ color: '#1A2B49', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}>
                Manage QR <ArrowRight size={14} color="#F59E0B" />
              </Link>
            }
          />

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              padding: '1rem',
              background: 'var(--bg-surface-elevated)',
              borderRadius: 'var(--radius-lg)',
              border: '1px dashed var(--border-default)',
            }}
          >
            <div
              style={{
                width: '60px',
                height: '60px',
                borderRadius: 'var(--radius-md)',
                background: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#1A2B49',
                marginBottom: '0.75rem',
                boxShadow: '0 4px 10px rgba(26, 43, 73, 0.12)',
              }}
            >
              <QrCode size={40} />
            </div>

            <h4 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.25rem' }}>
              Your Store is Ready to Scan
            </h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', maxWidth: '340px', marginBottom: '1rem' }}>
              Print your personalized table standees or share your store link directly on WhatsApp and Instagram bio.
            </p>

            <div style={{ display: 'flex', gap: '0.5rem', width: '100%', justifyContent: 'center' }}>
              <Link to="/business/qr-menu" className="btn btn-primary btn-sm">
                Generate & Print QR
              </Link>
              <Link to={`/b/${business?.slug || business?.id || user?.business_slug || user?.business_id}`} target="_blank" className="btn btn-outline btn-sm">
                View Public Menu
              </Link>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
