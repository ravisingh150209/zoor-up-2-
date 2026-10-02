import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Search,
  Send,
  Paperclip,
  Check,
  CheckCheck,
  Smile,
  User,
  Clock,
  Circle
} from 'lucide-react';
import { chatService } from '../../services/chatService';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { LoadingState } from '../../components/ui/States';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

export const ChatManagement = () => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [conversations, setConversations] = useState([]);
  const [activeCustomer, setActiveCustomer] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef(null);

  const bizId = user?.business_id;

  useEffect(() => {
    loadConversations();
  }, [bizId]);

  useEffect(() => {
    if (activeCustomer) {
      loadMessages(activeCustomer.customerId);
    }
  }, [activeCustomer]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadConversations = async () => {
    setLoading(true);
    try {
      const convos = await chatService.getConversations(bizId);
      setConversations(convos);
      if (convos.length > 0 && !activeCustomer) {
        setActiveCustomer(convos[0]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (customerId) => {
    try {
      const msgs = await chatService.getMessages(bizId, customerId);
      setMessages(msgs);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim() || !activeCustomer) return;

    const textToSend = inputText.trim();
    setInputText('');

    try {
      const newMsg = await chatService.sendMessage({
        businessId: bizId,
        customerId: activeCustomer.customerId,
        sender_role: 'business',
        sender_name: user?.business_name || 'Store Support',
        text: textToSend,
      });
      setMessages((prev) => [...prev, newMsg]);
      loadConversations();
    } catch (e) {
      addToast('Error sending message', 'error');
    }
  };

  const filteredConversations = conversations.filter((c) =>
    c.customerName.toLowerCase().includes(search.toLowerCase()) ||
    c.customerId.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Customer Live Chat</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          Engage directly with shoppers, answer product inquiries, and confirm special order requests.
        </p>
      </div>

      <div className="chat-window">
        {/* Left Column: Conversation Directory */}
        <div
          style={{
            borderRight: '1px solid var(--border-subtle)',
            background: 'var(--bg-sidebar)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ padding: '0.85rem', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ position: 'relative' }}>
              <Search
                size={16}
                style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
              />
              <input
                type="text"
                placeholder="Search chats..."
                className="form-input"
                style={{ paddingLeft: '2rem', height: '36px', fontSize: '0.85rem' }}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <LoadingState message="Loading threads..." />
            ) : filteredConversations.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No conversations found
              </div>
            ) : (
              filteredConversations.map((c) => {
                const isActive = activeCustomer?.customerId === c.customerId;
                return (
                  <div
                    key={c.customerId}
                    onClick={() => setActiveCustomer(c)}
                    style={{
                      padding: '0.85rem 1rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--border-subtle)',
                      background: isActive ? 'var(--bg-surface-elevated)' : 'transparent',
                      transition: 'background var(--transition-fast)',
                    }}
                  >
                    <div style={{ position: 'relative' }}>
                      <Avatar src={c.customerAvatar} name={c.customerName} size="md" />
                      <span
                        style={{
                          position: 'absolute',
                          bottom: 0,
                          right: 0,
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          background: 'var(--accent-emerald)',
                          border: '2px solid var(--bg-surface)',
                        }}
                      />
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {c.customerName}
                        </strong>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {new Date(c.lastTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p style={{ fontSize: '0.785rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '2px' }}>
                        {c.lastMessage}
                      </p>
                    </div>

                    {c.unreadCount > 0 && (
                      <span
                        style={{
                          background: 'var(--primary-600)',
                          color: '#fff',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {c.unreadCount}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Chat Stream */}
        {activeCustomer ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-surface)' }}>
            {/* Header */}
            <div
              style={{
                padding: '0.75rem 1.25rem',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'var(--bg-surface-elevated)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Avatar src={activeCustomer.customerAvatar} name={activeCustomer.customerName} size="sm" />
                <div>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>
                    {activeCustomer.customerName}
                  </h4>
                  <span style={{ fontSize: '0.725rem', color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Circle size={6} fill="currentColor" /> Active on ZoorUp App
                  </span>
                </div>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {activeCustomer.customerId}
              </span>
            </div>

            {/* Messages Scroll Area */}
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
                const isOut = m.sender_role === 'business';
                return (
                  <div
                    key={m.id}
                    className={`chat-bubble ${isOut ? 'chat-bubble-out' : 'chat-bubble-in'}`}
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
                      {isOut && <CheckCheck size={13} className="text-cyan-200" />}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <form
              onSubmit={handleSendMessage}
              style={{
                padding: '0.75rem 1rem',
                borderTop: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                background: 'var(--bg-surface-elevated)',
              }}
            >
              <button
                type="button"
                className="btn-ghost"
                style={{ padding: '6px', minHeight: 'auto' }}
                onClick={() => addToast('Image attachment preview enabled', 'info')}
                title="Attach photo"
              >
                <Paperclip size={18} />
              </button>

              <input
                type="text"
                className="form-input"
                style={{ flex: 1, minHeight: '40px' }}
                placeholder="Type your reply to customer..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
              />

              <Button type="submit" variant="primary" style={{ minHeight: '40px', padding: '0.5rem 1rem' }} icon={Send}>
                Send
              </Button>
            </form>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            Select a conversation to start chatting
          </div>
        )}
      </div>
    </div>
  );
};
