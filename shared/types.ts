export type EditorMode = 'code' | 'visual';
export type PreviewMode = 'live' | 'pdf';

export interface SourceRange {
  start: number;
  end: number;
}

export interface InlineSegment {
  type: 'text' | 'bold' | 'italic' | 'underline' | 'math' | 'linebreak' | 'code';
  value: string;
}

// ── Metadata (preamble) ────────────────────────────────
export interface DocumentMetadata {
  id: string;
  kind: 'title' | 'author' | 'date' | 'institution' | 'email' | 'version';
  label: string;
  value: string;
  displayValue: string;
  range?: SourceRange;
}

// ── Document info ──────────────────────────────────────
export interface DocumentInfo {
  docClass: string;        // 'article' | 'report' | 'book' | 'beamer' | ...
  docOptions: string;      // e.g. '12pt,a4paper'
  packages: string[];      // detected \usepackage names
}

// ── Base block ─────────────────────────────────────────
export interface BaseBlock {
  id: string;
  label: string;
  sourceText: string;
  previewText: string;
  segments: InlineSegment[];
  range?: SourceRange;
  actionRange?: SourceRange;
  warning?: string;
}

// ── Heading blocks ─────────────────────────────────────
export interface SectionBlock extends BaseBlock {
  kind: 'chapter' | 'section' | 'subsection' | 'subsubsection';
  numbered: boolean; // false for chapter*, section*, etc.
}

// ── Body text ──────────────────────────────────────────
export interface ParagraphBlock extends BaseBlock {
  kind: 'paragraph';
}

// ── Abstract ───────────────────────────────────────────
export interface AbstractBlock extends BaseBlock {
  kind: 'abstract';
}

// ── Math display ───────────────────────────────────────
/** Inline display-math paragraph ($$…$$) */
export interface MathBlock extends BaseBlock {
  kind: 'math';
}

/** Named equation environments: equation, align, gather, etc. */
export interface EquationBlock extends BaseBlock {
  kind: 'equation';
  envName: string;   // 'equation', 'align', 'gather', etc.
  numbered: boolean; // false for starred variants
}

// ── Lists ──────────────────────────────────────────────
export interface ListItem {
  id: string;
  value: string;
  previewValue: string;
  segments: InlineSegment[];
  range?: SourceRange;
}

export interface ListBlock extends BaseBlock {
  kind: 'list';
  ordered: boolean;
  items: ListItem[];
}

// ── Figures ────────────────────────────────────────────
export interface ImageBlock extends BaseBlock {
  kind: 'image';
  path: string;
  width: string;
  caption: string;
  figLabel: string; // \label{...} inside the figure
  pathRange?: SourceRange;
  widthRange?: SourceRange;
  captionRange?: SourceRange;
  commandRange?: SourceRange;
}

// ── Tables ─────────────────────────────────────────────
export interface TableBlock extends BaseBlock {
  kind: 'table';
  envName: string;
  widthSpec?: string;
  caption: string;
  captionRange?: SourceRange;
  figLabel: string;
  colSpec: string;
  rows: string[][];   // [row][col] = cell text
}

// ── Code / verbatim ────────────────────────────────────
export interface CodeBlock extends BaseBlock {
  kind: 'code';
  language: string;  // 'python', 'javascript', '', etc.
  env: string;       // 'verbatim', 'lstlisting', 'minted'
}

// ── Theorem-like environments ──────────────────────────
export interface TheoremBlock extends BaseBlock {
  kind: 'theorem';
  envName: string;       // 'theorem', 'lemma', 'definition', 'proof', etc.
  theoremTitle: string;  // optional title from \begin{theorem}[Title]
}

// ── Page break ─────────────────────────────────────────
export interface PageBreakBlock extends BaseBlock {
  kind: 'pagebreak';
}

// ── Unsupported fallback ───────────────────────────────
export interface UnsupportedBlock extends BaseBlock {
  kind: 'unsupported';
}

// ── Union ──────────────────────────────────────────────
export type VisualBlock =
  | SectionBlock
  | ParagraphBlock
  | AbstractBlock
  | MathBlock
  | EquationBlock
  | ListBlock
  | ImageBlock
  | TableBlock
  | CodeBlock
  | TheoremBlock
  | PageBreakBlock
  | UnsupportedBlock;

// ── Parsed document ────────────────────────────────────
export interface ParsedLatexDocument {
  docInfo: DocumentInfo;
  metadata: DocumentMetadata[];
  blocks: VisualBlock[];
  warnings: string[];
}

export interface SourceLintIssue {
  severity: 'error' | 'warning';
  message: string;
  startOffset: number;
  endOffset: number;
}

// ── Project / file ────────────────────────────────────
export interface ProjectFile {
  absolutePath: string;
  relativePath: string;
  kind: 'tex' | 'asset';
}

export interface ProjectSummary {
  name: string;
  projectPath: string;
  mainFilePath: string;
  lastOpenedAt: string;
}

export interface OpenedProject {
  summary: ProjectSummary;
  files: ProjectFile[];
}

// ── Compile ────────────────────────────────────────────
export interface CompileIssue {
  file?: string;
  line?: number;
  message: string;
}

export interface CompileResult {
  ok: boolean;
  pdfPath?: string;
  logPath?: string;
  output: string;
  issues: CompileIssue[];
}

// ── TeX engine ────────────────────────────────────────
export interface TexEngine {
  kind: 'pdflatex' | 'xelatex' | 'lualatex' | 'tectonic';
  path: string;
  source: 'system' | 'managed';
}

export interface TexStatus {
  ready: boolean;
  engine?: TexEngine;
  checkedAt: string;
  message: string;
  installState: 'idle' | 'installing' | 'failed';
}

export interface BootstrapState {
  initialProjectPath?: string;
}

// ── Electron API ──────────────────────────────────────
export interface UnderleafApi {
  getBootstrapState: () => Promise<BootstrapState>;
  listRecentProjects: () => Promise<ProjectSummary[]>;
  createProject: (name: string, directory: string) => Promise<OpenedProject>;
  openProjectDialog: () => Promise<OpenedProject | null>;
  openProject: (projectPath: string) => Promise<OpenedProject>;
  selectDirectory: () => Promise<string | null>;
  readTextFile: (filePath: string) => Promise<string>;
  writeTextFile: (filePath: string, content: string) => Promise<void>;
  readBinaryFile: (filePath: string) => Promise<Uint8Array>;
  getTexStatus: () => Promise<TexStatus>;
  installTexEngine: () => Promise<TexStatus>;
  compileProject: (projectPath: string, mainFilePath: string) => Promise<CompileResult>;
  onProjectRequestedOpen: (listener: (projectPath: string) => void) => () => void;
  onCompileStatus: (listener: (message: string) => void) => () => void;
}
