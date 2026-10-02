import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { LoadingState } from '../ui/States';

export const ProtectedRoute = ({ children, allowedRoles = [] }) => {
  const { user, loading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (loading) {
    return <LoadingState message="Checking security authorization..." fullPage />;
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const role = (user.role || '').toLowerCase();
  const allowed = allowedRoles.map(r => (r || '').toLowerCase());

  // If roles specified, verify user's role
  if (allowed.length > 0 && !allowed.includes(role)) {
    // Redirect to user's appropriate default dashboard
    if (role === 'admin' || role === 'super_admin') return <Navigate to="/admin" replace />;
    if (role === 'customer') return <Navigate to="/customer" replace />;
    if (role === 'staff' || role === 'business' || role === 'business_owner') return <Navigate to="/business" replace />;
    return <Navigate to="/login" replace />;
  }

  return children;
};
