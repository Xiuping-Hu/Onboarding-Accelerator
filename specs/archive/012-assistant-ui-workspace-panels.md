# assistant-ui Workspace Panels Spec

## Status

Proposed.

## Repo Findings

- The left session rail is still hand-built inside
  `apps/web/src/app/workspace/WorkspaceClient.tsx`. It renders custom buttons for creating,
  selecting, and deleting sessions.
- The right chat drawer already uses selected `@assistant-ui/react` primitives, but its
  `AssistantRuntimeProvider` is mounted inside `AgentChatDrawer`. The left rail therefore cannot
  participate in the same assistant-ui thread runtime.
- `WorkspaceShell` owns one global `messages` array even though every `OnboardingSession` already
  has its own `chatHistory`. Switching sessions changes the guide but does not hydrate or isolate the
  visible transcript.
- The app uses `useExternalStoreRuntime`, which is the appropriate runtime when the application owns
  its messages and persistence.
- `@assistant-ui/react` resolves to `0.14.26`. That release includes thread-list, thread, message, and
  composer primitives, plus an external-store thread-list adapter.
- assistant-ui does not provide an avatar primitive in the installed release. Role circles must be
  composed as local presentation inside role-specific assistant-ui message components.
- Current panel titles such as `Guidance workspace`, `Agent drawer`, and `Ask, locate, focus` read as
  implementation or demo copy rather than finished product language.
- User and assistant messages are distinguished only by alignment and bubble color. There is no
  persistent role mark beside either message type.

## Problem

The two side panels represent one product workflow but are implemented as separate UI systems. The
left panel controls onboarding sessions outside assistant-ui, while the right panel receives only the
active message array through a drawer-local runtime. This prevents assistant-ui from managing thread
navigation coherently and contributes to transcript state leaking across sessions.

The visual language also feels provisional. Developer-facing labels, text chevrons, generic card
styling, and bubbles without sender identity make the workspace look like a demonstration rather
than a production onboarding product.

## Goal

Replace the left session navigation and the right chat presentation with one coordinated
assistant-ui workspace experience:

- Use assistant-ui thread-list primitives for creating, displaying, switching, and deleting
  onboarding plans.
- Use assistant-ui thread, message, and composer primitives for the complete right chat surface.
- Move the assistant runtime above both panels so they share one active thread identity.
- Make chat state session-scoped and hydrate persisted history when a plan is selected.
- Add a circular identity mark to every user and assistant message.
- Replace all left- and right-panel headings and principal copy with production-facing language.
- Refine both panels into a consistent product shell without changing the full-screen guide canvas.

## Non-Goals

- Replacing the existing session repository, authentication, RAG, guide, or chat orchestration
  services.
- Adopting Assistant Cloud.
- Adding streaming, attachments, voice input, tool-call rendering, branching, or message editing.
- Adding archive semantics, session search, pagination, or AI-generated plan titles.
- Changing guide-map generation or canvas navigation behavior.
- Renaming the `OnboardingSession` backend type or changing the session API schema. Customer-facing
  copy may call a session a plan while code and API contracts continue to use session terminology.
- Introducing Tailwind, shadcn/ui, or a new application-wide design system solely to copy the
  assistant-ui registry examples.

## References

- [assistant-ui ThreadList primitives](https://www.assistant-ui.com/docs/primitives/thread-list)
- [assistant-ui Threads and external-store thread lists](https://www.assistant-ui.com/docs/runtimes/concepts/threads)
- [assistant-ui External Store Runtime](https://www.assistant-ui.com/docs/runtimes/custom/external-store)
- [assistant-ui Message primitives](https://www.assistant-ui.com/docs/primitives/message)
- [assistant-ui Thread component](https://www.assistant-ui.com/docs/ui/thread)

## Product Vocabulary

Use two vocabularies deliberately:

- Code, API, and persistence continue to use **session** and **thread** where required by their
  contracts.
- Visible customer copy uses **plan** because each record contains both a conversation and a guide
  map; calling it only a chat would misrepresent the product object.
- The AI participant is consistently called **Onboarding assistant**. Do not display `agent`,
  `drawer`, `bot`, or `copilot` in customer-facing headings.

## Target Experience

```text
+--------------------------+                         +------------------------------+
| Onboarding Accelerator   |                         | Onboarding assistant         |
| Your plans               |                         | Ask questions and build your |
| [ New plan ]             |       Guide canvas      | onboarding plan.             |
|                          |                         |                              |
| First-week plan          |                         | ( AI ) Grounded answer...    |
| Onboarding plan 2        |                         |              My question (J) |
|                          |                         |                              |
| Account          Sign out|                         | [ Ask about your next step ] |
+--------------------------+                         +------------------------------+
```

- The guide canvas remains the full-viewport base layer.
- The left plans sidebar and right assistant panel remain overlays and do not resize the canvas.
- Both panels use the same surface, spacing, typography, and interaction language.
- Selecting a plan updates the active chat and guide together.
- Assistant and user turns are identifiable without relying only on bubble color or alignment.

## Target Runtime Architecture

```text
WorkspaceShell
└─ WorkspaceAssistantRuntimeProvider
   ├─ PlansSidebar
   │  └─ ThreadListPrimitive
   │     └─ ThreadListItemPrimitive
   ├─ GuideCanvas
   └─ AssistantPanel
      └─ ThreadPrimitive
         ├─ AssistantMessage / UserMessage
         │  └─ MessagePrimitive
         └─ ComposerPrimitive
```

### Provider Placement

- Replace the drawer-local runtime boundary with one workspace-level
  `WorkspaceAssistantRuntimeProvider`.
- The provider must wrap both `PlansSidebar` and `AssistantPanel` so thread selection and message
  rendering resolve from the same runtime.
- Keep `useExternalStoreRuntime`; the application and existing APIs remain the owners of sessions,
  messages, and persistence.
- Configure the runtime with an external-store thread-list adapter using the active session ID,
  session metadata, and application callbacks.
- Keep `activeSessionId` as the single source of truth. Do not maintain a second assistant-ui-only
  selected thread ID.
- Because the external-store thread-list surface in `0.14.26` is still evolving, implementation must
  verify the locked version, avoid an unrelated package upgrade during the migration, and cover the
  adapter boundary with integration tests.

### Required Session-to-Thread Mapping

Map each `OnboardingSession` to one assistant-ui thread record:

- `session.id` -> thread `id`
- `session.title` -> thread `title`
- `session.updatedAt` -> thread custom metadata used by the list row
- active session ID -> adapter `threadId`
- session `chatHistory` -> active runtime `messages`

Wire the capabilities that currently exist:

- New thread -> `createSession`
- Switch thread -> select the session and load its guide
- Delete thread -> `deleteSession`, subject to confirmation and the last-plan rule

Do not expose rename, archive, or unarchive controls unless their complete product behavior is added
in a separately approved scope.

## Left Plans Sidebar Requirements

- Replace the custom session `<nav>` and session buttons with:
  - `ThreadListPrimitive.Root`
  - `ThreadListPrimitive.New`
  - `ThreadListPrimitive.Items`
  - `ThreadListItemPrimitive.Root`
  - `ThreadListItemPrimitive.Trigger`
  - `ThreadListItemPrimitive.Title`
  - `ThreadListItemPrimitive.Delete`, composed through a controlled confirmation action
- Render active state from the primitive-provided `data-active` and `aria-current` state rather than
  duplicating active-row semantics.
- Show the plan title as the primary row label and `Updated <date>` as secondary metadata.
- Keep the account identity and sign-out action in a sidebar footer outside the thread list.
- Map raw account roles to presentable labels: `user` -> `Member`, `admin` -> `Administrator`.
- Preserve the invariant that the final remaining plan cannot be deleted.
- Require confirmation before deletion, name the affected plan, and restore focus predictably when
  deletion completes or is cancelled.
- Disable repeated new-plan actions while creation is pending.
- Replace literal `+`, `<`, and `>` characters used as controls with accessible icons or clear text
  buttons. Icons must have tooltips and accessible names.
- Preserve collapse/expand behavior without unmounting the runtime or losing the selected plan.

## Right Assistant Panel Requirements

- Replace the current generic message renderer with explicit role-specific components supplied to
  `ThreadPrimitive.Messages`:
  - `AssistantMessage`
  - `UserMessage`
  - an intentionally minimal `SystemMessage` if system messages ever become visible
- Build each role component from `MessagePrimitive.Root` and `MessagePrimitive.Parts`.
- Keep `AssistantEvidence` within assistant messages and preserve source titles, excerpts, and safe
  external links.
- Move the composer into the thread viewport/footer structure so auto-scroll, scroll-to-bottom, and
  composer layout belong to one assistant-ui thread surface.
- Continue using `ComposerPrimitive.Root`, `ComposerPrimitive.Input`, and
  `ComposerPrimitive.Send`.
- Disable sending when no plan is active and while that plan has an in-flight request.
- Replace the synthetic `assistant-welcome` message with an assistant-ui empty-thread welcome state.
  Welcome copy must not be persisted as chat history.
- Represent the non-streaming pending state as an assistant row with the assistant circle and a
  polite live status. Do not add an empty assistant message to persisted history.
- Keep source evidence and optional guide-map proposal behavior.
- Remove model and token counts from the default message surface. If operational detail remains
  necessary, put it behind a clearly labelled message-details affordance; do not display it as
  primary conversation content.

## Message Identity Circle Requirements

- Every visible user and assistant message must include a fixed-size circular role mark.
- The assistant mark appears before the left-aligned assistant message and contains a simple brand
  glyph or the text `AI`.
- The user mark appears after the right-aligned user message and contains the signed-in user's first
  display-name initial, falling back to the email initial and then `U`.
- Recommended desktop diameter is 30-32px; the compact/mobile diameter must not be smaller than
  28px.
- The circle must not shrink when message content is long.
- Role components must add an explicit role class or `data-role` attribute; `MessagePrimitive.Root`
  does not add a role attribute automatically.
- Color is supplementary. The glyph or initial, placement, bubble treatment, and an accessible
  sender label must also distinguish the roles.
- If the visible glyph is redundant with adjacent sender text, mark the circle `aria-hidden` and
  provide visually hidden sender text (`Onboarding assistant` or `You`).
- Assistant error and pending states use the assistant circle. System/status messages do not imitate
  either participant.

## Required Copy Changes

The following copy is part of acceptance, not placeholder guidance:

| Location                 | Current copy                                        | Required copy                                         |
| ------------------------ | --------------------------------------------------- | ----------------------------------------------------- |
| Left region label        | `Onboarding sessions`                               | `Onboarding plans`                                    |
| Left product label       | `Onboarding`                                        | `Onboarding Accelerator`                              |
| Left heading             | `Guidance workspace`                                | `Your plans`                                          |
| Left collapse control    | `Expand sessions panel` / `Collapse sessions panel` | `Expand plans sidebar` / `Collapse plans sidebar`     |
| Create action            | `+ New session`                                     | `New plan`                                            |
| Delete action            | `Delete current`                                    | `Delete plan`                                         |
| Initial plan title       | `First week path`                                   | `First-week plan`                                     |
| Additional plan title    | `Onboarding path N`                                 | `Onboarding plan N`                                   |
| Untitled fallback        | `New onboarding session`                            | `Untitled onboarding plan`                            |
| Right region label       | `Chat assistant and sources`                        | `Onboarding assistant`                                |
| Right overline           | `Agent drawer`                                      | Remove                                                |
| Right heading            | `Ask, locate, focus`                                | `Onboarding assistant`                                |
| Right supporting text    | None                                                | `Ask questions and build your onboarding plan.`       |
| Right collapse control   | `Open agent drawer` / `Close agent drawer`          | `Open assistant` / `Close assistant`                  |
| Empty-thread welcome     | Current synthetic welcome message                   | `What would you like help with?`                      |
| Welcome supporting text  | Current synthetic welcome continuation              | `Ask about your role, team, tools, or next steps.`    |
| Composer accessible name | `Message assistant`                                 | `Message the onboarding assistant`                    |
| Composer placeholder     | `Ask for the next action, visual location, or...`   | `Ask about your role, team, tools, or next steps`     |
| Pending status           | `Thinking...`                                       | `Onboarding assistant is thinking...`                 |
| Guide focus note         | `Focused matching guide step.`                      | `Related map step highlighted.`                       |
| Error message            | `The assistant could not answer right now.`         | `I couldn't complete that request. Please try again.` |
| Collapsed evidence       | `<n> source(s) available`                           | `Show 1 source` / `Show <n> sources`                  |
| Knowledge source label   | `Knowledge base`                                    | `Company knowledge`                                   |

Keep the familiar utility actions `Send`, `Hide sources`, and `Sign out`.

## Visual Design Requirements

- Remove the all-caps eyebrow treatment from both panel headings.
- Use one clear heading and, where needed, one short supporting sentence per panel.
- Establish shared CSS custom properties for panel surface, border, text, muted text, accent,
  assistant role, user role, focus ring, radius, and elevation.
- Use restrained borders and shadows. Nested cards must not each receive a separate heavy border or
  elevation.
- Use an 8px spacing rhythm and consistent control heights across plan rows, composer actions, and
  collapse controls.
- Give the active plan a durable indicator that remains visible in high-contrast mode.
- Preserve readable message widths while leaving room for the identity circle.
- Keep source evidence visually subordinate to the answer while retaining clear link focus states.
- Use the repository's existing CSS approach and assistant-ui's unstyled primitives. Do not import a
  registry example's unrelated framework dependencies only to reproduce its appearance.
- Support reduced motion and do not depend on animation to communicate selection, pending state, or
  panel visibility.

## Session and Message State Requirements

The migration must correct session isolation as part of adopting assistant-ui thread navigation:

1. On initial load, index each returned session and its `chatHistory` by session ID.
2. Pass only the active session's messages into `useExternalStoreRuntime`.
3. Switching through `ThreadListItemPrimitive.Trigger` updates the single `activeSessionId`, loads
   that session's guide, and immediately renders that session's transcript.
4. Creating a plan creates and selects the server session, initializes an empty transcript, and
   shows the non-persisted empty-thread welcome.
5. Sending captures the request's session ID before starting. Optimistic and completed messages are
   written only to that session's message collection.
6. When `ChatResponse.session` is present, reconcile the selected session from its canonical
   `chatHistory` rather than retaining a permanently different optimistic user-message ID.
7. If the user switches plans while a request is running, its response updates the originating plan
   and must not appear in the newly selected plan.
8. Track pending state per session so switching plans neither blocks unrelated conversations nor
   loses the pending indicator when returning to the originating plan.
9. Keep draft map proposals and other chat-derived transient state associated with their originating
   session.
10. Deleting a plan removes its message and transient-state entries and selects a deterministic
    remaining plan.

The existing authenticated same-origin APIs remain the persistence boundary. No browser-side OpenAI
or Assistant Cloud calls are introduced.

## Responsive Requirements

- Desktop keeps the plans sidebar on the left and assistant panel on the right as canvas overlays.
- Tablet may reduce both panel widths but must preserve plan titles, message circles, and a usable
  composer.
- At the existing mobile breakpoint, the assistant may remain a bottom sheet and plans may remain a
  top/side sheet, but opening one must not leave the other obscuring the same content area.
- Mobile collapse controls must remain reachable with a minimum 44px pointer target.
- Long plan titles truncate visually while their full value remains available to assistive
  technology and by tooltip.
- Long messages and source URLs wrap without pushing the identity circle off-screen.

## Accessibility Requirements

- Preserve a logical heading hierarchy and landmark labels using the required product copy.
- Keep thread creation, selection, and deletion fully keyboard operable.
- Preserve the thread-list primitive's active and current semantics.
- Move focus to a predictable destination after creating, switching, or deleting a plan.
- Announce the pending state with `aria-live="polite"` without repeatedly announcing animation or
  decorative text.
- Provide visible focus indicators with at least 3:1 contrast against adjacent colors.
- Meet WCAG AA text and UI-component contrast.
- Do not use avatar color, bubble alignment, or position as the only role distinction.
- Decorative icons and role circles must not create duplicate screen-reader announcements.

## Proposed Module Boundaries

```text
apps/web/src/app/workspace/assistant/
  WorkspaceAssistantRuntimeProvider.tsx
  PlansSidebar.tsx
  PlanThreadList.tsx
  PlanThreadListItem.tsx
  AssistantPanel.tsx
  AgentThread.tsx
  AssistantMessage.tsx
  UserMessage.tsx
  MessageRoleCircle.tsx
  AgentComposer.tsx
  AssistantEvidence.tsx
  assistantMessageMapping.ts
```

Responsibilities:

- `WorkspaceAssistantRuntimeProvider.tsx`: owns the assistant-ui runtime adapter and thread-list
  adapter boundary; it receives application state and callbacks rather than owning backend data.
- `PlansSidebar.tsx`: owns the left overlay shell, product heading, account footer, and collapse
  affordance.
- `PlanThreadList.tsx` and `PlanThreadListItem.tsx`: compose assistant-ui thread-list primitives and
  plan actions.
- `AssistantPanel.tsx`: owns the right overlay shell, production heading, and thread composition.
- `AssistantMessage.tsx` and `UserMessage.tsx`: provide role-specific message structure.
- `MessageRoleCircle.tsx`: renders the shared circle geometry with role-specific content and
  accessible behavior.
- `AgentComposer.tsx`, `AssistantEvidence.tsx`, and `assistantMessageMapping.ts`: remain thin domain
  adapters around assistant-ui primitives.

Names may be adjusted during implementation, but the provider must remain above both panels and the
role-specific message split must remain explicit.

## Implementation Strategy

1. Introduce session-keyed message and transient-state selectors in `WorkspaceShell` without changing
   panel markup.
2. Add the workspace-level assistant runtime and external-store thread-list adapter.
3. Extract the left rail and replace its custom navigation with thread-list primitives.
4. Replace the generic right message component with explicit assistant and user message components.
5. Add role circles, the empty-thread state, and the revised production copy.
6. Consolidate panel tokens and responsive styling.
7. Remove superseded drawer-local provider code, fake welcome-message state, and unused session/chat
   presentation paths.
8. Add unit, integration, accessibility, and responsive regression coverage.

## Implementation Checklist

- [x] Add this spec to `specs/README.md` as `012` with `Proposed` status.
- [ ] Confirm and lock compatibility with `@assistant-ui/react` `0.14.26` before implementation.
- [ ] Move `AssistantRuntimeProvider` above the left and right panels.
- [ ] Add the external-store thread-list adapter.
- [ ] Map sessions, titles, update timestamps, and active ID into assistant-ui thread state.
- [ ] Replace the custom left session list with thread-list primitives.
- [ ] Preserve new, switch, delete, last-plan, account, sign-out, and collapse behavior.
- [ ] Hydrate and isolate chat messages per session.
- [ ] Route late responses back to their originating session.
- [ ] Reconcile successful responses from canonical saved session history.
- [ ] Replace the right thread layout with a complete assistant-ui thread composition.
- [ ] Split assistant and user messages into explicit role components.
- [ ] Add assistant and user identity circles with accessible sender labels.
- [ ] Replace the fake welcome message with an empty-thread view.
- [ ] Apply every required copy change in this spec.
- [ ] Remove default-surface model/token diagnostics.
- [ ] Preserve source evidence, draft map proposals, and guide focus integration.
- [ ] Add shared visual tokens and responsive panel styling.
- [ ] Add tests for thread creation, switching, deletion, active state, and keyboard behavior.
- [ ] Add tests proving transcripts and pending responses cannot cross sessions.
- [ ] Add tests for role circles, sender labels, required copy, empty state, and evidence rendering.
- [ ] Add responsive verification for desktop, tablet, and mobile panel states.
- [ ] Verify `npm run lint`.
- [ ] Verify `npm test`.
- [ ] Verify `npm run build`.

## Acceptance Criteria

- Both the left plans sidebar and right assistant panel render under one assistant-ui runtime.
- The left plan list uses assistant-ui thread-list primitives for its supported lifecycle actions.
- The right chat uses assistant-ui thread, message, and composer primitives throughout.
- Selecting a plan updates both its persisted transcript and its guide without showing another
  plan's messages.
- Creating and deleting plans works through the existing authenticated session APIs.
- Late chat responses cannot appear in a different active plan.
- Every user and assistant turn has a circular identity mark plus a non-color role distinction.
- Screen readers can identify each sender without duplicate or decorative announcements.
- All required left/right product titles and principal copy match this spec.
- The panels share a restrained, consistent product visual language and no longer present demo-style
  headings or controls.
- The canvas remains full-screen and does not resize when either panel opens or closes.
- Desktop, tablet, and mobile layouts remain usable and keyboard accessible.
- Source evidence, draft guide maps, guide focus, auth, and non-streaming chat behavior continue to
  work.
- Tests cover the adapter boundary, session isolation, message roles, copy, and key accessibility
  behavior.
- Lint, tests, and production build pass.
