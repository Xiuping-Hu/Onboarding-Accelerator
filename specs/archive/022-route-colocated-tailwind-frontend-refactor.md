# Route-Colocated Tailwind Frontend Refactor Spec

## Status

Implemented on 2026-08-01. The route-colocation, Tailwind migration, shared-component flattening,
and automated verification are complete. Manual visual, browser, and accessibility release checks
remain pending.

## Goal

Refactor the frontend so that:

1. authored component and feature CSS is replaced by Tailwind CSS utilities;
2. generic interaction and presentation use reviewed shadcn/ui source components whenever an
   appropriate primitive exists;
3. assistant surfaces continue to use assistant-ui primitives wherever they provide the runtime or
   interaction contract;
4. complicated business-page components are decomposed along stable responsibility boundaries;
   and
5. every business component lives near the page or layout that owns it, inside a directory named
   `components`.

The refactor must preserve current routes, API contracts, authentication, business behavior,
accessibility, responsive behavior, and approved visual appearance.

## Request Interpretation

"Do not use CSS" means no feature stylesheet, CSS Module, Sass, styled-jsx, CSS-in-JS declaration,
component selector in the global stylesheet, `@apply` abstraction, or inline `style` object.

Tailwind itself requires a CSS input and produces CSS output. The one permitted authored CSS entry
is `apps/web/src/app/globals.css`, limited to:

- Tailwind and animation-plugin imports;
- Tailwind/shadcn theme tokens;
- global light/dark token values;
- a minimal document-level base layer; and
- reusable keyframes that cannot be expressed with an existing Tailwind animation.

It must not contain login, admin, workspace, assistant, common-component, or other feature
selectors. Generated Tailwind output is expected and is not committed.

"Use shadcn or assistant-ui as possible" means prefer an existing primitive when it owns a real
generic behavior or accessibility contract. It does not mean wrapping semantic elements such as
`main`, `section`, `nav`, `header`, `ol`, or `p` in an unnecessary library component.

"Nearby their pages" uses the narrowest-common-route-owner rule:

- a component used by one page belongs in that page segment's `components` directory;
- a component shared by pages below one route layout belongs in that layout segment's
  `components` directory; and
- a component shared across unrelated business routes must be split into route-local business
  wrappers over a domain-neutral primitive rather than moved to a global business folder.

## Relationship to Existing Specs

- Spec 016 remains useful for the dependency principle that business UI may depend on generic UI,
  while generic UI must not depend on business UI. This spec supersedes its requirement to place
  business components under `src/components/business`.
- Spec 019 remains the visual and behavioral baseline for `/login`. This spec changes how that UI
  is styled and organized, not its approved appearance or authentication flow.
- Spec 020 remains the product-behavior baseline for workspace navigation and dashboards.
- Spec 021 remains the state, behavior, and assistant-ui baseline for the workspace. This spec
  supersedes its centralized workspace component location and expands utility-first migration to
  login, admin, and common UI.

When guidance conflicts, this spec is authoritative only for component location, CSS removal,
primitive selection, and the additional component extractions named below.

## Current Repository Findings

### Stack and Existing Foundation

- The web app uses Next.js 15, React 19, Tailwind CSS 4, and the App Router.
- Tailwind is already configured through `apps/web/postcss.config.mjs` and
  `apps/web/src/app/globals.css`.
- `apps/web/components.json` already configures shadcn with the `new-york` style, CSS variables,
  the `@/*` alias, and the assistant-ui registry.
- Source-owned shadcn-style primitives already exist for `Alert`, `AlertDialog`, `Badge`, `Button`,
  `Sheet`, `Skeleton`, and `Tabs`.
- `@assistant-ui/react` is already used for the runtime provider, thread, message, composer, and
  scroll-to-bottom behavior. The existing external-store adapter is business-critical and should
  not be replaced during this refactor.
- `cn`, `class-variance-authority`, `clsx`, and `tailwind-merge` are already available.

### Remaining CSS Debt

The source tree contains 1,372 lines across four authored CSS files:

| File                               | Lines | Current responsibility                                                        |
| ---------------------------------- | ----: | ----------------------------------------------------------------------------- |
| `src/app/login/auth.css`           |   642 | Login scene, artwork, card, Microsoft button, responsive rules, forced colors |
| `src/components/common/common.css` |   378 | Loader, tables, metrics, dialog, button, tooltip, animation                   |
| `src/app/globals.css`              |   193 | Tailwind/theme setup plus document and legacy component selectors             |
| `src/app/admin/admin.css`          |   159 | Admin shell, navigation, panels, controls, forms, alerts                      |

The root layout imports all four files, so login, admin, and common selectors are globally loaded
on every route. `globals.css` also retains legacy component selectors such as `.eyebrow`,
`.primary-button`, and `.ghost-button`.

`common.css` styles some already utility-based shadcn components through old `.ui-button*` rules,
while other common components use `.common-*` selectors. The result is two styling systems and
two primitive ownership patterns.

### Component Location Debt

- Workspace business components are centralized under `src/components/business/workspace`, away
  from their owning `app/workspace` routes.
- Login business components sit directly beside `page.tsx`, but not in a `components` directory.
- Admin business components are split between `app/admin` and descendant route directories, also
  without consistent `components` directories.
- Global `src/components/common` contains domain-neutral components, but the `common` level adds no
  useful ownership information. Those components should move directly under `src/components`,
  grouped by concern. Several also duplicate shadcn behavior by importing Radix directly.
- `workspaceArchitecture.test.ts` hard-codes the old centralized workspace path and must be updated
  with the architecture rather than deleted.
- ESLint currently protects parts of the old two-layer structure but does not enforce the new
  route-colocation rule or restrict direct Radix use to `src/components/ui`.

### Complicated Business Components

Line count is only a signal. A component is a required extraction candidate when it also mixes
multiple responsibilities, contains several independently testable states, or defines stable
child workflows inline.

| Current component             | Lines | Finding                                                                                                                 | Required direction                                                                                                                                       |
| ----------------------------- | ----: | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OverviewDashboard.tsx`       |   333 | Contains progress, roadmap, stage, tasks, skeleton, empty-state, scrolling, and status variants                         | Extract page-local progress, roadmap, stage, and upcoming-task components                                                                                |
| `AdminDashboard.tsx`          |   223 | Mixes account access, four data loads, mutations, export, tabs, shell, and conditional panels                           | Extract controller logic plus local admin shell, header/navigation, access, and status components                                                        |
| `WorkspaceNavigation.tsx`     |   203 | Owns destination rendering, active matching, collapsed tooltips, brand, sign-out, and collapse controls                 | Keep one business entry but extract stable navigation-list and footer/action pieces if needed to keep it cohesive                                        |
| `AssistantSourcesPopover.tsx` |   162 | Mixes source mapping, popover state, focus traversal, trigger, and source-list rendering                                | Use shadcn Popover and extract a source-list presentation component; retain custom focus code only if tests prove the primitive cannot meet the contract |
| `KnowledgeMapEditor.tsx`      |   155 | Mixes three mutations, JSON parsing, editor state, metadata form, draft editor, publish controls, and status            | Extract a controller hook and page-local metadata, draft, actions, and status components                                                                 |
| `WorkspaceSessionTabs.tsx`    |   152 | Mixes tab list, create/delete actions, pending selection, and destructive dialog                                        | Extract `DeleteWorkspaceSessionDialog`; keep session-list semantics in the tab component                                                                 |
| `ActivityPanel.tsx`           |   145 | Mixes metrics, table mapping, export, retention form, destructive form, and async confirmation                          | Extract summary, event table, retention form, and delete workflow components                                                                             |
| `AgentChatDrawer.tsx`         |   139 | Mixes typing-message lifecycle with assistant header, reference controls, thread, suggestions, and composer             | Extract the typing-message hook and stable drawer header/reference presentation                                                                          |
| `LoginScreen.tsx`             |   127 | Defines background art, brand, security content, two inline SVG components, and error/sign-in presentation              | Extract page-local visual sections while preserving the approved DOM semantics and visual baseline                                                       |
| `WorkspaceFrame.tsx`          |   126 | Has a broad prop surface and owns desktop navigation, mobile sheet behavior, grid, main column, and assistant placement | Extract desktop/mobile navigation adapters or narrow typed view models; keep frame presentation-only                                                     |

`ResourcesDashboard` (110 lines) is a secondary candidate for `ResourceCard`, `ResourcesEmptyState`,
and `ResourceSkeleton` after it is moved beside its page. `FeesPanel`, `RatesPanel`, `AuditPanel`,
and `TasksDashboard` are not currently monoliths; they need route colocation and primitive migration,
not decomposition for its own sake.

## Architectural Decisions

### 1. Route-Colocate Business Components

Business components move under the App Router route segment that owns them. Route files remain
thin framework entry points and import their entry component from a sibling or ancestor
`components` directory.

The target dependency direction is:

```text
App Router page/layout
        |
        v
route-local business components
        |
        +----> browser-safe feature/controller modules
        |
        v
shared application components (only when a neutral abstraction adds value)
        |
        v
source-owned shadcn UI primitives
```

Assistant business components also depend on assistant-ui primitives. Neither `src/components/ui`
nor any other shared directory under `src/components` may import route-local business components,
App Router modules, feature clients, server code, or product domain models.

Placement rules:

- `page.tsx` and `layout.tsx` contain framework composition, server authentication/redirects,
  metadata, and serialization only.
- Business JSX is placed under the nearest owning `components` directory.
- Route-local components may import other components from the same route ancestor, but not from an
  unrelated route branch.
- Tests for route-local components are colocated with the component they characterize.
- Non-rendering API clients, reducers, models, formatting, and controllers remain in `features`
  when shared or substantial. They are not moved into `components` just for proximity.
- A tiny route-only hook may be colocated with its owning business component, but it must not be
  presented as another component.
- Do not create barrel files that hide cross-route dependencies. Route files should use explicit
  imports such as `./components/LoginScreen`.

### 2. Flatten and Keep Shared Components Domain-Neutral

`src/components/ui` is the source-owned shadcn layer. It may import Radix, React, utility helpers,
and other UI primitives. It contains no onboarding or admin copy and no business requests.

The `src/components/common` directory is removed. Application-wide components live directly under
`src/components`, grouped by descriptive concerns such as `feedback`, `dialogs`, or `data-display`,
alongside `ui`. Do not replace `common` with an equally generic `shared` directory.

A shared application component must provide a meaningful reusable contract, not merely rename a
shadcn component. Expected survivors include `ErrorBoundary`, `BrandLoader`, and possibly an async
`ConfirmDialog` wrapper. Route-specific JSX never moves here merely because it is reused within one
business route.

The existing components currently under `src/components/common` are handled as follows:

| Current component | Target decision                                                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DataTable`       | Build on shadcn `Table`, or let route-local business tables compose shadcn Table directly if the array-of-cells API no longer adds value             |
| `MetricGrid`      | Prefer route-local metric composition using shadcn `Card`; retain a shared wrapper only if two routes need the same neutral contract after migration |
| `ConfirmDialog`   | Reimplement as a thin wrapper over shadcn `AlertDialog` if its async pending/error contract remains reused                                           |
| `Popover`         | Replace with the shadcn Popover source component                                                                                                     |
| `Tooltip`         | Replace with the shadcn Tooltip source component                                                                                                     |
| `BrandLoader`     | Retain as custom shared UI, styled entirely with utilities and allowed theme animation tokens                                                        |
| `ErrorBoundary`   | Retain; it has behavior rather than styling duplication                                                                                              |

Direct `@radix-ui/*` imports are permitted only inside reviewed `src/components/ui` source. Business
and shared application components consume the shadcn layer.

### 3. Prefer the Appropriate Primitive

Add reviewed shadcn source only when used. The expected set for the full migration is:

- `Alert` for route and operation feedback;
- `AlertDialog` for destructive confirmation;
- `Badge` for status labels;
- `Button` for button and link actions through `asChild`;
- `Card` for login, admin, dashboard, metric, and resource surfaces;
- `Input`, `Label`, `Select`, and `Textarea` for admin forms;
- `Popover` and `Tooltip` for overlay interactions;
- `Separator` where it represents a semantic visual divider;
- `Sheet` for mobile workspace navigation;
- `Skeleton` for loading presentation;
- `Table` for admin tabular data; and
- `Tabs` for admin views and assistant sessions where the WAI-ARIA tab contract is accurate.

Keep native semantic HTML when it is the right abstraction. Use links for navigation, forms for
submission, and SVG for the radial progress visualization. A shadcn component must not absorb
business requests, routing decisions, or domain copy.

### 4. Keep assistant-ui at the Chat Boundary

Retain assistant-ui for `AssistantRuntimeProvider`, external-store runtime mapping,
`ThreadPrimitive`, `MessagePrimitive`, `ComposerPrimitive`, thread messages, composer submission,
and scroll-to-bottom behavior.

Use shadcn around that boundary for buttons, tabs, dialogs, popovers, badges, and shell surfaces.
Do not replace assistant-ui behavior with hand-built chat primitives. Do not upgrade the installed
assistant-ui runtime or import registry components built for another version as an incidental part
of this refactor. Any registry source must pass an explicit compatibility review against the
locked runtime and current behavior tests.

### 5. Tailwind Is the Component Styling API

- Put layout, spacing, colors, typography, responsive rules, interaction states, reduced-motion
  behavior, forced-colors behavior, container queries, and pseudo-element styling in utility
  classes.
- Use `cn` for conditional composition, `cva` for small closed variant sets, and complete lookup
  maps for domain states. Never construct partial class names such as `bg-${status}`.
- Use arbitrary values and arbitrary variants for truly specific requirements such as login
  `clip-path`, compound viewport media queries, or one-off grid tracks. Promote repeated values to
  theme tokens.
- Prefer existing Tailwind animation utilities. If the branded loader needs custom keyframes,
  define only the keyframe/theme token globally and apply it through a utility class.
- Use SVG attributes for calculated visual values such as progress-ring offsets.
- Do not recreate old styles behind `@apply`, a helper returning raw style objects, or a new set of
  semantic selectors.
- Do not mix a legacy selector and Tailwind utilities on the same migrated element. Convert and
  delete one vertical slice at a time.

### 6. Preserve Client and Server Boundaries

- Server route files continue to own cookies, redirects, and server-only services.
- Add `'use client'` only at the narrowest boundary requiring state, effects, event handlers,
  browser APIs, or a client-only library.
- Route-local client business components must not import `src/server`.
- shadcn source components remain server-compatible unless their primitive requires a client
  boundary.
- Pure data mapping and formatting stay outside render components when this makes them directly
  testable.

## Target Directory Shape

The exact set of small support files may be refined, but every business component must remain
under one of the shown `components` directories.

```text
apps/web/src/
  app/
    globals.css
    layout.tsx
    login/
      page.tsx
      components/
        LoginScreen.tsx
        LoginBackground.tsx
        LoginBrand.tsx
        LoginSecurityNotice.tsx
        MicrosoftSignInLink.tsx
    admin/
      page.tsx
      components/
        AdminDashboard.tsx
        AdminAccessState.tsx
        AdminHeader.tsx
        AdminNavigation.tsx
        AdminStatus.tsx
      activity/
        page.tsx
        [eventId]/page.tsx
        components/
          ActivityPanel.tsx
          ActivityMetrics.tsx
          ActivityEventsTable.tsx
          RetentionPolicyForm.tsx
          DeleteActivityDialog.tsx
      ai-fees/
        page.tsx
        components/
          FeesPanel.tsx
        rates/
          page.tsx
          components/
            RatesPanel.tsx
            RateCardForm.tsx
      audit/
        page.tsx
        components/
          AuditPanel.tsx
      knowledge-maps/
        page.tsx
        components/
          KnowledgeMapEditor.tsx
          KnowledgeMapMetadataForm.tsx
          KnowledgeMapDraftEditor.tsx
          KnowledgeMapPublishActions.tsx
    workspace/
      layout.tsx
      page.tsx
      components/
        WorkspaceExperience.tsx
        WorkspaceShell.tsx
        WorkspaceFrame.tsx
        WorkspaceHeader.tsx
        WorkspaceStatusAlert.tsx
        WorkspaceRouteContext.tsx
        navigation/
          WorkspaceNavigation.tsx
          WorkspaceNavigationList.tsx
          WorkspaceNavigationFooter.tsx
        overview/
          OverviewDashboard.tsx
          ProgressCard.tsx
          RoadmapSection.tsx
          RoadmapStageCard.tsx
          UpcomingTasksCard.tsx
        assistant/
          WorkspaceAssistantPanel.tsx
          WorkspaceSessionTabs.tsx
          DeleteWorkspaceSessionDialog.tsx
          WorkspaceAssistantRuntimeProvider.tsx
          AgentChatDrawer.tsx
          AgentThread.tsx
          AgentMessage.tsx
          UserMessage.tsx
          AgentComposer.tsx
          AssistantSourcesPopover.tsx
          AssistantSourceList.tsx
          TypedMarkdown.tsx
      resources/
        page.tsx
        components/
          ResourcesDashboard.tsx
          ResourceCard.tsx
      tasks/
        page.tsx
        components/
          TasksDashboard.tsx
  components/
    ui/                         # reviewed shadcn source only
    feedback/                   # domain-neutral shared compositions
      BrandLoader.tsx
      ErrorBoundary.tsx
    dialogs/
      ConfirmDialog.tsx         # only if the shared async contract remains useful
    data-display/               # only retained neutral wrappers with proven value
      DataTable.tsx             # optional wrapper over shadcn Table
  features/
    admin/
      controller/
        useAdminDashboard.ts
        useKnowledgeMapEditor.ts
      api.ts
      format.ts
    workspace/                  # existing non-visual models/controllers remain here
```

This tree is a responsibility map, not permission to create empty files. A proposed child may stay
with its parent when it has no independent contract. Conversely, the required complicated
components may be split further when tests reveal a clearer boundary.

## Required Component Extractions

### Workspace Overview

`OverviewDashboard` becomes a small composition of `ProgressCard`, `RoadmapSection`, and
`UpcomingTasksCard`. `RoadmapStageCard` owns one stage's accessible state and assistant action.
`focusRoadmap` remains a small tested browser helper or hook. Dashboard model derivation stays in
`features/workspace/workspaceDashboardModel.ts`.

### Workspace Shell and Navigation

Move the existing extracted workspace system as one behavior-preserving route-colocation slice.
Do not reassemble it into `WorkspaceShell` during the move. `WorkspaceFrame` remains
presentation-only. Extract desktop/mobile navigation adapters or narrow view-model props when this
reduces its broad prop surface without duplicating the navigation tree.

`WorkspaceNavigation` retains the destination model and active-route semantics. Split the list and
footer only along their stable contracts; do not create one-file wrappers for each icon.

### Workspace Assistant

Move the full assistant business subtree to `app/workspace/components/assistant` without changing
the runtime adapter. Extract `DeleteWorkspaceSessionDialog` from session tabs and
`AssistantSourceList` from the popover. Move the typing-message lifecycle from `AgentChatDrawer`
to a focused hook so the drawer composes header/reference controls, thread, and composer.

The assistant extraction must preserve:

- separate active assistant and guide session IDs;
- per-session running state;
- message and source mapping;
- typed Markdown and safe links;
- roadmap reference chips and suggestions;
- session create/select/delete behavior;
- source-popover focus behavior; and
- minimize, scroll-to-bottom, keyboard, and live-region behavior.

### Admin

`AdminDashboard` delegates data loading and commands to `useAdminDashboard`. The component composes
access state, header, navigation, status, and active panel. The hook must preserve parallel refresh,
error handling, CSV download/revocation, authorization behavior, and post-mutation refresh.

Each domain panel moves to its own route's `components` directory. `ActivityPanel` splits metrics,
events, retention, and destructive deletion. `KnowledgeMapEditor` splits form sections and delegates
generate/save/publish state to a controller hook. Fees, rates, and audit stay cohesive unless their
primitive migration reveals an independent contract.

This refactor does not change the current admin URL or view model. A separate routing spec is
required to change whether child admin URLs render all dashboard data or only their own resource.

### Login

Move login business JSX into `app/login/components`. Extract the background artwork, brand, and
security notice so the screen reads as composition. Use shadcn `Card`, `Button asChild`, and `Alert`
where they preserve semantics. Keep custom brand artwork as business presentation; shadcn does not
replace bespoke artwork.

The 3:2 desktop scene, cover behavior, narrow/mobile layout, forced-colors behavior, Microsoft
return URL, error alert, single `h1`, copy, and approved visual match remain unchanged.

## Delivery Plan

### Phase 0: Characterize and Inventory

- Capture current login, workspace, and admin screenshots at desktop, tablet, and mobile sizes.
- Preserve current semantic and interaction tests before file moves.
- Inventory every selector in the three removable stylesheets and assign it to a component or an
  intentionally removed legacy rule.
- Record the current import graph so route-colocation changes can be reviewed separately from
  behavior changes.

### Phase 1: Flatten Shared Components and Complete the shadcn Foundation

- Add only the reviewed shadcn components required by the first vertical slice.
- Move retained domain-neutral components from `src/components/common/*` to descriptive concern
  directories directly under `src/components`.
- Replace direct shared-layer Radix wrappers with shadcn Popover, Tooltip, and AlertDialog source.
- Convert shared Button, table, metric, dialog, tooltip, and loader styling to utilities.
- Delete `src/components/common`, including `common.css`, only after all consumers are migrated.

### Phase 2: Login Vertical Slice

- Create `app/login/components` and move/extract the login business components.
- Convert `auth.css` rules to Tailwind utilities, arbitrary values/variants, theme tokens, and
  allowed animation tokens.
- Replace CSS-text assertions with semantic component tests and visual regression coverage.
- Remove `auth.css` and its root-layout import.

### Phase 3: Admin Vertical Slices

- Add the required form, card, table, tab, alert, and dialog primitives.
- Extract the admin controller and complicated page sections.
- Move every admin business component into its nearest route-owned `components` directory.
- Convert one panel at a time to Tailwind utilities and shadcn primitives.
- Remove `admin.css` and its root-layout import after the final admin consumer migrates.

### Phase 4: Workspace Route Colocation

- Move shared workspace/layout UI to `app/workspace/components`.
- Move resources and tasks UI to their own route-segment `components` directories.
- Update imports, colocated tests, the architecture test root, and ESLint rules in the same slice.
- Use forwarding exports only between commits during an incremental implementation; none may
  remain in the final state.

### Phase 5: Workspace Complexity Follow-Up

- Extract the overview, session-dialog, source-list, typing-state, and frame/navigation boundaries
  named in this spec.
- Preserve the existing workspace controller and assistant-ui runtime invariants.
- Replace remaining common overlay imports with shadcn UI imports.

### Phase 6: Global Cleanup and Enforcement

- Reduce `globals.css` to the permitted Tailwind/theme/base responsibilities.
- Remove obsolete component selectors and unused Radix dependencies only after verifying no source
  consumer remains.
- Remove the empty `src/components/business` tree.
- Update lint/architecture tests and generated harness docs.
- Run repository, browser, visual, and accessibility verification.

Each phase must leave the repository lintable, testable, and buildable. File relocation and logic
extraction should be separate commits or clearly separable review slices.

## Testing and Verification

### Architecture Enforcement

Add or update automated checks to prove:

- the only authored CSS file under `apps/web/src` is `app/globals.css`;
- route-local business TSX does not import CSS or use `style={{ ... }}`;
- `globals.css` contains no component/feature selectors or `@apply`;
- no business component remains under `src/components/business`;
- business components are located under an App Router directory named `components`;
- `src/components/ui` and the shared concern directories directly under `src/components` do not
  import route, feature, server, or domain code;
- neither `src/components/common` nor an equivalent generic `src/components/shared` directory
  exists;
- route-local client components do not import server modules;
- direct `@radix-ui/*` imports occur only under `src/components/ui`; and
- assistant-ui imports occur only in the assistant integration and its non-visual message mapping.

Avoid a naive rule that classifies shadcn files as business components or rejects the required
global Tailwind file. The check should scan source files and report the violating path.

### Component and Behavior Tests

- Query roles, accessible names, state, and user-visible outcomes rather than Tailwind class text.
- Preserve login structure, copy, Microsoft URLs, error state, and decorative-image semantics.
- Cover admin access, refresh, load failure, panel selection, export, retention, destructive
  confirmation, rate creation, fee recalculation, and knowledge-map generate/save/publish states.
- Cover workspace navigation, mobile Sheet focus, collapse, logout, route focus, loading/empty/error
  dashboards, and roadmap assistant actions.
- Preserve all session reducer/controller and assistant runtime tests.
- Cover source Popover focus entry/exit, session AlertDialog pending/error, keyboard tab behavior,
  and no nested interactive controls.
- Add focused tests for extracted business components, but do not duplicate controller tests at
  every presentation layer.

### Visual and Accessibility QA

- Compare before/after screenshots for `/login`, `/admin` views, `/admin/knowledge-maps`,
  `/workspace`, `/workspace/tasks`, and `/workspace/resources`.
- Verify Chrome, Edge, and Firefox at representative desktop, tablet, 320px mobile, short viewport,
  200% zoom, reduced motion, and forced colors.
- Verify keyboard-only navigation, focus visibility/restoration, dialog and sheet containment,
  long content, empty/loading/error states, and no unintended page-level horizontal scrolling.

### Repository Checks

- `npm run lint`
- `npm test`
- `npm run build`
- `npm run format:check`
- `git diff --check`
- `rg --files apps/web/src -g '*.css'` returns only `apps/web/src/app/globals.css`
- `rg "@radix-ui/" apps/web/src --glob '*.{ts,tsx}'` returns only reviewed files under
  `src/components/ui`

## Acceptance Criteria

- Neither `apps/web/src/components/business` nor `apps/web/src/components/common` exists.
- Every login, admin, and workspace business component lives under the nearest owning App Router
  segment in a directory named `components`.
- Reusable domain-neutral application components are grouped directly under `src/components` by
  descriptive concern, alongside the shadcn `ui` directory; no generic `common` or `shared` wrapper
  level is introduced.
- Route `page.tsx` and `layout.tsx` files remain thin framework composition boundaries.
- `auth.css`, `admin.css`, and `common.css` are deleted and no replacement feature stylesheet or
  CSS Module is added.
- `globals.css` is the only source stylesheet and contains only Tailwind imports, theme/token
  configuration, minimal global base behavior, and approved reusable keyframes—no component or
  feature selectors and no `@apply`.
- Frontend JSX uses Tailwind utilities, `cn`, and closed `cva`/lookup variants with no dynamically
  constructed Tailwind class fragments or inline style objects.
- Generic UI uses reviewed shadcn source where a suitable primitive exists; direct Radix imports are
  confined to `src/components/ui`.
- Assistant runtime, thread, message, composer, and related interaction contracts continue to use
  assistant-ui and preserve the current external-store integration.
- The complicated components identified in this spec are reduced to focused composition boundaries
  with extracted child components and/or controller hooks as specified.
- Current URLs, APIs, authentication, authorization, product copy, business rules, state
  invariants, responsive behavior, accessibility, and approved visual appearance remain intact.
- Architecture checks, lint, tests, production build, formatting, visual regression, browser, and
  accessibility verification pass.

## Non-Goals

- Implement any part of this refactor while approving this spec.
- Redesign login, admin, workspace, or assistant experiences.
- Change backend routes, DTOs, database schemas, RAG behavior, authentication, or authorization.
- Connect task tracking or introduce new business data.
- Upgrade Next.js, React, Tailwind, shadcn style, Radix, or assistant-ui incidentally.
- Replace assistant-ui with another chat runtime.
- Create a publishable design-system package.
- Abstract small cohesive components merely to satisfy a line-count target.

## Implementation Checklist

- [ ] Capture behavior and visual baselines.
- [x] Inventory and assign all removable CSS selectors.
- [x] Add/review the required shadcn primitives.
- [x] Flatten retained shared components into descriptive `src/components/*` concern directories
      and delete `src/components/common`, including `common.css`.
- [x] Colocate and extract login components; delete `auth.css`.
- [x] Extract the admin controller and page workflows.
- [x] Colocate all admin components; delete `admin.css`.
- [x] Move workspace components to route-owned `components` directories.
- [x] Complete the named workspace complexity extractions.
- [x] Replace direct common/business Radix use with shadcn UI.
- [x] Reduce `globals.css` to the permitted Tailwind/theme/base entry.
- [x] Remove `src/components/business` and temporary forwarding exports.
- [x] Update architecture rules, tests, and harness docs.
- [ ] Complete automated, visual, browser, and accessibility verification.
