export type FractalRow = Record<string, unknown>;
export type FractalNode = { id: string; row: FractalRow; parent: string | null; children: string[] };
export function recordKey(value: unknown): string | null {
  return (typeof value === "string" && value.trim() !== "") || (typeof value === "number" && Number.isFinite(value)) ? String(value) : null;
}
export function fractalText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Linear forest construction, with no recursion or data requests. First duplicate wins. */
export function buildFractalForest(rows: FractalRow[], primaryKey: string, parentField: string) {
  const nodes = new Map<string, FractalNode>();
  let duplicates = 0, invalid = 0, orphans = 0, cycles = 0;
  for (const row of rows) {
    const id = recordKey(row[primaryKey]);
    if (id === null) { invalid++; continue; }
    if (nodes.has(id)) { duplicates++; continue; }
    nodes.set(id, { id, row, parent: recordKey(row[parentField]), children: [] });
  }
  for (const node of nodes.values()) {
    if (node.parent !== null && !nodes.has(node.parent)) { node.parent = null; orphans++; }
  }
  const done = new Set<string>();
  for (const start of nodes.values()) {
    const path = new Set<string>();
    let node: FractalNode | undefined = start;
    while (node && !done.has(node.id)) {
      if (path.has(node.id)) { node.parent = null; cycles++; break; }
      path.add(node.id);
      node = node.parent === null ? undefined : nodes.get(node.parent);
    }
    for (const id of path) done.add(id);
  }
  const roots: string[] = [];
  for (const node of nodes.values()) {
    if (node.parent === null) roots.push(node.id);
    else nodes.get(node.parent)!.children.push(node.id);
  }
  return { nodes, roots, duplicates, invalid, orphans, cycles };
}

export function flattenFractal(forest: ReturnType<typeof buildFractalForest>, expanded: Set<string>, query: string, fields: string[]) {
  const term = query.trim().toLocaleLowerCase();
  const included = new Set<string>();
  if (term) for (const node of forest.nodes.values()) {
    if (!fields.some(field => fractalText(node.row[field]).toLocaleLowerCase().includes(term))) continue;
    let current: FractalNode | undefined = node;
    while (current && !included.has(current.id)) {
      included.add(current.id);
      current = current.parent === null ? undefined : forest.nodes.get(current.parent);
    }
  }
  const result: { node: FractalNode; depth: number }[] = [];
  const stack = forest.roots.slice().reverse().map(id => ({ id, depth: 0 }));
  while (stack.length) {
    const { id, depth } = stack.pop()!;
    if (term && !included.has(id)) continue;
    const node = forest.nodes.get(id)!;
    result.push({ node, depth });
    if (term || expanded.has(id)) for (let i = node.children.length - 1; i >= 0; i--) stack.push({ id: node.children[i]!, depth: depth + 1 });
  }
  return result;
}
