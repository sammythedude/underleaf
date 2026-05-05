import type { DocumentMetadata, ParsedLatexDocument, VisualBlock } from '../../shared/types';
import { SegmentText } from './SegmentText';

interface Props {
  projectName: string;
  metadata: DocumentMetadata[];
  parsed: ParsedLatexDocument;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function Block({ block, selected, onSelect }: { block: VisualBlock; selected: boolean; onSelect: () => void }) {
  const cls = `doc-block ${selected ? 'sel' : ''}`;

  switch (block.kind) {
    case 'chapter':
      return (
        <button type="button" className={cls} onClick={onSelect}>
          <h1 className="doc-h1"><SegmentText segments={block.segments} emptyFallback="Untitled Chapter" /></h1>
        </button>
      );
    case 'section':
      return (
        <button type="button" className={cls} onClick={onSelect}>
          <h2 className="doc-h2"><SegmentText segments={block.segments} emptyFallback="Untitled Section" /></h2>
        </button>
      );
    case 'subsection':
      return (
        <button type="button" className={cls} onClick={onSelect}>
          <h3 className="doc-h3"><SegmentText segments={block.segments} emptyFallback="Untitled Subsection" /></h3>
        </button>
      );
    case 'subsubsection':
      return (
        <button type="button" className={cls} onClick={onSelect}>
          <h4 className="doc-h4"><SegmentText segments={block.segments} emptyFallback="Untitled Subsubsection" /></h4>
        </button>
      );
    case 'abstract':
      return (
        <button type="button" className={cls} onClick={onSelect}>
          <div className="doc-abstract">
            <div className="doc-abstract-title">Abstract</div>
            <p><SegmentText segments={block.segments} emptyFallback="Abstract text…" /></p>
          </div>
        </button>
      );
    case 'paragraph':
      return (
        <button type="button" className={cls} onClick={onSelect}>
          <p><SegmentText segments={block.segments} emptyFallback="Empty paragraph" /></p>
        </button>
      );
    case 'list':
      return (
        <button type="button" className={cls} onClick={onSelect}>
          {block.ordered ? (
            <ol>{block.items.map(i => <li key={i.id}><SegmentText segments={i.segments} emptyFallback="Item" /></li>)}</ol>
          ) : (
            <ul>{block.items.map(i => <li key={i.id}><SegmentText segments={i.segments} emptyFallback="Item" /></li>)}</ul>
          )}
        </button>
      );
    case 'image': {
      const isMulti = block.label.includes('subfigure');
      return (
        <button type="button" className={cls} onClick={onSelect}>
          <div className="doc-figure">
            <div className="doc-fig-thumb">
              {isMulti ? <span className="doc-fig-grid">⊞</span> : <span className="doc-fig-icon">🖼</span>}
            </div>
            <div className="doc-fig-info">
              {isMulti && <div className="doc-fig-type">{block.label}</div>}
              <div className="doc-fig-caption">{block.caption || 'No caption'}</div>
              <div className="doc-fig-path">{block.path || 'No path set'}</div>
              {block.width && !block.width.startsWith('subfigures:') && <div className="doc-fig-path">width: {block.width}</div>}
            </div>
          </div>
        </button>
      );
    }
    case 'table':
      return (
        <button type="button" className={`${cls} doc-block-table`} onClick={onSelect}>
          {block.rows.length > 0 ? (
            <div className="doc-table-wrap">
              <table className="doc-table">
                <tbody>
                  {block.rows.map((row, ri) => (
                    <tr key={ri} className={ri === 0 ? 'doc-table-head' : ''}>
                      {row.map((cell, ci) => (
                        ri === 0
                          ? <th key={ci} className="doc-table-th">{cell}</th>
                          : <td key={ci} className="doc-table-td">{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {block.caption && <div className="doc-table-caption">{block.caption}</div>}
            </div>
          ) : (
            <div className="doc-unsupported">Table · {block.colSpec}</div>
          )}
        </button>
      );
    case 'equation':
      return (
        <button type="button" className={cls} onClick={onSelect}>
          <div className="doc-equation">
            <pre className="doc-math">{block.previewText || block.sourceText}</pre>
            <span className="doc-eq-env">{block.envName}{block.numbered ? '' : '*'}</span>
          </div>
        </button>
      );
    case 'math':
      return (
        <button type="button" className={cls} onClick={onSelect}>
          <pre className="doc-math">{block.previewText}</pre>
        </button>
      );
    case 'code':
      return (
        <button type="button" className={cls} onClick={onSelect}>
          <div className="doc-code-wrap">
            {block.language && <span className="doc-code-lang">{block.language}</span>}
            <pre className="doc-code">{block.previewText || block.sourceText}</pre>
          </div>
        </button>
      );
    case 'theorem':
      return (
        <button type="button" className={cls} onClick={onSelect}>
          <div className={`doc-theorem doc-thm-${block.envName}`}>
            <span className="doc-thm-name">
              {block.envName.charAt(0).toUpperCase() + block.envName.slice(1)}
              {block.theoremTitle && ` (${block.theoremTitle})`}
            </span>
            <p><SegmentText segments={block.segments} emptyFallback="Statement…" /></p>
          </div>
        </button>
      );
    case 'pagebreak':
      return (
        <button type="button" className={`doc-block doc-pagebreak-block ${selected ? 'sel' : ''}`} onClick={onSelect}>
          <div className="doc-pagebreak">
            <span className="doc-pagebreak-line" />
            <span className="doc-pagebreak-label">page break</span>
            <span className="doc-pagebreak-line" />
          </div>
        </button>
      );
    case 'unsupported':
      return (
        <button type="button" className={cls} onClick={onSelect}>
          <div className="doc-unsupported">{block.previewText}</div>
        </button>
      );
    default:
      return (
        <button type="button" className={cls} onClick={onSelect}>
          <p><SegmentText segments={(block as { segments: VisualBlock['segments'] }).segments} emptyFallback="Empty block" /></p>
        </button>
      );
  }
}

export function LiveView({ projectName, metadata, parsed, selectedId, onSelect }: Props) {
  const title  = metadata.find(m => m.kind === 'title')?.displayValue  || projectName;
  const author = metadata.find(m => m.kind === 'author')?.displayValue ?? '';
  const date   = metadata.find(m => m.kind === 'date')?.displayValue   ?? '';

  return (
    <div className="live-scroll">
      <div className="paper">

        <header className="paper-hd">
          <h1 className="paper-title">{title}</h1>
          {author && <p className="paper-author">{author}</p>}
          {date   && <p className="paper-date">{date}</p>}
        </header>

        <div className="paper-body">
          {parsed.blocks.length === 0 ? (
            <div className="paper-empty">
              Start writing in Source mode or use the Visual editor to add content.
            </div>
          ) : (
            parsed.blocks.map(b => (
              <Block
                key={b.id}
                block={b}
                selected={selectedId === b.id}
                onSelect={() => onSelect(b.id)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
