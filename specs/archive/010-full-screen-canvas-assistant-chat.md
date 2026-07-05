# Full-Screen Canvas and assistant-ui Agent Chat Spec

## Status

Complete.

## Repo Findings

- The workspace shell lives in `apps/web/src/app/workspace/WorkspaceClient.tsx`.
- The current layout uses a three-column CSS grid: left session rail, central workspace canvas, and
  right assistant panel.
- `GuideCanvas` already renders the onboarding map with a custom `<canvas>`, pan, wheel zoom, hit
  targets, and resize handling.
- The right drawer is currently hand-built and includes non-chat UI: current focus card, usage
  summary, activity log, custom message list, source evidence toggles, and custom composer form.
- `apps/web/package.json` does not currently include `@assistant-ui/react`.
- The current chat API is non-streaming: `POST /api/sessions/:sessionId/chat` returns a complete
  `ChatResponse`.

## Assumption

The repo does not currently render an actual `<img>` inside the right drawer. This spec interprets
"remove the image part" as removing the current non-chat visual/context area in the drawer,
including the current focus card and any future image or visual preview panel.

## References

- [assistant-ui External Store Runtime](https://www.assistant-ui.com/docs/runtimes/custom/external-store)
- [assistant-ui AssistantRuntimeProvider](https://www.assistant-ui.com/docs/api-reference/context-providers/assistant-runtime-provider)
- [assistant-ui Thread Component](https://www.assistant-ui.com/docs/ui/thread)
- [assistant-ui Headless Chat Primitives](https://www.assistant-ui.com/docs/primitives)

## Goal

Make the guide canvas occupy the full viewport while the right agent area becomes a chat-only
assistant-ui drawer over the canvas.

## Non-Goals

- Change guide generation, retrieval, auth, session storage, or chat orchestration.
- Add streaming chat in this pass.
- Add assistant-ui Cloud.
- Add image previews, screenshots, file attachments, voice, or tool rendering.
- Expose operational logs or AI fee information in the client workspace.

## Target Experience

- The onboarding canvas fills the entire browser viewport.
- Side UI appears as overlays above the canvas instead of reducing the canvas layout area.
- Opening the right agent drawer does not resize or squeeze the canvas.
- The right drawer contains only the agent chat experience and essential chat controls.
- The drawer does not show the current focus card, activity log, usage summary, or any image/visual
  preview area.
- The assistant chat is rendered with assistant-ui components or primitives, not the current custom
  message list and textarea form.

## Layout Requirements

- Replace the three-column `.app-shell` grid with a canvas-first shell.
- `GuideCanvas` should render in a full-screen layer with `width: 100vw`, `height: 100vh`, and stable
  resize behavior.
- Keep loading and error states as overlays that do not collapse the canvas area.
- Move breadcrumbs and canvas controls into overlay regions on top of the canvas.
- Keep the right drawer positioned as an overlay, anchored to the right on desktop.
- On mobile, the right agent chat may become a bottom sheet or full-height overlay, but the canvas
  must still remain the base full-screen layer.
- The left session rail may remain an overlay drawer or compact rail, but it must not reserve
  permanent layout width from the canvas.

## Right Agent Drawer Requirements

- Remove the current focus card from the drawer.
- Remove the AI usage summary from the drawer.
- Remove the recent activity log from the drawer.
- Remove any image, visual preview, or focus-map preview area from the drawer.
- Preserve the right drawer collapse and expand affordance.
- Preserve the web-search toggle as a compact chat control.
- Preserve source evidence on assistant messages when `ChatMessage.sources` exists.
- Preserve guide focus behavior from assistant responses with `focusStepIds`.
- Do not auto-open or auto-close the drawer when a canvas node is selected.

## assistant-ui Integration

- Add `@assistant-ui/react` to `apps/web`.
- Use `AssistantRuntimeProvider` around the right chat area.
- Use `useExternalStoreRuntime` because the app already owns chat state and calls the existing
  `sendChat` API.
- Prefer a local assistant module boundary:

```text
apps/web/src/app/workspace/assistant/
  AgentChatDrawer.tsx
  AgentChatRuntimeProvider.tsx
  AgentThread.tsx
  AgentMessage.tsx
  AgentComposer.tsx
  AssistantEvidence.tsx
  assistantMessageMapping.ts
```

- Use assistant-ui `ThreadPrimitive`, `MessagePrimitive`, `ComposerPrimitive`, and `AuiIf`, or the
  generated assistant-ui `Thread` component if the project adopts that component style.
- Keep repository-specific styling in local CSS classes rather than rewriting the whole app around a
  new design system.

## Send Flow

1. User submits through the assistant-ui composer.
2. The runtime bridge appends an optimistic user `ChatMessage`.
3. The bridge calls `sendChat` with `sessionId`, message text, `webSearchEnabled`, and
   `selectedStepId`.
4. On success, append `response.message`.
5. Merge `response.sources` into workspace sources.
6. If `response.focusStepIds` exists, update `focusStepIds` and selected step.
7. On failure, render an assistant error message through the assistant-ui thread state.
8. Keep the existing non-streaming backend contract.

## Implementation Checklist

- [x] Add new spec entry to `specs/README.md` as `010`.
- [x] Add `@assistant-ui/react` to `apps/web`.
- [x] Extract right drawer chat into `apps/web/src/app/workspace/assistant`.
- [x] Replace custom `.message-list` rendering with assistant-ui thread rendering.
- [x] Replace custom `.chat-form` textarea/send controls with assistant-ui composer controls.
- [x] Add message mapping tests for `ChatMessage` to assistant-ui message-like objects.
- [x] Remove the drawer current focus card.
- [x] Remove drawer usage summary and activity log UI.
- [x] Remove drawer image or visual preview area.
- [x] Convert workspace layout so the canvas fills the viewport.
- [x] Convert session rail, topbar/breadcrumbs, errors, loading states, and agent drawer into
      overlays.
- [x] Ensure right drawer open/close does not resize the canvas.
- [x] Preserve web search, source evidence, and guide focus behavior.
- [x] Update CSS for desktop, tablet, and mobile overlay behavior.
- [x] Verify `npm run lint`.
- [x] Verify `npm test`.
- [x] Verify `npm run build`.

## Acceptance Criteria

- The canvas occupies the full browser viewport.
- The right drawer overlays the canvas instead of consuming layout width.
- The right drawer is chat-only.
- No current focus card, activity log, usage summary, image preview, or visual preview area appears
  in the right drawer.
- The agent chat uses assistant-ui runtime/provider and thread/composer components or primitives.
- Existing chat API behavior still works without streaming.
- Web-search selection is included in outgoing chat requests.
- Assistant responses can still focus guide nodes.
- Source evidence remains available on assistant messages.
- Opening, closing, or using the drawer does not visually resize the canvas.
