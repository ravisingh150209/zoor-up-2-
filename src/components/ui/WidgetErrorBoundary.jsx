import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

/**
 * Granular section/widget error boundary.
 * Prevents non-essential widget rendering errors from crashing the entire customer dashboard.
 */
export class WidgetErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.warn(`[WidgetErrorBoundary] "${this.props.name || 'widget'}" caught unhandled render error:`, error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    if (typeof this.props.onRetry === 'function') {
      this.props.onRetry();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          style={{
            padding: '1.25rem',
            background: '#FFFFFF',
            border: '1.5px solid #E2E8F0',
            borderRadius: '16px',
            textAlign: 'center',
            margin: '0.5rem 0',
            boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
          }}
        >
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#64748B', fontSize: '0.85rem', fontWeight: 600 }}>
            <AlertCircle size={16} color="#F59E0B" />
            <span>{this.props.title || `${this.props.name || 'This section'} is temporarily unavailable`}</span>
          </div>
          {this.props.showRetry !== false && (
            <div style={{ marginTop: '0.65rem' }}>
              <button
                type="button"
                onClick={this.handleRetry}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: '#1A2B49',
                  background: '#F1F5F9',
                  border: '1px solid #CBD5E1',
                  padding: '5px 12px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                }}
              >
                <RefreshCw size={12} /> Retry Section
              </button>
            </div>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
