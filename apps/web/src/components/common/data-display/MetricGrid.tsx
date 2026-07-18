import React, { type ReactNode } from 'react';

export interface MetricItem {
  id: string;
  label: ReactNode;
  value: ReactNode;
}

export function MetricGrid({ metrics }: { metrics: MetricItem[] }) {
  return (
    <div className="common-metric-grid">
      {metrics.map((metric) => (
        <div className="common-metric" key={metric.id}>
          <small>{metric.label}</small>
          <strong>{metric.value}</strong>
        </div>
      ))}
    </div>
  );
}
