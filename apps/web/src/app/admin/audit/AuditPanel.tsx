import React from 'react';
import type { AdminAuditEvent } from '@onboarding/shared';
import { DataTable } from '@/components/common/data-display/DataTable';

export function AuditPanel({ events }: { events: AdminAuditEvent[] }) {
  return (
    <section className="admin-panel">
      <div className="admin-panel-heading">
        <h2>Audit trail</h2>
      </div>
      <DataTable
        columns={[
          { id: 'time', header: 'Time' },
          { id: 'actor', header: 'Actor' },
          { id: 'action', header: 'Action' },
          { id: 'target', header: 'Target' },
        ]}
        rows={events.map((event) => ({
          id: event.id,
          cells: [
            new Date(event.createdAt).toLocaleString(),
            event.actorUserId,
            event.action,
            event.targetId ? `${event.targetType}:${event.targetId}` : event.targetType,
          ],
        }))}
      />
    </section>
  );
}
