import React, { Suspense, lazy, useEffect, useState } from 'react';
import { ArrowUpRight, FileText, QrCode, ShieldCheck } from 'lucide-react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { DashboardPage } from './pages/DashboardPage.jsx';
import { DocumentsPage } from './pages/DocumentsPage.jsx';
import { QrCodesPage } from './pages/QrCodesPage.jsx';
import {
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  ResetPasswordPage,
} from './pages/AuthPages.jsx';

const DocumentViewerPage = lazy(() => import('./pages/DocumentViewerPage.jsx').then((m) => ({ default: m.default || m.DocumentViewerPage })));

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('App render error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <main className="viewer-state viewer-error-state" style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '32px' }}>
          <ShieldCheck size={32} />
          <h1>Something went wrong displaying this page.</h1>
          <p style={{ color: '#68756c' }}>{this.state.error?.message || 'Please refresh or try again.'}</p>
          <a className="primary-link" href="/" style={{ padding: '10px 20px', background: 'var(--green, #2a6949)', color: '#fff', borderRadius: '4px' }}>Return to home</a>
        </main>
      );
    }
    return this.props.children;
  }
}

function LandingPage() {
  const [apiStatus, setApiStatus] = useState('Checking API');

  useEffect(() => {
    let active = true;

    fetch('/api/health')
      .then((response) => {
        if (!response.ok) throw new Error('API unavailable');
        return response.json();
      })
      .then((health) => {
        if (active) setApiStatus(`API ${health.status}`);
      })
      .catch(() => {
        if (active) setApiStatus('API unavailable');
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="shell">
      <div className="announcement-bar">
        <span><ShieldCheck size={14} /> A calmer way to share every document</span>
        <span className="announcement-detail">One link. Always current.</span>
      </div>
      <header className="topbar">
        <Link className="brand" to="/" aria-label="SmartQR home">
          <span className="brand-mark"><QrCode size={21} strokeWidth={2.2} /></span>
          <span>smartqr<span className="brand-period">.</span></span>
        </Link>
        <div className="topbar-right">
          <span className="status"><span className="status-dot" />{apiStatus}</span>
          <Link className="login-link" to="/login">Sign in <ArrowUpRight size={15} /></Link>
          <Link className="header-cta" to="/register">Get started <ArrowUpRight size={15} /></Link>
        </div>
      </header>

      <section className="intro" aria-labelledby="page-title">
        <div className="intro-copy">
          <p className="eyebrow"><span /> DOCUMENTS, IN MOTION</p>
          <h1 id="page-title">One code.<br /><span>Every update.</span></h1>
          <p className="lede">Keep every document easy to reach. Change what a QR code opens, without changing the code itself.</p>
          <Link className="primary-link" to="/register">Create your workspace <ArrowUpRight size={17} /></Link>
          <div className="trust-note"><ShieldCheck size={16} /> Private by design, ready when you are</div>
        </div>

        <div className="preview" aria-label="Dynamic document QR preview">
          <div className="preview-topline"><span>LIVE DESTINATION</span><span className="live-dot">● LIVE</span></div>
          <div className="document-row">
            <span className="document-icon"><FileText size={20} /></span>
            <span className="document-name"><strong>Student handbook</strong><small>PDF · Updated just now</small></span>
            <span className="version">2026</span>
          </div>
          <div className="qr-stage">
            <div className="qr-art" aria-hidden="true">
              <i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i />
              <span className="qr-center"><QrCode size={24} /></span>
            </div>
            <span className="scan-label">SCAN TO OPEN</span>
          </div>
          <div className="destination"><span className="destination-pulse" /><span>smartqr.app/r/<b>STU-26</b></span><span className="destination-state">REDIRECT ACTIVE</span></div>
          <div className="preview-foot"><span>QR ID <b>STU-26</b></span><span>Destination can change <span className="arrow">↗</span></span></div>
        </div>
      </section>

      <section className="workflow-strip" id="how-it-works" aria-label="How SmartQR works">
        <div className="workflow-heading"><p className="eyebrow"><span /> A SIMPLE WORKFLOW</p><h2>Ready in three steps.</h2></div>
        <article className="workflow-step"><span className="workflow-number">01</span><div><strong>Add your document</strong><p>Keep PDFs together in a private library.</p></div></article>
        <article className="workflow-step"><span className="workflow-number">02</span><div><strong>Choose access</strong><p>Set the right viewing and sharing rules.</p></div></article>
        <article className="workflow-step"><span className="workflow-number">03</span><div><strong>Share one code</strong><p>Update its destination without reprinting.</p></div></article>
      </section>

      <footer className="bottomline"><span>SMART DOCUMENT MANAGEMENT</span><span>MADE TO KEEP YOU MOVING <i /> SMARTQR</span></footer>
    </main>
  );
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="route-loading" role="status">Checking your session…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function PublicAuthRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="route-loading" role="status">Checking your session…</div>;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<PublicAuthRoute><LoginPage /></PublicAuthRoute>} />
        <Route path="/register" element={<PublicAuthRoute><RegisterPage /></PublicAuthRoute>} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/documents" element={<ProtectedRoute><DocumentsPage /></ProtectedRoute>} />
        <Route path="/qr-codes" element={<ProtectedRoute><QrCodesPage /></ProtectedRoute>} />
        <Route path="/view/:uniqueCode" element={<Suspense fallback={<div className="route-loading">Loading viewer…</div>}><DocumentViewerPage /></Suspense>} />
        <Route path="/view/slug/:slug" element={<Suspense fallback={<div className="route-loading">Loading viewer…</div>}><DocumentViewerPage /></Suspense>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}