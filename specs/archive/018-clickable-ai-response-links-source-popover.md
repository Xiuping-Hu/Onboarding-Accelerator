# Clickable AI Response Links and Source Popover Spec

## Status

Implemented on 2026-07-28. The locked assistant-ui version exposes headless source primitives but
does not provide a compatible copy-in row that improves this repository's message-scoped source
model, so the implementation uses the existing shadcn-style `Button` and Radix-backed `Popover`
with semantic anchors. Automated checks and desktop/mobile browser verification pass.

## Product Interpretation

This spec resolves the request as follows:

- Remove the current `Show N sources` / `Hide sources` text button and the source list that expands
  inside the message bubble.
- Replace them with one compact source icon at the end of each completed assistant response. The
  icon carries a visible, background-colored badge containing the number of unique clickable
  sources for that response.
- Clicking the icon opens an anchored source popover containing the source links. Although this is
  visually a dropdown, it is a popover containing navigation links rather than an ARIA menu.
- Make supported Markdown links and bare HTTP(S) URLs in the assistant's answer body actual,
  keyboard-focusable links.

The badge number is the total source count for the response, not a claim-level citation index.
Attaching `[1]`, `[2]`, and similar markers to individual sentences is a separate feature because
the current message contract has no structured mapping between answer ranges and source IDs.

## Current Repo Findings

- `apps/web/src/app/workspace/assistant/AssistantEvidence.tsx` owns the current evidence UI. It
  renders a plain text button and conditionally inserts `.evidence-list` in the message flow.
- A source title is currently an anchor only when `source.uri` exists. Sources without `uri` are
  rendered as non-clickable `<strong>` text.
- `apps/web/src/app/workspace/assistant/AgentMessage.tsx` renders `TypedMarkdown` and then
  `AssistantEvidence` after the typing animation completes.
- `apps/web/src/app/workspace/assistant/AgentChatDrawer.tsx` owns `expandedEvidenceIds` and passes
  expansion props through `AgentThread` to `AgentMessage`.
- `apps/web/src/app/workspace/assistant/TypedMarkdown.tsx` uses `react-markdown` with `remark-gfm`.
  Markdown links and GFM autolinks can render as anchors, but there is no explicit anchor renderer,
  target behavior, accessible new-tab cue, or URL-scheme policy.
- `apps/web/src/app/workspace/workspace.css` already makes assistant-message anchors blue and
  underlined. It also owns the current `.message-evidence`, `.evidence-list`, and `.evidence-item`
  styles.
- The app already uses assistant-ui message/thread/runtime primitives through
  `@assistant-ui/react@0.14.26`.
- The repository already has a shadcn-style `Button` with `size="icon"` and `variant="ghost"` at
  `apps/web/src/components/ui/button.tsx`.
- The repository already has a Radix-backed, shadcn-style `Popover` wrapper at
  `apps/web/src/components/common/overlays/Popover.tsx`. `PlanThreadList.tsx` demonstrates its
  composition with the shared `Button`.
- There is no local `DropdownMenu`, `Badge`, or icon component and no direct icon-library
  dependency.
- `apps/web/src/features/workspace/assistantMessageMapping.ts` maps the answer to one assistant-ui
  text part and leaves sources in custom metadata. The current `AgentMessage` instead obtains source
  data from the original `ChatMessage` map.
- `SourceProvenance.uri` is optional. Existing locators include HTTP(S), `kb://`, `file://`, and
  `db://` values, and pgvector results can have no URI.
- `ChatService` returns full sources with the newest response but deliberately strips source URIs
  before persisting chat history. Historical messages therefore cannot currently guarantee
  clickable sources after a reload.
- Retrieved entries can represent chunks rather than distinct user-facing documents, so the raw
  array length is not always the correct resource count.

## Goals

- Make valid links in an AI response visibly and functionally clickable.
- Replace the verbose source disclosure with a compact icon and highlighted source count placed
  immediately after the response body.
- Open source details in an accessible, collision-aware popover anchored to that icon.
- Make every authorized source attached to a response resolve to a real, safe link before this
  feature is considered release-ready.
- Count unique user-facing resources rather than retrieval chunks or duplicate entries.
- Preserve typing, message rendering, guide focus, chat persistence, responsive containment, and
  access-control behavior.
- Prefer the installed assistant-ui and existing shadcn-style components before adding or building
  another interaction primitive.

## Non-Goals

- Add claim-level or sentence-level numbered citations.
- Infer claim-to-source relationships by matching source titles inside generated prose.
- Change the answer provider, add streaming, or redesign the assistant drawer.
- Expose raw file paths, database locators, unauthorized source metadata, or durable signed URLs.
- Persist hydrated source links merely to make historical rows clickable.
- Design or implement full historical answer-text revocation. This UI must respect an unavailable
  answer state supplied by the authorization serializer, but content revocation remains governed by
  `014-rag-grounded-knowledge-map.md`.
- Upgrade assistant-ui solely for this change.
- Add a generic application-wide dropdown-menu system.

## Dependency and Delivery Sequence

This is not only a component swap. The current backend cannot provide browser-safe links for every
source or for historical messages. Completion therefore has two required slices:

1. **Authorized source-link resolution:** define the display-link DTO, resolve internal locators,
   deduplicate resources, and hydrate both live and historical responses without persisting private
   locators or signed links. This may land through the authorization serializer planned by
   `014-rag-grounded-knowledge-map.md` or an equivalent reviewed implementation.
2. **Response UI:** add the safe answer-link renderer and replace the current evidence disclosure
   with the source icon/count trigger and popover.

The UI slice may be developed against fixtures in parallel, but spec 018 is not complete and the
new source control must not be released as "all sources clickable" until the resolver slice proves
that every authorized production source receives a usable href, including after session reload.

## Target Experience

### 1. Clickable Links in the Answer Body

- Explicit Markdown links such as `[Open the handbook](https://example.com/handbook)` render as
  anchors.
- GFM-recognized bare HTTP(S) URLs render as anchors.
- Links remain visually identifiable without hover through the existing link color and underline.
- Answer links are keyboard focusable and have a visible `:focus-visible` state.
- External links open in a new tab to preserve the user's chat context and use
  `rel="noopener noreferrer"`. Append visually hidden text such as `opens in a new tab` to the
  accessible name; a decorative external-link indicator may also be shown.
- Model-generated Markdown accepts only absolute `http://` or `https://` destinations. Root-relative
  app URLs are accepted only from the trusted, server-resolved source DTO, not from generated
  Markdown. Protocol-relative (`//`), path-relative, hash-only, `mailto:`, `javascript:`, `data:`,
  `file:`, `db:`, `kb:`, and all other schemes render as readable plain text without an anchor or
  link styling.
- Do not heuristically convert bracketed source titles such as `[Handbook]` into links. Source
  metadata, not model-generated text matching, remains the source of truth for evidence links.
- During the typewriter animation, incomplete Markdown may temporarily remain plain text. The final
  completed response must render the complete link correctly.

### 2. Source Icon and Count Badge

- A completed assistant response with at least one resolved source renders exactly one source
  trigger immediately after its answer body.
- The trigger contains a recognizable source, link, or document icon and a numeric badge. It does
  not contain the old `Show N sources` / `Hide sources` visible text.
- The number represents the unique, authorized, clickable resources shown in the popover.
- The badge uses a deliberate background color with sufficient contrast. The icon and number remain
  visible so color is not the only source indicator.
- The source trigger is laid out after the content and must never overlap or sit visually behind
  readable answer text.
- The trigger retains at least the existing 34-by-34-pixel icon-button target, works at narrow
  drawer and mobile widths, and cannot create horizontal scrolling.
- A response with no attached sources renders no source trigger and no empty popover. A response
  with an authorized source-resolution failure renders the generic source-error state defined by
  the resolver contract, not a zero count or a deceptively smaller successful list.
- Sources remain hidden until the response typing animation has completed, matching the current
  evidence behavior.
- The trigger's accessible name is `Show N sources for this response` while closed and
  `Hide N sources for this response` while open. It exposes `aria-expanded`; decorative icon and
  badge content do not cause the count to be announced twice.

### 3. Source Popover

- Click, Enter, or Space on the source trigger opens an anchored popover. Repeating the action,
  pressing Escape, or clicking outside closes it.
- Opening moves focus to the first source link. The popover is non-modal: Tab proceeds through the
  remaining source links and then returns to normal document order without a focus trap. Moving
  focus outside closes the popover; Escape closes it and restores focus to the trigger.
- Use ordinary popover and list semantics, not `role="menu"`, because the contents navigate to
  resources rather than execute application commands.
- The popover includes a visible or screen-reader-accessible heading such as `Sources for this
response` and a semantic list of source links. `PopoverContent` is labelled by that heading, and
  the trigger/content relationship exposes matching `aria-controls` in addition to
  `aria-expanded`; verify the attributes emitted by Radix rather than assuming them.
- The popover is portaled and collision-aware, stays inside the viewport, wraps long titles and
  domains, and has a bounded vertical scroll area for many sources.
- The popover must fit within the 360-pixel desktop assistant drawer and the mobile viewport without
  widening the drawer or producing a page-level horizontal scrollbar.
- Switching sessions or unmounting the source message closes its popover. A detached popover must
  not remain after its message leaves the active thread.
- Each item presents a useful title plus source context such as the domain or `Web` / `Company
knowledge`. An excerpt is optional and should be truncated if it makes the popover unwieldy.
- Every rendered item is one clear anchor target. Do not render a title that looks actionable but is
  a `<strong>`, disabled button, or dead link.
- Source links open in a new tab and use `rel="noopener noreferrer"`. Each link includes a
  visible indicator or visually hidden `opens in a new tab` cue, and its accessible name remains
  useful when several sources have similar titles.

## Component Selection

Implementation must use this selection order:

1. Audit the source-part API available in the locked `@assistant-ui/react@0.14.26` version. If the
   compatible assistant-ui `Source` / `Sources` copy-in component can render individual link rows
   without forcing a runtime upgrade or duplicating source state, reuse its source link, icon, and
   title pieces inside the popover.
2. Use the repository's existing `Popover`, `PopoverTrigger`, and `PopoverContent` for the aggregate
   disclosure. The assistant-ui source component does not by itself replace the required one-icon,
   count-badge trigger.
3. Use the existing shadcn-style `Button` as the popover trigger, starting with
   `variant="ghost"` and `size="icon"`, then add only the source-specific layout classes needed for
   the badge.
4. Use the existing `Tooltip` for a hover/focus label only if it composes cleanly with the popover
   trigger and does not create nested interactive elements.
5. If the locked assistant-ui version is not compatible with its current `Sources` component, keep
   the current source metadata adapter and render semantic anchors inside the existing Popover. Do
   not upgrade assistant-ui or import a transitive Radix package for this feature.
6. Reuse an existing icon if one becomes available. Otherwise use a small local SVG with
   `aria-hidden="true"`; do not use an emoji or text glyph as the production source icon. Adding an
   icon package is not required solely for this control.

References:

- [assistant-ui MessagePrimitive](https://www.assistant-ui.com/docs/api-reference/primitives/message)
- [assistant-ui Sources component](https://www.assistant-ui.com/docs/ui/sources)
- [shadcn/ui Popover](https://ui.shadcn.com/docs/components/popover)

## Source Normalization and Count Contract

Before rendering, adapt the message-level source array to a stable display list:

1. Reauthorize and resolve each source for the current user.
2. Derive a browser-safe display `href`; never use an internal retrieval locator directly.
3. Drop unauthorized or revoked sources before any source metadata reaches the rendered popover.
   Treat an authorized source that cannot resolve as a source-resolution error, not an ordinary
   filtered result.
4. Deduplicate user-facing resources using, in order, a stable root source identity such as
   `metadata.rootSourceId`, an authorized canonical href, or the stable source ID. Do not strip
   `#chunk-N` with an unverified string heuristic.
5. Preserve retrieval rank for the first retained occurrence. If several chunks resolve to the same
   resource, use one title/link row and the best available short excerpt.
6. Set the visible and accessible count from the final list length.

The count must always equal the number of links in the popover. It must not count hidden,
unauthorized, unresolved, or duplicate chunks.

## Link Resolution and Authorization Contract

The UI requirement cannot be met safely by wrapping every current `source.uri` in an anchor.
Implementation needs a client-facing source view model conceptually equivalent to:

```ts
interface ResolvedSourceLink {
  id: string;
  title: string;
  excerpt?: string;
  sourceType: 'knowledge_base' | 'web';
  href: string;
}
```

The exact transport type may reuse existing DTOs, but these rules are mandatory:

- `href` is a user-authorized, browser-navigable HTTP(S) URL or a single-slash, same-origin app path
  emitted by the trusted source resolver. Protocol-relative and path-relative values are invalid.
  Raw provenance `uri` remains optional and is not assumed to be a display URL.
- Direct HTTP(S) sources may resolve to their canonical URL after normal authorization checks.
- `kb://`, `db://`, `file://`, and sources with no URI require an authorized same-origin source
  route or another server-side resolver. Filesystem paths and database locators must never be
  exposed in the DOM.
- At runtime, an authorized source that cannot be resolved fails closed: do not expose its private
  locator or render a dead link. Record the resolution failure and surface a generic source-error
  state without source metadata. Do not silently reinterpret it as a smaller successful source set.
- Release acceptance requires every authorized source attached to covered live and historical
  responses to resolve. Omission is permitted only for unauthorized or revoked sources; an
  authorized-but-unresolved source is a test/release failure.
- Persist only stable source references. Resolve links when returning the current response and when
  reading historical messages after authorization; do not persist hydrated or signed URLs as the
  workaround.
- Historical session source metadata must follow the reauthorization and redaction model in
  `014-rag-grounded-knowledge-map.md`. A revoked or inaccessible source must not leak its title,
  href, excerpt, or existence through the count. If that serializer marks the complete historical
  answer unavailable, this UI renders the supplied unavailable state; spec 018 does not infer or
  redact source-dependent spans inside opaque answer text.
- Add a single shared serializer/resolver path for live and historical responses so current-turn and
  reloaded source behavior cannot drift.

## Target Component and State Design

- Keep assistant message layout under `MessagePrimitive.Root` and retain the existing typing and
  guide-highlight behavior.
- Replace or rename `AssistantEvidence` with a focused business component such as
  `AssistantSourcesPopover`.
- Let the source popover own its local open state unless a shared controller is needed to enforce
  one-open-at-a-time behavior.
- Remove `expandedEvidenceIds` and `toggleEvidence` from `AgentChatDrawer` when local Popover state
  makes them unnecessary.
- Remove the evidence expansion prop chain from `AgentThread` and `AgentMessage`.
- Keep source normalization in a pure helper or message adapter so deduplication, safe-link
  filtering, and count parity can be unit tested without mounting Radix.
- Keep source data message-scoped. Opening a source popover must not mutate chat history or
  assistant-ui runtime messages.
- Do not convert all source metadata into assistant-ui source message parts unless the compatibility
  audit proves that doing so simplifies the implementation and preserves the existing domain
  message source of truth.

## Styling Requirements

- Add source-specific trigger, badge, popover, list, and link classes in the workspace assistant
  styles.
- Remove obsolete selectors for the raw evidence toggle and in-flow `.evidence-list` /
  `.evidence-item` UI after the replacement is complete.
- Preserve the existing blue, underlined answer-link treatment and add visible focus styling.
- Give the count badge a high-contrast background and foreground that work in all existing states.
- Provide distinct default, hover, open/pressed, focus-visible, and disabled states for the trigger.
- Constrain popover width to the drawer/viewport, apply `overflow-wrap: anywhere` to long titles and
  URLs, and bound list height with internal vertical scrolling.
- Respect `prefers-reduced-motion` for any new transition.
- Verify 200% zoom and high-contrast/forced-colors behavior; the icon and focus indicator must remain
  understandable without relying on background color alone.

## Expected Implementation Areas

- `apps/web/src/app/workspace/assistant/TypedMarkdown.tsx`
- `apps/web/src/app/workspace/assistant/AssistantEvidence.tsx` or its replacement
- `apps/web/src/app/workspace/assistant/AgentMessage.tsx`
- `apps/web/src/app/workspace/assistant/AgentThread.tsx`
- `apps/web/src/app/workspace/assistant/AgentChatDrawer.tsx`
- `apps/web/src/features/workspace/assistantMessageMapping.ts` and focused helpers/tests
- `apps/web/src/app/workspace/workspace.css`
- `apps/web/src/components/common/overlays/Popover.tsx` only if a domain-neutral accessibility or
  sizing improvement is required
- Shared/client source DTOs and chat/session serializers needed for authorized `href` resolution
- Focused chat-service/session tests for live and historical source hydration

## Verification Plan

### Automated

- Add pure helper tests for stable ordering, unique-resource deduplication, missing links, duplicate
  chunks, and count/list parity.
- Add rendering tests for zero, one, and many resolved sources; icon/count labelling; source anchor
  `href`, `target`, and `rel`; and absence of the old Show/Hide text.
- Add `TypedMarkdown` coverage for an explicit Markdown link, a bare HTTP(S) URL, a relative URL, an
  unsafe URL, a long URL, and final rendering after animated content completes.
- Add service/serializer tests proving that live and reloaded historical messages receive the same
  authorized source-link shape while persisted records remain redacted.
- Add tests covering HTTP(S), missing URI, `kb://`, `file://`, `db://`, revoked sources, and sources
  that resolve to the same user-facing document.
- Add the smallest supported DOM/component or browser interaction harness needed to automate click
  and Enter/Space open, Escape and outside/focus-out close, first-link focus, focus return, Tab order,
  `aria-expanded` / `aria-controls`, source navigation, and session-switch cleanup. Manual-only
  coverage is not sufficient for the core disclosure behavior.
- Keep existing assistant message mapping, typing, guide focus, and chat service tests passing.

### Manual Interaction and Layout

- Verify mouse, keyboard-only, and screen-reader operation.
- Verify the icon/count at desktop drawer width, narrow mobile width, 200% zoom, and with long
  unbroken titles/URLs.
- Verify many-source scrolling remains inside the popover and the assistant drawer does not widen.
- Verify external links open in a new tab without losing the active chat.
- Verify a new response and the same response after reload expose the same authorized links.
- Verify revoked or unresolved historical evidence fails closed according to the authorization
  serializer.
- Verify reduced-motion and forced-colors behavior.
- Run `npm run format:check`, `npm run lint`, `npm test`, and `npm run build`.

## Implementation Todo List

### Component and Data Decisions

- [x] Audit assistant-ui `0.14.26` source-part support and record whether its `Source` pieces can be
      reused without an upgrade.
- [x] Confirm the source icon visual and count-badge color against the existing workspace palette.
- [x] Define the client-facing resolved source-link DTO while keeping provenance locators private.
- [x] Define the authorized resolver behavior for HTTP(S), knowledge-base, database, file, missing,
      and revoked sources.
- [x] Define the unique-resource key and confirm the badge counts resources rather than chunks.

### Link Rendering

- [x] Add an explicit Markdown anchor renderer to `TypedMarkdown`.
- [x] Support Markdown links and GFM bare HTTP(S) autolinks.
- [x] Apply the safe URL allowlist and reject unsafe or internal retrieval schemes in answer HTML.
- [x] Add external-link target, rel, accessible cue, wrapping, and focus-visible behavior.
- [x] Verify complete links render correctly after the typing animation.

### Source Trigger and Popover

- [x] Replace the visible Show/Hide source button with one source icon/count trigger after the
      completed answer body.
- [x] Build the trigger from the existing shadcn-style `Button` and give the count badge a marked
      background color.
- [x] Build the expanded source surface with the existing `Popover` primitives.
- [x] Reuse compatible assistant-ui Source pieces for individual rows when the version audit passes;
      otherwise render semantic anchors directly.
- [x] Add accessible open/closed labelling, expanded state, heading, list structure, keyboard
      behavior, focus restoration, and optional non-conflicting tooltip.
- [x] Make every displayed resource row a real clickable link.
- [x] Add collision, maximum-width, long-text wrapping, maximum-height, and internal-scroll behavior.
- [x] Close the popover when its message or active session unmounts.

### State and Cleanup

- [x] Move disclosure state into the source popover or another minimal owner.
- [x] Remove `expandedEvidenceIds`, `toggleEvidence`, and the expansion prop chain if no longer used.
- [x] Remove the old in-message source list and obsolete evidence CSS.
- [x] Preserve the no-sources and typing-in-progress behavior.

### Authorization and Persistence

- [x] Resolve and authorize display hrefs for the live chat response.
- [x] Reauthorize and hydrate source links when historical messages are read.
- [x] Keep persisted source records redacted and free of hydrated/signed links.
- [x] Resolve internal source locators through an authorized same-origin route or approved resolver.
- [x] Emit a generic error and operational signal for authorized-but-unresolved sources; do not
      silently ship a reduced "successful" source list.
- [x] Ensure unauthorized and revoked sources do not leak through source titles, hrefs, excerpts, or
      badge counts.

### Tests and Release Verification

- [x] Add normalization, deduplication, safe-link, and count-parity unit tests.
- [x] Add source trigger/popover rendering tests for zero, one, many, duplicate, and missing-link
      cases.
- [x] Add Markdown and bare-link rendering tests.
- [x] Add live-versus-reloaded source authorization tests.
- [x] Add a minimal DOM/component or browser harness and automate the required disclosure, keyboard,
      focus, ARIA, link-navigation, and session-switch interactions.
- [x] Verify narrow drawer, mobile, long content, many sources, 200% zoom, reduced motion, and forced
      colors.
- [x] Verify `npm run format:check`.
- [x] Verify `npm run lint`.
- [x] Verify `npm test`.
- [x] Verify `npm run build`.

## Acceptance Criteria

- Valid Markdown links and bare HTTP(S) URLs in completed assistant responses are clickable,
  keyboard focusable, visibly styled, and protected by the defined URL policy.
- A completed assistant response with resolved sources shows one compact source icon with a
  high-contrast count badge immediately after the answer content.
- The old Show/Hide resource button and in-flow expanded evidence list are absent.
- Clicking or keyboard-activating the icon opens one anchored source popover; Escape/outside click
  closes it and focus returns correctly.
- The displayed count exactly matches the number of unique links in the popover.
- Every displayed source is a real, safe, authorized link; there are no dead or visually fake link
  rows.
- Every authorized source attached to a covered response resolves to a clickable href. An
  authorized-but-unresolved source produces a generic error and fails release verification rather
  than silently shrinking the source count.
- Source links work both for a newly returned answer and for the same authorized historical answer
  after reload.
- Duplicate retrieval chunks do not inflate the count or create duplicate resource rows.
- Unauthorized and revoked sources do not leak through source titles, hrefs, excerpts, or badge
  counts. Unsafe destinations render as plain text, and authorized resolution failures expose no
  private locator.
- Answer and source links that open a new tab communicate that behavior to assistive technology.
- Automated interaction coverage verifies pointer and keyboard toggling, first-link focus,
  non-modal Tab behavior, Escape/focus-out close, focus restoration, ARIA state, and session cleanup.
- The trigger and popover are usable with keyboard and assistive technology, remain contained at
  desktop and mobile widths, and do not introduce horizontal scrolling.
- Existing typing, guide highlighting, session switching, chat sending, and assistant drawer
  behavior continue to work.
- Formatting, lint, tests, and production build pass.
