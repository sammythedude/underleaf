import {
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  startTransition,
} from 'react';
import Editor from '@monaco-editor/react';
import {
  applyImageBlockUpdate,
  applyListItemUpdates,
  applyTableUpdate,
  deleteBlockById,
  insertAfterBlock,
  lintLatexSource,
  moveBlockRelativeToBlock,
  parseLatexDocument,
  replaceRange,
  upsertMetadata,
} from '../shared/latex';
import type {
  CompileResult,
  DocumentMetadata,
  EditorMode,
  ImageBlock,
  ListBlock,
  OpenedProject,
  PreviewMode,
  ProjectSummary,
  TableBlock,
  TexStatus,
  VisualBlock,
} from '../shared/types';
import { Dashboard } from './components/Dashboard';
import { LiveView } from './components/LiveView';
import { PdfPreview } from './components/PdfPreview';
import { VisualEditor } from './components/VisualEditor';

type Selection =
  | { type: 'docinfo' }
  | { type: 'metadata'; id: string }
  | { type: 'block'; id: string }
  | null;

const EMPTY_PARSED_DOCUMENT = {
  docInfo: { docClass: 'article', docOptions: '', packages: [] },
  metadata: [],
  blocks: [],
  warnings: [],
};

const SIDEBAR_DEFAULT  = 220;
const SIDEBAR_MIN      = 130;
const SIDEBAR_MAX      = 480;
const SPLIT_DEFAULT    = 50;
const SPLIT_MIN        = 18;
const SPLIT_MAX        = 82;

export default function App() {
  const [recentProjects, setRecentProjects]   = useState<ProjectSummary[]>([]);
  const [project, setProject]                 = useState<OpenedProject | null>(null);
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [content, setContent]                 = useState('');
  const [editorMode, setEditorMode]           = useState<EditorMode>('visual');
  const [previewMode, setPreviewMode]         = useState<PreviewMode>('live');
  const [selection, setSelection]             = useState<Selection>(null);
  const [texStatus, setTexStatus]             = useState<TexStatus | null>(null);
  const [compileResult, setCompileResult]     = useState<CompileResult | null>(null);
  const [compileMessage, setCompileMessage]   = useState('Ready to compile.');
  const [isCompiling, setIsCompiling]         = useState(false);
  const [saveState, setSaveState]             = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError]                     = useState<string | null>(null);

  // ── Resize state ──────────────────────────────────────
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
  const [splitPct, setSplitPct]         = useState(SPLIT_DEFAULT);
  const [draggingHandle, setDraggingHandle] = useState<'sidebar' | 'split' | null>(null);

  const wkBodyRef       = useRef<HTMLDivElement>(null);
  const draggingRef     = useRef<'sidebar' | 'split' | null>(null);
  const dragStartXRef   = useRef(0);
  const dragStartValRef = useRef(0);
  const sidebarWRef     = useRef(SIDEBAR_DEFAULT);
  const didBootstrapRef = useRef(false);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const which = draggingRef.current;
      if (!which) return;
      const dx = e.clientX - dragStartXRef.current;

      if (which === 'sidebar') {
        const next = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, dragStartValRef.current + dx));
        setSidebarWidth(next);
        sidebarWRef.current = next;
      } else {
        const body = wkBodyRef.current;
        if (!body) return;
        const avail = body.clientWidth - sidebarWRef.current - 8;
        const pct = Math.max(SPLIT_MIN, Math.min(SPLIT_MAX,
          dragStartValRef.current + (dx / avail) * 100));
        setSplitPct(pct);
      }
    }
    function onUp() {
      if (!draggingRef.current) return;
      draggingRef.current = null;
      setDraggingHandle(null);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  function startResize(which: 'sidebar' | 'split', e: React.MouseEvent) {
    e.preventDefault();
    draggingRef.current = which;
    dragStartXRef.current = e.clientX;
    dragStartValRef.current = which === 'sidebar' ? sidebarWidth : splitPct;
    setDraggingHandle(which);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  // ── Parsing ───────────────────────────────────────────
  const needsStructuredParse = editorMode === 'visual' || previewMode === 'live';
  const lintSource = useDeferredValue(editorMode === 'code' ? content : '');
  const parsed = useMemo(
    () => (needsStructuredParse ? parseLatexDocument(content) : EMPTY_PARSED_DOCUMENT),
    [content, needsStructuredParse],
  );
  const previewParsed = useDeferredValue(parsed);
  const lintIssues = useMemo(
    () => (lintSource ? lintLatexSource(lintSource) : []),
    [lintSource],
  );
  const monacoEditorRef = useRef<any>(null);
  const monacoRef       = useRef<any>(null);

  function api() {
    if (!window.underleaf) throw new Error('Desktop bridge not found — rebuild and relaunch.');
    return window.underleaf;
  }

  function syncLintMarkers() {
    const monaco = monacoRef.current;
    const model = monacoEditorRef.current?.getModel?.();
    if (!monaco || !model) return;

    monaco.editor.setModelMarkers(
      model,
      'underleaf-latex',
      lintIssues.map((issue) => {
        const start = model.getPositionAt(issue.startOffset);
        const end = model.getPositionAt(issue.endOffset);
        return {
          severity: issue.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
          message: issue.message,
          startLineNumber: start.lineNumber,
          startColumn: start.column,
          endLineNumber: end.lineNumber,
          endColumn: end.column,
        };
      }),
    );
  }

  const refreshRecents = useEffectEvent(async () => {
    setRecentProjects(await api().listRecentProjects());
  });

  const persistCurrentFile = useEffectEvent(async () => {
    if (!currentFilePath) return false;
    try {
      setSaveState('saving');
      await api().writeTextFile(currentFilePath, content);
      setSaveState('saved');
      return true;
    } catch {
      setSaveState('error');
      return false;
    }
  });

  const confirmPendingChanges = useEffectEvent(async () => {
    if (saveState !== 'dirty') return true;
    if (window.confirm('Save your unsaved changes before continuing?')) {
      return await persistCurrentFile();
    }
    return window.confirm('Discard your unsaved changes and continue?');
  });

  const loadProject = useEffectEvent(async (path: string) => {
    try {
      if (!(await confirmPendingChanges())) return;
      setError(null);
      const opened = await api().openProject(path);
      const fp     = opened.summary.mainFilePath;
      const src    = await api().readTextFile(fp);
      startTransition(() => {
        setProject(opened); setCurrentFilePath(fp);
        setContent(src); setSelection(null); setCompileResult(null);
      });
      setSaveState('saved');
      await refreshRecents();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to open project.');
    }
  });

  useEffect(() => {
    if (didBootstrapRef.current) return;
    didBootstrapRef.current = true;

    void (async () => {
      try {
        if (!window.underleaf) throw new Error('Desktop bridge not found.');
        await refreshRecents();
        setTexStatus(await api().getTexStatus());
        const bs = await api().getBootstrapState();
        if (bs.initialProjectPath) await loadProject(bs.initialProjectPath);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Startup failed.');
      }
    })();
    if (!window.underleaf) return;
    const u1 = api().onProjectRequestedOpen(p => void loadProject(p));
    const u2 = api().onCompileStatus(m => setCompileMessage(m));
    return () => { u1(); u2(); };
  }, []);

  useEffect(() => {
    if (!needsStructuredParse) return;
    if (!selection || selection.type === 'docinfo') return;
    const ids = new Set([...parsed.metadata.map(m => m.id), ...parsed.blocks.map(b => b.id)]);
    if (!ids.has(selection.id)) setSelection(null);
  }, [needsStructuredParse, parsed.blocks, parsed.metadata, selection]);

  useEffect(() => {
    if (editorMode !== 'code') return;
    syncLintMarkers();
  }, [editorMode, lintIssues]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void persistCurrentFile();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [persistCurrentFile]);

  async function handleOpenDialog() {
    const o = await api().openProjectDialog();
    if (o) await loadProject(o.summary.projectPath);
  }

  async function handleCreate(name: string, dir: string) {
    try {
      if (!(await confirmPendingChanges())) return;
      const o  = await api().createProject(name, dir);
      const fp = o.summary.mainFilePath;
      const src = await api().readTextFile(fp);
      startTransition(() => {
        setProject(o); setCurrentFilePath(fp);
        setContent(src); setSelection(null); setCompileResult(null);
      });
      setSaveState('saved');
      await refreshRecents();
    } catch (e) { setError(e instanceof Error ? e.message : 'Create failed.'); }
  }

  async function handleSelectFile(fp: string) {
    if (!(await confirmPendingChanges())) return;
    const f = project?.files.find(x => x.absolutePath === fp);
    if (!f || f.kind !== 'tex') return;
    const src = await api().readTextFile(fp);
    setCurrentFilePath(fp); setContent(src); setSelection(null);
    setSaveState('saved');
  }

  async function handleInstallTex() {
    setCompileMessage('Installing TeX engine…');
    const s = await api().installTexEngine();
    setTexStatus(s); setCompileMessage(s.message);
  }

  async function handleCompile() {
    if (!project) return;
    try {
      setIsCompiling(true);
      if (saveState === 'dirty') {
        const saved = await persistCurrentFile();
        if (!saved) return;
      } else if (currentFilePath) {
        await api().writeTextFile(currentFilePath, content);
      }
      const r = await api().compileProject(project.summary.projectPath, project.summary.mainFilePath);
      setCompileResult(r);
    } catch (e) {
      setCompileResult({
        ok: false, output: e instanceof Error ? e.message : 'Compile failed.',
        issues: [{ message: e instanceof Error ? e.message : 'Compile failed.' }],
      });
    } finally {
      setIsCompiling(false);
      setTexStatus(await api().getTexStatus());
    }
  }

  async function handleReturnToDashboard() {
    if (!(await confirmPendingChanges())) return;
    setProject(null);
    setCurrentFilePath(null);
    setSelection(null);
    setSaveState('idle');
  }

  function updateContent(v: string) {
    if (v === content) return;
    setContent(v);
    setSaveState('dirty');
  }
  function applyMeta(m: DocumentMetadata, v: string)  { updateContent(upsertMetadata(content, m.kind, v, m.range)); }
  function applyBlock(b: VisualBlock, v: string)       { if (b.range) updateContent(replaceRange(content, b.range, v)); }
  function applyList(b: ListBlock, vs: string[])       { updateContent(applyListItemUpdates(content, b, vs)); }
  function applyImage(b: ImageBlock, nx: { path: string; width: string; caption: string }) {
    updateContent(applyImageBlockUpdate(content, b, nx));
  }
  function handleTableChange(b: TableBlock, rows: string[][], caption: string) {
    updateContent(applyTableUpdate(content, b, rows, caption));
  }
  function handleInsertBlock(template: string, afterRange?: { start: number; end: number }) {
    updateContent(insertAfterBlock(content, afterRange, template));
  }
  function handleDeleteBlock(block: VisualBlock) {
    if (!window.confirm(`Delete "${block.label}"?`)) {
      return;
    }
    updateContent(deleteBlockById(content, parsed.blocks, block.id));
    setSelection(null);
  }
  function handleMoveBlock(blockId: string, targetId: string, placement: 'before' | 'after') {
    const updated = moveBlockRelativeToBlock(content, parsed.blocks, blockId, targetId, placement);
    if (updated !== content) {
      updateContent(updated);
      setSelection({ type: 'block', id: blockId });
    }
  }

  const texReady  = texStatus?.ready ?? false;
  const files     = project?.files ?? [];
  const activeFile = files.find(f => f.absolutePath === currentFilePath);

  function savePill() {
    if (saveState === 'dirty')  return '● Unsaved';
    if (saveState === 'saving') return '● Saving…';
    if (saveState === 'saved')  return '✓ Saved';
    if (saveState === 'error')  return '✗ Error';
    return '';
  }

  function fileKindLabel(kind: string) {
    if (kind === 'tex') return 'tex';
    return '···';
  }

  // ── Dashboard ─────────────────────────────────────────
  if (!project) {
    return (
      <div className="app-shell">
        <Dashboard
          recentProjects={recentProjects}
          onOpenDialog={handleOpenDialog}
          onOpenRecent={p => void loadProject(p)}
          onCreateProject={(n, d) => void handleCreate(n, d)}
          onPickDirectory={() => api().selectDirectory()}
        />
      </div>
    );
  }

  // ── Workspace ─────────────────────────────────────────
  return (
    <div className="app-shell">
      <div className="workspace">

        {/* Header */}
        <header className="wk-header">
          <button className="btn-back-icon" onClick={() => void handleReturnToDashboard()} title="Dashboard">
            ‹
          </button>

          <div className="wk-logo">
            <div className="wk-logo-icon">U</div>
            <span className="wk-logo-name">Underleaf</span>
          </div>

          <div className="wk-sep" />

          <div className="wk-breadcrumb">
            <span className="wk-project">{project.summary.name}</span>
            <span className="wk-chevron">/</span>
            <span className="wk-file">{activeFile?.relativePath ?? 'main.tex'}</span>
          </div>

          {!texReady && (
            <div className="tex-notice">
              <span>⚠ No TeX engine</span>
              <button
                className="tex-notice-btn"
                onClick={handleInstallTex}
                disabled={texStatus?.installState === 'installing'}
              >
                {texStatus?.installState === 'installing' ? 'Installing…' : 'Install'}
              </button>
            </div>
          )}

          <div className="wk-center">
            <div className="seg">
              <button className={editorMode === 'visual' ? 'on' : ''} onClick={() => setEditorMode('visual')}>Visual</button>
              <button className={editorMode === 'code'   ? 'on' : ''} onClick={() => setEditorMode('code')}>Source</button>
            </div>
            <div className="seg">
              <button className={previewMode === 'live' ? 'on' : ''} onClick={() => setPreviewMode('live')}>Preview</button>
              <button className={previewMode === 'pdf'  ? 'on' : ''} onClick={() => setPreviewMode('pdf')}>PDF</button>
            </div>
          </div>

          <div className="wk-right">
            {savePill() && <span className={`save-pill ${saveState}`}>{savePill()}</span>}
            <button className="btn-save" title="Save (Cmd/Ctrl+S)" onClick={() => void persistCurrentFile()} disabled={!currentFilePath || saveState === 'saving' || saveState === 'idle' || saveState === 'saved'}>
              Save
            </button>
            {previewMode === 'pdf' && (
              <button className="btn-compile" onClick={handleCompile} disabled={isCompiling || !texReady}>
                {isCompiling ? 'Compiling…' : '▶ Recompile'}
              </button>
            )}
          </div>
        </header>

        {error && (
          <div className="error-bar">
            <span className="error-bar-icon">⚠</span>
            <span>{error}</span>
          </div>
        )}

        {/* Body */}
        <div className="wk-body" ref={wkBodyRef}>

          {/* File sidebar */}
          <aside className="file-sidebar" style={{ width: sidebarWidth }}>
            <div className="sb-header">
              <div className="sb-project">{project.summary.name}</div>
              <div className="sb-path">{project.summary.projectPath}</div>
            </div>

            <div className="sb-section">Files</div>
            <div className="file-tree">
              {files.map(f => (
                <button
                  key={f.absolutePath}
                  className={`ftree-item ${currentFilePath === f.absolutePath ? 'active' : ''}`}
                  disabled={f.kind !== 'tex'}
                  onClick={() => void handleSelectFile(f.absolutePath)}
                  title={f.absolutePath}
                >
                  <span className="ftree-icon">{fileKindLabel(f.kind)}</span>
                  <span className="ftree-name">{f.relativePath}</span>
                </button>
              ))}
            </div>

            <div className="sb-footer">
              <button className="btn-dashboard" onClick={() => void handleReturnToDashboard()}>
                <span className="btn-dashboard-icon">←</span>
                Dashboard
              </button>
            </div>
          </aside>

          {/* Sidebar resize handle */}
          <div
            className={`resize-handle ${draggingHandle === 'sidebar' ? 'dragging' : ''}`}
            onMouseDown={e => startResize('sidebar', e)}
          />

          {/* Editor pane */}
          <div className="editor-pane" style={{ flex: `${splitPct} 1 0%` }}>
            <div className="pane-hd">
              <span className="pane-hd-title">
                {editorMode === 'visual' ? 'Visual Editor' : 'LaTeX Source'}
              </span>
              {editorMode === 'code' && (
                <span className={`pane-hd-lint ${lintIssues.some((issue) => issue.severity === 'error') ? 'error' : lintIssues.length > 0 ? 'warning' : 'clean'}`}>
                  {lintIssues.length === 0 ? 'No syntax issues' : `${lintIssues.length} lint issue${lintIssues.length === 1 ? '' : 's'}`}
                </span>
              )}
              <span className="pane-hd-spacer" />
              {activeFile && <span className="pane-hd-file mono">{activeFile.relativePath}</span>}
            </div>
            <div className="pane-body">
              {editorMode === 'code' ? (
                <Editor
                  height="100%"
                  defaultLanguage="latex"
                  language="latex"
                  theme="vs-light"
                  value={content}
                  onMount={(editor, monaco) => {
                    monacoEditorRef.current = editor;
                    monacoRef.current = monaco;
                    syncLintMarkers();
                  }}
                  onChange={v => updateContent(v ?? '')}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    fontFamily: '"JetBrains Mono", "Fira Code", Menlo, Monaco, monospace',
                    fontLigatures: true,
                    lineHeight: 21,
                    lineNumbersMinChars: 3,
                    scrollBeyondLastLine: false,
                    padding: { top: 14, bottom: 14 },
                    renderLineHighlight: 'gutter',
                    overviewRulerBorder: false,
                    scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
                    bracketPairColorization: { enabled: true },
                  }}
                />
              ) : (
                <VisualEditor
                  parsed={parsed}
                  selection={selection}
                  onSelectionChange={setSelection}
                  onMetadataChange={applyMeta}
                  onBlockChange={applyBlock}
                  onListChange={applyList}
                  onImageChange={applyImage}
                  onTableChange={handleTableChange}
                  onInsertBlock={handleInsertBlock}
                  onDeleteBlock={handleDeleteBlock}
                  onMoveBlock={handleMoveBlock}
                />
              )}
            </div>
          </div>

          {/* Split resize handle */}
          <div
            className={`resize-handle ${draggingHandle === 'split' ? 'dragging' : ''}`}
            onMouseDown={e => startResize('split', e)}
          />

          {/* Preview pane */}
          <div className="preview-pane" style={{ flex: `${100 - splitPct} 1 0%` }}>
            <div className="pane-hd">
              <span className="pane-hd-title">
                {previewMode === 'live' ? 'Live Preview' : 'PDF Output'}
              </span>
              <span className="pane-hd-spacer" />
              {previewMode === 'pdf' && (
                <button
                  className="btn-compile"
                  style={{ fontSize: 11, padding: '4px 11px' }}
                  onClick={handleCompile}
                  disabled={isCompiling || !texReady}
                >
                  {isCompiling ? 'Compiling…' : '▶ Recompile'}
                </button>
              )}
            </div>
            <div className="pane-body">
              {previewMode === 'live' ? (
                <LiveView
                  projectName={project.summary.name}
                  metadata={previewParsed.metadata}
                  parsed={previewParsed}
                  selectedId={selection && selection.type !== 'docinfo' ? selection.id : null}
                  onSelect={id => setSelection({ type: 'block', id })}
                />
              ) : (
                <PdfPreview
                  result={compileResult}
                  isCompiling={isCompiling}
                  statusMessage={compileMessage}
                  onCompile={handleCompile}
                />
              )}
            </div>
          </div>
        </div>

        {/* Status bar */}
        <div className="status-bar">
          <span>Underleaf</span>
          <span className="wk-sep" style={{ margin: 0 }} />
          <span>{editorMode === 'visual' ? 'Visual' : 'Source'} · {previewMode === 'live' ? 'Preview' : 'PDF'}</span>
          <div className="status-bar-right">
            <span className={texReady ? 'sb-ready' : 'sb-noready'}>
              {texReady ? '✓ TeX ready' : '⚠ No TeX engine'}
            </span>
          </div>
        </div>

      </div>
    </div>
  );
}
