import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import content from '../content.json';

const { auth: A } = content;

function AuthScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        if (!displayName.trim()) {
          setError(A.errors.nameRequired);
          setSubmitting(false);
          return;
        }
        await register(email, password, displayName.trim());
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function switchMode() {
    setMode(mode === 'login' ? 'register' : 'login');
    setError('');
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-card__header">
          <h1 className="auth-card__title">{A.title}</h1>
          <p className="auth-card__tagline">{A.tagline}</p>
        </div>

        <form className="auth-card__form" onSubmit={handleSubmit}>
          {mode === 'register' && (
            <label className="auth-card__field">
              <span className="auth-card__label">{A.nameLabel}</span>
              <input
                className="auth-card__input"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={A.namePlaceholder}
                autoComplete="name"
              />
            </label>
          )}

          <label className="auth-card__field">
            <span className="auth-card__label">{A.emailLabel}</span>
            <input
              className="auth-card__input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={A.emailPlaceholder}
              autoComplete="email"
              required
            />
          </label>

          <label className="auth-card__field">
            <span className="auth-card__label">{A.passwordLabel}</span>
            <input
              className="auth-card__input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={A.passwordPlaceholder}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={6}
            />
          </label>

          {error && <p className="auth-card__error">{error}</p>}

          <button
            className="auth-card__submit"
            type="submit"
            disabled={submitting}
          >
            {submitting
              ? A.submittingLabel
              : mode === 'login'
                ? A.loginLabel
                : A.registerLabel}
          </button>
        </form>

        <p className="auth-card__switch">
          {mode === 'login' ? A.noAccount : A.hasAccount}{' '}
          <button className="auth-card__switch-btn" onClick={switchMode} type="button">
            {mode === 'login' ? A.switchToRegister : A.switchToLogin}
          </button>
        </p>
      </div>
    </div>
  );
}

export default AuthScreen;
