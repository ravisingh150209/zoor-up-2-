import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Store,
  MapPin,
  Clock,
  ExternalLink,
  Save,
  Phone,
  Mail,
  Globe,
  CheckCircle2,
  Image as ImageIcon,
  CreditCard,
  ToggleLeft,
  ToggleRight,
  Shield,
  MessageSquare,
  X,
  Check,
  Loader2,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import {
  InstagramIcon,
  FacebookIcon,
  WhatsAppIcon,
  YouTubeIcon,
  LinkedInIcon,
  WebsiteIcon,
  SocialLinksBar,
} from '../../components/ui/SocialIcons';
import { Avatar } from '../../components/ui/Avatar';
import { businessService } from '../../services/businessService';
import { uploadService } from '../../services/uploadService';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { ImageUploader } from '../../components/ui/ImageUploader';
import { ZoorUpLogo } from '../../components/ui/ZoorUpLogo';
import { LoadingState } from '../../components/ui/States';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

export const BusinessProfile = () => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [upiSaving, setUpiSaving] = useState(false);
  const [business, setBusiness] = useState(null);
  const [upiSettings, setUpiSettings] = useState({
    upi_id: '',
    upi_name: '',
    upi_notes: 'ZOOR UP Store Payment',
    upi_enabled: false,
  });
  const [upiLoaded, setUpiLoaded] = useState(false);
  const [socialLinks, setSocialLinks] = useState({
    instagram: '',
    facebook: '',
    whatsapp: '',
    whatsapp_message: '',
    website: '',
    youtube: '',
    linkedin: '',
  });
  const [socialLoading, setSocialLoading] = useState(false);
  const [socialSaving, setSocialSaving] = useState(false);

  useEffect(() => {
    loadProfile();
  }, [user]);

  useEffect(() => {
    if (business) {
      loadUpiSettings();
    }
  }, [business, user]);

  const loadProfile = async () => {
    setLoading(true);
    try {
      let data = await businessService.getBusiness(user?.business_id);
      if (!data && user?.business_id) {
        data = {
          id: user.business_id,
          name: '',
          owner_name: user.name || '',
          phone: user.phone || '',
          email: user.email || '',
          logo: null,
          logo_url: null,
          cover_image: null,
          cover_photo_url: null,
          gallery: [],
          category: '',
          description: '',
          address: '',
          city: '',
          state: '',
          country: 'India',
          postal_code: '',
          website: '',
          opening_hours: {},
          gst_number: '',
          tax_number: '',
          status: 'ACTIVE',
          onboarding_completed: false,
        };
      }
      setBusiness(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadUpiSettings = async () => {
    if (!user?.business_id) return;
    setUpiLoaded(false);
    try {
      const data = await businessService.getBusinessUpi(user?.business_id);
      if (data && data.success) {
        setUpiSettings({
          upi_id: data.upi_id || '',
          upi_name: data.upi_name || '',
          upi_notes: data.upi_notes || 'ZOOR UP Store Payment',
          upi_enabled: data.upi_enabled || false,
        });
      }
    } catch (e) {
      console.error('Failed to load UPI settings:', e);
    } finally {
      setUpiLoaded(true);
}
  };

  const loadSocialLinks = async () => {
    if (!user?.business_id) return;
    setSocialLoading(true);
    try {
      const data = await businessService.getBusinessSocialLinks(user?.business_id);
      if (data && data.success) {
        setSocialLinks({
          instagram: data.social_links?.instagram || '',
          facebook: data.social_links?.facebook || '',
          whatsapp: data.social_links?.whatsapp || '',
          whatsapp_message: data.social_links?.whatsapp_message || '',
          website: data.social_links?.website || '',
          youtube: data.social_links?.youtube || '',
          linkedin: data.social_links?.linkedin || '',
        });
      }
    } catch (e) {
      console.error('Failed to load social links:', e);
    } finally {
      setSocialLoading(false);
    }
  };

  // Sync socialLinks with business object when business loads
  useEffect(() => {
    if (business && !socialLoading) {
      setSocialLinks({
        instagram: business.social_links?.instagram || '',
        facebook: business.social_links?.facebook || '',
        whatsapp: business.social_links?.whatsapp || '',
        whatsapp_message: business.social_links?.whatsapp_message || '',
        website: business.social_links?.website || '',
        youtube: business.social_links?.youtube || '',
        linkedin: business.social_links?.linkedin || '',
      });
    }
  }, [business, socialLoading]);

  const handleSocialLinksUpdate = async (e) => {
    e.preventDefault();
    setSocialSaving(true);
    try {
      const socialData = {
        instagram: socialLinks.instagram,
        facebook: socialLinks.facebook,
        whatsapp: socialLinks.whatsapp,
        whatsapp_message: socialLinks.whatsapp_message,
        website: socialLinks.website,
        youtube: socialLinks.youtube,
        linkedin: socialLinks.linkedin,
      };
      const result = await businessService.updateBusinessSocialLinks(user?.business_id, socialData);
      if (result.success) {
        addToast('Social media links saved successfully!', 'success');
      } else {
        addToast(result.detail || 'Failed to save social links', 'error');
      }
    } catch (e) {
      console.error('Social links save error:', e);
      addToast(e.message || 'Failed to save social links', 'error');
    } finally {
      setSocialSaving(false);
    }
  };

  const handleUpiUpdate = async (e) => {
    e.preventDefault();
    setUpiSaving(true);
    try {
      const upiData = {
        upi_id: upiSettings.upi_id,
        upi_name: upiSettings.upi_name,
        upi_notes: upiSettings.upi_notes,
        upi_enabled: upiSettings.upi_enabled,
      };
      const result = await businessService.updateBusinessUpi(user?.business_id, upiData);
      if (result.success) {
        setUpiSettings(prev => ({ ...prev, ...upiData }));
        addToast('UPI settings saved successfully!', 'success');
      } else {
        addToast(result.detail || 'Failed to save UPI settings', 'error');
      }
    } catch (e) {
      console.error('UPI save error:', e);
      const errMsg = e?.response?.data?.detail || e?.detail || e?.message || 'Error saving UPI settings';
      addToast(errMsg, 'error');
    } finally {
      setUpiSaving(false);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await businessService.updateBusiness(business.id, business, {
        callerBusinessId: user?.business_id,
        callerUserId: user?.id,
      });
      addToast('Business profile updated successfully!', 'success');
    } catch (e) {
      addToast(e.message || 'Error updating business profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !business) {
    return <LoadingState message="Loading business configuration..." fullPage />;
  }

  const gallery = Array.isArray(business.gallery) ? business.gallery : [];
  const plan = (business.subscription_plan || 'FREE').toUpperCase();
  const galleryLimit = uploadService.getGalleryLimit(plan);

  const handleAddGalleryImage = (url) => {
    if (!url) return;
    if (gallery.length >= galleryLimit) {
      addToast(`Plan ${plan} allows up to ${galleryLimit} gallery photos.`, 'error');
      return;
    }
    const updatedGallery = [...gallery, { url, position: gallery.length }];
    setBusiness((prev) => ({ ...prev, gallery: updatedGallery }));
    addToast('Gallery photo added! Remember to save profile changes.', 'success');
  };

  const handleRemoveGallery = (index) => {
    const updated = gallery
      .filter((_, idx) => idx !== index)
      .map((item, idx) => ({ ...item, position: idx }));
    setBusiness((prev) => ({ ...prev, gallery: updated }));
  };

  const handleMoveGallery = (index, delta) => {
    const targetIdx = index + delta;
    if (targetIdx < 0 || targetIdx >= gallery.length) return;
    const newItems = [...gallery];
    const temp = newItems[index];
    newItems[index] = newItems[targetIdx];
    newItems[targetIdx] = temp;
    const reindexed = newItems.map((item, idx) => ({ ...item, position: idx }));
    setBusiness((prev) => ({ ...prev, gallery: reindexed }));
  };

  const activeCover = business.cover_photo_url || business.cover_image;
  const activeLogo = business.logo_url || business.logo;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Banner & Public Preview Link */}
      <div
        className="card"
        style={{
          position: 'relative',
          overflow: 'hidden',
          padding: 0,
          border: '1px solid var(--border-default)',
        }}
      >
        <div
          style={{
            height: '160px',
            backgroundImage: activeCover ? `url(${activeCover})` : 'linear-gradient(135deg, #1A2B49 0%, #243B5F 100%)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(180deg, transparent 0%, rgba(31, 41, 55, 0.75) 100%)',
            }}
          />
        </div>

        <div
          style={{
            padding: '1.5rem',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
            marginTop: '-40px',
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <Avatar
              src={activeLogo}
              name={business.name || 'Store'}
              size="xxl"
              style={{
                border: '3px solid #FFFFFF',
                boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
              }}
            />
            <div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>{business.name || 'My Store'}</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                {business.category} • {business.city || 'Location'}, {business.state || 'India'}
              </p>
            </div>
          </div>

          <Link
            to={`/m/${business.slug}`}
            target="_blank"
            className="btn btn-outline btn-sm"
          >
            <ExternalLink size={15} />
            <span>Public Storefront Preview</span>
          </Link>
        </div>
      </div>

      {/* Profile Edit Form */}
      <form onSubmit={handleUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <Card>
          <CardHeader title="General Information" icon={Store} />

          <div className="grid-2">
            <Input
              label="Business Display Name"
              required
              value={business.name}
              onChange={(e) => setBusiness({ ...business, name: e.target.value })}
            />
            <Input
              label="Category"
              required
              value={business.category}
              onChange={(e) => setBusiness({ ...business, category: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Storefront Bio & Description</label>
            <textarea
              rows={3}
              className="form-textarea"
              value={business.description}
              onChange={(e) => setBusiness({ ...business, description: e.target.value })}
            />
          </div>

          {/* Logo and Cover Photo Uploaders */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '0.75rem' }}>
            <div>
              <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                Business Cover Banner Photo
              </label>
              <ImageUploader
                value={business.cover_photo_url || business.cover_image}
                onChange={(url) => setBusiness({ ...business, cover_photo_url: url, cover_image: url })}
                aspectRatio="cover"
                allowCamera={true}
                allowGallery={true}
                placeholderText="Upload Storefront Banner Cover"
                subText="Wide landscape ratio for public storefront header"
                entityType="business_cover"
                businessId={business.id}
                bucket="business-covers"
              />
            </div>

            <div>
              <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                Business Logo / Profile Photo
              </label>
              <ImageUploader
                value={business.logo_url || business.logo}
                onChange={(url) => setBusiness({ ...business, logo_url: url, logo: url })}
                aspectRatio="square"
                allowCamera={true}
                allowGallery={true}
                placeholderText="Upload Logo"
                subText="Square (1:1)"
                entityType="business_logo"
                businessId={business.id}
                bucket="business-logos"
              />
            </div>
          </div>
        </Card>

        {/* Store Photo Gallery Card */}
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Business Photo Gallery</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                Upload photos of your storefront, interior, ambience, and team.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="badge badge-neutral" style={{ fontSize: '0.75rem' }}>
                {gallery.length} / {galleryLimit} Photos Allowed ({plan} Plan)
              </span>
            </div>
          </div>

          {/* Gallery Items Grid */}
          {gallery.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.85rem', marginBottom: '1rem' }}>
              {gallery.map((img, idx) => (
                <div
                  key={idx}
                  style={{
                    position: 'relative',
                    aspectRatio: '1',
                    borderRadius: 'var(--radius-md)',
                    overflow: 'hidden',
                    border: '1px solid var(--border-default)',
                    background: '#000',
                  }}
                >
                  <img
                    src={img.url || img}
                    alt={`Gallery item ${idx + 1}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      top: '4px',
                      right: '4px',
                      display: 'flex',
                      gap: '2px',
                      background: 'rgba(0,0,0,0.65)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '2px',
                    }}
                  >
                    {idx > 0 && (
                      <button
                        type="button"
                        onClick={() => handleMoveGallery(idx, -1)}
                        style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '2px', fontSize: '0.7rem' }}
                        title="Move Left"
                      >
                        ◀
                      </button>
                    )}
                    {idx < gallery.length - 1 && (
                      <button
                        type="button"
                        onClick={() => handleMoveGallery(idx, 1)}
                        style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '2px', fontSize: '0.7rem' }}
                        title="Move Right"
                      >
                        ▶
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveGallery(idx)}
                      style={{ background: 'none', border: 'none', color: 'var(--danger-400)', cursor: 'pointer', padding: '2px', fontSize: '0.7rem' }}
                      title="Remove Photo"
                    >
                      ✕
                    </button>
                  </div>
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '4px',
                      left: '4px',
                      fontSize: '0.65rem',
                      color: '#fff',
                      background: 'rgba(0,0,0,0.65)',
                      padding: '1px 5px',
                      borderRadius: '2px',
                    }}
                  >
                    #{idx + 1}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add Gallery Photo Uploader (if below limit) */}
          {gallery.length < galleryLimit ? (
            <div style={{ maxWidth: '240px' }}>
              <ImageUploader
                value=""
                onChange={handleAddGalleryImage}
                aspectRatio="square"
                allowCamera={true}
                allowGallery={true}
                placeholderText="Add Gallery Photo"
                subText="Storefront, interior, team"
                entityType="business_gallery"
                businessId={business.id}
                bucket="business-gallery"
              />
            </div>
          ) : (
            <div style={{ padding: '0.75rem', background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.3)', borderRadius: 'var(--radius-md)', fontSize: '0.8rem', color: 'var(--accent-amber)' }}>
              Gallery photo limit reached ({galleryLimit} photos on {plan} plan). <Link to="/business/subscription" style={{ color: 'var(--primary-400)', fontWeight: 600, textDecoration: 'underline' }}>Upgrade Plan</Link> to add more gallery photos.
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Contact & Physical Address" icon={MapPin} />

          <div className="grid-2">
            <Input
              label="Contact Phone"
              required
              icon={Phone}
              value={business.phone}
              onChange={(e) => setBusiness({ ...business, phone: e.target.value })}
            />
            <Input
              label="Official Email"
              type="email"
              required
              icon={Mail}
              value={business.email}
              onChange={(e) => setBusiness({ ...business, email: e.target.value })}
            />
          </div>

          <Input
            label="Street Address / Shop Unit"
            required
            value={business.address}
            onChange={(e) => setBusiness({ ...business, address: e.target.value })}
          />

          <div className="grid-3">
            <Input
              label="City"
              required
              value={business.city}
              onChange={(e) => setBusiness({ ...business, city: e.target.value })}
            />
            <Input
              label="State / Province"
              required
              value={business.state}
              onChange={(e) => setBusiness({ ...business, state: e.target.value })}
            />
            <Input
              label="PIN / Postal Code"
              required
              value={business.pincode || business.postal_code || ''}
              onChange={(e) => setBusiness({ ...business, pincode: e.target.value, postal_code: e.target.value })}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Operational Setup & Online Store" icon={Clock} />

          <div className="grid-2">
            <Input
              label="Opening Time"
              type="time"
              value={business.open_time || ''}
              onChange={(e) => setBusiness({ ...business, open_time: e.target.value })}
            />
            <Input
              label="Closing Time"
              type="time"
              value={business.close_time || ''}
              onChange={(e) => setBusiness({ ...business, close_time: e.target.value })}
            />
          </div>

          <div className="grid-2">
            <Input
              label="Working Days"
              placeholder="e.g. Mon - Sat"
              value={business.working_days || ''}
              onChange={(e) => setBusiness({ ...business, working_days: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', gap: '2rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={business.delivery_available}
                onChange={(e) => setBusiness({ ...business, delivery_available: e.target.checked })}
                style={{ width: '18px', height: '18px', accentColor: 'var(--primary-500)' }}
              />
              <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Enable Home Delivery</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={business.pickup_available}
                onChange={(e) => setBusiness({ ...business, pickup_available: e.target.checked })}
                style={{ width: '18px', height: '18px', accentColor: 'var(--primary-500)' }}
              />
              <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Enable In-Store Pickup</span>
            </label>
          </div>
        </Card>

{/* Social Media Links Card */}
        {/* Social Media & Contact Links Card */}
        <Card>
          <CardHeader title="Social Media & Contact Links" icon={Globe} />
          <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
              Add your official business social media and contact links. These buttons will be displayed cleanly on your public QR menu and storefront.
            </p>

            {/* Live Preview Bar */}
            <div
              style={{
                padding: '1rem',
                background: '#F8FAFC',
                borderRadius: '12px',
                border: '1px dashed #CBD5E1',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>
                <Sparkles size={14} color="#F59E0B" />
                <span>Live Storefront Preview</span>
              </div>
              {Object.values(socialLinks).some((v) => Boolean(v && String(v).trim())) ? (
                <SocialLinksBar
                  socialLinks={socialLinks}
                  businessName={business.name || 'My Store'}
                  variant="colored"
                  size="md"
                />
              ) : (
                <p style={{ fontSize: '0.78rem', color: '#94A3B8', margin: 0, fontStyle: 'italic' }}>
                  No links configured yet. Enter your links below to preview interactive buttons.
                </p>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              {/* Instagram */}
              <div style={{ padding: '1rem', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'linear-gradient(135deg, #F58529 0%, #DD2A7B 50%, #8134AF 100%)', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <InstagramIcon size={20} color="#FFFFFF" />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1A2B49' }}>Instagram</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Profile username or URL</div>
                  </div>
                </div>
                <Input
                  placeholder="e.g. @yourstore or instagram.com/yourstore"
                  value={socialLinks.instagram}
                  onChange={(e) => setSocialLinks({ ...socialLinks, instagram: e.target.value })}
                  style={{ fontSize: '0.85rem' }}
                />
              </div>

              {/* Facebook */}
              <div style={{ padding: '1rem', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#1877F2', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <FacebookIcon size={20} color="#FFFFFF" />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1A2B49' }}>Facebook</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Business page URL</div>
                  </div>
                </div>
                <Input
                  placeholder="e.g. https://facebook.com/yourstorepage"
                  value={socialLinks.facebook}
                  onChange={(e) => setSocialLinks({ ...socialLinks, facebook: e.target.value })}
                  style={{ fontSize: '0.85rem' }}
                />
              </div>

              {/* WhatsApp */}
              <div style={{ padding: '1rem', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#25D366', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <WhatsAppIcon size={20} color="#FFFFFF" />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1A2B49' }}>WhatsApp Business</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Phone number with country code</div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  <Input
                    placeholder="e.g. +919876543210"
                    value={socialLinks.whatsapp}
                    onChange={(e) => setSocialLinks({ ...socialLinks, whatsapp: e.target.value })}
                    style={{ fontSize: '0.85rem' }}
                  />
                  <Input
                    placeholder="Optional: Pre-filled message (e.g. Hello! I found your store on ZOOR UP)"
                    value={socialLinks.whatsapp_message}
                    onChange={(e) => setSocialLinks({ ...socialLinks, whatsapp_message: e.target.value })}
                    style={{ fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              {/* Website */}
              <div style={{ padding: '1rem', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#059669', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <WebsiteIcon size={20} color="#FFFFFF" />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1A2B49' }}>Website</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Business website URL</div>
                  </div>
                </div>
                <Input
                  placeholder="e.g. https://yourbusiness.com"
                  value={socialLinks.website}
                  onChange={(e) => setSocialLinks({ ...socialLinks, website: e.target.value })}
                  style={{ fontSize: '0.85rem' }}
                />
              </div>

              {/* YouTube */}
              <div style={{ padding: '1rem', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#FF0000', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <YouTubeIcon size={20} color="#FFFFFF" />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1A2B49' }}>YouTube</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Channel or video URL</div>
                  </div>
                </div>
                <Input
                  placeholder="e.g. https://youtube.com/@yourbusiness"
                  value={socialLinks.youtube}
                  onChange={(e) => setSocialLinks({ ...socialLinks, youtube: e.target.value })}
                  style={{ fontSize: '0.85rem' }}
                />
              </div>

              {/* LinkedIn */}
              <div style={{ padding: '1rem', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#0A66C2', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <LinkedInIcon size={20} color="#FFFFFF" />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1A2B49' }}>LinkedIn</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Company or professional profile</div>
                  </div>
                </div>
                <Input
                  placeholder="e.g. https://linkedin.com/company/yourbusiness"
                  value={socialLinks.linkedin}
                  onChange={(e) => setSocialLinks({ ...socialLinks, linkedin: e.target.value })}
                  style={{ fontSize: '0.85rem' }}
                />
              </div>
            </div>

            <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  if (business?.social_links) {
                    setSocialLinks({
                      instagram: business.social_links.instagram || '',
                      facebook: business.social_links.facebook || '',
                      whatsapp: business.social_links.whatsapp || '',
                      whatsapp_message: business.social_links.whatsapp_message || '',
                      website: business.social_links.website || '',
                      youtube: business.social_links.youtube || '',
                      linkedin: business.social_links.linkedin || '',
                    });
                    addToast('Reset to saved links', 'info');
                  } else {
                    setSocialLinks({
                      instagram: '',
                      facebook: '',
                      whatsapp: '',
                      whatsapp_message: '',
                      website: '',
                      youtube: '',
                      linkedin: '',
                    });
                  }
                }}
                disabled={socialSaving}
              >
                Reset / Cancel
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSocialLinks({
                    instagram: '',
                    facebook: '',
                    whatsapp: '',
                    whatsapp_message: '',
                    website: '',
                    youtube: '',
                    linkedin: '',
                  });
                }}
                disabled={socialSaving}
              >
                Clear All
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={socialSaving}
                onClick={handleSocialLinksUpdate}
              >
                <Save size={15} />
                <span>{socialSaving ? 'Saving...' : 'Save Social Links'}</span>
              </Button>
            </div>
          </div>
        </Card>

          {/* UPI Payment Settings Card */}
          <Card>
            <CardHeader title="UPI Payment Settings" icon={CreditCard} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="grid-2">
              <Input
                label="Merchant UPI ID (VPA)"
                placeholder="e.g. storename@okaxis, 9817400078@ybl"
                value={upiSettings.upi_id}
                onChange={(e) => setUpiSettings({ ...upiSettings, upi_id: e.target.value })}
              />
              <Input
                label="UPI Display Name"
                placeholder="e.g. My Store Name"
                value={upiSettings.upi_name}
                onChange={(e) => setUpiSettings({ ...upiSettings, upi_name: e.target.value })}
              />
            </div>

            <Input
              label="UPI Payment Note"
              placeholder="Note shown to customer during payment"
              value={upiSettings.upi_notes}
              onChange={(e) => setUpiSettings({ ...upiSettings, upi_notes: e.target.value })}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={upiSettings.upi_enabled}
                  onChange={(e) => setUpiSettings({ ...upiSettings, upi_enabled: e.target.checked })}
                  style={{ width: '18px', height: '18px', accentColor: 'var(--primary-500)' }}
                />
                <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Enable UPI Payments</span>
              </label>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                When enabled, customers can pay instantly via UPI apps (GPay, PhonePe, Paytm, etc.)
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '0.5rem' }}>
              <Button type="button" variant="primary" size="lg" disabled={upiSaving} onClick={handleUpiUpdate}>
                <Save size={18} />
                <span>{upiSaving ? 'Saving UPI Settings...' : 'Save UPI Settings'}</span>
              </Button>
            </div>
          </div>
        </Card>

        {/* Bottom Save Bar */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={saving}
          >
            <Save size={18} />
            <span>{saving ? 'Saving Profile...' : 'Save Profile Changes'}</span>
          </Button>
        </div>
      </form>
    </div>
  );
};
