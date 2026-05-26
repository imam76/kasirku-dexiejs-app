import type { ChartOfAccount } from '@/types';
import { sortAccountsByCode } from '@/utils/chartOfAccounts/sortAccountsByCode';

export interface ChartOfAccountTreeNode extends ChartOfAccount {
  children: ChartOfAccountTreeNode[];
  level: number;
}

export const buildAccountTree = (accounts: ChartOfAccount[]): ChartOfAccountTreeNode[] => {
  const nodeMap = new Map<string, ChartOfAccountTreeNode>();
  const roots: ChartOfAccountTreeNode[] = [];

  sortAccountsByCode(accounts).forEach((account) => {
    nodeMap.set(account.id, {
      ...account,
      children: [],
      level: 0,
    });
  });

  nodeMap.forEach((node) => {
    const parent = node.parent_id ? nodeMap.get(node.parent_id) : undefined;
    if (!parent) {
      roots.push(node);
      return;
    }

    node.level = parent.level + 1;
    parent.children.push(node);
  });

  const sortChildren = (nodes: ChartOfAccountTreeNode[]) => {
    const sortedNodes = sortAccountsByCode(nodes);
    sortedNodes.forEach((node) => {
      node.children = sortChildren(node.children);
    });
    return sortedNodes;
  };

  return sortChildren(roots);
};

