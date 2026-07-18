'use client';

import { useState } from 'react';
import type { RagKnowledgeMapDraft } from '@onboarding/shared';
import { requestAdminJson } from '@/features/admin/api';

export function KnowledgeMapEditor() {
  const [slug, setSlug] = useState('onboarding-pilot');
  const [title, setTitle] = useState('Onboarding pilot');
  const [objective, setObjective] = useState('Orient new starters to their first-week knowledge.');
  const [sourceIds, setSourceIds] = useState('');
  const [draftText, setDraftText] = useState('');
  const [saved, setSaved] = useState<{ mapId: string; versionId: string } | null>(null);
  const [status, setStatus] = useState('Select reviewed source IDs to begin.');
  const [busy, setBusy] = useState(false);

  async function generateDraft() {
    setBusy(true);
    try {
      const response = await requestAdminJson<{ draft: RagKnowledgeMapDraft }>(
        '/api/admin/knowledge-maps/proposals',
        {
          method: 'POST',
          body: JSON.stringify({
            objective,
            sourceIds: sourceIds
              .split(',')
              .map((value) => value.trim())
              .filter(Boolean),
          }),
        },
      );
      setDraftText(JSON.stringify(response.draft, null, 2));
      setSaved(null);
      setStatus(
        'Domain-categorized draft generated. Review every node, edge, owner, and evidence binding.',
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not generate the draft.');
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    setBusy(true);
    try {
      const draft = JSON.parse(draftText) as RagKnowledgeMapDraft;
      const result = await requestAdminJson<{ mapId: string; versionId: string }>(
        '/api/admin/knowledge-maps',
        {
          method: 'POST',
          body: JSON.stringify({ slug, title, accessScope: 'all_users', draft }),
        },
      );
      setSaved(result);
      setStatus('Draft saved and validated. Publish only after completing the review.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save the draft.');
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!saved) return;
    setBusy(true);
    try {
      await requestAdminJson(
        `/api/admin/knowledge-maps/${encodeURIComponent(saved.mapId)}/versions/${encodeURIComponent(saved.versionId)}/publish`,
        {
          method: 'POST',
          body: JSON.stringify({ changeNote: `Initial reviewed publication for ${objective}` }),
        },
      );
      setStatus('Roadmap published. Eligible sessions now load it directly from the database.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not publish the map.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <div>
          <p>Onboarding Accelerator</p>
          <h1>Knowledge maps</h1>
        </div>
        <a href="/admin">Back to admin</a>
      </header>
      <section className="admin-panel">
        <div className="admin-panel-heading">
          <div>
            <h2>Grounded map draft</h2>
            <p>
              Generate domain categories from reviewed RAG sources, inspect the structure, then
              publish it for every eligible session.
            </p>
          </div>
        </div>
        <div className="admin-inline-form">
          <label>
            Map slug
            <input value={slug} onChange={(event) => setSlug(event.target.value)} />
          </label>
          <label>
            Map title
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>
            Objective
            <textarea value={objective} onChange={(event) => setObjective(event.target.value)} />
          </label>
          <label>
            Source IDs (comma separated)
            <input value={sourceIds} onChange={(event) => setSourceIds(event.target.value)} />
          </label>
          <button
            disabled={busy || !sourceIds.trim()}
            onClick={() => void generateDraft()}
            type="button"
          >
            Generate grounded draft
          </button>
        </div>
        <label>
          Reviewed structured draft
          <textarea
            rows={24}
            value={draftText}
            onChange={(event) => {
              setDraftText(event.target.value);
              setSaved(null);
            }}
          />
        </label>
        <div className="admin-actions-grid">
          <button
            disabled={busy || !draftText.trim()}
            onClick={() => void saveDraft()}
            type="button"
          >
            Save reviewed draft
          </button>
          <button disabled={busy || !saved} onClick={() => void publish()} type="button">
            Publish immutable version
          </button>
        </div>
        <p aria-live="polite">{status}</p>
      </section>
    </main>
  );
}
