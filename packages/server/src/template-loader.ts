import fs from 'fs'
import path from 'path'

// ── Manifest types (mirrors PLAN.md template.json spec) ──────────────────────

export interface AgentDefinition {
  id: string
  name: string
  role: string
  systemPromptFile: string
  configFile: string
  isPipelineController?: boolean
}

export interface AgentConfig {
  defaultModel?: string
  tools?: string[]
  skills?: string[]
}

export interface UIPanelDefinition {
  id: string
  displayName: string
  file: string
  slot: 'main' | 'agent-card' | 'sidebar'
}

export interface TemplateManifest {
  id: string
  version: string
  displayName: string
  description?: string
  requiredPlugins: string[]
  optionalPlugins?: string[]
  agents: AgentDefinition[]
  pipeline?: {
    type: 'staged' | 'freeform'
    entryFile: string
  }
  uiPanels?: UIPanelDefinition[]
  workspaceStructure?: string
}

export interface LoadedTemplate {
  manifest: TemplateManifest
  /** Absolute path to the template's root directory */
  dir: string
  /** Agent system prompt text keyed by agentId */
  agentPrompts: Record<string, string>
  /** Agent config objects keyed by agentId */
  agentConfigs: Record<string, AgentConfig>
}

// ── Validation ────────────────────────────────────────────────────────────────

function validateManifest(raw: unknown, filePath: string): TemplateManifest {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`${filePath}: manifest must be a JSON object`)
  }
  const m = raw as Record<string, unknown>
  const required = ['id', 'version', 'displayName', 'agents']
  for (const key of required) {
    if (!m[key]) throw new Error(`${filePath}: missing required field "${key}"`)
  }
  if (!Array.isArray(m.agents)) {
    throw new Error(`${filePath}: "agents" must be an array`)
  }
  for (const agent of m.agents as unknown[]) {
    const a = agent as Record<string, unknown>
    for (const f of ['id', 'name', 'role', 'systemPromptFile', 'configFile']) {
      if (!a[f]) throw new Error(`${filePath}: agent missing required field "${f}"`)
    }
  }
  return raw as TemplateManifest
}

// ── Loader ────────────────────────────────────────────────────────────────────

/**
 * Load a single template from a directory that contains template.json.
 * Reads agent system prompts and config files from the declared paths.
 */
export function loadTemplateFromDir(templateDir: string): LoadedTemplate {
  const manifestPath = path.join(templateDir, 'template.json')
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`No template.json found in ${templateDir}`)
  }

  const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
  const manifest = validateManifest(raw, manifestPath)

  const agentPrompts: Record<string, string> = {}
  const agentConfigs: Record<string, AgentConfig> = {}

  for (const agent of manifest.agents) {
    const promptPath = path.join(templateDir, agent.systemPromptFile)
    if (fs.existsSync(promptPath)) {
      agentPrompts[agent.id] = fs.readFileSync(promptPath, 'utf-8')
    } else {
      agentPrompts[agent.id] = `You are ${agent.name}, the ${agent.role}.`
    }

    const configPath = path.join(templateDir, agent.configFile)
    if (fs.existsSync(configPath)) {
      agentConfigs[agent.id] = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    } else {
      agentConfigs[agent.id] = {}
    }
  }

  return { manifest, dir: templateDir, agentPrompts, agentConfigs }
}

/**
 * Scan a parent directory for subdirectories containing template.json.
 * Returns successfully parsed templates; logs and skips invalid ones.
 */
export function scanTemplatesDir(templatesDir: string): LoadedTemplate[] {
  if (!fs.existsSync(templatesDir)) return []

  const results: LoadedTemplate[] = []
  for (const entry of fs.readdirSync(templatesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const candidateDir = path.join(templatesDir, entry.name)
    try {
      results.push(loadTemplateFromDir(candidateDir))
    } catch (err) {
      console.warn(`  [template-loader] Skipping ${entry.name}: ${(err as Error).message}`)
    }
  }
  return results
}

/**
 * Scaffold the workspace subdirectory declared by a template's workspaceStructure.
 * Creates an empty .gitkeep if the source directory is missing.
 */
export function scaffoldWorkspace(template: LoadedTemplate, workspaceDir: string): void {
  const templateWorkspaceDir = path.join(workspaceDir, template.manifest.id)
  fs.mkdirSync(templateWorkspaceDir, { recursive: true })

  if (template.manifest.workspaceStructure) {
    const src = path.join(template.dir, template.manifest.workspaceStructure)
    if (fs.existsSync(src)) {
      copyDirRecursive(src, templateWorkspaceDir)
      return
    }
  }

  // Ensure directory isn't empty (git-friendly)
  const keepFile = path.join(templateWorkspaceDir, '.gitkeep')
  if (!fs.existsSync(keepFile)) {
    fs.writeFileSync(keepFile, '')
  }
}

function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}
