import React, { useState } from 'react';
import type { AdminActivityResponse, LogEventRecord } from '@onboarding/shared';
import { DataTable } from '@/components/common/data-display/DataTable';
import { MetricGrid } from '@/components/common/data-display/MetricGrid';
import { ConfirmDialog } from '@/components/common/dialogs/ConfirmDialog';
import { formatNumber } from '@/features/admin/format';

export function ActivityPanel({
  activity,
  events,
  onDelete,
  onExport,
  onRetention,
}: {
  activity: AdminActivityResponse;
  events: LogEventRecord[];
  onDelete: (eventType: string, reason: string) => Promise<void>;
  onExport: () => Promise<void>;
  onRetention: (retentionDays: number, reason: string) => Promise<void>;
}) {
  const [deleteType, setDeleteType] = useState('error');
  const [deleteReason, setDeleteReason] = useState('Operational cleanup');
  const [retentionDays, setRetentionDays] = useState('90');
  const [retentionReason, setRetentionReason] = useState('Standard retention policy');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function confirmDelete() {
    setDeletePending(true);
    setDeleteError(null);
    try {
      await onDelete(deleteType, deleteReason);
      setDeleteDialogOpen(false);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Could not delete activity events.');
    } finally {
      setDeletePending(false);
    }
  }

  return (
    <section className="admin-panel">
      <div className="admin-panel-heading">
        <h2>Activity</h2>
        <button onClick={() => void onExport()} type="button">
          Export CSV
        </button>
      </div>
      <MetricGrid
        metrics={[
          { id: 'events', label: 'Events', value: formatNumber(activity.summary.eventsTotal) },
          { id: 'errors', label: 'Errors', value: formatNumber(activity.summary.errorsTotal) },
          {
            id: 'requests',
            label: 'AI requests',
            value: formatNumber(activity.summary.aiRequestsTotal),
          },
          { id: 'tokens', label: 'Tokens', value: formatNumber(activity.summary.totalTokens) },
        ]}
      />
      <DataTable
        columns={[
          { id: 'time', header: 'Time' },
          { id: 'type', header: 'Type' },
          { id: 'user', header: 'User' },
          { id: 'detail', header: 'Detail' },
        ]}
        rows={events.map((event) => ({
          id: event.id,
          cells: [
            new Date(event.timestamp).toLocaleString(),
            event.type,
            event.userId ?? 'n/a',
            event.type === 'ai_usage'
              ? `${event.operation ?? 'ai'} ${event.usage?.model ?? ''} ${formatNumber(
                  event.usage?.totalTokens ?? 0,
                )} tokens`
              : `${event.method ?? ''} ${event.path ?? event.message ?? ''}`.trim(),
          ],
        }))}
      />
      <div className="admin-actions-grid">
        <form
          className="admin-inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            void onRetention(Number(retentionDays), retentionReason);
          }}
        >
          <h3>Retention policy</h3>
          <input
            aria-label="Retention days"
            onChange={(event) => setRetentionDays(event.target.value)}
            type="number"
            value={retentionDays}
          />
          <input
            aria-label="Retention reason"
            onChange={(event) => setRetentionReason(event.target.value)}
            value={retentionReason}
          />
          <button type="submit">Audit retention</button>
        </form>
        <form
          className="admin-inline-form danger"
          onSubmit={(event) => {
            event.preventDefault();
            setDeleteError(null);
            setDeleteDialogOpen(true);
          }}
        >
          <h3>Delete by type</h3>
          <select
            aria-label="Delete event type"
            onChange={(event) => setDeleteType(event.target.value)}
            value={deleteType}
          >
            <option value="error">Errors</option>
            <option value="request">Requests</option>
            <option value="ai_usage">AI usage</option>
          </select>
          <input
            aria-label="Delete reason"
            onChange={(event) => setDeleteReason(event.target.value)}
            value={deleteReason}
          />
          <button type="submit">Delete matching</button>
        </form>
      </div>
      <ConfirmDialog
        confirmLabel="Delete matching"
        description={`Delete all ${deleteType} events? This cannot be undone.`}
        error={deleteError}
        onCancel={() => setDeleteDialogOpen(false)}
        onConfirm={confirmDelete}
        open={deleteDialogOpen}
        pending={deletePending}
        pendingLabel="Deleting..."
        title="Delete activity events?"
        tone="danger"
      />
    </section>
  );
}
