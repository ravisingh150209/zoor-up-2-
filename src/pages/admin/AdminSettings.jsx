import React, { useState } from 'react';
import { Settings, Shield, Globe, Save } from 'lucide-react';
import { Card, CardHeader } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../context/ToastContext';

export const AdminSettings = () => {
  const { addToast } = useToast();
  const [platformName, setPlatformName] = useState('ZoorUp');
  const [tagline, setTagline] = useState('Smart Business. Simple Management.');
  const [requireApproval, setRequireApproval] = useState(true);

  const handleSave = (e) => {
    e.preventDefault();
    addToast('Global platform settings updated!', 'success');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '720px', margin: '0 auto', width: '100%' }}>
      <div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Platform Configurations</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          Global SaaS configuration parameters and automated onboarding flags.
        </p>
      </div>

      <form onSubmit={handleSave}>
        <Card>
          <CardHeader title="Global Branding" icon={Globe} />

          <div className="grid-2">
            <Input
              label="Platform Brand Name"
              required
              value={platformName}
              onChange={(e) => setPlatformName(e.target.value)}
            />
            <Input
              label="Official Tagline"
              required
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
            />
          </div>

          <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--bg-surface-elevated)', borderRadius: 'var(--radius-md)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={requireApproval}
                onChange={(e) => setRequireApproval(e.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: 'var(--primary-500)' }}
              />
              <div>
                <strong style={{ fontSize: '0.9rem' }}>Require Superadmin Approval for New Merchants</strong>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  When enabled, newly onboarded stores remain in sandbox/review mode until verified by Superadmin.
                </p>
              </div>
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
            <Button type="submit" variant="primary" icon={Save}>
              Save Platform Configuration
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
};
