# Dynamic Agent-Created Guide Map Spec

## Status

Complete.

## Repo Findings

- The workspace canvas lives in `apps/web/src/app/workspace/WorkspaceClient.tsx`.
- Canvas node clicks call `handleNavigateToStep(stepId)`.
- `handleNavigateToStep` first focuses the selected node, then calls `expandStep` when the node has
  no loaded children and `canExpand` is not `false`.
- `expandStep` posts to `POST /api/sessions/:sessionId/guide/expand`.
- `apps/web/src/server/guideService.ts` creates child `GuideNode` records on expand by calling RAG
  and assigning fresh `randomUUID()` node IDs.
- The current app already carries guide state on the session as `GuideGraphState`.

## Problem

Guide navigation and guide creation are currently coupled. Selecting a node can create the next
layer of the guide, which makes focus behave like generation.

The desired workflow is explicit: a new session starts with an empty map, the user asks the agent for
domain knowledge, the agent proposes a draft map, and the user clicks create map to put that draft on
the canvas.

## Goal

Make guide-map creation an explicit session workflow:

- New sessions start with an empty map.
- Agent domain-knowledge answers can include a draft map proposal.
- The user clicks create map to turn the draft into the session's guide map.
- The canvas renders the session's guide map after creation.
- Node focus selects and reveals existing map content.

## Target Behavior

1. A new session opens with an empty canvas state and no root guide nodes.
2. The user asks the agent for domain knowledge or onboarding guidance.
3. The agent response can include a draft map proposal grounded in retrieved domain sources.
4. The UI shows a create-map button when a draft map is available.
5. Clicking create map converts the draft into the session's `GuideGraphState`.
6. The session guide is saved through the existing session repository.
7. After creation, the canvas renders the generated map from session guide state.
8. Clicking a node updates selected and focused state.
9. A node with children can reveal those existing children.
10. Repeated child-reveal requests return stable IDs and preserve node order.

## Runtime Data Model

Use the existing shared guide types:

- `GuideGraphState`
  - `rootNodeIds`
  - `nodes`
  - `selectedNodeId`
  - `expandedNodeIds`
- `GuideNode`
  - `id`
  - `parentId`
  - `title`
  - `summary`
  - `detail`
  - `children`
  - `depth`
  - `status`
  - `sources`
  - `createdAt`
  - `updatedAt`

Required model behavior:

- `GuideGraphState.rootNodeIds = []` represents the empty map state.
- `GuideNode.children` contains the complete set of child IDs created with the map.
- `GuideNode.sources` carries the source references used to produce that node.
- `SessionRepository.save` saves the created map as part of the session guide state.

## API Requirements

### Root Load

`POST /api/sessions/:sessionId/guide/root`

- Returns an empty graph when `session.guide.rootNodeIds` is empty.
- Returns the current session guide graph when a map exists.
- Includes metadata the client needs to render the empty canvas state.

### Draft Map Proposal

`POST /api/sessions/:sessionId/chat`

- Continues to answer domain-knowledge questions through the agent.
- Can include an optional `draftGuideMap` payload on assistant responses.
- Grounds draft map nodes in retrieved sources.

Draft shape:

```ts
interface DraftGuideMap {
  title: string;
  summary?: string;
  nodes: Array<{
    clientId: string;
    parentClientId?: string;
    title: string;
    summary: string;
    detail?: string;
    sourceIds?: string[];
    position: number;
  }>;
}
```

### Create Map

`POST /api/sessions/:sessionId/guide/map`

- Accepts a draft map payload selected by the client.
- Converts draft nodes into `GuideNode` objects with stable generated IDs.
- Builds `rootNodeIds`, `nodes`, and `children` relationships in one service operation.
- Saves the updated session through the existing session repository.
- Stores generation provenance in fields supported by the current guide types.
- Returns the updated session guide graph.

### Child Reveal

`POST /api/sessions/:sessionId/guide/expand`

- Accepts a session `nodeId`.
- Returns child nodes from `session.guide.nodes[nodeId].children`.
- Updates `selectedNodeId` and `expandedNodeIds`.
- Returns an empty `childNodeIds` array for a node with no children.

## Client Requirements

- Show an empty canvas state for sessions with no map.
- Let the user ask the agent for domain knowledge before a map exists.
- Render a create-map button when the latest agent response has a draft map proposal.
- On create map, call the create-map API and replace the empty canvas with the returned guide graph.
- Disable the create-map button while creation is in flight.
- Hide the create-map button once the session has a map.
- Split node focus from child reveal in `WorkspaceClient.tsx`.
- Node click should:
  - set `selectedStepId`
  - set `focusStepIds`
  - persist selected state when needed
- Child reveal should be triggered by a distinct control on nodes with existing children.
- Use `hasChildren` or `childCount` to drive child-reveal UI.

## Type Contract Changes

Update shared guide types:

- Add `GuideGraph.emptyReason?: 'not_created'`.
- Add `DraftGuideMap`.
- Add `ChatResponse.draftGuideMap?: DraftGuideMap`.
- Add `GuideStep.childCount?: number`.
- Add `GuideStep.hasChildren?: boolean`.

## Implementation Strategy

1. Update shared guide and chat response contracts.
2. Change `GuideOrchestrationService.generateRoot` to return the current session guide graph.
3. Add draft map proposal support to agent chat responses.
4. Add a create-map service/API that converts a draft into `GuideGraphState`.
5. Save the created map through `SessionRepository.save`.
6. Change `GuideOrchestrationService.expand` to reveal existing children from session guide state.
7. Update the workspace client empty state, create-map flow, and node interaction flow.

## Implementation Checklist

- [x] Update shared guide contracts with `emptyReason`, `hasChildren`, and `childCount`.
- [x] Add `DraftGuideMap` and `ChatResponse.draftGuideMap`.
- [x] Update `GuideOrchestrationService.generateRoot` to return empty map state for a new session.
- [x] Add create-map service/API that saves an agent draft into `session.guide`.
- [x] Update `GuideOrchestrationService.generateRoot` to return the session guide after creation.
- [x] Update `GuideOrchestrationService.expand` to return existing children from `session.guide`.
- [x] Update `WorkspaceClient.tsx` to show empty canvas state and create-map control.
- [x] Update `WorkspaceClient.tsx` so node click only focuses/selects.
- [x] Add a distinct child-reveal control for nodes with `hasChildren`.
- [x] Add API route tests for empty root load and create-map session persistence.
- [x] Add API route tests for deterministic repeated child reveal.
- [x] Add a regression test proving a leaf node focus leaves the guide unchanged.
- [x] Add a regression test proving no session guide map exists until create map is clicked.
- [x] Add a regression test proving create map saves through the existing session repository.
- [x] Update README or production docs with dynamic map creation behavior.
- [x] Verify `npm run lint`.
- [x] Verify `npm test`.
- [x] Verify `npm run build`.

## Acceptance Criteria

- New sessions begin with an empty guide map.
- Asking the agent can produce a draft map proposal.
- Clicking create map saves the draft into the session guide state.
- Node click updates selection and focus.
- Child reveal returns existing children with stable IDs.
- Leaf node focus leaves the guide unchanged.
- The canvas can focus, zoom, pan, and render selected branches.
- Tests cover empty root load, create map, child reveal, leaf focus, duplicate prevention, and session persistence.
