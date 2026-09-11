import { mkdir } from 'node:fs/promises'
import { resolve, sep } from 'node:path'

export function assertInside(basePath, targetPath) {
  const base = resolve(basePath)
  const target = resolve(targetPath)
  if (target !== base && !target.startsWith(base + sep)) {
    throw new Error(`Path escapes workspace: ${target}`)
  }
  return target
}

export async function ensureLpWorkspace(workspaceRoot, lpProjectId) {
  if (!/^[0-9a-f-]{36}$/i.test(lpProjectId)) {
    throw new Error(`Invalid lp_project_id: ${lpProjectId}`)
  }

  const lpRoot = assertInside(workspaceRoot, `${workspaceRoot}/${lpProjectId}`)
  const paths = {
    root: lpRoot,
    repo: assertInside(lpRoot, `${lpRoot}/repo`),
    tmp: assertInside(lpRoot, `${lpRoot}/tmp`),
    output: assertInside(lpRoot, `${lpRoot}/output`),
  }

  await Promise.all(Object.values(paths).map((path) => mkdir(path, { recursive: true })))
  return paths
}

