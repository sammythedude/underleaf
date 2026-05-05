import { describe, expect, it } from 'vitest';
import {
  applyImageBlockUpdate,
  applyListItemUpdates,
  applyTableUpdate,
  deleteBlockById,
  lintLatexSource,
  moveBlockById,
  moveBlockRelativeToBlock,
  parseLatexDocument,
  replaceRange,
  upsertMetadata,
} from '../shared/latex';

const SAMPLE = `\\documentclass{article}
\\title{Old Title}
\\author{Ada}
\\date{\\today}
\\begin{document}
\\maketitle

\\section{Intro}
Hello world and $E=mc^2$.

\\begin{itemize}
\\item First item
\\item Second item
\\end{itemize}

\\begin{figure}
\\includegraphics[width=0.4\\textwidth]{old.png}
\\caption{Old caption}
\\end{figure}
\\end{document}
`;

const TABLE_SAMPLE = `\\documentclass{article}
\\begin{document}
\\section{Results}
\\begin{table}
\\centering
\\begin{tabularx}{\\textwidth}{Xc}
Header & Value \\\\
Alpha & 1 \\\\
Beta & 2 \\\\
\\end{tabularx}
\\caption{Numbers}
\\end{table}

\\section{Discussion}
Body text.
\\end{document}
`;

describe('parseLatexDocument', () => {
  it('extracts metadata and visual blocks from a normal article', () => {
    const parsed = parseLatexDocument(SAMPLE);

    expect(parsed.metadata.map((entry) => entry.kind)).toEqual(['title', 'author', 'date']);
    expect(parsed.blocks.map((block) => block.kind)).toEqual(['section', 'paragraph', 'list', 'image']);
    expect(parsed.blocks[1]?.previewText).toContain('Hello world');
  });

  it('updates inline editable ranges for metadata and paragraphs', () => {
    const parsed = parseLatexDocument(SAMPLE);
    const title = parsed.metadata.find((entry) => entry.kind === 'title');
    const paragraph = parsed.blocks.find((block) => block.kind === 'paragraph');

    expect(title?.range).toBeTruthy();
    expect(paragraph?.range).toBeTruthy();

    const updatedTitle = upsertMetadata(SAMPLE, 'title', 'New Title', title?.range);
    const updatedParagraph = replaceRange(updatedTitle, paragraph!.range!, 'A replaced paragraph.');

    expect(updatedParagraph).toContain('\\title{New Title}');
    expect(updatedParagraph).toContain('A replaced paragraph.');
  });

  it('rewrites list items and image data without changing the rest of the file', () => {
    const parsed = parseLatexDocument(SAMPLE);
    const listBlock = parsed.blocks.find((block) => block.kind === 'list');
    const imageBlock = parsed.blocks.find((block) => block.kind === 'image');

    expect(listBlock?.kind).toBe('list');
    expect(imageBlock?.kind).toBe('image');

    const updatedList = applyListItemUpdates(SAMPLE, listBlock!, ['Alpha', 'Beta']);
    const reparsed = parseLatexDocument(updatedList);
    const reparsedImageBlock = reparsed.blocks.find((block) => block.kind === 'image');

    const updatedImage = applyImageBlockUpdate(updatedList, reparsedImageBlock!, {
      path: 'figures/chart.png',
      width: '0.6\\textwidth',
      caption: 'Fresh caption',
    });

    expect(updatedImage).toContain('\\item Alpha');
    expect(updatedImage).toContain('\\item Beta');
    expect(updatedImage).toContain('\\includegraphics[width=0.6\\textwidth]{figures/chart.png}');
    expect(updatedImage).toContain('\\caption{Fresh caption}');
  });

  it('parses tabularx tables and lets section chunks move/delete', () => {
    const parsed = parseLatexDocument(TABLE_SAMPLE);
    const table = parsed.blocks.find((block) => block.kind === 'table');
    const firstSection = parsed.blocks.find((block) => block.kind === 'section');
    const secondSection = parsed.blocks.filter((block) => block.kind === 'section')[1];

    expect(table?.kind).toBe('table');
    expect(table && 'envName' in table ? table.envName : '').toBe('tabularx');
    expect(table && 'rows' in table ? table.rows[0] : []).toEqual(['Header', 'Value']);

    const updatedTable = applyTableUpdate(TABLE_SAMPLE, table!, [['Left', 'Right'], ['Gamma', '3']], 'Updated numbers');
    expect(updatedTable).toContain('\\begin{tabularx}{\\textwidth}{Xc}');
    expect(updatedTable).toContain('Gamma & 3');
    expect(updatedTable).toContain('\\caption{Updated numbers}');

    const moved = moveBlockById(TABLE_SAMPLE, parsed.blocks, firstSection!.id, 'down');
    expect(moved.indexOf('\\section{Discussion}')).toBeLessThan(moved.indexOf('\\section{Results}'));

    const deleted = deleteBlockById(TABLE_SAMPLE, parsed.blocks, secondSection!.id);
    expect(deleted).not.toContain('\\section{Discussion}');
    expect(deleted).not.toContain('Body text.');
  });

  it('reports source lint diagnostics and can reorder blocks by target', () => {
    const linted = lintLatexSource('\\begin{document}\n\\section{Oops\nText\n');
    expect(linted.some((issue) => issue.message.includes('Unclosed opening brace'))).toBe(true);
    expect(linted.some((issue) => issue.message.includes('Unclosed environment \\begin{document}'))).toBe(true);

    const parsed = parseLatexDocument(TABLE_SAMPLE);
    const firstSection = parsed.blocks.find((block) => block.kind === 'section');
    const secondSection = parsed.blocks.filter((block) => block.kind === 'section')[1];
    const reordered = moveBlockRelativeToBlock(TABLE_SAMPLE, parsed.blocks, secondSection!.id, firstSection!.id, 'before');

    expect(reordered.indexOf('\\section{Discussion}')).toBeLessThan(reordered.indexOf('\\section{Results}'));
  });
});
