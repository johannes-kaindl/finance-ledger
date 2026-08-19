import type { Transaction } from '../parser/ledger';

export interface CategoryNode {
  account: string;
  level: number;
  totalEur: number;
  postingCount: number;
  percentOfTotal: number;
  children?: CategoryNode[];
}

export function aggregateCategoryTotals(
  transactions: Transaction[],
  prefixFilter: string
): CategoryNode[] {
  // Collect leaf amounts
  const leafMap = new Map<string, { sum: number; count: number }>();
  for (const tx of transactions) {
    for (const posting of tx.postings) {
      if (prefixFilter && !posting.account.startsWith(prefixFilter)) continue;
      const cur = leafMap.get(posting.account) ?? { sum: 0, count: 0 };
      cur.sum += posting.amountEur;
      cur.count++;
      leafMap.set(posting.account, cur);
    }
  }

  if (leafMap.size === 0) return [];

  const prefixParts = prefixFilter ? prefixFilter.split(':').filter(Boolean) : [];
  // topDepth = depth of top-level nodes returned.
  // Without prefix: depth 1 ("Ausgaben", "Aktiva", …).
  // With prefix "Ausgaben:": depth 1 still — one "Ausgaben" root that contains all sub-trees.
  // This prevents duplicate top-level rows with identical short names in the view.
  const topDepth = Math.max(1, prefixParts.length);

  // Build node map — one node per account-prefix at each depth level
  const nodeMap = new Map<string, CategoryNode>();

  for (const [account, { sum, count }] of leafMap) {
    const parts = account.split(':');
    // Accumulate into every ancestor from topDepth to leaf
    for (let depth = topDepth; depth <= parts.length; depth++) {
      const key = parts.slice(0, depth).join(':');
      if (!nodeMap.has(key)) {
        nodeMap.set(key, {
          account: key,
          level: depth - 1,
          totalEur: 0,
          postingCount: 0,
          percentOfTotal: 0,
          children: [],
        });
      }
      const node = nodeMap.get(key)!;
      node.totalEur += sum;
      node.postingCount += count;
    }
  }

  // Round all totals
  for (const node of nodeMap.values()) {
    node.totalEur = Math.round(node.totalEur * 100) / 100;
  }

  // Wire up parent → child relationships
  for (const [key, node] of nodeMap) {
    const parts = key.split(':');
    if (parts.length > topDepth) {
      const parentKey = parts.slice(0, -1).join(':');
      const parent = nodeMap.get(parentKey);
      if (parent?.children) parent.children.push(node);
    }
  }

  // Extract top-level nodes and calculate percentOfTotal
  const topLevel = [...nodeMap.values()].filter(
    n => n.account.split(':').length === topDepth
  );

  const grandTotal = topLevel.reduce((a, n) => a + n.totalEur, 0);
  for (const node of topLevel) {
    node.percentOfTotal = grandTotal !== 0 ? (node.totalEur / grandTotal) * 100 : 0;
  }

  topLevel.sort((a, b) => b.totalEur - a.totalEur);
  applyChildPercentsAndSort(topLevel);

  return topLevel;
}

function applyChildPercentsAndSort(nodes: CategoryNode[]): void {
  for (const node of nodes) {
    if (!node.children?.length) continue;
    node.children.sort((a, b) => b.totalEur - a.totalEur);
    for (const child of node.children) {
      child.percentOfTotal = node.totalEur !== 0 ? (child.totalEur / node.totalEur) * 100 : 0;
    }
    applyChildPercentsAndSort(node.children);
  }
}
