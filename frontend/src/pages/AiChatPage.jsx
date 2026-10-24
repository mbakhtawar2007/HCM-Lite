import { useState } from 'react';
import { aiChat } from '../api/ai.js';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import Input from '../components/ui/Input.jsx';
import { getErrorMessage } from '../utils/errors.js';

// P3 — AI chat panel for all roles. Role-appropriate behaviour comes
// from the backend (scoped tools + salary guard), not from this page:
// an employee asking about a colleague's salary gets the backend's
// polite refusal here, not other people's data. Every AI answer is
// labelled "AI-generated"; refusals and fallbacks are labelled as such.
export default function AiChatPage() {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim() || loading) return;
    const userMsg = { role: 'user', content: text.trim() };
    const history = messages.filter((m) => m.role !== 'system').slice(-10);
    setMessages((m) => [...m, userMsg]);
    setText(''); setLoading(true); setError('');
    try {
      const d = await aiChat(userMsg.content, history.map((m) => ({ role: m.role, content: m.content })));
      setMessages((m) => [...m, {
        role: 'assistant',
        content: d.answer,
        label: d.fallback ? 'AI unavailable — fallback message' : d.refused ? 'Refused by policy' : 'AI-generated',
      }]);
    } catch (err) {
      if (err.response?.status === 503) {
        setMessages((m) => [...m, { role: 'assistant', content: 'AI is not configured yet. Ask your Admin to add the AI key in the hosting settings — the dashboards and leave pages still work without it.', label: 'AI not configured' }]);
      } else if (err.response?.status === 429) {
        setError('AI limit reached for this hour. Please try again later.');
      } else {
        setError(getErrorMessage(err));
      }
    }
    setLoading(false);
  };

  return (
    <>
      <h1>AI assistant</h1>
      <p className="muted">Ask about your own data, team numbers (HR/Admin), or company policy. Answers are based on the app&apos;s real records — never invent a number you were not shown. Employees cannot see other people&apos;s data or salaries.</p>
      {error && <p className="alert alert-error">{error}</p>}
      <Card title="Chat">
        {messages.length === 0 && <p className="muted">Try: “How many sick leaves do I have left this year?” or “What is the office start time?”</p>}
        <ul className="item-list">
          {messages.map((m, i) => (
            <li key={i}>
              <span><strong>{m.role === 'user' ? 'You' : 'Assistant'}:</strong> {m.content}</span>
              {m.label && <span className="muted">{m.label}</span>}
            </li>
          ))}
        </ul>
        <form onSubmit={send} className="form">
          <Input label="Message" required value={text} onChange={(e) => setText(e.target.value)} />
          <Button type="submit" disabled={loading}>{loading ? 'Thinking…' : 'Send'}</Button>
        </form>
      </Card>
    </>
  );
}
