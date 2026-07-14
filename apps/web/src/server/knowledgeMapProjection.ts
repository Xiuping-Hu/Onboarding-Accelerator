import type { GuideGraphState, GuideNode, PublishedKnowledgeMap } from '@onboarding/shared';

export function projectKnowledgeMapToGuide(map: PublishedKnowledgeMap): GuideGraphState {
  const parentByNode = new Map<string, string>();
  for (const edge of map.edges) {
    if (edge.relationship === 'contains' || edge.relationship === 'learning_precedes') {
      parentByNode.set(edge.to, edge.from);
    }
  }
  const childrenByNode = new Map<string, string[]>();
  for (const edge of map.edges) {
    if (edge.relationship !== 'contains' && edge.relationship !== 'learning_precedes') continue;
    const children = childrenByNode.get(edge.from) ?? [];
    children.push(edge.to);
    childrenByNode.set(edge.from, children);
  }
  const now = new Date().toISOString();
  const depthFor = (nodeId: string): number => {
    let depth = 0;
    let parent = parentByNode.get(nodeId);
    const seen = new Set<string>([nodeId]);
    while (parent && !seen.has(parent)) {
      seen.add(parent);
      depth += 1;
      parent = parentByNode.get(parent);
    }
    return depth;
  };
  const nodes: Record<string, GuideNode> = Object.fromEntries(
    map.nodes.map((node) => [
      node.id,
      {
        id: node.id,
        parentId: parentByNode.get(node.id),
        title: node.title,
        summary: node.summary,
        children: childrenByNode.get(node.id) ?? [],
        depth: depthFor(node.id),
        status: 'generated',
        sources: [],
        canExpand: false,
        maxDepth: 0,
        createdAt: now,
        updatedAt: now,
      },
    ]),
  );
  const rootNodeIds = map.nodes.filter((node) => !parentByNode.has(node.id)).map((node) => node.id);
  return {
    rootNodeIds,
    nodes,
    selectedNodeId: rootNodeIds[0],
    expandedNodeIds: [],
    knowledgeMapId: map.id,
    knowledgeMapVersionId: map.versionId,
    projectedKnowledgeMapNodeIds: map.nodes.map((node) => node.id),
  };
}
