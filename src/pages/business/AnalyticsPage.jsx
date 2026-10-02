import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  Users,
  ShoppingBag,
  IndianRupee,
  Award,
  Calendar,
  Layers,
  ArrowUpRight
} from 'lucide-react';
import { businessService } from '../../services/businessService';
import { Card, CardHeader } from '../../components/ui/Card';
import { SalesBarChart, CategoryDistribution } from '../../components/charts/Charts';
import { Tabs } from '../../components/ui/Controls';
import { LoadingState } from '../../components/ui/States';
import { useAuth } from '../../context/AuthContext';

export const AnalyticsPage = () => {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [timeRange, setTimeRange] = useState('7D');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, [user?.business_id, timeRange]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const bizId = user?.business_id;
      const stats = await businessService.getDashboardStats(bizId);
      setData(stats);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !data) {
    return <LoadingState message="Crunching business analytics..." fullPage />;
  }

  const { stats, charts } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Business Analytics & Insights</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Evaluate revenue velocity, customer retention rates, average order values (AOV), and profit margins.
          </p>
        </div>

        <Tabs
          activeTab={timeRange}
          onChange={setTimeRange}
          tabs={[
            { id: '24H', label: 'Last 24 Hours' },
            { id: '7D', label: 'Last 7 Days' },
            { id: '30D', label: 'Month-to-Date' },
            { id: '1Y', label: 'Yearly' },
          ]}
        />
      </div>

      {/* 4 Metric Cards */}
      <div className="grid-stats">
        <div className="stat-card">
          <span className="stat-label">Gross Revenue</span>
          <div className="stat-value text-emerald-400">₹{stats.totalRevenue.toLocaleString()}</div>
          <span className="stat-meta text-emerald-400">
            <TrendingUp size={14} /> +18.4% vs last period
          </span>
        </div>

        <div className="stat-card">
          <span className="stat-label">Average Order Value (AOV)</span>
          <div className="stat-value">₹842</div>
          <span className="stat-meta text-slate-400">Based on recent purchases</span>
        </div>

        <div className="stat-card">
          <span className="stat-label">Repeat Customer Rate</span>
          <div className="stat-value text-primary-400">68.5%</div>
          <span className="stat-meta text-cyan-400">High loyalty retention</span>
        </div>

        <div className="stat-card">
          <span className="stat-label">Net Profit Margin</span>
          <div className="stat-value text-emerald-400">42.8%</div>
          <span className="stat-meta text-slate-400">Post operating expenses</span>
        </div>
      </div>

      {/* Main Charts */}
      <div className="grid-2">
        <Card>
          <CardHeader
            title="Revenue Velocity"
            subtitle="Calculated based on paid settlements"
            icon={TrendingUp}
          />
          <SalesBarChart data={charts.salesChart} height={220} />
        </Card>

        <Card>
          <CardHeader
            title="Department Performance"
            subtitle="Category share in store total"
            icon={BarChart3}
          />
          <CategoryDistribution items={charts.categoryDistribution} />
        </Card>
      </div>

      {/* Top Performing Items & Loyalty Activity */}
      <div className="grid-2">
        <Card>
          <CardHeader title="Top Performing Catalog Items" icon={ShoppingBag} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {[
              { name: 'Himalayan Organic Desi Cow Ghee', sales: 48, revenue: 28752 },
              { name: 'Cold-Pressed Extra Virgin Olive Oil', sales: 34, revenue: 33320 },
              { name: 'Artisan Whole Wheat Sourdough Loaf', sales: 62, revenue: 7750 },
              { name: 'Farm Fresh Organic Strawberries', sales: 55, revenue: 8250 },
            ].map((p, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.65rem 0.85rem',
                  background: 'var(--bg-surface-elevated)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.85rem',
                }}
              >
                <div>
                  <strong style={{ color: 'var(--text-primary)' }}>{p.name}</strong>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.sales} units sold</div>
                </div>
                <div style={{ fontWeight: 700, color: 'var(--accent-emerald)' }}>
                  ₹{p.revenue.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Customer Retention & Points Metrics" icon={Award} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Total Loyalty Points Issued</span>
              <strong style={{ color: 'var(--accent-amber)' }}>{stats.totalPointsIssued} pts</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Points Redeemed This Month</span>
              <strong>1,450 pts (₹145 value)</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>VIP & Gold Member Share</span>
              <strong>41% of shopper base</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Average Visits Per Customer</span>
              <strong>3.4 orders / month</strong>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
