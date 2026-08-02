import React from 'react';
import { MinusIcon, SparklesIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function AgentChatHeader({ onMinimize }: { onMinimize: () => void }) {
  return (
    <div className="relative border-b border-slate-100 pr-12 pb-3.5 pl-0.5">
      <div className="flex items-center gap-2">
        <SparklesIcon aria-hidden="true" className="size-5 text-workspace-assistant" />
        <h2 className="m-0 text-base font-bold text-workspace-heading">Onboarding Assistant</h2>
      </div>
      <Button
        aria-controls="onboarding-assistant-content"
        aria-expanded="true"
        aria-label="Minimize onboarding assistant"
        className="absolute -top-1 right-0 size-11 text-slate-600 hover:bg-slate-100"
        onClick={onMinimize}
        size="icon"
        type="button"
        variant="ghost"
      >
        <MinusIcon aria-hidden="true" className="size-4" />
      </Button>
      <p className="mt-3 mb-0 text-[13px] leading-relaxed text-workspace-muted">
        Ask questions and build your onboarding plan.
      </p>
    </div>
  );
}
