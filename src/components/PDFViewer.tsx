"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronLeft, ChevronRight, X, ExternalLink } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";

let _pdfjs: typeof import("pdfjs-dist") | null = null;

interface PDFViewerProps {
  data: string;
  fileName: string;
  onClose: () => void;
  onSelectionContextMenu?: (selectedText: string, rect: { left: number; bottom: number }) => void;
  onCreateBoundNode?: () => void;
  boundNodeExists?: boolean;
}

export function PDFViewer({ data, fileName, onClose, onSelectionContextMenu, onCreateBoundNode, boundNodeExists }: PDFViewerProps) {
  const [numPages, setNumPages] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!_pdfjs) {
        _pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        _pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${_pdfjs.version}/pdf.worker.min.mjs`;
      }
      if (cancelled) return;
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      _pdfjs.getDocument({ data: bytes }).promise.then((doc) => {
        if (!cancelled) { setPdfDoc(doc); setNumPages(doc.numPages); }
      }).catch(console.error);
    })();
    return () => { cancelled = true; };
  }, [data]);

  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;
    if (renderTaskRef.current) {
      try { renderTaskRef.current.cancel(); } catch {}
      renderTaskRef.current = null;
    }
    const page = await pdfDoc.getPage(pageNum);
    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    const canvasViewport = page.getViewport({ scale: scale * dpr });
    const textViewport = page.getViewport({ scale });
    canvas.width = canvasViewport.width;
    canvas.height = canvasViewport.height;
    canvas.style.width = `${canvasViewport.width / dpr}px`;
    canvas.style.height = `${canvasViewport.height / dpr}px`;
    const ctx = canvas.getContext("2d")!;
    const task = page.render({ canvasContext: ctx, viewport: canvasViewport });
    renderTaskRef.current = task;

    const textContent = await page.getTextContent();
    const textDiv = textLayerRef.current;
    if (textDiv) {
      textDiv.innerHTML = "";
      textDiv.style.cssText = `position:absolute;top:0;left:0;width:${textViewport.width}px;height:${textViewport.height}px;overflow:hidden;`;
      if (!document.getElementById("pdf-text-layer-style")) {
        const s = document.createElement("style");
        s.id = "pdf-text-layer-style";
        s.textContent = `.pdf-text-span{position:absolute;color:transparent;white-space:pre;cursor:text;user-select:text;overflow:hidden}.pdf-text-span::selection{background:rgb(59 130 246 / 0.5)}`;
        document.head.appendChild(s);
      }
      const items = (textContent.items as any[]).filter((it) => it.str && it.transform);
      for (const item of items) {
        const tx = item.transform;
        const [vx, vy] = textViewport.convertToViewportPoint(tx[4], tx[5]);
        const fontSize = Math.abs(tx[3]) * textViewport.scale || 12;
        const advW = (item.width || Math.abs(tx[0])) * textViewport.scale;
        const span = document.createElement("span");
        span.className = "pdf-text-span";
        span.textContent = item.str;
        span.style.left = `${vx}px`;
        span.style.top = `${vy - fontSize}px`;
        span.style.fontSize = `${fontSize}px`;
        span.style.fontFamily = item.fontName || "sans-serif";
        span.style.lineHeight = `${fontSize}px`;
        span.style.display = "inline-block";
        span.style.width = `${advW}px`;
        span.style.textAlign = "justify";
        span.style.textAlignLast = "justify";
        textDiv.appendChild(span);
      }
    }

    await task.promise;
    renderTaskRef.current = null;
  }, [pdfDoc, pageNum, scale]);

  useEffect(() => {
    renderPage();
    return () => {
      if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); } catch {} }
    };
  }, [renderPage]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        setScale((s) => Math.max(0.5, Math.min(3, s - e.deltaY * 0.001)));
      }
    };
    const handleMouseUp = () => {
      const sel = window.getSelection()?.toString().trim();
      if (sel) {
        const range = window.getSelection()?.getRangeAt(0);
        const rect = range?.getBoundingClientRect();
        if (rect && (rect.width > 0 || rect.height > 0)) {
          onSelectionContextMenu?.(sel, { left: rect.left, bottom: rect.bottom });
        }
      }
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    el.addEventListener("mouseup", handleMouseUp);
    return () => {
      el.removeEventListener("wheel", handleWheel);
      el.removeEventListener("mouseup", handleMouseUp);
    };
  }, [onSelectionContextMenu]);

  return (
    <div className="shrink-0 border-l bg-background flex flex-col h-full">
      <div className="flex items-center px-4 h-10 border-b">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate">{fileName}</span>
        </div>
        {boundNodeExists === false && onCreateBoundNode && (
          <button onClick={onCreateBoundNode} className="text-xs text-primary hover:underline mr-2 shrink-0">创建绑定节点</button>
        )}
        <div className="flex items-center gap-0.5 ml-2 shrink-0">
          <span className="text-xs text-muted-foreground mr-1">
            {pageNum} / {numPages}
          </span>
          <button
            onClick={() => setPageNum((p) => Math.max(1, p - 1))}
            disabled={pageNum <= 1}
            className="p-0.5 rounded hover:bg-accent disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setPageNum((p) => Math.min(numPages, p + 1))}
            disabled={pageNum >= numPages}
            className="p-0.5 rounded hover:bg-accent disabled:opacity-30"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="p-0.5 rounded hover:bg-accent text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div ref={containerRef} className="flex-1 overflow-auto flex justify-center bg-muted/30 relative">
        <div className="relative my-2">
          <canvas ref={canvasRef} className="shadow-md" />
          <div ref={textLayerRef} className="absolute top-0 left-0" />
        </div>
      </div>
    </div>
  );
}
