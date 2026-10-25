import { useEffect, useRef, useState } from 'react';
import { aiChat } from '../api/ai.js';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import Input from '../components/ui/Input.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getErrorMessage } from '../utils/errors.js';

// AI chat panel. Role-appropriate behaviour comes from the backend
// (scoped tools + salary guard), not from this page. Every AI answer is
// labelled "AI-generated"; refusals and fallbacks are labelled as such.
// Phase 3 language toggle (English / Roman Urdu) is kept.
const SUGGESTIONS = {
  ADMIN: [
    'How many active employees are there?',
    'Summarize this month’s attendance',
    'Who came late most often this month?',
  ],
  HR: [
    'How many active employees are in Engineering?',
    'Who came late most often this month?',
    'What is this month’s attendance rate?',
  ],
  EMPLOYEE: [
    'How many sick leaves do I have left this year?',
    'What is the office start time?',
    'I need next Monday and Tuesday off for a wedding',
  ],
};

export default function AiChatPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [language, setLanguage] = useState(() => localStorage.getItem('hcm-lite-ai-lang') || 'en');
  const bottomRef = useRef(null);
  useEffect(() => {
    localStorage.setItem('hcm-lite-ai-lang', language);
  }, [language]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, loading]);

  const sendText = async (raw) => {
    const content = raw.trim();
    if (!content || loading) return;
    const userMsg = { role: 'user', content };
    const history = messages.filter((m) => m.role !== 'system').slice(-10);
    setMessages((m) => [...m, userMsg]);
    setText('');
    setLoading(true);
    setError('');
    try {
      const d = await aiChat(
        content,
        history.map((m) => ({ role: m.role, content: m.content })),
        language,
      );
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content: d.answer,
          label: d.fallback ? 'AI unavailable — fallback message' : d.refused ? 'Refused by policy' : 'AI-generated',
        },
      ]);
    } catch (err) {
      if (err.response?.status === 503) {
        setMessages((m) => [
          ...m,
          {
            role: 'assistant',
            content:
              'AI is not configured yet. Ask your Admin to add the AI key in the hosting settings — the dashboards and leave pages still work without it.',
            label: 'AI not configured',
          },
        ]);
      } else if (err.response?.status === 429) {
        setError('AI limit reached for this hour. Please try again later.');
      } else {
        setError(getErrorMessage(err));
      }
    }
    setLoading(false);
  };
  const send = (e) => {
    e.preventDefault();
    sendText(text);
  };
  const suggestions = SUGGESTIONS[user?.role] || SUGGESTIONS.EMPLOYEE;

  return (
    <>
      <PageHeader
        title="AI assistant"
        subtitle="Ask about your own data, team numbers (HR/Admin), or company policy. Answers are based on the app's real records — never invent a number you were not shown. Employees cannot see other people's data or salaries."
      />
      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}
      <Card title="Chat">
        {messages.length === 0 && (
          <div>
            <p className="muted">Try one of these, or type your own question:</p>
            <div className="chat-suggestions">
              {suggestions.map((s) => (
                <Button key={s} variant="ghost" className="btn-sm" disabled={loading} onClick={() => sendText(s)}>
                  {s}
                </Button>
              ))}
            </div>
          </div>
        )}
        <div className="chat" role="log" aria-live="polite" aria-label="AI chat messages">
          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: m.role === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              <div className={`chat-bubble ${m.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-assistant'}`}>
                <strong>{m.role === 'user' ? 'You' : 'Assistant'}: </strong>
                {m.content}
              </div>
              {m.label && <span className="chat-label">{m.label}</span>}
            </div>
          ))}
          {loading && (
            <div className="chat-bubble chat-bubble-assistant" aria-label="Assistant is typing">
              <span className="typing" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
        <div
          style={{ display: 'flex', gap: '0.5rem', margin: '1rem 0 0.75rem' }}
          role="group"
          aria-label="Answer language"
        >
          <Button type="button" variant={language === 'en' ? 'primary' : 'ghost'} onClick={() => setLanguage('en')}>
            English
          </Button>
          <Button type="button" variant={language === 'ur' ? 'primary' : 'ghost'} onClick={() => setLanguage('ur')}>
            Roman Urdu
          </Button>
        </div>
        <form onSubmit={send} className="form">
          <Input label="Message" required value={text} onChange={(e) => setText(e.target.value)} />
          <Button type="submit" disabled={loading}>
            {loading ? 'Thinking…' : 'Send'}
          </Button>
        </form>
      </Card>
    </>
  );
}
