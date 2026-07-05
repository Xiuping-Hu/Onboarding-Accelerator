# assistant-ui Agent Drawer Spec

## Status

Proposed.

## Repo Findings

- The right assistant module is currently hand-built in `apps/web/src/app/workspace/WorkspaceClient.tsx`.
- It stores chat messages in local React state, posts to `/api/sessions/:sessionId/chat` through
  `sendChat`, and updates guide focus from `response.focusStepIds`.
- The current assistant panel also renders usage, activity logs, source evidence toggles, a web search
  toggle, and the composer form.
- `apps/web/package.json` does not currently depend on `@assistant-ui/react`.
- The current backend chat API returns complete assistant messages. It does not stream response chunks.
- Official assistant-ui docs recommend `AssistantRuntimeProvider` with a runtime such as
  `useExternalStoreRuntime` when the app owns the message store.

## References

- [assistant-ui API reference](https://www.assistant-ui.com/docs/api-reference/overview)
- [External Store Runtime](https://www.assistant-ui.com/docs/runtimes/custom/external-store)
- [AssistantRuntimeProvider](https://www.assistant-ui.com/docs/api-reference/context-providers/assistant-runtime-provider)

## Goal

Replace the custom right agent assistant module with an assistant-ui based drawer while preserving
the current onboarding chat behavior, guide focus integration, source evidence, and web-search
setting.

## Non-Goals

- Replace the backend chat orchestration service.
- Add model streaming unless it is separately scoped.
- Add assistant-ui Cloud.
- Add file attachments, voice, or tool calling in the first migration.
- Keep client-visible operational logs or AI fee display. Those are removed by
  `006-internal-ops-logging-no-ai-fees.md`.
- Change the central canvas behavior. That belongs to `007-limited-zoomable-client-canvas.md`.

## Parallelization Notes

- This spec can be implemented in parallel with `007-limited-zoomable-client-canvas.md` if the drawer
  boundary stays stable.
- Coordinate with `006-internal-ops-logging-no-ai-fees.md` before building final assistant message
  metadata so no fee or log UI is carried forward.
- If account auth changes from `005-postgres-account-system.md` land at the same time, keep auth
  header and cookie concerns in the existing workspace API helper rather than inside assistant-ui
  components.

## Target Architecture

- Add `@assistant-ui/react` to `apps/web`.
- Build a new right-drawer module under `apps/web/src/app/workspace/assistant`.
- Use `useExternalStoreRuntime` because the app already owns message state and sends messages through
  `sendChat`.
- Wrap the drawer content with `AssistantRuntimeProvider`.
- Use assistant-ui primitives for the thread viewport, message rendering, composer input, send button,
  stop or disabled state, and optional follow-up suggestions.
- Keep onboarding-specific behavior in thin adapters around the assistant-ui runtime.

## Proposed Module Boundaries

```text
apps/web/src/app/workspace/assistant/
  AgentAssistantDrawer.tsx
  AssistantRuntimeBridge.tsx
  AssistantMessage.tsx
  AssistantComposer.tsx
  AssistantEvidence.tsx
  assistantMessageMapping.ts
```

Responsibilities:

- `AgentAssistantDrawer.tsx`: owns drawer layout, collapse affordance, web-search control, and runtime
  provider composition.
- `AssistantRuntimeBridge.tsx`: configures `useExternalStoreRuntime` from current session messages and
  sends new user messages through `sendChat`.
- `AssistantMessage.tsx`: renders user and assistant messages using assistant-ui primitives and local
  design tokens.
- `AssistantComposer.tsx`: renders the composer and send action.
- `AssistantEvidence.tsx`: renders source evidence from message metadata.
- `assistantMessageMapping.ts`: maps between `ChatMessage` and assistant-ui message-like objects.

## Message Mapping

The current `ChatMessage` contract should remain the backend source of truth.

Mapping requirements:

- Preserve `id`, `role`, `content`, and `createdAt`.
- Convert text content into assistant-ui text message parts.
- Store onboarding metadata such as `sources`, `focusStepIds`, `guideNodeIds`, and token usage in
  assistant-ui compatible metadata or custom fields.
- Do not include `estimatedFeeUsd` after `006-internal-ops-logging-no-ai-fees.md`.
- Keep stable message IDs so React rendering, evidence toggles, and future branch support remain
  predictable.

## Send Flow

1. User enters a prompt in the assistant-ui composer.
2. `useExternalStoreRuntime.onNew` receives the outbound message.
3. The bridge appends an optimistic user `ChatMessage` to local state.
4. The bridge calls `sendChat` with `sessionId`, prompt text, `webSearchEnabled`, and
   `selectedStepId`.
5. On success, the bridge appends the returned assistant message.
6. If `focusStepIds` are present, the bridge calls the existing guide focus callback.
7. If sources are present, evidence metadata remains attached to the assistant message.
8. On failure, the bridge appends an assistant error message and exits the running state.

Required state:

- `messages`
- `isRunning`
- `webSearchEnabled`
- `selectedStepId`
- `activeSessionId`
- `onFocusStepIds`
- `onSourcesReceived`

## UI Requirements

- The right drawer remains collapsible through the shell behavior from
  `007-limited-zoomable-client-canvas.md`.
- Assistant messages show source evidence controls when sources are attached.
- Assistant messages may show model and token counts after a response, but no fees.
- The composer remains usable and clearly disabled only when no active session exists or a send is in
  progress.
- The web-search toggle remains visible as a control near the composer or drawer header.
- The drawer uses the repository's existing visual style unless a broader design pass is explicitly
  requested.
- No operational log UI appears in the assistant drawer.

## Backend Compatibility

The first assistant-ui migration should keep the existing non-streaming API:

- `POST /api/sessions/:sessionId/chat`
- `ChatRequest`
- `ChatResponse`

Optional future streaming can be introduced later through a separate spec by adding a streaming route
or assistant transport runtime. The non-streaming migration should not block on that work.

## Implementation Checklist

- [ ] Add `@assistant-ui/react` to `apps/web`.
- [ ] Add assistant module files under `apps/web/src/app/workspace/assistant`.
- [ ] Add message mapping helpers and unit tests.
- [ ] Create an external-store runtime bridge around existing `sendChat`.
- [ ] Replace the hand-rolled message list with assistant-ui thread primitives.
- [ ] Replace the hand-rolled textarea form with assistant-ui composer primitives.
- [ ] Preserve the web-search toggle.
- [ ] Preserve source evidence rendering from assistant messages.
- [ ] Preserve guide focus behavior from `response.focusStepIds`.
- [ ] Remove activity-log and AI fee UI from the drawer.
- [ ] Update CSS for the assistant-ui components within the current right drawer.
- [ ] Add tests for send success, send failure, evidence rendering, and guide focus callbacks.
- [ ] Manually verify collapsed drawer behavior with the canvas changes.
- [ ] Verify `npm run lint`.
- [ ] Verify `npm test`.
- [ ] Verify `npm run build`.

## Acceptance Criteria

- The right assistant drawer is powered by assistant-ui primitives and runtime context.
- Existing chat requests still use the repository's current chat API.
- User messages and assistant responses render correctly.
- Source evidence remains available on assistant messages.
- Web-search selection is included in outgoing chat requests.
- Assistant responses can still focus guide steps.
- The drawer does not render operational logs or AI fees.
- The drawer can be collapsed and expanded without losing the current thread.
- Tests cover mapping, send flow, and key UI behavior.
