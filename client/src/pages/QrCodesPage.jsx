import { useEffect, useState } from 'react';
import { ArrowRight, Check, Copy, Download, ExternalLink, FileText, Globe, Link2, LogOut, QrCode, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import api, { getApiError } from '../services/api.js';

function slugFromTitle(title) {
  const base = title.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'document';
  return `${base}-${crypto.randomUUID().slice(0, 6)}`;
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function DocumentSelect({ documents, value, onChange, label = 'Document' }) {
  return (
    <label className="form-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} required>
        <option value="">Choose a document</option>
        {documents.map((document) => <option value={document.id} key={document.id}>{document.title}</option>)}
      </select>
    </label>
  );
}

export function QrCodesPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [urls, setUrls] = useState([]);
  const [qrs, setQrs] = useState([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState('');
  const [urlDestinationType, setUrlDestinationType] = useState('document');
  const [urlDestinationUrl, setUrlDestinationUrl] = useState('');
  const [urlDestinationStatus, setUrlDestinationStatus] = useState({ status: 'idle', message: '' });
  const [slug, setSlug] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [slugState, setSlugState] = useState({ status: 'idle', message: '' });
  const [qrDocumentId, setQrDocumentId] = useState('');
  const [qrMode, setQrMode] = useState('dynamic');
  const [qrDestinationType, setQrDestinationType] = useState('document');
  const [qrDestinationUrl, setQrDestinationUrl] = useState('');
  const [qrExpiresAt, setQrExpiresAt] = useState('');
  const [qrDestinationStatus, setQrDestinationStatus] = useState({ status: 'idle', message: '' });
  const [editingQrId, setEditingQrId] = useState(null);
  const [editedQrDestinationType, setEditedQrDestinationType] = useState('document');
  const [editedQrDocumentId, setEditedQrDocumentId] = useState('');
  const [editedQrDestinationUrl, setEditedQrDestinationUrl] = useState('');
  const [qrName, setQrName] = useState('');
  const [foregroundColor, setForegroundColor] = useState('#163e2a');
  const [backgroundColor, setBackgroundColor] = useState('#ffffff');
  const [errorCorrectionLevel, setErrorCorrectionLevel] = useState('H');
  const [size, setSize] = useState(512);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState({ type: '', text: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.get('/documents'),
      api.get('/urls'),
      api.get('/qr'),
    ])
      .then(async ([documentsResponse, urlsResponse, qrsResponse]) => {
        if (!active) return;
        const documentItems = documentsResponse.data.documents;
        setDocuments(documentItems);
        setUrls(urlsResponse.data.urls);
        setSelectedDocumentId((current) => current || documentItems[0]?.id || '');
        const qrItems = await Promise.all(qrsResponse.data.qrs.map(async (qr) => {
          const { data } = await api.get(`/qr/${qr.id}`);
          return data.qr;
        }));
        if (active) setQrs(qrItems);
      })
      .catch((error) => {
        if (active) setNotice({ type: 'error', text: getApiError(error, 'Could not load QR codes and links.') });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const selectedDocument = documents.find((document) => document.id === selectedDocumentId);
  const existingUrl = urls.find((item) => item.document?.id === selectedDocumentId);
  const qrDocument = documents.find((document) => document.id === qrDocumentId);

  useEffect(() => {
    if (!qrDocument) return;
    setQrDestinationType(qrDocument.destinationType || 'document');
    setQrDestinationUrl(qrDocument.destinationUrl || '');
  }, [qrDocumentId, qrDocument?.destinationType, qrDocument?.destinationUrl]);

  useEffect(() => {
    if (!selectedDocument) {
      setSlug('');
      setExpiresAt('');
      return;
    }
    setSlug(existingUrl?.slug || slugFromTitle(selectedDocument.title));
    setExpiresAt(existingUrl?.expiresAt ? existingUrl.expiresAt.slice(0, 10) : '');
  }, [selectedDocumentId, existingUrl?.id, existingUrl?.slug]);

  useEffect(() => {
    if (slug.length < 3) {
      setSlugState({ status: 'invalid', message: 'Use at least 3 characters.' });
      return undefined;
    }

    let active = true;
    setSlugState({ status: 'checking', message: 'Checking availability…' });
    const timer = window.setTimeout(() => {
      api.get(`/urls/check/${encodeURIComponent(slug)}`, {
        params: existingUrl ? { excludeId: existingUrl.id } : undefined,
      })
        .then(({ data }) => {
          if (active) setSlugState({
            status: data.available ? 'available' : 'taken',
            message: data.available ? 'Available' : 'Already in use',
          });
        })
        .catch((error) => {
          if (active) setSlugState({ status: 'invalid', message: getApiError(error, 'Use lowercase letters, numbers, and hyphens.') });
        });
    }, 350);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [slug, existingUrl?.id]);

  async function saveUrl(event) {
    event.preventDefault();
    if (slugState.status !== 'available') return;
    if (urlDestinationType === 'document' && !selectedDocumentId) return;
    if (urlDestinationType === 'external' && !urlDestinationUrl.trim()) return;

    setBusy(true);
    setNotice({ type: '', text: '' });
    try {
      let finalDestinationUrl = urlDestinationUrl.trim();
      if (urlDestinationType === 'external') {
        const { data: validation } = await api.post('/urls/validate', { destinationUrl: finalDestinationUrl });
        setUrlDestinationStatus({ status: validation.status, message: validation.message });
        if (!validation.valid) {
          setNotice({ type: 'error', text: validation.message });
          setBusy(false);
          return;
        }
        finalDestinationUrl = validation.normalizedUrl;
        setUrlDestinationUrl(validation.normalizedUrl);
      }

      const payload = {
        slug,
        expiresAt: null,
      };
      if (urlDestinationType === 'external') {
        payload.destinationUrl = finalDestinationUrl;
      } else {
        payload.documentId = selectedDocumentId;
      }

      const response = existingUrl
        ? await api.put(`/urls/${existingUrl.id}`, payload)
        : await api.post('/urls', payload);
      const nextUrl = response.data.url;
      setUrls((current) => [nextUrl, ...current.filter((item) => item.id !== nextUrl.id)]);
      setNotice({ type: 'success', text: existingUrl ? 'Custom URL updated.' : 'Custom URL created.' });
    } catch (error) {
      setNotice({ type: 'error', text: getApiError(error, 'Could not save this URL.') });
    } finally {
      setBusy(false);
    }
  }

  async function createQr(event) {
    event.preventDefault();
    if (!qrDocumentId || !qrName.trim() || (qrDestinationType === 'external' && !isHttpUrl(qrDestinationUrl))) return;
    setBusy(true);
    setNotice({ type: '', text: '' });
    try {
      let normalizedDestinationUrl;
      if (qrDestinationType === 'external') {
        const { data: validation } = await api.post('/urls/validate', { destinationUrl: qrDestinationUrl });
        setQrDestinationStatus({ status: validation.status, message: validation.message });
        if (!validation.valid) {
          setNotice({ type: 'error', text: validation.message });
          return;
        }
        normalizedDestinationUrl = validation.normalizedUrl;
        setQrDestinationUrl(validation.normalizedUrl);
      }
      const payload = {
        documentId: qrDocumentId,
        name: qrName.trim(),
        qrMode,
        destinationType: qrDestinationType,
        foregroundColor: foregroundColor.toUpperCase(),
        backgroundColor: backgroundColor.toUpperCase(),
        errorCorrectionLevel,
        size: Number(size),
        expiresAt: qrExpiresAt ? new Date(`${qrExpiresAt}T23:59:59.999Z`).toISOString() : null,
      };
      if (normalizedDestinationUrl) payload.destinationUrl = normalizedDestinationUrl;
      const { data } = await api.post('/qr', payload);
      setQrs((current) => [data.qr, ...current]);
      setQrName('');
      setNotice({ type: 'success', text: 'QR code created.' });
    } catch (error) {
      setNotice({ type: 'error', text: getApiError(error, 'Could not create this QR code.') });
    } finally {
      setBusy(false);
    }
  }

  async function changeDestination(qrId, payload) {
    setBusy(true);
    try {
      const { data } = await api.post(`/qr/${qrId}/change-destination`, payload);
      const preview = qrs.find((qr) => qr.id === qrId)?.previewDataUrl;
      setQrs((current) => current.map((qr) => qr.id === qrId ? { ...data.qr, previewDataUrl: preview } : qr));
      setNotice({ type: 'success', text: 'Destination changed. The QR identifier is unchanged.' });
    } catch (error) {
      setNotice({ type: 'error', text: getApiError(error, 'Could not change the destination.') });
    } finally {
      setBusy(false);
    }
  }

  function beginQrDestinationEdit(qr) {
    setEditingQrId(qr.id);
    setEditedQrDestinationType(qr.destinationType || 'document');
    setEditedQrDocumentId(qr.document.id);
    setEditedQrDestinationUrl(qr.destinationType === 'external' ? qr.destinationUrl : '');
  }

  async function saveQrDestination(qrId) {
    if (editedQrDestinationType === 'external') {
      if (!isHttpUrl(editedQrDestinationUrl)) {
        setNotice({ type: 'error', text: 'Enter a complete HTTP or HTTPS destination URL.' });
        return;
      }
      try {
        const { data } = await api.post('/urls/validate', { destinationUrl: editedQrDestinationUrl });
        if (!data.valid) {
          setNotice({ type: 'error', text: data.message });
          return;
        }
        await changeDestination(qrId, { destinationUrl: data.normalizedUrl });
      } catch (error) {
        setNotice({ type: 'error', text: getApiError(error, 'Could not validate this destination URL.') });
        return;
      }
    } else {
      await changeDestination(qrId, { documentId: editedQrDocumentId });
    }
    setEditingQrId(null);
  }

  async function validateQrDestination() {
    setQrDestinationStatus({ status: 'checking', message: 'Validating URL…' });
    try {
      const { data } = await api.post('/urls/validate', { destinationUrl: qrDestinationUrl });
      setQrDestinationStatus({ status: data.status, message: data.message });
      if (data.valid) setQrDestinationUrl(data.normalizedUrl);
    } catch (error) {
      setQrDestinationStatus({ status: 'invalid', message: getApiError(error, 'Enter a complete HTTP or HTTPS URL.') });
    }
  }

  async function checkQrDestination() {
    setQrDestinationStatus({ status: 'checking', message: 'Checking destination…' });
    try {
      const { data } = await api.post('/urls/reachability', { destinationUrl: qrDestinationUrl });
      setQrDestinationStatus({ status: data.status, message: data.message });
      if (data.valid) setQrDestinationUrl(data.normalizedUrl);
    } catch (error) {
      setQrDestinationStatus({ status: 'inconclusive', message: getApiError(error, 'Destination verification inconclusive.') });
    }
  }

  async function removeQr(qr) {
    if (qr.qrMode === 'direct' && qr.destinationType === 'external') {
      setNotice({ type: 'error', text: 'Direct external QR codes cannot be disabled after download.' });
      return;
    }
    if (!window.confirm('Deactivate this QR code? Printed copies will stop opening.')) return;
    try {
      await api.delete(`/qr/${qr.id}`);
      setQrs((current) => current.filter((item) => item.id !== qr.id));
      setNotice({ type: 'success', text: 'QR code deactivated.' });
    } catch (error) {
      setNotice({ type: 'error', text: getApiError(error, 'Could not deactivate this QR code.') });
    }
  }

  async function copyUrl(url) {
    try {
      await navigator.clipboard.writeText(url);
      setNotice({ type: 'success', text: 'Link copied.' });
    } catch {
      setNotice({ type: 'error', text: 'Could not copy the link. Copy it from the preview instead.' });
    }
  }

  async function signOut() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <main className="dashboard-shell">
      <aside className="dashboard-rail">
        <Link className="brand" to="/" aria-label="SmartQR home"><span className="brand-mark"><QrCode size={21} /></span><span>smartqr<span className="brand-period">.</span></span></Link>
        <div className="rail-label">WORKSPACE</div>
        <Link className="rail-item" to="/dashboard"><ShieldCheck size={17} /> Account</Link>
        <Link className="rail-item" to="/documents"><FileText size={17} /> Documents</Link>
        <Link className="rail-item rail-item-active" to="/qr-codes"><QrCode size={17} /> QR codes</Link>
        <div className="rail-bottom">{user.name}</div>
      </aside>
      <section className="dashboard-main">
        <header className="dashboard-topbar"><div className="dashboard-breadcrumb">Workspace <span>/</span> Links & QR codes</div><button className="signout-button" onClick={signOut} type="button"><LogOut size={16} /> Sign out</button></header>
        <div className="qr-workspace-content">
          <p className="eyebrow"><span /> DYNAMIC DESTINATIONS</p>
          <h1 className="dashboard-title">Links & QR codes.</h1>
          <p className="dashboard-lede">Update document destinations without replacing printed QR codes.</p>
          {notice.text && <div className={`${notice.type === 'error' ? 'form-error' : 'form-success'} qr-notice`} role={notice.type === 'error' ? 'alert' : 'status'}>{notice.text}</div>}

          <div className="link-qr-grid">
            <section className="link-editor" aria-labelledby="slug-heading">
              <p className="panel-kicker">CUSTOM URL</p>
              <h2 id="slug-heading">Create a short link</h2>
              <form className="qr-editor-form" onSubmit={saveUrl}>
                <label className="form-field">
                  <span>Destination type</span>
                  <select value={urlDestinationType} onChange={(event) => setUrlDestinationType(event.target.value)}>
                    <option value="document">Uploaded PDF on SmartQR</option>
                    <option value="external">Custom HTTPS URL</option>
                  </select>
                </label>
                {urlDestinationType === 'document' ? (
                  <DocumentSelect documents={documents} value={selectedDocumentId} onChange={setSelectedDocumentId} />
                ) : (
                  <label className="form-field">
                    <span>HTTPS destination URL</span>
                    <input
                      type="text"
                      value={urlDestinationUrl}
                      onChange={(event) => {
                        setUrlDestinationUrl(event.target.value);
                        setUrlDestinationStatus({ status: 'idle', message: '' });
                      }}
                      placeholder="https://example.com/target"
                      required
                    />
                    <small className="destination-url-hint">Any HTTPS link · Automatically validated</small>
                  </label>
                )}
                <label className="form-field"><span>URL slug</span><div className="slug-input"><span>/d/</span><input value={slug} onChange={(event) => setSlug(event.target.value)} maxLength={64} /></div></label>
                <div className={`slug-availability slug-${slugState.status}`}>{slugState.status === 'available' ? <Check size={14} /> : <Link2 size={14} />}{slugState.message}</div>
                <button className="form-submit" type="submit" disabled={busy || slugState.status !== 'available'}>{existingUrl ? 'Update link' : 'Create link'} <ArrowRight size={16} /></button>
              </form>
              <div className="custom-link-list">
                {urls.map((item) => (
                  <div className="custom-link-row" key={item.id}>
                    <div><strong>{item.document?.title || 'External destination'}</strong><small>{item.url}</small>{item.destinationUrl && <small className="custom-link-destination" title={item.destinationUrl}>{item.destinationUrl}</small>}</div>
                    <button type="button" title="Copy link" aria-label={`Copy ${item.url}`} onClick={() => copyUrl(item.url)}><Copy size={15} /></button>
                  </div>
                ))}
                {!loading && urls.length === 0 && <p className="empty-documents">No custom URLs yet.</p>}
              </div>
            </section>

            <section className="qr-editor" aria-labelledby="qr-heading">
              <p className="panel-kicker">PERMANENT QR</p>
              <h2 id="qr-heading">Generate a QR code</h2>
              <form className="qr-editor-form" onSubmit={createQr}>
                <DocumentSelect documents={documents} value={qrDocumentId} onChange={setQrDocumentId} label="Destination document" />
                <label className="form-field"><span>QR destination</span><select value={qrDestinationType} onChange={(event) => setQrDestinationType(event.target.value)}><option value="document">Uploaded PDF on SmartQR</option><option value="external">Custom external URL</option></select></label>
                {qrDestinationType === 'external' && <div className="qr-external-target">
                  <label className="form-field"><span>Complete destination URL</span><input type="url" value={qrDestinationUrl} onChange={(event) => { setQrDestinationUrl(event.target.value); setQrDestinationStatus({ status: 'idle', message: '' }); }} maxLength={2048} required placeholder="https://example.com/document.pdf" aria-invalid={qrDestinationStatus.status === 'invalid'} /><small className="destination-url-hint">HTTP or HTTPS · Up to 2,048 characters · Any domain</small></label>
                  <div className="destination-url-actions"><button className="utility-button" type="button" onClick={validateQrDestination} disabled={!qrDestinationUrl.trim() || qrDestinationStatus.status === 'checking'}>Validate URL</button><button className="utility-button" type="button" onClick={checkQrDestination} disabled={!qrDestinationUrl.trim() || qrDestinationStatus.status === 'checking'}>Test reachability</button>{qrDestinationStatus.message && <span className={`destination-check destination-check-${qrDestinationStatus.status}`} role="status">{qrDestinationStatus.message}</span>}</div>
                </div>}
                <fieldset className="qr-mode-fieldset"><legend>QR generation mode</legend><div className="qr-mode-options"><button type="button" className={qrMode === 'direct' ? 'qr-mode-active' : ''} aria-pressed={qrMode === 'direct'} onClick={() => setQrMode('direct')}><ExternalLink size={15} /><span><strong>Direct</strong><small>{qrDestinationType === 'external' ? 'Encodes the full URL' : 'Opens this PDF on SmartQR'}</small></span></button><button type="button" className={qrMode === 'dynamic' ? 'qr-mode-active' : ''} aria-pressed={qrMode === 'dynamic'} onClick={() => setQrMode('dynamic')}><Globe size={15} /><span><strong>Dynamic</strong><small>Update destination later</small></span></button></div></fieldset>
                <label className="form-field"><span>QR name</span><input value={qrName} onChange={(event) => setQrName(event.target.value)} maxLength={80} required placeholder="e.g. Front desk" /></label>
                <label className="form-field"><span>Expiration date <small>Optional</small></span><input type="date" value={qrExpiresAt} onChange={(event) => setQrExpiresAt(event.target.value)} /></label>
                <div className="qr-style-row">
                  <label className="form-field"><span>Foreground</span><input className="color-input" type="color" value={foregroundColor} onChange={(event) => setForegroundColor(event.target.value)} /></label>
                  <label className="form-field"><span>Background</span><input className="color-input" type="color" value={backgroundColor} onChange={(event) => setBackgroundColor(event.target.value)} /></label>
                  <label className="form-field"><span>Error correction</span><select value={errorCorrectionLevel} onChange={(event) => setErrorCorrectionLevel(event.target.value)}><option value="L">Low</option><option value="M">Medium</option><option value="Q">Quartile</option><option value="H">High</option></select></label>
                </div>
                <label className="form-field"><span>Image size <small>{size}px</small></span><input type="range" min="128" max="1024" step="64" value={size} onChange={(event) => setSize(event.target.value)} /></label>
                <button className="form-submit" type="submit" disabled={busy || documents.length === 0 || (qrDestinationType === 'external' && !isHttpUrl(qrDestinationUrl))}>{busy ? 'Working…' : 'Generate QR code'} <QrCode size={16} /></button>
              </form>
              <p className="qr-note">Direct external QRs encode the supplied URL. Dynamic QRs use a stable SmartQR redirect.</p>
            </section>
          </div>

          <section className="qr-list-section" aria-labelledby="qr-list-heading">
            <div className="qr-list-heading"><div><p className="panel-kicker">YOUR QR CODES</p><h2 id="qr-list-heading">Active codes <span>{qrs.length}</span></h2></div></div>
            {loading ? <p className="empty-documents">Loading QR codes…</p> : qrs.length === 0 ? <p className="empty-documents">No QR codes yet.</p> : (
              <div className="qr-list">
                {qrs.map((qr) => (
                  <article className="qr-card" key={qr.id}>
                    <img className="qr-preview-image" src={qr.previewDataUrl} alt={`QR code for ${qr.name}`} />
                    <div className="qr-card-details">
                      <div className="qr-card-title"><div><strong>{qr.name}</strong><small>{qr.document?.title || 'Document unavailable'} · {qr.qrMode}</small></div><code>{qr.uniqueCode}</code></div>
                      <div className="qr-card-link"><Link2 size={14} /><span title={qr.encodedUrl}>{qr.encodedUrl}</span><button type="button" title="Copy encoded QR URL" aria-label={`Copy encoded QR URL for ${qr.name}`} onClick={() => copyUrl(qr.encodedUrl)}><Copy size={14} /></button></div>
                      <div className="qr-current-target"><span>{qr.destinationType === 'external' ? 'External destination' : 'SmartQR PDF'}</span><strong title={qr.destinationUrl}>{qr.destinationUrl}</strong>{qr.expiresAt && <small>Expires {new Date(qr.expiresAt).toLocaleDateString()}</small>}
                        {editingQrId === qr.id ? <div className="qr-target-edit">
                          <select value={editedQrDestinationType} onChange={(event) => setEditedQrDestinationType(event.target.value)} aria-label="Edit QR destination type"><option value="document">SmartQR PDF</option><option value="external">External URL</option></select>
                          {editedQrDestinationType === 'document' ? <select value={editedQrDocumentId} onChange={(event) => setEditedQrDocumentId(event.target.value)} aria-label="Choose PDF destination">{documents.map((document) => <option value={document.id} key={document.id}>{document.title}</option>)}</select> : <input type="url" value={editedQrDestinationUrl} onChange={(event) => setEditedQrDestinationUrl(event.target.value)} maxLength={2048} aria-label="Edit external destination URL" placeholder="https://example.com/document" />}
                          <button className="utility-button" type="button" disabled={busy} onClick={() => saveQrDestination(qr.id)}>Save destination</button><button className="utility-button" type="button" onClick={() => setEditingQrId(null)}>Cancel</button>
                        </div> : <button className="utility-button" type="button" onClick={() => beginQrDestinationEdit(qr)}>Change destination</button>}
                      </div>
                      <div className="qr-card-actions">
                        <a href={`/api/qr/${qr.id}/download?format=png`} download><Download size={14} /> PNG</a>
                        <a href={`/api/qr/${qr.id}/download?format=svg`} download><Download size={14} /> SVG</a>
                        <a href={`/api/qr/${qr.id}/download?format=pdf`} download><Download size={14} /> PDF</a>
                        <button type="button" title={qr.qrMode === 'direct' && qr.destinationType === 'external' ? 'Direct external QR cannot be disabled' : 'Deactivate QR code'} aria-label={`Deactivate ${qr.name}`} disabled={qr.qrMode === 'direct' && qr.destinationType === 'external'} onClick={() => removeQr(qr)}><Trash2 size={14} /></button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}