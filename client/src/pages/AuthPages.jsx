import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ArrowUpRight, QrCode } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { useAuth } from '../context/AuthContext.jsx';
import api, { getApiError } from '../services/api.js';

const signInSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Enter at least 2 characters.').max(80),
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(12, 'Use at least 12 characters.').max(128),
});

const emailSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
});

const resetSchema = z.object({
  password: z.string().min(12, 'Use at least 12 characters.').max(128),
});

function AuthFrame({ eyebrow, title, description, footer, children }) {
  return (
    <main className="auth-shell">
      <header className="auth-topbar">
        <Link className="brand" to="/" aria-label="SmartQR home">
          <span className="brand-mark"><QrCode size={21} strokeWidth={2.2} /></span>
          <span>smartqr<span className="brand-period">.</span></span>
        </Link>
        <Link className="auth-back" to="/"><ArrowLeft size={15} /> Home</Link>
      </header>
      <section className="auth-content">
        <p className="eyebrow"><span /> {eyebrow}</p>
        <h1 className="auth-title">{title}</h1>
        <p className="auth-description">{description}</p>
        {children}
        <div className="auth-footer">{footer}</div>
      </section>
      <footer className="auth-bottomline"><span>SMART DOCUMENT MANAGEMENT</span><span>SECURE ACCESS <i /></span></footer>
    </main>
  );
}

function FormField({ label, type = 'text', autoComplete, registration, error }) {
  return (
    <label className="form-field">
      <span>{label}</span>
      <input type={type} autoComplete={autoComplete} {...registration} aria-invalid={Boolean(error)} />
      {error && <small className="field-error">{error.message}</small>}
    </label>
  );
}

function AuthError({ children }) {
  if (!children) return null;
  return <div className="form-error" role="alert">{children}</div>;
}

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [requestError, setRequestError] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  async function submit(credentials) {
    setRequestError('');
    try {
      await login(credentials);
      navigate('/dashboard', { replace: true });
    } catch (error) {
      setRequestError(getApiError(error, 'Could not sign in.'));
    }
  }

  return (
    <AuthFrame
      eyebrow="WELCOME BACK"
      title="Sign in."
      description="Access your SmartQR workspace."
      footer={<>New to SmartQR? <Link to="/register">Create an account <ArrowUpRight size={14} /></Link></>}
    >
      <form className="auth-form" onSubmit={handleSubmit(submit)} noValidate>
        <AuthError>{requestError}</AuthError>
        <FormField label="Email address" type="email" autoComplete="email" registration={register('email')} error={errors.email} />
        <FormField label="Password" type="password" autoComplete="current-password" registration={register('password')} error={errors.password} />
        <div className="form-options"><Link to="/forgot-password">Forgot password?</Link></div>
        <button className="form-submit" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'} <ArrowUpRight size={16} />
        </button>
      </form>
    </AuthFrame>
  );
}

export function RegisterPage() {
  const navigate = useNavigate();
  const { register: createAccount } = useAuth();
  const [requestError, setRequestError] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  async function submit(details) {
    setRequestError('');
    try {
      await createAccount(details);
      navigate('/dashboard', { replace: true });
    } catch (error) {
      setRequestError(getApiError(error, 'Could not create your account.'));
    }
  }

  return (
    <AuthFrame
      eyebrow="START YOUR WORKSPACE"
      title="Create an account."
      description="Your account starts with a private workspace."
      footer={<>Already registered? <Link to="/login">Sign in <ArrowUpRight size={14} /></Link></>}
    >
      <form className="auth-form" onSubmit={handleSubmit(submit)} noValidate>
        <AuthError>{requestError}</AuthError>
        <FormField label="Full name" autoComplete="name" registration={register('name')} error={errors.name} />
        <FormField label="Email address" type="email" autoComplete="email" registration={register('email')} error={errors.email} />
        <FormField label="Password" type="password" autoComplete="new-password" registration={register('password')} error={errors.password} />
        <p className="password-hint">Use 12 or more characters.</p>
        <button className="form-submit" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating account…' : 'Create account'} <ArrowUpRight size={16} />
        </button>
      </form>
    </AuthFrame>
  );
}

export function ForgotPasswordPage() {
  const [requestError, setRequestError] = useState('');
  const [message, setMessage] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: '' },
  });

  async function submit(details) {
    setRequestError('');
    setMessage('');
    try {
      const { data } = await api.post('/auth/forgot-password', details);
      setMessage(data.message);
    } catch (error) {
      setRequestError(getApiError(error, 'Could not request a reset link.'));
    }
  }

  return (
    <AuthFrame
      eyebrow="ACCOUNT RECOVERY"
      title="Reset your password."
      description="Enter your account email and we’ll send a time-limited reset link."
      footer={<Link to="/login"><ArrowLeft size={14} /> Back to sign in</Link>}
    >
      <form className="auth-form" onSubmit={handleSubmit(submit)} noValidate>
        <AuthError>{requestError}</AuthError>
        {message && <div className="form-success" role="status">{message}</div>}
        <FormField label="Email address" type="email" autoComplete="email" registration={register('email')} error={errors.email} />
        <button className="form-submit" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Sending…' : 'Send reset link'} <ArrowUpRight size={16} />
        </button>
      </form>
    </AuthFrame>
  );
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const [requestError, setRequestError] = useState('');
  const [message, setMessage] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: '' },
  });

  async function submit(details) {
    setRequestError('');
    try {
      const { data } = await api.post('/auth/reset-password', {
        token: searchParams.get('token') || '',
        password: details.password,
      });
      setMessage(data.message);
    } catch (error) {
      setRequestError(getApiError(error, 'Could not reset your password.'));
    }
  }

  return (
    <AuthFrame
      eyebrow="ACCOUNT RECOVERY"
      title="Choose a new password."
      description="Reset links expire after 30 minutes."
      footer={message ? <Link to="/login">Continue to sign in <ArrowUpRight size={14} /></Link> : <Link to="/login"><ArrowLeft size={14} /> Back to sign in</Link>}
    >
      <form className="auth-form" onSubmit={handleSubmit(submit)} noValidate>
        <AuthError>{requestError}</AuthError>
        {message && <div className="form-success" role="status">{message}</div>}
        <FormField label="New password" type="password" autoComplete="new-password" registration={register('password')} error={errors.password} />
        <p className="password-hint">Use 12 or more characters.</p>
        <button className="form-submit" type="submit" disabled={isSubmitting || Boolean(message)}>
          {isSubmitting ? 'Updating…' : 'Update password'} <ArrowUpRight size={16} />
        </button>
      </form>
    </AuthFrame>
  );
}