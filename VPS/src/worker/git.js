import { execFile } from 'node:child_process'
import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { assertInside } from '../guards/path-guard.js'

const execFileAsync = promisify(execFile)

function repoUrl(config) {
  if (config.gitRepoUrl) return config.gitRepoUrl
  if (config.githubToken) {
    return `https://x-access-token:${config.githubToken}@github.com/${config.githubRepository}.git`
  }
  return `https://github.com/${config.githubRepository}.git`
}

function redactGitUrl(text, config) {
  if (!config.githubToken) return text
  return text.replace(config.githubToken, '[REDACTED]')
}


function githubBranchUrl(config, branchName) {
  return `https://github.com/${config.githubRepository}/tree/${encodeURIComponent(branchName).replaceAll('%2F', '/')}`
}

function netlifyPreviewUrl(config, branchName, previewPath) {
  if (!config.netlifyPreviewUrlPattern) return ''
  return config.netlifyPreviewUrlPattern
    .replaceAll('{branch}', encodeURIComponent(branchName))
    .replaceAll('{path}', previewPath.replace(/^\/+/, ''))
}

function escapeHtmlFragment(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function draftSectionHtml({ plan, analysisId, generatedAt }) {
  const changes = Array.isArray(plan?.changes) ? plan.changes : []
  const items = changes.length ? changes : [{ title: '改善提案', body: plan?.lead || 'AI提案をdraftに反映しました。' }]
  return `
<section id="ailp-draft-improvement" style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Noto Sans JP', sans-serif; background:#f4f8ff; color:#102b58; padding:48px 20px; border-top:1px solid #dbe8ff;">
  <div style="max-width:960px; margin:0 auto;">
    <p style="margin:0 0 10px; color:#1768f2; font-weight:700; letter-spacing:.08em; font-size:12px;">AILP DRAFT IMPROVEMENT</p>
    <h2 style="margin:0 0 16px; font-size:clamp(24px,4vw,36px); line-height:1.35;">${escapeHtmlFragment(plan?.headline || 'AI改善提案を反映した確認用draft')}</h2>
    <p style="margin:0 0 24px; line-height:1.9; color:#385070;">${escapeHtmlFragment(plan?.lead || 'GA4分析に基づく改善案を、本番に反映せずdraft確認用に追加しています。')}</p>
    <div style="display:grid; gap:14px;">
      ${items.map((item, index) => `<article style="background:#fff; border:1px solid #dbe8ff; border-radius:14px; padding:18px; box-shadow:0 8px 22px rgba(16,43,88,.08);"><b style="display:block; color:#1768f2; margin-bottom:6px;">改善 ${index + 1}: ${escapeHtmlFragment(item.title || '改善項目')}</b><span style="line-height:1.8; color:#415879;">${escapeHtmlFragment(item.body || '')}</span></article>`).join('\n      ')}
    </div>
    <a href="#" style="display:inline-block; margin-top:24px; background:#16a463; color:#fff; text-decoration:none; font-weight:700; border-radius:999px; padding:14px 22px;">${escapeHtmlFragment(plan?.cta_label || 'LINEで相談する')}</a>
    <p style="margin:18px 0 0; font-size:12px; color:#6b7b93;">Draft only / analysis: ${escapeHtmlFragment(analysisId || 'latest')} / ${escapeHtmlFragment(generatedAt)}</p>
  </div>
</section>`
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

  await git(['config', 'user.name', config.gitAuthorName], { cwd: workspace.repo, config })
  await git(['config', 'user.email', config.gitAuthorEmail], { cwd: workspace.repo, config })
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

export async function createPreviewFolder({ config, workspace, folderPath, branchName, versionSlug }) {
  const repoRoot = workspace.repo
  const normalizedFolder = String(folderPath || '').replace(/^\/+|\/+$/g, '')
  const normalizedVersion = String(versionSlug || '').replace(/[^A-Za-z0-9_-]/g, '-')
  if (!normalizedFolder || normalizedFolder.includes('..')) {
    throw new Error(`Invalid folder_path: ${folderPath}`)
  }
  if (!normalizedVersion) {
    throw new Error('versionSlug is required')
  }

  const sourceDir = assertInside(repoRoot, join(repoRoot, normalizedFolder))
  const previewPath = `ailp-previews/${normalizedFolder}/${normalizedVersion}`
  const targetDir = assertInside(repoRoot, join(repoRoot, previewPath))
  await mkdir(targetDir, { recursive: true })
  await cp(sourceDir, targetDir, {
    recursive: true,
    force: true,
    filter: (source) => !source.includes('.git') && !source.endsWith('ailp-draft-proposal.md'),
  })

  await git(['add', previewPath], { cwd: repoRoot, config })
  const diffSummary = await git(['diff', '--cached', '--stat'], { cwd: repoRoot, config })
  await git(['commit', '-m', `AILP preview ${normalizedFolder}/${normalizedVersion}`], { cwd: repoRoot, config })
  const commitSha = await git(['rev-parse', 'HEAD'], { cwd: repoRoot, config })
  return {
    branchName,
    commitSha,
    previewPath,
    previewUrl: `https://dec-site.netlify.app/${previewPath}/`,
    diffSummary,
  }
}

export async function pushBranch({ config, workspace, branchName }) {
  await git(['push', repoUrl(config), `HEAD:${branchName}`], {
    cwd: workspace.repo,
    config,
  })
}




export async function applyDraftChanges({ config, workspace, folderPath, branchName, versionSlug, plan, analysisId }) {
  const repoRoot = workspace.repo
  const normalizedFolder = String(folderPath || '').replace(/^\/+|\/+$/g, '')
  const normalizedVersion = String(versionSlug || '').replace(/[^A-Za-z0-9_-]/g, '-')
  if (!normalizedFolder || normalizedFolder.includes('..')) {
    throw new Error(`Invalid folder_path: ${folderPath}`)
  }
  if (!normalizedVersion) {
    throw new Error('versionSlug is required')
  }

  const sourceDir = assertInside(repoRoot, join(repoRoot, normalizedFolder))
  const previewPath = `ailp-previews/${normalizedFolder}/${normalizedVersion}`
  const targetDir = assertInside(repoRoot, join(repoRoot, previewPath))
  await mkdir(targetDir, { recursive: true })
  await cp(sourceDir, targetDir, {
    recursive: true,
    force: true,
    filter: (source) => !source.includes('.git') && !source.endsWith('ailp-draft-proposal.md'),
  })

  const htmlPath = assertInside(repoRoot, join(targetDir, 'index.html'))
  let html = await readFile(htmlPath, 'utf8')
  html = html.replace(/<section id="ailp-draft-improvement"[\s\S]*?<\/section>/, '')
  const section = draftSectionHtml({ plan, analysisId, generatedAt: new Date().toISOString() })
  if (html.includes('</body>')) {
    html = html.replace('</body>', `${section}\n</body>`)
  } else {
    html = `${html}\n${section}\n`
  }
  await writeFile(htmlPath, html, 'utf8')

  await git(['add', previewPath], { cwd: repoRoot, config })
  const diffSummary = await git(['diff', '--cached', '--stat'], { cwd: repoRoot, config })
  await git(['commit', '-m', `AILP apply draft improvements ${normalizedFolder}/${normalizedVersion}`], { cwd: repoRoot, config })
  const commitSha = await git(['rev-parse', 'HEAD'], { cwd: repoRoot, config })
  const configuredPreviewUrl = netlifyPreviewUrl(config, branchName, previewPath)
  return {
    branchName,
    commitSha,
    previewPath,
    previewUrl: configuredPreviewUrl || `https://dec-site.netlify.app/${previewPath}/`,
    githubBranchUrl: githubBranchUrl(config, branchName),
    netlifyPreviewStatus: configuredPreviewUrl ? 'configured' : 'pending_netlify_deploy_preview',
    diffSummary,
  }
}
