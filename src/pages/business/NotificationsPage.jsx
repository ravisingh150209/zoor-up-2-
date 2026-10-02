import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  CheckCheck,
  Award,
  CreditCard,
  Calendar,
  Clock,
  XCircle,
  CheckCircle2,
  Gift,
  ArrowRight,
  ShieldCheck,
  Check,
  HeartHandshake
} from 'lucide-react';
import { notificationService, NOTIFICATION_TYPES } from '../../services/notificationService';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Tabs } from '../../components/ui/Controls';
import { LoadingState } from '../../components/ui/States';

export const NotificationsPage = () => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [activeTab, setActiveTab] = useState('ALL'); // ALL | UNREAD

  useEffect(() => {
    if (user) {
      initNotifications();
    }
  }, [user]);

  const initNotifications = async () => {
    setLoading(true);
    try {
      // Run automated reminder scheduler check for upcoming bookings & rewards
      await notificationService.runReminderEngine(user);
      const list = await notificationService.getUserNotifications(user);
      setNotifications(list);
    } catch (err) {
      console.error('Error initializing notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (notifId, e) => {
    if (e) e.stopPropagation();
    try {
      await notificationService.markAsRead(notifId, user);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notifId ? { ...n, is_read: true } : n))
      );
    } catch (err) {
      console.error('Error marking as read:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const count = await notificationService.markAllAsRead(user);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      addToast(count > 0 ? `Marked ${count} notification(s) as read.` : 'All caught up!', 'success');
    } catch (err) {
      addToast('Error marking all as read', 'error');
    }
  };

  const getIcon = (type) => {
    switch (type) {
      case NOTIFICATION_TYPES.BOOKING:
      case NOTIFICATION_TYPES.BOOKING_CONFIRMED:
      case NOTIFICATION_TYPES.BOOKING_REMINDER_24H:
      case NOTIFICATION_TYPES.BOOKING_REMINDER_2H:
        return <Calendar size={18} color="#D97706" />;
      case NOTIFICATION_TYPES.BOOKING_CANCELLED:
        return <XCircle size={18} color="#EF4444" />;
      case NOTIFICATION_TYPES.BOOKING_PENDING:
        return <Clock size={18} color="#F59E0B" />;
      case NOTIFICATION_TYPES.REWARD_READY:
      case NOTIFICATION_TYPES.LOYALTY:
        return <Gift size={18} color="#8B5CF6" />;
      case NOTIFICATION_TYPES.PAYMENT_CONFIRMED:
        return <CheckCircle2 size={18} color="#16A34A" />;
      case NOTIFICATION_TYPES.PAYMENT_PENDING:
        return <CreditCard size={18} color="#0284C7" />;
      case NOTIFICATION_TYPES.WIN_BACK:
        return <HeartHandshake size={18} color="#EC4899" />;
      default:
        return <Bell size={18} color="#64748B" />;
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const displayed = activeTab === 'UNREAD' ? notifications.filter((n) => !n.is_read) : notifications;

  if (loading) {
    return <LoadingState message="Loading notifications..." />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '780px', margin: '0 auto', width: '100%', paddingBottom: '2.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#1A2B49', margin: 0 }}>
              Notification Center
            </h2>
            {unreadCount > 0 && (
              <Badge variant="warning">{unreadCount} Unread</Badge>
            )}
          </div>
          <p style={{ color: '#64748B', fontSize: '0.85rem', margin: '4px 0 0' }}>
            Real-time alerts, automatic booking reminders, and loyalty updates.
          </p>
        </div>

        {unreadCount > 0 && (
          <Button variant="secondary" size="sm" icon={CheckCheck} onClick={handleMarkAllRead}>
            Mark All Read
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs
        activeTab={activeTab}
        onChange={setActiveTab}
        tabs={[
          { id: 'ALL', label: `All (${notifications.length})` },
          { id: 'UNREAD', label: `Unread (${unreadCount})` },
        ]}
      />

      {/* Notifications List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {displayed.length === 0 ? (
          <div
            className="card"
            style={{
              padding: '3rem 1.5rem',
              textAlign: 'center',
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '16px',
            }}
          >
            <div
              style={{
                width: 54,
                height: 54,
                borderRadius: '50%',
                background: '#F8FAFC',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1rem',
                color: '#94A3B8',
              }}
            >
              <Bell size={26} />
            </div>
            <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1A2B49', margin: '0 0 0.25rem' }}>
              No notifications yet
            </h4>
            <p style={{ color: '#64748B', fontSize: '0.85rem', margin: 0 }}>
              {activeTab === 'UNREAD'
                ? "You're all caught up! No unread notifications."
                : "You don't have any notifications right now."}
            </p>
          </div>
        ) : (
          displayed.map((n) => (
            <div
              key={n.id}
              onClick={() => {
                if (!n.is_read) handleMarkAsRead(n.id);
                if (n.action_url) navigate(n.action_url);
              }}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '1rem',
                padding: '1.15rem',
                background: n.is_read ? '#FFFFFF' : '#FEF3C7',
                border: `1px solid ${n.is_read ? '#E2E8F0' : '#FDE68A'}`,
                borderRadius: '14px',
                position: 'relative',
                cursor: n.action_url ? 'pointer' : 'default',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              }}
            >
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  background: n.is_read ? '#F8FAFC' : '#FFFBEB',
                  border: '1px solid #E2E8F0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {getIcon(n.type)}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '4px' }}>
                  <strong style={{ fontSize: '0.95rem', color: '#1A2B49' }}>{n.title}</strong>
                  <span style={{ fontSize: '0.75rem', color: '#64748B', flexShrink: 0 }}>
                    {n.created_at
                      ? new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : 'Just now'}
                  </span>
                </div>

                <p style={{ fontSize: '0.85rem', color: '#475569', margin: '0 0 0.5rem 0', lineHeight: 1.4 }}>
                  {n.message}
                </p>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {n.action_url && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!n.is_read) handleMarkAsRead(n.id);
                        navigate(n.action_url);
                      }}
                      style={{ padding: '3px 8px', fontSize: '0.75rem', color: '#D97706', fontWeight: 700 }}
                      icon={ArrowRight}
                    >
                      View Details
                    </Button>
                  )}

                  {!n.is_read && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => handleMarkAsRead(n.id, e)}
                      style={{ padding: '3px 8px', fontSize: '0.75rem', color: '#64748B' }}
                      icon={Check}
                    >
                      Mark as read
                    </Button>
                  )}
                </div>
              </div>

              {!n.is_read && (
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: '#F59E0B',
                    position: 'absolute',
                    top: '14px',
                    right: '14px',
                  }}
                />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
