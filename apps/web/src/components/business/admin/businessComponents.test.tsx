import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AdminActivityResponse, AiFeeSummaryResponse } from '@onboarding/shared';
import { LoginScreen } from '../auth/LoginScreen';
import { ActivityPanel } from './activity/ActivityPanel';
import { AuditPanel } from './audit/AuditPanel';
import { FeesPanel } from './fees/FeesPanel';
import { RatesPanel } from './fees/RatesPanel';

const activity: AdminActivityResponse = {
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

const fees: AiFeeSummaryResponse = {
  requests: 0,
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  estimatedFee: 0,
  currency: 'USD',
  missingRateCardRequests: 0,
  byModel: {},
};

async function noOperation() {}

void test('business auth presentation owns Microsoft sign-in routing and errors', () => {
  const markup = renderToStaticMarkup(<LoginScreen error="Sign-in failed" />);

  assert.match(markup, /Sign-in failed/);
  assert.match(markup, /href="\/api\/auth\/microsoft\/start"/);
});

void test('admin business panels adapt empty domain data to common presentation', () => {
  const activityMarkup = renderToStaticMarkup(
    <ActivityPanel
      activity={activity}
      events={[]}
      onDelete={noOperation}
      onExport={noOperation}
      onRetention={noOperation}
    />,
  );
  const feesMarkup = renderToStaticMarkup(<FeesPanel onRecalculate={noOperation} summary={fees} />);
  const ratesMarkup = renderToStaticMarkup(<RatesPanel onCreate={noOperation} rates={[]} />);
  const auditMarkup = renderToStaticMarkup(<AuditPanel events={[]} />);

  assert.match(activityMarkup, /Activity/);
  assert.match(activityMarkup, /No records\./);
  assert.match(feesMarkup, /AI fees/);
  assert.match(ratesMarkup, /Rate cards/);
  assert.match(auditMarkup, /Audit trail/);
});
