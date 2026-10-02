import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Scan, UserCheck, CheckCircle2, ShoppingBag, ArrowRight } from 'lucide-react';
import { QRScannerComponent } from '../../components/qr/QRScannerComponent';
import { customerService } from '../../services/customerService';
import { orderService } from '../../services/orderService';
import { Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { useToast } from '../../context/ToastContext';

export const QRScannerPage = () => {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [scannedEntity, setScannedEntity] = useState(null);

  const handleScanDetected = async (code) => {
    // Check if it's a customer ID
    if (code.startsWith('ZUP-CUS') || code.includes('CUS')) {
      try {
        const customer = await customerService.getCustomerById(code);
        if (customer) {
          setScannedEntity({ type: 'customer', data: customer });
          addToast(`Customer Identified: ${customer.name}!`, 'success');
          return;
        }
      } catch (e) {
        console.log(e);
      }
    }

    // Check if it's an order ID
    if (code.startsWith('ORD-')) {
      try {
        const order = await orderService.getOrderById(code);
        if (order) {
          setScannedEntity({ type: 'order', data: order });
          addToast(`Order Identified: ${order.id}!`, 'success');
          return;
        }
      } catch (e) {
        console.log(e);
      }
    }

    // Otherwise, generic result
    setScannedEntity({ type: 'generic', data: code });
    addToast('QR Code parsed successfully', 'info');
  };

  const handleReset = () => {
    setScannedEntity(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '640px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Store Terminal QR Scanner</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          Scan customer loyalty pass, verify pickup orders, or check customer points.
        </p>
      </div>

      {scannedEntity ? (
        <Card className="animate-fade-in" style={{ padding: '2rem 1.5rem', textAlign: 'center' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: 'var(--success-bg)',
              color: 'var(--accent-emerald)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.25rem',
            }}
          >
            <CheckCircle2 size={34} />
          </div>

          {scannedEntity.type === 'customer' && (
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Customer Verified
              </span>
              <h3 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '0.25rem 0' }}>
                {scannedEntity.data.name}
              </h3>
              <p style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary-400)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                {scannedEntity.data.customer_id}
              </p>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '0.75rem',
                  padding: '1rem',
                  background: 'var(--bg-surface-elevated)',
                  borderRadius: 'var(--radius-lg)',
                  marginBottom: '1.5rem',
                }}
              >
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Rank</span>
                  <div style={{ fontWeight: 700, marginTop: '2px' }}>{scannedEntity.data.rank}</div>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Loyalty Points</span>
                  <div style={{ fontWeight: 700, color: 'var(--accent-amber)', marginTop: '2px' }}>
                    {scannedEntity.data.points} pts
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Spent</span>
                  <div style={{ fontWeight: 700, color: 'var(--accent-emerald)', marginTop: '2px' }}>
                    ₹{scannedEntity.data.total_spent?.toLocaleString() || 0}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                <Button variant="secondary" onClick={handleReset}>
                  Scan Another Code
                </Button>
                <Button
                  variant="primary"
                  icon={ShoppingBag}
                  onClick={() => navigate('/business/billing')}
                >
                  Create Bill for Customer
                </Button>
              </div>
            </div>
          )}

          {scannedEntity.type === 'order' && (
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Order Verified
              </span>
              <h3 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '0.25rem 0' }}>
                {scannedEntity.data.id}
              </h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                Billed to {scannedEntity.data.customer_name} • ₹{scannedEntity.data.total}
              </p>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                <Button variant="secondary" onClick={handleReset}>
                  Scan Another
                </Button>
                <Button
                  variant="primary"
                  onClick={() => navigate('/business/orders')}
                  icon={ArrowRight}
                >
                  View in Orders Center
                </Button>
              </div>
            </div>
          )}

          {scannedEntity.type === 'generic' && (
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                Scanned Result
              </h3>
              <div
                style={{
                  padding: '0.75rem',
                  background: 'var(--bg-input)',
                  borderRadius: 'var(--radius-md)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.85rem',
                  color: 'var(--primary-300)',
                  marginBottom: '1.25rem',
                  wordBreak: 'break-all',
                }}
              >
                {scannedEntity.data}
              </div>
              <Button variant="secondary" onClick={handleReset}>
                Scan Another Code
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <Card style={{ padding: '1.5rem' }}>
          <QRScannerComponent onScanSuccess={handleScanDetected} />
        </Card>
      )}
    </div>
  );
};
