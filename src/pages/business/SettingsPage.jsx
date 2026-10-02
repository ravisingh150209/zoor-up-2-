import React, { useState } from 'react';
import { Settings, Shield, Bell, Key, Store, QrCode, CreditCard, Save } from 'lucide-react';
import { Card, CardHeader } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Tabs } from '../../components/ui/Controls';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

export const SettingsPage = () => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState('security');
  const [saving, setSaving] = useState(false);

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [notifSettings, setNotifSettings] = useState({
    emailAlerts: true,
    whatsappOrderAlerts: true,
    lowStockNotifications: true,
    dailyDigest: false,
  });

  const handleSavePassword = (e) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      addToast('New passwords do not match', 'error');
      return;
    }
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      addToast('Password updated securely!', 'success');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    }, 400);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
      <div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Business & Workspace Settings</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          Configure login credentials, communication preferences, and security access controls.
        </p>
      </div>

      <Tabs
        activeTab={activeTab}
        onChange={setActiveTab}
        tabs={[
          { id: 'security', label: 'Security & Password', icon: <Key size={14} /> },
          { id: 'notifications', label: 'Alert Preferences', icon: <Bell size={14} /> },
          { id: 'integrations', label: 'API & Gateways', icon: <Shield size={14} /> },
        ]}
      />

      {activeTab === 'security' && (
        <Card>
          <CardHeader title="Change Master Password" icon={Key} />
          <form onSubmit={handleSavePassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <Input
              label="Current Password"
              type="password"
              required
              value={passwordForm.currentPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
              placeholder="••••••••"
            />
            <div className="grid-2">
              <Input
                label="New Password"
                type="password"
                required
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                placeholder="••••••••"
              />
              <Input
                label="Confirm New Password"
                type="password"
                required
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                placeholder="••••••••"
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button type="submit" variant="primary" loading={saving} icon={Save}>
                Update Password
              </Button>
            </div>
          </form>
        </Card>
      )}

      {activeTab === 'notifications' && (
        <Card>
          <CardHeader title="Channel Alert Notifications" icon={Bell} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {[
              { key: 'emailAlerts', title: 'Email Order Confirmations', desc: 'Receive real-time email dispatch tickets' },
              { key: 'whatsappOrderAlerts', title: 'WhatsApp Customer Alerts', desc: 'Notify customers via WhatsApp on dispatch' },
              { key: 'lowStockNotifications', title: 'Low Stock Auto-Alerts', desc: 'Notify store manager when stock <= 5' },
              { key: 'dailyDigest', title: 'Nightly Business Summary', desc: 'Automated end-of-day sales digest PDF' },
            ].map((pref) => (
              <label
                key={pref.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.85rem',
                  background: 'var(--bg-surface-elevated)',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                    {pref.title}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {pref.desc}
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={notifSettings[pref.key]}
                  onChange={(e) => {
                    setNotifSettings({ ...notifSettings, [pref.key]: e.target.checked });
                    addToast('Notification preferences saved', 'info');
                  }}
                  style={{ width: '20px', height: '20px', accentColor: 'var(--primary-500)' }}
                />
              </label>
            ))}
          </div>
        </Card>
      )}

      {activeTab === 'integrations' && (
        <Card>
          <CardHeader title="External Gateways & Hardware" icon={Shield} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.85rem' }}>
            <div style={{ padding: '1rem', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-md)' }}>
              <strong>Direct UPI</strong>
              <p style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>
                Customers pay through their UPI app. ZOOR UP does not use payment gateways or UPI AutoPay.
              </p>
            </div>
            <div style={{ padding: '1rem', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-md)' }}>
              <strong>Thermal POS Receipt Printers (58mm / 80mm ESC/POS)</strong>
              <p style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>
                Compatible with all USB, Bluetooth and WiFi receipt printers via browser print driver.
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};
