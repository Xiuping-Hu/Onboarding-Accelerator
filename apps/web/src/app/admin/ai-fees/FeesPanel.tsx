import React, { useState } from 'react';
import type { AiFeeSummaryResponse } from '@onboarding/shared';
import { DataTable } from '@/components/common/data-display/DataTable';
import { MetricGrid } from '@/components/common/data-display/MetricGrid';
import { formatMoney, formatNumber } from '@/features/admin/format';

export function FeesPanel({
  onRecalculate,
  summary,
}: {
  onRecalculate: (reason: string) => Promise<void>;
  summary: AiFeeSummaryResponse;
}) {
  const [reason, setReason] = useState('Refresh fee estimates');

  return (
    <section className="admin-panel">
      <div className="admin-panel-heading">
        <h2>AI fees</h2>
      </div>
      <MetricGrid
        metrics={[
          { id: 'requests', label: 'Requests', value: formatNumber(summary.requests) },
          { id: 'tokens', label: 'Tokens', value: formatNumber(summary.totalTokens) },
          {
            id: 'estimate',
            label: 'Estimate',
            value: formatMoney(summary.estimatedFee, summary.currency),
          },
          {
            id: 'missing-rates',
            label: 'Missing rates',
            value: formatNumber(summary.missingRateCardRequests),
          },
        ]}
      />
      <DataTable
        columns={[
          { id: 'model', header: 'Model' },
          { id: 'requests', header: 'Requests' },
          { id: 'tokens', header: 'Tokens' },
          { id: 'estimate', header: 'Estimate' },
          { id: 'missing-rates', header: 'Missing rates' },
        ]}
        rows={Object.values(summary.byModel).map((model) => ({
          id: model.model,
          cells: [
            model.model,
            formatNumber(model.requests),
            formatNumber(model.totalTokens),
            formatMoney(model.estimatedFee, model.currency),
            formatNumber(model.missingRateCardRequests),
          ],
        }))}
      />
      <form
        className="admin-inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          void onRecalculate(reason);
        }}
      >
        <h3>Recalculate</h3>
        <input
          aria-label="Recalculation reason"
          onChange={(event) => setReason(event.target.value)}
          value={reason}
        />
        <button type="submit">Recalculate fees</button>
      </form>
    </section>
  );
}
