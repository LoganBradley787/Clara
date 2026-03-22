import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { sendChatMessage, ApiClientError } from '../api/client';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatPanelProps {
  presentationId: string;
}

const SUGGESTED_QUESTIONS = [
  'What was my biggest weakness?',
  'How can I reduce my filler words?',
  'Which slide needs the most work?',
  'What should I practice first?',
];

export default function ChatPanel({ presentationId }: ChatPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen]);

  const handleSend = useCallback(async (messageText?: string) => {
    const text = (messageText ?? input).trim();
    if (!text || loading) return;

    setInput('');
    setError(null);
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setLoading(true);

    try {
      const res = await sendChatMessage(presentationId, text);
      setMessages((prev) => [...prev, { role: 'assistant', content: res.response }]);
    } catch (err) {
      const msg = err instanceof ApiClientError
        ? err.apiError.message
        : 'Failed to get a response. Try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [input, loading, presentationId]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  return (
    <>
      {/* Backdrop overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setIsOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(44, 24, 16, 0.15)',
              backdropFilter: 'blur(2px)',
              zIndex: 90,
            }}
          />
        )}
      </AnimatePresence>

      {/* Trigger tab on right edge */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
            onClick={() => setIsOpen(true)}
            style={{
              position: 'fixed',
              right: 0,
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 91,
              background: 'var(--bg-deep)',
              color: 'var(--text-on-dark)',
              border: 'none',
              borderRadius: 'var(--radius-lg) 0 0 var(--radius-lg)',
              padding: 'var(--space-4) var(--space-3)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 'var(--space-2)',
              boxShadow: '-4px 0 20px rgba(44, 24, 16, 0.15)',
              transition: 'background 150ms ease',
              writingMode: 'vertical-rl',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-deep)')}
            aria-label="Open Clara chat"
          >
            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontWeight: 600,
                fontSize: 'var(--text-xs)',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              Ask Clara
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Side drawer */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            style={{
              position: 'fixed',
              right: 0,
              top: 0,
              bottom: 0,
              width: 420,
              maxWidth: '90vw',
              zIndex: 95,
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--bg-base)',
              borderLeft: '1px solid var(--border-subtle)',
              boxShadow: '-8px 0 40px rgba(44, 24, 16, 0.12)',
            }}
          >
            {/* Header */}
            <div
              className="bg-deep-gradient"
              style={{
                padding: 'var(--space-5) var(--space-5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0,
              }}
            >
              <div>
                <h3
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 'var(--text-lg)',
                    color: 'var(--text-on-dark)',
                    fontWeight: 400,
                    lineHeight: 1.2,
                  }}
                >
                  Ask Clara
                </h3>
                <span
                  className="category-label"
                  style={{
                    color: 'var(--text-on-dark-muted)',
                    marginTop: 'var(--space-1)',
                    display: 'block',
                  }}
                >
                  Personalized follow-up
                </span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                style={{
                  background: 'rgba(250, 246, 241, 0.1)',
                  border: '1px solid rgba(250, 246, 241, 0.2)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-on-dark)',
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--text-sm)',
                  transition: 'background 150ms ease',
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(250, 246, 241, 0.2)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(250, 246, 241, 0.1)')}
                aria-label="Close chat"
              >
                &times;
              </button>
            </div>

            {/* Messages area */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: 'var(--space-5)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-4)',
              }}
            >
              {/* Empty state */}
              {messages.length === 0 && !loading && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-5)',
                    paddingTop: 'var(--space-4)',
                  }}
                >
                  <div>
                    <p
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 'var(--text-base)',
                        color: 'var(--text-primary)',
                        lineHeight: 1.5,
                        marginBottom: 'var(--space-2)',
                      }}
                    >
                      Get deeper insight into your performance
                    </p>
                    <p
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 'var(--text-sm)',
                        color: 'var(--text-tertiary)',
                        lineHeight: 1.5,
                      }}
                    >
                      Clara has full context on your transcript, metrics, and feedback. Ask anything specific.
                    </p>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    <span
                      className="category-label"
                      style={{ color: 'var(--text-tertiary)', marginBottom: 'var(--space-1)' }}
                    >
                      Try asking
                    </span>
                    {SUGGESTED_QUESTIONS.map((q) => (
                      <button
                        key={q}
                        onClick={() => handleSend(q)}
                        style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: 'var(--text-sm)',
                          padding: 'var(--space-3)',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border-subtle)',
                          background: 'var(--bg-elevated)',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          textAlign: 'left',
                          lineHeight: 1.4,
                          transition: 'border-color 150ms ease, color 150ms ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = 'var(--accent)';
                          e.currentTarget.style.color = 'var(--accent)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = 'var(--border-subtle)';
                          e.currentTarget.style.color = 'var(--text-secondary)';
                        }}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Message thread */}
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-1)',
                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '88%',
                  }}
                >
                  <span
                    className="category-label"
                    style={{
                      color: 'var(--text-tertiary)',
                      alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    }}
                  >
                    {msg.role === 'user' ? 'You' : 'Clara'}
                  </span>
                  <div
                    style={{
                      padding: 'var(--space-3) var(--space-4)',
                      borderRadius: 'var(--radius-lg)',
                      fontFamily: 'var(--font-body)',
                      fontSize: 'var(--text-sm)',
                      lineHeight: 1.65,
                      ...(msg.role === 'user'
                        ? {
                            background: 'var(--bg-deep)',
                            color: 'var(--text-on-dark)',
                          }
                        : {
                            background: 'var(--bg-elevated)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--border-subtle)',
                          }),
                    }}
                  >
                    {msg.content}
                  </div>
                </motion.div>
              ))}

              {/* Loading indicator */}
              {loading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  style={{ alignSelf: 'flex-start' }}
                >
                  <span
                    className="category-label"
                    style={{ color: 'var(--text-tertiary)', display: 'block', marginBottom: 'var(--space-1)' }}
                  >
                    Clara
                  </span>
                  <div
                    style={{
                      padding: 'var(--space-3) var(--space-4)',
                      borderRadius: 'var(--radius-lg)',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      gap: 'var(--space-2)',
                      alignItems: 'center',
                    }}
                  >
                    {[0, 1, 2].map((dot) => (
                      <motion.span
                        key={dot}
                        animate={{ opacity: [0.25, 0.8, 0.25] }}
                        transition={{
                          duration: 1.4,
                          repeat: Infinity,
                          delay: dot * 0.2,
                          ease: 'easeInOut',
                        }}
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: '50%',
                          background: 'var(--accent)',
                        }}
                      />
                    ))}
                  </div>
                </motion.div>
              )}

              {error && (
                <div
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--pause-warning)',
                    padding: 'var(--space-2) var(--space-3)',
                    background: 'var(--pause-warning-bg)',
                    border: '1px solid var(--pause-warning-border)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  {error}
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div
              style={{
                padding: 'var(--space-4) var(--space-5)',
                borderTop: '1px solid var(--border-subtle)',
                background: 'var(--bg-elevated)',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  gap: 'var(--space-3)',
                  alignItems: 'flex-end',
                }}
              >
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about your presentation..."
                  disabled={loading}
                  rows={1}
                  style={{
                    flex: 1,
                    fontFamily: 'var(--font-body)',
                    fontSize: 'var(--text-sm)',
                    padding: 'var(--space-3)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-base)',
                    color: 'var(--text-primary)',
                    outline: 'none',
                    resize: 'none',
                    lineHeight: 1.5,
                    transition: 'border-color 150ms ease',
                    maxHeight: 80,
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
                />
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim() || loading}
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 'var(--text-sm)',
                    fontWeight: 600,
                    padding: 'var(--space-3) var(--space-4)',
                    borderRadius: 'var(--radius-md)',
                    border: 'none',
                    background: !input.trim() || loading ? 'var(--bg-recessed)' : 'var(--bg-deep)',
                    color: !input.trim() || loading ? 'var(--text-tertiary)' : 'var(--text-on-dark)',
                    cursor: !input.trim() || loading ? 'default' : 'pointer',
                    transition: 'all 150ms ease',
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={(e) => {
                    if (input.trim() && !loading) e.currentTarget.style.background = 'var(--accent)';
                  }}
                  onMouseLeave={(e) => {
                    if (input.trim() && !loading) e.currentTarget.style.background = 'var(--bg-deep)';
                  }}
                >
                  Send
                </button>
              </div>
              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.65rem',
                  color: 'var(--text-tertiary)',
                  marginTop: 'var(--space-2)',
                  lineHeight: 1.4,
                }}
              >
                Responses are generated from your presentation data via Snowflake Cortex.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
