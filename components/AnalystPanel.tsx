// components/AnalystPanel.tsx
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { callAnalyst, AnalystMessage, ModelSnapshot } from '@/lib/services/analyst';

interface AnalystPanelProps {
  modelData: ModelSnapshot | null;
  isOpen: boolean;
  onClose: () => void;
}

const VERIFY_ALL_MESSAGE =
  'Verify all three statements. Check that: ' +
  '(1) Balance Sheet balances — Total Assets = Total Liabilities + Equity, ' +
  '(2) Cash Flow reconciles — CF Ending Cash matches BS Cash, ' +
  '(3) Net Income flows correctly from IS to BS via Retained Earnings, ' +
  '(4) Egyptian profit waterfall is correct — EPD, Legal Reserve, Distributable, Dividends, Addition to RE. ' +
  'Show your work with the actual numbers from the model.';

export function AnalystPanel({ modelData, isOpen, onClose }: AnalystPanelProps) {
  const [messages, setMessages] = useState<AnalystMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  async function sendMessage(messageText: string) {
    if (!messageText.trim() || isLoading) return;

    const userMsg: AnalystMessage = { role: 'user', content: messageText.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      const reply = await callAnalyst(messageText.trim(), modelData, messages);
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: '420px',
        height: '100vh',
        background: 'var(--bg-secondary)',
        borderLeft: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1000,
        boxShadow: '-8px 0 32px rgba(0,0,0,0.5)',
        fontFamily: 'var(--ff-body)',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-primary)',
        }}
      >
        <div>
          <h3
            style={{
              margin: 0,
              fontSize: '15px',
              fontWeight: 700,
              fontFamily: 'var(--ff-display)',
              color: 'var(--accent-gold)',
              letterSpacing: '0.5px',
            }}
          >
            3-Statement Analyst
          </h3>
          <p
            style={{
              margin: '3px 0 0',
              fontSize: '10px',
              fontFamily: 'var(--ff-mono)',
              color: 'var(--text-muted)',
              letterSpacing: '1px',
              textTransform: 'uppercase',
            }}
          >
            CFA-grade · Egyptian Market · EAS Compliant
          </p>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: '14px',
            lineHeight: 1,
            padding: '4px 10px',
            borderRadius: '4px',
            fontFamily: 'var(--ff-mono)',
            transition: 'all .2s ease',
          }}
          aria-label="Close analyst panel"
          onMouseOver={e => { (e.target as HTMLElement).style.borderColor = 'var(--accent-gold)'; (e.target as HTMLElement).style.color = 'var(--accent-gold)'; }}
          onMouseOut={e => { (e.target as HTMLElement).style.borderColor = 'var(--border)'; (e.target as HTMLElement).style.color = 'var(--text-secondary)'; }}
        >
          ×
        </button>
      </div>

      {/* Verify All Button */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <button
          onClick={() => sendMessage(VERIFY_ALL_MESSAGE)}
          disabled={isLoading}
          style={{
            width: '100%',
            padding: '10px 16px',
            background: isLoading ? 'var(--bg-card)' : 'var(--accent-gold)',
            color: isLoading ? 'var(--text-muted)' : 'var(--bg-primary)',
            border: 'none',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: 600,
            fontFamily: 'var(--ff-mono)',
            letterSpacing: '1px',
            textTransform: 'uppercase',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all .2s ease',
          }}
        >
          {isLoading ? (
            <>
              <span
                style={{
                  display: 'inline-block',
                  width: '12px',
                  height: '12px',
                  border: '2px solid var(--text-muted)',
                  borderTopColor: 'var(--accent-gold)',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
              Analyzing...
            </>
          ) : (
            'Verify All Statements'
          )}
        </button>
      </div>

      {/* Message List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: '12px',
              fontFamily: 'var(--ff-mono)',
              marginTop: '40px',
            }}
          >
            <p style={{ marginBottom: 4 }}>Click &quot;Verify All Statements&quot; for a full audit,</p>
            <p>or ask any question about the model.</p>
            <div
              style={{
                marginTop: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              {[
                'Does the balance sheet balance?',
                'Explain the Egyptian profit waterfall',
                'Why is FCFF different from FCF?',
                'Check the 2026E retained earnings roll',
              ].map(q => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontFamily: 'var(--ff-mono)',
                    padding: '8px 12px',
                    textAlign: 'left',
                    transition: 'all .2s ease',
                  }}
                  onMouseOver={e => { (e.target as HTMLElement).style.borderColor = 'rgba(201,168,76,.4)'; (e.target as HTMLElement).style.color = 'var(--accent-gold)'; }}
                  onMouseOut={e => { (e.target as HTMLElement).style.borderColor = 'var(--border)'; (e.target as HTMLElement).style.color = 'var(--text-secondary)'; }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div
              style={{
                maxWidth: '85%',
                padding: '10px 14px',
                borderRadius: msg.role === 'user' ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
                background:
                  msg.role === 'user'
                    ? 'rgba(201,168,76,.15)'
                    : 'var(--bg-card)',
                border: msg.role === 'user'
                  ? '1px solid rgba(201,168,76,.3)'
                  : '1px solid var(--border)',
                color: msg.role === 'user' ? 'var(--accent-gold)' : 'var(--text-primary)',
                fontSize: '12px',
                fontFamily: msg.role === 'assistant' ? 'var(--ff-mono)' : 'var(--ff-body)',
                lineHeight: '1.7',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {isLoading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div
              style={{
                padding: '10px 16px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: '10px 10px 10px 2px',
                color: 'var(--text-muted)',
                fontSize: '12px',
                fontFamily: 'var(--ff-mono)',
              }}
            >
              Analyzing model data...
            </div>
          </div>
        )}

        {error && (
          <div
            style={{
              padding: '10px 14px',
              background: 'rgba(248,113,113,.08)',
              border: '1px solid rgba(248,113,113,.3)',
              borderRadius: '4px',
              color: '#f87171',
              fontSize: '11px',
              fontFamily: 'var(--ff-mono)',
            }}
          >
            Error: {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-primary)',
          display: 'flex',
          gap: '8px',
          alignItems: 'flex-end',
        }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about the model..."
          disabled={isLoading}
          rows={2}
          style={{
            flex: 1,
            padding: '10px 12px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            color: 'var(--text-primary)',
            fontSize: '12px',
            fontFamily: 'var(--ff-mono)',
            resize: 'none',
            outline: 'none',
            lineHeight: '1.5',
          }}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={isLoading || !input.trim()}
          style={{
            padding: '10px 16px',
            background:
              isLoading || !input.trim()
                ? 'var(--bg-card)'
                : 'var(--accent-gold)',
            color: isLoading || !input.trim() ? 'var(--text-muted)' : 'var(--bg-primary)',
            border: 'none',
            borderRadius: '4px',
            cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer',
            fontSize: '11px',
            fontWeight: 600,
            fontFamily: 'var(--ff-mono)',
            letterSpacing: '1px',
            textTransform: 'uppercase',
            minWidth: '64px',
            height: '42px',
            transition: 'all .2s ease',
          }}
        >
          Send
        </button>
      </div>

      {/* CSS for spinner animation */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
