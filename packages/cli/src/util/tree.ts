import type { File } from "@lib/git"

export type TreeNodeType = "directory" | "file"

export type TreeNode = {
  name: string
  type: TreeNodeType
  fullPath: string
  status?: string
  previousPath?: string
  added?: number
  removed?: number
  children: TreeNode[]
  depth: number
}

export type FlatNode = TreeNode & {
  fileIndex: number | null
  prefix: string
}

function sort(nodes: TreeNode[]) {
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  nodes.forEach((node) => sort(node.children))
}

function consolidate(nodes: TreeNode[]) {
  nodes.forEach((node) => {
    if (node.type !== "directory") return
    while (node.children.length === 1 && node.children[0].type === "directory") {
      const child = node.children[0]
      node.name = `${node.name}/${child.name}`
      node.fullPath = child.fullPath
      node.children = child.children
    }
    consolidate(node.children)
  })
}

function depths(nodes: TreeNode[], depth = 0) {
  nodes.forEach((node) => {
    node.depth = depth
    depths(node.children, depth + 1)
  })
}

export function buildFileTree(files: File[]) {
  const root: TreeNode[] = []

  files.forEach((file) => {
    const parts = file.path.split("/").filter(Boolean)
    parts.reduce((nodes, name, index) => {
      const type = index === parts.length - 1 ? "file" : "directory"
      const fullPath = parts.slice(0, index + 1).join("/")
      const existing = nodes.find((node) => node.name === name)
      if (existing) return existing.children

      const node: TreeNode = {
        name,
        type,
        fullPath,
        children: [],
        depth: index,
        ...(type === "file" && {
          status: file.status,
          previousPath: file.previousPath,
          added: file.added,
          removed: file.removed,
        }),
      }
      nodes.push(node)
      return node.children
    }, root)
  })

  sort(root)
  consolidate(root)
  depths(root)
  return root
}

export function flattenTree(nodes: TreeNode[], collapsed: ReadonlySet<string> = new Set()) {
  const result: FlatNode[] = []
  let fileIndex = 0

  const visit = (items: TreeNode[], branches: boolean[] = []) =>
    items.forEach((node, index) => {
      const later = index < items.length - 1
      const indentation = branches
        .map((branch, depth) => (depth === 0 && nodes.length === 1 ? " " : branch ? "│  " : "   "))
        .join("")
      const branch = node.depth === 0 && index === 0 ? " " : later ? "├─ " : "└─ "
      result.push({ ...node, fileIndex: node.type === "file" ? fileIndex++ : null, prefix: `${indentation}${branch}` })
      if (node.type === "directory" && !collapsed.has(node.fullPath)) visit(node.children, [...branches, later])
    })

  visit(nodes)
  return result
}

export function treePrefix(node: FlatNode, collapsed: ReadonlySet<string>) {
  const marker = node.type === "directory" ? (collapsed.has(node.fullPath) ? "▸ " : "▾ ") : ""
  return `${node.prefix}${marker}`
}

export function moveTreeSelection(nodes: FlatNode[], selected: string, offset: number) {
  if (nodes.length === 0) return ""
  const index = nodes.findIndex((node) => node.fullPath === selected)
  if (index < 0) return nodes[0].fullPath
  return nodes[Math.max(0, Math.min(nodes.length - 1, index + offset))].fullPath
}

export function firstTreeChild(nodes: FlatNode[], selected: string) {
  const index = nodes.findIndex((node) => node.fullPath === selected)
  const node = nodes[index]
  const child = nodes[index + 1]
  if (!node || node.type !== "directory" || !child || child.depth <= node.depth) return selected
  return child.fullPath
}

export function treeParent(nodes: FlatNode[], selected: string) {
  const index = nodes.findIndex((node) => node.fullPath === selected)
  const node = nodes[index]
  if (!node || node.depth === 0) return selected
  return nodes.findLast((item, itemIndex) => itemIndex < index && item.depth < node.depth)?.fullPath ?? selected
}

export function getFile(node: FlatNode | undefined): File | null {
  if (!node || node.type !== "file") return null
  return {
    status: node.status || "",
    path: node.fullPath,
    previousPath: node.previousPath,
    added: node.added,
    removed: node.removed,
  }
}
