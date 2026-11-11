import { Suspense, lazy, useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Activity, ArrowRight, FileText, Link2, LogOut, QrCode, ShieldCheck, Users } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useAuth } from '../context/AuthContext.jsx';
import api, { getApiError } from '../services/api.js';

const AnalyticsCharts = lazy(() => import('./AnalyticsCharts.jsx').then((module) => ({ default: module.AnalyticsCharts })));

const profileSchema = z.object({
  name: z.string().trim().min(2, 'Enter at least 2 characters.').max(80),
});

export function DashboardPage() {
  const navigate = useNavigate();
  const { user, logout, updateProfile } = useAuth();
  const [days, setDays] = useState(30);
  const [analytics, setAnalytics] = useState(null);
  const [scanData, setScanData] = useState({ scans: [], devices: [], total: 0 });
  const [documents, setDocuments] = useState([]);
  const [analyticsError, setAnalyticsError] = useState('');
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [profileError, setProfileError] = useState('');
  const [profileSaved, setProfileSaved] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user.name },
  });

  useEffect(() => {
    let active = true;
    setAnalyticsLoading(true);
    Promise.all([
      api.get('/analytics/overview'),
      api.get('/analytics/scans', { params: { days } }),
      api.get('/analytics/documents'),
    ])
      .then(([overviewResponse, scansResponse, documentsResponse]) => {
        if (!active) return;
        setAnalytics(overviewResponse.data);
        setScanData(scansResponse.data);
        setDocuments(documentsResponse.data.documents);
      })
      .catch((error) => {
        if (active) setAnalyticsError(getApiError(error, 'Analytics could not be loaded.'));
      })
      .finally(() => {
        if (active) setAnalyticsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [days]);

  async function saveProfile(details) {
    setProfileError('');
    setProfileSaved(false);
    try {
      await updateProfile(details);
      setProfileSaved(true);
    } catch (error) {
      setProfileError(error.response?.data?.error || 'Could not update your profile.');
    }
  }

  async function signOut() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <main className="dashboard-shell">
      <aside className="dashboard-rail">
        <Link className="brand" to="/" aria-label="SmartQR home">
          <span className="brand-mark"><QrCode size={21} strokeWidth={2.2} /></span>
          <span>smartqr<span className="brand-period">.</span></span>
        </Link>
        <div className="rail-label">WORKSPACE</div>
        <Link className="rail-item rail-item-active" to="/dashboard"><Activity size={17} /> Overview</Link>
        <Link className="rail-item" to="/documents"><FileText size={17} /> Documents</Link>
        <Link className="rail-item" to="/qr-codes"><QrCode size={17} /> QR codes</Link>
        <div className="rail-bottom"><span className="status-dot" /> SECURE SESSION</div>
      </aside>
      <section className="dashboard-main">
        <header className="dashboard-topbar">
          <div className="dashboard-breadcrumb">Workspace <span>/</span> Overview</div>
          <button className="signout-button" onClick={signOut} type="button"><LogOut size={16} /> Sign out</button>
        </header>
        <div className="dashboard-content">
          <div className="dashboard-intro-row">
            <div><p className="eyebrow"><span /> WORKSPACE OVERVIEW</p><h1 className="dashboard-title">Good to see you, {user.name.split(' ')[0]}.</h1></div>
            <div className="date-filter" role="group" aria-label="Analytics date range">
              {[7, 30, 90].map((range) => <button key={range} type="button" className={days === range ? 'date-filter-active' : ''} onClick={() => setDays(range)}>{range}d</button>)}
            </div>
          </div>
          <p className="dashboard-lede">Document activity over the last {days} days. Unique sessions are estimates, not people.</p>
          {analyticsError && <div className="form-error analytics-notice" role="alert">{analyticsError}</div>}
          <div className="metric-grid">
            <article className="metric-item"><span className="metric-icon"><FileText size={17} /></span><span className="metric-label">Documents</span><strong>{analyticsLoading ? '—' : analytics?.overview.totalDocuments ?? 0}</strong></article>
            <article className="metric-item"><span className="metric-icon metric-icon-rust"><QrCode size={17} /></span><span className="metric-label">QR codes</span><strong>{analyticsLoading ? '—' : analytics?.overview.totalQrs ?? 0}</strong></article>
            <article className="metric-item"><span className="metric-icon metric-icon-blue"><Activity size={17} /></span><span className="metric-label">Visits</span><strong>{analyticsLoading ? '—' : analytics?.overview.totalScans ?? 0}</strong></article>
            <article className="metric-item"><span className="metric-icon metric-icon-olive"><Users size={17} /></span><span className="metric-label">Unique sessions</span><strong>{analyticsLoading ? '—' : analytics?.overview.uniqueVisitors ?? 0}</strong></article>
            <article className="metric-item"><span className="metric-icon"><Link2 size={17} /></span><span className="metric-label">Active links</span><strong>{analyticsLoading ? '—' : analytics?.overview.activeLinks ?? 0}</strong></article>
            <article className="metric-item"><span className="metric-icon metric-icon-rust"><ShieldCheck size={17} /></span><span className="metric-label">Protected</span><strong>{analyticsLoading ? '—' : analytics?.overview.protectedDocuments ?? 0}</strong></article>
          </div>
          <Suspense fallback={<div className="route-loading chart-loading">Loading charts…</div>}>
            <AnalyticsCharts scans={scanData.scans} devices={scanData.devices} total={scanData.total} documents={documents} />
          </Suspense>
          <div className="dashboard-lower-grid">
            <section className="account-panel account-summary" aria-labelledby="account-heading">
              <div className="account-panel-heading"><div><span className="panel-kicker">PROFILE</span><h2 id="account-heading">Account details</h2></div><span className="account-status"><i /> ACTIVE</span></div>
              <dl className="account-details"><div><dt>Email</dt><dd>{user.email}</dd></div><div><dt>Role</dt><dd>{user.role.replaceAll('_', ' ')}</dd></div><div><dt>Member since</dt><dd>{new Date(user.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</dd></div></dl>
              <form className="profile-form" onSubmit={handleSubmit(saveProfile)} noValidate>
                <label className="form-field"><span>Display name</span><input autoComplete="name" {...register('name')} aria-invalid={Boolean(errors.name)} />{errors.name && <small className="field-error">{errors.name.message}</small>}</label>
                {profileError && <div className="form-error" role="alert">{profileError}</div>}
                {profileSaved && <div className="form-success" role="status">Profile updated.</div>}
                <button className="profile-save" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save changes'}</button>
              </form>
            </section>
            <section className="activity-panel" aria-labelledby="activity-heading">
              <div className="analytics-panel-head"><div><span className="panel-kicker">ACCOUNT</span><h2 id="activity-heading">Recent activity</h2></div></div>
              {analytics?.recentActivity?.length ? analytics.recentActivity.map((item) => <div className="activity-row" key={item._id}><span className="activity-marker" /><div><strong>{item.description}</strong><small>{new Date(item.timestamp).toLocaleString()}</small></div></div>) : <p className="chart-empty">Account changes will appear here.</p>}
            </section>
          </div>
          <p className="privacy-caption">Unique sessions use a random first-party browser token and are not a count of individual people. No IP-based location is collected.</p>
          <Link className="dashboard-home-link" to="/">Back to SmartQR <ArrowRight size={16} /></Link>
        </div>
      </section>
    </main>
  );
}