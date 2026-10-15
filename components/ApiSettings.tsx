'use client';

import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Plus,
  Search,
  Settings2,
  X,
} from 'lucide-react';
import {
  API_PROVIDERS,
  CUSTOM_API_FIELDS,
  type ApiConfigurationSummary,
} from '@/lib/api-providers';
import { readApiData } from '@/lib/api-contract';
import styles from './ApiSettings.module.css';

const marks: Record<string, string> = {
  youtube: 'YT',
  github: 'GH',
  scholar: 'GS',
  typesafe: 'Ts',
  multimodal: 'AI',
  instagram: 'IG',
};

export default function ApiSettings() {
  const [items, setItems] = useState<ApiConfigurationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<ApiConfigurationSummary | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [name, setName] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      setItems(
        await readApiData<ApiConfigurationSummary[]>(
          await fetch('/api/settings/providers', { cache: 'no-store' }),
        ),
      );
    } catch {
      setError('Sign in to manage your personal API settings, then try again.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);

  function edit(item: ApiConfigurationSummary) {
    setEditing(item);
    setDraft(item.values);
    setName(item.name);
    setVisible(false);
    setFormError('');
    setMessage('');
    setConfirmClear(false);
  }

  async function save(remove = false) {
    if (!editing || busy) return;
    setBusy(true);
    setFormError('');
    try {
      const response = await fetch('/api/settings/providers', {
        method: remove ? 'DELETE' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          remove
            ? { id: editing.id }
            : {
                id: editing.id,
                name,
                values: Object.fromEntries(
                  Object.entries(draft).filter(
                    ([field, value]) => field !== 'apiKey' || value.trim(),
                  ),
                ),
              },
        ),
      });
      setItems(await readApiData<ApiConfigurationSummary[]>(response));
      setMessage(
        remove
          ? `${editing.name} configuration removed.`
          : `${name} saved. Credentials have not been verified with the provider.`,
      );
      setEditing(null);
      setDraft({});
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Could not save. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const fields = API_PROVIDERS.find((item) => item.id === editing?.id)?.fields || CUSTOM_API_FIELDS;
  const filtered = items.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()));
  const configured = items.filter((item) => item.configured).length;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>WORKSPACE / CONNECTIONS</span>
          <h1>API</h1>
          <p>Your platforms. One place to connect them.</p>
        </div>
        <button
          className={styles.primary}
          disabled={loading || !!error}
          onClick={() =>
            edit({
              id: `custom:${crypto.randomUUID()}`,
              name: '',
              configured: false,
              source: 'none',
              values: {},
              secrets: [],
              custom: true,
            })
          }
        >
          <Plus size={17} /> Add platform
        </button>
      </header>
      <div className={styles.overview}>
        <span className={styles.overviewIcon}>
          <KeyRound size={23} />
        </span>
        <div>
          <strong>API management</strong>
          <p>Add keys and tokens to power your feed and AI tools.</p>
        </div>
        <span className={styles.count}>
          <b>{configured.toString().padStart(2, '0')}</b> configured{' '}
          <span>/ {items.length} platforms</span>
        </span>
      </div>
      <div className={styles.toolbar}>
        <h2>
          Platforms <span>{items.length}</span>
        </h2>
        <label className={styles.search}>
          <Search size={17} />
          <input
            aria-label="Search platforms"
            placeholder="Search platforms…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      {message && (
        <p className={styles.success} role="status">
          <Check size={16} />
          {message}
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error} <button onClick={() => void load()}>Retry</button>
        </p>
      )}
      {loading ? (
        <p role="status">Loading platforms…</p>
      ) : (
        !error && (
          <div className={styles.grid}>
            {filtered.map((item) => (
              <article className={styles.card} key={item.id}>
                <div className={styles.cardTop}>
                  <span className={styles.mark} data-platform={item.id}>
                    {marks[item.id] || item.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className={styles.status} data-configured={item.configured}>
                    <i />
                    {item.configured ? 'Configured' : 'Not configured'}
                  </span>
                </div>
                <h3>{item.name}</h3>
                <p>
                  {API_PROVIDERS.find((provider) => provider.id === item.id)?.description ||
                    'Custom credentials, stored for your own integrations.'}
                </p>
                <div className={styles.cardBottom}>
                  <span>
                    {item.custom
                      ? 'Storage only'
                      : item.source === 'environment'
                        ? 'From environment'
                        : item.configured
                          ? 'Key securely stored'
                          : 'Ready to set up'}
                  </span>
                  <button onClick={() => edit(item)} aria-label={`Configure ${item.name}`}>
                    {item.configured ? <Settings2 size={15} /> : <Plus size={15} />}
                    {item.configured ? 'Manage' : 'Configure'}
                  </button>
                </div>
              </article>
            ))}
            {!filtered.length && <p>No platforms match “{query}”.</p>}
          </div>
        )
      )}
      <div className={styles.note}>
        <LockKeyhole size={18} />
        <p>
          Keys are encrypted on this server and never saved in your browser. Configured means saved,
          not verified. Custom platforms store credentials; they do not automatically add a feed
          integration.
        </p>
      </div>
      {editing && (
        <div className={styles.backdrop}>
          <section
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="api-dialog-title"
            ref={(element) => {
              if (element && !element.contains(document.activeElement)) element.focus();
            }}
            tabIndex={-1}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !busy) {
                setEditing(null);
                setDraft({});
              }
              if (event.key === 'Tab') {
                const controls = event.currentTarget.querySelectorAll<HTMLElement>(
                  'button:not(:disabled), input:not(:disabled)',
                );
                const first = controls[0];
                const last = controls[controls.length - 1];
                if (
                  event.shiftKey &&
                  (document.activeElement === first ||
                    document.activeElement === event.currentTarget)
                ) {
                  event.preventDefault();
                  last?.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                  event.preventDefault();
                  first?.focus();
                }
              }
            }}
          >
            <div className={styles.dialogHeader}>
              <div>
                <span className={styles.eyebrow}>PLATFORM CONFIGURATION</span>
                <h2 id="api-dialog-title">{editing.name || 'Add a platform'}</h2>
              </div>
              <button
                aria-label="Close configuration"
                disabled={busy}
                onClick={() => {
                  setEditing(null);
                  setDraft({});
                }}
              >
                <X size={20} />
              </button>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              {editing.custom && (
                <label className={styles.field}>
                  Platform name
                  <input
                    autoFocus
                    required
                    maxLength={80}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="e.g. OpenAI, Anthropic, DeepSeek"
                    disabled={busy}
                  />
                </label>
              )}
              {fields.map((field) => (
                <label key={field.id} className={styles.field}>
                  {field.label}
                  {field.required && <span className={styles.required}>Required</span>}
                  <span className={styles.inputWrap}>
                    <input
                      disabled={busy}
                      type={field.secret && !visible ? 'password' : 'text'}
                      autoComplete="off"
                      spellCheck={false}
                      required={
                        field.required && !(field.secret && editing.secrets.includes(field.id))
                      }
                      maxLength={4096}
                      value={draft[field.id] || ''}
                      placeholder={
                        field.secret && editing.secrets.includes(field.id)
                          ? 'Saved •••••••• — leave blank to keep'
                          : field.placeholder || 'Paste your key or token'
                      }
                      onChange={(event) =>
                        setDraft((previous) => ({ ...previous, [field.id]: event.target.value }))
                      }
                    />
                    {field.secret && (
                      <button
                        type="button"
                        aria-label={visible ? 'Hide API key' : 'Show API key'}
                        onClick={() => setVisible(!visible)}
                      >
                        {visible ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    )}
                  </span>
                </label>
              ))}
              <p className={styles.formNote}>
                {editing.custom
                  ? 'This platform is saved for reference. Connecting it to a feature requires an integration.'
                  : 'Saved credentials are used by this workspace’s existing integration.'}
              </p>
              {formError && (
                <p className={styles.error} role="alert">
                  {formError}
                </p>
              )}
              {confirmClear && (
                <p className={styles.error}>
                  Remove these credentials? This also disables any environment configuration for
                  this platform.
                </p>
              )}
              <div className={styles.actions}>
                {editing.source !== 'none' && (
                  <button
                    type="button"
                    className={styles.remove}
                    disabled={busy}
                    onClick={() => (confirmClear ? void save(true) : setConfirmClear(true))}
                  >
                    {confirmClear ? 'Confirm removal' : 'Remove credentials'}
                  </button>
                )}
                <button type="submit" className={styles.primary} disabled={busy}>
                  {busy ? 'Saving…' : 'Save configuration'}
                  <ArrowUpRight size={16} />
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
