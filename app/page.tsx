'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Check,
  CheckCheck,
  ChevronDown,
  Code2,
  Compass,
  Cpu,
  Globe2,
  Layers3,
  Plus,
  Radio,
  ShieldCheck,
  Sprout,
  X,
} from 'lucide-react';
import ResourceLibrary from '@/components/ResourceLibrary';
import WorkspaceSidebar, { type WorkspacePage } from '@/components/WorkspaceSidebar';
import MobileNavigation from '@/components/MobileNavigation';
import ApiSettings from '@/components/ApiSettings';
import AccountProvider from '@/components/AccountProvider';
import AccountSettings from '@/components/AccountSettings';
import { accountStorage } from '@/lib/account-storage';
import WorkspaceSettings from '@/components/WorkspaceSettings';
import ShortVideoFeed from '@/components/ShortVideoFeed';
import FeederWorkspace from '@/components/FeederWorkspace';
import { InterestIntroTarget } from '@/components/InterestIntro';
import { defaultPreferences, domains, type CustomTag, type Preferences } from '@/lib/feed';
import { visibleInterfaceLocale } from '@/lib/locale';
import { normalizeBehaviorWeights, type BehaviorSignal } from '@/lib/strategy';
import {
  readResourceCollections,
  readResourceRecords,
  resourceFromHarvest,
  resourceUrlKey,
  type ResourceCollection,
  type ResourceRecord,
} from '@/lib/resources';
import type { HarvestItem } from '@/lib/crawler/types';
import { matchedHarvestTagIds, readFeederEvents, readTagJev, type FeederEvent } from '@/lib/feeder';

type Page = WorkspacePage;
const isWorkspacePage = (value: string): value is Page =>
  ['discover', 'shorts', 'settings', 'library', 'saved', 'api', 'account'].includes(value);
const readWorkspacePage = (value: string): Page =>
  value === 'garden' ? 'settings' : isWorkspacePage(value) ? value : 'discover';
const STORAGE = 'feed-gardener-demo-v1';
const RESOURCES_STORAGE = 'feed-gardener-resources-v1';
const COLLECTIONS_STORAGE = 'feed-gardener-collections-v1';
const EVENTS_STORAGE = 'feed-gardener-events-v1';
const GUIDE_STORAGE = 'feed-gardener:setup-guide:v2';
const knownSources = [
  'YouTube',
  'Bilibili',
  'TikTok',
  'Instagram',
  'X',
  'arXiv',
  'GitHub',
  'Hacker News',
];
const visibleSources = knownSources.filter(
  (source) => !['TikTok', 'Instagram', 'X'].includes(source),
);
const allTags = domains.flatMap((domain) => domain.tags);
const customTagName = (tag: CustomTag, readingLanguage: Preferences['readingLanguage']) => {
  if (readingLanguage === 'en') return tag.labelEn;
  if (readingLanguage === 'zh')
    return tag.translationStatus === 'translated' ? tag.labelZh : `${tag.labelEn}（原文）`;
  return tag.translationStatus === 'translated' && tag.labelZh !== tag.labelEn
    ? `${tag.labelZh} / ${tag.labelEn}`
    : tag.labelEn;
};

function englishDefaultPreferences(): Preferences {
  return {
    ...structuredClone(defaultPreferences),
    domains: [],
    tags: [],
    customTags: [],
    relatedDomains: [],
    readingLanguage: 'en',
  };
}

function readStoredSlice(key: string, fallback: unknown): unknown {
  try {
    const value = accountStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

function readPreferences(value: unknown): Preferences {
  if (!value || typeof value !== 'object') return englishDefaultPreferences();
  const raw = value as Record<string, unknown>;
  const strings = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  const domainIds = domains.map((d) => d.id);
  const customTags = Array.isArray(raw.customTags)
    ? raw.customTags
        .filter((value): value is Record<string, unknown> =>
          Boolean(value && typeof value === 'object'),
        )
        .filter(
          (value) =>
            typeof value.id === 'string' &&
            ((value.source === 'manual' && value.id.startsWith('manual:')) ||
              (value.id.startsWith('live:github:') &&
                typeof value.evidenceUrl === 'string' &&
                value.evidenceUrl.startsWith('https://github.com/'))) &&
            typeof value.label === 'string' &&
            value.label.trim().length > 0,
        )
        .slice(0, 12)
        .map((value): CustomTag => ({
          id: String(value.id),
          label: String(value.label).slice(0, 80),
          labelZh:
            typeof value.labelZh === 'string'
              ? value.labelZh.slice(0, 80)
              : String(value.label).slice(0, 80),
          labelEn:
            typeof value.labelEn === 'string'
              ? value.labelEn.slice(0, 80)
              : String(value.label).slice(0, 80),
          translationStatus:
            value.translationStatus === 'translated' ? 'translated' : 'source_label',
          source: value.source === 'manual' ? 'manual' : 'github_live',
          evidenceUrl: value.source === 'manual' ? '' : String(value.evidenceUrl),
        }))
    : [];
  return {
    domains: strings(raw.domains).filter((id) => domainIds.includes(id)),
    tags: strings(raw.tags).filter((id) =>
      domains.some((d) => strings(raw.domains).includes(d.id) && d.tags.some((t) => t.id === id)),
    ),
    tagJev: readTagJev(raw.tagJev),
    targetJevAverage:
      typeof raw.targetJevAverage === 'number' &&
      Number.isInteger(raw.targetJevAverage) &&
      raw.targetJevAverage >= 1 &&
      raw.targetJevAverage <= 10
        ? raw.targetJevAverage
        : 8,
    customTags,
    shortsNearbyTopics: raw.shortsNearbyTopics !== false,
    onlySelectedTags: raw.onlySelectedTags === true,
    requireAllSelectedTags: raw.requireAllSelectedTags === true,
    excludeUnselectedTags: raw.excludeUnselectedTags === true,
    relatedDomains: strings(raw.relatedDomains).filter((id) => domainIds.includes(id)),
    exploration:
      typeof raw.exploration === 'number' && Number.isFinite(raw.exploration)
        ? Math.min(50, Math.max(0, raw.exploration))
        : 20,
    behaviorWeights: normalizeBehaviorWeights(
      raw.behaviorWeights && typeof raw.behaviorWeights === 'object'
        ? (raw.behaviorWeights as Partial<Record<BehaviorSignal, number>>)
        : undefined,
    ),
    strategyMode: raw.strategyMode === 'expert' ? 'expert' : 'simple',
    readingLanguage: 'en',
    blockedSources: strings(raw.blockedSources).filter((source) => knownSources.includes(source)),
    blockedTags: strings(raw.blockedTags).filter((id) => allTags.some((t) => t.id === id)),
    version:
      typeof raw.version === 'number' && Number.isFinite(raw.version)
        ? Math.max(1, Math.floor(raw.version))
        : 1,
  };
}

function Modal({
  children,
  title,
  closeLabel,
  onClose,
  wide = false,
}: {
  children: React.ReactNode;
  title: string;
  closeLabel: string;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog?.showModal();
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      className={`modal ${wide ? 'modal-wide' : ''}`}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === ref.current) {
          const rect = ref.current.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label={closeLabel}>
          <X size={21} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export default function Home() { return <AccountProvider><Workspace /></AccountProvider>; }

function Workspace() {
  const locale = visibleInterfaceLocale;
  const [customTagInput, setCustomTagInput] = useState('');
  const [customTagError, setCustomTagError] = useState('');
  const [domainsExpanded, setDomainsExpanded] = useState(false);
  const [customTagOpen, setCustomTagOpen] = useState(false);
  const [page, setPage] = useState<Page>('discover');
  const [preferences, setPreferences] = useState<Preferences>(englishDefaultPreferences);
  const [resources, setResources] = useState<ResourceRecord[]>([]);
  const [collections, setCollections] = useState<ResourceCollection[]>([]);
  const [feederEvents, setFeederEvents] = useState<FeederEvent[]>([]);
  const [draft, setDraft] = useState<Preferences | null>(null);
  const [toast, setToast] = useState('');
  const [ready, setReady] = useState(false);
  const [splitStorageReady, setSplitStorageReady] = useState(false);
  const scrollPositions = useRef<Partial<Record<Page, number>>>({});
  const [offline, setOffline] = useState(false);
  const [guideStep, setGuideStep] = useState(0);
  const [skipGuideConfirm, setSkipGuideConfirm] = useState(false);
  const t = (zh: string, en: string) => (locale === 'zh' ? zh : en);

  useEffect(() => {
    try {
      const savedGuideStep = Number(accountStorage.getItem(GUIDE_STORAGE));
      if (Number.isInteger(savedGuideStep) && savedGuideStep >= 0 && savedGuideStep <= 6) {
        setGuideStep(savedGuideStep);
      }
      const stored = readStoredSlice(STORAGE, null) as Record<string, unknown> | null;
      if (stored && typeof stored === 'object') {
        const savedPreferences = readPreferences(stored.preferences);
        if (stored.onboardingCompleted === false) {
          const pendingTags = Array.isArray(stored.onboardingWantedTags)
            ? stored.onboardingWantedTags.filter(
                (id): id is string =>
                  typeof id === 'string' && allTags.some((tag) => tag.id === id),
              )
            : [];
          const pendingCustom = readPreferences({
            customTags: stored.onboardingCustomTags,
          }).customTags;
          if (pendingTags.length || pendingCustom.length) {
            savedPreferences.tags = [...new Set([...savedPreferences.tags, ...pendingTags])];
            savedPreferences.domains = [
              ...new Set([
                ...savedPreferences.domains,
                ...domains
                  .filter((domain) => domain.tags.some((tag) => pendingTags.includes(tag.id)))
                  .map((domain) => domain.id),
              ]),
            ];
            savedPreferences.customTags = [
              ...savedPreferences.customTags,
              ...pendingCustom.filter(
                (tag) => !savedPreferences.customTags.some((saved) => saved.id === tag.id),
              ),
            ].slice(0, 12);
          }
        }
        setPreferences(savedPreferences);
        if (typeof stored.page === 'string') {
          setPage(readWorkspacePage(stored.page));
        }
      }
      const legacy = stored && typeof stored === 'object' ? stored : {};
      const resourceSlice = readStoredSlice(RESOURCES_STORAGE, legacy.resources);
      const collectionSlice = readStoredSlice(COLLECTIONS_STORAGE, legacy.collections);
      const eventSlice = readStoredSlice(EVENTS_STORAGE, legacy.feederEvents);
      const savedCollections = readResourceCollections(collectionSlice);
      const savedResources = readResourceRecords(
        Array.isArray(resourceSlice) ? resourceSlice : legacy.resources,
      ).map((resource) => ({
        ...resource,
        collectionId: savedCollections.some((collection) => collection.id === resource.collectionId)
          ? resource.collectionId
          : null,
      }));
      const savedEvents = readFeederEvents(
        Array.isArray(eventSlice) ? eventSlice : legacy.feederEvents,
      );
      setResources(savedResources);
      setCollections(savedCollections);
      setFeederEvents(savedEvents);
      try {
        accountStorage.setItem(RESOURCES_STORAGE, JSON.stringify(savedResources));
        accountStorage.setItem(COLLECTIONS_STORAGE, JSON.stringify(savedCollections));
        accountStorage.setItem(EVENTS_STORAGE, JSON.stringify(savedEvents));
        setSplitStorageReady(true);
      } catch {
        setToast(
          'Storage is full. Existing saved data is intact, but new changes stay in this session.',
        );
      }
    } catch {
      setToast('Local data could not be loaded. Sample preferences are ready instead.');
    }
    const returnUrl = new URL(window.location.href);
    const requestedPage = returnUrl.hash.slice(1);
    if (requestedPage) setPage(readWorkspacePage(requestedPage));
    setReady(true);
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const url = new URL(window.location.href);
    url.hash = page;
    window.history.replaceState(window.history.state, '', url);
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    const frame = requestAnimationFrame(() =>
      window.scrollTo({ top: scrollPositions.current[page] ?? 0, behavior: 'instant' }),
    );
    const onHistoryChange = () => {
      const next = window.location.hash.slice(1);
      scrollPositions.current[page] = window.scrollY;
      setPage(readWorkspacePage(next));
    };
    window.addEventListener('popstate', onHistoryChange);
    window.addEventListener('hashchange', onHistoryChange);
    return () => {
      cancelAnimationFrame(frame);
      window.history.scrollRestoration = previousRestoration;
      window.removeEventListener('popstate', onHistoryChange);
      window.removeEventListener('hashchange', onHistoryChange);
    };
  }, [page, ready]);
  useEffect(() => {
    if (ready && splitStorageReady) {
      try {
        accountStorage.setItem(
          STORAGE,
          JSON.stringify({
            preferences,
            localePreference: visibleInterfaceLocale,
            onboardingCompleted: true,
            page,
          }),
        );
      } catch {
        setToast(
          t(
            '浏览器存储不可用，本次更改只保留在当前页面。',
            'Storage unavailable. Changes are kept only for this session.',
          ),
        );
      }
    }
  }, [preferences, page, ready, splitStorageReady]);
  useEffect(() => {
    if (!ready) return;
    try {
      accountStorage.setItem(GUIDE_STORAGE, String(guideStep));
    } catch {
      // The current session still keeps the guide state.
    }
  }, [guideStep, ready]);
  useEffect(() => {
    if (!ready || !splitStorageReady) return;
    try {
      accountStorage.setItem(RESOURCES_STORAGE, JSON.stringify(resources));
    } catch {
      setToast('Saved items could not be stored in this browser.');
    }
  }, [resources, ready, splitStorageReady]);
  useEffect(() => {
    if (!ready || !splitStorageReady) return;
    try {
      accountStorage.setItem(COLLECTIONS_STORAGE, JSON.stringify(collections));
    } catch {
      setToast('Collections could not be stored in this browser.');
    }
  }, [collections, ready, splitStorageReady]);
  useEffect(() => {
    if (!ready || !splitStorageReady) return;
    try {
      accountStorage.setItem(EVENTS_STORAGE, JSON.stringify(feederEvents));
    } catch {
      setToast('Feedback could not be stored in this browser.');
    }
  }, [feederEvents, ready, splitStorageReady]);
  useEffect(() => {
    document.documentElement.lang = visibleInterfaceLocale;
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 4200);
    return () => clearTimeout(timer);
  }, [toast]);

  const changeOnlySelectedTags = (value: boolean) =>
    setPreferences((current) => ({
      ...current,
      onlySelectedTags: value,
      version: current.version + 1,
    }));
  const changeInterestRule = (
    rule: 'requireAllSelectedTags' | 'excludeUnselectedTags',
    value: boolean,
  ) =>
    setPreferences((current) => ({
      ...current,
      [rule]: value,
      version: current.version + 1,
    }));
  const saveResource = (item: HarvestItem) => {
    if (
      resources.some(
        (resource) =>
          resource.id === item.id || resourceUrlKey(resource.url) === resourceUrlKey(item.url),
      )
    ) {
      setToast(t('这条资源已经在知识库中', 'This resource is already in your library'));
      return;
    }
    setResources((previous) => [resourceFromHarvest(item), ...previous]);
    setToast(t('已收藏到资源库', 'Saved to the resource library'));
  };
  const navigate = (next: Page) => {
    if (next === page) {
      window.scrollTo({ top: 0, behavior: 'instant' });
      return;
    }
    scrollPositions.current[page] = window.scrollY;
    const url = new URL(window.location.href);
    url.hash = next;
    window.history.pushState(window.history.state, '', url);
    setPage(next);
  };
  const editPreferences = () => {
    setCustomTagInput('');
    setCustomTagError('');
    setDomainsExpanded(false);
    setCustomTagOpen(false);
    setDraft(structuredClone(preferences));
  };
  const manageInterests = () => {
    navigate('discover');
    editPreferences();
  };
  const advanceGuide = (step: number) =>
    setGuideStep((current) => (current === step ? current + 1 : current));
  const closeInterestEditor = () => {
    setDraft(null);
    setGuideStep((current) => (current === 2 || current === 3 ? 1 : current));
  };
  if (!ready) {
    return (
      <div className="boot-screen" aria-label="Feed Gardener">
        <span className="brand-mark">
          <Sprout size={27} strokeWidth={1.6} />
        </span>
        <span className="boot-brand">
          feed<span className="brand-serif">gardener</span>
        </span>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <WorkspaceSidebar page={page} t={t} onNavigate={navigate} />
      <MobileNavigation page={page} onNavigate={navigate} />
      <div className={`main-shell ${page === 'shorts' ? 'shorts-shell' : ''}`}>
        {offline && (
          <div className="offline-banner">
            <Radio size={16} />
            {t(
              '当前离线。已保存内容仍可浏览，更改保存在本机。',
              'You are offline. Keep this tab open until your account finishes syncing.',
            )}
          </div>
        )}
        {page === 'account' ? (
          <AccountSettings />
        ) : page === 'api' ? (
          <ApiSettings />
        ) : page === 'settings' ? (
          <WorkspaceSettings
            nearbyTopicsEnabled={preferences.shortsNearbyTopics !== false}
            onNearbyTopicsChange={(enabled) =>
              setPreferences((current) => ({
                ...current,
                shortsNearbyTopics: enabled,
                version: current.version + 1,
              }))
            }
          />
        ) : page === 'shorts' ? (
          <ShortVideoFeed
            preferences={preferences}
            onEditInterests={manageInterests}
            onSave={saveResource}
            savedUrls={resources.map((resource) => resource.url)}
          />
        ) : page === 'discover' ? (
          <main className="discover-page workspace-content" data-page={page}>
            <FeederWorkspace
              page={page}
              locale={locale}
              preferences={preferences}
              resources={resources}
              events={feederEvents}
              onSaveResource={saveResource}
              onRecordEvent={(event) =>
                setFeederEvents((current) => [...current, event].slice(-500))
              }
              onUndoEvent={(id) =>
                setFeederEvents((current) => current.filter((event) => event.id !== id))
              }
              onTargetJevAverageChange={(value) =>
                setPreferences((current) => ({
                  ...current,
                  targetJevAverage: value,
                  version: current.version + 1,
                }))
              }
              onOnlySelectedTagsChange={changeOnlySelectedTags}
              onInterestRuleChange={changeInterestRule}
              onEditInterests={manageInterests}
              guideStep={guideStep}
              onGuideAdvance={advanceGuide}
            />
          </main>
        ) : page === 'library' || page === 'saved' ? (
          <ResourceLibrary
            mode={page === 'saved' ? 'saved' : 'library'}
            locale={locale}
            resources={resources}
            collections={collections}
            t={t}
            onCreateCollection={(collection) =>
              setCollections((previous) => [...previous, collection])
            }
            onRenameCollection={(id, name) =>
              setCollections((previous) =>
                previous.map((collection) =>
                  collection.id === id ? { ...collection, name } : collection,
                ),
              )
            }
            onDeleteCollection={(id) => {
              setCollections((previous) => previous.filter((collection) => collection.id !== id));
              setResources((previous) =>
                previous.map((resource) =>
                  resource.collectionId === id ? { ...resource, collectionId: null } : resource,
                ),
              );
            }}
            onAdd={(record) => {
              setResources((previous) => [record, ...previous]);
              setToast(t('已收藏到资源库', 'Saved to the resource library'));
            }}
            onUpdate={(id, patch) =>
              setResources((previous) =>
                previous.map((resource) =>
                  resource.id === id ? { ...resource, ...patch } : resource,
                ),
              )
            }
            onRemove={(id) => {
              const resource = resources.find((item) => item.id === id);
              const key = resource && resourceUrlKey(resource.url);
              setResources((previous) => previous.filter((resource) => resource.id !== id));
              if (key) {
                setFeederEvents((previous) =>
                  previous.filter((event) => event.itemKey !== key || event.signal !== 'save'),
                );
              }
              setToast(t('已移出资源库', 'Removed from the resource library'));
            }}
            onOpen={(resource) => {
              const key = resourceUrlKey(resource.url);
              if (!key) return;
              const event: FeederEvent = {
                id: crypto.randomUUID(),
                actor: 'user',
                itemKey: key,
                signal: 'open',
                tagIds: matchedHarvestTagIds({ tags: resource.tags }),
                source: resource.source,
                author: resource.author,
                at: new Date().toISOString(),
              };
              setFeederEvents((previous) => [...previous, event].slice(-500));
            }}
            onDiscover={() => navigate('discover')}
          />
        ) : null}
      </div>
      {draft && (
        <Modal
          wide
          title={t('种下你的兴趣', 'Plant your interests')}
          closeLabel={t('关闭', 'Close')}
          onClose={closeInterestEditor}
        >
          <div className="preferences-body">
            <div className="custom-tag-dock">
              <button
                type="button"
                className="custom-tag-trigger"
                aria-expanded={customTagOpen}
                aria-controls="console-custom-tag-form"
                onClick={() => setCustomTagOpen((open) => !open)}
              >
                <Plus size={17} />
                <span>{t('找不到标签？添加自己的标签', 'Can’t find a tag? Add your own')}</span>
                {draft.customTags.length > 0 && <small>{draft.customTags.length}</small>}
                <ChevronDown size={17} />
              </button>
              {customTagOpen && (
                <div id="console-custom-tag-form">
                  <form
                    className="console-custom-tag-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const label = customTagInput.trim().replace(/\s+/g, ' ');
                      const normalized = label.toLocaleLowerCase();
                      if (!label || label.length > 80) {
                        setCustomTagError('Enter a tag with 1–80 characters.');
                        return;
                      }
                      if (
                        allTags.some(
                          (tag) =>
                            tag.labelEn.toLocaleLowerCase() === normalized ||
                            tag.label.toLocaleLowerCase() === normalized,
                        ) ||
                        draft.customTags.some(
                          (tag) => tag.labelEn.toLocaleLowerCase() === normalized,
                        )
                      ) {
                        setCustomTagError('That tag already exists. Select it above.');
                        return;
                      }
                      if (draft.customTags.length >= 12) {
                        setCustomTagError('You can add up to 12 custom tags.');
                        return;
                      }
                      setDraft({
                        ...draft,
                        customTags: [
                          ...draft.customTags,
                          {
                            id: `manual:${encodeURIComponent(normalized)}`,
                            label,
                            labelEn: label,
                            labelZh: label,
                            translationStatus: 'source_label',
                            source: 'manual',
                            evidenceUrl: '',
                          },
                        ],
                      });
                      setCustomTagInput('');
                      setCustomTagError('');
                    }}
                  >
                    <div>
                      <input
                        id="console-custom-tag"
                        aria-label={t('标签名称', 'Tag name')}
                        value={customTagInput}
                        maxLength={80}
                        onChange={(event) => {
                          setCustomTagInput(event.target.value);
                          setCustomTagError('');
                        }}
                        placeholder="e.g. Indie game design"
                      />
                      <button type="submit" className="secondary-button">
                        <Plus size={15} /> Add tag
                      </button>
                    </div>
                    {customTagError && <p role="alert">{customTagError}</p>}
                  </form>
                  {draft.customTags.length > 0 && (
                    <div className="selected-live-tags">
                      {draft.customTags.map((tag) => (
                        <button
                          key={tag.id}
                          className="chosen"
                          onClick={() =>
                            setDraft({
                              ...draft,
                              customTags: draft.customTags.filter((item) => item.id !== tag.id),
                            })
                          }
                        >
                          <Check size={13} />
                          {customTagName(tag, draft.readingLanguage)}
                          <small>{tag.source === 'manual' ? 'YOUR TAG' : 'LIVE'}</small>
                          <X size={12} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="form-step">
              <span>01</span>
              <h3>{t('选择想深入的领域', 'Choose where to grow')}</h3>
            </div>
            <div className="domain-grid">
              {domains
                .filter(
                  (domain, index) =>
                    domainsExpanded || index < 6 || draft.domains.includes(domain.id),
                )
                .map((domain) => {
                  const selected = draft.domains.includes(domain.id);
                  const guideDomainId =
                    domains.find((item) => !draft.domains.includes(item.id))?.id ?? domains[0].id;
                  const Icon =
                    [Cpu, Layers3, Code2, Globe2, Compass, Radio][domains.indexOf(domain)] ??
                    Compass;
                  return (
                    <InterestIntroTarget
                      key={domain.id}
                      active={guideStep === 2 && domain.id === guideDomainId}
                      step={3}
                      instruction="Click a category you want in your feed. You can choose more before saving."
                      className="guide-domain-target"
                    >
                      <button
                        aria-pressed={selected}
                        className={`domain-option ${selected ? 'chosen' : ''}`}
                        onClick={() => {
                          const nextDomains = selected
                            ? draft.domains.filter((id) => id !== domain.id)
                            : [...draft.domains, domain.id];
                          setDraft({
                            ...draft,
                            domains: nextDomains,
                            tags: selected
                              ? draft.tags.filter((id) => !domain.tags.some((tag) => tag.id === id))
                              : draft.tags,
                            relatedDomains: selected
                              ? draft.relatedDomains
                              : draft.relatedDomains.filter((id) => id !== domain.id),
                          });
                          if (nextDomains.length > 0 || draft.customTags.length > 0) {
                            advanceGuide(2);
                          }
                        }}
                      >
                        <Icon size={19} />
                        <span>{locale === 'zh' ? domain.label : domain.labelEn}</span>
                        {selected ? <Check size={16} /> : <Plus size={15} />}
                      </button>
                    </InterestIntroTarget>
                  );
                })}
            </div>
            <button
              type="button"
              className="domain-expand-button"
              aria-expanded={domainsExpanded}
              onClick={() => setDomainsExpanded((expanded) => !expanded)}
            >
              {domainsExpanded
                ? t('收起其他领域', 'Show fewer categories')
                : t('展开所有领域', 'Expand all categories')}
              <ChevronDown size={16} />
            </button>
            <details className="exclusion-settings">
              <summary>
                <ShieldCheck size={16} />
                {t('不想看的内容与来源', 'Topics and sources to exclude')}
                <span>
                  {draft.blockedTags.length +
                    draft.blockedSources.filter((source) => visibleSources.includes(source)).length}
                </span>
                <ChevronDown size={15} />
              </summary>
              <label>{t('屏蔽整个来源', 'Block a platform')}</label>
              <div className="preference-tags">
                {visibleSources.map((s) => (
                  <button
                    key={s}
                    aria-pressed={draft.blockedSources.includes(s)}
                    className={draft.blockedSources.includes(s) ? 'blocked' : ''}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        blockedSources: draft.blockedSources.includes(s)
                          ? draft.blockedSources.filter((id) => id !== s)
                          : [...draft.blockedSources, s],
                      })
                    }
                  >
                    {draft.blockedSources.includes(s) ? <X size={13} /> : <Plus size={13} />}
                    {s}
                  </button>
                ))}
              </div>
              <label>{t('屏蔽主题（优先于喜欢）', 'Block topics (overrides likes)')}</label>
              <div className="preference-tags">
                {allTags.map((tag) => (
                  <button
                    key={tag.id}
                    aria-pressed={draft.blockedTags.includes(tag.id)}
                    className={draft.blockedTags.includes(tag.id) ? 'blocked' : ''}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        blockedTags: draft.blockedTags.includes(tag.id)
                          ? draft.blockedTags.filter((id) => id !== tag.id)
                          : [...draft.blockedTags, tag.id],
                      })
                    }
                  >
                    {draft.blockedTags.includes(tag.id) ? <X size={12} /> : <Plus size={12} />}
                    {locale === 'zh' ? tag.label : tag.labelEn}
                  </button>
                ))}
              </div>
              {draft.blockedSources
                .filter((s) => !knownSources.includes(s))
                .map((s) => (
                  <button
                    className="unblock-button"
                    key={s}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        blockedSources: draft.blockedSources.filter((id) => id !== s),
                      })
                    }
                  >
                    {s}
                    <X size={13} />
                    {t('解除屏蔽', 'Unblock')}
                  </button>
                ))}
            </details>
          </div>
          <div className="modal-footer">
            <span>{t('保存在当前浏览器', 'Saved in this browser')}</span>
            <InterestIntroTarget
              active={guideStep === 3}
              step={4}
              instruction="Click Save my interests to keep your choices in this browser."
            >
              <button
                className="primary-button"
                disabled={draft.domains.length === 0 && draft.customTags.length === 0}
                onClick={() => {
                  setPreferences({
                    ...draft,
                    behaviorWeights: normalizeBehaviorWeights(draft.behaviorWeights),
                    version: preferences.version + 1,
                  });
                  advanceGuide(3);
                  setDraft(null);
                  setToast(
                    t(
                      '兴趣已更新，新发现正在生长',
                      'Interests updated. New discoveries are taking root.',
                    ),
                  );
                }}
              >
                <Check size={16} />
                {t('保存，让发现开始', 'Save my interests')}
              </button>
            </InterestIntroTarget>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCheck size={18} />
          {toast}
          <button onClick={() => setToast('')} aria-label={t('关闭通知', 'Dismiss notification')}>
            <X size={15} />
          </button>
        </div>
      )}
      {guideStep < 6 && page !== 'account' && (
        <button
          type="button"
          className="guide-skip-button"
          onClick={() => setSkipGuideConfirm(true)}
        >
          Skip instructions
        </button>
      )}
      {skipGuideConfirm && (
        <Modal
          title="Skip setup instructions?"
          closeLabel="Close"
          onClose={() => setSkipGuideConfirm(false)}
        >
          <div className="guide-skip-confirm">
            <p>
              Are you sure you want to skip the instructions? You can open Instructions anytime from
              the navigation help link.
            </p>
            <div>
              <button className="secondary-button" onClick={() => setSkipGuideConfirm(false)}>
                Keep guiding me
              </button>
              <button
                className="primary-button"
                onClick={() => {
                  setGuideStep(6);
                  setSkipGuideConfirm(false);
                }}
              >
                Skip instructions
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
