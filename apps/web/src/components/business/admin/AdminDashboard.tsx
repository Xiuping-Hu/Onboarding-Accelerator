'use client';

import { useEffect, useMemo, useState } from 'react';
import type {
  AdminActivityResponse,
  AdminAuditEvent,
  AiFeeSummaryResponse,
  AiRateCard,
  CreateAiRateCardRequest,
} from '@onboarding/shared';
import { getCurrentAccount, logoutAccount, type AccountSession } from '@/features/workspace/api';
import { MicrosoftSignInLink } from '@/components/business/auth/MicrosoftSignInLink';

import { requestAdminJson } from '@/features/admin/api';
import { ActivityPanel } from './activity/ActivityPanel';
import { AuditPanel } from './audit/AuditPanel';
import { FeesPanel } from './fees/FeesPanel';
import { RatesPanel } from './fees/RatesPanel';

type AdminView = 'activity' | 'fees' | 'rates' | 'audit';

const adminViewLabels: Record<AdminView, string> = {
  activity: 'Activity',
  fees: 'AI fees',
  rates: 'Rates',
  audit: 'Audit',
};

const emptyActivity: AdminActivityResponse = {
  events: [],
  summary: {
    eventsTotal: 0,
    errorsTotal: 0,
    aiRequestsTotal: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  },
};

export function AdminDashboard({ initialView = 'activity' }: { initialView?: AdminView }) {
  const [account, setAccount] = useState<AccountSession | null>(null);
  const [view, setView] = useState<AdminView>(initialView);
  const [activity, setActivity] = useState<AdminActivityResponse>(emptyActivity);
  const [feeSummary, setFeeSummary] = useState<AiFeeSummaryResponse | null>(null);
  const [rates, setRates] = useState<AiRateCard[]>([]);
  const [audit, setAudit] = useState<AdminAuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const isAdmin = account?.role === 'admin';

  const refresh = useMemo(
    () => async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [nextActivity, nextFees, nextRates, nextAudit] = await Promise.all([
          requestAdminJson<AdminActivityResponse>('/api/admin/activity?limit=25'),
          requestAdminJson<AiFeeSummaryResponse>('/api/admin/ai-fees/summary'),
          requestAdminJson<{ rateCards: AiRateCard[] }>('/api/admin/ai-fees/rates'),
          requestAdminJson<{ events: AdminAuditEvent[] }>('/api/admin/audit?limit=25'),
        ]);
        setActivity(nextActivity);
        setFeeSummary(nextFees);
        setRates(nextRates.rateCards);
        setAudit(nextAudit.events);
      } catch (refreshError) {
        setError(
          refreshError instanceof Error ? refreshError.message : 'Admin data failed to load',
        );
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void getCurrentAccount()
      .then(setAccount)
      .catch(() => setAccount(null));
  }, []);

  useEffect(() => {
    if (isAdmin) {
      void refresh();
    }
  }, [isAdmin, refresh]);

  async function handleCreateRate(input: CreateAiRateCardRequest) {
    await requestAdminJson('/api/admin/ai-fees/rates', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    await refresh();
  }

  async function handleExport() {
    const response = await fetch('/api/admin/activity/export', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ format: 'csv', query: {} }),
    });
    if (!response.ok) {
      setError(`Export failed with status ${response.status}`);
      return;
    }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = 'activity-log.csv';
    link.click();
    URL.revokeObjectURL(url);
    await refresh();
  }

  async function handleRetention(retentionDays: number, reason: string) {
    await requestAdminJson('/api/admin/activity/retention', {
      method: 'POST',
      body: JSON.stringify({ retentionDays, reason }),
    });
    await refresh();
  }

  async function handleDeleteActivity(eventType: string, reason: string) {
    await requestAdminJson('/api/admin/activity', {
      method: 'DELETE',
      body: JSON.stringify({
        query: { eventType },
        reason,
      }),
    });
    await refresh();
  }

  async function handleRecalculateFees(reason: string) {
    const summary = await requestAdminJson<AiFeeSummaryResponse>('/api/admin/ai-fees/recalculate', {
      method: 'POST',
      body: JSON.stringify({ query: {}, reason }),
    });
    setFeeSummary(summary);
    await refresh();
  }

  if (!account || !isAdmin) {
    return (
      <main className="admin-shell">
        <section className="admin-login">
          <p className="eyebrow">Admin operations</p>
          <h1>Managed activity and AI fees</h1>
          {!account ? <MicrosoftSignInLink returnTo="/admin" /> : null}
          {error ? <p className="admin-error">{error}</p> : null}
          {account && !isAdmin ? (
            <p className="admin-error">
              This account is authenticated but does not have admin access.
            </p>
          ) : null}
        </section>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <div>
          <p className="eyebrow">Admin operations</p>
          <h1>Activity log and AI fees</h1>
        </div>
        <div className="admin-account">
          <span>{account.userId}</span>
          <button onClick={() => void refresh()} type="button">
            Refresh
          </button>
          <button
            onClick={() => {
              void logoutAccount().finally(() => setAccount(null));
            }}
            type="button"
          >
            Sign out
          </button>
        </div>
      </header>

      <nav className="admin-tabs" aria-label="Admin sections">
        {(['activity', 'fees', 'rates', 'audit'] as const).map((item) => (
          <button
            className={view === item ? 'active' : ''}
            key={item}
            onClick={() => setView(item)}
            type="button"
          >
            {adminViewLabels[item]}
          </button>
        ))}
        <a href="/admin/knowledge-maps">Knowledge maps</a>
      </nav>

      {error ? <div className="admin-error">{error}</div> : null}
      {isLoading ? <div className="admin-loading">Loading admin data...</div> : null}

      {view === 'activity' ? (
        <ActivityPanel
          activity={activity}
          events={activity.events}
          onDelete={handleDeleteActivity}
          onExport={handleExport}
          onRetention={handleRetention}
        />
      ) : null}
      {view === 'fees' && feeSummary ? (
        <FeesPanel onRecalculate={handleRecalculateFees} summary={feeSummary} />
      ) : null}
      {view === 'rates' ? <RatesPanel onCreate={handleCreateRate} rates={rates} /> : null}
      {view === 'audit' ? <AuditPanel events={audit} /> : null}
    </main>
  );
}
