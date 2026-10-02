import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ShieldAlert,
  Store,
  Users,
  ShoppingBag,
  TrendingUp,
  Zap,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Power
} from 'lucide-react';
import { adminService } from '../../services/adminService';
import { Card, CardHeader } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { LoadingState } from '../../components/ui/States';
import { useToast } from '../../context/ToastContext';

export const AdminDashboard = () => {
  const { addToast } = useToast();
  const [stats, setStats] = useState(null);
  const [pendingBusinesses, setPendingBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadAdminData();
  }, []);

  const loadAdminData = async () => {
    setLoading(true);
    try {
      const platformStats = await adminService.getPlatformStats();
      const allBiz = await adminService.getAllBusinesses();
      setStats(platformStats);
      setPendingBusinesses(allBiz.filter((b) => b.status === 'PENDING'));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveBusiness = async (bizId, name) => {
    try {
      await adminService.updateBusinessStatus(bizId, 'APPROVED');
      addToast(`Approved ${name} for platform access!`, 'success');
      loadAdminData();
    } catch (e) {
      addToast('Error approving business', 'error');
    }
  };

  const handleRejectBusiness = async (bizId, name) => {
    try {
      await adminService.updateBusinessStatus(bizId, 'SUSPENDED');
      addToast(`Suspended onboarding for ${name}`, 'warning');
      loadAdminData();
    } catch (e) {
      addToast('Error rejecting business', 'error');
    }
  };

  if (loading || !stats) {
    return <LoadingState message="Loading platform control metrics..." fullPage />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header Banner */}
      <div
        className="card"
        style={{
          background: 'linear-gradient(135deg, rgba(225, 29, 72, 0.15) 0%, rgba(15, 23, 42, 0.95) 100%)',
          border: '1px solid rgba(225, 29, 72, 0.3)',
          padding: '1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <ShieldCheck size={22} className="text-rose-400" />
            <h2 style={{ fontSize: '1.45rem', fontWeight: 800 }}>Platform Superadmin Console</h2>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Global telemetry, multi-tenant merchant onboarding, subscription MRR, and platform health.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Button variant="danger" size="sm" onClick={() => navigate('/admin/businesses')}>
            Manage Businesses ({stats.totalBusinesses})
          </Button>
          <Button variant="secondary" size="sm" onClick={() => navigate('/admin/plans')}>
            Configure Plans
          </Button>
        </div>
      </div>

      {/* High-level KPI Cards */}
      <div className="grid-stats">
        <div className="stat-card">
          <span className="stat-label">Total Businesses</span>
          <div className="stat-value">{stats.totalBusinesses}</div>
          <span className="stat-meta text-emerald-400">
            {stats.activeBusinesses} active • {stats.pendingBusinesses} pending
          </span>
        </div>

        <div className="stat-card">
          <span className="stat-label">Platform SaaS MRR</span>
          <div className="stat-value text-emerald-400">
            ₹{stats.monthlySaaSRevenue.toLocaleString()}
          </div>
          <span className="stat-meta text-slate-400">Monthly subscription billing</span>
        </div>

        <div className="stat-card">
          <span className="stat-label">Registered Customers</span>
          <div className="stat-value text-cyan-400">{stats.totalCustomers}</div>
          <span className="stat-meta text-slate-400">Universal loyalty passes issued</span>
        </div>

        <div className="stat-card">
          <span className="stat-label">Platform GMV</span>
          <div className="stat-value">₹{stats.platformGMV.toLocaleString()}</div>
          <span className="stat-meta text-slate-400">{stats.totalOrders} total orders executed</span>
        </div>
      </div>

      {/* Pending Approvals Review Queue */}
      <Card>
        <CardHeader
          title={`Pending Merchant Onboarding Approvals (${pendingBusinesses.length})`}
          subtitle="Review and authorize new local businesses before live storefront publication"
          icon={AlertTriangle}
          action={
            <Link to="/admin/businesses" className="text-primary-400 text-xs hover:underline flex items-center gap-1">
              All Businesses <ArrowRight size={14} />
            </Link>
          }
        />

        {pendingBusinesses.length === 0 ? (
          <div style={{ padding: '1.75rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            <CheckCircle2 size={32} className="text-emerald-400 mx-auto mb-2" />
            Great news! Zero pending merchant onboarding reviews in the queue.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {pendingBusinesses.map((biz) => (
              <div
                key={biz.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '1rem',
                  background: 'var(--bg-surface-elevated)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--border-subtle)',
                  flexWrap: 'wrap',
                  gap: '1rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <img
                    src={biz.logo}
                    alt={biz.name}
                    style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-md)', objectFit: 'cover' }}
                  />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <strong style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>
                        {biz.name}
                      </strong>
                      <Badge variant="warning">Awaiting Approval</Badge>
                    </div>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      Owner: {biz.owner_name} ({biz.email}) • {biz.city}, {biz.state} • Category: {biz.category}
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRejectBusiness(biz.id, biz.name)}
                  >
                    Reject
                  </Button>
                  <Button
                    variant="success"
                    size="sm"
                    onClick={() => handleApproveBusiness(biz.id, biz.name)}
                  >
                    Approve Merchant
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};
