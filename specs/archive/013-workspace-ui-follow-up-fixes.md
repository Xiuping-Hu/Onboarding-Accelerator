# Workspace UI Follow-up Fixes Spec

## Status

Proposed.

## Goal

Resolve the remaining workspace panel and interaction issues after the assistant-ui migration: keep
the chat composer visible, prevent the right drawer from changing width, make session hover styling
match the selected-row shape, replace native delete confirmation, and remove hover underlines from
buttons.

## Current Repo Findings

- The right assistant drawer is fixed at `360px` on desktop, but its message viewport and message
  rows do not fully constrain horizontal overflow from the user and assistant role circles.
- `AgentComposer` is rendered inside `ThreadPrimitive.ViewportFooter`, which is part of the scrolling
  thread viewport. The message list currently relies on bottom padding and a sticky footer, allowing
  messages to overlap or visually cover the composer.
- The session selected state is applied to the full `.plan-thread-item`, while hover background is
  applied only to the smaller `.plan-thread-trigger` inside it.
- Session deletion flows through `ThreadListItemPrimitive.Delete` to `handleDeleteSession`, which
  currently uses `window.confirm` for secondary confirmation.
- The global `a:hover, button:hover` rule adds `text-decoration: underline` to every hovered button.

## Non-Goals

- Change the chat API, assistant runtime, message persistence, or guide-map behavior.
- Redesign the workspace panels or change their desktop dimensions.
- Change session creation, selection, or deletion rules beyond the confirmation experience.
- Add streaming, attachments, voice, or other new assistant capabilities.
- Change ordinary link hover styling unless a link is visually implemented as a button.

## Requirements

### 1. Composer Fixed to the Bottom of the Right Chat Container

- The chat composer must remain anchored to the bottom edge of the expanded right assistant
  container at all times.
- Only the message region should scroll. The drawer heading and composer must not scroll with the
  messages.
- Messages, evidence, loading state, and the scroll-to-latest control must end above the composer and
  must never render behind or cover it.
- The final message must remain fully reachable and readable when scrolled to the bottom.
- The behavior must hold for an empty thread, short threads, long threads, multiline messages, and
  while the assistant is running.
- Prefer an assistant-ui thread/composer layout supported by the installed assistant-ui version. A
  local structural wrapper may be used when needed, but the composer itself must continue using
  assistant-ui primitives.

### 2. Fixed Right Chat Width and No Horizontal Scrollbar

- On desktop, the expanded right drawer must remain at its configured `360px` width regardless of
  message content, role circles, evidence content, or composer content.
- Chat content must shrink within the available drawer width; it must never increase the drawer's
  inline size.
- User and assistant role circles must be included in the message-row width calculation without
  causing horizontal overflow.
- Message rows, bubbles, text parts, evidence blocks, and composer children must use appropriate
  `min-width: 0`, maximum-width, wrapping, and box-sizing constraints.
- Long unbroken text and long source URLs must wrap safely.
- The message viewport must not show a horizontal scrollbar. Do not hide overflow as the only fix if
  doing so clips role circles, message content, evidence, focus indicators, or controls.
- Existing responsive behavior remains: below the mobile breakpoint the panel may use the available
  inset width, but its content must still remain contained without horizontal scrolling.

### 3. Full-row Session Hover Treatment

- Hovering a session must style the full `.plan-thread-item` bounds, matching the size, border
  radius, border placement, background area, and inset accent shape of the selected state.
- The hover state must be a lower-opacity version of the selected state so selection remains
  visually stronger.
- Remove the smaller inner-box hover treatment from `.plan-thread-trigger`.
- The same full-row preview should be visible for keyboard interaction through `:focus-within`.
- The selected state must remain clearly identifiable while hovered and must not be weakened to the
  unselected hover opacity.
- The delete control must remain usable and may retain its destructive hover cue without shrinking
  the session row's hover area.

### 4. Component-based Delete Confirmation

- Deleting a session must require a secondary confirmation rendered inside the application.
- First use a suitable confirmation or dialog component from the installed assistant-ui package if
  one is available and appropriate for this flow.
- If assistant-ui does not provide that component, use a shadcn/ui `AlertDialog` or `Dialog`
  component rather than building a native browser prompt.
- Do not use `window.alert`, `window.confirm`, `window.prompt`, or equivalent browser dialogs.
- The confirmation must identify the session by title, state that deletion cannot be undone, and
  provide clearly labelled Cancel and Delete actions.
- Cancel must preserve the session and current selection. Confirm must call the existing delete flow
  exactly once.
- The destructive action must expose a pending/disabled state while deletion is running, prevent
  duplicate submission, and keep the dialog open with an accessible error message if deletion
  fails.
- The dialog must provide accessible labelling, initial focus, keyboard focus containment, Escape to
  cancel when safe, and focus restoration to the initiating delete button after cancellation.

### 5. No Button Underline on Hover

- Remove the global hover rule that underlines buttons.
- No native button, assistant-ui button primitive, shadcn button, icon button, destructive action,
  or button-styled control may gain a text underline on hover.
- Preserve each button's intended non-text hover feedback, including background, border, color, and
  opacity changes.
- Preserve visible keyboard focus indicators; removing hover underlines must not remove focus
  styling.
- Normal text links may retain their existing link treatment.

## Expected Implementation Areas

- `apps/web/src/app/workspace/assistant/AgentChatDrawer.tsx`
- `apps/web/src/app/workspace/assistant/AgentThread.tsx`
- `apps/web/src/app/workspace/assistant/AgentComposer.tsx`
- `apps/web/src/app/workspace/assistant/PlanThreadList.tsx`
- `apps/web/src/app/workspace/WorkspaceClient.tsx`
- `apps/web/src/app/globals.css`
- A local assistant-ui or shadcn confirmation component and focused component tests as needed.

## Verification Plan

- Add or update component tests for delete cancellation, successful confirmation, duplicate-submit
  prevention, and failure handling without native browser dialogs.
- Add a regression assertion that the composer remains outside the scrolling message region or is
  otherwise structurally pinned to the drawer bottom.
- Add browser-level checks at desktop and mobile widths for drawer width stability, no horizontal
  scrollbar, and no overlap between the last message and composer.
- Verify long unbroken messages and evidence URLs, both role-circle layouts, an empty thread, and a
  long thread.
- Verify session hover, selected-plus-hover, keyboard focus, and delete-button hover states.
- Verify representative buttons across the workspace do not underline on hover and retain visible
  focus styling.
- Run lint, tests, and the production build.

## Implementation Checklist

- [ ] Separate the non-scrolling composer area from the scrolling chat message region.
- [ ] Remove reliance on message-list padding as the primary composer-overlap prevention mechanism.
- [ ] Constrain the right drawer and all chat descendants to the available inline width.
- [ ] Make long text and source evidence wrap without clipping or horizontal scrolling.
- [ ] Apply hover and focus-within styling to the complete session row.
- [ ] Make the session hover visual a lower-opacity form of the selected visual.
- [ ] Remove the smaller trigger-only session hover box.
- [ ] Audit the installed assistant-ui version for a suitable confirmation component.
- [ ] Use assistant-ui confirmation when available; otherwise add a shadcn/ui dialog component.
- [ ] Replace `window.confirm` in the session delete flow.
- [ ] Add accessible cancel, destructive confirm, pending, and error states.
- [ ] Remove hover underlines from every button while preserving other hover and focus feedback.
- [ ] Add focused regression tests for all five issues.
- [ ] Verify desktop and mobile layouts manually.
- [ ] Verify `npm run lint`.
- [ ] Verify `npm test`.
- [ ] Verify `npm run build`.

## Acceptance Criteria

- The right chat composer stays fixed at the bottom of the expanded drawer, and no message or status
  content covers it.
- The last message is fully visible above the composer when the thread is scrolled to the bottom.
- The desktop right drawer remains `360px` wide before and after messages are added.
- Neither role circles nor long message/evidence content cause a horizontal scrollbar or enlarge the
  drawer.
- A session's hover/focus treatment occupies the same full-row box as its selected treatment, with
  lower visual opacity than selection.
- Session deletion uses an assistant-ui component when suitable, or a shadcn/ui dialog fallback, and
  no native alert or confirmation dialog is used.
- Cancelling deletion changes nothing; confirming deletes once; errors remain actionable in the
  application dialog.
- No button displays an underline on hover, and keyboard focus remains clearly visible.
- Existing session switching, chat sending, drawer collapse/expand, and responsive behavior continue
  to work.
