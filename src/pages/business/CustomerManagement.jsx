import React, { useState, useEffect } from 'react';
import {
  Users,
  Plus,
  Search,
  Filter,
  Eye,
  Trash2,
  Award,
  Calendar,
  IndianRupee,
  Phone,
  Mail,
  Edit2,
  CheckCircle2,
  Gift,
  Sparkles,
  Clock,
  AlertTriangle,
  ArrowRight,
  BellRing
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { customerService } from '../../services/customerService';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Avatar } from '../../components/ui/Avatar';
import { Modal } from '../../components/ui/Modal';
import { LoadingState, EmptyState } from '../../components/ui/States';
import { ConfirmationDialog, SearchBar, Tabs } from '../../components/ui/Controls';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

export const CustomerManagement = () => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [customersError, setCustomersError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedRank, setSelectedRank] = useState('ALL');
  const [insights, setInsights] = useState([]);
  const [activeInsightFilter, setActiveInsightFilter] = useState(null); // 'win_back' | 'close_to_reward' | 'vip_retention'

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // New Customer Form
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    phone: '',
    email: '',
    points: 100,
    wallet_balance: 0,
    notes: '',
  });

  const bizId = user?.business_id;

  useEffect(() => {
    fetchCustomers();
    loadInsights();
  }, [bizId, search, selectedRank]);

  const loadInsights = async () => {
    if (!bizId) return;
    try {
      const data = await customerService.getCustomerInsights(bizId);
      setInsights(data);
    } catch (e) {
      console.error('Failed to load insights:', e);
    }
  };

  const fetchCustomers = async () => {
    setLoading(true);
    setCustomersError('');
    try {
      const data = await customerService.getCustomers(bizId, {
        search,
        rank: selectedRank,
      });
      setCustomers(data);
    } catch (e) {
      setCustomersError(e.message || 'Connected customers could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCustomer = async (e) => {
    e.preventDefault();
    if (!newCustomer.name || !newCustomer.email) {
      addToast('Customer name and email are required to create a verified invite', 'error');
      return;
    }

    try {
      const invitation = await customerService.addCustomer(bizId, newCustomer);
      addToast(`Invite link created for ${invitation.email}. Share: ${invitation.qr_url}`, 'success');
      setIsAddModalOpen(false);
      setNewCustomer({ name: '', phone: '', email: '', points: 100, wallet_balance: 0, notes: '' });
      fetchCustomers();
    } catch (e) {
      addToast(e.message || 'Customer invitation failed', 'error');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await customerService.deleteCustomer(deleteTarget.id);
      addToast('Customer disconnected. Their account and other business links remain intact.', 'success');
      setDeleteTarget(null);
      fetchCustomers();
    } catch (e) {
      addToast(e.message || 'Failed to disconnect customer', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const getRankBadge = (rank) => {
    switch (rank) {
      case 'VIP': return <Badge variant="primary">VIP (10k+)</Badge>;
      case 'Platinum': return <Badge variant="info">Platinum</Badge>;
      case 'Gold': return <Badge variant="warning">Gold</Badge>;
      case 'Silver': return <Badge variant="neutral">Silver</Badge>;
      default: return <Badge variant="neutral">Bronze</Badge>;
    }
  };

  const columns = [
    {
      header: 'Customer',
      accessor: 'name',
      render: (_, row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Avatar src={row.avatar} name={row.name} size="md" />
          <div>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{row.name}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--primary-400)' }}>
              {row.customer_id}
            </div>
          </div>
        </div>
      ),
    },
    {
      header: 'Phone / Contact',
      accessor: 'phone',
      render: (phone, row) => (
        <div style={{ fontSize: '0.85rem' }}>
          <div>{phone}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{row.email || 'No email provided'}</div>
        </div>
      ),
    },
    {
      header: 'Loyalty Tier',
      accessor: 'rank',
      render: (rank, row) => (
        <div>
          {getRankBadge(rank)}
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
            {row.points} reward pts
          </div>
        </div>
      ),
    },
    {
      header: 'Orders & Spent',
      accessor: 'total_orders',
      render: (orders, row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{orders} orders</div>
          <div style={{ color: 'var(--accent-emerald)', fontSize: '0.8rem', fontWeight: 600 }}>
            ₹{row.total_spent?.toLocaleString() || 0}
          </div>
        </div>
      ),
    },
    {
      header: 'Actions',
      accessor: 'id',
      align: 'right',
      render: (_, row) => (
        <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSelectedCustomer(row);
            }}
            className="btn-ghost"
            style={{ padding: '6px', minHeight: '32px' }}
            title="View Details"
          >
            <Eye size={16} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDeleteTarget(row);
            }}
            className="btn-ghost text-rose-400"
            style={{ padding: '6px', minHeight: '32px' }}
            title="Delete Customer"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ),
    },
  ];

  const navigate = useNavigate();

  // If activeInsightFilter is selected, filter customers
  const displayedCustomers = activeInsightFilter
    ? (insights.find(i => i.id === activeInsightFilter)?.customers || customers)
    : customers;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header & Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Customers Directory</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Manage loyal customers, verify unique IDs (ZUP-CUS-XXXXXX), and track spending habits.
          </p>
        </div>

        <Button variant="primary" icon={Plus} onClick={() => setIsAddModalOpen(true)}>
          Add Customer
        </Button>
      </div>

      {/* Actionable Reminders & Customer Insights */}
      {insights.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <BellRing size={18} style={{ color: '#F59E0B' }} />
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1A2B49' }}>
                Actionable Customer Insights & Reminders
              </h3>
            </div>
            {activeInsightFilter && (
              <button
                onClick={() => setActiveInsightFilter(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#2563EB',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                Clear Insight Filter (Show All)
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
            {insights.map((ins) => {
              const isActive = activeInsightFilter === ins.id;
              return (
                <div
                  key={ins.id}
                  className="card"
                  style={{
                    background: isActive ? '#FEF3C7' : '#FFFFFF',
                    border: isActive ? '1.5px solid #F59E0B' : '1px solid #E2E8F0',
                    borderRadius: '12px',
                    padding: '1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1A2B49' }}>
                        {ins.title}
                      </span>
                      <Badge
                        style={{
                          background: ins.type === 'WIN_BACK' ? '#FEE2E2' : ins.type === 'REWARD_PROGRESS' ? '#FEF3C7' : '#EDE9FE',
                          color: ins.type === 'WIN_BACK' ? '#991B1B' : ins.type === 'REWARD_PROGRESS' ? '#92400E' : '#5B21B6',
                          fontWeight: 700,
                        }}
                      >
                        {ins.count} Customers
                      </Badge>
                    </div>
                    <p style={{ fontSize: '0.8rem', color: '#64748B', margin: 0 }}>
                      {ins.description}
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <Button
                      size="sm"
                      variant={isActive ? 'primary' : 'outline'}
                      onClick={() => setActiveInsightFilter(isActive ? null : ins.id)}
                      style={{ fontSize: '0.75rem', padding: '4px 10px', minHeight: '30px' }}
                    >
                      {isActive ? 'Filtered' : 'View Customers'}
                    </Button>
                    {ins.type === 'WIN_BACK' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => navigate('/business/loyalty')}
                        style={{ fontSize: '0.75rem', padding: '4px 10px', minHeight: '30px', color: '#B91C1C' }}
                      >
                        Create Win-back Offer
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <Tabs
        activeTab={selectedRank}
        onChange={setSelectedRank}
        tabs={[
          { id: 'ALL', label: 'All Ranks' },
          { id: 'VIP', label: 'VIP (10,000+ pts)' },
          { id: 'Platinum', label: 'Platinum' },
          { id: 'Gold', label: 'Gold' },
          { id: 'Silver', label: 'Silver' },
          { id: 'Bronze', label: 'Bronze' },
        ]}
      />

      {/* Search Bar */}
      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search by Customer ID (ZUP-CUS-...), Name, or Mobile Phone..."
      />

      {/* Customer List / Table */}
      {loading ? (
        <LoadingState message="Fetching registered customer records..." />
      ) : customersError ? (
        <div role="alert" style={{ padding: '1rem', color: 'var(--text-danger, #b42318)' }}>
          <p>{customersError}</p>
          <Button variant="secondary" onClick={fetchCustomers}>Retry</Button>
        </div>
      ) : displayedCustomers.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No customers found"
          description="Try changing your search keywords or rank tier filter."
          actionText="Add New Customer"
          onAction={() => setIsAddModalOpen(true)}
        />
      ) : (
        <Table
          columns={columns}
          data={displayedCustomers}
          onRowClick={(row) => setSelectedCustomer(row)}
        />
      )}

      {/* Add Customer Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add New Customer"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreateCustomer}>
              Create Invite
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateCustomer} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <Input
            label="Full Name"
            required
            value={newCustomer.name}
            onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
            placeholder="e.g. Vikram Malhotra"
          />

          <Input
            label="Email for verified invite"
            required
            type="email"
            value={newCustomer.email}
            onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
            placeholder="vikram@domain.com"
          />

        </form>
      </Modal>

      {/* Customer Profile & Order History Modal */}
      {selectedCustomer && (
        <Modal
          isOpen={Boolean(selectedCustomer)}
          onClose={() => setSelectedCustomer(null)}
          title={`Customer: ${selectedCustomer.name}`}
          maxWidth="640px"
          footer={
            <Button variant="secondary" onClick={() => setSelectedCustomer(null)}>
              Close
            </Button>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Top Identity Card */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                padding: '1.25rem',
                background: '#FAFAFB',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-default)',
              }}
            >
              <Avatar src={selectedCustomer.avatar} name={selectedCustomer.name} size="lg" />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>{selectedCustomer.name}</h3>
                  {getRankBadge(selectedCustomer.rank)}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#1A2B49', fontWeight: 600, marginTop: '2px' }}>
                  {selectedCustomer.customer_id}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Phone: {selectedCustomer.phone} {selectedCustomer.email && `• ${selectedCustomer.email}`}
                </div>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="grid-3">
              <div style={{ padding: '0.85rem', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Loyalty Points</span>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent-amber)' }}>
                  {selectedCustomer.points} pts
                </div>
              </div>
              <div style={{ padding: '0.85rem', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Total Spending</span>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent-emerald)' }}>
                  ₹{selectedCustomer.total_spent?.toLocaleString() || 0}
                </div>
              </div>
              <div style={{ padding: '0.85rem', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Total Orders</span>
                <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                  {selectedCustomer.total_orders || 0}
                </div>
              </div>
            </div>

            {/* Customer Notes */}
            <div style={{ padding: '0.85rem', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-md)' }}>
              <strong style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Customer Profile Notes:</strong>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginTop: '4px' }}>
                {selectedCustomer.notes || 'No special preferences noted for this customer.'}
              </p>
            </div>

            {/* Quick Add Points Action */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Gift size={18} className="text-amber-400" />
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Quick Award Bonus:</span>
              </div>
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                {[50, 100, 250].map((pts) => (
                  <Button
                    key={pts}
                    variant="secondary"
                    size="sm"
                    onClick={async () => {
                      await customerService.addPoints(selectedCustomer.id, pts);
                      selectedCustomer.points += pts;
                      addToast(`Awarded +${pts} points to ${selectedCustomer.name}`, 'success');
                      fetchCustomers();
                    }}
                  >
                    +{pts} pts
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Confirmation */}
      <ConfirmationDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Customer"
        message={`Are you sure you want to remove ${deleteTarget?.name} (${deleteTarget?.customer_id})? This will delete their points and records.`}
        danger
        loading={isDeleting}
      />
    </div>
  );
};
