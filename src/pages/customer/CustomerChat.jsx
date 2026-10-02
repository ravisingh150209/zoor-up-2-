import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, CheckCheck, Store } from 'lucide-react';
import { chatService } from '../../services/chatService';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useAuth } from '../../context/AuthContext';

export const CustomerChat = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef(null);

  const customerId = user?.customer_id || user?.id || '';
  const customerName = user?.name || 'Customer';
  const businessId = 'biz_1';

  useEffect(() => {
    loadChat();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadChat = async () => {
    try {
      const msgs = await chatService.getMessages(businessId, customerId);
      setMessages(msgs);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const text = inputText.trim();
    setInputText('');

    try {
      const newMsg = await chatService.sendMessage({
        businessId,
        customerId,
        sender_role: 'customer',
        sender_name: customerName,
        text,
      });
      setMessages((prev) => [...prev, newMsg]);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '680px', margin: '0 auto', width: '100%' }}>
      <div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Store Chat Support</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          Connect with Green Leaf Organic Supermarket for order inquiries and custom requests.
        </p>
      </div>

      <div
        className="card"
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: 'calc(100vh - 220px)',
          minHeight: '440px',
          padding: 0,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '0.85rem 1.25rem',
            background: 'var(--bg-surface-elevated)',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, #1A2B49 0%, #243B5F 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
            }}
          >
            <Store size={18} />
          </div>
          <div>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>
              Green Leaf Organic Supermarket
            </h4>
            <span style={{ fontSize: '0.72rem', color: 'var(--accent-emerald)' }}>
              ● Store Helpdesk Online
            </span>
          </div>
        </div>

        {/* Message Thread */}
        <div
          style={{
            flex: 1,
            padding: '1.25rem',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          }}
        >
          {messages.map((m) => {
            const isMe = m.sender_role === 'customer';
            return (
              <div
                key={m.id}
                className={`chat-bubble ${isMe ? 'chat-bubble-out' : 'chat-bubble-in'}`}
              >
                <div>{m.text}</div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: '4px',
                    fontSize: '0.675rem',
                    marginTop: '4px',
                    opacity: 0.8,
                  }}
                >
                  <span>
                    {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {isMe && <CheckCheck size={13} className="text-cyan-200" />}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form
          onSubmit={handleSend}
          style={{
            padding: '0.75rem 1rem',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: 'var(--bg-surface-elevated)',
          }}
        >
          <input
            type="text"
            className="form-input"
            style={{ flex: 1, minHeight: '40px' }}
            placeholder="Type your message to store..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />
          <Button type="submit" variant="primary" style={{ minHeight: '40px', padding: '0.5rem 1rem' }} icon={Send}>
            Send
          </Button>
        </form>
      </div>
    </div>
  );
};
