import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

// Providers
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { CartProvider } from './context/CartContext';

// Layout & Route Guards
import { AppLayout } from './components/layout/AppLayout';
import { ProtectedRoute } from './components/layout/ProtectedRoute';

// Public & Landing (keep eager - first screen)
import { PublicLanding } from './pages/public/PublicLanding';
import { PublicQRMenu } from './pages/public/PublicQRMenu';
import { PublicBusinessHub } from './pages/public/PublicBusinessHub';
import { PublicCheckout } from './pages/public/PublicCheckout';
import { PaymentStatus, OrderSuccess } from './pages/public/PaymentStatus';
import { DownloadPage } from './pages/public/DownloadPage';

// Auth (keep eager - entry points)
import { AuthHub } from './pages/auth/AuthHub';
import { BusinessLogin } from './pages/auth/BusinessLogin';
import { BusinessSignup } from './pages/auth/BusinessSignup';
import { CustomerLogin } from './pages/auth/CustomerLogin';
import { CustomerSignup } from './pages/auth/CustomerSignup';
import { StaffLogin } from './pages/auth/StaffLogin';
import { AdminLogin } from './pages/auth/AdminLogin';
import { ForgotPassword } from './pages/auth/ForgotPassword';

// Business Modules - Lazy load heavy/infrequent pages
const BusinessDashboard = lazy(() => import('./pages/business/BusinessDashboard').then(m => ({ default: m.BusinessDashboard })));
const BusinessOnboarding = lazy(() => import('./pages/business/BusinessOnboarding').then(m => ({ default: m.BusinessOnboarding })));
const BusinessProfile = lazy(() => import('./pages/business/BusinessProfile').then(m => ({ default: m.BusinessProfile })));
const CustomerManagement = lazy(() => import('./pages/business/CustomerManagement').then(m => ({ default: m.CustomerManagement })));
const StaffManagement = lazy(() => import('./pages/business/StaffManagement').then(m => ({ default: m.StaffManagement })));
const ProductsServices = lazy(() => import('./pages/business/ProductsServices').then(m => ({ default: m.ProductsServices })));
const OrdersManagement = lazy(() => import('./pages/business/OrdersManagement').then(m => ({ default: m.OrdersManagement })));
const BillingManagement = lazy(() => import('./pages/business/BillingManagement').then(m => ({ default: m.BillingManagement })));
const PaymentsTransactions = lazy(() => import('./pages/business/PaymentsTransactions').then(m => ({ default: m.PaymentsTransactions })));
const SubscriptionManagement = lazy(() => import('./pages/business/SubscriptionManagement').then(m => ({ default: m.SubscriptionManagement })));
const InventoryManagement = lazy(() => import('./pages/business/InventoryManagement').then(m => ({ default: m.InventoryManagement })));
const ExpensesManagement = lazy(() => import('./pages/business/ExpensesManagement').then(m => ({ default: m.ExpensesManagement })));
const SuppliersManagement = lazy(() => import('./pages/business/SuppliersManagement').then(m => ({ default: m.SuppliersManagement })));
const TableBookingManagement = lazy(() => import('./pages/business/TableBookingManagement').then(m => ({ default: m.TableBookingManagement })));
const QRMenuManagement = lazy(() => import('./pages/business/QRMenuManagement').then(m => ({ default: m.QRMenuManagement })));
const QRScannerPage = lazy(() => import('./pages/business/QRScannerPage').then(m => ({ default: m.QRScannerPage })));
const LoyaltyManagement = lazy(() => import('./pages/business/LoyaltyManagement').then(m => ({ default: m.LoyaltyManagement })));
const OffersManagement = lazy(() => import('./pages/business/OffersManagement').then(m => ({ default: m.OffersManagement })));
const ChatManagement = lazy(() => import('./pages/business/ChatManagement').then(m => ({ default: m.ChatManagement })));
const NotificationsPage = lazy(() => import('./pages/business/NotificationsPage').then(m => ({ default: m.NotificationsPage })));
const AnalyticsPage = lazy(() => import('./pages/business/AnalyticsPage').then(m => ({ default: m.AnalyticsPage })));
const SettingsPage = lazy(() => import('./pages/business/SettingsPage').then(m => ({ default: m.SettingsPage })));

// Customer Modules - Lazy load heavy pages
const CustomerHome = lazy(() => import('./pages/customer/CustomerHome').then(m => ({ default: m.CustomerHome })));
const CustomerBusinesses = lazy(() => import('./pages/customer/CustomerBusinesses').then(m => ({ default: m.CustomerBusinesses })));
const CustomerLoyalty = lazy(() => import('./pages/customer/CustomerLoyalty').then(m => ({ default: m.CustomerLoyalty })));
const CustomerChat = lazy(() => import('./pages/customer/CustomerChat').then(m => ({ default: m.CustomerChat })));
const CustomerProfile = lazy(() => import('./pages/customer/CustomerProfile').then(m => ({ default: m.CustomerProfile })));
const CustomerQRScanner = lazy(() => import('./pages/customer/CustomerQRScanner').then(m => ({ default: m.CustomerQRScanner })));
const CustomerTableBooking = lazy(() => import('./pages/customer/CustomerTableBooking').then(m => ({ default: m.CustomerTableBooking })));

// Admin Modules
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const AdminBusinesses = lazy(() => import('./pages/admin/AdminBusinesses').then(m => ({ default: m.AdminBusinesses })));
const AdminPlans = lazy(() => import('./pages/admin/AdminPlans').then(m => ({ default: m.AdminPlans })));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings').then(m => ({ default: m.AdminSettings })));

import { ErrorBoundary } from './components/ui/ErrorBoundary';

// Lightweight loading skeleton
const PageSkeleton = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
    <div style={{ height: '32px', width: '300px', background: '#E2E8F0', borderRadius: '8px', animation: 'pulse 1.5s infinite' }} />
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
      {[1,2,3,4].map(i => (
        <div key={i} style={{ height: '120px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', animation: 'pulse 1.5s infinite' }} />
      ))}
    </div>
    <div style={{ height: '300px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', animation: 'pulse 1.5s infinite' }} />
  </div>
);

export function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <AuthProvider>
          <ToastProvider>
            <CartProvider>
              <Routes>
              {/* Marketing & Landing */}
              <Route path="/" element={<PublicLanding />} />

              {/* Standard ZOOR UP QR Routes */}
              <Route path="/b/:businessId" element={<PublicBusinessHub />} />
              <Route path="/b/:businessId/table/:tableId" element={<PublicBusinessHub />} />
              <Route path="/b/:businessId/:type" element={<PublicBusinessHub />} />
              <Route path="/join/:token" element={<PublicBusinessHub />} />

              {/* Public Storefront, QR Deep Links & In-Store Checkout */}
              <Route path="/m/:slug" element={<PublicQRMenu />} />
              <Route path="/menu/:slug" element={<PublicQRMenu />} />
              <Route path="/store/:slug" element={<PublicQRMenu />} />
              <Route path="/checkin/:businessId" element={<CustomerQRScanner />} />
              <Route path="/loyalty/:businessId" element={<Suspense fallback={<PageSkeleton />}> <CustomerLoyalty /> </Suspense>} />
              <Route path="/customer/:customerId" element={<Suspense fallback={<PageSkeleton />}> <CustomerProfile /> </Suspense>} />
              <Route path="/checkout" element={<PublicCheckout />} />
              <Route path="/cart" element={<Navigate to="/checkout" replace />} />
              <Route path="/payment-status/:txnId" element={<PaymentStatus />} />
              <Route path="/order-success/:orderId" element={<OrderSuccess />} />
              <Route path="/download" element={<DownloadPage />} />

              {/* Authentication Routes */}
              <Route path="/login" element={<AuthHub />} />
              <Route path="/login/business" element={<BusinessLogin />} />
              <Route path="/signup/business" element={<BusinessSignup />} />
              <Route path="/login/customer" element={<CustomerLogin />} />
              <Route path="/signup/customer" element={<CustomerSignup />} />
              <Route path="/login/staff" element={<StaffLogin />} />
              <Route path="/login/admin" element={<AdminLogin />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />

              {/* Dedicated Business Onboarding Wizard */}
              <Route
                path="/business/onboarding"
                element={
                  <ProtectedRoute allowedRoles={['business']}>
                    <Suspense fallback={<PageSkeleton />}>
                      <BusinessOnboarding />
                    </Suspense>
                  </ProtectedRoute>
                }
              />

              {/* Business Owner Workspace (also staff accessible) */}
              <Route
                path="/business"
                element={
                  <ProtectedRoute allowedRoles={['business', 'staff']}>
                    <AppLayout title="Business Dashboard" />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Suspense fallback={<PageSkeleton />}> <BusinessDashboard /> </Suspense>} />
                <Route path="customers" element={<Suspense fallback={<PageSkeleton />}> <CustomerManagement /> </Suspense>} />
                <Route path="staff" element={<Suspense fallback={<PageSkeleton />}> <StaffManagement /> </Suspense>} />
                <Route path="products" element={<Suspense fallback={<PageSkeleton />}> <ProductsServices /> </Suspense>} />
                <Route path="orders" element={<Suspense fallback={<PageSkeleton />}> <OrdersManagement /> </Suspense>} />
                <Route path="billing" element={<Suspense fallback={<PageSkeleton />}> <BillingManagement /> </Suspense>} />
                <Route path="payments" element={<Suspense fallback={<PageSkeleton />}> <PaymentsTransactions /> </Suspense>} />
                <Route path="subscription" element={<Suspense fallback={<PageSkeleton />}> <SubscriptionManagement /> </Suspense>} />
                <Route path="table-booking" element={<Suspense fallback={<PageSkeleton />}> <TableBookingManagement /> </Suspense>} />
                <Route path="inventory" element={<Suspense fallback={<PageSkeleton />}> <InventoryManagement /> </Suspense>} />
                <Route path="expenses" element={<Suspense fallback={<PageSkeleton />}> <ExpensesManagement /> </Suspense>} />
                <Route path="suppliers" element={<Suspense fallback={<PageSkeleton />}> <SuppliersManagement /> </Suspense>} />
                <Route path="qr-menu" element={<Suspense fallback={<PageSkeleton />}> <QRMenuManagement /> </Suspense>} />
                <Route path="qr-scanner" element={<Suspense fallback={<PageSkeleton />}> <QRScannerPage /> </Suspense>} />
                <Route path="loyalty" element={<Suspense fallback={<PageSkeleton />}> <LoyaltyManagement /> </Suspense>} />
                <Route path="rewards" element={<Suspense fallback={<PageSkeleton />}> <LoyaltyManagement /> </Suspense>} />
                <Route path="offers" element={<Suspense fallback={<PageSkeleton />}> <OffersManagement /> </Suspense>} />
                <Route path="chat" element={<Suspense fallback={<PageSkeleton />}> <ChatManagement /> </Suspense>} />
                <Route path="notifications" element={<Suspense fallback={<PageSkeleton />}> <NotificationsPage /> </Suspense>} />
                <Route path="analytics" element={<Suspense fallback={<PageSkeleton />}> <AnalyticsPage /> </Suspense>} />
                <Route path="profile" element={<Suspense fallback={<PageSkeleton />}> <BusinessProfile /> </Suspense>} />
                <Route path="settings" element={<Suspense fallback={<PageSkeleton />}> <SettingsPage /> </Suspense>} />
              </Route>

              {/* Staff Direct Alias */}
              <Route
                path="/staff"
                element={<Navigate to="/business" replace />}
              />

              {/* Plural /businesses Aliases */}
              <Route
                path="/businesses/*"
                element={<Navigate to="/business" replace />}
              />

              {/* Customer Experience Hub */}
              <Route
                path="/customer"
                element={
                  <ProtectedRoute allowedRoles={['customer']}>
                    <AppLayout title="Customer Pass" />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Suspense fallback={<PageSkeleton />}> <CustomerHome /> </Suspense>} />
                <Route path="businesses" element={<Suspense fallback={<PageSkeleton />}> <CustomerBusinesses /> </Suspense>} />
                <Route path="scan-qr" element={<Suspense fallback={<PageSkeleton />}> <CustomerQRScanner /> </Suspense>} />
                <Route path="table-booking" element={<Suspense fallback={<PageSkeleton />}> <CustomerTableBooking /> </Suspense>} />
                <Route path="loyalty" element={<Suspense fallback={<PageSkeleton />}> <CustomerLoyalty /> </Suspense>} />
                <Route path="rewards" element={<Suspense fallback={<PageSkeleton />}> <CustomerLoyalty /> </Suspense>} />
                <Route path="offers" element={<Suspense fallback={<PageSkeleton />}> <CustomerLoyalty /> </Suspense>} />
                <Route path="activity" element={<Suspense fallback={<PageSkeleton />}> <CustomerProfile /> </Suspense>} />
                <Route path="chat" element={<Suspense fallback={<PageSkeleton />}> <CustomerChat /> </Suspense>} />
                <Route path="notifications" element={<Suspense fallback={<PageSkeleton />}> <NotificationsPage /> </Suspense>} />
                <Route path="profile" element={<Suspense fallback={<PageSkeleton />}> <CustomerProfile /> </Suspense>} />
              </Route>

              {/* Customer Table Booking Direct Alias */}
              <Route
                path="/customer/book-table"
                element={<Navigate to="/customer/table-booking" replace />}
              />

              {/* Platform Superadmin Console */}
              <Route
                path="/admin"
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <AppLayout title="Platform Administration" />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Suspense fallback={<PageSkeleton />}> <AdminDashboard /> </Suspense>} />
                <Route path="businesses" element={<Suspense fallback={<PageSkeleton />}> <AdminBusinesses /> </Suspense>} />
                <Route path="plans" element={<Suspense fallback={<PageSkeleton />}> <AdminPlans /> </Suspense>} />
                <Route path="settings" element={<Suspense fallback={<PageSkeleton />}> <AdminSettings /> </Suspense>} />
              </Route>

              {/* Fallback Catch-All */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </CartProvider>
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  </BrowserRouter>
  );
}

export default App;
