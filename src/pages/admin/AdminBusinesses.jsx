import React, { useState, useEffect } from 'react';
import {
  Store,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Eye,
  Power,
  Search,
  Filter,
  MapPin,
  ExternalLink
} from 'lucide-react';
import { adminService } from '../../services/adminService';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Tabs, SearchBar } from '../../components/ui/Controls';
import { LoadingState } from '../../components/ui/States';
import { useToast } from '../../context/ToastContext';

export const AdminBusinesses = () => {
  const { addToast } = useToast();
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [selectedBiz, setSelectedBiz] = useState(null);

  useEffect(() => {
    loadBusinesses();
  }, [statusFilter, search]);

  const loadBusinesses = async () => {
    setLoading(true);
    try {
      const data = await adminService.getAllBusinesses({ status: statusFilter, search });
      setBusinesses(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (bizId, newStatus) => {
    try {
      await adminService.updateBusinessStatus(bizId, newStatus);
      addToast(`Business status updated to ${newStatus}`, 'success');
      loadBusinesses();
      if (selectedBiz?.id === bizId) {
        setSelectedBiz((prev) => ({ ...prev, status: newStatus }));
      }
    } catch (e) {
      addToast('Error updating status', 'error');
    }
  };

  const columns = [
    {
      header: 'Business Name',
      accessor: 'name',
      render: (_, row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <img
            src={row.logo}
            alt={row.name}
            style={{ width: '42px', height: '42px', borderRadius: 'var(--radius-md)', objectFit: 'cover' }}
          />
          <div>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{row.name}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {row.category} • {row.city}
            </div>
          </div>
        </div>
      ),
    },
    {
      header: 'Owner',
      accessor: 'owner_name',
      render: (owner, row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{owner}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{row.email}</div>
        </div>
      ),
    },
    {
      header: 'Subscription Plan',
      accessor: 'subscription_plan',
      render: (plan) => (
        <Badge variant={plan === 'PREMIUM' ? 'primary' : plan === 'PRO' ? 'info' : 'neutral'}>
          {plan} TIER
        </Badge>
      ),
    },
    {
      header: 'Status',
      accessor: 'status',
      render: (status) => {
        if (status === 'APPROVED') return <Badge variant="success">Active</Badge>;
        if (status === 'PENDING') return <Badge variant="warning">Pending Approval</Badge>;
        return <Badge variant="danger">Suspended</Badge>;
      },
    },
    {
      header: 'Moderation Actions',
      accessor: 'id',
      align: 'right',
      render: (_, row) => (
        <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
          {row.status === 'PENDING' && (
            <Button
              variant="success"
              size="sm"
              onClick={() => handleUpdateStatus(row.id, 'APPROVED')}
            >
              Approve
            </Button>
          )}
          {row.status === 'APPROVED' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleUpdateStatus(row.id, 'SUSPENDED')}
              title="Suspend"
            >
              <Power size={15} className="text-amber-400" />
            </Button>
          )}
          {row.status === 'SUSPENDED' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleUpdateStatus(row.id, 'APPROVED')}
              title="Reactivate"
            >
              <CheckCircle2 size={15} className="text-emerald-400" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedBiz(row)}
            title="Inspect"
          >
            <Eye size={16} />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Merchant Directory & Approvals</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          Inspect merchant accounts, evaluate KYC data, approve store activations, or suspend rogue accounts.
        </p>
      </div>

      <Tabs
        activeTab={statusFilter}
        onChange={setStatusFilter}
        tabs={[
          { id: 'ALL', label: 'All Businesses' },
          { id: 'PENDING', label: 'Pending Approval' },
          { id: 'APPROVED', label: 'Active Stores' },
          { id: 'SUSPENDED', label: 'Suspended' },
        ]}
      />

      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search merchant name, owner, city, or category..."
      />

      {loading ? (
        <LoadingState message="Loading merchant records..." />
      ) : (
        <Table columns={columns} data={businesses} />
      )}

      {/* Detailed Merchant Inspection Modal */}
      {selectedBiz && (
        <Modal
          isOpen={Boolean(selectedBiz)}
          onClose={() => setSelectedBiz(null)}
          title={`Merchant: ${selectedBiz.name}`}
          maxWidth="640px"
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
              <a
                href={`/m/${selectedBiz.slug}`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-outline btn-sm flex items-center gap-1"
              >
                <span>Live Storefront</span>
                <ExternalLink size={14} />
              </a>
              <Button variant="secondary" onClick={() => setSelectedBiz(null)}>
                Close
              </Button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <img
                src={selectedBiz.logo}
                alt={selectedBiz.name}
                style={{ width: '56px', height: '56px', borderRadius: 'var(--radius-md)', objectFit: 'cover' }}
              />
              <div>
                <h4 style={{ fontSize: '1.1rem', fontWeight: 800 }}>{selectedBiz.name}</h4>
                <p style={{ color: 'var(--text-secondary)' }}>
                  Category: {selectedBiz.category} • Subscription: <strong>{selectedBiz.subscription_plan}</strong>
                </p>
              </div>
            </div>

            <div style={{ padding: '0.85rem', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-md)' }}>
              <div><strong>Owner:</strong> {selectedBiz.owner_name}</div>
              <div><strong>Email:</strong> {selectedBiz.email}</div>
              <div><strong>Phone:</strong> {selectedBiz.phone}</div>
              <div><strong>Location:</strong> {selectedBiz.address}, {selectedBiz.city}, {selectedBiz.state} ({selectedBiz.pincode})</div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {selectedBiz.status === 'PENDING' ? (
                <Button variant="success" block onClick={() => handleUpdateStatus(selectedBiz.id, 'APPROVED')}>
                  Approve Storefront
                </Button>
              ) : selectedBiz.status === 'APPROVED' ? (
                <Button variant="danger" block onClick={() => handleUpdateStatus(selectedBiz.id, 'SUSPENDED')}>
                  Suspend Merchant Account
                </Button>
              ) : (
                <Button variant="primary" block onClick={() => handleUpdateStatus(selectedBiz.id, 'APPROVED')}>
                  Reactivate Storefront
                </Button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
