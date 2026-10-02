import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle2, AlertCircle, RefreshCw, KeyRound, ArrowLeft } from 'lucide-react';
import { Button } from '../ui/Button';

export const RealOTPVerification = ({
  phone,
  onVerify,
  onRequestResend,
  onChangePhone,
  loading = false,
  errorMsg = '',
  resendCooldownSeconds = 60,
}) => {
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const digitsRef = useRef(['', '', '', '', '', '']);
  const [cooldown, setCooldown] = useState(resendCooldownSeconds);
  const [resending, setResending] = useState(false);
  const inputsRef = useRef([]);

  // Auto-focus first input box
  useEffect(() => {
    if (inputsRef.current[0]) {
      inputsRef.current[0].focus();
    }
  }, []);

  // Countdown timer for 60s resend cooldown
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);


  const handleDigitChange = (index, value) => {
    const char = value.slice(-1); // Only take latest char
    if (char && !/^\d$/.test(char)) return; // Only numeric digits

    digitsRef.current[index] = char || '';
    const updated = [...digitsRef.current];
    setDigits(updated);

    // Auto-advance to next input
    if (char && index < 5 && inputsRef.current[index + 1]) {
      inputsRef.current[index + 1].focus();
    }

    // Auto-submit ONLY if every single digit is filled
    const allFilled = updated.every((d) => d && /^\d$/.test(d));
    if (allFilled && !loading) {
      onVerify?.(updated.join(''));
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      if (!digitsRef.current[index] && index > 0 && inputsRef.current[index - 1]) {
        inputsRef.current[index - 1].focus();
      }
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;

    for (let i = 0; i < 6; i++) {
      digitsRef.current[i] = pasted[i] || '';
    }
    const updated = [...digitsRef.current];
    setDigits(updated);

    const focusIdx = Math.min(pasted.length, 5);
    if (inputsRef.current[focusIdx]) {
      inputsRef.current[focusIdx].focus();
    }

    if (pasted.length === 6) {
      onVerify?.(pasted);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || resending) return;
    setResending(true);
    try {
      await onRequestResend?.();
      setCooldown(60);
      digitsRef.current = ['', '', '', '', '', ''];
      setDigits(['', '', '', '', '', '']);
      if (inputsRef.current[0]) inputsRef.current[0].focus();
    } finally {
      setResending(false);
    }
  };

  const fullCode = digits.join('');
  const isComplete = fullCode.length === 6;

  // Format masked display phone
  const formattedPhone = phone
    ? phone.replace(/(\+\d{2})(\d{2})(\d{4})(\d{4})/, '$1 $2•••• $4')
    : '+91 XXXXX XXXXX';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'var(--color-accent-light)',
            color: 'var(--color-accent)',
            border: '1px solid #FDE68A',
            marginBottom: '0.75rem',
          }}
        >
          <KeyRound size={24} />
        </div>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 0.35rem 0' }}>
          Verify your phone number
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
          Enter the 6-digit OTP code sent to:
        </p>
        <p style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', marginTop: '0.25rem' }}>
          {formattedPhone}
        </p>
      </div>

      {errorMsg && (
        <div
          style={{
            padding: '0.75rem',
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--danger-text)',
            fontSize: '0.825rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <AlertCircle size={16} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 6 Digit Input Boxes */}
      <div
        onPaste={handlePaste}
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '0.5rem',
          margin: '0.5rem 0',
        }}
      >
        {digits.map((digit, idx) => (
          <input
            key={idx}
            ref={(el) => (inputsRef.current[idx] = el)}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            autoComplete={idx === 0 ? 'one-time-code' : 'off'}
            value={digit}
            onChange={(e) => handleDigitChange(idx, e.target.value)}
            onKeyDown={(e) => handleKeyDown(idx, e)}
            disabled={loading}
            style={{
              width: '46px',
              height: '52px',
              textAlign: 'center',
              fontSize: '1.4rem',
              fontWeight: 800,
              fontFamily: 'monospace',
              background: '#FFFFFF',
              border: digit
                ? '2px solid var(--color-primary)'
                : '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              outline: 'none',
              transition: 'border-color 0.2s',
            }}
          />
        ))}
      </div>

      {/* Submit Button */}
      <Button
        type="button"
        variant="primary"
        block
        disabled={!isComplete || loading}
        loading={loading}
        icon={CheckCircle2}
        onClick={() => onVerify?.(fullCode)}
      >
        Verify OTP
      </Button>

      {/* Cooldown Timer & Resend Controls */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.825rem',
          marginTop: '0.25rem',
        }}
      >
        {cooldown > 0 ? (
          <span style={{ color: 'var(--text-muted)' }}>
            Resend OTP in <strong>{cooldown}s</strong>
          </span>
        ) : (
          <button
            type="button"
            onClick={handleResend}
            disabled={resending || loading}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-accent-dark)',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: 0,
            }}
          >
            <RefreshCw size={13} className={resending ? 'animate-spin' : ''} />
            Resend OTP
          </button>
        )}

        {onChangePhone && (
          <button
            type="button"
            onClick={onChangePhone}
            disabled={loading}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              padding: 0,
              textDecoration: 'underline',
            }}
          >
            <ArrowLeft size={13} />
            Change Phone
          </button>
        )}
      </div>
    </div>
  );
};
