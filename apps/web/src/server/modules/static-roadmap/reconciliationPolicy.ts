export function shouldCreateRoadmapUpdateNotice(input: {
  hadCanonicalApplied: boolean;
  recipientIsActive: boolean;
  initialAccount: boolean;
  initialBootstrap: boolean;
  hasRollout: boolean;
}): boolean {
  return (
    input.hadCanonicalApplied &&
    input.recipientIsActive &&
    !input.initialAccount &&
    !input.initialBootstrap &&
    input.hasRollout
  );
}

export function capturedUserSyncDisposition(input: {
  roadmapExists: boolean;
  roadmapSuspended: boolean;
  targetIsCurrent: boolean;
  recipientExists: boolean;
  recipientIsActive: boolean;
}): 'reconcile' | 'supersede' | 'integrity_error' {
  if (!input.roadmapExists || input.roadmapSuspended || !input.targetIsCurrent) {
    return 'supersede';
  }
  if (!input.recipientExists) return 'integrity_error';
  // Cohort membership is durable. Activity only controls notification delivery, not reconciliation.
  return 'reconcile';
}

export function eligibleInitialBackfillUsers<T extends { id: string }>(
  users: T[],
  quarantinedOwnerIds: readonly string[],
): T[] {
  const quarantined = new Set(quarantinedOwnerIds);
  return users.filter((user) => !quarantined.has(user.id));
}
