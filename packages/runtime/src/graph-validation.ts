import type { WorkGraph } from '@quoralinex/q1x-community-sdk';
import { RuntimeError } from './errors.js';

export function validateGraphStructure(graph: WorkGraph): void {
  const ids = new Set<string>();
  for (const node of graph.nodes) {
    if (ids.has(node.id)) {
      throw new RuntimeError('CONFLICT', `Duplicate work node id: ${node.id}`);
    }
    ids.add(node.id);
  }

  for (const node of graph.nodes) {
    if (node.parentId && !ids.has(node.parentId)) {
      throw new RuntimeError('INVALID_REFERENCE', `Unknown parent node: ${node.parentId}`);
    }
  }

  for (const edge of graph.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) {
      throw new RuntimeError('INVALID_REFERENCE', `Unknown edge endpoint: ${edge.from} -> ${edge.to}`);
    }
  }

  assertAcyclicExecutionDependencies(graph);
}

function assertAcyclicExecutionDependencies(graph: WorkGraph): void {
  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) adjacency.set(node.id, []);
  for (const edge of graph.edges) {
    if (edge.type === 'depends-on') adjacency.get(edge.to)?.push(edge.from);
    if (edge.type === 'blocks') adjacency.get(edge.from)?.push(edge.to);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new RuntimeError('GRAPH_CYCLE', `Execution dependency cycle includes ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of adjacency.get(id) ?? []) visit(next);
    visiting.delete(id);
    visited.add(id);
  };

  for (const node of graph.nodes) visit(node.id);
}
