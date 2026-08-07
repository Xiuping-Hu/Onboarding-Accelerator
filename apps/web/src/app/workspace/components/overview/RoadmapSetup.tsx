'use client';

import { useState } from 'react';
import { SparklesIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useWorkspaceRoute } from '../WorkspaceRouteContext';
import { dashboardCardClass } from './DashboardState';

export function RoadmapSetup() {
  const { onCreateRoadmap, onGenerateRoadmap, roadmapIsMutating } = useWorkspaceRoute();
  const [goal, setGoal] = useState('Complete my first 30 days successfully');
  const [role, setRole] = useState('');
  const [title, setTitle] = useState('My onboarding roadmap');

  return (
    <section className={`${dashboardCardClass} mt-4 grid gap-5 p-5`}>
      <div>
        <h3 className="m-0 text-base font-bold text-workspace-heading">Create your live roadmap</h3>
        <p className="mt-1 mb-0 text-sm leading-relaxed text-workspace-muted">
          The roadmap becomes active immediately and every change is saved as a version.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="roadmap-goal">Onboarding goal</Label>
          <Input
            disabled={roadmapIsMutating}
            id="roadmap-goal"
            onChange={(event) => setGoal(event.target.value)}
            value={goal}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="roadmap-role">Role (optional)</Label>
          <Input
            disabled={roadmapIsMutating}
            id="roadmap-role"
            onChange={(event) => setRole(event.target.value)}
            placeholder="e.g. Product manager"
            value={role}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button
          disabled={roadmapIsMutating || goal.trim().length < 3}
          onClick={() => void onGenerateRoadmap(goal.trim(), role.trim() || undefined)}
          type="button"
        >
          <SparklesIcon />
          {roadmapIsMutating ? 'Creating…' : 'Generate with AI'}
        </Button>
        <div className="flex min-w-64 flex-1 gap-2">
          <Input
            aria-label="Manual roadmap title"
            disabled={roadmapIsMutating}
            onChange={(event) => setTitle(event.target.value)}
            value={title}
          />
          <Button
            disabled={roadmapIsMutating || !title.trim()}
            onClick={() => void onCreateRoadmap(title.trim())}
            type="button"
            variant="outline"
          >
            Create manually
          </Button>
        </div>
      </div>
    </section>
  );
}
