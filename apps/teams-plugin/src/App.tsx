import { useState } from 'react';
import type { AskResponse } from '@onboarding/shared';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3978';

export default function App() {
  const [question, setQuestion] = useState('Where should I start as a new hire?');
  const [response, setResponse] = useState<AskResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function askQuestion() {
    setIsLoading(true);
    try {
      const result = await fetch(`${apiBaseUrl}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });

      if (!result.ok) {
        throw new Error(`Request failed with status ${result.status}`);
      }

      setResponse((await result.json()) as AskResponse);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="shell">
      <h1>Onboarding Accelerator</h1>
      <div className="prompt-row">
        <input
          aria-label="Question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
        />
        <button
          disabled={isLoading || question.trim().length === 0}
          onClick={() => void askQuestion()}
        >
          Ask
        </button>
      </div>

      {response ? (
        <section className="answer">
          <p>{response.answer}</p>
          <div className="sources">
            {response.sources.map((source) => (
              <p key={source.id}>
                {source.title}: {source.excerpt}
              </p>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
