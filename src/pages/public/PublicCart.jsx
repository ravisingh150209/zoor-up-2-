import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ShoppingBag,
  ArrowLeft,
  ArrowRight,
  Plus,
  Minus,
  Trash2,
  Store,
  ChevronRight,
  UtensilsCrossed,
  ShieldCheck,
  RotateCcw
} from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ZoorUpLogo } from '../../components/ui/ZoorUpLogo';

export const PublicCart = () => {
  const navigate = useNavigate();
  const {
    items,
    subtotal,
    totalCount,
    updateQuantity,
    removeItem,
    clearCart,
    businessId,
    businessSlug,
    businessName,
    tableId,
  } = useCart();

  const taxAmount = Math.round((subtotal * 5) / 100);
  const grandTotal = subtotal + taxAmount;

  const baseMenuUrl = businessSlug
    ? `/m/${businessSlug}`
    : businessId
    ? `/b/${businessId}/menu`
    : '/customer';

  const menuUrl = tableId && baseMenuUrl !== '/customer'
    ? `${baseMenuUrl}?table=${encodeURIComponent(tableId)}`
    : baseMenuUrl;

  const checkoutUrl = businessSlug
    ? `/m/${businessSlug}/checkout${tableId ? `?table=${encodeURIComponent(tableId)}` : ''}`
    : businessId
    ? `/b/${businessId}/checkout${tableId ? `?table=${encodeURIComponent(tableId)}` : ''}`
    : `/checkout${tableId ? `?table=${encodeURIComponent(tableId)}` : ''}`;

  // Empty Cart State
  if (!items || items.length === 0) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--bg-app, #F8FAFC)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem 1rem',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            maxWidth: '440px',
            width: '100%',
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '24px',
            padding: '2.5rem 1.5rem',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.04)',
          }}
        >
          <div
            style={{
              width: '72px',
              height: '72px',
              borderRadius: '50%',
              background: '#F1F5F9',
              color: '#94A3B8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.25rem',
            }}
          >
            <ShoppingBag size={36} />
          </div>

          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1A2B49', margin: '0 0 0.4rem' }}>
            Your Cart is Empty
          </h2>
          <p style={{ color: '#64748B', fontSize: '0.875rem', margin: '0 0 1.75rem', lineHeight: 1.5 }}>
            Looks like you haven't added any items yet. Explore the menu to pick your favorites!
          </p>

          <Button
            variant="primary"
            size="lg"
            block
            onClick={() => navigate(menuUrl)}
            icon={UtensilsCrossed}
            style={{
              background: '#1A2B49',
              borderRadius: '14px',
              fontWeight: 700,
              padding: '0.85rem',
            }}
          >
            Browse Store Menu
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-app, #F8FAFC)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top Header Bar */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 40,
          background: '#FFFFFF',
          borderBottom: '1px solid #E2E8F0',
          padding: '0.85rem 1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={() => navigate(menuUrl)}
            style={{
              background: '#F1F5F9',
              border: 'none',
              borderRadius: '10px',
              padding: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Back to store menu"
          >
            <ArrowLeft size={18} color="#1A2B49" />
          </button>
          <div>
            <h1 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: '#1A2B49', lineHeight: 1.2 }}>
              Your Cart
            </h1>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748B' }}>
              Ordering from <strong style={{ color: '#1A2B49' }}>{businessName || 'Store'}</strong>
            </p>
          </div>
        </div>

        <Badge variant="accent" style={{ fontSize: '0.75rem', fontWeight: 700, padding: '0.25rem 0.6rem' }}>
          {totalCount} {totalCount === 1 ? 'item' : 'items'}
        </Badge>
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1, maxWidth: '640px', width: '100%', margin: '0 auto', padding: '1rem 1rem 7rem' }}>
        {/* Cart Items List */}
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: '20px',
            border: '1px solid #E2E8F0',
            padding: '1.25rem',
            marginBottom: '1rem',
            boxShadow: '0 4px 16px rgba(0,0,0,0.02)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#1A2B49', margin: 0 }}>
              Order Items ({items.length})
            </h2>
            <button
              type="button"
              onClick={clearCart}
              style={{
                background: 'none',
                border: 'none',
                color: '#EF4444',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Trash2 size={13} />
              Clear Cart
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {items.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.85rem',
                  paddingBottom: '0.85rem',
                  borderBottom: '1px solid #F1F5F9',
                }}
              >
                {/* Product Thumbnail */}
                {item.image ? (
                  <img
                    src={item.image}
                    alt={item.name}
                    style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: '12px',
                      objectFit: 'cover',
                      flexShrink: 0,
                    }}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: '12px',
                      background: '#FEF3C7',
                      color: '#D97706',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      border: '1px solid #FDE68A',
                    }}
                  >
                    <ShoppingBag size={24} />
                  </div>
                )}

                {/* Product Details */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3
                    style={{
                      fontSize: '0.92rem',
                      fontWeight: 700,
                      color: '#1A2B49',
                      margin: '0 0 2px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.name}
                  </h3>
                  <div style={{ fontSize: '0.78rem', color: '#64748B', marginBottom: '4px' }}>
                    ₹{item.price} each
                  </div>
                  <strong style={{ fontSize: '0.92rem', color: '#1A2B49' }}>
                    ₹{item.price * item.quantity}
                  </strong>
                </div>

                {/* Quantity Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      background: '#F1F5F9',
                      borderRadius: '999px',
                      padding: '2px 6px',
                      border: '1px solid #E2E8F0',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.id, -1)}
                      style={{
                        padding: '4px 6px',
                        color: '#1A2B49',
                        cursor: 'pointer',
                        background: 'transparent',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      aria-label="Decrease quantity"
                    >
                      <Minus size={14} />
                    </button>
                    <span
                      style={{
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        minWidth: '20px',
                        textAlign: 'center',
                        color: '#1A2B49',
                      }}
                    >
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.id, 1)}
                      style={{
                        padding: '4px 6px',
                        color: '#1A2B49',
                        cursor: 'pointer',
                        background: 'transparent',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      aria-label="Increase quantity"
                    >
                      <Plus size={14} />
                    </button>
                  </div>

                  {/* Remove Button */}
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    style={{
                      padding: '6px',
                      background: 'none',
                      border: 'none',
                      color: '#94A3B8',
                      cursor: 'pointer',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    aria-label="Remove item"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Add More Items Link */}
          <div style={{ marginTop: '1rem', textAlign: 'center' }}>
            <button
              type="button"
              onClick={() => navigate(menuUrl)}
              style={{
                background: 'none',
                border: 'none',
                color: '#2563EB',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Plus size={15} /> Add More Items from Menu
            </button>
          </div>
        </div>

        {/* Bill Breakdown Summary */}
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: '20px',
            border: '1px solid #E2E8F0',
            padding: '1.25rem',
            boxShadow: '0 4px 16px rgba(0,0,0,0.02)',
          }}
        >
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#1A2B49', margin: '0 0 0.85rem' }}>
            Bill Summary
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B' }}>
              <span>Item Subtotal ({totalCount} items):</span>
              <strong style={{ color: '#1A2B49' }}>₹{subtotal}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748B' }}>
              <span>Estimated Taxes & GST (5%):</span>
              <strong style={{ color: '#1A2B49' }}>₹{taxAmount}</strong>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                color: '#1A2B49',
                fontWeight: 800,
                fontSize: '1.1rem',
                borderTop: '1px solid #E2E8F0',
                paddingTop: '0.75rem',
                marginTop: '0.35rem',
              }}
            >
              <span>Total Amount:</span>
              <span style={{ color: '#059669' }}>₹{grandTotal}</span>
            </div>
          </div>
        </div>
      </main>

      {/* Sticky Bottom Checkout Action Bar */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: '#FFFFFF',
          borderTop: '1px solid #E2E8F0',
          padding: '0.85rem 1rem',
          boxShadow: '0 -4px 16px rgba(0, 0, 0, 0.06)',
          zIndex: 50,
        }}
      >
        <div
          style={{
            maxWidth: '640px',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          <div>
            <span style={{ fontSize: '0.72rem', color: '#64748B', display: 'block', textTransform: 'uppercase' }}>
              Total Payable
            </span>
            <span style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1A2B49' }}>
              ₹{grandTotal}
            </span>
          </div>

          <Button
            variant="primary"
            size="lg"
            onClick={() => navigate(checkoutUrl)}
            icon={ArrowRight}
            style={{
              flex: 1,
              maxWidth: '300px',
              borderRadius: '14px',
              padding: '0.85rem 1.25rem',
              fontWeight: 800,
              fontSize: '0.95rem',
              background: '#059669',
              borderColor: '#059669',
              color: '#FFFFFF',
              boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)',
            }}
          >
            Proceed to Checkout
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PublicCart;
