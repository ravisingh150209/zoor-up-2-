import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

// Providers
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { CartProvider } from './context/CartContext';

// Layout & Route Guards
import { AppLayout } from './components/layout/AppLayout';
import { ProtectedRoute } from './components/layout/ProtectedRoute';

// Public & Landing
import { PublicLanding } from './pages/public/PublicLanding';
import { PublicQRMenu } from './pages/public/PublicQRMenu';
import { PublicBusinessHub } from './pages/public/PublicBusinessHub';
import { PublicCheckout } from './pages/public/PublicCheckout';
import { PaymentStatus, OrderSuccess } from './pages/public/PaymentStatus';
import { DownloadPage } from './pages/public/DownloadPage';

// Auth
import { AuthHub } from './pages/auth/AuthHub';
import { BusinessLogin } from './pages/auth/BusinessLogin';
import { BusinessSignup } from './pages/auth/BusinessSignup';
import { CustomerLogin } from './pages/auth/CustomerLogin';
import { CustomerSignup } from './pages/auth/CustomerSignup';
import { StaffLogin } from './pages/auth/StaffLogin';
import { AdminLogin } from './pages/auth/AdminLogin';
import { ForgotPassword } from './pages/auth/ForgotPassword';

// Business Modules
import { BusinessDashboard } from './pages/business/BusinessDashboard';
import { BusinessOnboarding } from './pages/business/BusinessOnboarding';
import { BusinessProfile } from './pages/business/BusinessProfile';
import { CustomerManagement } from './pages/business/CustomerManagement';
import { StaffManagement } from './pages/business/StaffManagement';
import { ProductsServices } from './pages/business/ProductsServices';
import { OrdersManagement } from './pages/business/OrdersManagement';
import { BillingManagement } from './pages/business/BillingManagement';
import { PaymentsManagement } from './pages/business/PaymentsManagement';
import { InventoryManagement } from './pages/business/InventoryManagement';
import { ExpensesManagement } from './pages/business/ExpensesManagement';
import { SuppliersManagement } from './pages/business/SuppliersManagement';
import { TableBookingManagement } from './pages/business/TableBookingManagement';
import { QRMenuManagement } from './pages/business/QRMenuManagement';
import { QRScannerPage } from './pages/business/QRScannerPage';
import { LoyaltyManagement } from './pages/business/LoyaltyManagement';
import { OffersManagement } from './pages/business/OffersManagement';
import { ChatManagement } from './pages/business/ChatManagement';
import { NotificationsPage } from './pages/business/NotificationsPage';
import { AnalyticsPage } from './pages/business/AnalyticsPage';
import { SubscriptionPage } from './pages/business/SubscriptionPage';
import { SettingsPage } from './pages/business/SettingsPage';

// Customer Modules
import { CustomerHome } from './pages/customer/CustomerHome';
import { CustomerBusinesses } from './pages/customer/CustomerBusinesses';
import { CustomerLoyalty } from './pages/customer/CustomerLoyalty';
import { CustomerChat } from './pages/customer/CustomerChat';
import { CustomerProfile } from './pages/customer/CustomerProfile';
import { CustomerQRScanner } from './pages/customer/CustomerQRScanner';
import { CustomerTableBooking } from './pages/customer/CustomerTableBooking';

// Admin Modules
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminBusinesses } from './pages/admin/AdminBusinesses';
import { AdminPlans } from './pages/admin/AdminPlans';
import { AdminSettings } from './pages/admin/AdminSettings';
import { ErrorBoundary } from './components/ui/ErrorBoundary';

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
              <Route path="/loyalty/:businessId" element={<CustomerLoyalty />} />
              <Route path="/customer/:customerId" element={<CustomerProfile />} />
              <Route path="/checkout" element={<PublicCheckout />} />
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
                    <BusinessOnboarding />
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
                <Route index element={<BusinessDashboard />} />
                <Route path="customers" element={<CustomerManagement />} />
                <Route path="staff" element={<StaffManagement />} />
                <Route path="products" element={<ProductsServices />} />
                <Route path="orders" element={<OrdersManagement />} />
                <Route path="billing" element={<BillingManagement />} />
                <Route path="payments" element={<PaymentsManagement />} />
                <Route path="table-booking" element={<TableBookingManagement />} />
                <Route path="inventory" element={<InventoryManagement />} />
                <Route path="expenses" element={<ExpensesManagement />} />
                <Route path="suppliers" element={<SuppliersManagement />} />
                <Route path="qr-menu" element={<QRMenuManagement />} />
                <Route path="qr-scanner" element={<QRScannerPage />} />
                <Route path="loyalty" element={<LoyaltyManagement />} />
                <Route path="rewards" element={<LoyaltyManagement />} />
                <Route path="offers" element={<OffersManagement />} />
                <Route path="chat" element={<ChatManagement />} />
                <Route path="notifications" element={<NotificationsPage />} />
                <Route path="analytics" element={<AnalyticsPage />} />
                <Route path="subscription" element={<SubscriptionPage />} />
                <Route path="profile" element={<BusinessProfile />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>

              {/* Staff Direct Alias */}
              <Route
                path="/staff"
                element={<Navigate to="/business" replace />}
              />

              {/* Plural /businesses Aliases */}
              <Route
                path="/businesses/subscription"
                element={<Navigate to="/business/subscription" replace />}
              />
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
                <Route index element={<CustomerHome />} />
                <Route path="businesses" element={<CustomerBusinesses />} />
                <Route path="scan-qr" element={<CustomerQRScanner />} />
                <Route path="table-booking" element={<CustomerTableBooking />} />
                <Route path="loyalty" element={<CustomerLoyalty />} />
                <Route path="rewards" element={<CustomerLoyalty />} />
                <Route path="offers" element={<CustomerLoyalty />} />
                <Route path="activity" element={<CustomerProfile />} />
                <Route path="chat" element={<CustomerChat />} />
                <Route path="notifications" element={<NotificationsPage />} />
                <Route path="profile" element={<CustomerProfile />} />
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
                <Route index element={<AdminDashboard />} />
                <Route path="businesses" element={<AdminBusinesses />} />
                <Route path="plans" element={<AdminPlans />} />
                <Route path="settings" element={<AdminSettings />} />
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
