'use client';

import { useEffect, useMemo, useState } from 'react';
import type {
  AdminActivityResponse,
  AdminAuditEvent,
  AiFeeSummaryResponse,
  AiRateCard,
  CreateAiRateCardRequest,
  LogEventRecord,
  LoginRequest,
} from '@onboarding/shared';
import {
  getCurrentAccount,
  loginAccount,
  logoutAccount,
  type AccountSession,
} from '../workspace/api';

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

function formatNumber(value: number) {
  return new Intl.NumberFormat(undefined).format(value);
}

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 6,
  }).format(value);
}

async function adminJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Admin request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export default function AdminClient({ initialView = 'activity' }: { initialView?: AdminView }) {
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
          adminJson<AdminActivityResponse>('/api/admin/activity?limit=25'),
          adminJson<AiFeeSummaryResponse>('/api/admin/ai-fees/summary'),
          adminJson<{ rateCards: AiRateCard[] }>('/api/admin/ai-fees/rates'),
          adminJson<{ events: AdminAuditEvent[] }>('/api/admin/audit?limit=25'),
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

  async function handleLogin(payload: LoginRequest) {
    setIsLoading(true);
    setError(null);
    try {
      const nextAccount = await loginAccount(payload);
      setAccount(nextAccount);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreateRate(input: CreateAiRateCardRequest) {
    await adminJson('/api/admin/ai-fees/rates', {
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
    await adminJson('/api/admin/activity/retention', {
      method: 'POST',
      body: JSON.stringify({ retentionDays, reason }),
    });
    await refresh();
  }

  async function handleDeleteActivity(eventType: string, reason: string) {
    await adminJson('/api/admin/activity', {
      method: 'DELETE',
      body: JSON.stringify({
        query: { eventType },
        reason,
      }),
    });
    await refresh();
  }

  async function handleRecalculateFees(reason: string) {
    const summary = await adminJson<AiFeeSummaryResponse>('/api/admin/ai-fees/recalculate', {
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
          <AdminLoginForm error={error} isLoading={isLoading} onLogin={handleLogin} />
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

function AdminLoginForm({
  error,
  isLoading,
  onLogin,
}: {
  error: string | null;
  isLoading: boolean;
  onLogin: (payload: LoginRequest) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <form
      className="admin-login-form"
      onSubmit={(event) => {
        event.preventDefault();
        void onLogin({
          email,
          password,
        });
      }}
    >
      <label>
        Email
        <input
          autoComplete="username"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </label>
      <label>
        Password
        <input
          autoComplete="current-password"
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </label>
      <button disabled={isLoading} type="submit">
        {isLoading ? 'Signing in...' : 'Open admin console'}
      </button>
      {error ? <p className="admin-error">{error}</p> : null}
    </form>
  );
}

function ActivityPanel({
  activity,
  events,
  onDelete,
  onExport,
  onRetention,
}: {
  activity: AdminActivityResponse;
  events: LogEventRecord[];
  onDelete: (eventType: string, reason: string) => Promise<void>;
  onExport: () => Promise<void>;
  onRetention: (retentionDays: number, reason: string) => Promise<void>;
}) {
  const [deleteType, setDeleteType] = useState('error');
  const [deleteReason, setDeleteReason] = useState('Operational cleanup');
  const [retentionDays, setRetentionDays] = useState('90');
  const [retentionReason, setRetentionReason] = useState('Standard retention policy');

  return (
    <section className="admin-panel">
      <div className="admin-panel-heading">
        <h2>Activity</h2>
        <button onClick={() => void onExport()} type="button">
          Export CSV
        </button>
      </div>
      <MetricGrid
        metrics={[
          ['Events', formatNumber(activity.summary.eventsTotal)],
          ['Errors', formatNumber(activity.summary.errorsTotal)],
          ['AI requests', formatNumber(activity.summary.aiRequestsTotal)],
          ['Tokens', formatNumber(activity.summary.totalTokens)],
        ]}
      />
      <AdminTable
        columns={['Time', 'Type', 'User', 'Detail']}
        rows={events.map((event) => [
          new Date(event.timestamp).toLocaleString(),
          event.type,
          event.userId ?? 'n/a',
          event.type === 'ai_usage'
            ? `${event.operation ?? 'ai'} ${event.usage?.model ?? ''} ${formatNumber(
                event.usage?.totalTokens ?? 0,
              )} tokens`
            : `${event.method ?? ''} ${event.path ?? event.message ?? ''}`.trim(),
        ])}
      />
      <div className="admin-actions-grid">
        <form
          className="admin-inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            void onRetention(Number(retentionDays), retentionReason);
          }}
        >
          <h3>Retention policy</h3>
          <input
            aria-label="Retention days"
            onChange={(event) => setRetentionDays(event.target.value)}
            type="number"
            value={retentionDays}
          />
          <input
            aria-label="Retention reason"
            onChange={(event) => setRetentionReason(event.target.value)}
            value={retentionReason}
          />
          <button type="submit">Audit retention</button>
        </form>
        <form
          className="admin-inline-form danger"
          onSubmit={(event) => {
            event.preventDefault();
            if (window.confirm(`Delete all ${deleteType} events?`)) {
              void onDelete(deleteType, deleteReason);
            }
          }}
        >
          <h3>Delete by type</h3>
          <select
            aria-label="Delete event type"
            onChange={(event) => setDeleteType(event.target.value)}
            value={deleteType}
          >
            <option value="error">Errors</option>
            <option value="request">Requests</option>
            <option value="ai_usage">AI usage</option>
          </select>
          <input
            aria-label="Delete reason"
            onChange={(event) => setDeleteReason(event.target.value)}
            value={deleteReason}
          />
          <button type="submit">Delete matching</button>
        </form>
      </div>
    </section>
  );
}

function FeesPanel({
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
          ['Requests', formatNumber(summary.requests)],
          ['Tokens', formatNumber(summary.totalTokens)],
          ['Estimate', formatMoney(summary.estimatedFee, summary.currency)],
          ['Missing rates', formatNumber(summary.missingRateCardRequests)],
        ]}
      />
      <AdminTable
        columns={['Model', 'Requests', 'Tokens', 'Estimate', 'Missing rates']}
        rows={Object.values(summary.byModel).map((model) => [
          model.model,
          formatNumber(model.requests),
          formatNumber(model.totalTokens),
          formatMoney(model.estimatedFee, model.currency),
          formatNumber(model.missingRateCardRequests),
        ])}
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

function RatesPanel({
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
      <AdminTable
        columns={['Model', 'Currency', 'Input / 1M', 'Output / 1M', 'Active']}
        rows={rates.map((rate) => [
          rate.model,
          rate.currency,
          String(rate.inputCostPer1MTokens),
          String(rate.outputCostPer1MTokens),
          rate.isActive ? 'Yes' : 'No',
        ])}
      />
    </section>
  );
}

function AuditPanel({ events }: { events: AdminAuditEvent[] }) {
  return (
    <section className="admin-panel">
      <div className="admin-panel-heading">
        <h2>Audit trail</h2>
      </div>
      <AdminTable
        columns={['Time', 'Actor', 'Action', 'Target']}
        rows={events.map((event) => [
          new Date(event.createdAt).toLocaleString(),
          event.actorUserId,
          event.action,
          event.targetId ? `${event.targetType}:${event.targetId}` : event.targetType,
        ])}
      />
    </section>
  );
}

function MetricGrid({ metrics }: { metrics: Array<[string, string]> }) {
  return (
    <div className="admin-metrics">
      {metrics.map(([label, value]) => (
        <div className="admin-metric" key={label}>
          <small>{label}</small>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function AdminTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length > 0 ? (
            rows.map((row, index) => (
              <tr key={index}>
                {row.map((cell, cellIndex) => (
                  <td key={`${index}-${cellIndex}`}>{cell}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length}>No records.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
