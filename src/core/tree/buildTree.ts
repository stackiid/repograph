import type { FileEntry } from '../types'

export interface TreeNode {
  name: string
  path: string
  children: TreeNode[]
  /** Present on files, absent on folders. */
  file?: FileEntry
}

/** Folders first, then files, each sorted by name. */
export function buildTree(files: FileEntry[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', children: [] }
  const dirs = new Map<string, TreeNode>([['', root]])
  for (const file of files) {
    const parts = file.path.split('/')
    let parent = root
    for (let i = 0; i < parts.length - 1; i++) {
      const dirPath = parts.slice(0, i + 1).join('/')
      let dir = dirs.get(dirPath)
      if (!dir) {
        dir = { name: parts[i], path: dirPath, children: [] }
        dirs.set(dirPath, dir)
        parent.children.push(dir)
      }
      parent = dir
    }
    parent.children.push({ name: parts[parts.length - 1], path: file.path, children: [], file })
  }
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => Number(!!a.file) - Number(!!b.file) || a.name.localeCompare(b.name))
    for (const n of nodes) sort(n.children)
  }
  sort(root.children)
  return root.children
}
