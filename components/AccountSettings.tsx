'use client';
import { useState, type FormEvent } from 'react';
import { Cloud, LockKeyhole, LogOut, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { useAccount } from './AccountProvider';
import { flushAccountStorage } from '@/lib/account-storage';
import styles from './AccountSettings.module.css';
export default function AccountSettings() {
  const { account, changed } = useAccount();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState(account?.name || '');
  const [password, setPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  async function act(action: string, event?: FormEvent) {
    event?.preventDefault();
    if (busy) return;
    setError('');
    setMessage('');
    if ((action === 'register' || action === 'password') && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await flushAccountStorage();
      const response = await fetch('/api/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, email, name, password, currentPassword }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Please try again.');
      setPassword('');
      setCurrentPassword('');
      setConfirmPassword('');
      if (action === 'profile') setMessage('Profile updated.');
      await changed(data.account);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the account service.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className={styles.page}>
      <div className={styles.eyebrow}>
        <UserRound size={17} /> YOUR ACCOUNT
      </div>
      <h1>{account ? 'A space of your own.' : 'Make yourself at home.'}</h1>
      <p className={styles.intro}>
        {account
          ? 'Manage your profile, password and sign-ins.'
          : 'Keep your interests, saved stories and settings together, wherever you sign in.'}
      </p>
      <div className={styles.layout}>
        <section
          className={styles.card}
          aria-label={account ? 'Manage account' : 'Sign in or create account'}
        >
          {!account ? (
            <>
              <div className={styles.tabs} role="tablist" aria-label="Account access">
                <button
                  role="tab"
                  aria-selected={mode === 'login'}
                  onClick={() => {
                    setMode('login');
                    setError('');
                    setPassword('');
                    setConfirmPassword('');
                  }}
                >
                  Sign in
                </button>
                <button
                  role="tab"
                  aria-selected={mode === 'register'}
                  onClick={() => {
                    setMode('register');
                    setError('');
                    setPassword('');
                    setConfirmPassword('');
                  }}
                >
                  Create account
                </button>
              </div>
              <form onSubmit={(e) => void act(mode, e)}>
                {mode === 'register' && (
                  <label>
                    Your name
                    <input
                      autoComplete="name"
                      maxLength={80}
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                )}
                <label>
                  Email address
                  <input
                    type="email"
                    autoComplete="email"
                    maxLength={254}
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                    minLength={mode === 'register' ? 15 : 1}
                    maxLength={128}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                {mode === 'register' && (
                  <>
                    <p className={styles.hint}>
                      Use at least 15 characters. A memorable passphrase works well.
                    </p>
                    <label>
                      Confirm password
                      <input
                        type="password"
                        autoComplete="new-password"
                        required
                        maxLength={128}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                    </label>
                  </>
                )}
                <button className={styles.primary} disabled={busy}>
                  {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
                </button>
              </form>
              <p className={styles.hint}>
                New accounts start with an empty workspace. Guest data stays separate.
              </p>
            </>
          ) : (
            <>
              <div className={styles.identity}>
                <span>{account.name.slice(0, 1).toUpperCase()}</span>
                <div>
                  <strong>{account.name}</strong>
                  <p>
                    <Mail size={14} /> {account.email}
                  </p>
                </div>
              </div>
              <form onSubmit={(e) => void act('profile', e)}>
                <label>
                  Display name
                  <input
                    autoComplete="name"
                    required
                    maxLength={80}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <button disabled={busy}>Save profile</button>
              </form>
              <div className={styles.divider} />
              <h2>Password & security</h2>
              <form onSubmit={(e) => void act('password', e)}>
                <label>
                  Current password
                  <input
                    type="password"
                    autoComplete="current-password"
                    required
                    maxLength={128}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </label>
                <label>
                  New password
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={15}
                    maxLength={128}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <label>
                  Confirm new password
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    maxLength={128}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </label>
                <p className={styles.hint}>Changing your password signs you out on every device.</p>
                <button disabled={busy}>Change password</button>
              </form>
              <div className={styles.actions}>
                <button disabled={busy} onClick={() => void act('logout')}>
                  <LogOut size={16} /> Sign out / switch account
                </button>
                <button disabled={busy || !currentPassword} onClick={() => void act('logout-all')}>
                  Sign out all devices
                </button>
              </div>
              <p className={styles.hint}>
                Enter your current password above to sign out all devices or delete your account.
              </p>
              {!confirmDelete ? (
                <button className={styles.danger} onClick={() => setConfirmDelete(true)}>
                  Delete account…
                </button>
              ) : (
                <div className={styles.deleteBox}>
                  <p>
                    Permanently delete this account, its saved content and API settings? This cannot
                    be undone.
                  </p>
                  <button
                    className={styles.danger}
                    disabled={busy || !currentPassword}
                    onClick={() => void act('delete')}
                  >
                    Permanently delete my account
                  </button>
                  <button onClick={() => setConfirmDelete(false)}>Cancel</button>
                </div>
              )}
            </>
          )}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          {message && <p role="status">{message}</p>}
        </section>
        <aside className={styles.aside}>
          <div className={styles.emblem}>
            <ShieldCheck size={34} strokeWidth={1.4} />
          </div>
          <h2>
            Your interests.
            <br />
            Your own space.
          </h2>
          <p>
            <Cloud size={20} /> Saved to your account across devices.
          </p>
          <p>
            <UserRound size={20} /> Separate libraries, preferences and API settings.
          </p>
          <p>
            <LockKeyhole size={20} /> Passwords are hashed. API keys are encrypted.
          </p>
          <small>
            Email is used as your sign-in name. Email verification and email-based password recovery
            are not enabled yet. Keep your password in a password manager.
          </small>
        </aside>
      </div>
    </main>
  );
}
