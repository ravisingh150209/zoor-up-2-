import React, { useState, useEffect } from 'react';
import { UserCheck, Plus, Trash2, Shield, Mail, Phone, Check, Power, AlertCircle } from 'lucide-react';
import { staffService, ALL_PERMISSIONS } from '../../services/staffService';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Table } from '../../components/ui/Table';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { ConfirmationDialog } from '../../components/ui/Controls';
import { LoadingState } from '../../components/ui/States';
import { ImageUploader } from '../../components/ui/ImageUploader';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

export const StaffManagement = () => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    role: 'Store Cashier',
    email: '',
    phone: '',
    profile_image_url: null,
    permissions: ['dashboard', 'orders', 'billing'],
  });

  const bizId = user?.business_id;

  useEffect(() => {
    loadStaff();
  }, [bizId]);

  const loadStaff = async () => {
    setLoading(true);
    try {
      const data = await staffService.getStaffMembers(bizId);
      setStaff(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePermission = (permKey) => {
    setFormData((prev) => {
      const exists = prev.permissions.includes(permKey);
      const updated = exists
        ? prev.permissions.filter((p) => p !== permKey)
        : [...prev.permissions, permKey];
      return { ...prev, permissions: updated };
    });
  };

  const handleCreateStaff = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.email) {
      addToast('Name and Email are required', 'error');
      return;
    }
    try {
      await staffService.addStaff(bizId, formData);
      addToast(`Staff account created for ${formData.name}!`, 'success');
      setIsAddModalOpen(false);
      setFormData({
        name: '',
        role: 'Store Cashier',
        email: '',
        phone: '',
        permissions: ['dashboard', 'orders', 'billing'],
      });
      loadStaff();
    } catch (e) {
      addToast('Error adding staff member', 'error');
    }
  };

  const handleToggleStatus = async (staffId) => {
    try {
      const updated = await staffService.toggleStaffStatus(staffId);
      addToast(`Staff status updated to ${updated.status}`, 'info');
      loadStaff();
    } catch (e) {
      addToast('Failed to toggle status', 'error');
    }
  };

  const handleDeleteStaff = async () => {
    if (!deleteTarget) return;
    try {
      await staffService.deleteStaff(deleteTarget.id);
      addToast('Staff member deleted', 'success');
      setDeleteTarget(null);
      loadStaff();
    } catch (e) {
      addToast('Failed to delete staff member', 'error');
    }
  };

  const columns = [
    {
      header: 'Staff Member',
      accessor: 'name',
      render: (_, row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {(row.profile_image_url || row.avatar) ? (
            <img
              src={row.profile_image_url || row.avatar}
              alt={row.name}
              style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }}
            />
          ) : (
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: '#1A2B49',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '0.85rem',
              }}
            >
              {(row.name || 'S').charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <strong style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>{row.name}</strong>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{row.role}</div>
          </div>
        </div>
      ),
    },
    {
      header: 'Contact Credentials',
      accessor: 'email',
      render: (email, row) => (
        <div style={{ fontSize: '0.85rem' }}>
          <div>{email}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{row.phone}</div>
        </div>
      ),
    },
    {
      header: 'Status',
      accessor: 'status',
      render: (status) => (
        <Badge variant={status === 'ACTIVE' ? 'success' : 'neutral'}>
          {status}
        </Badge>
      ),
    },
    {
      header: 'Permissions',
      accessor: 'permissions',
      render: (perms) => (
        <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', maxWidth: '280px' }}>
          {perms.map((p) => (
            <span
              key={p}
              style={{
                fontSize: '0.7rem',
                padding: '2px 6px',
                borderRadius: '4px',
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--primary-300)',
                textTransform: 'capitalize',
              }}
            >
              {p}
            </span>
          ))}
        </div>
      ),
    },
    {
      header: 'Actions',
      accessor: 'id',
      align: 'right',
      render: (_, row) => (
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleToggleStatus(row.id);
            }}
            title={row.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
          >
            <Power size={15} className={row.status === 'ACTIVE' ? 'text-emerald-400' : 'text-slate-500'} />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteTarget(row);
            }}
            title="Delete Staff"
          >
            <Trash2 size={15} className="text-rose-400" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Staff & Access Control</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Invite team members, assign POS cashiers, and manage granular module permissions.
          </p>
        </div>

        <Button variant="primary" icon={Plus} onClick={() => setIsAddModalOpen(true)}>
          Add Staff Member
        </Button>
      </div>

      {loading ? (
        <LoadingState message="Loading staff accounts..." />
      ) : (
        <Table columns={columns} data={staff} />
      )}

      {/* Add Staff Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Invite / Create Staff Login"
        maxWidth="620px"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleCreateStaff}>
              Create Staff Account
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateStaff} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem' }}>
            <ImageUploader
              value={formData.profile_image_url}
              onChange={(url) => setFormData({ ...formData, profile_image_url: url })}
              aspectRatio="square"
              allowCamera={true}
              allowGallery={true}
              label="Staff Profile Photo"
              placeholderText="Upload Staff Photo"
              subText="Square (1:1)"
              entityType="staff_profile"
              businessId={bizId}
              bucket="staff-avatars"
            />
          </div>

          <div className="grid-2">
            <Input
              label="Staff Full Name"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Nitin Kumar"
            />
            <Input
              label="Assigned Role"
              required
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              placeholder="e.g. Store Cashier / Dispatcher"
            />
          </div>

          <div className="grid-2">
            <Input
              label="Login Email"
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="nitin@yourstore.com"
            />
            <Input
              label="Mobile Phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+91 98765 00000"
            />
          </div>

          {/* Granular Permissions Picker */}
          <div>
            <label className="form-label" style={{ marginBottom: '0.5rem', display: 'block' }}>
              Module Permissions (Owner Controls):
            </label>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '0.65rem',
                background: 'var(--bg-surface-elevated)',
                padding: '1rem',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              {ALL_PERMISSIONS.map((perm) => {
                const isChecked = formData.permissions.includes(perm.key);
                return (
                  <label
                    key={perm.key}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.5rem',
                      cursor: 'pointer',
                      fontSize: '0.825rem',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleTogglePermission(perm.key)}
                      style={{ marginTop: '2px', accentColor: 'var(--primary-500)' }}
                    />
                    <div>
                      <strong style={{ color: isChecked ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                        {perm.label}
                      </strong>
                      <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {perm.desc}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </form>
      </Modal>

      {/* Delete Staff Confirmation */}
      <ConfirmationDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteStaff}
        title="Remove Staff Access"
        message={`Are you sure you want to revoke access for ${deleteTarget?.name}? They will no longer be able to log into the business workspace.`}
        danger
      />
    </div>
  );
};
