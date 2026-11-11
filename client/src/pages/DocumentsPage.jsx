import { useEffect, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Ban, Check, Copy, Download, ExternalLink, FileText, Globe, Link2, Lock, LogOut, Pencil, QrCode, RefreshCw, Search, Trash2, Unlock, Upload, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useAuth } from '../context/AuthContext.jsx';
import api, { getApiError } from '../services/api.js';

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const uploadSchema = z.object({
  title: z.string().trim().max(160),
  description: z.string().trim().max(2000),
  category: z.string().trim().max(80),
  tags: z.string().trim().max(640),
});

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentsPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const fileInput = useRef(null);
  const [documents, setDocuments] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [destinationType, setDestinationType] = useState('document');
  const [destinationUrl, setDestinationUrl] = useState('');
  const [accessType, setAccessType] = useState('public');
  const [documentPassword, setDocumentPassword] = useState('');
  const [qrMode, setQrMode] = useState('dynamic');
  const [destinationCheck, setDestinationCheck] = useState({ status: 'idle', message: '' });
  const [createdQr, setCreatedQr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [validatingDestination, setValidatingDestination] = useState(false);
  const [checkingReachability, setCheckingReachability] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const [refreshKey, setRefreshKey] = useState(0);
  const [editingDocument, setEditingDocument] = useState(null);
  const [editedTitle, setEditedTitle] = useState('');
  const [editingDestination, setEditingDestination] = useState(null);
  const [editedDestinationType, setEditedDestinationType] = useState('document');
  const [editedDestinationUrl, setEditedDestinationUrl] = useState('');
  const [filterDestinationType, setFilterDestinationType] = useState('');
  const [filterQrMode, setFilterQrMode] = useState('');
  const [filterValidationStatus, setFilterValidationStatus] = useState('');
  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(uploadSchema),
    defaultValues: { title: '', description: '', category: '', tags: '' },
  });

  useEffect(() => {
    let active = true;
    setLoading(true);
    const params = { search, sort };
    if (filterDestinationType) params.destinationType = filterDestinationType;
    if (filterQrMode) params.qrMode = filterQrMode;
    if (filterValidationStatus) params.validationStatus = filterValidationStatus;
    api.get('/documents', { params })
      .then(({ data }) => {
        if (active) setDocuments(data.documents);
      })
      .catch((error) => {
        if (active) setErrorMessage(getApiError(error, 'Could not load documents.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [search, sort, filterDestinationType, filterQrMode, filterValidationStatus, refreshKey]);

  async function uploadDocument(details) {
    setErrorMessage('');
    setSuccessMessage('');
    if (!selectedFile) {
      setErrorMessage('Choose a PDF file first.');
      return;
    }
    if (selectedFile.size > MAX_FILE_BYTES) {
      setErrorMessage('The file exceeds the 25 MB upload limit.');
      return;
    }
    if (!selectedFile.name.toLowerCase().endsWith('.pdf')) {
      setErrorMessage('Choose a PDF file.');
      return;
    }

    let normalizedDestinationUrl;
    if (destinationType === 'external') {
      setValidatingDestination(true);
      try {
        const { data } = await api.post('/urls/validate', { destinationUrl });
        setDestinationCheck({ status: data.status, message: data.message });
        if (!data.valid) {
          setErrorMessage(data.message);
          return;
        }
        normalizedDestinationUrl = data.normalizedUrl;
        setDestinationUrl(data.normalizedUrl);
      } catch (error) {
        setErrorMessage(getApiError(error, 'Could not validate this destination URL.'));
        return;
      } finally {
        setValidatingDestination(false);
      }
    }

    const formData = new FormData();
    formData.set('file', selectedFile);
    formData.set('title', details.title || selectedFile.name.replace(/\.pdf$/i, ''));
    formData.set('description', details.description);
    formData.set('category', details.category);
    formData.set('tags', details.tags);
    formData.set('destinationType', destinationType);
    formData.set('accessType', accessType);
    if (accessType === 'password' && documentPassword) {
      if (documentPassword.length < 12) {
        setErrorMessage('Password must be at least 12 characters.');
        return;
      }
      formData.set('password', documentPassword);
    }
    if (normalizedDestinationUrl) formData.set('destinationUrl', normalizedDestinationUrl);

    setSubmitting(true);
    setCreatedQr(null);
    try {
      const { data: documentResponse } = await api.post('/documents', formData);
      const document = documentResponse.document;
      const qrPayload = {
        documentId: document.id,
        name: document.title,
        qrMode,
        destinationType,
      };
      if (normalizedDestinationUrl) qrPayload.destinationUrl = normalizedDestinationUrl;
      const { data: qrResponse } = await api.post('/qr', qrPayload);
      setCreatedQr(qrResponse.qr);
      setSelectedFile(null);
      if (fileInput.current) fileInput.current.value = '';
      reset();
      setSuccessMessage('PDF uploaded and QR code created.');
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setErrorMessage(getApiError(error, 'Could not upload the PDF or create its QR code.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function validateDestination() {
    setValidatingDestination(true);
    setErrorMessage('');
    try {
      const { data } = await api.post('/urls/validate', { destinationUrl });
      setDestinationCheck({ status: data.status, message: data.message });
      if (data.valid) setDestinationUrl(data.normalizedUrl);
    } catch (error) {
      setDestinationCheck({ status: 'invalid', message: getApiError(error, 'Enter a complete HTTP or HTTPS URL.') });
    } finally {
      setValidatingDestination(false);
    }
  }

  async function checkDestinationReachability() {
    setCheckingReachability(true);
    setErrorMessage('');
    try {
      const { data } = await api.post('/urls/reachability', { destinationUrl });
      setDestinationCheck({ status: data.status, message: data.message });
      if (data.valid) setDestinationUrl(data.normalizedUrl);
    } catch (error) {
      setDestinationCheck({ status: 'inconclusive', message: getApiError(error, 'Destination verification inconclusive.') });
    } finally {
      setCheckingReachability(false);
    }
  }

  async function replaceFile(documentId, file) {
    setErrorMessage('');
    setSuccessMessage('');
    if (!file.name.toLowerCase().endsWith('.pdf') || file.size > MAX_FILE_BYTES) {
      setErrorMessage('Choose a PDF no larger than 25 MB.');
      return;
    }
    const formData = new FormData();
    formData.set('file', file);
    try {
      await api.post(`/documents/${documentId}/replace`, formData);
      setSuccessMessage('PDF replaced. Existing document links will keep the same document ID.');
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setErrorMessage(getApiError(error, 'Could not replace this PDF.'));
    }
  }

  async function saveTitle(documentId) {
    setErrorMessage('');
    try {
      await api.patch(`/documents/${documentId}`, { title: editedTitle });
      setEditingDocument(null);
      setSuccessMessage('Document title updated.');
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setErrorMessage(getApiError(error, 'Could not update this document.'));
    }
  }

  function beginDestinationEdit(document) {
    setEditingDestination(document.id);
    setEditedDestinationType(document.destinationType || 'document');
    setEditedDestinationUrl(document.destinationUrl || '');
  }

  async function saveDestination(documentId) {
    setErrorMessage('');
    let payload = { destinationType: editedDestinationType };
    if (editedDestinationType === 'external') {
      try {
        const { data } = await api.post('/urls/validate', { destinationUrl: editedDestinationUrl });
        if (!data.valid) {
          setErrorMessage(data.message);
          return;
        }
        payload.destinationUrl = data.normalizedUrl;
      } catch (error) {
        setErrorMessage(getApiError(error, 'Enter a complete HTTP or HTTPS URL.'));
        return;
      }
    }
    try {
      await api.patch(`/documents/${documentId}`, payload);
      setEditingDestination(null);
      setSuccessMessage('Destination updated. Associated QR codes keep their identifiers.');
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setErrorMessage(getApiError(error, 'Could not update this destination.'));
    }
  }

  async function validateStoredDestination(document, checkReachability = false) {
    setErrorMessage('');
    try {
      const endpoint = checkReachability ? 'check-url' : 'validate-url';
      const { data } = await api.post(`/documents/${document.id}/${endpoint}`);
      setSuccessMessage(data.message);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setErrorMessage(getApiError(error, 'Could not verify this destination.'));
    }
  }

  async function disableQr(qr) {
    if (qr.qrMode === 'direct') {
      setErrorMessage('Direct QR codes cannot be disabled after download because they open the destination directly.');
      return;
    }
    if (!window.confirm('Disable this dynamic QR link? Existing scans will stop redirecting.')) return;
    try {
      await api.delete(`/qr/${qr.id}`);
      setSuccessMessage('Dynamic QR link disabled.');
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setErrorMessage(getApiError(error, 'Could not disable this QR link.'));
    }
  }

  async function toggleAccessType(document) {
    const nextAccess = document.accessType === 'public' ? 'private' : 'public';
    setErrorMessage('');
    try {
      await api.patch(`/documents/${document.id}`, { accessType: nextAccess });
      setSuccessMessage(`Document access changed to ${nextAccess}.`);
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setErrorMessage(getApiError(error, 'Could not update document access.'));
    }
  }

  async function deleteDocument(document) {
    if (!window.confirm(`Delete “${document.title}”? This cannot be undone.`)) return;
    setErrorMessage('');
    try {
      await api.delete(`/documents/${document.id}`);
      setSuccessMessage('Document deleted.');
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setErrorMessage(getApiError(error, 'Could not delete this document.'));
    }
  }

  async function signOut() {
    await logout();
    navigate('/login', { replace: true });
  }

  async function copyValue(value, label) {
    try {
      await navigator.clipboard.writeText(value);
      setSuccessMessage(`${label} copied.`);
    } catch {
      setErrorMessage(`Could not copy ${label.toLowerCase()}.`);
    }
  }

  return (
    <main className="dashboard-shell">
      <aside className="dashboard-rail">
        <Link className="brand" to="/" aria-label="SmartQR home">
          <span className="brand-mark"><FileText size={19} /></span>
          <span>smartqr<span className="brand-period">.</span></span>
        </Link>
        <div className="rail-label">WORKSPACE</div>
        <Link className="rail-item" to="/dashboard">Account</Link>
        <Link className="rail-item rail-item-active" to="/documents"><FileText size={17} /> Documents</Link>
        <Link className="rail-item" to="/qr-codes"><QrCode size={17} /> QR codes</Link>
        <div className="rail-bottom">{user.name}</div>
      </aside>
      <section className="dashboard-main">
        <header className="dashboard-topbar">
          <div className="dashboard-breadcrumb">Workspace <span>/</span> Documents</div>
          <button className="signout-button" onClick={signOut} type="button"><LogOut size={16} /> Sign out</button>
        </header>
        <div className="documents-content">
          <div className="documents-heading">
            <div><p className="eyebrow"><span /> DOCUMENT LIBRARY</p><h1 className="dashboard-title">Documents.</h1></div>
            <Link className="qr-workspace-link" to="/qr-codes"><QrCode size={16} /> Links & QR codes</Link>
          </div>

          <section className="upload-section" aria-labelledby="upload-heading">
            <div className="upload-heading"><div><span className="panel-kicker">ADD TO YOUR LIBRARY</span><h2 id="upload-heading">Upload a PDF</h2></div></div>
            <form className="document-upload-form" onSubmit={handleSubmit(uploadDocument)} noValidate>
              <label className="file-picker">
                <Upload size={17} />
                <span>{selectedFile ? selectedFile.name : 'Choose PDF'}</span>
                <input ref={fileInput} type="file" accept="application/pdf,.pdf" onChange={(event) => setSelectedFile(event.target.files?.[0] || null)} />
              </label>
              <label className="form-field"><span>Title</span><input {...register('title')} aria-invalid={Boolean(errors.title)} />{errors.title && <small className="field-error">{errors.title.message}</small>}</label>
              <label className="form-field"><span>Category</span><input {...register('category')} aria-invalid={Boolean(errors.category)} /></label>
              <label className="form-field"><span>Description</span><input {...register('description')} aria-invalid={Boolean(errors.description)} /></label>
              <label className="form-field"><span>Tags</span><input placeholder="Comma-separated" {...register('tags')} aria-invalid={Boolean(errors.tags)} /></label>
              <label className="form-field">
                <span>Document access</span>
                <select value={accessType} onChange={(event) => setAccessType(event.target.value)}>
                  <option value="public">Public (Anyone scanning the QR code can open the PDF directly)</option>
                  <option value="password">Password protected (Requires password to view)</option>
                  <option value="private">Private (Only you when signed in)</option>
                </select>
              </label>
              {accessType === 'password' && (
                <label className="form-field">
                  <span>Document password</span>
                  <input
                    type="password"
                    value={documentPassword}
                    onChange={(event) => setDocumentPassword(event.target.value)}
                    placeholder="At least 12 characters"
                    minLength={12}
                    required
                  />
                </label>
              )}
              <div className="upload-destination-settings">
                <label className="form-field"><span>QR destination</span><select value={destinationType} onChange={(event) => { setDestinationType(event.target.value); setDestinationCheck({ status: 'idle', message: '' }); }}><option value="document">Uploaded PDF on SmartQR</option><option value="external">Custom external URL</option></select></label>
                {destinationType === 'external' && <div className="destination-url-control">
                  <label className="form-field"><span>Complete destination URL</span><input type="url" value={destinationUrl} onChange={(event) => { setDestinationUrl(event.target.value); setDestinationCheck({ status: 'idle', message: '' }); }} maxLength={2048} required placeholder="https://example.com/document.pdf" aria-invalid={destinationCheck.status === 'invalid'} /><small className="destination-url-hint">HTTP or HTTPS · Up to 2,048 characters · Any domain</small></label>
                  <div className="destination-url-actions">
                    <button className="utility-button" type="button" onClick={validateDestination} disabled={validatingDestination || !destinationUrl.trim()}>{validatingDestination ? 'Validating…' : 'Validate URL'}</button>
                    <button className="utility-button" type="button" onClick={checkDestinationReachability} disabled={checkingReachability || !destinationUrl.trim()}>{checkingReachability ? 'Checking…' : 'Test reachability'}</button>
                    {destinationCheck.message && <span className={`destination-check destination-check-${destinationCheck.status}`} role="status">{destinationCheck.message}</span>}
                  </div>
                </div>}
                <fieldset className="qr-mode-fieldset">
                  <legend>QR generation mode</legend>
                  <div className="qr-mode-options">
                    <button type="button" className={qrMode === 'direct' ? 'qr-mode-active' : ''} aria-pressed={qrMode === 'direct'} onClick={() => setQrMode('direct')}><ExternalLink size={15} /><span><strong>Direct</strong><small>{destinationType === 'external' ? 'Encodes the full URL' : 'Opens this PDF on SmartQR'}</small></span></button>
                    <button type="button" className={qrMode === 'dynamic' ? 'qr-mode-active' : ''} aria-pressed={qrMode === 'dynamic'} onClick={() => setQrMode('dynamic')}><Globe size={15} /><span><strong>Dynamic</strong><small>Update destination later</small></span></button>
                  </div>
                </fieldset>
              </div>
              <button className="form-submit upload-submit" type="submit" disabled={submitting || validatingDestination || (destinationType === 'external' && !destinationUrl.trim())}>{submitting ? 'Uploading and creating QR…' : 'Upload and create QR'} <ArrowRight size={16} /></button>
            </form>
            <p className="upload-limit">PDF only · Up to 25 MB · Public documents open directly for anyone scanning the QR</p>
            {createdQr && <section className="upload-qr-result" aria-label="Created QR code">
              <div className="upload-qr-image"><img src={createdQr.previewDataUrl} alt={`QR code for ${createdQr.name}`} /></div>
              <div className="upload-qr-details"><span className="panel-kicker">QR READY · {createdQr.qrMode.toUpperCase()}</span><strong>{createdQr.document.title}</strong><span>Destination: <a href={createdQr.destinationUrl} target="_blank" rel="noreferrer">{createdQr.destinationUrl}</a></span><span>QR content: <code>{createdQr.encodedUrl}</code></span><div className="upload-qr-actions">
                <button className="utility-button" type="button" onClick={() => copyValue(createdQr.destinationUrl, 'Destination URL')}><Copy size={14} /> Copy destination</button>
                <button className="utility-button" type="button" onClick={() => copyValue(createdQr.encodedUrl, 'QR URL')}><Copy size={14} /> Copy QR URL</button>
                <a className="utility-button" href={`/api/qr/${createdQr.id}/download?format=png`} download><Download size={14} /> PNG</a>
                <a className="utility-button" href={`/api/qr/${createdQr.id}/download?format=svg`} download><Download size={14} /> SVG</a>
                <a className="utility-button" href={`/api/qr/${createdQr.id}/download?format=pdf`} download><Download size={14} /> PDF</a>
              </div></div>
            </section>}
          </section>

          <section className="documents-section" aria-labelledby="library-heading">
            <div className="library-toolbar">
              <h2 id="library-heading">Your files <span>{documents.length}</span></h2>
              <div className="library-filters">
                <label className="document-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title or destination URL" aria-label="Search documents and destinations" /></label>
                <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort documents">
                  <option value="newest">Newest</option><option value="oldest">Oldest</option><option value="title">Title</option>
                </select>
                <select value={filterDestinationType} onChange={(event) => setFilterDestinationType(event.target.value)} aria-label="Filter by destination type"><option value="">All destinations</option><option value="document">SmartQR PDF</option><option value="external">External URL</option></select>
                <select value={filterQrMode} onChange={(event) => setFilterQrMode(event.target.value)} aria-label="Filter by QR mode"><option value="">All QR modes</option><option value="direct">Direct</option><option value="dynamic">Dynamic</option></select>
                <select value={filterValidationStatus} onChange={(event) => setFilterValidationStatus(event.target.value)} aria-label="Filter by URL validation"><option value="">All URL statuses</option><option value="not_checked">Not checked</option><option value="valid">Valid</option><option value="reachable">Reachable</option><option value="inaccessible">Inaccessible</option><option value="timeout">Timed out</option><option value="inconclusive">Inconclusive</option><option value="invalid">Invalid</option></select>
              </div>
            </div>
            {errorMessage && <div className="form-error document-notice" role="alert">{errorMessage}</div>}
            {successMessage && <div className="form-success document-notice" role="status">{successMessage}</div>}
            {loading ? <p className="empty-documents">Loading documents…</p> : documents.length === 0 ? (
              <p className="empty-documents">No documents found.</p>
            ) : (
              <div className="documents-table">
                <div className="documents-table-head"><span>DOCUMENT</span><span>DESTINATION</span><span>QR / MODE</span><span>URL STATUS</span><span>SCANS</span><span>UPDATED</span><span>ACTIONS</span></div>
                {documents.map((document) => (
                  <div className="documents-row" key={document.id}>
                    <div className="document-main-cell">
                      <span className="document-row-icon"><FileText size={17} /></span>
                      <div className="document-row-info">
                        {editingDocument === document.id ? (
                          <form className="rename-form" onSubmit={(event) => { event.preventDefault(); saveTitle(document.id); }}>
                            <input value={editedTitle} onChange={(event) => setEditedTitle(event.target.value)} aria-label="Document title" maxLength={160} autoFocus />
                            <button type="submit" title="Save title" aria-label="Save title">Save</button>
                            <button type="button" title="Cancel rename" aria-label="Cancel rename" onClick={() => setEditingDocument(null)}><X size={14} /></button>
                          </form>
                        ) : <><strong>{document.title}</strong><small>{document.originalFileName}{document.category ? ` · ${document.category}` : ''} · <span className={`access-pill access-${document.accessType || 'public'}`}>{document.accessType === 'public' ? 'Public' : document.accessType === 'password' ? 'Password' : 'Private'}</span></small></>}
                      </div>
                    </div>
                    <div className="document-destination-cell">
                      {editingDestination === document.id ? <div className="destination-edit-form">
                        <select value={editedDestinationType} onChange={(event) => setEditedDestinationType(event.target.value)} aria-label={`Destination type for ${document.title}`}><option value="document">SmartQR PDF</option><option value="external">External URL</option></select>
                        {editedDestinationType === 'external' && <input type="url" value={editedDestinationUrl} onChange={(event) => setEditedDestinationUrl(event.target.value)} maxLength={2048} aria-label={`Destination URL for ${document.title}`} placeholder="https://example.com/document" />}
                        <div><button type="button" onClick={() => saveDestination(document.id)}>Save</button><button type="button" onClick={() => setEditingDestination(null)}>Cancel</button></div>
                      </div> : <><strong>{document.destinationType === 'external' ? 'External URL' : 'SmartQR PDF'}</strong>{document.destinationUrl && <small title={document.destinationUrl}>{document.destinationUrl}</small>}</>}
                    </div>
                    <div className="document-qr-cell">
                      {document.qrCodes?.length ? <>
                        <img src={`/api/qr/${document.qrCodes[0].id}/download?format=png`} alt={`QR code for ${document.title}`} />
                        <span className={`qr-mode-badge qr-mode-${document.qrCodes[0].qrMode}`}>{document.qrCodes[0].qrMode}{document.qrCodes[0].qrMode === 'direct' && document.qrCodes[0].destinationType === 'external' ? ' · not revocable' : ''}</span>
                      </> : <span className="document-table-empty">No QR yet</span>}
                    </div>
                    <div className="document-validation-cell">
                      <span className={`validation-badge validation-${document.validationStatus || 'not_checked'}`}>{(document.validationStatus || 'not_checked').replaceAll('_', ' ')}</span>
                      {document.destinationType === 'external' && <div className="validation-actions"><button type="button" onClick={() => validateStoredDestination(document)}>Validate</button><button type="button" onClick={() => validateStoredDestination(document, true)}>Test connection</button></div>}
                    </div>
                    <div className="document-scan-cell">{document.qrCodes?.length ? document.qrCodes.every((qr) => qr.qrMode === 'direct') ? 'Not tracked' : document.qrCodes.reduce((sum, qr) => sum + qr.scanCount, 0) : '—'}</div>
                    <span className="document-meta-cell">{new Date(document.updatedAt).toLocaleDateString()}</span>
                    <div className="document-actions">
                      <button type="button" title="Preview PDF" aria-label={`Preview ${document.title}`} onClick={() => window.open(`/api/documents/${document.id}/preview`, '_blank', 'noopener,noreferrer')}><FileText size={15} /></button>
                      {document.qrCodes?.[0] && <a className="document-action-link" title="Download QR code" aria-label={`Download QR code for ${document.title}`} href={`/api/qr/${document.qrCodes[0].id}/download?format=png`} download><Download size={15} /></a>}
                      <button type="button" title={`Change access (currently ${document.accessType})`} aria-label={`Change access for ${document.title}`} onClick={() => toggleAccessType(document)}>{document.accessType === 'public' ? <Unlock size={15} /> : <Lock size={15} />}</button>
                      <button type="button" title="Edit destination URL" aria-label={`Edit destination for ${document.title}`} onClick={() => beginDestinationEdit(document)}><Link2 size={15} /></button>
                      {document.qrCodes?.[0] && <button type="button" title={document.qrCodes[0].qrMode === 'direct' ? 'Direct QR links cannot be disabled' : 'Disable dynamic QR link'} aria-label={`Disable QR link for ${document.title}`} onClick={() => disableQr(document.qrCodes[0])} disabled={document.qrCodes[0].qrMode === 'direct'}><Ban size={15} /></button>}
                      <button type="button" title="Rename document" aria-label={`Rename ${document.title}`} onClick={() => { setEditingDocument(document.id); setEditedTitle(document.title); }}><Pencil size={15} /></button>
                      <label className="action-upload" title="Replace PDF" aria-label={`Replace ${document.title}`}>
                        <RefreshCw size={15} /><input type="file" accept="application/pdf,.pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) replaceFile(document.id, file); event.target.value = ''; }} />
                      </label>
                      <button type="button" title="Delete document" aria-label={`Delete ${document.title}`} onClick={() => deleteDocument(document)}><Trash2 size={15} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}