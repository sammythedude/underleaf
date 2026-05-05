import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react';
import { BLOCK_TEMPLATES } from '../../shared/latex';
import type {
  CodeBlock,
  DocumentMetadata,
  EquationBlock,
  ImageBlock,
  ListBlock,
  ParsedLatexDocument,
  TableBlock,
  TheoremBlock,
  VisualBlock,
} from '../../shared/types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Sel =
  | { type: 'docinfo' }
  | { type: 'metadata'; id: string }
  | { type: 'block'; id: string }
  | null;

interface Props {
  parsed: ParsedLatexDocument;
  selection: Sel;
  onSelectionChange: (s: Sel) => void;
  onMetadataChange: (m: DocumentMetadata, v: string) => void;
  onBlockChange: (b: VisualBlock, v: string) => void;
  onListChange: (b: ListBlock, vs: string[]) => void;
  onImageChange: (b: ImageBlock, nx: { path: string; width: string; caption: string }) => void;
  onTableChange: (b: TableBlock, rows: string[][], caption: string) => void;
  onInsertBlock: (template: string, afterRange?: { start: number; end: number }) => void;
  onDeleteBlock: (b: VisualBlock) => void;
  onMoveBlock: (blockId: string, targetId: string, placement: 'before' | 'after') => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Outline badge helpers
// ─────────────────────────────────────────────────────────────────────────────

function getBadge(kind: string): { label: string; cls: string; indent: number } {
  switch (kind) {
    case 'chapter':       return { label: 'Ch',   cls: 'vb-chapter',  indent: 0 };
    case 'section':       return { label: 'H1',   cls: 'vb-sec',      indent: 0 };
    case 'subsection':    return { label: 'H2',   cls: 'vb-sub',      indent: 12 };
    case 'subsubsection': return { label: 'H3',   cls: 'vb-sub',      indent: 24 };
    case 'paragraph':     return { label: '¶',    cls: 'vb-par',      indent: 0 };
    case 'abstract':      return { label: 'Abs',  cls: 'vb-abs',      indent: 0 };
    case 'list':          return { label: 'List', cls: 'vb-lst',      indent: 0 };
    case 'image':         return { label: 'Fig',  cls: 'vb-fig',      indent: 0 };
    case 'table':         return { label: 'Tbl',  cls: 'vb-tbl',      indent: 0 };
    case 'code':          return { label: 'Code', cls: 'vb-code',     indent: 0 };
    case 'theorem':       return { label: 'Thm',  cls: 'vb-thm',      indent: 0 };
    case 'equation':      return { label: 'Eq',   cls: 'vb-mat',      indent: 0 };
    case 'math':          return { label: '∑',    cls: 'vb-mat',      indent: 0 };
    case 'pagebreak':     return { label: 'PB',   cls: 'vb-meta',     indent: 0 };
    default:              return { label: '?',    cls: 'vb-meta',     indent: 0 };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Insert menu groups
// ─────────────────────────────────────────────────────────────────────────────

const INSERT_GROUPS = [
  {
    label: 'Structure',
    items: [
      { key: 'section',       label: 'Section' },
      { key: 'subsection',    label: 'Subsection' },
      { key: 'subsubsection', label: 'Subsubsection' },
      { key: 'chapter',       label: 'Chapter' },
      { key: 'abstract',      label: 'Abstract' },
    ],
  },
  {
    label: 'Content',
    items: [
      { key: 'paragraph',  label: 'Paragraph' },
      { key: 'itemize',    label: 'Bullet List' },
      { key: 'enumerate',  label: 'Numbered List' },
      { key: 'figure',     label: 'Figure' },
      { key: 'table',      label: 'Table' },
    ],
  },
  {
    label: 'Math',
    items: [
      { key: 'equation',   label: 'Equation' },
      { key: 'align',      label: 'Align' },
    ],
  },
  {
    label: 'Code',
    items: [
      { key: 'lstlisting', label: 'Code Block' },
      { key: 'verbatim',   label: 'Verbatim' },
    ],
  },
  {
    label: 'Theorems',
    items: [
      { key: 'theorem',    label: 'Theorem' },
      { key: 'lemma',      label: 'Lemma' },
      { key: 'definition', label: 'Definition' },
      { key: 'proof',      label: 'Proof' },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Sub-editors
// ─────────────────────────────────────────────────────────────────────────────

const THEOREM_ENV_LABELS: Record<string, string> = {
  theorem: 'Theorem', lemma: 'Lemma', definition: 'Definition',
  corollary: 'Corollary', proposition: 'Proposition', proof: 'Proof',
  remark: 'Remark', example: 'Example', note: 'Note', exercise: 'Exercise',
  problem: 'Problem', claim: 'Claim', axiom: 'Axiom', conjecture: 'Conjecture',
};

const CODE_LANGUAGES = [
  '', 'Python', 'JavaScript', 'TypeScript', 'Java', 'C', 'C++', 'C#',
  'Rust', 'Go', 'R', 'MATLAB', 'Bash', 'SQL', 'HTML', 'CSS',
  'LaTeX', 'Haskell', 'Scala', 'Ruby', 'PHP', 'Swift', 'Kotlin',
];

const DOC_CLASSES = ['article', 'report', 'book', 'beamer', 'memoir', 'thesis', 'IEEEtran', 'acmart'];

const FORMATTING_SNIPPETS = [
  { label: 'Bold',       val: '\\textbf{}',    tip: 'Bold text' },
  { label: 'Italic',     val: '\\textit{}',    tip: 'Italic text' },
  { label: 'Underline',  val: '\\underline{}', tip: 'Underlined text' },
  { label: 'Mono',       val: '\\texttt{}',    tip: 'Monospace / code' },
  { label: 'Emph',       val: '\\emph{}',      tip: 'Semantic emphasis' },
  { label: '$ Math',     val: '$$',            tip: 'Inline math' },
  { label: 'Footnote',   val: '\\footnote{}',  tip: 'Footnote' },
  { label: 'Cite',       val: '\\cite{}',      tip: 'Citation' },
  { label: 'Ref',        val: '\\ref{}',       tip: 'Cross-reference' },
  { label: 'Label',      val: '\\label{}',     tip: 'Add label' },
  { label: 'Href',       val: '\\href{url}{text}', tip: 'Hyperlink' },
];

const MATH_SNIPPETS = [
  { label: 'frac',    val: '\\frac{}{}' },
  { label: 'sqrt',    val: '\\sqrt{}' },
  { label: 'sum',     val: '\\sum_{i=1}^{n}' },
  { label: 'int',     val: '\\int_{a}^{b}' },
  { label: 'lim',     val: '\\lim_{x \\to 0}' },
  { label: 'infty',   val: '\\infty' },
  { label: 'in',      val: '\\in' },
  { label: 'forall',  val: '\\forall' },
  { label: 'exists',  val: '\\exists' },
  { label: 'leq',     val: '\\leq' },
  { label: 'geq',     val: '\\geq' },
  { label: 'neq',     val: '\\neq' },
  { label: 'approx',  val: '\\approx' },
  { label: 'cdot',    val: '\\cdot' },
  { label: 'times',   val: '\\times' },
  { label: 'alpha',   val: '\\alpha' },
  { label: 'beta',    val: '\\beta' },
  { label: 'gamma',   val: '\\gamma' },
  { label: 'delta',   val: '\\delta' },
  { label: 'lambda',  val: '\\lambda' },
  { label: 'mu',      val: '\\mu' },
  { label: 'sigma',   val: '\\sigma' },
  { label: 'pi',      val: '\\pi' },
  { label: 'theta',   val: '\\theta' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function VisualEditor({
  parsed,
  selection,
  onSelectionChange,
  onMetadataChange,
  onBlockChange,
  onListChange,
  onImageChange,
  onTableChange,
  onInsertBlock,
  onDeleteBlock,
  onMoveBlock,
}: Props) {
  const [draftValue, setDraftValue] = useState('');
  const [listDrafts, setListDrafts] = useState<string[]>([]);
  const [imgDraft, setImgDraft]     = useState({ path: '', width: '', caption: '' });
  const [tableRows, setTableRows]   = useState<string[][]>([]);
  const [showInsert, setShowInsert] = useState(false);
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<{ targetId: string; placement: 'before' | 'after' } | null>(null);

  const selMeta  = useMemo(
    () => selection?.type === 'metadata' ? parsed.metadata.find(m => m.id === selection.id) ?? null : null,
    [parsed.metadata, selection],
  );
  const selBlock = useMemo(
    () => selection?.type === 'block' ? parsed.blocks.find(b => b.id === selection.id) ?? null : null,
    [parsed.blocks, selection],
  );

  // Auto-select first item
  useEffect(() => {
    if (!selection) {
      if (parsed.metadata[0]) onSelectionChange({ type: 'metadata', id: parsed.metadata[0].id });
      else if (parsed.blocks[0]) onSelectionChange({ type: 'block', id: parsed.blocks[0].id });
    }
  }, [onSelectionChange, parsed.blocks, parsed.metadata, selection]);

  // Sync drafts only when the selected field changes. Re-syncing on every parse
  // causes the caret to jump while the user is typing in visual mode.
  useEffect(() => {
    if (selMeta) {
      setDraftValue(selMeta.value);
    } else if (selBlock?.kind === 'list') {
      setListDrafts(selBlock.items.map(i => i.value));
    } else if (selBlock?.kind === 'image') {
      setImgDraft({ path: selBlock.path, width: selBlock.width, caption: selBlock.caption });
    } else if (selBlock?.kind === 'table') {
      setTableRows(selBlock.rows.map(r => [...r]));
    } else if (selBlock) {
      setDraftValue(selBlock.sourceText);
    } else {
      setDraftValue('');
    }
  }, [selection?.type, selection?.type === 'docinfo' ? 'docinfo' : selection?.id]);

  const insertSnippet = useCallback((val: string) => {
    setDraftValue(prev => prev + val);
    if (selBlock && selBlock.kind !== 'list' && selBlock.kind !== 'image' && selBlock.kind !== 'table') {
      const next = draftValue + val;
      onBlockChange(selBlock, next);
    }
  }, [draftValue, selBlock, onBlockChange]);

  const handleInsert = useCallback((key: string) => {
    const tpl = BLOCK_TEMPLATES[key];
    if (!tpl) return;
    onInsertBlock(tpl, selBlock?.range ?? selMeta?.range);
    setShowInsert(false);
  }, [selBlock, selMeta, onInsertBlock]);

  const dragPlacement = useCallback((event: DragEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY - rect.top < rect.height / 2 ? 'before' as const : 'after' as const;
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="ve-shell">

      {/* ── Outline ─────────────────────────────────── */}
      <aside className="ve-outline">
        <div className="ve-outline-scroll">

          {/* Document info item */}
          <div className="ve-group">
            <button
              className={`ve-item ${selection?.type === 'docinfo' ? 'on' : ''}`}
              onClick={() => onSelectionChange({ type: 'docinfo' })}
            >
              <div className="ve-item-row">
                <span className="ve-badge vb-meta">Doc</span>
                <span className="ve-item-name">Document Settings</span>
              </div>
              <div className="ve-item-preview">{parsed.docInfo.docClass}</div>
            </button>
          </div>

          {parsed.metadata.length > 0 && (
            <div className="ve-group">
              <div className="ve-group-label">Metadata</div>
              {parsed.metadata.map(m => (
                <button
                  key={m.id}
                  className={`ve-item ${selection?.type === 'metadata' && selection.id === m.id ? 'on' : ''}`}
                  onClick={() => onSelectionChange({ type: 'metadata', id: m.id })}
                >
                  <div className="ve-item-row">
                    <span className="ve-badge vb-meta">Meta</span>
                    <span className="ve-item-name">{m.label}</span>
                  </div>
                  {m.displayValue && <div className="ve-item-preview">{m.displayValue}</div>}
                </button>
              ))}
            </div>
          )}

          {parsed.blocks.length > 0 && (
            <div className="ve-group">
              <div className="ve-group-label">Content</div>
              {parsed.blocks.map(b => {
                const { label, cls, indent } = getBadge(b.kind);
                const activeDrop = dropHint?.targetId === b.id ? dropHint.placement : null;
                return (
                  <button
                    key={b.id}
                    className={`ve-item ${selection?.type === 'block' && selection.id === b.id ? 'on' : ''} ${draggedBlockId === b.id ? 'dragging' : ''} ${activeDrop === 'before' ? 'drop-before' : ''} ${activeDrop === 'after' ? 'drop-after' : ''}`}
                    style={{ paddingLeft: `${12 + indent}px` }}
                    onClick={() => onSelectionChange({ type: 'block', id: b.id })}
                    draggable
                    onDragStart={() => {
                      setDraggedBlockId(b.id);
                      setDropHint(null);
                    }}
                    onDragEnd={() => {
                      setDraggedBlockId(null);
                      setDropHint(null);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      if (!draggedBlockId || draggedBlockId === b.id) {
                        setDropHint(null);
                        return;
                      }
                      setDropHint({ targetId: b.id, placement: dragPlacement(event) });
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (!draggedBlockId || draggedBlockId === b.id) {
                        setDraggedBlockId(null);
                        setDropHint(null);
                        return;
                      }
                      const placement = dragPlacement(event);
                      onMoveBlock(draggedBlockId, b.id, placement);
                      setDraggedBlockId(null);
                      setDropHint(null);
                    }}
                  >
                    <div className="ve-item-row">
                      <span className="ve-drag-handle" title="Drag to reorder">⋮⋮</span>
                      <span className={`ve-badge ${cls}`}>{label}</span>
                      <span className="ve-item-name">{b.label}</span>
                    </div>
                    {b.previewText && (
                      <div className="ve-item-preview" style={{ paddingLeft: `${26 + indent}px` }}>
                        {b.previewText}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Insert section */}
          <div className="ve-insert-section">
            <button
              className={`ve-insert-trigger ${showInsert ? 'open' : ''}`}
              onClick={() => setShowInsert(v => !v)}
            >
              <span className="ve-insert-icon">+</span>
              Insert Block
              <span className="ve-insert-chevron">{showInsert ? '▲' : '▼'}</span>
            </button>

            {showInsert && (
              <div className="ve-insert-menu">
                {INSERT_GROUPS.map(g => (
                  <div key={g.label} className="ve-insert-group">
                    <div className="ve-insert-group-label">{g.label}</div>
                    {g.items.map(item => (
                      <button
                        key={item.key}
                        className="ve-insert-item"
                        onClick={() => handleInsert(item.key)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </aside>

      {/* ── Form panel ──────────────────────────────── */}
      <div className="ve-form">

        {/* Document settings */}
        {selection?.type === 'docinfo' && (
          <DocSettingsPanel info={parsed.docInfo} />
        )}

        {/* Metadata */}
        {selMeta && (
          <MetadataPanel
            meta={selMeta}
            value={draftValue}
            onChange={v => { setDraftValue(v); onMetadataChange(selMeta, v); }}
          />
        )}

        {selBlock && (
          <BlockActions
            block={selBlock}
            onDelete={() => onDeleteBlock(selBlock)}
          />
        )}

        {/* Heading blocks */}
        {selBlock && ['chapter','section','subsection','subsubsection'].includes(selBlock.kind) && (
          <TextBlockPanel
            block={selBlock}
            value={draftValue}
            snippets={FORMATTING_SNIPPETS}
            onChange={v => { setDraftValue(v); onBlockChange(selBlock, v); }}
            onInsertSnippet={insertSnippet}
            hint="Edit the heading text. Use the snippet toolbar for inline formatting."
          />
        )}

        {/* Paragraph */}
        {selBlock?.kind === 'paragraph' && (
          <TextBlockPanel
            block={selBlock}
            value={draftValue}
            snippets={FORMATTING_SNIPPETS}
            onChange={v => { setDraftValue(v); onBlockChange(selBlock, v); }}
            onInsertSnippet={insertSnippet}
            hint="Edit paragraph text. Use snippets for formatting or switch to Source for full LaTeX."
            tall
          />
        )}

        {/* Abstract */}
        {selBlock?.kind === 'abstract' && (
          <TextBlockPanel
            block={selBlock}
            value={draftValue}
            snippets={FORMATTING_SNIPPETS}
            onChange={v => { setDraftValue(v); onBlockChange(selBlock, v); }}
            onInsertSnippet={insertSnippet}
            hint="Abstract text. Usually one paragraph summarising your work."
            tall
          />
        )}

        {/* Display math */}
        {selBlock?.kind === 'math' && (
          <MathPanel
            block={selBlock}
            value={draftValue}
            onChange={v => { setDraftValue(v); onBlockChange(selBlock, v); }}
            onInsertSnippet={insertSnippet}
            label="Display Math ($$…$$)"
          />
        )}

        {/* Named equation environments */}
        {selBlock?.kind === 'equation' && (
          <EquationPanel
            block={selBlock as EquationBlock}
            value={draftValue}
            onChange={v => { setDraftValue(v); onBlockChange(selBlock, v); }}
            onInsertSnippet={insertSnippet}
          />
        )}

        {/* Lists */}
        {selBlock?.kind === 'list' && (
          <ListPanel
            block={selBlock as ListBlock}
            drafts={listDrafts}
            onChange={(i, v) => {
              const next = [...listDrafts];
              next[i] = v;
              setListDrafts(next);
              onListChange(selBlock as ListBlock, next);
            }}
            onAdd={() => {
              const next = [...listDrafts, ''];
              setListDrafts(next);
              onListChange(selBlock as ListBlock, next);
            }}
            onRemove={i => {
              const next = listDrafts.filter((_, idx) => idx !== i);
              setListDrafts(next);
              onListChange(selBlock as ListBlock, next);
            }}
          />
        )}

        {/* Image */}
        {selBlock?.kind === 'image' && (
          <ImagePanel
            block={selBlock as ImageBlock}
            draft={imgDraft}
            onChange={nx => { setImgDraft(nx); onImageChange(selBlock as ImageBlock, nx); }}
          />
        )}

        {/* Table */}
        {selBlock?.kind === 'table' && (
          <TablePanel
            block={selBlock as TableBlock}
            rows={tableRows}
            onChange={(rows, caption) => {
              setTableRows(rows);
              onTableChange(selBlock as TableBlock, rows, caption);
            }}
          />
        )}

        {/* Code */}
        {selBlock?.kind === 'code' && (
          <CodePanel
            block={selBlock as CodeBlock}
            value={draftValue}
            onChange={v => { setDraftValue(v); onBlockChange(selBlock, v); }}
          />
        )}

        {/* Theorem */}
        {selBlock?.kind === 'theorem' && (
          <TheoremPanel
            block={selBlock as TheoremBlock}
            value={draftValue}
            snippets={FORMATTING_SNIPPETS}
            onChange={v => { setDraftValue(v); onBlockChange(selBlock, v); }}
            onInsertSnippet={insertSnippet}
          />
        )}

        {/* Page break */}
        {selBlock?.kind === 'pagebreak' && (
          <div className="ve-pagebreak-panel">
            <FieldHeader title="Page Break" />
            <div className="vf-info-box">
              This is a <code>\newpage</code> or <code>\clearpage</code> command.
              It forces a new page in the compiled PDF. There is nothing to edit here —
              to remove it, switch to <strong>Source mode</strong>.
            </div>
          </div>
        )}

        {/* Unsupported */}
        {selBlock?.kind === 'unsupported' && (
          <UnsupportedPanel block={selBlock} />
        )}

        {/* Nothing */}
        {!selMeta && !selBlock && selection?.type !== 'docinfo' && (
          <div className="ve-empty">Select an item from the outline to start editing.</div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-panel components
// ─────────────────────────────────────────────────────────────────────────────

function FieldHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="vf-header">
      <div className="vf-title">{title}</div>
      {hint && <div className="vf-hint">{hint}</div>}
    </div>
  );
}

function BlockActions({
  block,
  onDelete,
}: {
  block: VisualBlock;
  onDelete: () => void;
}) {
  return (
    <div className="vf-actions">
      <span className="vf-actions-label">Block Actions</span>
      <button className="vf-action-btn danger" onClick={onDelete}>Delete</button>
      <span className="vf-actions-note">
        Drag blocks from the outline to reorder them.
        {['chapter', 'section', 'subsection', 'subsubsection'].includes(block.kind) ? ' Sections move with their content.' : ''}
      </span>
    </div>
  );
}

function SnippetBar({ snippets, onInsert }: { snippets: typeof FORMATTING_SNIPPETS; onInsert: (v: string) => void }) {
  return (
    <div className="snippets">
      {snippets.map(s => (
        <button key={s.label} className="snip-btn" title={s.tip} onClick={() => onInsert(s.val)}>
          {s.label}
        </button>
      ))}
    </div>
  );
}

// ── Document settings ─────────────────────────────────────────────────────────
function DocSettingsPanel({ info }: { info: ParsedLatexDocument['docInfo'] }) {
  return (
    <>
      <FieldHeader title="Document Settings" hint="These are read from your LaTeX preamble. Edit the source to change them." />

      <div className="vf-field">
        <div className="vf-label">Document Class</div>
        <div className="vf-docclass-display">
          <span className="vf-docclass-val">{info.docClass}</span>
          {info.docOptions && <span className="vf-docclass-opts">[{info.docOptions}]</span>}
        </div>
        <div className="vf-hint" style={{ marginTop: 6 }}>
          Common classes:&nbsp;
          {DOC_CLASSES.map(c => (
            <span key={c} className={`vf-class-chip ${c === info.docClass ? 'active' : ''}`}>{c}</span>
          ))}
        </div>
      </div>

      {info.packages.length > 0 && (
        <div className="vf-field">
          <div className="vf-label">Loaded Packages ({info.packages.length})</div>
          <div className="vf-packages">
            {info.packages.map(p => <span key={p} className="vf-pkg-chip">{p}</span>)}
          </div>
        </div>
      )}

      <div className="vf-info-box">
        To change the document class or add packages, switch to <strong>Source mode</strong> and edit the preamble.
      </div>
    </>
  );
}

// ── Metadata ──────────────────────────────────────────────────────────────────
function MetadataPanel({ meta, value, onChange }: { meta: DocumentMetadata; value: string; onChange: (v: string) => void }) {
  return (
    <>
      <FieldHeader title={meta.label} hint={`This sets \\${meta.kind}{…} in the document preamble.`} />
      <div className="vf-field">
        <div className="vf-label">{meta.label}</div>
        <textarea
          className="vf-textarea tall"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={`Enter ${meta.label.toLowerCase()}…`}
        />
      </div>
    </>
  );
}

// ── Text block ────────────────────────────────────────────────────────────────
function TextBlockPanel({
  block, value, snippets, onChange, onInsertSnippet, hint, tall = false,
}: {
  block: VisualBlock; value: string; snippets: typeof FORMATTING_SNIPPETS;
  onChange: (v: string) => void; onInsertSnippet: (v: string) => void;
  hint?: string; tall?: boolean;
}) {
  return (
    <>
      <FieldHeader title={block.label} hint={hint} />
      <SnippetBar snippets={snippets} onInsert={v => {
        const next = value + v;
        onChange(next);
        onInsertSnippet(v);
      }} />
      <div className="vf-field">
        <div className="vf-label">Content</div>
        <textarea
          className={`vf-textarea ${tall ? 'tall' : ''}`}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      </div>
    </>
  );
}

// ── Math / display ────────────────────────────────────────────────────────────
function MathPanel({
  block, value, onChange, onInsertSnippet, label,
}: {
  block: VisualBlock; value: string; onChange: (v: string) => void;
  onInsertSnippet: (v: string) => void; label: string;
}) {
  return (
    <>
      <FieldHeader title={label} hint="Enter LaTeX math content (without the $$). Use the symbol bar for common symbols." />
      <div className="snippets" style={{ marginBottom: 8, flexWrap: 'wrap' }}>
        {MATH_SNIPPETS.map(s => (
          <button key={s.label} className="snip-btn" onClick={() => {
            const next = value + s.val;
            onChange(next);
            onInsertSnippet(s.val);
          }}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="vf-field">
        <div className="vf-label">Math (LaTeX)</div>
        <textarea
          className="vf-textarea tall vf-mono"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="f(x) = \int_a^b g(t)\,dt"
        />
      </div>
    </>
  );
}

// ── Named equation ────────────────────────────────────────────────────────────
function EquationPanel({
  block, value, onChange, onInsertSnippet,
}: {
  block: EquationBlock; value: string; onChange: (v: string) => void; onInsertSnippet: (v: string) => void;
}) {
  return (
    <>
      <FieldHeader
        title={`${block.envName} environment${block.numbered ? '' : ' (unnumbered)'}`}
        hint={`\\begin{${block.envName}}…\\end{${block.envName}}. Edit the math content below.`}
      />
      <div className="snippets" style={{ marginBottom: 8, flexWrap: 'wrap' }}>
        {MATH_SNIPPETS.map(s => (
          <button key={s.label} className="snip-btn" onClick={() => {
            const next = value + s.val;
            onChange(next);
            onInsertSnippet(s.val);
          }}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="vf-field">
        <div className="vf-label">Content (inner LaTeX)</div>
        <textarea
          className="vf-textarea tall vf-mono"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="f(x) &= ax^2 + bx + c"
        />
      </div>
      {block.numbered && (
        <div className="vf-hint" style={{ marginTop: 4 }}>
          Add <code>\label&#123;eq:name&#125;</code> to reference this equation elsewhere.
        </div>
      )}
    </>
  );
}

// ── List ──────────────────────────────────────────────────────────────────────
function ListPanel({
  block, drafts, onChange, onAdd, onRemove,
}: {
  block: ListBlock; drafts: string[];
  onChange: (i: number, v: string) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
}) {
  return (
    <>
      <FieldHeader
        title={block.label}
        hint={`${block.ordered ? 'Numbered (enumerate)' : 'Bullet (itemize)'} list. Each field is one \\item.`}
      />
      <div className="ve-list-editor">
        {drafts.map((v, i) => (
          <div key={i} className="list-row">
            <span className="list-num">
              {block.ordered ? `${i + 1}.` : '•'}
            </span>
            <div style={{ flex: 1 }}>
              <textarea
                className="vf-textarea short"
                value={v}
                onChange={e => onChange(i, e.target.value)}
                placeholder="Item text…"
              />
            </div>
            <button
              className="list-del-btn"
              title="Remove item"
              onClick={() => onRemove(i)}
            >
              ×
            </button>
          </div>
        ))}
        <button className="btn-add-item" onClick={onAdd}>+ Add Item</button>
      </div>
    </>
  );
}

// ── Image ─────────────────────────────────────────────────────────────────────
function ImagePanel({
  block, draft, onChange,
}: {
  block: ImageBlock;
  draft: { path: string; width: string; caption: string };
  onChange: (nx: { path: string; width: string; caption: string }) => void;
}) {
  return (
    <>
      <FieldHeader
        title="Figure"
        hint="Edit the image path, display width, and caption. The \\begin{figure}…\\end{figure} wrapper is managed automatically."
      />
      <div className="vf-field">
        <div className="vf-label">Image Path</div>
        <input
          className="vf-input"
          value={draft.path}
          placeholder="figures/image.png"
          onChange={e => onChange({ ...draft, path: e.target.value })}
        />
        <div className="vf-hint">Relative to the project root. Supported: PNG, JPG, PDF, EPS.</div>
      </div>
      <div className="vf-field">
        <div className="vf-label">Width</div>
        <input
          className="vf-input"
          value={draft.width}
          placeholder="0.8\textwidth"
          onChange={e => onChange({ ...draft, width: e.target.value })}
        />
        <div className="vf-hint">e.g. <code>0.8\textwidth</code>, <code>6cm</code>, <code>0.5\linewidth</code></div>
      </div>
      <div className="vf-field">
        <div className="vf-label">Caption</div>
        <textarea
          className="vf-textarea short"
          value={draft.caption}
          placeholder="Caption text…"
          onChange={e => onChange({ ...draft, caption: e.target.value })}
        />
      </div>
      {block.figLabel && (
        <div className="vf-field">
          <div className="vf-label">Label</div>
          <div className="vf-readonly-field"><code>{block.figLabel}</code></div>
        </div>
      )}
    </>
  );
}

// ── Table ─────────────────────────────────────────────────────────────────────
function TablePanel({
  block, rows, onChange,
}: {
  block: TableBlock;
  rows: string[][];
  onChange: (rows: string[][], caption: string) => void;
}) {
  const updateCell = (ri: number, ci: number, value: string) => {
    const next = rows.map((row, rowIdx) =>
      row.map((cell, colIdx) => (rowIdx === ri && colIdx === ci ? value : cell)),
    );
    onChange(next, block.caption);
  };

  const addRow = () => {
    const cols = rows[0]?.length ?? 1;
    onChange([...rows, Array.from({ length: cols }, () => '')], block.caption);
  };

  const removeRow = (ri: number) => {
    if (rows.length <= 1) return;
    onChange(rows.filter((_, rowIdx) => rowIdx !== ri), block.caption);
  };

  if (rows.length === 0) {
    return (
      <>
        <FieldHeader title="Table" hint="No rows could be parsed. Edit in Source mode." />
        <div className="vf-info-box">Switch to Source mode to edit the raw LaTeX table.</div>
      </>
    );
  }

  return (
    <>
      <FieldHeader
        title="Table"
        hint={`Environment: ${block.envName}. Column spec: ${block.colSpec}. Edit cells here and use Source mode for advanced layout.`}
      />
      <div className="ve-table-editor">
        <div className="ve-table-scroll">
          <table className="ve-table">
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri}>
                  <td className="ve-row-num">
                    <span>{ri + 1}</span>
                    <button className="ve-row-del" title="Delete row" onClick={() => removeRow(ri)}>×</button>
                  </td>
                  {row.map((cell, ci) => (
                    <td key={ci} className="ve-cell">
                      <textarea
                        className="ve-cell-input"
                        value={cell}
                        onChange={e => updateCell(ri, ci, e.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ve-table-info">
          {rows.length} rows × {rows[0]?.length ?? 0} cols · spec: <code>{block.colSpec}</code>
        </div>
        <div className="ve-table-toolbar">
          <button className="ve-table-btn" onClick={addRow}>+ Add Row</button>
        </div>
      </div>
      <div className="vf-field" style={{ marginTop: 12 }}>
        <div className="vf-label">Caption</div>
        <textarea
          className="vf-textarea short"
          value={block.caption}
          placeholder="Table caption…"
          onChange={e => onChange(rows, e.target.value)}
        />
      </div>
      <div className="vf-info-box" style={{ marginTop: 8 }}>
        Rows can be added or removed here. For column layout changes like editing <code>{block.colSpec}</code>, stay flexible and use <strong>Source mode</strong>.
      </div>
    </>
  );
}

// ── Code ──────────────────────────────────────────────────────────────────────
function CodePanel({
  block, value, onChange,
}: {
  block: CodeBlock; value: string; onChange: (v: string) => void;
}) {
  return (
    <>
      <FieldHeader
        title={`Code Block (${block.env})`}
        hint={`Edit the code content directly. The \\begin{${block.env}}…\\end{${block.env}} wrapper is preserved automatically.`}
      />
      <div className="vf-field">
        <div className="vf-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Code</span>
          <span className="vf-lang-badge">{block.language || 'plain text'}</span>
        </div>
        <textarea
          className="vf-textarea tall vf-mono"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Code here…"
          spellCheck={false}
        />
      </div>
      <div className="vf-field">
        <div className="vf-label">Language</div>
        <select
          className="vf-select"
          value={block.language}
          onChange={e => {
            // We can't change the environment language directly without re-building the block
            // This is read-only info; user should use Source mode to change it
            void e;
          }}
        >
          {CODE_LANGUAGES.map(l => (
            <option key={l} value={l}>{l || '(none)'}</option>
          ))}
        </select>
        <div className="vf-hint">Change the language in Source mode via <code>[language=…]</code>.</div>
      </div>
    </>
  );
}

// ── Theorem ───────────────────────────────────────────────────────────────────
function TheoremPanel({
  block, value, snippets, onChange, onInsertSnippet,
}: {
  block: TheoremBlock; value: string; snippets: typeof FORMATTING_SNIPPETS;
  onChange: (v: string) => void; onInsertSnippet: (v: string) => void;
}) {
  const envLabel = THEOREM_ENV_LABELS[block.envName] ?? block.envName;
  return (
    <>
      <FieldHeader
        title={envLabel}
        hint={`\\begin{${block.envName}}${block.theoremTitle ? `[${block.theoremTitle}]` : ''}…\\end{${block.envName}}`}
      />
      {block.theoremTitle && (
        <div className="vf-field">
          <div className="vf-label">Title</div>
          <div className="vf-readonly-field">{block.theoremTitle}</div>
          <div className="vf-hint">Edit the title in Source mode: <code>\begin&#123;{block.envName}&#125;[Title]</code></div>
        </div>
      )}
      <SnippetBar snippets={snippets} onInsert={v => {
        const next = value + v;
        onChange(next);
        onInsertSnippet(v);
      }} />
      <div className="vf-field">
        <div className="vf-label">Content</div>
        <textarea
          className="vf-textarea tall"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Theorem statement…"
        />
      </div>
    </>
  );
}

// ── Unsupported ───────────────────────────────────────────────────────────────
function UnsupportedPanel({ block }: { block: VisualBlock }) {
  return (
    <>
      <FieldHeader title={block.label} />
      <div className="unsupported-box">
        <strong>Not editable in Visual mode</strong>
        This environment (<code>{block.label}</code>) isn't supported for visual editing yet.
        Switch to <strong>Source mode</strong> to edit it directly — PDF compile continues to work normally.
      </div>
      <div className="vf-field" style={{ marginTop: 12 }}>
        <div className="vf-label">Source Preview</div>
        <pre className="vf-source-preview">{block.sourceText}</pre>
      </div>
    </>
  );
}
