import React, { useState } from 'react';
import type { AiRateCard, CreateAiRateCardRequest } from '@onboarding/shared';
import { DataTable } from '@/components/common/data-display/DataTable';

export function RatesPanel({
  rates,
  onCreate,
}: {
  rates: AiRateCard[];
  onCreate: (input: CreateAiRateCardRequest) => Promise<void>;
}) {
  const [model, setModel] = useState('gpt-4o-mini');
  const [inputCost, setInputCost] = useState('0.15');
  const [outputCost, setOutputCost] = useState('0.60');

  return (
    <section className="admin-panel">
      <div className="admin-panel-heading">
        <h2>Rate cards</h2>
      </div>
      <form
        className="admin-rate-form"
        onSubmit={(event) => {
          event.preventDefault();
          void onCreate({
            model,
            inputCostPer1MTokens: Number(inputCost),
            outputCostPer1MTokens: Number(outputCost),
          });
        }}
      >
        <input
          aria-label="Model"
          onChange={(event) => setModel(event.target.value)}
          value={model}
        />
        <input
          aria-label="Input cost per 1M tokens"
          onChange={(event) => setInputCost(event.target.value)}
          type="number"
          step="0.000001"
          value={inputCost}
        />
        <input
          aria-label="Output cost per 1M tokens"
          onChange={(event) => setOutputCost(event.target.value)}
          type="number"
          step="0.000001"
          value={outputCost}
        />
        <button type="submit">Add rate</button>
      </form>
      <DataTable
        columns={[
          { id: 'model', header: 'Model' },
          { id: 'currency', header: 'Currency' },
          { id: 'input', header: 'Input / 1M' },
          { id: 'output', header: 'Output / 1M' },
          { id: 'active', header: 'Active' },
        ]}
        rows={rates.map((rate) => ({
          id: rate.id,
          cells: [
            rate.model,
            rate.currency,
            String(rate.inputCostPer1MTokens),
            String(rate.outputCostPer1MTokens),
            rate.isActive ? 'Yes' : 'No',
          ],
        }))}
      />
    </section>
  );
}
