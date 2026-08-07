'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  HistoryIcon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
} from 'lucide-react';
import type {
  OnboardingTaskProjection,
  RoadmapCommand,
  RoadmapStageProjection,
} from '@onboarding/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useWorkspaceRoute } from '../WorkspaceRouteContext';
import { dashboardCardClass } from './DashboardState';

export function LiveRoadmapEditor() {
  const {
    onboarding,
    onApplyRoadmapProposal,
    onCancelRoadmap,
    onDismissRoadmapProposal,
    onProposeRoadmapChange,
    onRoadmapCommand,
    roadmapHistory,
    roadmapIsMutating,
    roadmapProposal,
  } = useWorkspaceRoute();
  const projection = onboarding?.status === 'ready' ? onboarding.projection : null;
  const [title, setTitle] = useState(projection?.title ?? '');
  const [startDate, setStartDate] = useState(toDateInput(projection?.startAt));
  const [targetDate, setTargetDate] = useState(toDateInput(projection?.targetAt));
  const [newStageTitle, setNewStageTitle] = useState('');
  const [instruction, setInstruction] = useState('');
  const [cancelReason, setCancelReason] = useState('');

  useEffect(() => {
    setTitle(projection?.title ?? '');
    setStartDate(toDateInput(projection?.startAt));
    setTargetDate(toDateInput(projection?.targetAt));
  }, [projection?.startAt, projection?.targetAt, projection?.title]);
  if (!projection) return null;

  async function submitMetadata(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    await onRoadmapCommand({
      type: 'set_metadata',
      title: title.trim(),
      ...(startDate ? { startAt: toIsoDate(startDate) } : {}),
      targetAt: targetDate ? toIsoDate(targetDate) : null,
    });
  }

  async function addStage(event: FormEvent) {
    event.preventDefault();
    if (!newStageTitle.trim()) return;
    const stableKey = uniqueKey(
      slugify(newStageTitle),
      new Set(projection!.roadmap.map((stage) => stage.stableKey)),
    );
    await onRoadmapCommand({
      type: 'add_stage',
      stage: {
        stableKey,
        title: newStageTitle.trim(),
        description: '',
        dependsOnStageKeys: [],
        tasks: [],
      },
      afterStageKey: projection!.roadmap.at(-1)?.stableKey,
    });
    setNewStageTitle('');
  }

  return (
    <section
      className={`${dashboardCardClass} mt-5 grid gap-5 p-5`}
      aria-label="Live roadmap editor"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="m-0 text-base font-bold text-workspace-heading">Live roadmap editor</h3>
            <Badge variant="outline">Version {projection.planRevision}</Badge>
          </div>
          <p className="mt-1 mb-0 text-sm text-workspace-muted">
            Changes are validated, versioned, and made live immediately.
          </p>
        </div>
        <span className="text-xs font-semibold text-workspace-muted" role="status">
          {roadmapIsMutating ? 'Updating…' : 'All changes saved'}
        </span>
      </div>

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => void submitMetadata(event)}
      >
        <div className="grid min-w-64 flex-[2] gap-2">
          <Label htmlFor="live-roadmap-title">Roadmap title</Label>
          <Input
            disabled={roadmapIsMutating}
            id="live-roadmap-title"
            onChange={(event) => setTitle(event.target.value)}
            value={title}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="live-roadmap-start">Start</Label>
          <Input
            disabled={roadmapIsMutating}
            id="live-roadmap-start"
            onChange={(event) => setStartDate(event.target.value)}
            type="date"
            value={startDate}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="live-roadmap-target">Target</Label>
          <Input
            disabled={roadmapIsMutating}
            id="live-roadmap-target"
            onChange={(event) => setTargetDate(event.target.value)}
            type="date"
            value={targetDate}
          />
        </div>
        <Button disabled={roadmapIsMutating || !title.trim()} type="submit" variant="outline">
          Update title
        </Button>
      </form>

      <div className="grid gap-3">
        {projection.roadmap.map((stage, index) => (
          <StageEditor
            allStages={projection.roadmap}
            disabled={roadmapIsMutating}
            index={index}
            key={stage.stableKey}
            onCommand={onRoadmapCommand}
            stage={stage}
            tasks={projection.tasks.filter((task) => task.stageId === stage.id)}
          />
        ))}
      </div>

      <form className="flex items-end gap-2" onSubmit={(event) => void addStage(event)}>
        <div className="grid min-w-64 flex-1 gap-2">
          <Label htmlFor="new-stage-title">New stage</Label>
          <Input
            disabled={roadmapIsMutating}
            id="new-stage-title"
            onChange={(event) => setNewStageTitle(event.target.value)}
            placeholder="e.g. First week"
            value={newStageTitle}
          />
        </div>
        <Button disabled={roadmapIsMutating || !newStageTitle.trim()} type="submit">
          <PlusIcon />
          Add stage
        </Button>
      </form>

      <div className="grid gap-3 rounded-lg border border-workspace-border bg-workspace-assistant-soft/40 p-4">
        <div>
          <h4 className="m-0 flex items-center gap-2 text-sm font-bold text-workspace-heading">
            <SparklesIcon className="size-4" />
            Ask AI to change the roadmap
          </h4>
          <p className="mt-1 mb-0 text-xs text-workspace-muted">
            AI returns typed operations. Nothing changes until you apply them.
          </p>
        </div>
        <Textarea
          disabled={roadmapIsMutating}
          onChange={(event) => setInstruction(event.target.value)}
          placeholder="e.g. Shorten this plan to 30 days and add measurable security tasks."
          value={instruction}
        />
        <div>
          <Button
            disabled={roadmapIsMutating || instruction.trim().length < 3}
            onClick={() => void onProposeRoadmapChange(instruction.trim())}
            type="button"
          >
            Prepare AI change
          </Button>
        </div>
        {roadmapProposal ? (
          <div className="grid gap-3 rounded-md border border-workspace-border bg-white p-4">
            <div>
              <strong className="text-sm text-workspace-heading">
                {roadmapProposal.rationale}
              </strong>
              <p className="mt-1 mb-0 text-xs text-workspace-muted">
                {roadmapProposal.operations.length} operation(s),{' '}
                {roadmapProposal.progressImpact.tasksAdded} task(s) added,{' '}
                {roadmapProposal.progressImpact.tasksRetired} retired.
              </p>
            </div>
            <ul className="m-0 grid gap-1 pl-5 text-xs text-workspace-muted">
              {roadmapProposal.operations.map((operation, index) => (
                <li key={`${operation.type}-${index}`}>{describeOperation(operation)}</li>
              ))}
            </ul>
            {roadmapProposal.warnings.length ? (
              <p className="m-0 text-xs font-semibold text-amber-700">
                {roadmapProposal.warnings.join(' ')}
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button
                disabled={roadmapIsMutating}
                onClick={() => void onApplyRoadmapProposal()}
                type="button"
              >
                Apply now
              </Button>
              <Button
                disabled={roadmapIsMutating}
                onClick={() => void onDismissRoadmapProposal()}
                type="button"
                variant="outline"
              >
                Dismiss
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <details>
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-workspace-heading">
          <HistoryIcon className="size-4" /> Version history ({roadmapHistory.length})
        </summary>
        <ol className="mt-3 grid gap-2 pl-5 text-xs text-workspace-muted">
          {roadmapHistory.map((event) => (
            <li key={event.id}>
              Version {event.planRevision}: {event.commandType.replaceAll('_', ' ')} ·{' '}
              {new Intl.DateTimeFormat(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(new Date(event.createdAt))}
            </li>
          ))}
        </ol>
      </details>

      <div className="grid gap-2 border-t border-workspace-border pt-4">
        <Label htmlFor="cancel-roadmap-reason">Cancel process</Label>
        <div className="flex flex-wrap gap-2">
          <Input
            className="min-w-64 flex-1"
            disabled={roadmapIsMutating}
            id="cancel-roadmap-reason"
            onChange={(event) => setCancelReason(event.target.value)}
            placeholder="Reason for cancellation"
            value={cancelReason}
          />
          <Button
            disabled={roadmapIsMutating || cancelReason.trim().length < 3}
            onClick={() => void onCancelRoadmap(cancelReason.trim())}
            type="button"
            variant="destructive"
          >
            Cancel process
          </Button>
        </div>
      </div>
    </section>
  );
}

function StageEditor({
  allStages,
  disabled,
  index,
  onCommand,
  stage,
  tasks,
}: {
  allStages: RoadmapStageProjection[];
  disabled: boolean;
  index: number;
  onCommand: (command: RoadmapCommand) => Promise<void>;
  stage: RoadmapStageProjection;
  tasks: OnboardingTaskProjection[];
}) {
  const [title, setTitle] = useState(stage.title);
  const [dependencies, setDependencies] = useState(stage.dependsOnStageKeys.join(', '));
  const [newTaskTitle, setNewTaskTitle] = useState('');
  useEffect(() => {
    setTitle(stage.title);
    setDependencies(stage.dependsOnStageKeys.join(', '));
  }, [stage.dependsOnStageKeys, stage.title]);
  const taskKeys = useMemo(() => new Set(tasks.map((task) => task.stableKey)), [tasks]);

  async function addTask(event: FormEvent) {
    event.preventDefault();
    if (!newTaskTitle.trim()) return;
    await onCommand({
      type: 'add_task',
      stageKey: stage.stableKey,
      task: {
        stableKey: uniqueKey(slugify(newTaskTitle), taskKeys),
        title: newTaskTitle.trim(),
        completionCriteria: `Complete ${newTaskTitle.trim()}`,
      },
      afterTaskKey: tasks.at(-1)?.stableKey,
    });
    setNewTaskTitle('');
  }

  return (
    <article className="grid gap-3 rounded-lg border border-workspace-border bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label={`Stage ${stage.position} title`}
          className="min-w-52 flex-1 font-semibold"
          disabled={disabled}
          onChange={(event) => setTitle(event.target.value)}
          value={title}
        />
        <Button
          disabled={disabled || !title.trim()}
          onClick={() =>
            void onCommand({
              type: 'update_stage',
              stageKey: stage.stableKey,
              patch: {
                title: title.trim(),
                dependsOnStageKeys: parseKeys(dependencies),
              },
            })
          }
          size="sm"
          type="button"
          variant="outline"
        >
          Update
        </Button>
        <Button
          aria-label={`Move ${stage.title} up`}
          disabled={disabled || index === 0}
          onClick={() =>
            void onCommand({
              type: 'move_stage',
              stageKey: stage.stableKey,
              ...(index > 1 ? { afterStageKey: allStages[index - 2]!.stableKey } : {}),
            })
          }
          size="icon"
          type="button"
          variant="ghost"
        >
          <ArrowUpIcon />
        </Button>
        <Button
          aria-label={`Move ${stage.title} down`}
          disabled={disabled || index === allStages.length - 1}
          onClick={() =>
            void onCommand({
              type: 'move_stage',
              stageKey: stage.stableKey,
              afterStageKey: allStages[index + 1]!.stableKey,
            })
          }
          size="icon"
          type="button"
          variant="ghost"
        >
          <ArrowDownIcon />
        </Button>
        <Button
          aria-label={`Delete ${stage.title}`}
          disabled={disabled}
          onClick={() => void onCommand({ type: 'delete_stage', stageKey: stage.stableKey })}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Trash2Icon />
        </Button>
      </div>
      <Input
        aria-label={`Stage dependencies for ${stage.title}`}
        disabled={disabled}
        onChange={(event) => setDependencies(event.target.value)}
        placeholder="Stage dependency keys, comma separated"
        value={dependencies}
      />
      <div className="grid gap-2">
        {tasks.map((task, taskIndex) => (
          <TaskEditor
            allStages={allStages}
            disabled={disabled}
            index={taskIndex}
            key={task.stableKey}
            onCommand={onCommand}
            task={task}
            tasks={tasks}
          />
        ))}
      </div>
      <form className="flex items-end gap-2" onSubmit={(event) => void addTask(event)}>
        <div className="grid flex-1 gap-1">
          <Label className="text-xs" htmlFor={`new-task-${stage.stableKey}`}>
            New task
          </Label>
          <Input
            disabled={disabled}
            id={`new-task-${stage.stableKey}`}
            onChange={(event) => setNewTaskTitle(event.target.value)}
            value={newTaskTitle}
          />
        </div>
        <Button disabled={disabled || !newTaskTitle.trim()} size="sm" type="submit">
          <PlusIcon /> Add task
        </Button>
      </form>
    </article>
  );
}

function TaskEditor({
  allStages,
  disabled,
  index,
  onCommand,
  task,
  tasks,
}: {
  allStages: RoadmapStageProjection[];
  disabled: boolean;
  index: number;
  onCommand: (command: RoadmapCommand) => Promise<void>;
  task: OnboardingTaskProjection;
  tasks: OnboardingTaskProjection[];
}) {
  const [title, setTitle] = useState(task.title);
  const [criteria, setCriteria] = useState(task.completionCriteria ?? '');
  const [weight, setWeight] = useState(String(task.weight));
  const [dueOffsetDays, setDueOffsetDays] = useState(
    task.dueOffsetDays === undefined ? '' : String(task.dueOffsetDays),
  );
  const [dependencies, setDependencies] = useState(task.dependsOnTaskKeys.join(', '));
  const [required, setRequired] = useState(task.required);
  const [countsTowardProgress, setCountsTowardProgress] = useState(task.countsTowardProgress);
  const [targetStage, setTargetStage] = useState(
    allStages.find((stage) => stage.id === task.stageId)?.stableKey ??
      allStages[0]?.stableKey ??
      '',
  );
  useEffect(() => {
    setTitle(task.title);
    setCriteria(task.completionCriteria ?? '');
    setWeight(String(task.weight));
    setDueOffsetDays(task.dueOffsetDays === undefined ? '' : String(task.dueOffsetDays));
    setDependencies(task.dependsOnTaskKeys.join(', '));
    setRequired(task.required);
    setCountsTowardProgress(task.countsTowardProgress);
  }, [
    task.completionCriteria,
    task.countsTowardProgress,
    task.dependsOnTaskKeys,
    task.dueOffsetDays,
    task.required,
    task.title,
    task.weight,
  ]);

  return (
    <div className="grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label={`Task title for ${task.title}`}
          className="min-w-48 flex-1"
          disabled={disabled}
          onChange={(event) => setTitle(event.target.value)}
          value={title}
        />
        <Button
          disabled={disabled || index === 0}
          onClick={() =>
            void onCommand({
              type: 'move_task',
              taskKey: task.stableKey,
              toStageKey: targetStage,
              ...(index > 1 ? { afterTaskKey: tasks[index - 2]!.stableKey } : {}),
            })
          }
          size="icon"
          type="button"
          variant="ghost"
        >
          <ArrowUpIcon />
        </Button>
        <Button
          disabled={disabled || index === tasks.length - 1}
          onClick={() =>
            void onCommand({
              type: 'move_task',
              taskKey: task.stableKey,
              toStageKey: targetStage,
              afterTaskKey: tasks[index + 1]!.stableKey,
            })
          }
          size="icon"
          type="button"
          variant="ghost"
        >
          <ArrowDownIcon />
        </Button>
        <Button
          aria-label={`Delete ${task.title}`}
          disabled={disabled}
          onClick={() => void onCommand({ type: 'delete_task', taskKey: task.stableKey })}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Trash2Icon />
        </Button>
      </div>
      <Input
        aria-label={`Completion criteria for ${task.title}`}
        disabled={disabled}
        onChange={(event) => setCriteria(event.target.value)}
        placeholder="Completion criteria"
        value={criteria}
      />
      <div className="grid gap-2 md:grid-cols-3">
        <Input
          aria-label={`Weight for ${task.title}`}
          disabled={disabled}
          min="0.1"
          onChange={(event) => setWeight(event.target.value)}
          step="0.1"
          type="number"
          value={weight}
        />
        <Input
          aria-label={`Due offset days for ${task.title}`}
          disabled={disabled}
          min="0"
          onChange={(event) => setDueOffsetDays(event.target.value)}
          placeholder="Due offset days"
          type="number"
          value={dueOffsetDays}
        />
        <Input
          aria-label={`Dependencies for ${task.title}`}
          disabled={disabled}
          onChange={(event) => setDependencies(event.target.value)}
          placeholder="Task dependency keys"
          value={dependencies}
        />
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-workspace-muted">
        <label className="flex items-center gap-2">
          <input
            checked={required}
            disabled={disabled}
            onChange={(event) => setRequired(event.target.checked)}
            type="checkbox"
          />
          Required
        </label>
        <label className="flex items-center gap-2">
          <input
            checked={countsTowardProgress}
            disabled={disabled}
            onChange={(event) => setCountsTowardProgress(event.target.checked)}
            type="checkbox"
          />
          Counts toward progress
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={
            disabled || !title.trim() || !Number.isFinite(Number(weight)) || Number(weight) <= 0
          }
          onClick={() =>
            void onCommand({
              type: 'update_task',
              taskKey: task.stableKey,
              patch: {
                title: title.trim(),
                completionCriteria: criteria.trim(),
                weight: Number(weight),
                ...(dueOffsetDays === '' ? {} : { dueOffsetDays: Number(dueOffsetDays) }),
                dependsOnTaskKeys: parseKeys(dependencies),
                required,
                countsTowardProgress,
              },
            })
          }
          size="sm"
          type="button"
          variant="outline"
        >
          Update task
        </Button>
        <select
          aria-label={`Move ${task.title} to stage`}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          disabled={disabled}
          onChange={(event) => setTargetStage(event.target.value)}
          value={targetStage}
        >
          {allStages.map((stage) => (
            <option key={stage.stableKey} value={stage.stableKey}>
              {stage.title}
            </option>
          ))}
        </select>
        {allStages.find((stage) => stage.id === task.stageId)?.stableKey !== targetStage ? (
          <Button
            disabled={disabled}
            onClick={() =>
              void onCommand({
                type: 'move_task',
                taskKey: task.stableKey,
                toStageKey: targetStage,
              })
            }
            size="sm"
            type="button"
            variant="outline"
          >
            Move
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function slugify(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 100) || 'item'
  );
}

function uniqueKey(base: string, existing: Set<string>): string {
  if (!existing.has(base)) return base;
  let index = 2;
  while (existing.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

function describeOperation(operation: RoadmapCommand): string {
  if (operation.type === 'set_metadata') return 'Update roadmap details';
  if (operation.type === 'add_stage') return `Add stage “${operation.stage.title}”`;
  if (operation.type === 'update_stage') return `Update stage ${operation.stageKey}`;
  if (operation.type === 'move_stage') return `Move stage ${operation.stageKey}`;
  if (operation.type === 'delete_stage') return `Delete stage ${operation.stageKey}`;
  if (operation.type === 'add_task') return `Add task “${operation.task.title}”`;
  if (operation.type === 'update_task') return `Update task ${operation.taskKey}`;
  if (operation.type === 'move_task') return `Move task ${operation.taskKey}`;
  return `Delete task ${operation.taskKey}`;
}

function parseKeys(value: string): string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function toDateInput(value: string | undefined): string {
  return value ? value.slice(0, 10) : '';
}

function toIsoDate(value: string): string {
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}
