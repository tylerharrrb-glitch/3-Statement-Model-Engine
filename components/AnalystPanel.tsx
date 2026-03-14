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
        background: 'var(--bg-secondary, #111118)',
        borderLeft: '1px solid var(--border-color, #2a2a3e)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1000,
        boxShadow: '-4px 0 24px rgba(0,0,0,0.4)',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-color, #2a2a3e)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-primary, #0a0a0f)',
        }}
      >
        <div>
          <h3
            style={{
              margin: 0,
              fontSize: '16px',
              fontWeight: 700,
              color: 'var(--accent-blue, #4f8cff)',
            }}
          >
            🧮 3-Statement Analyst
          </h3>
          <p
            style={{
              margin: '2px 0 0',
              fontSize: '11px',
              color: 'var(--text-muted, #6a6a80)',
            }}
          >
            CFA-grade · Egyptian Market · EAS Compliant
          </p>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted, #6a6a80)',
            cursor: 'pointer',
            fontSize: '20px',
            lineHeight: 1,
            padding: '4px 8px',
          }}
          aria-label="Close analyst panel"
        >
          ×
        </button>
      </div>

      {/* Verify All Button */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color, #2a2a3e)' }}>
        <button
          onClick={() => sendMessage(VERIFY_ALL_MESSAGE)}
          disabled={isLoading}
          style={{
            width: '100%',
            padding: '10px 16px',
            background: isLoading ? '#555' : 'var(--accent-blue, #4f8cff)',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: isLoading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          {isLoading ? (
            <>
              <span
                style={{
                  display: 'inline-block',
                  width: '12px',
                  height: '12px',
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: '#fff',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
              Analyzing…
            </>
          ) : (
            '✅ Verify All Statements'
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
              color: 'var(--text-muted, #6a6a80)',
              fontSize: '13px',
              marginTop: '40px',
            }}
          >
            <p>Click &quot;Verify All Statements&quot; for a full audit,</p>
            <p>or ask any question about the model.</p>
            <div
              style={{
                marginTop: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
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
                    background: 'var(--bg-card, #16161e)',
                    border: '1px solid var(--border-color, #2a2a3e)',
                    borderRadius: '6px',
                    color: 'var(--text-secondary, #a0a0b8)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    padding: '8px 12px',
                    textAlign: 'left',
                  }}
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
                borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                background:
                  msg.role === 'user'
                    ? 'var(--accent-blue, #4f8cff)'
                    : 'var(--bg-card, #16161e)',
                color: msg.role === 'user' ? '#fff' : 'var(--text-primary, #e8e8f0)',
                fontSize: '13px',
                lineHeight: '1.6',
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
                background: 'var(--bg-card, #16161e)',
                borderRadius: '12px 12px 12px 2px',
                color: 'var(--text-muted, #6a6a80)',
                fontSize: '13px',
              }}
            >
              Analyzing model data…
            </div>
          </div>
        )}

        {error && (
          <div
            style={{
              padding: '10px 14px',
              background: '#3a1a1a',
              border: '1px solid #c0392b',
              borderRadius: '8px',
              color: '#e74c3c',
              fontSize: '12px',
            }}
          >
            ❌ Error: {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border-color, #2a2a3e)',
          background: 'var(--bg-primary, #0a0a0f)',
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
          placeholder="Ask about the model… (Enter to send, Shift+Enter for newline)"
          disabled={isLoading}
          rows={2}
          style={{
            flex: 1,
            padding: '10px 12px',
            background: 'var(--bg-secondary, #111118)',
            border: '1px solid var(--border-color, #2a2a3e)',
            borderRadius: '8px',
            color: 'var(--text-primary, #e8e8f0)',
            fontSize: '13px',
            resize: 'none',
            outline: 'none',
            lineHeight: '1.5',
            fontFamily: 'inherit',
          }}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={isLoading || !input.trim()}
          style={{
            padding: '10px 16px',
            background:
              isLoading || !input.trim()
                ? 'var(--bg-card, #16161e)'
                : 'var(--accent-blue, #4f8cff)',
            color: isLoading || !input.trim() ? 'var(--text-muted, #6a6a80)' : '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer',
            fontSize: '13px',
            fontWeight: 600,
            minWidth: '64px',
            height: '42px',
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
