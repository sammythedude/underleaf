function escapeLatex(value: string): string {
  return value
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([%&_#$])/g, '\\$1');
}

export function slugifyProjectName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'underleaf-project';
}

export function createStarterLatex(projectName: string): string {
  const title = escapeLatex(projectName.trim() || 'Untitled Document');

  return `\\documentclass[12pt]{article}
\\usepackage[margin=1in]{geometry}
\\usepackage{graphicx}
\\usepackage{amsmath}
\\usepackage{hyperref}

\\title{${title}}
\\author{Your Name}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{Introduction}
Start writing here. This project supports live view while you type and exact PDF compilation on demand.

\\subsection{A Visual Edit Block}
You can update section titles, paragraphs, lists, and figure metadata from the visual editor.

\\begin{itemize}
  \\item First bullet
  \\item Second bullet
\\end{itemize}

\\begin{figure}[h]
\\centering
\\includegraphics[width=0.45\\textwidth]{example-image}
\\caption{A sample figure placeholder}
\\end{figure}

Inline math works too: $E = mc^2$.

\\end{document}
`;
}
