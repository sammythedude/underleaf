import type * as Ast from '@unified-latex/unified-latex-types';
import { parse } from '@unified-latex/unified-latex-util-parse';
import { toString } from '@unified-latex/unified-latex-util-to-string';
import type {
  AbstractBlock,
  CodeBlock,
  DocumentInfo,
  DocumentMetadata,
  EquationBlock,
  ImageBlock,
  InlineSegment,
  ListBlock,
  ListItem,
  MathBlock,
  ParsedLatexDocument,
  SectionBlock,
  SourceLintIssue,
  SourceRange,
  TableBlock,
  TheoremBlock,
  UnsupportedBlock,
  VisualBlock,
} from './types';

// ── Constants ─────────────────────────────────────────────────────────────────

const SECTION_KINDS: Record<string, SectionBlock['kind']> = {
  chapter: 'chapter',
  section: 'section',
  subsection: 'subsection',
  subsubsection: 'subsubsection',
  'chapter*': 'chapter',
  'section*': 'section',
  'subsection*': 'subsection',
  'subsubsection*': 'subsubsection',
};

const SECTION_LABELS: Record<SectionBlock['kind'], string> = {
  chapter: 'Chapter',
  section: 'Section',
  subsection: 'Subsection',
  subsubsection: 'Subsubsection',
};

const SECTION_LEVELS: Record<SectionBlock['kind'], number> = {
  chapter: 0,
  section: 1,
  subsection: 2,
  subsubsection: 3,
};

const FORMATTING_MACROS: Record<string, InlineSegment['type']> = {
  textbf: 'bold',
  emph: 'italic',
  textit: 'italic',
  underline: 'underline',
  texttt: 'code',
  textsc: 'text',
  textrm: 'text',
  textsf: 'text',
};

const THEOREM_ENVS = new Set([
  'theorem', 'lemma', 'definition', 'corollary', 'proposition',
  'proof', 'remark', 'example', 'note', 'exercise', 'problem',
  'solution', 'claim', 'observation', 'conjecture', 'axiom',
  'criterion', 'assumption', 'hypothesis',
]);

const EQUATION_ENVS = new Set([
  'equation', 'equation*',
  'align', 'align*',
  'gather', 'gather*',
  'multline', 'multline*',
  'flalign', 'flalign*',
  'eqnarray', 'eqnarray*',
  'split',
]);

const CODE_ENVS = new Set([
  'verbatim', 'Verbatim', 'verbatim*',
  'lstlisting', 'minted', 'alltt',
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function getNodeRange(node: { position?: { start: { offset: number }; end: { offset: number } } }): SourceRange | undefined {
  if (!node.position) return undefined;
  return { start: node.position.start.offset, end: node.position.end.offset };
}

function getContentRange(nodes: Ast.Node[]): SourceRange | undefined {
  const pos = nodes.filter(n => n.position);
  if (pos.length === 0) return undefined;
  return { start: pos[0].position!.start.offset, end: pos[pos.length - 1].position!.end.offset };
}

function getMacroArg(macro: Ast.Macro, fromEnd = 1): Ast.Argument | undefined {
  if (!macro.args || macro.args.length === 0) return undefined;
  return macro.args[macro.args.length - fromEnd];
}

function getOptArg(macro: Ast.Macro): Ast.Argument | undefined {
  return macro.args?.find(a => a.openMark === '[');
}

function id(prefix: string, index: number) { return `${prefix}-${index}`; }

// ── Inline segments ───────────────────────────────────────────────────────────

function inlineSegments(nodes: Ast.Node[]): InlineSegment[] {
  const segs: InlineSegment[] = [];

  function pushText(v: string) {
    if (!v) return;
    const prev = segs[segs.length - 1];
    if (prev?.type === 'text') { prev.value += v; return; }
    segs.push({ type: 'text', value: v });
  }

  for (const node of nodes) {
    switch (node.type) {
      case 'string':    pushText(node.content); break;
      case 'whitespace': pushText(' '); break;
      case 'comment':   break;
      case 'group':     segs.push(...inlineSegments(node.content)); break;
      case 'inlinemath':
      case 'displaymath':
        segs.push({ type: 'math', value: toString(node.content).trim() });
        break;
      case 'macro': {
        if (node.content === '\\') { segs.push({ type: 'linebreak', value: '' }); break; }
        const fmt = FORMATTING_MACROS[node.content];
        if (fmt) {
          segs.push({ type: fmt, value: toString(node.args?.at(-1)?.content ?? []) });
          break;
        }
        if (node.content === 'href') {
          pushText(toString(node.args?.at(-1)?.content ?? []).trim() || toString(node.args?.[0]?.content ?? []).trim());
          break;
        }
        if (node.content === 'newline') { segs.push({ type: 'linebreak', value: '' }); break; }
        pushText(toString([node]));
        break;
      }
      default: pushText(toString([node])); break;
    }
  }

  return segs;
}

function previewFromSegments(segs: InlineSegment[]): string {
  return segs
    .map(s => s.type === 'linebreak' ? '\n' : s.type === 'math' ? `$${s.value}$` : s.value)
    .join('').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ── Document info ─────────────────────────────────────────────────────────────

function buildDocInfo(root: Ast.Root): DocumentInfo {
  let docClass = 'article';
  let docOptions = '';
  const packages: string[] = [];

  for (const node of root.content) {
    if (node.type !== 'macro') continue;

    if (node.content === 'documentclass') {
      const arg = getMacroArg(node);
      docClass = toString(arg?.content ?? []).trim() || 'article';
      const opt = getOptArg(node);
      docOptions = toString(opt?.content ?? []).trim();
    }

    if (node.content === 'usepackage') {
      const arg = getMacroArg(node);
      const pkgNames = toString(arg?.content ?? []).trim();
      // support \usepackage{pkg1,pkg2}
      pkgNames.split(',').map(p => p.trim()).filter(Boolean).forEach(p => packages.push(p));
    }
  }

  return { docClass, docOptions, packages };
}

// ── Metadata ──────────────────────────────────────────────────────────────────

const METADATA_KINDS: Record<string, DocumentMetadata['kind']> = {
  title: 'title', author: 'author', date: 'date',
  institute: 'institution', institution: 'institution',
  email: 'email', version: 'version',
};

function buildMetadata(root: Ast.Root): DocumentMetadata[] {
  const out: DocumentMetadata[] = [];
  for (const node of root.content) {
    if (node.type !== 'macro') continue;
    const kind = METADATA_KINDS[node.content];
    if (!kind) continue;
    const arg = getMacroArg(node);
    const value = toString(arg?.content ?? []).trim();
    out.push({
      id: `${node.content}-meta`,
      kind,
      label: node.content[0].toUpperCase() + node.content.slice(1),
      value,
      displayValue: previewFromSegments(inlineSegments(arg?.content ?? [])),
      range: getContentRange(arg?.content ?? []),
    });
  }
  return out;
}

// ── Block builders ─────────────────────────────────────────────────────────────

function buildSection(node: Ast.Macro, idx: number): SectionBlock | null {
  const kind = SECTION_KINDS[node.content];
  if (!kind) return null;
  const arg = getMacroArg(node);
  const segs = inlineSegments(arg?.content ?? []);
  return {
    id: id(node.content, idx),
    kind,
    label: SECTION_LABELS[kind],
    numbered: !node.content.endsWith('*'),
    sourceText: toString(arg?.content ?? []).trim(),
    previewText: previewFromSegments(segs),
    segments: segs,
    range: getContentRange(arg?.content ?? []),
    actionRange: getNodeRange(node),
  };
}

function buildAbstract(node: Ast.Environment, idx: number): AbstractBlock {
  const segs = inlineSegments(node.content);
  return {
    id: id('abstract', idx),
    kind: 'abstract',
    label: 'Abstract',
    sourceText: toString(node.content).trim(),
    previewText: previewFromSegments(segs).slice(0, 120),
    segments: segs,
    range: getNodeRange(node),
    actionRange: getNodeRange(node),
  };
}

function buildCode(node: Ast.Environment, idx: number): CodeBlock {
  // Extract language from optional arg: \begin{lstlisting}[language=Python]
  let language = '';
  if (node.args) {
    for (const arg of node.args) {
      const raw = toString(arg.content).trim();
      const match = raw.match(/language\s*=\s*([^,\]]+)/i);
      if (match) { language = match[1].trim(); break; }
    }
  }
  // For minted: \begin{minted}{python}
  if (node.env === 'minted' && node.args) {
    const req = node.args.find(a => a.openMark === '{');
    if (req) language = toString(req.content).trim();
  }
  const raw = toString(node.content).trim();
  return {
    id: id('code', idx),
    kind: 'code',
    label: language ? `Code (${language})` : 'Code Block',
    language,
    env: node.env,
    sourceText: raw,
    previewText: raw.slice(0, 60) + (raw.length > 60 ? '…' : ''),
    segments: [],
    range: getNodeRange(node),
    actionRange: getNodeRange(node),
  };
}

function buildEquation(node: Ast.Environment, idx: number): EquationBlock {
  const raw = toString(node.content).trim();
  const numbered = !node.env.endsWith('*');
  return {
    id: id('equation', idx),
    kind: 'equation',
    envName: node.env,
    numbered,
    label: numbered ? `Equation (${node.env})` : `Equation (${node.env})`,
    sourceText: raw,
    previewText: raw.slice(0, 80),
    segments: [],
    range: getNodeRange(node),
    actionRange: getNodeRange(node),
  };
}

function buildTheorem(node: Ast.Environment, idx: number): TheoremBlock {
  // Optional title: \begin{theorem}[Pythagoras]
  let theoremTitle = '';
  if (node.args) {
    const optArg = node.args.find(a => a.openMark === '[');
    if (optArg) theoremTitle = toString(optArg.content).trim();
  }
  const segs = inlineSegments(node.content);
  const envLabel = node.env[0].toUpperCase() + node.env.slice(1);
  return {
    id: id('theorem', idx),
    kind: 'theorem',
    envName: node.env,
    theoremTitle,
    label: theoremTitle ? `${envLabel}: ${theoremTitle}` : envLabel,
    sourceText: toString(node.content).trim(),
    previewText: previewFromSegments(segs).slice(0, 80),
    segments: segs,
    range: getNodeRange(node),
    actionRange: getNodeRange(node),
  };
}

function splitTabularRows(envContent: Ast.Node[]): string[][] {
  const rows: string[][] = [];
  let currentRow: Ast.Node[] = [];

  function flushRow() {
    // split by alignmentTab
    const cells: string[] = [];
    let cell: Ast.Node[] = [];
    for (const n of currentRow) {
      if (n.type === 'string' && n.content === '&') {
        cells.push(toString(cell).trim());
        cell = [];
      } else if (n.type === 'macro' && n.content === 'hline') {
        // skip
      } else {
        cell.push(n);
      }
    }
    cells.push(toString(cell).trim());
    // Only push non-empty rows
    if (cells.some(c => c !== '')) rows.push(cells);
    currentRow = [];
  }

  for (const node of envContent) {
    if (node.type === 'macro' && node.content === 'hline') continue;
    if (node.type === 'macro' && node.content === '\\') {
      flushRow();
    } else {
      currentRow.push(node);
    }
  }
  if (currentRow.length > 0) flushRow();
  return rows;
}

function getLeadingTableGroupContents(node: Ast.Environment): string[] {
  const fromArgs = node.args?.filter((arg) => arg.openMark === '{').map((arg) => toString(arg.content).trim()) ?? [];
  if (fromArgs.length > 0) {
    return fromArgs;
  }

  const values: string[] = [];
  let offset = 0;
  while (node.content[offset]?.type === 'group') {
    const head = node.content[offset] as Ast.Group;
    values.push(toString(head.content).trim());
    offset += 1;
  }
  return values;
}

function stripLeadingTableArgGroups(node: Ast.Environment): Ast.Node[] {
  const requiredArgs = getLeadingTableGroupContents(node);
  if (requiredArgs.length === 0) {
    return node.content;
  }

  let offset = 0;
  for (const arg of requiredArgs) {
    while (node.content[offset]?.type === 'whitespace') {
      offset += 1;
    }
    const head = node.content[offset];
    if (head?.type === 'group' && toString(head.content).trim() === arg) {
      offset += 1;
    }
  }

  return node.content.slice(offset);
}

function findInnerTableEnvironment(nodes: Ast.Node[]): Ast.Environment | null {
  return (
    nodes.find(
      (c): c is Ast.Environment =>
        c.type === 'environment' &&
        ['tabular', 'tabular*', 'tabularx', 'longtable'].includes(c.env),
    ) ?? null
  );
}

function buildTable(node: Ast.Environment, idx: number): TableBlock {
  // node can be 'table', 'table*', 'tabular', 'tabularx', 'longtable', etc.
  let tabularNode = node;
  let caption = '';
  let captionRange: SourceRange | undefined;
  let figLabel = '';
  let widthSpec = '';

  if (node.env === 'table' || node.env === 'table*') {
    const inner = findInnerTableEnvironment(node.content);
    if (inner) tabularNode = inner;

    const captionMacro = node.content.find(
      (c): c is Ast.Macro => c.type === 'macro' && c.content === 'caption',
    );
    if (captionMacro) {
      const arg = getMacroArg(captionMacro);
      caption = toString(arg?.content ?? []).trim();
      captionRange = getContentRange(arg?.content ?? []);
    }
    const labelMacro = node.content.find(
      (c): c is Ast.Macro => c.type === 'macro' && c.content === 'label',
    );
    if (labelMacro) {
      figLabel = toString(getMacroArg(labelMacro)?.content ?? []).trim();
    }
  }

  // Extract colSpec from tabular's required arg
  let colSpec = 'c';
  const requiredArgs = getLeadingTableGroupContents(tabularNode);
  if (requiredArgs.length > 0) {
    if (tabularNode.env === 'tabularx' || tabularNode.env === 'tabular*') {
      widthSpec = requiredArgs[0] ?? '';
      colSpec = requiredArgs[1] ?? 'X';
    } else {
      colSpec = requiredArgs[0] ?? 'c';
    }
  }

  const rows = splitTabularRows(stripLeadingTableArgGroups(tabularNode));
  const argPrefix = requiredArgs.map((arg) => `{${arg}}`).join('');
  if (argPrefix && rows[0]?.[0]?.startsWith(argPrefix)) {
    rows[0][0] = rows[0][0].slice(argPrefix.length).trim();
  }
  const raw = toString([node]).trim();

  return {
    id: id('table', idx),
    kind: 'table',
    envName: tabularNode.env,
    widthSpec,
    label: caption ? `Table: ${caption}` : 'Table',
    caption,
    captionRange,
    figLabel,
    colSpec,
    rows,
    sourceText: raw,
    previewText: caption || (rows[0]?.join(' | ') ?? 'Table'),
    segments: [],
    range: getNodeRange(node),
    actionRange: getNodeRange(node),
  };
}

function buildList(node: Ast.Environment, idx: number): ListBlock {
  const items: ListItem[] = node.content
    .filter((c): c is Ast.Macro => c.type === 'macro' && c.content === 'item')
    .map((item, iIdx) => {
      const arg = getMacroArg(item);
      const value = toString(arg?.content ?? []).trim();
      const segs = inlineSegments(arg?.content ?? []);
      return {
        id: `${id('list', idx)}-item-${iIdx}`,
        value,
        previewValue: previewFromSegments(segs),
        segments: segs,
        range: getContentRange(arg?.content ?? []),
      };
    });

  return {
    id: id('list', idx),
    kind: 'list',
    label: node.env === 'enumerate' ? 'Numbered List' : 'Bullet List',
    ordered: node.env === 'enumerate',
    items,
    sourceText: items.map(i => i.value).join('\n'),
    previewText: items.map(i => i.previewValue).join(' · ').slice(0, 80),
    segments: [],
    range: getNodeRange(node),
    actionRange: getNodeRange(node),
  };
}

function buildImage(node: Ast.Macro, idx: number, captionMacro?: Ast.Macro, labelMacro?: Ast.Macro, outerNode?: Ast.Environment): ImageBlock {
  const pathArg = getMacroArg(node);
  const widthArg = node.args?.find(a => a.openMark === '[');
  const path = toString(pathArg?.content ?? []).trim();
  const width = toString(widthArg?.content ?? []).trim().replace(/^width=/, '');
  const captionArg = captionMacro ? getMacroArg(captionMacro) : undefined;
  const captionValue = toString(captionArg?.content ?? []).trim();
  const figLabel = labelMacro ? toString(getMacroArg(labelMacro)?.content ?? []).trim() : '';

  const commandRange: SourceRange = {
    start: node.position?.start.offset ?? 0,
    end: getContentRange(pathArg?.content ?? [])?.end ?? node.position?.end.offset ?? 0,
  };

  return {
    id: id('image', idx),
    kind: 'image',
    label: 'Figure',
    path, width,
    caption: captionValue,
    figLabel,
    sourceText: [path, width && `width=${width}`, captionValue && `caption=${captionValue}`].filter(Boolean).join(' | '),
    previewText: captionValue || path,
    segments: captionValue ? [{ type: 'text', value: captionValue }] : [{ type: 'text', value: path }],
    range: outerNode ? getNodeRange(outerNode) : commandRange,
    actionRange: outerNode ? getNodeRange(outerNode) : commandRange,
    pathRange: getContentRange(pathArg?.content ?? []),
    widthRange: getContentRange(widthArg?.content ?? []),
    captionRange: getContentRange(captionArg?.content ?? []),
    commandRange,
  };
}

function buildParagraph(nodes: Ast.Node[], idx: number): VisualBlock | null {
  const filtered = nodes.filter(n => n.type !== 'comment');
  if (filtered.length === 0) return null;
  const segs = inlineSegments(filtered);
  const preview = previewFromSegments(segs);
  if (!preview) return null;
  return {
    id: id('paragraph', idx),
    kind: 'paragraph',
    label: 'Paragraph',
    sourceText: toString(filtered).trim(),
    previewText: preview,
    segments: segs,
    range: getContentRange(filtered),
    actionRange: getContentRange(filtered),
  };
}

function buildMath(node: Ast.Node, idx: number): MathBlock | null {
  const raw = toString([node]).trim();
  if (!raw) return null;
  return {
    id: id('math', idx),
    kind: 'math',
    label: 'Display Math',
    sourceText: raw.replace(/^\$\$|\$\$$/g, '').trim(),
    previewText: raw.slice(0, 80),
    segments: [],
    range: getNodeRange(node as Ast.Environment),
    actionRange: getNodeRange(node as Ast.Environment),
  };
}

// ── Image-finding helper (handles \includegraphics and \img custom cmd) ─────────

interface ImgInfo { path: string; width: string; }

/** Search a flat node list for \includegraphics or the \img custom command. */
function findImageInNodes(nodes: Ast.Node[]): ImgInfo | null {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.type !== 'macro') continue;

    // \includegraphics[width=...]{path}
    if (n.content === 'includegraphics') {
      const pathArg = getMacroArg(n);
      const widthArg = n.args?.find(a => a.openMark === '[');
      const path = toString(pathArg?.content ?? []).trim();
      const width = toString(widthArg?.content ?? []).trim().replace(/^width=/, '');
      if (path) return { path, width };
    }

    // \img{width}{path}  — custom \newcommand{\img}[2]{...}
    // @unified-latex may parse its braces as args OR leave them as sibling group nodes.
    if (n.content === 'img') {
      const mandatory = (n as Ast.Macro).args?.filter(a => a.openMark === '{') ?? [];
      if (mandatory.length >= 2) {
        return {
          width: toString(mandatory[0].content).trim(),
          path:  toString(mandatory[1].content).trim(),
        };
      }
      // Fallback: scan following group nodes as positional args
      const grps: string[] = [];
      for (let j = i + 1; j < nodes.length && grps.length < 2; j++) {
        const s = nodes[j];
        if (s.type === 'group') { grps.push(toString((s as { content: Ast.Node[] }).content).trim()); }
        else if (s.type !== 'whitespace') break;
      }
      if (grps.length >= 2) return { width: grps[0], path: grps[1] };
      if (grps.length === 1) return { path: grps[0], width: '' };
    }
  }
  return null;
}

function buildUnsupported(node: Ast.Environment, idx: number): UnsupportedBlock {
  return {
    id: id('unsupported', idx),
    kind: 'unsupported',
    label: `\\begin{${node.env}}`,
    sourceText: toString([node]).trim(),
    previewText: toString([node]).trim().slice(0, 100),
    segments: [],
    range: getNodeRange(node),
    actionRange: getNodeRange(node),
    warning: `${node.env} is not yet supported in visual mode.`,
  };
}

function assignActionRanges(blocks: VisualBlock[], bodyNodes: Ast.Node[], contentLength: number): void {
  const bodyRange = getContentRange(bodyNodes) ?? { start: 0, end: contentLength };

  for (const block of blocks) {
    if (!block.actionRange && block.range) {
      block.actionRange = { ...block.range };
    }
  }

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    if (!['chapter', 'section', 'subsection', 'subsubsection'].includes(block.kind)) {
      continue;
    }

    const start = block.actionRange?.start ?? block.range?.start;
    if (start === undefined) {
      continue;
    }

    let end = bodyRange.end;
    for (let j = i + 1; j < blocks.length; j += 1) {
      const next = blocks[j];
      if (!['chapter', 'section', 'subsection', 'subsubsection'].includes(next.kind)) {
        continue;
      }

      const currentLevel = SECTION_LEVELS[block.kind as SectionBlock['kind']];
      const nextLevel = SECTION_LEVELS[next.kind as SectionBlock['kind']];
      const nextStart = next.actionRange?.start ?? next.range?.start;
      if (nextStart !== undefined && nextLevel <= currentLevel) {
        end = nextStart;
        break;
      }
    }

    block.actionRange = { start, end };
  }
}

// ── Main parser ───────────────────────────────────────────────────────────────

function getBodyNodes(root: Ast.Root): Ast.Node[] {
  const docEnv = root.content.find(
    (n): n is Ast.Environment => n.type === 'environment' && n.env === 'document',
  );
  return docEnv?.content ?? root.content;
}

export function parseLatexDocument(content: string): ParsedLatexDocument {
  let root: Ast.Root;
  try {
    root = parse(content);
  } catch {
    return {
      docInfo: { docClass: 'article', docOptions: '', packages: [] },
      metadata: [],
      blocks: [],
      warnings: ['Parse error — check your LaTeX syntax.'],
    };
  }

  const docInfo  = buildDocInfo(root);
  const metadata = buildMetadata(root);
  const warnings: string[] = [];
  const blocks: VisualBlock[] = [];
  const bodyNodes = getBodyNodes(root);
  let parBuf: Ast.Node[] = [];

  const flushPar = () => {
    const block = buildParagraph(parBuf, blocks.length);
    if (block) blocks.push(block);
    parBuf = [];
  };

  for (let _i = 0; _i < bodyNodes.length; _i++) {
    const node = bodyNodes[_i];
    if (node.type === 'parbreak') { flushPar(); continue; }

    // Skip silent presentational macros
    if (node.type === 'macro' && ['maketitle', 'centering', 'tableofcontents', 'listoffigures', 'listoftables', 'hfill', 'hspace', 'vspace', 'vskip', 'smallskip', 'medskip', 'bigskip', 'noindent', 'indent'].includes(node.content)) {
      continue;
    }

    // Page break macros → visible separator in live view
    if (node.type === 'macro' && ['newpage', 'clearpage', 'cleardoublepage'].includes(node.content)) {
      flushPar();
      blocks.push({
        id: id('pagebreak', blocks.length),
        kind: 'pagebreak' as const,
        label: 'Page Break',
        sourceText: `\\${node.content}`,
        previewText: '─── page break ───',
        segments: [],
        range: getNodeRange(node as unknown as { position?: { start: { offset: number }; end: { offset: number } } }),
        actionRange: getNodeRange(node as unknown as { position?: { start: { offset: number }; end: { offset: number } } }),
      });
      continue;
    }

    // Headings
    if (node.type === 'macro' && node.content in SECTION_KINDS) {
      flushPar();
      const b = buildSection(node, blocks.length);
      if (b) blocks.push(b);
      continue;
    }

    // Standalone \includegraphics
    if (node.type === 'macro' && node.content === 'includegraphics') {
      flushPar();
      blocks.push(buildImage(node, blocks.length));
      continue;
    }

    // Standalone \img{width}{path} (custom command)
    if (node.type === 'macro' && node.content === 'img') {
      flushPar();
      const info = findImageInNodes(bodyNodes.slice(_i, _i + 4));
      if (info?.path) {
        blocks.push({
          id: id('image', blocks.length),
          kind: 'image' as const,
          label: 'Figure',
          path: info.path, width: info.width,
          caption: '', figLabel: '',
          sourceText: `\\img{${info.width}}{${info.path}}`,
          previewText: info.path,
          segments: [{ type: 'text' as const, value: info.path }],
          range: getNodeRange(node as unknown as { position?: { start: { offset: number }; end: { offset: number } } }),
          actionRange: getNodeRange(node as unknown as { position?: { start: { offset: number }; end: { offset: number } } }),
        });
      }
      continue;
    }

    // Display math $$...$$
    if (node.type === 'displaymath') {
      flushPar();
      const b = buildMath(node, blocks.length);
      if (b) blocks.push(b);
      continue;
    }

    if (node.type === 'environment') {
      flushPar();
      const env = node.env;

      // Abstract
      if (env === 'abstract') {
        blocks.push(buildAbstract(node, blocks.length));
        continue;
      }

      // Lists
      if (env === 'itemize' || env === 'enumerate' || env === 'description') {
        blocks.push(buildList(node, blocks.length));
        continue;
      }

      // Figure / figure*
      if (env === 'figure' || env === 'figure*') {
        const figContent = node.content as Ast.Node[];

        // Look for nested subfigure environments
        const subfigs = figContent.filter(
          (c): c is Ast.Environment =>
            c.type === 'environment' && (c.env === 'subfigure' || c.env === 'subfigure*'),
        );

        const capMacro = figContent.find((c): c is Ast.Macro => c.type === 'macro' && c.content === 'caption');
        const lblMacro = figContent.find((c): c is Ast.Macro => c.type === 'macro' && c.content === 'label');
        const captionStr   = capMacro ? toString(getMacroArg(capMacro)?.content ?? []).trim() : '';
        const figLabelStr  = lblMacro ? toString(getMacroArg(lblMacro)?.content ?? []).trim() : '';

        if (subfigs.length > 0) {
          // ── Multi-subfigure: collect individual paths ──────────────
          const subfigPaths = subfigs.map(sf => {
            const img = findImageInNodes(sf.content as Ast.Node[]);
            return img?.path ?? '';
          }).filter(Boolean);

          const n = subfigs.length;
          blocks.push({
            id: id('image', blocks.length),
            kind: 'image' as const,
            label: `Figure (${n} subfigure${n !== 1 ? 's' : ''})`,
            path:  subfigPaths[0] ?? '',
            width: '',
            caption:  captionStr || subfigPaths.slice(0, 2).join(' · '),
            figLabel: figLabelStr,
            sourceText:  toString([node]).trim(),
            previewText: captionStr || `${n} subfigures: ${subfigPaths.join(', ')}`,
            segments: [{ type: 'text' as const, value: captionStr || `${n} subfigures` }],
            range: getNodeRange(node),
            actionRange: getNodeRange(node),
          });
          continue;
        }

        // ── Simple figure: search for \includegraphics or \img ────────
        const imgInfo = findImageInNodes(figContent);
        if (imgInfo?.path) {
          const includeGraphicsMacro = figContent.find(
            (c): c is Ast.Macro => c.type === 'macro' && c.content === 'includegraphics',
          );

          if (includeGraphicsMacro) {
            blocks.push(buildImage(includeGraphicsMacro, blocks.length, capMacro, lblMacro, node));
          } else {
            blocks.push({
              id: id('image', blocks.length),
              kind: 'image' as const,
              label: 'Figure',
              path:  imgInfo.path,
              width: imgInfo.width,
              caption:  captionStr,
              figLabel: figLabelStr,
              sourceText:  toString([node]).trim(),
              previewText: captionStr || imgInfo.path,
              segments: captionStr
                ? [{ type: 'text' as const, value: captionStr }]
                : [{ type: 'text' as const, value: imgInfo.path }],
              range: getNodeRange(node),
              actionRange: getNodeRange(node),
            });
          }
        } else {
          blocks.push(buildUnsupported(node, blocks.length));
        }
        continue;
      }

      // Table
      if (env === 'table' || env === 'table*' || env === 'tabular' || env === 'tabular*' || env === 'tabularx' || env === 'longtable') {
        blocks.push(buildTable(node, blocks.length));
        continue;
      }

      // Code
      if (CODE_ENVS.has(env)) {
        blocks.push(buildCode(node, blocks.length));
        continue;
      }

      // Named equation environments
      if (EQUATION_ENVS.has(env)) {
        blocks.push(buildEquation(node, blocks.length));
        continue;
      }

      // Theorem-like
      if (THEOREM_ENVS.has(env)) {
        blocks.push(buildTheorem(node, blocks.length));
        continue;
      }

      // minipage / center / flushleft / flushright — recurse into content as paragraphs
      if (['center', 'flushleft', 'flushright', 'minipage', 'quote', 'quotation', 'verse'].includes(env)) {
        const segs = inlineSegments(node.content);
        const preview = previewFromSegments(segs);
        if (preview) {
          blocks.push({
            id: id('paragraph', blocks.length),
            kind: 'paragraph',
            label: 'Paragraph',
            sourceText: toString(node.content).trim(),
            previewText: preview,
            segments: segs,
            range: getNodeRange(node),
            actionRange: getNodeRange(node),
          });
        }
        continue;
      }

      // Fallback: unsupported environment
      const ub = buildUnsupported(node, blocks.length);
      warnings.push(ub.warning ?? ub.label);
      blocks.push(ub);
      continue;
    }

    // Everything else buffers into paragraph
    parBuf.push(node);
  }

  flushPar();
  assignActionRanges(blocks, bodyNodes, content.length);

  return { docInfo, metadata, blocks, warnings };
}

// ── Mutation helpers ──────────────────────────────────────────────────────────

export function replaceRange(content: string, range: SourceRange, value: string): string {
  return `${content.slice(0, range.start)}${value}${content.slice(range.end)}`;
}

export function upsertMetadata(content: string, kind: DocumentMetadata['kind'], value: string, range?: SourceRange): string {
  if (range) return replaceRange(content, range, value);
  const match = content.match(/\\begin\{document\}/);
  const ip = match?.index ?? 0;
  return `${content.slice(0, ip)}\\${kind}{${value}}\n${content.slice(ip)}`;
}

export function buildIncludeGraphicsCommand(path: string, width: string): string {
  return `\\includegraphics${width.trim() ? `[width=${width.trim()}]` : ''}{${path.trim()}}`;
}

export function applyImageBlockUpdate(content: string, block: ImageBlock, next: { path: string; width: string; caption: string }): string {
  let updated = content;
  const replacements: Array<{ range: SourceRange; value: string }> = [];

  if (block.commandRange) {
    replacements.push({ range: block.commandRange, value: buildIncludeGraphicsCommand(next.path, next.width) });
  }
  if (block.captionRange) {
    replacements.push({ range: block.captionRange, value: next.caption });
  }

  replacements
    .sort((a, b) => b.range.start - a.range.start)
    .forEach(r => { updated = replaceRange(updated, r.range, r.value); });

  if (!block.captionRange && next.caption.trim() && block.range) {
    updated = `${updated.slice(0, block.range.end)}\n\\caption{${next.caption}}${updated.slice(block.range.end)}`;
  }

  return updated;
}

export function applyListItemUpdates(content: string, block: ListBlock, values: string[]): string {
  let updated = content;
  block.items
    .map((item, i) => ({ item, value: values[i] ?? item.value }))
    .filter(({ item }) => item.range)
    .sort((a, b) => (b.item.range?.start ?? 0) - (a.item.range?.start ?? 0))
    .forEach(({ item, value }) => { updated = replaceRange(updated, item.range!, value); });
  return updated;
}

function buildTableEnvironment(block: TableBlock, rows: string[][]): string {
  const hline = '  \\hline\n';
  const rowLines = rows.map((cells) => `  ${cells.join(' & ')} \\\\`).join('\n' + hline);

  if (block.envName === 'tabularx') {
    return `\\begin{tabularx}{${block.widthSpec || '\\textwidth'}}{${block.colSpec}}\n${hline}${rowLines}\n${hline}\\end{tabularx}`;
  }
  if (block.envName === 'tabular*') {
    return `\\begin{tabular*}{${block.widthSpec || '\\textwidth'}}{${block.colSpec}}\n${hline}${rowLines}\n${hline}\\end{tabular*}`;
  }
  if (block.envName === 'longtable') {
    return `\\begin{longtable}{${block.colSpec}}\n${rowLines}\n\\end{longtable}`;
  }
  return `\\begin{tabular}{${block.colSpec}}\n${hline}${rowLines}\n${hline}\\end{tabular}`;
}

export function applyTableUpdate(content: string, block: TableBlock, rows: string[][], caption: string): string {
  if (!block.range) return content;

  const innerReplacement = buildTableEnvironment(block, rows);
  let replacement = content.slice(block.range.start, block.range.end).replace(
    /\\begin\{(?:tabular|tabular\*|tabularx|longtable)\}[\s\S]*?\\end\{(?:tabular|tabular\*|tabularx|longtable)\}/,
    innerReplacement,
  );

  if (block.captionRange || /\\caption\{/.test(replacement)) {
    replacement = replacement.replace(/\\caption\{[\s\S]*?\}/, `\\caption{${caption}}`);
  }

  return replaceRange(content, block.range, replacement);
}

export function applyTableCellUpdate(content: string, block: TableBlock, rows: string[][]): string {
  return applyTableUpdate(content, block, rows, block.caption);
}

function normalizeDocumentWhitespace(content: string): string {
  return content.replace(/\n{4,}/g, '\n\n\n');
}

function getEnvelopeRange(content: string, range: SourceRange): SourceRange {
  let start = range.start;
  let end = range.end;

  while (start > 0 && (content[start - 1] === ' ' || content[start - 1] === '\t')) {
    start -= 1;
  }
  while (end < content.length && (content[end] === ' ' || content[end] === '\t')) {
    end += 1;
  }

  let trailingNewlines = 0;
  while (end < content.length && content[end] === '\n' && trailingNewlines < 2) {
    end += 1;
    trailingNewlines += 1;
  }

  return { start, end };
}

function rangesOverlap(left: SourceRange, right: SourceRange): boolean {
  return left.start < right.end && right.start < left.end;
}

function getMovableRange(block: VisualBlock): SourceRange | undefined {
  return block.actionRange ?? block.range;
}

export function deleteBlockById(content: string, blocks: VisualBlock[], blockId: string): string {
  const block = blocks.find((entry) => entry.id === blockId);
  const range = block ? getMovableRange(block) : undefined;
  if (!range) return content;

  const envelope = getEnvelopeRange(content, range);
  return normalizeDocumentWhitespace(content.slice(0, envelope.start) + content.slice(envelope.end));
}

export function moveBlockById(
  content: string,
  blocks: VisualBlock[],
  blockId: string,
  direction: 'up' | 'down',
): string {
  const selected = blocks.find((entry) => entry.id === blockId);
  const selectedRange = selected ? getMovableRange(selected) : undefined;
  if (!selected || !selectedRange) return content;

  const comparableBlocks = ['chapter', 'section', 'subsection', 'subsubsection'].includes(selected.kind)
    ? blocks.filter((entry) => entry.id !== blockId && ['chapter', 'section', 'subsection', 'subsubsection'].includes(entry.kind))
    : blocks.filter((entry) => {
        if (entry.id === blockId) return false;
        const entryRange = getMovableRange(entry);
        return entryRange ? !rangesOverlap(selectedRange, entryRange) : false;
      });

  const ordered = comparableBlocks
    .map((entry) => ({ block: entry, range: getMovableRange(entry)! }))
    .sort((left, right) => left.range.start - right.range.start);

  const target = direction === 'up'
    ? [...ordered].reverse().find((entry) => entry.range.start < selectedRange.start)
    : ordered.find((entry) => entry.range.start > selectedRange.start);

  if (!target) return content;

  const selectedEnvelope = getEnvelopeRange(content, selectedRange);
  const targetEnvelope = getEnvelopeRange(content, target.range);
  const chunk = content.slice(selectedEnvelope.start, selectedEnvelope.end);
  const withoutSelected = content.slice(0, selectedEnvelope.start) + content.slice(selectedEnvelope.end);

  let insertionIndex = direction === 'up' ? targetEnvelope.start : targetEnvelope.end;
  if (selectedEnvelope.start < insertionIndex) {
    insertionIndex -= selectedEnvelope.end - selectedEnvelope.start;
  }

  return normalizeDocumentWhitespace(
    withoutSelected.slice(0, insertionIndex) + chunk + withoutSelected.slice(insertionIndex),
  );
}

export function moveBlockRelativeToBlock(
  content: string,
  blocks: VisualBlock[],
  blockId: string,
  targetId: string,
  placement: 'before' | 'after',
): string {
  if (blockId === targetId) return content;

  const selected = blocks.find((entry) => entry.id === blockId);
  const target = blocks.find((entry) => entry.id === targetId);
  const selectedRange = selected ? getMovableRange(selected) : undefined;
  const targetRange = target ? getMovableRange(target) : undefined;

  if (!selected || !target || !selectedRange || !targetRange) return content;
  if (rangesOverlap(selectedRange, targetRange)) return content;

  const selectedEnvelope = getEnvelopeRange(content, selectedRange);
  const targetEnvelope = getEnvelopeRange(content, targetRange);
  const chunk = content.slice(selectedEnvelope.start, selectedEnvelope.end);
  const withoutSelected = content.slice(0, selectedEnvelope.start) + content.slice(selectedEnvelope.end);

  let insertionIndex = placement === 'before' ? targetEnvelope.start : targetEnvelope.end;
  if (selectedEnvelope.start < insertionIndex) {
    insertionIndex -= selectedEnvelope.end - selectedEnvelope.start;
  }

  return normalizeDocumentWhitespace(
    withoutSelected.slice(0, insertionIndex) + chunk + withoutSelected.slice(insertionIndex),
  );
}

function isEscaped(content: string, index: number): boolean {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && content[cursor] === '\\'; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function commentBoundary(content: string, lineStart: number, lineEnd: number): number {
  for (let cursor = lineStart; cursor < lineEnd; cursor += 1) {
    if (content[cursor] === '%' && !isEscaped(content, cursor)) {
      return cursor;
    }
  }
  return lineEnd;
}

export function lintLatexSource(content: string): SourceLintIssue[] {
  const issues: SourceLintIssue[] = [];
  const braceStack: number[] = [];
  const beginStack: Array<{ env: string; startOffset: number; nameStart: number; nameEnd: number }> = [];
  const inlineMathStack: number[] = [];
  const displayMathStack: number[] = [];

  try {
    parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'LaTeX parse error.';
    issues.push({
      severity: 'error',
      message,
      startOffset: 0,
      endOffset: Math.min(content.length, 1),
    });
  }

  let lineStart = 0;
  while (lineStart <= content.length) {
    const rawLineEnd = content.indexOf('\n', lineStart);
    const lineEnd = rawLineEnd === -1 ? content.length : rawLineEnd;
    const scanEnd = commentBoundary(content, lineStart, lineEnd);

    let cursor = lineStart;
    while (cursor < scanEnd) {
      const char = content[cursor];

      if (char === '\\') {
        const tail = content.slice(cursor);
        const beginMatch = tail.match(/^\\begin\{([^}]+)\}/);
        if (beginMatch) {
          const env = beginMatch[1];
          const braceOffset = cursor + beginMatch[0].indexOf('{') + 1;
          beginStack.push({
            env,
            startOffset: cursor,
            nameStart: braceOffset,
            nameEnd: braceOffset + env.length,
          });
          cursor += beginMatch[0].length;
          continue;
        }

        const endMatch = tail.match(/^\\end\{([^}]+)\}/);
        if (endMatch) {
          const env = endMatch[1];
          const braceOffset = cursor + endMatch[0].indexOf('{') + 1;
          const open = beginStack.pop();
          if (!open) {
            issues.push({
              severity: 'error',
              message: `Unexpected \\end{${env}}.`,
              startOffset: braceOffset,
              endOffset: braceOffset + env.length,
            });
          } else if (open.env !== env) {
            beginStack.push(open);
            issues.push({
              severity: 'error',
              message: `\\end{${env}} closes the wrong environment. Expected \\end{${open.env}}.`,
              startOffset: braceOffset,
              endOffset: braceOffset + env.length,
            });
          }
          cursor += endMatch[0].length;
          continue;
        }

        cursor += 1;
        continue;
      }

      if (char === '{') {
        braceStack.push(cursor);
        cursor += 1;
        continue;
      }

      if (char === '}') {
        const openBrace = braceStack.pop();
        if (openBrace === undefined) {
          issues.push({
            severity: 'error',
            message: 'Unexpected closing brace.',
            startOffset: cursor,
            endOffset: cursor + 1,
          });
        }
        cursor += 1;
        continue;
      }

      if (char === '$' && !isEscaped(content, cursor)) {
        const isDisplay = content[cursor + 1] === '$';
        if (isDisplay) {
          if (displayMathStack.length > 0) {
            displayMathStack.pop();
          } else {
            displayMathStack.push(cursor);
          }
          cursor += 2;
          continue;
        }
        if (inlineMathStack.length > 0) {
          inlineMathStack.pop();
        } else {
          inlineMathStack.push(cursor);
        }
      }

      cursor += 1;
    }

    if (rawLineEnd === -1) break;
    lineStart = rawLineEnd + 1;
  }

  braceStack.forEach((startOffset) => {
    issues.push({
      severity: 'error',
      message: 'Unclosed opening brace.',
      startOffset,
      endOffset: startOffset + 1,
    });
  });

  beginStack.forEach((open) => {
    issues.push({
      severity: 'error',
      message: `Unclosed environment \\begin{${open.env}}.`,
      startOffset: open.nameStart,
      endOffset: open.nameEnd,
    });
  });

  inlineMathStack.forEach((startOffset) => {
    issues.push({
      severity: 'warning',
      message: 'Unclosed inline math delimiter `$`.',
      startOffset,
      endOffset: startOffset + 1,
    });
  });

  displayMathStack.forEach((startOffset) => {
    issues.push({
      severity: 'warning',
      message: 'Unclosed display math delimiter `$$`.',
      startOffset,
      endOffset: Math.min(content.length, startOffset + 2),
    });
  });

  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.severity}:${issue.message}:${issue.startOffset}:${issue.endOffset}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((left, right) => left.startOffset - right.startOffset);
}

/** Insert latex snippet after the given range (or at end of document). */
export function insertAfterBlock(content: string, range: SourceRange | undefined, latex: string): string {
  const snippet = '\n\n' + latex.trim() + '\n';
  if (range) {
    return content.slice(0, range.end) + snippet + content.slice(range.end);
  }
  const endIdx = content.lastIndexOf('\\end{document}');
  if (endIdx >= 0) {
    return content.slice(0, endIdx).trimEnd() + snippet + '\n' + content.slice(endIdx);
  }
  return content.trimEnd() + snippet;
}

/** Templates for each insertable block type. */
export const BLOCK_TEMPLATES: Record<string, string> = {
  section:       '\\section{New Section}\n\nParagraph text here.',
  subsection:    '\\subsection{New Subsection}\n\nParagraph text here.',
  subsubsection: '\\subsubsection{New Subsubsection}\n\nParagraph text here.',
  chapter:       '\\chapter{New Chapter}\n\nChapter introduction here.',
  paragraph:     'New paragraph text here.',
  abstract:      '\\begin{abstract}\nAbstract text here.\n\\end{abstract}',
  itemize:       '\\begin{itemize}\n  \\item First item\n  \\item Second item\n  \\item Third item\n\\end{itemize}',
  enumerate:     '\\begin{enumerate}\n  \\item First item\n  \\item Second item\n  \\item Third item\n\\end{enumerate}',
  figure:        '\\begin{figure}[h]\n  \\centering\n  \\includegraphics[width=0.8\\textwidth]{image.png}\n  \\caption{Figure caption.}\n  \\label{fig:label}\n\\end{figure}',
  table:         '\\begin{table}[h]\n  \\centering\n  \\begin{tabular}{|c|c|c|}\n    \\hline\n    Header 1 & Header 2 & Header 3 \\\\\n    \\hline\n    A & B & C \\\\\n    D & E & F \\\\\n    \\hline\n  \\end{tabular}\n  \\caption{Table caption.}\n  \\label{tab:label}\n\\end{table}',
  equation:      '\\begin{equation}\n  f(x) = ax^2 + bx + c\n  \\label{eq:label}\n\\end{equation}',
  align:         '\\begin{align}\n  f(x) &= ax^2 + bx + c \\\\\n  g(x) &= dx + e\n\\end{align}',
  lstlisting:    '\\begin{lstlisting}[language=Python]\n# Your code here\nprint("Hello, World!")\n\\end{lstlisting}',
  verbatim:      '\\begin{verbatim}\nVerbatim text here.\n\\end{verbatim}',
  theorem:       '\\begin{theorem}\nTheorem statement here.\n\\end{theorem}',
  lemma:         '\\begin{lemma}\nLemma statement here.\n\\end{lemma}',
  definition:    '\\begin{definition}\nDefinition here.\n\\end{definition}',
  proof:         '\\begin{proof}\nProof here.\n\\end{proof}',
};
