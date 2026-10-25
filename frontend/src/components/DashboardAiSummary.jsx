import { useState } from 'react';
import { aiDashboardSummary } from '../api/ai.js';
import Button from './ui/Button.jsx';
import Card from './ui/Card.jsx';
import { getErrorMessage } from '../utils/errors.js';

// P3 — "Summarize" sends ONLY the KPI numbers already displayed on this
// dashboard (current filters) to the backend. The backend asks the model
// for bullets from those numbers alone; if AI is unavailable, no bullets
// are fabricated — the unavailable state is shown instead.
export default function DashboardAiSummary({ kpi }) {
  const [bullets, setBullets] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [unavailable, setUnavailable] = useState(false);

  const summarize = async () => {
    setLoading(true);
    setError('');
    setUnavailable(false);
    try {
      const d = await aiDashboardSummary(kpi);
      if (d.aiAvailable === false) setUnavailable(true);
      else setBullets(d.bullets || []);
    } catch (e) {
      // 503 = AI key not configured yet; anything else is a real error.
      if (e.response?.status === 503) setUnavailable(true);
      else setError(getErrorMessage(e));
    }
    setLoading(false);
  };

  return (
    <Card title="AI summary">
      {bullets === null && !unavailable && !error && (
        <p className="muted">Summarize the KPIs above in 3–5 insight bullets, using only those numbers.</p>
      )}
      {unavailable && (
        <p className="muted">
          AI summary is unavailable — the AI key has not been added yet, or the AI service is unreachable. The KPIs
          above are still the real numbers.
        </p>
      )}
      {error && <p className="alert alert-error">{error}</p>}
      {bullets && bullets.length > 0 && (
        <>
          <ul>
            {bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
          <p className="muted">AI-generated — bullets use only the KPI numbers shown on this dashboard.</p>
        </>
      )}
      {bullets && bullets.length === 0 && <p className="muted">No insights returned.</p>}
      <Button onClick={summarize} disabled={loading}>
        {loading ? 'Summarizing…' : 'Summarize'}
      </Button>
    </Card>
  );
}
