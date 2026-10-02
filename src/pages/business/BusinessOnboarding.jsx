import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  Store,
  Tag,
  User,
  Phone,
  MapPin,
  Clock,
  Image,
  Package,
  Award,
  QrCode,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Sparkles,
  Save,
  ExternalLink,
  ShieldCheck,
  Building,
  Mail,
  Download,
  Printer
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { businessService } from '../../services/businessService';
import { productService } from '../../services/productService';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { LoadingState } from '../../components/ui/States';
import { ImageUploader } from '../../components/ui/ImageUploader';
import { ZoorUpLogo } from '../../components/ui/ZoorUpLogo';

const CATEGORIES = [
  'Grocery & Supermarket',
  'Restaurant & Dining',
  'Cafe & Roastery',
  'Salon & Spa',
  'Clothing & Boutique',
  'Electronics & Gadgets',
  'Pharmacy & Wellness',
  'Bakery & Confectionery',
  'Mobile Shop & Accessories',
  'Repair & Service Shop',
  'Local Retailer',
  'Service Business',
  'Other'
];

const CURATED_LOGOS = [
  'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=200&q=80',
  'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=200&q=80',
  'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=200&q=80',
  'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=200&q=80',
  'https://images.unsplash.com/photo-1534452203293-494d7ddbf7e0?auto=format&fit=crop&w=200&q=80',
];

export const BusinessOnboarding = () => {
  const { user, refreshUser } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [business, setBusiness] = useState(null);

  // Form State (ALL fields initially EMPTY, matching specification)
  const [formData, setFormData] = useState({
    // Step 1: Business Name
    name: '',
    tagline: '',

    // Step 2: Category
    category: '',

    // Step 3: Owner Information
    owner_name: '',
    designation: '',

    // Step 4: Phone / Email
    phone: '',
    email: '',
    whatsapp: '',

    // Step 5: Address
    address: '',
    city: '',
    state: '',
    country: 'India',
    postal_code: '',

    // Step 6: Operating Hours
    working_days: 'Mon - Sat',
    open_time: '09:00',
    close_time: '21:00',
    delivery_available: true,
    pickup_available: true,

    // Step 7: Logo
    logo: '',

    // Step 8: First Product/Menu Item
    first_product_name: '',
    first_product_category: '',
    first_product_price: '',
    first_product_stock: '50',

    // Step 9: Configure Loyalty
    loyalty_points_per_hundred: '5',
    loyalty_welcome_bonus: '50',
    loyalty_min_redeem: '100',
  });

  // Authenticated business identifier
  const businessId = user?.business_id ?? business?.id ?? null;
  const bizId = businessId;

  // Load existing business record on mount
  useEffect(() => {
    const loadData = async () => {
      if (!bizId) {
        setLoading(false);
        return;
      }
      try {
        const biz = await businessService.getBusiness(bizId);
        if (biz) {
          if (biz.onboarding_completed) {
            navigate('/business', { replace: true });
            return;
          }
          setBusiness(biz);
          setFormData((prev) => ({
            ...prev,
            name: biz.name || '',
            category: biz.category || '',
            owner_name: biz.owner_name || user?.name || '',
            phone: biz.phone || user?.phone || '',
            email: biz.email || user?.email || '',
            address: biz.address || '',
            city: biz.city || '',
            state: biz.state || '',
            country: biz.country || 'India',
            postal_code: biz.postal_code || '',
            logo: biz.logo || '',
            open_time: biz.open_time || '09:00',
            close_time: biz.close_time || '21:00',
            working_days: biz.working_days || 'Mon - Sat',
            delivery_available: biz.delivery_available !== undefined ? biz.delivery_available : true,
            pickup_available: biz.pickup_available !== undefined ? biz.pickup_available : true,
            loyalty_points_per_hundred: biz.loyalty_rate ? String(biz.loyalty_rate) : '5',
          }));

          if (biz.last_onboarding_step && biz.last_onboarding_step < 10) {
            setCurrentStep(biz.last_onboarding_step + 1);
          }
        }
      } catch (err) {
        console.error('Error loading onboarding data', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [bizId, user]);

  const updateField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Immediate Save for each step
  const handleSaveStep = async (stepNum, shouldAdvance = true) => {
    if (!bizId) return;
    setSaving(true);
    try {
      let stepPayload = {};

      if (stepNum === 1) {
        stepPayload = { name: formData.name, description: formData.tagline || '' };
      } else if (stepNum === 2) {
        stepPayload = { category: formData.category };
      } else if (stepNum === 3) {
        stepPayload = { owner_name: formData.owner_name, designation: formData.designation };
      } else if (stepNum === 4) {
        stepPayload = { phone: formData.phone, email: formData.email, whatsapp: formData.whatsapp };
      } else if (stepNum === 5) {
        stepPayload = {
          address: formData.address,
          city: formData.city,
          state: formData.state,
          country: formData.country,
          postal_code: formData.postal_code,
        };
      } else if (stepNum === 6) {
        stepPayload = {
          working_days: formData.working_days,
          open_time: formData.open_time,
          close_time: formData.close_time,
          delivery_available: Boolean(formData.delivery_available),
          pickup_available: Boolean(formData.pickup_available),
        };
      } else if (stepNum === 7) {
        stepPayload = { logo: formData.logo || null };
      } else if (stepNum === 8) {
        // Add actual first product if entered
        if (formData.first_product_name && formData.first_product_price) {
          await productService.addProduct(bizId, {
            name: formData.first_product_name,
            category: formData.first_product_category || formData.category || 'General',
            price: Number(formData.first_product_price),
            stock: Number(formData.first_product_stock || 0),
            type: 'product',
          });
        }
      } else if (stepNum === 9) {
        stepPayload = {
          loyalty_rate: Number(formData.loyalty_points_per_hundred) || 5,
          loyalty_welcome_bonus: Number(formData.loyalty_welcome_bonus) || 50,
          loyalty_min_redeem: Number(formData.loyalty_min_redeem) || 100,
        };
      } else if (stepNum === 10) {
        stepPayload = { onboarding_completed: true };
      }

      const updated = await businessService.saveOnboardingStep(bizId, stepNum, stepPayload);
      setBusiness(updated);
      await refreshUser();
      addToast(`Step ${stepNum} saved successfully!`, 'success');

      if (shouldAdvance && stepNum < 10) {
        setCurrentStep(stepNum + 1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (stepNum === 10) {
        navigate('/business');
      }
    } catch (err) {
      console.error('Error saving onboarding step', err);
      addToast('Error saving changes. Please retry.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleFinish = async () => {
    setSaving(true);
    try {
      await businessService.completeOnboarding(bizId);
      await refreshUser();
      addToast('Onboarding complete! Welcome to your active workspace.', 'success');
      navigate('/business');
    } catch {
      navigate('/business');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingState message="Setting up your business onboarding..." fullPage />;
  }

  const storefrontUrl = business?.slug
    ? `${window.location.origin}/m/${business.slug}`
    : `${window.location.origin}/m/store-${bizId || '1'}`;

  const STEPS_NAV = [
    { num: 1, title: 'Name', icon: Store },
    { num: 2, title: 'Category', icon: Tag },
    { num: 3, title: 'Owner', icon: User },
    { num: 4, title: 'Contact', icon: Phone },
    { num: 5, title: 'Address', icon: MapPin },
    { num: 6, title: 'Hours', icon: Clock },
    { num: 7, title: 'Logo', icon: Image },
    { num: 8, title: 'First Product', icon: Package },
    { num: 9, title: 'Loyalty', icon: Award },
    { num: 10, title: 'QR Code', icon: QrCode },
  ];

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-app)',
        padding: '2rem 1rem',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ maxWidth: '840px', margin: '0 auto', width: '100%' }}>
        {/* Top Header & Fast Bypass */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
            marginBottom: '1.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <ZoorUpLogo size="sm" width={44} height={44} priority />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                  Business Onboarding Wizard
                </h1>
                <Badge variant="success">Status: ACTIVE</Badge>
              </div>
              <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', margin: '2px 0 0' }}>
                Step {currentStep} of 10 • Automatic instant activation
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/business')}
            >
              Skip to Dashboard
            </Button>
          </div>
        </div>

        {/* 10-Step Visual Progress Bar */}
        <div
          className="card"
          style={{
            padding: '1rem',
            marginBottom: '1.5rem',
            border: '1px solid var(--border-default)',
            background: '#FFFFFF',
            borderRadius: '16px',
            boxShadow: 'var(--shadow-card)',
            overflowX: 'auto',
            scrollbarWidth: 'thin',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              minWidth: '640px',
              position: 'relative',
              gap: '0.4rem',
            }}
          >
            {STEPS_NAV.map((s) => {
              const Icon = s.icon;
              const isDone = s.num < currentStep;
              const isCurrent = s.num === currentStep;

              return (
                <div
                  key={s.num}
                  onClick={() => {
                    handleSaveStep(currentStep, false);
                    setCurrentStep(s.num);
                  }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.35rem',
                    cursor: 'pointer',
                    zIndex: 2,
                    padding: '0.4rem 0.6rem',
                    borderRadius: '10px',
                    background: isCurrent ? 'rgba(245, 158, 11, 0.15)' : 'transparent',
                    opacity: isCurrent ? 1 : isDone ? 0.9 : 0.6,
                    transition: 'all 0.2s',
                  }}
                >
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      background: isDone
                        ? '#22C55E'
                        : isCurrent
                        ? '#1A2B49'
                        : '#F8FAFC',
                      color: isDone ? '#FFFFFF' : isCurrent ? '#F59E0B' : '#64748B',
                      border: isCurrent ? '2px solid #1A2B49' : isDone ? '1px solid #22C55E' : '1px solid #CBD5E1',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      boxShadow: isCurrent ? '0 2px 8px rgba(26, 43, 73, 0.25)' : 'none',
                    }}
                  >
                    {isDone ? <CheckCircle2 size={18} /> : <Icon size={16} />}
                  </div>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: isCurrent ? 700 : 500,
                      color: isCurrent ? '#1A2B49' : '#64748B',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {s.title}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Wizard Form Card */}
        <div
          className="card animate-fade-in"
          style={{
            padding: '2rem 1.75rem',
            border: '1px solid var(--border-default)',
            background: 'var(--bg-surface)',
          }}
        >
          {/* STEP 1: Business Name */}
          {currentStep === 1 && (
            <div>
              <div style={{ marginBottom: '1.5rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-accent-dark)', textTransform: 'uppercase' }}>
                  Step 1 of 10
                </span>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--text-primary)' }}>
                  What is the name of your business?
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  This will appear on your customer receipts, digital QR menu, and invoices.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <Input
                  label="Business Name"
                  placeholder="Enter your business name"
                  value={formData.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  autoFocus
                  required
                />
                <Input
                  label="Tagline or Short Description (Optional)"
                  placeholder="e.g. Fresh farm organic produce delivered daily"
                  value={formData.tagline}
                  onChange={(e) => updateField('tagline', e.target.value)}
                />
              </div>
            </div>
          )}

          {/* STEP 2: Business Category */}
          {currentStep === 2 && (
            <div>
              <div style={{ marginBottom: '1.5rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-accent-dark)', textTransform: 'uppercase' }}>
                  Step 2 of 10
                </span>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--text-primary)' }}>
                  Select your business category
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  We configure your point-of-sale catalog, tax presets, and loyalty structure based on your industry.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <Select
                  label="Category"
                  value={formData.category}
                  onChange={(e) => updateField('category', e.target.value)}
                >
                  <option value="">[ Select category ]</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </Select>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                    gap: '0.75rem',
                    marginTop: '0.5rem',
                  }}
                >
                  {CATEGORIES.slice(0, 8).map((cat) => (
                    <div
                      key={cat}
                      onClick={() => updateField('category', cat)}
                      style={{
                        padding: '0.75rem',
                        borderRadius: 'var(--radius-md)',
                        border: formData.category === cat
                          ? '2px solid var(--color-accent)'
                          : '1px solid var(--border-subtle)',
                        background: formData.category === cat
                          ? 'var(--color-accent-light)'
                          : 'var(--bg-surface-elevated)',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        fontWeight: formData.category === cat ? 700 : 500,
                        color: formData.category === cat ? 'var(--color-accent-dark)' : 'var(--text-secondary)',
                        textAlign: 'center',
                      }}
                    >
                      {cat}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Owner Information */}
          {currentStep === 3 && (
            <div>
              <div style={{ marginBottom: '1.5rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-accent-dark)', textTransform: 'uppercase' }}>
                  Step 3 of 10
                </span>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--text-primary)' }}>
                  Owner Information
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  Who is the principal manager or proprietor of this store?
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <Input
                  label="Owner Full Name"
                  placeholder="Enter owner name"
                  value={formData.owner_name}
                  onChange={(e) => updateField('owner_name', e.target.value)}
                  autoFocus
                />
                <Input
                  label="Designation / Role"
                  placeholder="e.g. Managing Director, Proprietor, Founder"
                  value={formData.designation}
                  onChange={(e) => updateField('designation', e.target.value)}
                />
              </div>
            </div>
          )}

          {/* STEP 4: Phone / Email */}
          {currentStep === 4 && (
            <div>
              <div style={{ marginBottom: '1.5rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-accent-dark)', textTransform: 'uppercase' }}>
                  Step 4 of 10
                </span>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--text-primary)' }}>
                  Business Contact Details
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  Customer inquiries and platform order alerts will be routed here.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <Input
                  label="Business Phone Number"
                  placeholder="Enter phone number"
                  value={formData.phone}
                  onChange={(e) => updateField('phone', e.target.value)}
                  type="tel"
                />
                <Input
                  label="Business Email"
                  placeholder="Enter email"
                  value={formData.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  type="email"
                />
                <Input
                  label="WhatsApp Notification Number (Optional)"
                  placeholder="Enter WhatsApp phone number"
                  value={formData.whatsapp}
                  onChange={(e) => updateField('whatsapp', e.target.value)}
                />
              </div>
            </div>
          )}

          {/* STEP 5: Business Address */}
          {currentStep === 5 && (
            <div>
              <div style={{ marginBottom: '1.5rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-accent-dark)', textTransform: 'uppercase' }}>
                  Step 5 of 10
                </span>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--text-primary)' }}>
                  Business Address & Location
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  Where can customers and delivery couriers find your physical outlet?
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <Input
                  label="Physical Address / Shop / Street"
                  placeholder="Enter business address"
                  value={formData.address}
                  onChange={(e) => updateField('address', e.target.value)}
                />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                  <Input
                    label="City"
                    placeholder="Enter city (e.g. Shimla, Bengaluru)"
                    value={formData.city}
                    onChange={(e) => updateField('city', e.target.value)}
                  />
                  <Input
                    label="State"
                    placeholder="Enter state"
                    value={formData.state}
                    onChange={(e) => updateField('state', e.target.value)}
                  />
                  <Input
                    label="Postal / PIN Code"
                    placeholder="Enter 6-digit postal code"
                    value={formData.postal_code}
                    onChange={(e) => updateField('postal_code', e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 6: Business Hours */}
          {currentStep === 6 && (
            <div>
              <div style={{ marginBottom: '1.5rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-accent-dark)', textTransform: 'uppercase' }}>
                  Step 6 of 10
                </span>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--text-primary)' }}>
                  Business Hours & Availability
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  Specify operating schedule and order fulfillment methods.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <Input
                  label="Working Days"
                  placeholder="e.g. Mon - Sat, All 7 Days"
                  value={formData.working_days}
                  onChange={(e) => updateField('working_days', e.target.value)}
                />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <Input
                    label="Opening Time"
                    type="time"
                    value={formData.open_time}
                    onChange={(e) => updateField('open_time', e.target.value)}
                  />
                  <Input
                    label="Closing Time"
                    type="time"
                    value={formData.close_time}
                    onChange={(e) => updateField('close_time', e.target.value)}
                  />
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                    padding: '1rem',
                    background: 'var(--bg-surface-elevated)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                    <input
                      type="checkbox"
                      checked={formData.delivery_available}
                      onChange={(e) => updateField('delivery_available', e.target.checked)}
                      style={{ width: '18px', height: '18px' }}
                    />
                    <span>Local Home Delivery available</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                    <input
                      type="checkbox"
                      checked={formData.pickup_available}
                      onChange={(e) => updateField('pickup_available', e.target.checked)}
                      style={{ width: '18px', height: '18px' }}
                    />
                    <span>In-store Counter Pickup available</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* STEP 7: Business Logo & Cover Photo */}
          {currentStep === 7 && (
            <div>
              <div style={{ marginBottom: '1.5rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-accent-dark)', textTransform: 'uppercase' }}>
                  Step 7 of 10
                </span>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--text-primary)' }}>
                  Brand Identity, Logo & Cover Banner
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  Upload your storefront logo and wide cover banner from Gallery or Camera.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                    Storefront Cover Banner Photo
                  </label>
                  <ImageUploader
                    value={formData.cover_photo_url || formData.cover_image}
                    onChange={(url) => {
                      updateField('cover_photo_url', url);
                      updateField('cover_image', url);
                    }}
                    aspectRatio="cover"
                    allowCamera={true}
                    allowGallery={true}
                    placeholderText="Upload Storefront Cover Banner"
                    subText="Wide banner image for top of digital catalog"
                    entityType="business_cover"
                    businessId={businessId}
                    bucket="business-covers"
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                    Business Logo / Profile Photo
                  </label>
                  <ImageUploader
                    value={formData.logo_url || formData.logo}
                    onChange={(url) => {
                      updateField('logo', url);
                      updateField('logo_url', url);
                    }}
                    aspectRatio="square"
                    allowCamera={true}
                    allowGallery={true}
                    placeholderText="Upload Store Logo"
                    subText="Square (1:1)"
                    entityType="business_logo"
                    businessId={businessId}
                    bucket="business-logos"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 8: Add First Product/Menu Item */}
          {currentStep === 8 && (
            <div>
              <div style={{ marginBottom: '1.5rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-accent-dark)', textTransform: 'uppercase' }}>
                  Step 8 of 10
                </span>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--text-primary)' }}>
                  Add Your First Product / Menu Item
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  Give customers something to see right away on your digital menu.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <Input
                  label="Item Name"
                  placeholder="Enter product or service name (e.g. Specialty Cappuccino)"
                  value={formData.first_product_name}
                  onChange={(e) => updateField('first_product_name', e.target.value)}
                  autoFocus
                />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <Input
                    label="Price (₹)"
                    type="number"
                    placeholder="0.00"
                    value={formData.first_product_price}
                    onChange={(e) => updateField('first_product_price', e.target.value)}
                  />
                  <Input
                    label="Initial Stock Quantity"
                    type="number"
                    placeholder="e.g. 50"
                    value={formData.first_product_stock}
                    onChange={(e) => updateField('first_product_stock', e.target.value)}
                  />
                </div>

                <Input
                  label="Item Category (Optional)"
                  placeholder="e.g. Beverages, Bakery, Apparel"
                  value={formData.first_product_category}
                  onChange={(e) => updateField('first_product_category', e.target.value)}
                />
              </div>
            </div>
          )}

          {/* STEP 9: Configure Loyalty */}
          {currentStep === 9 && (
            <div>
              <div style={{ marginBottom: '1.5rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-accent-dark)', textTransform: 'uppercase' }}>
                  Step 9 of 10
                </span>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--text-primary)' }}>
                  Configure Customer Retention & Loyalty
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  Reward returning customers with automated cashback and points.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <Input
                  label="Reward Points per ₹100 Spent"
                  type="number"
                  placeholder="Enter points (e.g. 5)"
                  value={formData.loyalty_points_per_hundred}
                  onChange={(e) => updateField('loyalty_points_per_hundred', e.target.value)}
                />
                <Input
                  label="Welcome Bonus Points for New Registered Customers"
                  type="number"
                  placeholder="Enter welcome points (e.g. 50)"
                  value={formData.loyalty_welcome_bonus}
                  onChange={(e) => updateField('loyalty_welcome_bonus', e.target.value)}
                />
                <Input
                  label="Minimum Points Required for Redemption"
                  type="number"
                  placeholder="Enter minimum points (e.g. 100)"
                  value={formData.loyalty_min_redeem}
                  onChange={(e) => updateField('loyalty_min_redeem', e.target.value)}
                />
              </div>
            </div>
          )}

          {/* STEP 10: Generate QR */}
          {currentStep === 10 && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ marginBottom: '1.5rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-accent-dark)', textTransform: 'uppercase' }}>
                  Step 10 of 10
                </span>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--text-primary)' }}>
                  Your Storefront QR Code is Ready!
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', maxWidth: '500px', margin: '0.5rem auto 0' }}>
                  Customers can scan this code to browse your menu, place instant orders, and earn loyalty points.
                </p>
              </div>

              <div
                style={{
                  background: '#fff',
                  padding: '1.5rem',
                  borderRadius: 'var(--radius-xl)',
                  display: 'inline-block',
                  margin: '1rem auto 1.5rem',
                  boxShadow: '0 8px 30px rgba(0, 0, 0, 0.25)',
                }}
              >
                <QRCodeSVG
                  value={storefrontUrl}
                  size={220}
                  level="H"
                  includeMargin={true}
                />
                <div style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: '1rem', marginTop: '0.5rem' }}>
                  {formData.name || 'Your Store'}
                </div>
                <div style={{ color: '#64748b', fontSize: '0.75rem' }}>
                  Scan to View Menu & Order
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                <a
                  href={storefrontUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-outline"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <ExternalLink size={16} />
                  Open Live Storefront
                </a>
              </div>
            </div>
          )}

          {/* Wizard Action Footer */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: '2.5rem',
              paddingTop: '1.5rem',
              borderTop: '1px solid var(--border-subtle)',
              flexWrap: 'wrap',
              gap: '1rem',
            }}
          >
            <div>
              {currentStep > 1 && (
                <Button
                  variant="outline"
                  icon={ArrowLeft}
                  onClick={() => setCurrentStep(currentStep - 1)}
                  disabled={saving}
                >
                  Back
                </Button>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Button
                variant="ghost"
                onClick={() => handleSaveStep(currentStep, false)}
                loading={saving}
                icon={Save}
              >
                Save Draft
              </Button>

              {currentStep < 10 ? (
                <Button
                  variant="primary"
                  icon={ArrowRight}
                  onClick={() => handleSaveStep(currentStep, true)}
                  loading={saving}
                >
                  Save & Continue
                </Button>
              ) : (
                <Button
                  variant="primary"
                  icon={CheckCircle2}
                  onClick={handleFinish}
                  loading={saving}
                >
                  Complete Setup & Open Dashboard
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
