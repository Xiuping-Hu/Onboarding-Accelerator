import type {
  OnboardingTaskMutationSource,
  OnboardingTaskProjection,
  OnboardingTaskStatus,
} from '@onboarding/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function OnboardingTaskRow({
  compact = false,
  onTransitionTask,
  pending,
  source,
  task,
}: {
  compact?: boolean;
  onTransitionTask: (
    taskId: string,
    status: OnboardingTaskStatus,
    expectedRevision: number,
    source: OnboardingTaskMutationSource,
  ) => Promise<void>;
  pending: boolean;
  source: OnboardingTaskMutationSource;
  task: OnboardingTaskProjection;
}) {
  const inputId = `onboarding-task-${task.id}`;
  const completed = task.status === 'completed' || task.status === 'waived';
  return (
    <li
      className={cn(
        'flex items-start gap-3 rounded-lg border border-workspace-border bg-white',
        compact ? 'p-3' : 'p-4',
      )}
    >
      {completed ? (
        <Badge className="mt-0.5 border-transparent bg-workspace-success-soft text-workspace-success">
          {task.status === 'waived' ? 'Waived' : 'Completed'}
        </Badge>
      ) : (
        <input
          aria-describedby={`${inputId}-meta`}
          className="mt-1 size-4 accent-workspace-assistant"
          disabled={pending}
          id={inputId}
          onChange={(event) => {
            if (event.currentTarget.checked) {
              void onTransitionTask(task.id, 'completed', task.revision, source);
            }
          }}
          type="checkbox"
        />
      )}
      <div className="min-w-0 flex-1">
        <label
          className="block font-semibold text-workspace-heading"
          htmlFor={completed ? undefined : inputId}
        >
          {task.title}
        </label>
        {task.description && !compact ? (
          <p className="mt-1 mb-0 text-sm leading-relaxed text-workspace-muted">
            {task.description}
          </p>
        ) : null}
        <p className="mt-1 mb-0 text-xs text-workspace-muted" id={`${inputId}-meta`}>
          {pending
            ? 'Saving…'
            : task.status === 'blocked'
              ? 'Blocked'
              : task.overdue
                ? 'Overdue'
                : formatDueDate(task.dueAt)}
        </p>
      </div>
    </li>
  );
}

function formatDueDate(dueAt: string | undefined): string {
  if (!dueAt) return 'No due date';
  return `Due ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(dueAt))}`;
}
