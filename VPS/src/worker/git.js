import { execFile } from 'node:child_process'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { assertInside } from '../guards/path-guard.js'

const execFileAsync = promisify(execFile)

function repoUrl(config) {
  if (config.githubToken) {
    return `https://x-access-token:${config.githubToken}@github.com/${config.githubRepository}.git`
  }
  return `https://github.com/${config.githubRepository}.git`
}

function redactGitUrl(text, config) {
  if (!config.githubToken) return text
  return text.replace(config.githubToken, '[REDACTED]')
}

async function git(args, options = {}) {
  try {
    const result = await execFileAsync('git', args, {
      cwd: options.cwd,
      maxBuffer: 10 * 1024 * 1024,
    })
    return result.stdout.trim()
  } catch (error) {
    const stderr = redactGitUrl(error.stderr || error.message, options.config ?? {})
    throw new Error(stderr || 'git command failed')
  }
}

export async function prepareRepo({ config, workspace, branchName }) {
  await mkdir(workspace.root, { recursive: true })
  const gitDir = join(workspace.repo, '.git')

  let hasRepo = false
  try {
    hasRepo = (await stat(gitDir)).isDirectory()
  } catch {
    hasRepo = false
  }

  if (!hasRepo) {
    await git(['clone', '--depth', '1', repoUrl(config), workspace.repo], { config })
  }

  await git(['fetch', 'origin', 'main'], { cwd: workspace.repo, config })
  await git(['checkout', '-B', branchName, 'origin/main'], { cwd: workspace.repo, config })
  return workspace.repo
}

export async function writeDraftProposal({ config, workspace, folderPath, branchName, markdown }) {
  const repoRoot = workspace.repo
  const normalizedFolder = String(folderPath || '').replace(/^\/+|\/+$/g, '')
  if (!normalizedFolder || normalizedFolder.includes('..')) {
    throw new Error(`Invalid folder_path: ${folderPath}`)
  }

  const targetDir = assertInside(repoRoot, join(repoRoot, normalizedFolder))
  const proposalPath = assertInside(repoRoot, join(targetDir, 'ailp-draft-proposal.md'))
  await writeFile(proposalPath, markdown, 'utf8')

  await git(['add', `${normalizedFolder}/ailp-draft-proposal.md`], { cwd: repoRoot, config })
  const diffSummary = await git(['diff', '--cached', '--stat'], { cwd: repoRoot, config })
  await git(['commit', '-m', `AILP draft proposal for ${normalizedFolder}`], { cwd: repoRoot, config })
  const commitSha = await git(['rev-parse', 'HEAD'], { cwd: repoRoot, config })

  return {
    branchName,
    commitSha,
    filePath: `${normalizedFolder}/ailp-draft-proposal.md`,
    diffSummary,
  }
}
