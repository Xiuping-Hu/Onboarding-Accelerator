# Workspace Shell Component Extraction and Utility-First UI Spec

## Status

Implemented on 2026-07-31. The workspace shell is now a thin business-component composition
boundary backed by focused controller hooks. Workspace selector CSS has been replaced by Tailwind
utilities and reviewed source-owned shadcn primitives while preserving the existing assistant-ui
runtime and product behavior.

## Request Interpretation

The "main process page" maps to the authenticated workspace experience, specifically
`apps/web/src/app/workspace/WorkspaceShell.tsx`, rather than
`apps/web/src/app/workspace/page.tsx`. The route page is already a small composition file;
`WorkspaceShell` is the client-side coordinator that has become too complicated.

The request to avoid CSS is interpreted as follows:

- do not write or retain feature-specific selector CSS, CSS Modules, Sass, styled-jsx, or inline
  `style` objects for workspace components;
- style workspace components with Tailwind utility classes, responsive/state variants, and small
  `cva` variant maps;
- use source-owned shadcn/ui components for generic accessible controls;
- continue using assistant-ui for assistant runtime and chat primitives; and
- retain one global Tailwind/theme entry file because Tailwind and shadcn ultimately generate and
  consume CSS. A literal project with no CSS input or output is incompatible with Tailwind and
  shadcn.

The required end state for this refactor is no handwritten workspace component stylesheet and no
`workspace.css` import. Existing login, admin, and common selector styles are migration debt outside
this workspace slice. They must not be copied into new components, and a separate follow-up may
apply the same utility-first policy repo-wide.

## Relationship to Existing Specs

- Spec 016 remains authoritative for dependency direction: route -> business component -> common
  component.
- Spec 020 remains authoritative for workspace product behavior, responsive behavior, accessible
  navigation, truthful data states, and the target visual hierarchy.
- This spec supersedes only the workspace extraction and styling implementation guidance in those
  specs. It does not reopen product decisions or authorize new task, resource, notification,
  authentication, RAG, or database contracts.

## Current Repository Findings

- `apps/web/src/app/workspace/page.tsx` only renders `OverviewDashboard`; it is not the monolith.
- `WorkspaceShell.tsx` is 750 lines and contains 18 shell-level `useState` calls, 8 shell-level
  effects, async session/guide/chat operations, responsive behavior, focus management, route
  metadata, layout JSX, assistant session tabs, a delete dialog adapter, and four inline icon
  components.
- `workspace.css` is 2,036 lines. It mixes navigation, shell, dashboard, roadmap, route states,
  assistant, message formatting, source popovers, responsive rules, forced-colors behavior, and
  animation. Its selectors couple otherwise separate components through ancestor and data
  attributes.
- The root layout imports `workspace.css` globally, so workspace selectors are parsed on login and
  admin routes as well.
- The project does not currently install Tailwind CSS, `@tailwindcss/postcss`, `tw-animate-css`, or
  a top-level PostCSS configuration, and it has no `components.json` shadcn configuration.
- The project already has the `@/*` alias, `cn`, `clsx`, `tailwind-merge`,
  `class-variance-authority`, Radix packages, and a source-owned shadcn-style `Button`. The current
  button still emits semantic classes whose rules live in `common.css`; it is not yet
  utility-styled.
- `@assistant-ui/react@^0.14.26` is already integrated through
  `WorkspaceAssistantRuntimeProvider`, `ThreadPrimitive`, `MessagePrimitive`,
  `ComposerPrimitive`, and thread-list primitives. Replacing this working integration with another
  chat state system would add risk without addressing the shell monolith.
- `WorkspaceShell.test.tsx` characterizes assistant persistence across routes, assistant session
  operations, header/assistant placement, logout failure, and mobile navigation isolation.
- Existing tests intentionally verify that selecting or creating an assistant session does not
  load a different guide. `activeSessionId` and `guideSessionId` are separate concepts and must not
  be collapsed accidentally during extraction.

## Problem

`WorkspaceShell` currently owns four different kinds of responsibility:

1. **Domain orchestration:** session bootstrap, create/select/delete, optimistic messages, chat
   requests, guide loading, source merging, and stale-request protection.
2. **UI state:** desktop rail preference, mobile navigation, assistant minimization, deletion
   confirmation, and pending/error state.
3. **Browser behavior:** media queries, body scroll locking, modal focus containment/restoration,
   route-heading focus, and DOM lookup.
4. **Presentation:** the shell grid, navigation layer, page header, alerts, assistant panel, session
   tabs, dialog copy, and icons.

Moving the same 750 lines into a new file or one large hook would relocate the problem. The
refactor needs explicit state invariants and component boundaries so each module has one reason to
change.

The stylesheet has the same problem in another form. A single selector file creates hidden
dependencies between the shell and its descendants and makes a component extraction incomplete.
The markup and styling migration therefore have to happen together in reviewable vertical slices.

## Goals

- Reduce `WorkspaceShell` to a readable business-composition boundary.
- Extract data/state orchestration from layout and generic UI primitives without changing API
  contracts or user-visible behavior.
- Replace workspace selector CSS with Tailwind utilities and explicit variants.
- Use shadcn/ui source components for generic accessible controls instead of maintaining custom
  button, dialog, tab, tooltip, alert, card, sheet, badge, and skeleton behavior in the shell.
- Keep assistant-ui as the assistant runtime and rendering foundation while preserving the current
  external-store adapter, message mapping, typed Markdown, source popover, roadmap references,
  suggestions, and per-session pending behavior.
- Preserve authentication, logout, route state, responsive behavior, keyboard behavior, focus
  restoration, reduced motion, forced colors, and existing loading/empty/error states.
- Leave route files small and server responsibilities in the App Router layer.

## Non-Goals

- Change workspace product design or the behavior specified by spec 020.
- Add, remove, or reinterpret backend endpoints, shared DTOs, persistence, RAG behavior, or
  authorization.
- Connect task tracking, notifications, avatars, or new resource contracts.
- Replace assistant-ui with Assistant Cloud, the Vercel AI SDK, or another runtime.
- Upgrade assistant-ui as an incidental part of component extraction.
- Run the latest assistant-ui component registry against the locked runtime without a compatibility
  audit.
- Build a publishable design-system package or a generalized page-builder abstraction.
- Convert login, admin, or all common-component CSS in the same implementation slice.
- Preserve internal class names, file paths, or component boundaries that have no public contract.
- Implement this refactor as part of writing the spec.

## Architectural Decisions

### 1. Keep the App Router Thin

`apps/web/src/app/workspace/layout.tsx` continues to own cookies, authentication, redirects, and
serialization of the initial account. Route `page.tsx` files render the corresponding workspace
business entry component. They do not fetch browser APIs or own assistant/session state.

Workspace components should move under `components/business/workspace` as they are touched, in
line with spec 016. A short-lived forwarding export is permitted only for an incremental migration
and must be removed in the final slice.

### 2. Split Controller State from Presentation

`WorkspaceShell` calls one business controller and composes focused components. It must not call
`fetch`, import the workspace API module, implement a media-query listener, contain a focus trap, or
define nested components.

The controller is a composition layer, not a new monolith. It combines focused hooks/modules with
these responsibilities:

| Module                           | Responsibility                                                                                                             |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `workspaceSessionReducer.ts`     | Pure state transitions and invariants for sessions, messages, running IDs, delete state, and bootstrap state.              |
| `useWorkspaceSessions.ts`        | Session bootstrap and create/select/delete commands using the browser API client.                                          |
| `useWorkspaceGuide.ts`           | Guide load lifecycle, latest-request-wins protection, selected/referenced steps, sources, and retry.                       |
| `useWorkspaceChat.ts`            | Optimistic user messages, send completion/failure, per-session running state, source merge rules, and guide focus updates. |
| `useWorkspaceNavigationState.ts` | Persisted rail preference and breakpoint-derived default only. Mobile dialog mechanics belong to shadcn `Sheet`.           |
| `useWorkspaceRouteFocus.ts`      | Route heading focus after a pathname change.                                                                               |
| `useWorkspaceController.ts`      | Composes the focused hooks and exposes a stable view model plus intent-named commands.                                     |

If hook dependencies make the split awkward, use one feature reducer and separate command hooks;
do not duplicate canonical state across hooks. The reducer must remain pure, and effects must live
at integration boundaries.

### 3. Expose Intent, Not State Setters

Presentation components receive values and commands such as `createSession`, `selectSession`,
`requestSessionDeletion`, `confirmSessionDeletion`, `sendMessage`, `referenceStep`,
`toggleNavigation`, `openMobileNavigation`, and `minimizeAssistant`. They do not receive raw React
state setters.

The controller contract should be grouped by concern rather than returned as an unstructured bag:

```ts
interface WorkspaceController {
  route: WorkspaceRouteViewModel;
  status: WorkspaceStatusViewModel;
  navigation: WorkspaceNavigationViewModel;
  assistant: WorkspaceAssistantViewModel;
  commands: WorkspaceCommands;
}
```

This interface is illustrative. The implementation may refine names, but it must keep product
state out of generic shadcn components and avoid a context containing every internal setter.

### 4. Preserve State Invariants Explicitly

The extracted state layer must enforce and test these invariants:

- successful bootstrap leaves at least one session, creating `Chat 1` when the server returns none;
- `activeSessionId` and `guideSessionId`, when present, refer to existing sessions;
- selecting or creating an assistant session changes `activeSessionId` but does not implicitly
  change `guideSessionId` or reload the route guide;
- deleting the guide-owning session selects a remaining guide session; deleting the active session
  selects a remaining active session;
- the only remaining session cannot be deleted;
- at most one session deletion request is submitted at a time;
- chat running state is tracked by session ID, so a response for one session cannot clear another
  session's pending state;
- a late guide response cannot overwrite a newer guide request or a different guide session;
- a chat response updates the session that initiated it, while guide focus and visible source
  merging follow the existing active-session guards;
- navigation collapse, mobile navigation open state, and assistant minimized state remain
  independent; and
- a failed create, delete, guide load, chat send, or logout leaves the rest of the workspace
  mounted and usable.

### 5. Use shadcn as Source-Owned Generic UI

shadcn is not introduced as a runtime component package. The CLI copies reviewed source into
`apps/web/src/components/ui`, and the application owns that source.

Initialize a Radix-compatible shadcn style because the repository already uses Radix primitives.
Do not accept a CLI default that silently mixes a Base UI component set into the existing Radix
component layer. Add only components used by the workspace slice:

- `button` for text and icon actions;
- `alert` for workspace errors and logout status;
- `alert-dialog` for destructive session confirmation;
- `card` for route and assistant surfaces;
- `tabs` for accessible assistant session selection;
- `sheet` for mobile navigation and its focus/scroll/escape behavior;
- `tooltip` for collapsed icon navigation;
- `badge` for roadmap/resource state where appropriate;
- `progress` or a small accessible workspace progress primitive; and
- `skeleton` for loading presentation.

Do not add a shadcn component merely to replace a semantic HTML element. Native `nav`, `main`,
`section`, `header`, `ol`, `ul`, `a`, and headings remain the correct primitives.

### 6. Keep assistant-ui at the Assistant Boundary

The existing `WorkspaceAssistantRuntimeProvider` remains the adapter between application-owned
sessions/messages and assistant-ui. The runtime provider must not absorb workspace navigation,
guide loading, or route content.

The preferred first slice is to retain the installed assistant-ui primitives and replace their
semantic CSS classes with Tailwind utilities. The official registry `Thread` may be used as a
source reference, but it must not be copied wholesale unless an explicit compatibility spike proves
that it works with `@assistant-ui/react@0.14.26` and preserves:

- the external-store runtime and current thread-list adapter;
- custom `AgentMessage` and `UserMessage` mappings;
- typed Markdown behavior;
- source links and source-count popover;
- roadmap reference metadata and composer chip;
- the existing typing animation policy;
- suggestion send behavior;
- scroll-to-bottom behavior;
- session switching, creation, and deletion; and
- current accessibility labels and live-region behavior.

If the current registry requires a newer runtime, assistant-ui upgrade becomes a separate reviewed
change or an explicitly isolated preliminary slice with its own regression tests. Component
extraction must not conceal a runtime migration.

### 7. Tailwind Replaces Workspace Selector CSS

Use the current Tailwind PostCSS integration documented for Next.js. The final setup has a single
global entry containing Tailwind/shadcn imports, theme variables, and minimal document-level base
rules. It must not contain `.workspace-*`, `.assistant-*`, `.roadmap-*`, `.message-*`, or other
feature selectors.

Workspace styling rules:

- express layout, spacing, typography, borders, colors, responsive states, focus states, reduced
  motion, and forced-color adjustments directly with utility classes;
- use `cn` for conditional composition and `cva` for a small, closed variant set;
- use explicit lookup maps for roadmap/message/status variants; never construct Tailwind class
  names dynamically, such as `bg-${status}`;
- use `data-*`, `aria-*`, group, and peer variants when component state affects descendants;
- use theme tokens for repeated brand colors and radii rather than scattering arbitrary values;
- allow arbitrary utilities only for genuinely one-off layout values that cannot be expressed by a
  named token;
- do not use `@apply` to recreate the old selector stylesheet;
- do not add CSS Modules, Sass, styled-components, Emotion, or styled-jsx; and
- remove existing inline styles. The progress ring should use SVG attributes such as
  `pathLength`, `strokeDasharray`, and `strokeDashoffset`, or an accessible shadcn progress
  presentation, instead of a dynamic CSS custom property. Composer resize behavior uses a utility.

The global file may define shadcn semantic tokens and base behavior because those are application
theme inputs, not component styling. Tailwind's compiled CSS output is expected and is not checked
into source control.

## Target Component Shape

The exact filenames may be refined during implementation, but the responsibility boundaries must
remain recognizable:

```text
apps/web/src/
  app/workspace/
    layout.tsx
    page.tsx
    tasks/page.tsx
    resources/page.tsx
  components/
    business/workspace/
      WorkspaceExperience.tsx
      WorkspaceShell.tsx
      WorkspaceFrame.tsx
      WorkspaceHeader.tsx
      WorkspaceStatusAlert.tsx
      WorkspaceRouteContext.tsx
      navigation/
        WorkspaceNavigation.tsx
        WorkspaceMobileNavigation.tsx
      assistant/
        WorkspaceAssistantPanel.tsx
        WorkspaceSessionTabs.tsx
        DeleteWorkspaceSessionDialog.tsx
        WorkspaceAssistantRuntimeProvider.tsx
        AgentThread.tsx
        AgentComposer.tsx
        AgentMessage.tsx
        UserMessage.tsx
        ...
      overview/
        OverviewDashboard.tsx
        ProgressCard.tsx
        RoadmapSection.tsx
        UpcomingTasksCard.tsx
      tasks/
        TasksDashboard.tsx
      resources/
        ResourcesDashboard.tsx
    ui/
      alert.tsx
      alert-dialog.tsx
      badge.tsx
      button.tsx
      card.tsx
      progress.tsx
      sheet.tsx
      skeleton.tsx
      tabs.tsx
      tooltip.tsx
  features/workspace/
    controller/
      useWorkspaceController.ts
      useWorkspaceSessions.ts
      useWorkspaceGuide.ts
      useWorkspaceChat.ts
      useWorkspaceNavigationState.ts
      useWorkspaceRouteFocus.ts
      workspaceSessionReducer.ts
      workspaceController.types.ts
    api.ts
    assistantMessageMapping.ts
    workspaceDashboardModel.ts
    workspaceModel.ts
    workspaceThreadModel.ts
```

This is a target dependency map, not a requirement to create empty files. Small, cohesive
components can remain together. Conversely, `WorkspaceShell` must not keep local components merely
to reduce the number of files.

## Component Contracts

### `WorkspaceShell`

- business composition root for the authenticated client workspace;
- invokes `useWorkspaceController` and maps its view models/commands to child components;
- owns no API calls, reducer cases, media-query listeners, manual focus trap, dialog state, or
  inline icon definitions;
- provides the narrow existing route context needed by Overview, Tasks, and Resources; and
- remains mounted across authenticated workspace route transitions.

### `WorkspaceFrame`

- presentational layout for navigation, route content, and assistant regions;
- receives already prepared React nodes or narrow typed props;
- uses Tailwind responsive grid/flex utilities;
- applies `inert`/`aria-hidden` only when still necessary after shadcn `Sheet` integration; and
- contains no workspace API or session logic.

### `WorkspaceNavigation` and `WorkspaceMobileNavigation`

- share one reviewed destination model and sign-out command;
- use shadcn Button and Tooltip for the desktop rail;
- use shadcn Sheet for mobile open/close, focus containment, Escape, backdrop, body scroll lock,
  and opener focus restoration;
- preserve exact active-link semantics and the independent desktop collapsed preference; and
- never render duplicate operable navigation trees at the same breakpoint.

### `WorkspaceAssistantPanel`

- composes the assistant header, session tabs, assistant-ui thread/composer, and minimize/restore
  controls;
- receives an assistant view model and intent commands;
- uses shadcn Card/Tabs/AlertDialog/Button as generic presentation; and
- contains no direct session/chat HTTP calls.

### `WorkspaceSessionTabs`

- renders session selection using shadcn Tabs or assistant-ui thread-list primitives after the
  compatibility decision;
- keeps create/delete controls reachable without corrupting WAI-ARIA tab keyboard behavior;
- does not mix a delete button inside the tab's interactive element;
- owns only ephemeral delete-dialog selection when that state does not affect domain invariants;
  pending/error/submission state remains controller-owned; and
- supports overflow with native Tailwind utility styling and no custom scrollbar selector.

### Route Dashboards

- consume only the narrow `WorkspaceRouteContext` or explicit route view-model props;
- remain unaware of session deletion, navigation, logout, and assistant runtime setup;
- split only when a child has its own stable data/interaction contract; and
- use shadcn Card/Badge/Skeleton/Progress plus Tailwind utilities without feature CSS.

## Dependency and Configuration Plan

The implementation is expected to add, in `apps/web`, the supported Tailwind PostCSS dependencies
and shadcn configuration. At implementation time, pin compatible versions through the repository's
normal npm workflow and commit the lockfile. Do not install packages while writing or reviewing
this spec.

Expected configuration areas:

- `apps/web/components.json` with the existing `@/*` aliases, a Radix-compatible shadcn style, and
  the style-aware `@assistant-ui` registry URL;
- a PostCSS configuration in the location used by the Next.js workspace;
- Tailwind/shadcn imports and theme variables in `apps/web/src/app/globals.css`;
- source-owned primitives under `apps/web/src/components/ui`; and
- optional `lucide-react` only if required by the reviewed shadcn/assistant-ui source components.
  Use named imports and one consistent icon set; do not retain duplicate inline icons for the same
  action.

The CLI output is a starting point, not trusted generated truth. Review component dependencies,
Radix/Base compatibility, client boundaries, accessibility, class composition, and visual tokens
before committing it.

## Delivery Sequence

### Phase 0: Characterize Current Behavior

- Extend current tests around state invariants before moving logic.
- Cover empty-session bootstrap, stale guide responses, session-specific chat completion, delete
  failure, reference removal, and independent assistant/navigation state.
- Record desktop, tablet, and mobile screenshots for visual comparison.
- Inventory every selector in `workspace.css` by owning component so deletion can be proven.

### Phase 1: Establish Tailwind and shadcn Foundations

- Add Tailwind/PostCSS and reviewed shadcn configuration without redesigning the application.
- Convert only the common primitives required by the first workspace slice to utility classes.
- Add shadcn components one at a time with focused accessibility tests.
- Keep the existing CSS temporarily while both systems coexist, but never style the same element
  through an undocumented mixture of utilities and legacy selectors.

### Phase 2: Extract Pure State and Commands

- Introduce the session reducer and focused controller hooks behind the current DOM.
- Preserve request cancellation/staleness guards and session/guide separation.
- Move pure transformations to feature modules, not React components.
- Keep the current visual output stable and make controller tests pass before JSX extraction.

### Phase 3: Extract Shell Presentation

- Create `WorkspaceFrame`, header, status alert, navigation, assistant panel, session tabs, and
  delete-session adapter.
- Reduce `WorkspaceShell` to controller invocation, provider composition, and child wiring.
- Move business components out of `app` without moving route/server responsibilities down.

### Phase 4: Replace Generic Controls and Browser Mechanics

- Replace custom generic controls with reviewed shadcn Button, Alert, AlertDialog, Card, Tabs,
  Sheet, Tooltip, Badge, Progress, and Skeleton components where their contracts fit.
- Let Sheet own mobile modal mechanics and remove the manual body-scroll/focus-trap effect.
- Keep semantic HTML where shadcn adds no value.

### Phase 5: Migrate assistant-ui Presentation

- Keep the runtime provider and message adapters stable.
- Convert assistant thread, messages, composer, suggestions, references, and sources to utilities.
- Use registry component source only after the locked-version compatibility gate passes.
- Retain focused assistant regression tests throughout the migration.

### Phase 6: Remove Workspace CSS

- Convert the remaining Overview, Tasks, Resources, roadmap, and responsive selectors.
- Replace inline style usage with utilities or SVG attributes.
- Delete `apps/web/src/app/workspace/workspace.css` and remove its root-layout import.
- Verify no workspace feature selectors were moved into `globals.css` or `common.css`.
- Add an automated boundary that prevents workspace components from importing CSS files or adding
  inline `style` props without an explicitly reviewed exception.

### Phase 7: Verify and Clean Up

- Remove temporary forwarding exports, duplicate icons, unused Radix packages, obsolete selectors,
  and dead components only after all consumers migrate.
- Update harness documentation.
- Run the full repository checks and browser matrix.

Each phase must leave the repository lintable, testable, and buildable. Prefer vertical slices over
a single large rewrite.

## Testing and Verification

### Pure State and Controller Tests

- reducer transitions and invariants with no DOM;
- bootstrap with zero, one, and multiple sessions;
- create/select/delete success and failure;
- separate active assistant and guide session behavior;
- latest-guide-request-wins behavior;
- optimistic message append, server replacement, fallback append, and error append;
- per-session running state and late responses after switching sessions;
- source merge and guide-focus guards; and
- retry behavior without full page reload when a guide session exists.

### Component Tests

- exact desktop/mobile navigation inventory, active links, collapse state, and tooltips;
- shadcn Sheet open/close, Escape, focus containment/restoration, and background isolation;
- route-heading focus after route changes;
- logout pending, failure, retry, and persistent route content;
- assistant minimize/restore independently of navigation;
- session tab keyboard navigation, new session, destructive dialog, last-session protection, and
  delete errors;
- assistant empty, running, message, reference, source, suggestion, and composer states;
- loading, empty, partial, unavailable, and error states for route dashboards; and
- semantic roles, accessible names, live regions, disabled states, and no nested interactive
  controls.

Tests should query roles, names, states, and outcomes rather than Tailwind class strings. Pure
variant-map tests may assert the result of `cva` when the variant itself is the contract.

### Browser and Visual QA

- Chrome, Edge, and Firefox at representative desktop, tablet, and mobile widths;
- 320px width and 200% zoom without horizontal page overflow;
- keyboard-only navigation and a screen-reader smoke pass;
- mobile sheet focus/scroll behavior and opener restoration;
- long navigation labels, session names, messages, Markdown, source lists, and roadmap stages;
- reduced motion and forced colors;
- assistant/session state across Overview, Tasks, Resources, Back, and Forward; and
- before/after screenshot comparison confirming that extraction did not become an unapproved
  redesign.

### Repository Checks

- `npm run lint`
- `npm test`
- `npm run build`
- `npm run format:check`
- `git diff --check`
- no import or reference to `workspace.css`
- no workspace feature selectors in any remaining CSS file
- no CSS imports from `components/business/workspace`
- no workspace `style={{ ... }}` props without an approved, documented exception

## Acceptance Criteria

- `WorkspaceShell` is a composition boundary with no direct API imports, async request
  implementation, media-query listener, manual focus trap, nested component definition, or inline
  icon implementation.
- Focused controller modules own session, guide, chat, and browser-state responsibilities, with
  explicit tests for the documented invariants.
- App Router workspace route/layout files remain small and contain only framework composition,
  authentication, and business entry rendering.
- Generic controls use reviewed source-owned shadcn components; product behavior remains in
  workspace business components and feature modules.
- The existing assistant-ui external-store runtime, thread/message/composer behavior, session
  operations, typed Markdown, sources, roadmap references, and accessibility are preserved.
- Selecting or creating an assistant session does not reload or silently replace the displayed
  guide.
- Mobile navigation uses an accessible dialog/sheet primitive rather than shell-owned manual focus
  trapping and body-scroll code.
- `workspace.css` is deleted, its root-layout import is removed, and no workspace selectors are
  relocated into another stylesheet.
- Workspace JSX uses Tailwind utilities and closed `cva`/lookup variants, with no dynamically
  constructed class names and no inline style objects.
- The only retained CSS authoring surface is the global Tailwind/shadcn theme/base entry; it
  contains no workspace component selectors.
- Existing API contracts, routes, authentication, logout, state persistence, truthful data states,
  responsive behavior, focus behavior, and product copy remain unchanged unless a separate spec
  explicitly authorizes a change.
- Lint, tests, production build, formatting, diff checks, and the browser/visual matrix pass.

## Implementation Checklist

- [x] Add missing state-invariant characterization tests.
- [x] Inventory and assign all `workspace.css` selectors to component owners.
- [x] Configure Tailwind PostCSS and a Radix-compatible shadcn setup.
- [x] Add only the reviewed shadcn primitives used by the workspace.
- [x] Extract the workspace reducer and focused controller hooks.
- [x] Extract frame, header, status, navigation, assistant panel, session tabs, and delete dialog.
- [x] Reduce `WorkspaceShell` to controller/provider/component composition.
- [x] Replace manual mobile focus/scroll mechanics with shadcn Sheet.
- [x] Preserve the current assistant-ui runtime and pass the registry compatibility gate.
- [x] Convert assistant and route dashboards to Tailwind utilities.
- [x] Replace dynamic inline styles with utilities or SVG attributes.
- [x] Delete `workspace.css` and remove its global import.
- [x] Add CSS-import/inline-style enforcement for the workspace business domain.
- [x] Remove temporary adapters, duplicate icons, and unused dependencies.
- [x] Update generated harness documentation.
- [x] Complete automated, browser, visual, accessibility, and repository checks.

## External References

Reviewed on 2026-07-31:

- [Tailwind CSS: Install with Next.js](https://tailwindcss.com/docs/installation/framework-guides/nextjs)
- [shadcn/ui: Next.js installation](https://ui.shadcn.com/docs/installation/next)
- [assistant-ui: Installation and shadcn registry](https://www.assistant-ui.com/docs/installation)
- [assistant-ui: Architecture](https://www.assistant-ui.com/docs/architecture)
- [assistant-ui: Thread component](https://www.assistant-ui.com/docs/ui/thread)
