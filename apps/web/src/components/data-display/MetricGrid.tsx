import React, { type ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';

export interface MetricItem {
  id: string;
  label: ReactNode;
  value: ReactNode;
}

export function MetricGrid({ metrics }: { metrics: MetricItem[] }) {
  return (
    <div className="mb-4.5 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
      {metrics.map((metric) => (
        <Card className="rounded-lg shadow-none" key={metric.id}>
          <CardContent className="p-3">
            <small className="mb-1.5 block font-bold text-muted-foreground">{metric.label}</small>
            <strong className="text-[22px]">{metric.value}</strong>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
