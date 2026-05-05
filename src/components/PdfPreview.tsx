import { useEffect, useMemo, useRef, useState } from 'react';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { CompileResult } from '../../shared/types';

GlobalWorkerOptions.workerSrc = pdfWorker;

const PDF_RENDER_SCALE = 1.35;

interface RenderedPage { pageNumber: number; objectUrl: string; }

interface Props {
  result: CompileResult | null;
  isCompiling: boolean;
  statusMessage: string;
  onCompile: () => void;
}

export function PdfPreview({ result, isCompiling, statusMessage }: Props) {
  const [pages, setPages]         = useState<RenderedPage[]>([]);
  const [renderErr, setRenderErr] = useState<string | null>(null);
  const pageUrlsRef = useRef<string[]>([]);
  const issues = useMemo(() => result?.issues ?? [], [result]);

  function replacePages(nextPages: RenderedPage[]) {
    const previousUrls = pageUrlsRef.current;
    pageUrlsRef.current = nextPages.map(page => page.objectUrl);
    setPages(nextPages);
    previousUrls.forEach(url => URL.revokeObjectURL(url));
  }

  useEffect(() => {
    let cancelled = false;
    let loadingTask: ReturnType<typeof getDocument> | null = null;
    let pdf: Awaited<ReturnType<ReturnType<typeof getDocument>['promise']['then']>> | null = null;
    let renderTask: ReturnType<Awaited<ReturnType<typeof getDocument>['promise']>['getPage']> extends Promise<infer Page>
      ? ReturnType<Page['render']>
      : null = null;
    const createdUrls: string[] = [];

    function canvasToObjectUrl(canvas: HTMLCanvasElement): Promise<string> {
      return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('Unable to render PDF page.'));
            return;
          }

          const objectUrl = URL.createObjectURL(blob);
          createdUrls.push(objectUrl);
          resolve(objectUrl);
        }, 'image/png');
      });
    }

    async function load() {
      if (!result?.pdfPath || !result.ok) { replacePages([]); return; }
      try {
        setRenderErr(null);
        replacePages([]);
        const bytes = await window.underleaf.readBinaryFile(result.pdfPath);
        loadingTask = getDocument({ data: bytes });
        pdf = await loadingTask.promise;
        const out: RenderedPage[] = [];
        for (let n = 1; n <= pdf.numPages; n++) {
          if (cancelled) break;
          const page     = await pdf.getPage(n);
          const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
          const canvas   = document.createElement('canvas');
          const ctx      = canvas.getContext('2d');
          if (!ctx) continue;
          canvas.width = viewport.width; canvas.height = viewport.height;
          renderTask = page.render({ canvas, canvasContext: ctx, viewport });
          await renderTask.promise;
          renderTask = null;
          const objectUrl = await canvasToObjectUrl(canvas);
          page.cleanup();
          out.push({ pageNumber: n, objectUrl });
        }
        if (!cancelled) replacePages(out);
      } catch (e) {
        if (!cancelled) { setRenderErr(e instanceof Error ? e.message : 'Render error'); replacePages([]); }
      } finally {
        await pdf?.destroy();
      }
    }

    void load();
    return () => {
      cancelled = true;
      renderTask?.cancel();
      void loadingTask?.destroy();
      createdUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [result?.ok, result?.pdfPath]);

  useEffect(() => () => {
    pageUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    pageUrlsRef.current = [];
  }, []);

  const hasPages = pages.length > 0;

  return (
    <div className="pdf-scroll">

      {/* Status */}
      <div className={`pdf-status ${isCompiling ? 'pdf-compiling' : ''}`}>
        {isCompiling ? '⏳ Compiling…' : statusMessage}
      </div>

      {/* Issues */}
      {issues.length > 0 && (
        <div className="pdf-issues">
          {issues.map((issue, i) => (
            <div key={`${issue.message}-${i}`} className="pdf-issue">
              <strong>{issue.file ? `${issue.file}${issue.line != null ? `:${issue.line}` : ''}` : 'Compile issue'}</strong>
              {issue.message}
            </div>
          ))}
        </div>
      )}

      {/* Render error */}
      {renderErr && <div className="pdf-issue">{renderErr}</div>}

      {/* Empty state */}
      {!hasPages && !isCompiling && (
        <div className="pdf-empty">
          <div className="pdf-empty-icon">📄</div>
          <div className="pdf-empty-title">No PDF yet</div>
          <div className="pdf-empty-sub">
            Click <strong>▶ Recompile</strong> in the toolbar<br />to generate a PDF from your source.
          </div>
        </div>
      )}

      {/* Pages */}
      {hasPages && (
        <div className="pdf-pages">
          {pages.map(p => (
            <img key={p.pageNumber} src={p.objectUrl} alt={`Page ${p.pageNumber}`} className="pdf-page" />
          ))}
        </div>
      )}
    </div>
  );
}
