import { useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { ArrowLeft, ArrowRight, Download, Maximize, Minus, Plus, Printer, Search, ShieldCheck } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import api, { getApiError } from '../services/api.js';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function DocumentViewerPage() {
  const { uniqueCode, slug } = useParams();
  const viewerRef = useRef(null);
  const pageWrapRef = useRef(null);
  const [documentInfo, setDocumentInfo] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageWidth, setPageWidth] = useState(720);
  const [zoom, setZoom] = useState(1);
  const [search, setSearch] = useState('');
  const [password, setPassword] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submittingPassword, setSubmittingPassword] = useState(false);

  const [resolvedRouteType, setResolvedRouteType] = useState(uniqueCode ? 'qr' : 'slug');
  const key = uniqueCode || slug;
  const apiPath = resolvedRouteType === 'qr'
    ? `/public/qr/${encodeURIComponent(key)}`
    : `/public/urls/${encodeURIComponent(key)}`;
  const fileUrl = resolvedRouteType === 'qr'
    ? `/api/public/qr/${encodeURIComponent(key)}/file`
    : `/api/public/urls/${encodeURIComponent(key)}/file`;
  const accessPath = resolvedRouteType === 'qr'
    ? `/public/qr/${encodeURIComponent(key)}/access`
    : `/public/urls/${encodeURIComponent(key)}/access`;
  const resolvedFileUrl = `${fileUrl}${documentInfo?.allowDownload ? '' : '?download=0'}`;
  const highlightedSearch = search.trim();

  const pdfFileSource = useMemo(() => ({
    url: fileUrl,
    withCredentials: true,
  }), [fileUrl]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');

    async function fetchDocument() {
      try {
        const { data } = await api.get(apiPath);
        if (!active) return;
        setDocumentInfo(data.document);
        setNeedsPassword(false);
        setPasswordError('');
      } catch (error) {
        if (!active) return;
        if (error.response?.data?.requiresPassword) {
          setDocumentInfo(error.response.data.document);
          setNeedsPassword(true);
          return;
        }

        // Attempt fallback to alternate endpoint (slug vs qr)
        const alternateType = resolvedRouteType === 'qr' ? 'slug' : 'qr';
        const alternateApiPath = alternateType === 'qr'
          ? `/public/qr/${encodeURIComponent(key)}`
          : `/public/urls/${encodeURIComponent(key)}`;

        try {
          const { data } = await api.get(alternateApiPath);
          if (!active) return;
          setResolvedRouteType(alternateType);
          setDocumentInfo(data.document);
          setNeedsPassword(false);
          setPasswordError('');
          return;
        } catch {
          // If fallback fails, show initial error
        }

        setLoadError(getApiError(error, 'This document could not be opened.'));
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchDocument();
    return () => {
      active = false;
    };
  }, [apiPath, key, resolvedRouteType]);

  useEffect(() => {
    const node = pageWrapRef.current;
    if (!node) return undefined;
    let lastWidth = 0;
    const observer = new ResizeObserver(([entry]) => {
      const nextWidth = Math.max(280, Math.floor(entry.contentRect.width - 32));
      if (Math.abs(nextWidth - lastWidth) > 8) {
        lastWidth = nextWidth;
        setPageWidth(nextWidth);
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [documentInfo, needsPassword]);

  async function submitPassword(event) {
    event.preventDefault();
    setPasswordError('');
    setSubmittingPassword(true);
    try {
      await api.post(accessPath, { password });
      const { data } = await api.get(apiPath);
      setDocumentInfo(data.document);
      setNeedsPassword(false);
      setPassword('');
    } catch (error) {
      setPasswordError(getApiError(error, 'Could not verify the document password.'));
    } finally {
      setSubmittingPassword(false);
    }
  }

  async function enterFullscreen() {
    if (!viewerRef.current) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await viewerRef.current.requestFullscreen();
    }
  }

  function renderTextItem({ str }) {
    if (!highlightedSearch || !str.toLowerCase().includes(highlightedSearch.toLowerCase())) return str;
    const pieces = str.split(new RegExp(`(${escapeRegex(highlightedSearch)})`, 'ig'));
    return pieces.map((piece, index) => piece.toLowerCase() === highlightedSearch.toLowerCase()
      ? <mark key={`${piece}-${index}`}>{piece}</mark>
      : piece);
  }

  if (loading) return <main className="viewer-state" role="status">Loading document…</main>;

  if (needsPassword) {
    return (
      <main className="viewer-gate">
        <Link className="brand" to="/" aria-label="SmartQR home"><span className="brand-mark"><ShieldCheck size={19} /></span><span>smartqr<span className="brand-period">.</span></span></Link>
        <section className="viewer-gate-content">
          <p className="eyebrow"><span /> PASSWORD PROTECTED</p>
          <h1 className="auth-title">Unlock this document.</h1>
          <p className="auth-description">{documentInfo?.title || 'Enter the document password to continue.'}</p>
          <form className="auth-form" onSubmit={submitPassword}>
            {passwordError && <div className="form-error" role="alert">{passwordError}</div>}
            <label className="form-field"><span>Password</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            <button className="form-submit" type="submit" disabled={submittingPassword}>{submittingPassword ? 'Checking…' : 'Open document'} <ArrowLeft size={16} /></button>
          </form>
        </section>
      </main>
    );
  }

  if (loadError || !documentInfo) {
    const loginRequired = loadError.toLowerCase().includes('sign in');
    return (
      <main className="viewer-state viewer-error-state">
        <ShieldCheck size={28} />
        <h1>{loadError || 'This document could not be opened.'}</h1>
        {loginRequired && <Link className="primary-link" to={`/login?next=${encodeURIComponent(window.location.pathname)}`}>Sign in to continue</Link>}
        <Link className="viewer-home-link" to="/">Back to SmartQR</Link>
      </main>
    );
  }

  return (
    <main className="pdf-viewer" ref={viewerRef}>
      <header className="viewer-toolbar">
        <Link className="viewer-brand" to="/" aria-label="SmartQR home"><span className="brand-mark"><ShieldCheck size={18} /></span></Link>
        <div className="viewer-title"><strong>{documentInfo.title}</strong><small>PDF · Version {documentInfo.version}</small></div>
        <div className="viewer-controls">
          <label className="viewer-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find in document" aria-label="Search document text" /></label>
          <span className="toolbar-divider" />
          <button type="button" title="Previous page" aria-label="Previous page" disabled={pageNumber <= 1} onClick={() => setPageNumber((value) => Math.max(1, value - 1))}><ArrowLeft size={16} /></button>
          <label className="page-count"><input type="number" min="1" max={numPages || 1} value={pageNumber} onChange={(event) => setPageNumber(Math.min(numPages || 1, Math.max(1, Number(event.target.value))))} aria-label="Current page" /><span>/ {numPages || '—'}</span></label>
          <button type="button" title="Next page" aria-label="Next page" disabled={pageNumber >= numPages} onClick={() => setPageNumber((value) => Math.min(numPages, value + 1))}><ArrowRight size={16} /></button>
          <span className="toolbar-divider" />
          <button type="button" title="Zoom out" aria-label="Zoom out" disabled={zoom <= 0.6} onClick={() => setZoom((value) => Math.max(0.6, +(value - 0.1).toFixed(1)))}><Minus size={16} /></button>
          <span className="zoom-value">{Math.round(zoom * 100)}%</span>
          <button type="button" title="Zoom in" aria-label="Zoom in" disabled={zoom >= 2.2} onClick={() => setZoom((value) => Math.min(2.2, +(value + 0.1).toFixed(1)))}><Plus size={16} /></button>
          <button type="button" title="Fit to width" aria-label="Fit to width" onClick={() => setZoom(1)}><span className="fit-label">FIT</span></button>
          <button type="button" title="Full screen" aria-label="Full screen" onClick={enterFullscreen}><Maximize size={16} /></button>
          {documentInfo.allowPrint && <button type="button" title="Print document" aria-label="Print document" onClick={() => window.print()}><Printer size={16} /></button>}
          {documentInfo.allowDownload && <a className="viewer-download" href={`${resolvedFileUrl}?download=1`} title="Download PDF" aria-label="Download PDF"><Download size={16} /></a>}
        </div>
      </header>
      <section className="viewer-canvas" ref={pageWrapRef} aria-label="PDF pages">
        <Document
          file={pdfFileSource}
          onLoadSuccess={({ numPages: count }) => {
            setNumPages(count);
            setPageNumber((value) => Math.max(1, Math.min(value || 1, count || 1)));
          }}
          onLoadError={() => setLoadError('The PDF could not be rendered.')}
          loading={<div className="viewer-state">Loading PDF pages…</div>}
          error={<div className="viewer-state viewer-error-state">This PDF could not be displayed.</div>}
        >
          {numPages > 0 && (
            <div className="viewer-page">
              <Page
                pageNumber={Math.max(1, Math.min(pageNumber, numPages))}
                width={Math.min(pageWidth, 900) * zoom}
                renderTextLayer
                renderAnnotationLayer
                customTextRenderer={renderTextItem}
                loading={<div className="viewer-state">Rendering page…</div>}
              />
            </div>
          )}
        </Document>
      </section>
      <footer className="viewer-footnote"><ShieldCheck size={13} /><span>Document access is controlled by its owner. Viewing controls do not prevent screenshots or copying.</span></footer>
    </main>
  );
}