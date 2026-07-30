# Workspace Dashboard and Navigation Refactor Spec

## Status

Proposed on 2026-07-29. This document specifies the refactor only; no application code is changed
as part of writing it.

## Product Interpretation

The attached desktop reference defines the target visual hierarchy: a dark navigation rail, a
light dashboard workspace, an overview column, and an onboarding-assistant column. It is a visual
and information-architecture reference, not a source of production data.

The user's two explicit instructions override anything shown in the reference:

1. The sidebar exposes only **Overview**, **Tasks**, **Resources**, and **Sign out**.
2. The navigation collapse control is an **icon-only button**. It must not render the visible text
   `Collapse` or `Expand`.

The names, dates, progress percentage, notification count, avatar, task copy, stage copy, tool list,
and assistant conversation shown in the reference are illustrative. They must not be hardcoded as
production defaults or presented as real user data.

## Decisions

| Concern                 | Decision                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default destination     | `/workspace` is Overview.                                                                                                                                                                                                                                                                                                                                                                                                             |
| Secondary destinations  | `/workspace/tasks` and `/workspace/resources` are real, deep-linkable destinations. They must not be dead buttons or client-only visual placeholders.                                                                                                                                                                                                                                                                                 |
| Sign out                | Sign out is a button action that uses the existing logout flow and redirects to `/login`; it is not a route.                                                                                                                                                                                                                                                                                                                          |
| Menu inventory          | Overview, Tasks, Resources, and Sign out are the only user-facing sidebar actions. The brand and collapse toggle are separate controls, not menu items.                                                                                                                                                                                                                                                                               |
| Navigation collapse     | A separate icon-only button collapses the sidebar. The reference-derived default is a compact icon rail so the four actions remain available; this inferred behavior must be confirmed during visual review.                                                                                                                                                                                                                          |
| Assistant minimize      | The assistant's minimize control is independent from navigation collapse and has separate state and accessible labelling.                                                                                                                                                                                                                                                                                                             |
| Roadmap action          | `View roadmap` scrolls and moves focus to the Overview roadmap section; it does not introduce another sidebar destination.                                                                                                                                                                                                                                                                                                            |
| Workspace routes        | A shared authenticated workspace shell should persist while route content changes so navigation and assistant state do not reset unnecessarily.                                                                                                                                                                                                                                                                                       |
| Existing plans          | The current plan/session list is removed from the global sidebar, but this frontend refactor does not by itself authorize deleting plan creation, selection, or deletion. Before the legacy rail is retired, preserve those workflows in a content-level control outside primary navigation or obtain explicit approval for a single-journey experience. This is an implementation gate and must never create a fifth sidebar action. |
| Reference-only features | No fake notification count, avatar photo, progress value, date, task, or resource is rendered to imitate the screenshot. A control is shown only when it has real data and behavior.                                                                                                                                                                                                                                                  |

## Current Repository Findings

- The web application uses Next.js App Router, React, TypeScript, plain global CSS, and
  `@assistant-ui/react`. There is no installed general-purpose icon library.
- `/workspace` is currently the only employee workspace route. There are no Tasks or Resources
  pages.
- `apps/web/src/app/workspace/WorkspaceShell.tsx` currently coordinates sessions, guide data, chat,
  and three fixed regions: a plan/session rail, a full-screen canvas, and an assistant drawer.
- The current left rail is not navigation. It contains a text-glyph chevron, branding, `New plan`,
  a session list, account information, and Sign out. When collapsed, all rail content except the
  toggle is hidden.
- `apps/web/src/app/workspace/guide/GuideCanvas.tsx` renders the guide as a pannable canvas. The
  reference instead presents a readable, vertical roadmap in ordinary document flow.
- The current assistant already supplies persisted messages, assistant-ui runtime integration,
  roadmap references, a fixed composer area, typed Markdown, and source links/popovers. Those
  behaviors should be adapted, not reimplemented from scratch.
- The account contract contains a display name and email but no avatar image or notification data.
- `GuideStep` contains title, summary, status, hierarchy, and source IDs. It has no schedule,
  completion timestamp, due date, week label, progress percentage, or reliable task/resource kind.
  The current adapter maps stored nodes only to `ready` or `in-progress`.
- The workspace API has no task-list, task-completion, resource-list, notification, or overview
  endpoint. `KnowledgeSource` data exists, but it is not exposed as a dedicated Resources view.
- `apps/web/src/app/icon.png` is an existing gold checklist/arrow brand mark that matches the
  reference's motif. There is no bundled user-avatar asset.
- Current responsive rules switch at `1180px` and `820px` and are built around fixed-position
  panels. They cannot be carried forward unchanged for a scrolling dashboard.

## Goals

- Replace the current three-panel canvas composition with the reference's dashboard composition.
- Make the workspace's information hierarchy immediately understandable: navigation, page header,
  primary onboarding content, and assistant.
- Provide exactly the requested navigation actions and an accessible icon-only collapse control.
- Present onboarding progress, roadmap stages, upcoming tasks, resources, and assistant messages
  from truthful, typed data with explicit loading, empty, error, and partial-data states.
- Preserve authenticated access, logout, current assistant conversations, safe source links, and
  existing server-side ownership checks.
- Make the shell usable by keyboard, screen reader, touch, high zoom, reduced-motion, desktop,
  tablet, and mobile users.

## Non-Goals

- Copy sample values, employee identity, dates, percentages, notifications, answers, or tool names
  from the reference into production.
- Add My Onboarding, People, Analytics, Settings, plan shortcuts, admin links, or any fifth menu
  action.
- Redesign login or admin screens.
- Change authentication, ownership, RAG, source authorization, or assistant-response contracts
  except where a typed workspace view model is required to display real data.
- Replace assistant-ui, React, Next.js, or the existing source-link safety rules.
- Infer due dates, completion, progress, or notification counts from missing data.
- Treat the screenshot as a single raster background or reproduce it with canvas drawing.
- Fully design future plan-management, notification-center, or profile-menu workflows. The target
  must not ship dead controls for those capabilities.

## Scope Boundary and Prerequisites

This spec defines the desired frontend end state and identifies data needed to render it truthfully.
It does not silently authorize database, server, or product-policy work beyond the requested
frontend refactor.

- Shell, route presentation, navigation, collapse/minimize interactions, responsive behavior,
  accessibility, component structure, and visual styling belong to the frontend delivery.
- New overview, schedule, task-completion, resource-list, avatar, or notification contracts are
  production prerequisites or separately scoped follow-up work. Their inclusion here defines what
  the frontend needs; it does not make them part of a frontend-only change automatically.
- Frontend components may be developed and tested against typed fixtures. In production, a feature
  without a real contract renders the specified loading, empty, unavailable, or read-only state; it
  never substitutes screenshot sample data.
- Removing the legacy plan rail is blocked until plan creation, selection, and deletion are either
  preserved outside primary navigation or explicitly de-scoped by the product owner.

## Target Information Architecture

The authenticated workspace uses one shared shell and three content destinations:

| Destination | URL                    | Required primary content                                                                                              |
| ----------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Overview    | `/workspace`           | Progress, roadmap, and upcoming tasks.                                                                                |
| Tasks       | `/workspace/tasks`     | Complete task list with status and due-date information when available, plus honest loading, empty, and error states. |
| Resources   | `/workspace/resources` | Authorized onboarding resources with safe links, source context, and honest loading, empty, and error states.         |

The shell contains the brand, primary navigation, Sign out, navigation collapse control, greeting,
account identity, and the assistant region. The assistant is a shared secondary column on Overview,
Tasks, and Resources at desktop widths and remains mounted where the routing structure permits it,
so an in-progress conversation is not lost on navigation. A preserved plan-management control, if
required by the implementation gate, is content-level and outside the semantic primary navigation.

On route changes:

- the destination heading becomes the page's `h1`;
- the matching navigation link receives `aria-current="page"`;
- keyboard focus moves to the new page heading after client-side navigation unless the framework's
  normal route behavior already provides an equivalent accessible focus transition;
- the selected destination and current assistant thread remain stable when the navigation rail is
  collapsed or expanded; and
- browser Back and Forward restore the correct destination.

## Desktop Shell and Visual Direction

At desktop widths, the application appears as one inset surface on a very light gray page. The
sidebar spans the surface height and the dashboard scrolls in normal document flow.

Recommended initial layout tokens, subject to visual QA against the supplied reference:

| Token                      | Target                                                       |
| -------------------------- | ------------------------------------------------------------ |
| Viewport inset             | `16px` minimum, increasing to `24px` on wide screens         |
| Shell corner radius        | `18-20px`                                                    |
| Expanded navigation width  | `160px`                                                      |
| Collapsed navigation width | `64px`                                                       |
| Main horizontal padding    | `32-36px`                                                    |
| Dashboard column gap       | `24px`                                                       |
| Assistant width            | `clamp(300px, 31%, 360px)`                                   |
| Card corner radius         | `10-12px`                                                    |
| Control target             | at least `44px` square for icon-only controls                |
| Spacing rhythm             | multiples of `8px`, with `4px` only for tightly related text |

The visual palette should use named tokens rather than repeating literals:

- very light cool gray for the viewport background;
- white for the shell and cards;
- dark navy/indigo for the sidebar;
- a translucent light selected state within the sidebar;
- near-black blue-gray for headings and cool gray for secondary copy;
- gold/orange for progress and the current roadmap stage;
- green for completed status;
- neutral gray for upcoming status;
- lavender/blue for assistant bubbles and actions; and
- the existing high-contrast blue focus ring or an equivalently visible replacement.

The reference's soft borders and shadows should establish grouping without making every region look
elevated. Typography uses the existing system font stack unless a separately approved brand font is
already available; loading a new web font is not required for this refactor.

## Sidebar Requirements

### Structure and Menu Inventory

The sidebar contains, in order:

1. a brand mark at the top;
2. a semantic navigation list containing Overview, Tasks, and Resources;
3. flexible space;
4. a Sign out button in the footer; and
5. the separate icon-only collapse button.

Use the existing application brand mark unless product design supplies an approved replacement.
Provide an appropriately sized variant for the collapsed rail; do not crop or distort the asset.

Sign out visually follows the menu-row pattern but remains a button outside the navigation link
list. The brand is not a link unless it has the defined behavior of returning to Overview.

No element labelled My Onboarding, People, Analytics, Settings, Your plans, New plan, or any other
menu destination may be present in the visible sidebar, accessibility tree, or keyboard order.
Hidden legacy links do not satisfy this requirement.

### Expanded State

- Each destination and Sign out has a leading line icon plus a visible text label.
- Overview is selected in the reference state with a rounded, translucent highlight.
- Hover and focus states cover the entire row, not only the icon or label.
- The collapse button shows a panel-close or left-facing chevron icon and has the accessible name
  `Collapse navigation`.
- The collapse button has no visible `Collapse` text and is not styled as a fifth menu row.

### Collapsed State

The compact icon rail below is an inferred target behavior, not an additional user-requested menu
change. It keeps navigation operable while reclaiming width and must be confirmed in visual review.
If that review instead chooses a fully hidden sidebar, an always-visible, equivalently accessible
open-navigation button must provide the same four actions.

- The rail shrinks to approximately `64px`; the main content reflows into the released width without
  overlap or a page-level horizontal scrollbar.
- Icons for Overview, Tasks, Resources, and Sign out remain visible and operable.
- Text labels are visually hidden without retaining empty inline space. Each icon control preserves
  its full accessible name.
- Hover or keyboard focus reveals a tooltip for each hidden label. Tooltip text does not replace the
  programmatic name.
- The collapse button changes to a panel-open or right-facing chevron icon and the accessible name
  `Expand navigation`.
- The active destination remains visibly distinct without relying only on color.

### Collapse Interaction

- The toggle is a `button` with `aria-expanded`, `aria-controls`, and a dynamic accessible name.
- Activating it by pointer, Enter, or Space changes only the navigation presentation. It does not
  change route, active item, assistant state, or scroll position.
- Focus remains on the toggle after the transition.
- Width and label transitions are subtle and are disabled under `prefers-reduced-motion: reduce`.
- The initial desktop state is expanded. Persistence across a full reload is not required by this
  spec; if implemented, it must use a non-sensitive preference and must not override the mobile
  off-canvas behavior.
- Use a real SVG icon component. Do not use `&lsaquo;`, `&rsaquo;`, hyphens, emoji, or other text
  glyphs as the production collapse icon.

## Header Requirements

- The left side shows `Welcome back, {displayName}` followed by a decorative waving-hand emoji when
  a display name is available, and a neutral `Welcome back` fallback otherwise. Use the account's
  display name as supplied; do not infer a first name by splitting a free-form value.
- Overview uses the supporting text `Here's your onboarding overview`. Tasks and Resources use short
  destination-specific supporting text rather than retaining the Overview subtitle.
- The right side may show account identity using a real avatar image when available or deterministic
  initials otherwise.
- The avatar is a button only if it opens an implemented, accessible account menu. Otherwise it is
  non-interactive imagery with appropriate alternative text.
- Sign out is not duplicated in an avatar menu.
- A notification button and unread badge may be shown only after a real notification contract and
  destination/popover exist. If rendered, its accessible name includes the unread count, such as
  `Notifications, 3 unread`; a fake badge or dead bell is prohibited.

## Overview Requirements

The Overview content uses a two-column grid at desktop widths. The primary column contains progress,
roadmap, and upcoming tasks. The secondary column contains the assistant card and aligns to the top
of the dashboard.

### Onboarding Progress

- The card heading is `Onboarding Progress`.
- A circular progress visualization displays the current percentage and the word `Complete`.
- The adjacent summary contains the `Current Stage` label, stage or week title, short description,
  and a `View roadmap` action with a decorative arrow icon.
- `View roadmap` scrolls to the roadmap heading, moves focus to it without losing the user's place,
  and respects reduced-motion preferences.
- The progress graphic has a textual accessible equivalent that announces the same percentage. Its
  decorative ring is hidden from assistive technology.
- Percentage is clamped defensively to `0-100` for rendering, but the UI must log or surface an
  invalid contract rather than silently treating malformed data as authoritative.
- When progress or stage data is unavailable, show a labelled skeleton while loading, a concise
  error with retry when the request fails, or an honest empty state. Do not substitute `42%` or any
  other sample value.

### Onboarding Roadmap

- The section heading is `Onboarding Roadmap` and has a stable focus target for `View roadmap`.
- Render stages as a semantic ordered list in product-defined order, not as a canvas.
- Each stage includes a numbered marker, title, description, text status badge, and a date line only
  when the relevant start, due, or completion date exists.
- Supported presentation states are `Completed`, `In progress`, `Upcoming`, and `Overdue` when the
  domain supplies overdue state. Status is communicated with text and structure, never by color
  alone.
- The current item has `aria-current="step"`, a gold accent, and stronger card emphasis. Completed
  items use green treatment; future items use neutral treatment.
- A vertical connector visually links markers. The completed/current portion uses the progress
  accent and the remaining portion uses a neutral color. The connector is decorative.
- Stage cards are not interactive by default. If a later detail action is added, use a real link or
  button and preserve the card's semantic content.
- Top-level roadmap stages map from the active journey in stable server order. Nested guide nodes
  are not silently flattened into additional stages; their detail belongs in a defined stage-detail
  interaction or another view.
- Loading, empty, partial, and error states preserve the section heading and do not collapse the
  surrounding layout unexpectedly.

### Upcoming Tasks

- The card heading is `Upcoming Tasks` and the `View all` link navigates to `/workspace/tasks`.
- Show the next product-defined set of incomplete tasks in due-date order. Tasks with no due date
  follow dated tasks in stable server order.
- Each row exposes a task name, status/completion control, and a localized due date when present.
- A checkbox is rendered only when the application can persist the change and report success or
  failure. It has a programmatically associated label, a pending/disabled state, duplicate-submit
  protection, and an announced error. If completion is read-only, render a non-interactive status
  instead of a fake checkbox.
- Completing a task updates Overview progress and the Tasks destination from the same source of
  truth; optimistic updates must roll back on failure.
- Include loading, empty, error, completed, pending, and disabled states. Long labels and dates wrap
  without producing horizontal overflow.

## Tasks Destination

The attachment does not define a separate Tasks-page composition, so this spec deliberately keeps
the destination simple and consistent with the Overview cards:

- use `Tasks` as the `h1` and clearly identify the active navigation item;
- render the complete authorized task collection, not only the Overview subset;
- expose task title, completion/status, and due date when available;
- preserve the same completion mutation and error behavior as Overview;
- distinguish incomplete, completed, overdue, and unavailable states with text;
- provide an honest empty state when no tasks are assigned; and
- do not add unrequested sidebar filters or destinations. In-content filters may be added only when
  backed by a real product need and accessible labels.

## Resources Destination

The Resources destination provides a semantic list or card grid of authorized onboarding sources:

- use `Resources` as the `h1` and clearly identify the active navigation item;
- show a useful title, source type/context, and optional short excerpt;
- make the entire explicit link target keyboard focusable and visually identifiable;
- reuse the safe source-link normalization and authorization rules from spec 018;
- never expose raw `file://`, `db://`, `kb://`, filesystem, database, or unauthorized locators;
- open external HTTP(S) resources in a new tab with `rel="noopener noreferrer"` and an accessible
  new-tab cue; and
- provide loading, empty, inaccessible/revoked, and request-error states without leaking source
  metadata.

## Assistant Card Requirements

The existing assistant behavior is adapted into the reference's contained card rather than
replaced.

- The card header contains a decorative sparkle/assistant icon, `Onboarding Assistant`, and a
  separate icon-only minimize button.
- The minimize button uses `Minimize onboarding assistant` and `Open onboarding assistant` as its
  dynamic accessible names and exposes `aria-expanded` and `aria-controls`.
- Minimizing the assistant reduces it to a compact, reachable assistant control and lets the primary
  column use the available width. It does not collapse the navigation or destroy the chat thread.
- The expanded body includes short introductory copy, a scrollable conversation region,
  product-curated suggested-question buttons, the composer, and the AI accuracy disclaimer.
- Suggested questions are buttons, not decorative chips. Activating one sends its exact label using
  the existing send path or populates the composer according to one consistent, tested behavior.
- User messages align to the end in a light lavender bubble. Assistant messages remain readable in
  bordered light surfaces and retain typed Markdown, source icons/popovers, safe links, and roadmap
  references.
- Only the conversation region scrolls. The header and composer/footer remain visible within the
  card, and the final message is fully reachable above the composer.
- The send control is an icon button with the accessible name `Send message`, is disabled for empty
  or pending input, and prevents duplicate sends.
- New assistant messages are announced politely without causing the entire transcript to be read
  again.
- Preserve empty/welcome, loading, running, response-error, source-error, long-message, minimized,
  and restored states.
- The disclaimer conveys that AI-generated responses may be inaccurate and important information
  should be verified. It is supporting text, not an interactive control.

## Data Contract Requirements

The reference cannot be implemented truthfully as a frontend-only reskin. Before the affected card
or control ships with live behavior, the UI needs a typed source for each value below. These are
dependencies of the production frontend, not automatic authorization to change the backend in the
frontend implementation slice.

| UI data           | Current support                     | Required contract behavior                                                                           |
| ----------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Account greeting  | Display name/email exist            | Supply display name; use a neutral greeting when absent.                                             |
| Avatar            | No avatar URL                       | Supply an authorized image URL or use initials; never use the reference photo.                       |
| Notifications     | No contract                         | Omit the control until unread count and open behavior exist.                                         |
| Progress          | No aggregate                        | Supply a server-authoritative `0-100` value and enough counts/status data to explain it.             |
| Current stage     | Partial guide data                  | Supply stable stage order and an explicit current/completed/upcoming status.                         |
| Stage schedule    | No dates/week labels                | Supply ISO timestamps or an intentional display label; never infer dates from array position.        |
| Tasks             | No workspace task model or mutation | Supply stable IDs, title, status, optional due date, and completion permission/mutation.             |
| Resources         | Source metadata exists              | Supply only authorized, browser-safe display links using spec 018 rules.                             |
| Assistant prompts | No prompt list                      | Use reviewed product-curated prompts or a typed server list; do not copy the sample answer as state. |

All date transport values use ISO timestamps and are formatted at the presentation boundary using
the user's locale and the product's documented time-zone rule. The server or a single shared domain
adapter owns status and progress semantics; individual cards must not calculate conflicting values.

The view model must distinguish loading, absent, unauthorized, stale/partial, and failed data.
Rendering an empty array as a successful `0%` experience when a request actually failed is not
acceptable.

## Responsive Behavior

The reference defines desktop appearance. The following responsive behavior is required so the new
shell remains usable rather than preserving the current fixed-panel breakpoints:

### Desktop: `>= 1024px`

- Use the persistent expanded or collapsed navigation rail.
- Use two dashboard columns while the primary column can remain at least approximately `420px`.
- Keep the assistant between `300px` and `360px` wide and prevent its content from widening the
  grid.

### Tablet: `768-1023px`

- Default to the collapsed icon rail for a first visit, while allowing expansion when space permits.
- Stack the assistant below the primary route content when two readable columns no longer fit.
- Retain all four sidebar actions and the independent assistant minimize control.

### Mobile: `< 768px`

- Replace the persistent rail with an off-canvas navigation drawer opened by an icon button in the
  header. The drawer contains the same three links, Sign out, and no additional destinations.
- The mobile open/close control has a dynamic accessible name, contains focus while the modal drawer
  is open, closes with Escape and backdrop activation, and restores focus to its opener.
- Render cards in one column with at least `16px` content gutters.
- The assistant becomes a full-width section below route content or an accessible mobile drawer;
  it must not cover the composer or trap page scrolling.

At every supported width down to `320px`, and at browser zoom up to `200%`, the page has no
horizontal scrollbar. Navigation labels, roadmap text, dates, task rows, resource links, chat
bubbles, and focus indicators wrap or reflow without clipping.

## Accessibility and Interaction Requirements

- Use semantic `nav`, `main`, `header`, `section`, headings, lists, links, buttons, labels, and form
  controls. Do not reproduce the reference with clickable `div` elements.
- Preserve a logical tab order: primary navigation, sidebar footer actions, page header actions,
  route content, then assistant content.
- Every interactive element has a visible `:focus-visible` state. Text contrast meets WCAG AA
  `4.5:1`; meaningful UI boundaries and focus indicators meet at least `3:1`.
- Current navigation, stage status, progress, task status, and unread state never rely on color or an
  icon alone.
- Icon-only controls have programmatic names and at least `44x44px` targets. Decorative icons use
  `aria-hidden="true"` and do not duplicate announced labels.
- Hover, focus, active, selected, pending, disabled, loading, and error states are visually
  distinguishable.
- Motion used for rail resizing, card transitions, progress, scrolling, or assistant typing honors
  `prefers-reduced-motion`.
- Status and mutation feedback uses restrained live regions. Do not repeatedly announce unchanged
  dashboard content.
- Sidebar/footer actions remain reachable when content grows, at high zoom, and on short viewports.

## Component and Styling Boundaries

Implementation should follow the repository's route -> business component -> common component
dependency direction:

- keep route files responsible for authenticated route composition and metadata;
- split the current `WorkspaceShell` into focused workspace business components such as navigation,
  header, Overview, Tasks, Resources, roadmap, task list, and assistant card;
- keep data loading, mutations, session coordination, and domain-to-view-model mapping in workspace
  business/feature modules rather than common controls;
- reuse the existing common Button, Tooltip, Popover, loader, and error-boundary primitives when
  their contracts fit;
- keep navigation/assistant/task/resource product copy out of common components; and
- move component-owned selectors out of the monolithic workspace stylesheet as practical, while
  retaining only true tokens/reset rules globally.

Because no icon package is installed, prefer a small reviewed set of reusable inline SVG icon
components. Adding a dependency only for these controls is not required. All icons should share
stroke weight, optical size, and `currentColor` behavior.

The current `GuideCanvas` and `PlanThreadList` may be retired from the employee workspace only after
their required data and behavior have been deliberately migrated. Do not leave both the legacy rail
and new navigation mounted or visually hide obsolete interactive controls.

## Expected Implementation Areas

- `apps/web/src/app/workspace/WorkspaceShell.tsx`
- `apps/web/src/app/workspace/WorkspaceExperience.tsx`
- `apps/web/src/app/workspace/page.tsx`
- new authenticated workspace Tasks and Resources route files/layout as needed
- focused workspace business components for navigation, header, Overview, tasks, resources, and
  assistant
- `apps/web/src/app/workspace/assistant/*`
- `apps/web/src/app/workspace/guide/GuideCanvas.tsx` or its replacement roadmap components
- `apps/web/src/features/workspace/api.ts`
- workspace view-model/adapter modules and focused tests
- `packages/shared/src/index.ts` or dedicated shared DTO modules when transport contracts change
- `apps/web/src/app/workspace/workspace.css`, component-owned styles, and global design tokens

## Delivery Sequence

1. Add characterization coverage for current logout, assistant persistence, source links, session
   selection, and authentication before moving the shell.
2. Resolve the plan-management implementation gate without adding a sidebar action. Define the
   truthful frontend overview/task/resource view models and track any new server contracts as
   explicit prerequisites or follow-up scope.
3. Introduce the shared routed shell, exact menu inventory, active-link behavior, Sign out, and the
   icon-only expanded/collapsed navigation states.
4. Build the Overview cards and semantic roadmap against typed loading, success, empty, partial,
   and error fixtures.
5. Move the existing assistant into the contained card while preserving runtime, thread, composer,
   reference, Markdown, and source behavior.
6. Add functional Tasks and Resources destinations, including mutation and safe-link behavior.
7. Implement tablet/mobile behavior, high-zoom/reduced-motion support, and visual refinements.
8. Remove obsolete workspace-only canvas/plan-rail presentation after migrated workflows and tests
   pass; then update generated harness documentation.

## Verification Plan

### Automated

- Test that the expanded sidebar renders exactly Overview, Tasks, Resources, and Sign out in the
  required order.
- Test that removed entries are absent from rendered text, accessibility roles, and tab order.
- Test route matching and `aria-current` for all three destinations, including Back/Forward behavior
  at the appropriate integration layer.
- Test navigation collapse names, `aria-expanded`, icon/label visibility, focus retention, and
  continued access to all four actions.
- Test Sign out calls the existing logout flow once, exposes pending/error handling as appropriate,
  and redirects to `/login` after success.
- Test progress, roadmap, upcoming tasks, full tasks, and resources across loading, populated,
  partial, empty, unauthorized, and error fixtures.
- Test task completion success, duplicate-submit prevention, and rollback/error announcement.
- Test assistant minimize/restore independently from navigation collapse and preserve the current
  assistant message/source regression suite.
- Test that screenshot sample values are not fallback constants in production modules.

### Browser and Visual QA

- Compare the desktop Overview at representative `1024px`, `1280px`, and `1440px` widths with the
  reference for hierarchy, proportions, spacing, card treatment, and color direction.
- Verify expanded and collapsed navigation, every destination, active states, tooltip placement,
  Sign out, assistant minimize/restore, a long roadmap, long task/resource names, and a long chat.
- Verify tablet and mobile transitions, the off-canvas drawer, focus containment/restoration, Escape,
  touch targets, and no background interaction while the mobile drawer is open.
- Verify keyboard-only use, a screen-reader pass, `200%` zoom, forced colors, and reduced motion.
- Verify no horizontal page or assistant overflow and no content hidden behind sticky regions.

### Repository Checks

- `npm run lint`
- `npm test`
- `npm run build`
- `npm run format:check`

## Acceptance Criteria

- `/workspace` visibly follows the reference's sidebar/header/overview/assistant hierarchy without
  using the reference image as a background.
- The sidebar exposes exactly Overview, Tasks, Resources, and Sign out. Removed and legacy entries
  are absent from the DOM, accessibility tree, and keyboard order.
- The navigation collapse control is an icon-only button with no visible `Collapse`/`Expand` text,
  correct dynamic accessible state, and a minimum `44x44px` target.
- Collapsed navigation retains operable, labelled, tooltip-supported icons for all four actions and
  reflows content without overlap under the proposed icon-rail behavior; any approved fully hidden
  alternative preserves access through an always-visible open-navigation button.
- `/workspace/tasks` and `/workspace/resources` are real authenticated destinations, active-link
  state is correct, and browser navigation works.
- Overview displays real or explicitly empty/loading/error progress, roadmap, and task data. It does
  not ship the reference's `42%`, sample dates, or sample task copy as user state.
- The semantic roadmap communicates ordered stages and current/completed/upcoming status without
  relying on color.
- Task completion controls persist changes or are rendered read-only; no fake checkbox is shipped.
- Resources expose only authorized, browser-safe links and do not leak internal locators.
- The assistant appears as a contained card, keeps the composer reachable, retains existing message
  and source behavior, and minimizes independently from the navigation.
- Sign out uses the existing authenticated logout behavior and is not duplicated elsewhere.
- Existing plan creation, selection, and deletion remain reachable outside primary navigation unless
  their removal receives explicit product approval.
- The design remains usable without horizontal scrolling down to `320px`, at `200%` zoom, with
  keyboard and screen reader, and with reduced motion.
- Automated checks and desktop/tablet/mobile visual verification pass.

## Implementation Checklist

- [ ] Define and review overview, stage, task, resource, avatar, and optional notification contracts.
- [ ] Resolve the plan-management gate and preserve approved workflows outside primary navigation.
- [ ] Create the shared authenticated workspace shell and three routes.
- [ ] Render only the requested sidebar actions.
- [ ] Add reviewed SVG icons and the separate icon-only navigation collapse control.
- [ ] Preserve all four actions and tooltips in collapsed navigation.
- [ ] Implement the responsive off-canvas mobile navigation.
- [ ] Build the header without fake notification or avatar data.
- [ ] Build truthful progress, semantic roadmap, and upcoming-task states.
- [ ] Build the full Tasks and authorized Resources destinations.
- [ ] Adapt the assistant into the reference card and preserve existing runtime behavior.
- [ ] Remove obsolete workspace rail/canvas presentation only after behavior migration.
- [ ] Add focused component, model, route, accessibility, and regression tests.
- [ ] Complete browser/visual QA and all repository checks.
