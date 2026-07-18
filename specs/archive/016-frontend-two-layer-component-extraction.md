# Frontend Two-Layer Component Extraction Spec

## Status

Implemented. The two component layers, feature-module boundary, import enforcement, focused tests,
and co-located layer styles are in place. Full interactive visual and keyboard QA remains a release
verification activity.

## Goal

Extract the frontend UI into two explicit component layers:

1. **Business components** form the upper component layer. They implement product features and may
   understand onboarding, sessions, guide maps, chat, authentication, administration, and other
   domain concepts.
2. **Common components** form the lower component layer. They provide domain-neutral UI and
   interaction primitives that business components compose.

The result must make ownership and dependency direction obvious, reduce the size of route-local
client files, and allow common behavior to be reused without moving business rules into a generic
UI layer.

## Current Repo Findings

- `apps/web/src/app/workspace/WorkspaceClient.tsx` is approximately 1,000 lines and contains the
  workspace state coordinator, authentication flow, login presentation, guide canvas, canvas
  drawing helpers, error boundary, and page layout.
- The assistant UI is already split into files under `apps/web/src/app/workspace/assistant`, but the
  components use onboarding types, assistant runtime state, plan terminology, and guide-map
  references. They are extracted files, but they remain business components.
- `apps/web/src/app/admin/AdminClient.tsx` is approximately 500 lines and contains the admin page
  coordinator, activity, fee, rate-card, and audit panels plus table and metric presentation.
- `apps/web/src/app/admin/knowledge-maps/KnowledgeMapAdminClient.tsx` combines the knowledge-map
  workflow, API requests, form state, and presentation.
- Next.js route files currently import client implementations from within the `app` tree. There is
  no dedicated `components` root or enforced dependency rule between reusable UI and feature UI.
- `apps/web/src/app/globals.css` is approximately 1,400 lines and contains reset rules, common
  controls, workspace styles, assistant styles, dialogs, authentication, and admin styles in one
  global stylesheet.
- `DeletePlanDialog` wraps a generic Radix interaction but hard-codes plan deletion language. It is
  a business component; a domain-neutral confirmation dialog can sit below it in the common layer.
- `AdminTable` and `MetricGrid` have mostly generic render contracts, but their names and styles are
  coupled to the admin feature. They can become common only after their public contracts and styles
  are made domain-neutral.

## Problem

File-level extraction alone does not define architecture. A component can live in its own file and
still mix API orchestration, domain rules, product copy, layout, and primitive UI. Conversely, a
component used only once may still be a valid common primitive when it owns a difficult, generic
interaction such as an accessible dialog.

Without a classification rule, feature-specific components tend to be moved into a generic
`components` folder simply because they are reused. That makes the shared layer depend on product
models, creates circular dependencies, and hides business behavior behind generic names.

## Architectural Decision

The frontend has exactly two **component** layers. Next.js routes and non-visual feature modules sit
outside those component layers.

```text
Next.js app routes and layouts
              |
              v
Business components                Upper component layer
              |
              v
Common components                  Lower component layer
```

Business components may also depend on browser-safe feature modules and shared domain types. Route
files may depend on server modules for authentication and initial data loading. These are code
boundaries, not additional component layers.

The dependency direction is one-way: **route -> business -> common**. A common component must never
import a business component.

## Layer Definitions

### Business Component Layer

A component is business-level when any of the following is true:

- Its props, copy, or behavior use product vocabulary such as plan, onboarding session, guide step,
  knowledge map, AI fee, activity event, or source evidence.
- It imports product types from `@onboarding/shared`.
- It fetches a feature API, coordinates mutations, maps server errors, or owns feature loading and
  empty states.
- It knows application routes, authorization rules, feature flags, persistence, or assistant
  runtime behavior.
- It combines common controls into a product workflow.
- Reusing it in another screen would still represent the same business capability.

Business components may:

- import common components;
- import other business components within the same domain;
- import feature hooks, browser API clients, models, and domain types;
- own feature state and side effects; and
- provide product-specific copy, analytics names, and accessibility labels.

Business components must not:

- be imported by the common layer;
- import a Next.js `page.tsx`, `layout.tsx`, route handler, or server-only module;
- disguise domain behavior behind generic names such as `Container`, `Manager`, or `BaseWidget`; or
- push API calls or business decisions down into common components.

### Common Component Layer

A component is common-level only when its public contract and implementation are domain-neutral.
Typical examples are buttons, dialogs, form controls, error presentation, tables, status badges,
and generic layout primitives.

Common components may:

- import React, another common component, a domain-neutral utility, and an approved UI primitive
  library such as Radix;
- own interaction state needed to implement the primitive, such as focus management or disclosure
  state;
- accept generic content through `children`, labels, render callbacks, and visual variants; and
- enforce accessibility and consistent visual behavior for every consumer.

Common components must not:

- import from `components/business`, `app`, `server`, feature API clients, or product models in
  `@onboarding/shared`;
- call product endpoints, navigate to product routes, read authentication state, or inspect feature
  flags;
- contain product-specific copy or defaults;
- accept business flags such as `isPlanDeleting` or `isKnowledgeMapPublished`; or
- select behavior by knowing which business screen rendered them.

Common does not mean "used in many places," and business does not mean "used once." Reusable
onboarding chat UI remains business UI. A well-defined accessible confirmation primitive may be
common even before a second consumer exists.

## Classification Test

Apply these questions in order to every extraction candidate:

1. Does it know a product entity, workflow, API, permission, route, or product-specific message?
   If yes, it is a business component.
2. Can its complete public API be described without onboarding or admin terminology? If no, it is a
   business component.
3. Would moving it to common require a large set of feature flags, feature render branches, or
   arbitrary configuration? If yes, keep it in business and extract smaller primitives instead.
4. Does it implement a generic visual or accessibility contract with no upward dependency? If yes,
   it may be common.
5. Is the only reason for extraction that the source file is large? If yes, first extract it within
   the business layer. Generalization is a separate decision.

When classification is uncertain, use the business layer. Promote a smaller primitive to common
only when its domain-neutral contract is clear.

## Target Directory Shape

```text
apps/web/src/
  app/                              # Next.js routes, layouts, metadata, server composition
  components/
    business/
      auth/
        LoginScreen.tsx
      workspace/
        WorkspaceExperience.tsx
        WorkspaceShell.tsx
        guide/
          GuideCanvas.tsx
        assistant/
          AgentChatDrawer.tsx
          AgentComposer.tsx
          AgentMessage.tsx
          AgentThread.tsx
          AssistantEvidence.tsx
          DeletePlanDialog.tsx
          MessageRoleCircle.tsx
          PlanThreadList.tsx
          UserMessage.tsx
          WorkspaceAssistantRuntimeProvider.tsx
      admin/
        AdminDashboard.tsx
        activity/
          ActivityPanel.tsx
        audit/
          AuditPanel.tsx
        fees/
          FeesPanel.tsx
          RatesPanel.tsx
        knowledge-maps/
          KnowledgeMapEditor.tsx
    common/
      actions/
        Button.tsx
      data-display/
        DataTable.tsx
        MetricGrid.tsx
      dialogs/
        ConfirmDialog.tsx
      feedback/
        ErrorBoundary.tsx
        InlineAlert.tsx
  features/                         # Non-component browser feature logic when extracted
    workspace/
      api.ts
      workspaceModel.ts
      workspaceThreadModel.ts
    admin/
      api.ts
```

This tree defines responsibility, not a requirement to create every illustrated common component.
A file is added only when a real extraction uses it. Empty folders, placeholder components, and
speculative abstractions must not be created.

## Naming And Public API Rules

- Name business components after the capability they provide: `GuideCanvas`, `ActivityPanel`, or
  `KnowledgeMapEditor`.
- Name common components after the semantic UI contract: `Button`, `ConfirmDialog`, or `DataTable`.
  Do not add `Common`, `Shared`, `Base`, or `Generic` prefixes.
- Component props must express intent. A common confirmation dialog can accept `title`,
  `description`, `confirmLabel`, `pending`, `error`, and callbacks; it cannot accept a `plan` or
  delete a plan itself.
- Business components adapt domain data to common props. For example, `DeletePlanDialog` supplies
  the plan title and destructive copy to `ConfirmDialog` and owns the delete callback.
- Prefer composition to mode-heavy components. If a common component accumulates business-specific
  variants, split the business wrapper rather than expanding the common API.
- A business domain may expose a small `index.ts` containing only the entry points used by routes.
  Internal feature components should use direct relative imports to keep dependencies visible.
- Imports outside the domain use the `@/components/business/...` or `@/components/common/...`
  aliases. Route files must not reach through a business entry component to its internal children.

## State, Data, And Framework Boundaries

- Next.js route files remain responsible for cookies, redirects, metadata, server-only services,
  and serializing initial props.
- Business entry components own client-side feature orchestration or delegate it to domain hooks
  and browser-safe feature modules.
- Common components receive data and event callbacks through props. They never fetch business data.
- Server-only modules under `src/server` must not be imported by either component layer.
- Components are server-compatible by default. Add `'use client'` at the narrowest boundary that
  requires hooks, event handlers, browser APIs, or a client-only library.
- Client boundaries must not be added to a business barrel solely to make all descendants client
  components. The component that requires the client runtime should declare the boundary.
- Pure transformations, canvas geometry, message mapping, and formatting logic should remain or
  become plain modules when they do not render JSX. They are not components and should not be put
  in either component folder merely to keep files together.

## Styling Boundaries

- Preserve the current visual appearance during extraction. A file move must not double as a
  redesign.
- Reduce `globals.css` incrementally. It should ultimately contain design tokens, reset/base rules,
  document-level styles, and truly global utilities only.
- Common component styles must be domain-neutral and must not rely on ancestors such as
  `.workspace`, `.admin-shell`, or `.assistant-panel`.
- Business styles may use domain terminology and may compose common variants, but they must not
  reach into undocumented common-component internals.
- Prefer co-located CSS modules for newly extracted components. Existing global selectors may move
  in the same vertical slice only when visual parity is covered by tests or manual verification.
- Common interaction states must include disabled, pending, error, hover, focus-visible, and reduced
  motion behavior where applicable. Product-specific state remains in business styles.
- Design tokens may be shared; feature layout selectors may not.

## Initial Classification Of Existing Components

| Current area or component                                | Target classification                          | Reason or extraction note                                                                                                                 |
| -------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `WorkspaceClient`                                        | Business, then decomposed                      | Owns authentication, sessions, guide data, messages, API errors, and the product layout.                                                  |
| `LoginScreen`                                            | Business / auth                                | Contains organization sign-in copy and the Microsoft authentication route.                                                                |
| `GuideCanvas` and drawing helpers                        | Business / workspace guide                     | Render `GuideGraph`, guide status, selection, and onboarding semantics. Move pure geometry helpers to a plain feature module when useful. |
| `WorkspaceShell`                                         | Business / workspace                           | Coordinates all workspace product state and workflows.                                                                                    |
| All current assistant files                              | Business / workspace assistant                 | Depend on assistant runtime and/or onboarding chat, plan, evidence, and guide concepts.                                                   |
| `DeletePlanDialog`                                       | Business wrapper over common                   | Plan-specific copy and callbacks stay in business; focus-safe confirmation behavior belongs in `ConfirmDialog`.                           |
| `AdminClient`                                            | Business, then decomposed                      | Owns admin authorization, data loading, mutations, export, navigation, and feature panels.                                                |
| `ActivityPanel`, `FeesPanel`, `RatesPanel`, `AuditPanel` | Business / admin                               | Each represents a product workflow or domain record type.                                                                                 |
| `AdminTable`                                             | Common candidate                               | Promote only with a neutral table contract, neutral style names, stable row identity, empty state, and accessible semantics.              |
| `MetricGrid`                                             | Common candidate                               | Promote only after removing admin naming and accepting neutral metric content.                                                            |
| `KnowledgeMapAdminClient`                                | Business / admin knowledge maps                | Owns draft generation, review, save, and publish workflows.                                                                               |
| Current `AppErrorBoundary`                               | Business initially; common primitive candidate | Its fallback is onboarding-specific. A common boundary must receive neutral fallback content or a render callback.                        |

No current assistant component should be moved to the common layer merely because assistant-ui
provides reusable primitives underneath it.

## Dependency Enforcement

The implementation must add automated import-boundary enforcement after the target folders exist.
An ESLint rule or equivalent architecture check must enforce at least:

- files under `components/common` cannot import from `components/business`, `app`, `server`, feature
  API modules, or `@onboarding/shared`;
- files under `components/business` cannot import from `app` route modules or `server`;
- business-to-business imports stay inside the same top-level domain unless an explicit architecture
  decision creates a shared business capability; and
- route files use exported business entry points instead of internal business children.

The check must run as part of the existing `npm run lint` command. Type-only imports are still
dependencies and do not bypass the rule.

## Extraction Plan

### Phase 0: Characterize And Freeze Behavior

- Record the current route behavior, responsive layouts, primary user workflows, keyboard behavior,
  and assistant runtime integration.
- Add focused characterization tests before moving high-risk stateful components.
- Keep API payloads, domain types, copy, CSS appearance, and route URLs unchanged.

### Phase 1: Establish The Lower Layer

- Create only the common primitives needed by the first business extraction.
- Start with the accessible confirmation contract because `DeletePlanDialog` already provides a
  concrete business wrapper and Radix implementation.
- Promote table, metrics, button, alert, or error-boundary primitives only when their neutral props
  and styles satisfy the common-layer rules.
- Add common-component tests and the initial import-boundary rule.

### Phase 2: Extract The Workspace Business Layer

- Move the existing assistant components as one workspace business subdomain without changing their
  behavior.
- Split `WorkspaceClient` into a business entry/coordinator, shell sections, auth presentation, and
  guide canvas.
- Keep session, guide, and message orchestration in the business entry or focused feature hooks.
- Move non-rendering workspace modules out of `app` only when needed to prevent lower layers from
  importing route modules.
- Preserve the current assistant runtime provider, session switching, deletion, guide selection,
  canvas gestures, and login behavior.

### Phase 3: Extract The Admin And Auth Business Layers

- Split `AdminClient` by admin capability while retaining one dashboard coordinator.
- Extract knowledge-map editing as an admin business component.
- Reuse proven common table, metrics, form, alert, and confirmation primitives; do not combine the
  activity, fee, audit, and knowledge-map workflows into configurable common components.
- Keep the route files limited to framework concerns and business entry composition.

### Phase 4: Complete Style And Boundary Cleanup

- Move component-owned selectors from `globals.css` into their owning component or domain.
- Enable the complete import-boundary rule for both layers.
- Remove obsolete route-local component files, compatibility barrels, and global selectors only
  after all imports and tests have migrated.
- Update generated harness documentation after the code structure is final.

Each phase should be delivered in reviewable vertical slices. The repository must build and test
between slices; there must not be a big-bang file move followed by later behavior repair.

## Testing And Verification

### Common Components

- Test the public contract using domain-neutral fixtures.
- Cover keyboard use, focus movement/restoration, semantic roles and labels, disabled and pending
  states, error announcement, and callback cardinality where relevant.
- Test visual variants without asserting workspace or admin class names.
- A common component test must not import business fixtures or product types.

### Business Components

- Test product copy, domain-to-common prop adaptation, loading, empty, success, failure, permission,
  and mutation states.
- Mock at browser API client or runtime boundaries, not inside common primitives.
- Retain focused tests for assistant message mapping, session thread behavior, and workspace model
  calculations.
- Add coverage for admin workflows and knowledge-map generate/save/publish sequencing as those
  components are extracted.

### Integration And Manual Checks

- Verify `/login`, `/workspace`, all `/admin` views, and `/admin/knowledge-maps`.
- Verify authentication redirect and initial-account hydration remain server-controlled.
- Verify session create/select/delete, chat send, evidence disclosure, guide selection, canvas pan
  and zoom, drawer collapse, and responsive layout.
- Verify keyboard navigation, dialog focus restoration, error announcements, long content wrapping,
  and mobile behavior.
- Run `npm run lint`, `npm test`, `npm run build`, and `npm run format:check` after each completed
  vertical slice.

## Non-Goals

- Change any product behavior, API contract, domain model, database schema, route URL, or
  authentication flow.
- Redesign the workspace, assistant, login, or admin interface.
- Replace assistant-ui, Radix, React, or Next.js.
- Create a publishable cross-application design-system package.
- Move server services into frontend component folders.
- Generalize every repeated JSX fragment or enforce one component per file.
- Convert all global CSS in the first extraction pull request.
- Implement the component extraction as part of writing this specification.

## Acceptance Criteria

- All rendered application components outside Next.js route/layout files are classified under
  either `components/business` or `components/common`.
- Route and layout files contain only framework concerns, server composition, and business entry
  rendering; they do not contain substantial feature UI.
- Common components have domain-neutral props, copy, tests, and styles and import no product model,
  feature API, route, server, or business component.
- Business components own all onboarding, session, assistant, knowledge-map, authentication, and
  admin terminology and behavior.
- Dependency direction is route -> business -> common, with automated lint enforcement.
- The workspace and admin monoliths are decomposed by product responsibility without replacing
  them with mode-heavy generic components.
- The assistant component set remains in the workspace business domain.
- Product API calls and mutations occur only in business components or browser-safe feature modules,
  never in common components.
- Component-owned styles no longer depend on unrelated global feature selectors, and remaining
  global CSS is limited to documented global concerns.
- Existing routes, visual behavior, accessibility, API contracts, and workflows remain unchanged.
- Lint, tests, production build, formatting checks, and the manual workflow checks pass.

## Implementation Checklist

- [x] Add characterization coverage for high-risk workspace and admin workflows.
- [x] Create `components/business` and `components/common` only when the first components move.
- [x] Extract a domain-neutral confirmation primitive and retain `DeletePlanDialog` as its business
      adapter.
- [x] Move the assistant files into the workspace business domain.
- [x] Decompose `WorkspaceClient` into coordinator, shell, auth, and guide responsibilities.
- [x] Decompose `AdminClient` into its business panels and dashboard coordinator.
- [x] Extract the knowledge-map editor into the admin business domain.
- [x] Promote table, metrics, button, alert, and error-boundary UI only after each satisfies the
      common classification test.
- [x] Keep pure transformations and geometry in non-component modules.
- [x] Move component styles incrementally while preserving appearance.
- [x] Add and enable import-boundary enforcement in lint.
- [x] Remove compatibility files and unused global selectors after migration.
- [x] Update harness documentation.
- [ ] Run all automated and manual verification.
