import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { access, chmod, copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import log from 'electron-log/main';
import type {
  BootstrapState,
  CompileIssue,
  CompileResult,
  OpenedProject,
  ProjectFile,
  ProjectSummary,
  TexEngine,
  TexStatus,
} from '../shared/types';
import { createStarterLatex, slugifyProjectName } from '../shared/template';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '..');
const SETTINGS_FILE = 'settings.json';
const SUPPORTED_TEX_EXTENSIONS = new Set(['.tex']);
const ASSET_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.pdf', '.svg', '.eps']);
const RECENT_PROJECT_LIMIT = 10;
const MANAGED_TINYTEX_ARCHIVE_NAME = 'TinyTeX-darwin.tar.xz';
const MAX_PACKAGE_INSTALL_ATTEMPTS = 4;
const SKIPPED_PROJECT_DIRS = new Set([
  'build',
  'dist',
  'dist-electron',
  'node_modules',
  'release',
  '.git',
  '.hg',
  '.svn',
  '.Trash',
]);

interface SettingsData {
  recentProjects: Array<{ projectPath: string; lastOpenedAt: string }>;
  texEngine?: TexEngine;
}

let mainWindow: BrowserWindow | null = null;
let pendingInitialProjectPath = parseProjectPathFromArgv(process.argv);
let cachedTexStatus: TexStatus | null = null;
let installState: TexStatus['installState'] = 'idle';

log.initialize();

function getSettingsPath(): string {
  return join(app.getPath('userData'), SETTINGS_FILE);
}

function getManagedTectonicPath(): string {
  return join(app.getPath('userData'), 'bin', 'tectonic');
}

function getTectonicCacheDir(): string {
  return join(app.getPath('userData'), 'tectonic-cache');
}

function getManagedTinyTexParentPath(): string {
  return join(app.getPath('home'), '.underleaf-tinytex');
}

function getManagedTinyTexRootPath(): string {
  return join(getManagedTinyTexParentPath(), 'TinyTeX');
}

async function loadSettings(): Promise<SettingsData> {
  try {
    const raw = await readFile(getSettingsPath(), 'utf8');
    return JSON.parse(raw) as SettingsData;
  } catch {
    return { recentProjects: [] };
  }
}

async function saveSettings(settings: SettingsData): Promise<void> {
  await mkdir(dirname(getSettingsPath()), { recursive: true });
  await writeFile(getSettingsPath(), JSON.stringify(settings, null, 2), 'utf8');
}

async function updateRecentProject(projectPath: string): Promise<void> {
  const settings = await loadSettings();
  const withoutCurrent = settings.recentProjects.filter((entry) => entry.projectPath !== projectPath);
  settings.recentProjects = [
    { projectPath, lastOpenedAt: new Date().toISOString() },
    ...withoutCurrent,
  ].slice(0, RECENT_PROJECT_LIMIT);
  await saveSettings(settings);
}

async function findMainTexFile(projectPath: string, options: { deep?: boolean } = {}): Promise<string> {
  const deep = options.deep ?? true;
  const preferred = join(projectPath, 'main.tex');
  try {
    await access(preferred, fsConstants.R_OK);
    return preferred;
  } catch {
    const entries = await readdir(projectPath, { withFileTypes: true });
    const topLevelTex = entries.find((entry) => entry.isFile() && SUPPORTED_TEX_EXTENSIONS.has(extname(entry.name).toLowerCase()));
    if (topLevelTex) {
      return join(projectPath, topLevelTex.name);
    }

    if (!deep) {
      throw new Error('No top-level .tex files found in this folder.');
    }

    const files = await collectProjectFiles(projectPath);
    const firstTex = files.find((file) => file.kind === 'tex');
    if (!firstTex) {
      throw new Error('No .tex files found in this folder.');
    }

    return firstTex.absolutePath;
  }
}

async function collectProjectFiles(projectPath: string): Promise<ProjectFile[]> {
  const files: ProjectFile[] = [];

  async function walk(currentPath: string): Promise<void> {
    const entries = await readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) {
        continue;
      }

      const absolutePath = join(currentPath, entry.name);
      if (entry.isDirectory()) {
        if (SKIPPED_PROJECT_DIRS.has(entry.name)) {
          continue;
        }
        await walk(absolutePath);
        continue;
      }

      const extension = extname(entry.name).toLowerCase();
      const relativePath = absolutePath.slice(projectPath.length + 1);

      if (SUPPORTED_TEX_EXTENSIONS.has(extension)) {
        files.push({ absolutePath, relativePath, kind: 'tex' });
      } else if (ASSET_EXTENSIONS.has(extension)) {
        files.push({ absolutePath, relativePath, kind: 'asset' });
      }
    }
  }

  await walk(projectPath);
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

async function buildProjectSummary(projectPath: string, options: { deep?: boolean } = {}): Promise<ProjectSummary> {
  const settings = await loadSettings();
  const recent = settings.recentProjects.find((entry) => entry.projectPath === projectPath);
  return {
    name: projectPath.split('/').pop() ?? 'Untitled Project',
    projectPath,
    mainFilePath: await findMainTexFile(projectPath, options),
    lastOpenedAt: recent?.lastOpenedAt ?? new Date().toISOString(),
  };
}

async function openProject(projectPath: string): Promise<OpenedProject> {
  const resolvedPath = resolve(projectPath);
  const projectStats = await stat(resolvedPath);
  if (!projectStats.isDirectory()) {
    throw new Error('Project path must be a folder.');
  }

  const summary = await buildProjectSummary(resolvedPath);
  const files = await collectProjectFiles(resolvedPath);
  await updateRecentProject(resolvedPath);

  return {
    summary,
    files,
  };
}

async function createProject(name: string, directory: string): Promise<OpenedProject> {
  const slug = slugifyProjectName(name);
  let projectPath = join(directory, slug);
  let suffix = 1;

  while (true) {
    try {
      await access(projectPath, fsConstants.F_OK);
      projectPath = join(directory, `${slug}-${suffix}`);
      suffix += 1;
    } catch {
      break;
    }
  }

  await mkdir(projectPath, { recursive: true });
  await mkdir(join(projectPath, 'build'), { recursive: true });
  await writeFile(join(projectPath, 'main.tex'), createStarterLatex(name), 'utf8');

  return openProject(projectPath);
}

async function listRecentProjects(): Promise<ProjectSummary[]> {
  const settings = await loadSettings();
  const summaries = await Promise.all(
    settings.recentProjects.map(async (entry) => {
      try {
        const summary = await buildProjectSummary(entry.projectPath, { deep: false });
        return { ...summary, lastOpenedAt: entry.lastOpenedAt };
      } catch {
        return null;
      }
    }),
  );

  return summaries.filter((summary): summary is ProjectSummary => summary !== null);
}

function parseProjectPathFromArgv(argv: string[]): string | undefined {
  const candidate = argv
    .slice(app.isPackaged ? 1 : 2)
    .map((value) => value.trim())
    .find((value) => value && !value.startsWith('-'));

  if (!candidate) {
    return undefined;
  }

  return resolve(candidate);
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1520,
    height: 920,
    minWidth: 1180,
    minHeight: 720,
    backgroundColor: '#f3ede2',
    titleBarStyle: 'default',
    webPreferences: {
      preload: fileURLToPath(new URL('./preload.mjs', import.meta.url)),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    window.loadFile(join(ROOT_DIR, 'dist/index.html'));
  }

  return window;
}

async function findExecutableInPath(name: string): Promise<string | null> {
  return new Promise((resolvePromise) => {
    const child = spawn('which', [name], { stdio: ['ignore', 'pipe', 'ignore'] });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.on('exit', (code) => {
      resolvePromise(code === 0 ? output.trim() : null);
    });
  });
}

async function detectTexEngine(): Promise<TexStatus> {
  const settings = await loadSettings();
  const managedTectonicPath = getManagedTectonicPath();
  const managedTinyTexBinDir = await getManagedTinyTexBinDir();
  const executableCandidates: Array<(Omit<TexEngine, 'path'> & { path: string | null }) | TexEngine | null> = [
    { kind: 'tectonic' as const, path: await findExecutableInPath('tectonic'), source: 'system' as const },
    { kind: 'xelatex' as const, path: await findExecutableInPath('xelatex'), source: 'system' as const },
    { kind: 'lualatex' as const, path: await findExecutableInPath('lualatex'), source: 'system' as const },
    { kind: 'pdflatex' as const, path: await findExecutableInPath('pdflatex'), source: 'system' as const },
    {
      kind: 'xelatex' as const,
      path: '/Library/TeX/texbin/xelatex',
      source: 'system' as const,
    },
    {
      kind: 'lualatex' as const,
      path: '/Library/TeX/texbin/lualatex',
      source: 'system' as const,
    },
    {
      kind: 'pdflatex' as const,
      path: '/Library/TeX/texbin/pdflatex',
      source: 'system' as const,
    },
    {
      kind: 'tectonic' as const,
      path: managedTectonicPath,
      source: 'managed' as const,
    },
    {
      kind: 'xelatex' as const,
      path: managedTinyTexBinDir ? join(managedTinyTexBinDir, 'xelatex') : null,
      source: 'managed' as const,
    },
    {
      kind: 'lualatex' as const,
      path: managedTinyTexBinDir ? join(managedTinyTexBinDir, 'lualatex') : null,
      source: 'managed' as const,
    },
    {
      kind: 'pdflatex' as const,
      path: managedTinyTexBinDir ? join(managedTinyTexBinDir, 'pdflatex') : null,
      source: 'managed' as const,
    },
    settings.texEngine ?? null,
  ];

  const seen = new Set<string>();
  const candidates: TexEngine[] = [];
  for (const candidate of executableCandidates) {
    if (candidate?.path) {
      const key = `${candidate.kind}:${candidate.path}:${candidate.source}`;
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push(candidate as TexEngine);
      }
    }
  }

  for (const engine of candidates) {
    try {
      await access(engine.path, fsConstants.X_OK);
      const status: TexStatus = {
        ready: true,
        engine,
        checkedAt: new Date().toISOString(),
        message:
          engine.kind === 'tectonic'
            ? engine.source === 'managed'
              ? 'Managed Tectonic engine detected and ready to compile with on-demand package downloads.'
              : 'System Tectonic engine detected and ready to compile with on-demand package downloads.'
            : engine.source === 'managed'
              ? `Managed ${engine.kind} detected and ready to compile with package installs on demand.`
              : `${engine.kind} detected and ready to compile.`,
        installState,
      };
      cachedTexStatus = status;
      return status;
    } catch {
      continue;
    }
  }

  const status: TexStatus = {
    ready: false,
    checkedAt: new Date().toISOString(),
    message:
      'No TeX engine is installed yet. Use the installer to download local Tectonic support, or open a XeLaTeX project and Underleaf will install a managed TinyTeX toolchain automatically.',
    installState,
  };
  cachedTexStatus = status;
  return status;
}

async function downloadLatestTectonicBinary(): Promise<string> {
  const response = await fetch('https://api.github.com/repos/tectonic-typesetting/tectonic/releases/latest', {
    headers: {
      'User-Agent': 'underleaf-app',
      Accept: 'application/vnd.github+json',
    },
  });

  if (!response.ok) {
    throw new Error(`Unable to fetch Tectonic release metadata (${response.status}).`);
  }

  const release = (await response.json()) as {
    assets?: Array<{ name?: string; browser_download_url?: string }>;
  };

  const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
  const asset = release.assets?.find(
    (entry) =>
      entry.name?.includes(`${arch}-apple-darwin`) &&
      entry.name.endsWith('.tar.gz') &&
      entry.browser_download_url,
  );

  if (!asset?.browser_download_url || !asset.name) {
    throw new Error('Could not find a macOS Tectonic download for this machine.');
  }

  const downloadPath = join(tmpdir(), asset.name);
  const download = await fetch(asset.browser_download_url, {
    headers: {
      'User-Agent': 'underleaf-app',
      Accept: 'application/octet-stream',
    },
  });

  if (!download.ok || !download.body) {
    throw new Error(`Unable to download Tectonic (${download.status}).`);
  }

  await pipeline(download.body, createWriteStream(downloadPath));
  return downloadPath;
}

async function extractTectonicArchive(archivePath: string): Promise<string> {
  const installDir = join(app.getPath('userData'), 'bin');
  await mkdir(installDir, { recursive: true });

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn('tar', ['-xzf', archivePath, '-C', installDir], { stdio: 'ignore' });
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        rejectPromise(new Error('Failed to extract the downloaded Tectonic archive.'));
      }
    });
  });

  const entries = await readdir(installDir, { withFileTypes: true });
  const tectonicFolder = entries.find((entry) => entry.isDirectory() && entry.name.startsWith('tectonic-'));
  const binaryPath = tectonicFolder
    ? join(installDir, tectonicFolder.name, 'tectonic')
    : join(installDir, 'tectonic');

  try {
    await access(binaryPath, fsConstants.X_OK);
  } catch {
    if (tectonicFolder) {
      const nestedBinary = join(installDir, tectonicFolder.name, 'tectonic');
      await copyFile(nestedBinary, join(installDir, 'tectonic'));
      await chmod(join(installDir, 'tectonic'), 0o755);
      return join(installDir, 'tectonic');
    }
    throw new Error('Tectonic binary was not found after extraction.');
  }

  if (tectonicFolder) {
    await copyFile(binaryPath, join(installDir, 'tectonic'));
    await chmod(join(installDir, 'tectonic'), 0o755);
    return join(installDir, 'tectonic');
  }

  return binaryPath;
}

async function getManagedTinyTexBinDir(): Promise<string | null> {
  const binRoot = join(getManagedTinyTexRootPath(), 'bin');
  try {
    const entries = await readdir(binRoot, { withFileTypes: true });
    const binEntry = entries.find((entry) => entry.isDirectory());
    return binEntry ? join(binRoot, binEntry.name) : null;
  } catch {
    return null;
  }
}

async function downloadManagedTinyTexArchive(): Promise<string> {
  const archivePath = join(tmpdir(), MANAGED_TINYTEX_ARCHIVE_NAME);
  const response = await fetch(
    `https://github.com/rstudio/tinytex-releases/releases/download/daily/${MANAGED_TINYTEX_ARCHIVE_NAME}`,
    {
      headers: {
        'User-Agent': 'underleaf-app',
        Accept: 'application/octet-stream',
      },
    },
  );

  if (!response.ok || !response.body) {
    throw new Error(`Unable to download TinyTeX (${response.status}).`);
  }

  await pipeline(response.body, createWriteStream(archivePath));
  return archivePath;
}

async function runCommandCollectOutput(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<{ code: number | null; signal: NodeJS.Signals | null; output: string }> {
  const output: string[] = [];

  const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
    });

    child.stdout.on('data', (chunk) => {
      output.push(chunk.toString());
    });

    child.stderr.on('data', (chunk) => {
      output.push(chunk.toString());
    });

    child.on('error', rejectPromise);
    child.on('exit', (code, signal) => resolvePromise({ code, signal }));
  });

  return {
    ...result,
    output: output.join(''),
  };
}

async function extractManagedTinyTexArchive(archivePath: string): Promise<string> {
  const installParent = getManagedTinyTexParentPath();
  await mkdir(installParent, { recursive: true });
  await rm(getManagedTinyTexRootPath(), { recursive: true, force: true });

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn('tar', ['-xf', archivePath, '-C', installParent], { stdio: 'ignore' });
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        rejectPromise(new Error('Failed to extract the downloaded TinyTeX archive.'));
      }
    });
  });

  const binDir = await getManagedTinyTexBinDir();
  if (!binDir) {
    throw new Error('TinyTeX installed, but its bin directory could not be found.');
  }

  const tlmgrPath = join(binDir, 'tlmgr');
  await access(tlmgrPath, fsConstants.X_OK);
  await runCommandCollectOutput(tlmgrPath, ['postaction', 'install', 'script', 'xetex'], {
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ''}`,
    },
  });

  return binDir;
}

async function installManagedTinyTex(kind: 'pdflatex' | 'xelatex' | 'lualatex'): Promise<TexEngine> {
  installState = 'installing';
  mainWindow?.webContents.send(
    'compile-status',
    `Installing managed TinyTeX with ${kind} support. This can take a minute the first time...`,
  );

  try {
    const archivePath = await downloadManagedTinyTexArchive();
    const binDir = await extractManagedTinyTexArchive(archivePath);
    const enginePath = join(binDir, kind);
    await access(enginePath, fsConstants.X_OK);
    const settings = await loadSettings();
    settings.texEngine = {
      kind,
      path: enginePath,
      source: 'managed',
    };
    await saveSettings(settings);
    installState = 'idle';
    cachedTexStatus = null;
    return {
      kind,
      path: enginePath,
      source: 'managed',
    };
  } catch (error) {
    installState = 'failed';
    throw error instanceof Error ? error : new Error('Managed TinyTeX installation failed.');
  }
}

async function installTexEngine(): Promise<TexStatus> {
  installState = 'installing';
  mainWindow?.webContents.send('compile-status', 'Installing local TeX engine...');

  try {
    const archivePath = await downloadLatestTectonicBinary();
    const binaryPath = await extractTectonicArchive(archivePath);
    const settings = await loadSettings();
    settings.texEngine = {
      kind: 'tectonic',
      path: binaryPath,
      source: 'managed',
    };
    await saveSettings(settings);
    installState = 'idle';
    return detectTexEngine();
  } catch (error) {
    installState = 'failed';
    const message = error instanceof Error ? error.message : 'TeX installation failed.';
    const status: TexStatus = {
      ready: false,
      checkedAt: new Date().toISOString(),
      message,
      installState,
    };
    cachedTexStatus = status;
    return status;
  }
}

function parseCompileIssues(output: string): CompileIssue[] {
  const issues: CompileIssue[] = [];
  const fileLineRegex = /^(.+?):(\d+):\s(.+)$/gm;
  let match = fileLineRegex.exec(output);
  while (match) {
    issues.push({
      file: match[1],
      line: Number.parseInt(match[2], 10),
      message: match[3].trim(),
    });
    match = fileLineRegex.exec(output);
  }

  if (issues.length === 0) {
    const errorMatch = output.match(/^!\s(.+)$/m);
    if (errorMatch) {
      issues.push({ message: errorMatch[1].trim() });
    }
  }

  return issues;
}

function extractMissingLatexFile(output: string): string | null {
  return (
    output.match(/LaTeX Error: File [`']([^`']+)['`] not found\./i)?.[1] ??
    output.match(/I can't find file [`']([^`']+)['`]/i)?.[1] ??
    null
  );
}

function needsPdftexCompatibilityShim(engine: TexEngine, source: string): boolean {
  if (engine.kind !== 'xelatex' && engine.kind !== 'lualatex') {
    return false;
  }

  return /\\input\{glyphtounicode\}/.test(source) || /\\pdfg(?:lyph|ent)ounicode\b/.test(source);
}

async function writePdftexCompatibilityWrapper(mainFilePath: string): Promise<string> {
  const wrapperPath = join(dirname(mainFilePath), '.underleaf-compile-wrapper.tex');
  const inputTarget = relative(dirname(wrapperPath), mainFilePath).replace(/\\/g, '/');
  const wrapperSource = [
    '\\RequirePackage{iftex}',
    '\\ifPDFTeX\\else',
    '\\providecommand{\\pdfglyphtounicode}[2]{}',
    '\\providecommand{\\pdfgentounicode}[1]{}',
    '\\fi',
    `\\input{${inputTarget}}`,
    '',
  ].join('\n');

  await writeFile(wrapperPath, wrapperSource, 'utf8');
  return wrapperPath;
}

function compileNeedsDownloadablePackages(output: string): boolean {
  return (
    /LaTeX Error: File [`'][^`']+\.(sty|cls|bst|bib|def)['`] not found/i.test(output) ||
    /I can't find file [`'][^`']+['`]/i.test(output) ||
    /! Emergency stop\./i.test(output)
  );
}

function detectPreferredEngineForSource(source: string): 'tectonic' | 'xelatex' | 'lualatex' {
  const explicitEngine = source.match(/^\s*%\s*!TEX\s+program\s*=\s*(xelatex|lualatex|pdflatex)\s*$/im)?.[1];
  if (explicitEngine === 'xelatex' || explicitEngine === 'lualatex') {
    return explicitEngine;
  }

  if (/\\usepackage(?:\[[^\]]*\])?\{fontspec\}/.test(source) || /\\setmainfont\b/.test(source) || /\\newfontfamily\b/.test(source)) {
    return 'xelatex';
  }

  if (/\\usepackage(?:\[[^\]]*\])?\{fontawesome5\}/.test(source)) {
    return 'xelatex';
  }

  return 'tectonic';
}

async function findAvailableSystemEngine(kind: 'xelatex' | 'lualatex'): Promise<TexEngine | null> {
  const candidates = [
    await findExecutableInPath(kind),
    `/Library/TeX/texbin/${kind}`,
  ];

  for (const candidatePath of candidates) {
    if (!candidatePath) {
      continue;
    }
    try {
      await access(candidatePath, fsConstants.X_OK);
      return {
        kind,
        path: candidatePath,
        source: 'system',
      };
    } catch {
      continue;
    }
  }

  return null;
}

async function findManagedTinyTexEngine(kind: 'pdflatex' | 'xelatex' | 'lualatex'): Promise<TexEngine | null> {
  const binDir = await getManagedTinyTexBinDir();
  if (!binDir) {
    return null;
  }

  const enginePath = join(binDir, kind);
  try {
    await access(enginePath, fsConstants.X_OK);
    return {
      kind,
      path: enginePath,
      source: 'managed',
    };
  } catch {
    return null;
  }
}

async function ensureManagedTexLiveEngine(kind: 'pdflatex' | 'xelatex' | 'lualatex'): Promise<TexEngine> {
  const managedEngine = await findManagedTinyTexEngine(kind);
  if (managedEngine) {
    return managedEngine;
  }

  return installManagedTinyTex(kind);
}

async function ensureDownloadableCompiler(): Promise<TexEngine> {
  const status = await detectTexEngine();
  if (status.ready && status.engine?.kind === 'tectonic') {
    return status.engine;
  }

  mainWindow?.webContents.send('compile-status', 'Preparing download-on-demand LaTeX compiler...');
  const installed = await installTexEngine();
  if (!installed.ready || !installed.engine) {
    throw new Error(installed.message || 'Unable to prepare the managed LaTeX compiler.');
  }

  return installed.engine;
}

async function resolveTexLivePackageForFile(engine: TexEngine, missingFile: string): Promise<string | null> {
  if (engine.kind === 'tectonic') {
    return null;
  }

  const binDir = dirname(engine.path);
  const tlmgrPath = join(binDir, 'tlmgr');
  try {
    await access(tlmgrPath, fsConstants.X_OK);
  } catch {
    return null;
  }

  const search = await runCommandCollectOutput(tlmgrPath, ['search', '--global', '--file', `/${missingFile}`], {
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ''}`,
    },
  });

  if (search.code !== 0) {
    return null;
  }

  const packages = search.output
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line && !line.startsWith(' ') && !line.startsWith('tlmgr:') && line.endsWith(':'))
    .map((line) => line.slice(0, -1));

  return packages[0] ?? null;
}

async function installTexLivePackage(engine: TexEngine, packageName: string): Promise<boolean> {
  if (engine.kind === 'tectonic') {
    return false;
  }

  const binDir = dirname(engine.path);
  const tlmgrPath = join(binDir, 'tlmgr');
  try {
    await access(tlmgrPath, fsConstants.X_OK);
  } catch {
    return false;
  }

  mainWindow?.webContents.send('compile-status', `Installing LaTeX package ${packageName}...`);
  const install = await runCommandCollectOutput(tlmgrPath, ['install', packageName], {
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ''}`,
    },
  });

  return install.code === 0;
}

async function runCompileWithEngine(
  engine: TexEngine,
  projectPath: string,
  mainFilePath: string,
  source: string,
): Promise<CompileResult> {
  await mkdir(join(projectPath, 'build'), { recursive: true });
  await mkdir(getTectonicCacheDir(), { recursive: true });

  mainWindow?.webContents.send(
    'compile-status',
    engine.kind === 'tectonic'
      ? 'Compiling PDF with Tectonic. Missing packages will download automatically if needed...'
      : engine.source === 'managed'
        ? `Compiling PDF with managed ${engine.kind}...`
        : `Compiling PDF with system ${engine.kind}...`,
  );

  const compileEntrypoint =
    needsPdftexCompatibilityShim(engine, source)
      ? await writePdftexCompatibilityWrapper(mainFilePath)
      : mainFilePath;
  const relativeMainFile = compileEntrypoint.slice(projectPath.length + 1);
  const jobName = basename(mainFilePath).replace(/\.tex$/i, '') || 'main';

  const args =
    engine.kind === 'pdflatex' || engine.kind === 'xelatex' || engine.kind === 'lualatex'
      ? [
          '-interaction=nonstopmode',
          '-halt-on-error',
          '-file-line-error',
          '-jobname',
          jobName,
          '-output-directory',
          'build',
          relativeMainFile,
        ]
      : ['--keep-logs', '--keep-intermediates', '--outdir', 'build', relativeMainFile];

  const result = await runCommandCollectOutput(engine.path, args, {
    cwd: projectPath,
    env: {
      ...process.env,
      PATH: `${dirname(engine.path)}:${process.env.PATH ?? ''}`,
      TECTONIC_CACHE_DIR: getTectonicCacheDir(),
    },
  });
  const combinedOutput = result.output;
  const pdfPath = join(projectPath, 'build', `${jobName}.pdf`);
  const logPath = join(projectPath, 'build', `${jobName}.log`);
  const compileResult: CompileResult = {
    ok: result.code === 0,
    pdfPath,
    logPath,
    output: combinedOutput,
    issues: parseCompileIssues(combinedOutput),
  };

  mainWindow?.webContents.send(
    'compile-status',
    compileResult.ok
      ? 'PDF compile finished.'
      : compileResult.issues.length > 0
        ? 'Compile failed. See the reported LaTeX errors below.'
        : engine.kind === 'tectonic'
          ? 'Compile failed. Tectonic could not resolve this project.'
          : 'Compile failed. The compiler stopped before producing a PDF.',
  );

  return compileResult;
}

async function runCompileWithPackageRecovery(
  engine: TexEngine,
  projectPath: string,
  mainFilePath: string,
  source: string,
): Promise<CompileResult> {
  let compileResult = await runCompileWithEngine(engine, projectPath, mainFilePath, source);
  const attemptedPackages = new Set<string>();

  for (let attempt = 0; attempt < MAX_PACKAGE_INSTALL_ATTEMPTS && !compileResult.ok; attempt += 1) {
    if (engine.source !== 'managed' || engine.kind === 'tectonic') {
      break;
    }

    const missingFile = extractMissingLatexFile(compileResult.output);
    if (!missingFile) {
      break;
    }

    const packageName = await resolveTexLivePackageForFile(engine, missingFile);
    if (!packageName || attemptedPackages.has(packageName)) {
      break;
    }

    attemptedPackages.add(packageName);
    const installed = await installTexLivePackage(engine, packageName);
    if (!installed) {
      break;
    }

    compileResult = await runCompileWithEngine(engine, projectPath, mainFilePath, source);
  }

  return compileResult;
}

async function compileProject(projectPath: string, mainFilePath: string): Promise<CompileResult> {
  const source = await readFile(mainFilePath, 'utf8');
  const preferredEngine = detectPreferredEngineForSource(source);
  let texStatus = cachedTexStatus ?? (await detectTexEngine());
  let selectedEngine: TexEngine;

  if (preferredEngine === 'xelatex' || preferredEngine === 'lualatex') {
    const preferredSystemEngine = await findAvailableSystemEngine(preferredEngine);
    if (preferredSystemEngine) {
      selectedEngine = preferredSystemEngine;
    } else {
      selectedEngine = await ensureManagedTexLiveEngine(preferredEngine);
    }
  } else if (texStatus.ready && texStatus.engine && (texStatus.engine.kind === 'tectonic' || texStatus.engine.kind === 'pdflatex')) {
    selectedEngine = texStatus.engine;
  } else {
    selectedEngine = await ensureDownloadableCompiler();
  }

  let compileResult = await runCompileWithPackageRecovery(selectedEngine, projectPath, mainFilePath, source);

  if (
    !compileResult.ok &&
    selectedEngine.kind !== 'tectonic' &&
    compileNeedsDownloadablePackages(compileResult.output)
  ) {
    if (preferredEngine === 'xelatex' || preferredEngine === 'lualatex') {
      mainWindow?.webContents.send(
        'compile-status',
        `System ${preferredEngine} is missing packages. Switching to managed TinyTeX and downloading what this project needs...`,
      );
      const fallbackEngine = await ensureManagedTexLiveEngine(preferredEngine);
      compileResult = await runCompileWithPackageRecovery(fallbackEngine, projectPath, mainFilePath, source);
    } else if (selectedEngine.kind === 'pdflatex') {
      mainWindow?.webContents.send(
        'compile-status',
        'System TeX is missing packages. Switching to managed Tectonic and downloading what the project needs...',
      );
      const fallbackEngine = await ensureDownloadableCompiler();
      compileResult = await runCompileWithPackageRecovery(fallbackEngine, projectPath, mainFilePath, source);
    }
  }

  texStatus = await detectTexEngine();
  return compileResult;
}

function registerIpcHandlers(): void {
  ipcMain.handle('bootstrap-state', async (): Promise<BootstrapState> => ({
    initialProjectPath: pendingInitialProjectPath,
  }));

  ipcMain.handle('list-recent-projects', async () => listRecentProjects());

  ipcMain.handle('create-project', async (_event, name: string, directory: string) => createProject(name, directory));

  ipcMain.handle('open-project-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
      title: 'Open Underleaf Project',
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return openProject(result.filePaths[0]);
  });

  ipcMain.handle('select-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Choose a Folder',
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMain.handle('open-project', async (_event, projectPath: string) => openProject(projectPath));

  ipcMain.handle('read-text-file', async (_event, filePath: string) => readFile(filePath, 'utf8'));

  ipcMain.handle('write-text-file', async (_event, filePath: string, content: string) => {
    await writeFile(filePath, content, 'utf8');
  });

  ipcMain.handle('read-binary-file', async (_event, filePath: string) => {
    const buffer = await readFile(filePath);
    return new Uint8Array(buffer);
  });

  ipcMain.handle('get-tex-status', async () => detectTexEngine());
  ipcMain.handle('install-tex-engine', async () => installTexEngine());
  ipcMain.handle('compile-project', async (_event, projectPath: string, mainFilePath: string) =>
    compileProject(projectPath, mainFilePath),
  );
}

async function initializeApp(): Promise<void> {
  const singleInstanceLock = app.requestSingleInstanceLock();
  if (!singleInstanceLock) {
    app.quit();
    return;
  }

  app.on('second-instance', (_event, argv) => {
    const requestedProjectPath = parseProjectPathFromArgv(argv);
    if (requestedProjectPath) {
      pendingInitialProjectPath = requestedProjectPath;
      mainWindow?.webContents.send('project-requested-open', requestedProjectPath);
    }

    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  await app.whenReady();
  registerIpcHandlers();
  await detectTexEngine();
  mainWindow = createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

initializeApp().catch((error) => {
  log.error(error);
  dialog.showErrorBox('Underleaf failed to start', error instanceof Error ? error.message : String(error));
  app.quit();
});
