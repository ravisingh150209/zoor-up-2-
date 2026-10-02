import React, { useState, useEffect } from 'react';
import { User, Phone, Mail, Award, QrCode, Shield, Save, MapPin, Calendar, CheckCircle2, Sparkles, RefreshCw } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Card, CardHeader } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ImageUploader } from '../../components/ui/ImageUploader';
import { ZoorUpLogo } from '../../components/ui/ZoorUpLogo';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { customerService } from '../../services/customerService';

export const CustomerProfile = () => {
  const { user } = useAuth();
  const { addToast } = useToast();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable Form fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [birthday, setBirthday] = useState('');
  const [profileImage, setProfileImage] = useState(null);

  useEffect(() => {
    loadProfile();
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await customerService.getProfile(user);
      setProfile(data);
      setName(data.name || '');
      setPhone(data.phone || '');
      setEmail(data.email || '');
      setAddress(data.address || '');
      setBirthday(data.birthday || '');
      setProfileImage(data.profile_image_url || data.avatar || null);
    } catch (err) {
      console.error('Failed to load profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleProfileImageChange = async (url) => {
    setProfileImage(url);
    try {
      const updated = await customerService.updateProfile(user, {
        profile_image_url: url,
        avatar: url,
      });
      setProfile((prev) => ({ ...prev, ...updated }));
      addToast(url ? 'Profile photo uploaded successfully!' : 'Profile photo removed', 'success');
    } catch (err) {
      addToast('Failed to update profile photo', 'error');
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updates = {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
        birthday: birthday.trim(),
      };
      const updated = await customerService.updateProfile(user, updates);
      setProfile((prev) => ({ ...prev, ...updated }));
      addToast('Customer profile updated successfully!', 'success');
    } catch (err) {
      addToast(err.message || 'Failed to save profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  const customerId = profile?.customer_id || (user?.id ? `ZUP-CUS-${user.id.slice(-6).toUpperCase()}` : 'ZUP-CUS-NEW');
  const customerQrUrl = `https://app.zoorup.com/customer/${customerId}`;
  const points = profile?.points ?? 0;
  const stamps = profile?.stamps ?? 0;
  const totalVisits = profile?.total_visits ?? 0;
  const totalSpent = profile?.total_spent ?? 0;
  const tier = profile?.membership_tier || profile?.rank || 'MEMBER';
  const displayName = profile?.name ? profile.name : 'Complete your profile';
  const displayEmail = profile?.email ? profile.email : 'Add email address';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '680px', margin: '0 auto', width: '100%' }}>
      <div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Customer Profile & Settings</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          Your digital customer identity, universal rewards pass, and delivery details.
        </p>
      </div>

      {/* Digital Member Card: Deep Navy Structural Base with Amber Highlights */}
      <Card
        style={{
          background: '#1A2B49',
          border: '1px solid #243B5F',
          borderRadius: '16px',
          padding: '1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          position: 'relative',
          overflow: 'hidden',
          color: '#FFFFFF',
          boxShadow: '0 8px 24px rgba(26, 43, 73, 0.18)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <ZoorUpLogo size="xs" width={26} height={26} priority />
            <span style={{ fontSize: '0.75rem', color: '#CBD5E1', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
              ZOOR UP OFFICIAL MEMBER PASS
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '0.5rem' }}>
            {profileImage ? (
              <img
                src={profileImage}
                alt={displayName}
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '2px solid #F59E0B',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                }}
              />
            ) : null}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Badge style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#F59E0B', border: '1px solid #F59E0B' }}>{tier} Member</Badge>
              <Badge style={{ background: 'rgba(255, 255, 255, 0.1)', color: '#CBD5E1', border: '1px solid rgba(255, 255, 255, 0.15)' }}>{profile?.segment || 'NEW'}</Badge>
            </div>
          </div>

          <h3
            style={{
              fontSize: '1.4rem',
              fontWeight: 800,
              color: profile?.name ? '#FFFFFF' : '#CBD5E1',
              fontStyle: profile?.name ? 'normal' : 'italic',
              margin: '0.2rem 0',
            }}
          >
            {displayName}
          </h3>

          <div style={{ fontFamily: 'var(--font-mono)', color: '#F59E0B', fontSize: '1rem', fontWeight: 600 }}>
            {customerId}
          </div>

          {/* Real Metrics Grid */}
          <div
            style={{
              display: 'flex',
              gap: '1.25rem',
              marginTop: '1rem',
              paddingTop: '0.75rem',
              borderTop: '1px solid rgba(255, 255, 255, 0.12)',
            }}
          >
            <div>
              <div style={{ fontSize: '0.75rem', color: '#CBD5E1' }}>Points</div>
              <strong style={{ color: '#F59E0B', fontSize: '1rem' }}>
                {points === 0 ? '0 Points' : `${points.toLocaleString()} Points`}
              </strong>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: '#CBD5E1' }}>Stamps</div>
              <strong style={{ color: '#F59E0B', fontSize: '1rem' }}>
                {stamps} Stamps
              </strong>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: '#CBD5E1' }}>Visits</div>
              <strong style={{ color: '#FFFFFF', fontSize: '1rem' }}>
                {totalVisits}
              </strong>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: '#CBD5E1' }}>Spent</div>
              <strong style={{ color: '#FFFFFF', fontSize: '1rem' }}>
                {totalSpent === 0 ? '₹0' : `₹${totalSpent.toLocaleString()}`}
              </strong>
            </div>
          </div>
        </div>

        {/* Real Customer QR Code */}
        <div
          style={{
            background: '#ffffff',
            padding: '10px',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            textAlign: 'center',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          <QRCodeSVG value={customerQrUrl} size={94} level="M" />
          <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#1A2B49', display: 'block', marginTop: '4px' }}>
            MY PASS QR
          </span>
        </div>
      </Card>

      {/* Profile Edit Form */}
      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <Card>
          <CardHeader title="Personal Details & Profile Photo" icon={User} />

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '1.25rem' }}>
            <ImageUploader
              value={profileImage}
              onChange={handleProfileImageChange}
              aspectRatio="square"
              allowCamera={true}
              allowGallery={true}
              label="Profile Photo"
              placeholderText="Add Profile Photo"
              subText="Choose from Gallery or Take Photo"
              entityType="customer_profile"
              userId={user?.id}
              bucket="customer-avatars"
            />
          </div>

          <div className="grid-2">
            <Input
              label="Full Name"
              placeholder="Enter your full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              label="Phone Number"
              type="tel"
              placeholder="Enter your phone number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className="grid-2">
            <Input
              label="Email Address"
              type="email"
              placeholder="Enter your email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              label="Date of Birth (Optional)"
              type="date"
              value={birthday}
              onChange={(e) => setBirthday(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Default Delivery Address</label>
            <textarea
              rows={2}
              className="form-textarea"
              placeholder="Enter your delivery address, street, landmark, city"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Connected Email: <span style={{ color: 'var(--text-primary)' }}>{displayEmail}</span>
            </div>
            <Button type="submit" variant="primary" loading={saving} icon={Save}>
              Save Profile
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
};
