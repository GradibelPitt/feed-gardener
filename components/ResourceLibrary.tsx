'use client';

import { useMemo, useState, type FormEvent } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  Filter,
  Folder,
  Layers,
  Link2,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type { Locale } from '@/lib/locale';
import BilibiliVideo from './BilibiliVideo';
import YouTubeVideo from './YouTubeVideo';
import {
  RESOURCE_TYPES,
  nextDefaultCollectionName,
  resourceFromLink,
  resourceUrlKey,
  resourceWebsite,
  type KnowledgeState,
  type ResourceCollection,
  type ResourceRecord,
  type ResourceType,
} from '@/lib/resources';

type Props = {
  mode?: 'library' | 'saved';
  locale: Locale;
  resources: ResourceRecord[];
  collections: ResourceCollection[];
  t: (zh: string, en: string) => string;
  onCreateCollection: (collection: ResourceCollection) => void;
  onRenameCollection: (id: string, name: string) => void;
  onDeleteCollection: (id: string) => void;
  onAdd: (record: ResourceRecord) => void;
  onUpdate: (
    id: string,
    patch: Partial<
      Pick<ResourceRecord, 'note' | 'knowledgeState' | 'resourceType' | 'collectionId'>
    >,
  ) => void;
  onRemove: (id: string) => void;
  onOpen: (record: ResourceRecord) => void;
  onDiscover: () => void;
};

type GroupBy = 'collection' | 'website' | 'type' | 'state' | 'none';
type SortBy = 'newest' | 'oldest' | 'title';

const UNFILED = '__unfiled__';

const typeNames: Record<ResourceType, { zh: string; en: string }> = {
  webpage: { zh: '网页', en: 'Web page' },
  article: { zh: '文章', en: 'Article' },
  video: { zh: '视频', en: 'Video' },
  paper: { zh: '论文', en: 'Paper' },
  repository: { zh: '代码库', en: 'Repository' },
  social: { zh: '社交帖子', en: 'Social post' },
  document: { zh: '文档', en: 'Document' },
  audio: { zh: '音频', en: 'Audio' },
};

const stateNames: Record<KnowledgeState, { zh: string; en: string }> = {
  inbox: { zh: '待整理', en: 'Inbox' },
  reviewing: { zh: '正在研究', en: 'Reviewing' },
  reference: { zh: '知识参考', en: 'Reference' },
};

function relativeTime(iso: string, locale: Locale): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Date.now() - then;
  const zh = locale === 'zh';
  if (diff < 60_000) return zh ? '刚刚' : 'just now';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return zh ? `${mins} 分钟前` : `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return zh ? `${hours} 小时前` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return zh ? `${days} 天前` : `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return zh ? `${months} 个月前` : `${months}mo ago`;
  return zh ? `${Math.floor(months / 12)} 年前` : `${Math.floor(months / 12)}y ago`;
}

function initials(text: string): string {
  const cleaned = text.replace(/^www\./i, '');
  return (cleaned[0] ?? '·').toUpperCase();
}

function siteColor(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  const hue = ((hash % 360) + 360) % 360;
  return `hsl(${hue} 32% 60%)`;
}

export default function ResourceLibrary({
  mode = 'library',
  locale,
  resources,
  collections,
  t,
  onCreateCollection,
  onRenameCollection,
  onDeleteCollection,
  onAdd,
  onUpdate,
  onRemove,
  onOpen,
  onDiscover,
}: Props) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [addExpanded, setAddExpanded] = useState(false);
  const [formError, setFormError] = useState('');
  const [newCollectionId, setNewCollectionId] = useState<string>(UNFILED);

  const [collectionName, setCollectionName] = useState('');
  const [collectionError, setCollectionError] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [creatingCollection, setCreatingCollection] = useState(false);

  const [groupBy, setGroupBy] = useState<GroupBy>('collection');
  const [sortBy, setSortBy] = useState<SortBy>('newest');
  const [search, setSearch] = useState('');
  const [collectionFilter, setCollectionFilter] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<Set<ResourceType>>(new Set());
  const [websiteFilter, setWebsiteFilter] = useState<Set<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const [editingResourceId, setEditingResourceId] = useState<string | null>(null);

  const activeFilterCount = collectionFilter.size + typeFilter.size + websiteFilter.size;

  const websites = useMemo(
    () => [...new Set(resources.map((resource) => resourceWebsite(resource.url)))].sort(),
    [resources],
  );

  const websiteCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const resource of resources) {
      const site = resourceWebsite(resource.url);
      map.set(site, (map.get(site) ?? 0) + 1);
    }
    return map;
  }, [resources]);

  const topWebsites = useMemo(
    () =>
      [...websiteCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([site]) => site),
    [websiteCounts],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return resources.filter((resource) => {
      if (term) {
        const haystack = [
          resource.title,
          resource.summary,
          resource.author,
          resource.source,
          resource.url,
          resource.tags.join(' '),
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      if (collectionFilter.size > 0) {
        const key = resource.collectionId ?? UNFILED;
        if (!collectionFilter.has(key)) return false;
      }
      if (typeFilter.size > 0 && !typeFilter.has(resource.resourceType)) return false;
      if (websiteFilter.size > 0 && !websiteFilter.has(resourceWebsite(resource.url))) return false;
      return true;
    });
  }, [resources, search, collectionFilter, typeFilter, websiteFilter]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      if (sortBy === 'title') return a.title.localeCompare(b.title, locale === 'zh' ? 'zh' : 'en');
      const cmp = new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime();
      return sortBy === 'oldest' ? -cmp : cmp;
    });
    return list;
  }, [filtered, sortBy, locale]);

  type Group = {
    id: string;
    title: string;
    items: ResourceRecord[];
    meta: ResourceCollection | null;
  };

  const groups: Group[] = useMemo(() => {
    if (mode === 'saved' || groupBy === 'none') {
      return [{ id: 'all', title: '', items: sorted, meta: null }];
    }
    if (groupBy === 'collection') {
      const map = new Map<string, ResourceRecord[]>();
      for (const item of sorted) {
        const key = item.collectionId ?? UNFILED;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(item);
      }
      const named: Group[] = collections.map((collection) => ({
        id: collection.id,
        title: collection.name,
        items: map.get(collection.id) ?? [],
        meta: collection,
      }));
      named.push({
        id: UNFILED,
        title: t('默认', 'Default'),
        items: map.get(UNFILED) ?? [],
        meta: null,
      });
      return named;
    }
    const map = new Map<string, ResourceRecord[]>();
    for (const item of sorted) {
      const key =
        groupBy === 'website'
          ? resourceWebsite(item.url)
          : groupBy === 'type'
            ? item.resourceType
            : item.knowledgeState;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    const entries = [...map.entries()];
    if (groupBy === 'website') {
      entries.sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
      return entries.map(([key, items]) => ({ id: key, title: key, items, meta: null }));
    }
    if (groupBy === 'type') {
      const order = RESOURCE_TYPES.slice();
      entries.sort(
        (a, b) => order.indexOf(a[0] as ResourceType) - order.indexOf(b[0] as ResourceType),
      );
      return entries.map(([key, items]) => ({
        id: key,
        title: t(typeNames[key as ResourceType].zh, typeNames[key as ResourceType].en),
        items,
        meta: null,
      }));
    }
    const stateOrder: KnowledgeState[] = ['inbox', 'reviewing', 'reference'];
    entries.sort(
      (a, b) =>
        stateOrder.indexOf(a[0] as KnowledgeState) - stateOrder.indexOf(b[0] as KnowledgeState),
    );
    return entries.map(([key, items]) => ({
      id: key,
      title: t(stateNames[key as KnowledgeState].zh, stateNames[key as KnowledgeState].en),
      items,
      meta: null,
    }));
  }, [mode, groupBy, sorted, collections, t]);

  const toggleInSet = <T,>(setter: (updater: (previous: Set<T>) => Set<T>) => void, value: T) => {
    setter((previous) => {
      const next = new Set(previous);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const toggleCollapsed = (id: string) => toggleInSet(setCollapsedGroups, id);
  const toggleCollectionFilter = (id: string) => toggleInSet(setCollectionFilter, id);
  const toggleTypeFilter = (type: ResourceType) => toggleInSet(setTypeFilter, type);
  const toggleWebsiteFilter = (site: string) => toggleInSet(setWebsiteFilter, site);

  const clearFilters = () => {
    setCollectionFilter(new Set());
    setTypeFilter(new Set());
    setWebsiteFilter(new Set());
    setSearch('');
  };

  const createCollection = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = collectionName.trim() || nextDefaultCollectionName(collections);
    if (collections.some((collection) => collection.name.toLowerCase() === name.toLowerCase())) {
      setCollectionError(t('请输入不重复的收藏夹名称。', 'Enter a unique collection name.'));
      return;
    }
    if (collections.length >= 50) {
      setCollectionError(t('最多创建 50 个收藏夹。', 'You can create up to 50 collections.'));
      return;
    }
    const collection = { id: crypto.randomUUID(), name, createdAt: new Date().toISOString() };
    onCreateCollection(collection);
    setCollectionName('');
    setCollectionError('');
    setCreatingCollection(false);
    setNewCollectionId(collection.id);
  };

  const renameCollection = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!renamingId) return;
    const name = renameName.trim();
    if (
      !name ||
      collections.some(
        (collection) =>
          collection.id !== renamingId && collection.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      setCollectionError(t('请输入不重复的收藏夹名称。', 'Enter a unique collection name.'));
      return;
    }
    onRenameCollection(renamingId, name);
    setRenamingId(null);
    setRenameName('');
    setCollectionError('');
  };

  const addLink = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const record = resourceFromLink(url, title);
    if (!record) {
      setFormError(
        t('请输入完整的 http:// 或 https:// 链接。', 'Enter a complete http:// or https:// link.'),
      );
      return;
    }
    if (resources.some((resource) => resourceUrlKey(resource.url) === resourceUrlKey(record.url))) {
      setFormError(t('这个链接已在资源库中。', 'This link is already in your library.'));
      return;
    }
    if (resources.length >= 500) {
      setFormError(
        t('资源库已达到 500 条本地收藏上限。', 'The local library has reached its 500-link limit.'),
      );
      return;
    }
    record.collectionId =
      newCollectionId !== UNFILED &&
      collections.some((collection) => collection.id === newCollectionId)
        ? newCollectionId
        : null;
    onAdd(record);
    setUrl('');
    setTitle('');
    setFormError('');
    setAddExpanded(false);
  };

  const totalVisible = sorted.length;

  return (
    <main className="resource-library workspace-content" data-page={mode}>
      <header className="rlib-head">
        <div>
          <h1>
            {mode === 'saved' ? t('稍后阅读', 'Saved for later') : t('资源库', 'Resource library')}
          </h1>
          <p>
            {mode === 'saved'
              ? t(
                  '快速查看已收藏的内容;可以在资源库中整理收藏夹。',
                  'A quick view of your saved content. Organize it in Resource library.',
                )
              : t(
                  '一个库、多个视图。用分组、排序、筛选看到你需要的那部分。',
                  'One library, many views. Group, sort, and filter to see the slice you need.',
                )}
          </p>
        </div>
        {mode === 'library' && (
          <div className="rlib-head-stat">
            <span className="rlib-head-stat-num">{resources.length}</span>
            <span className="rlib-head-stat-label">
              {t('已收藏', 'saved')}
              <i />
              {t(`${collections.length} 个收藏夹`, `${collections.length} collections`)}
            </span>
          </div>
        )}
      </header>

      {mode === 'library' && (
        <form className={`rlib-add ${addExpanded ? 'rlib-add-expanded' : ''}`} onSubmit={addLink}>
          <div className="rlib-add-row">
            <Link2 size={16} className="rlib-add-icon" aria-hidden />
            <input
              type="url"
              value={url}
              required
              maxLength={2_048}
              className="rlib-add-url"
              placeholder={t(
                '粘贴链接,自动识别类型',
                'Paste a link — type is detected automatically',
              )}
              onChange={(event) => {
                setUrl(event.target.value);
                setFormError('');
              }}
              onFocus={() => setAddExpanded(true)}
            />
            <button
              type="button"
              className="rlib-add-more"
              aria-expanded={addExpanded}
              onClick={() => setAddExpanded((previous) => !previous)}
            >
              {addExpanded ? t('收起', 'Less') : t('更多', 'More')}
            </button>
            <button type="submit" className="primary-button rlib-add-submit">
              <Plus size={14} /> {t('保存', 'Save')}
            </button>
          </div>
          {addExpanded && (
            <div className="rlib-add-extra">
              <label className="rlib-field">
                <span>{t('标题(选填)', 'Title (optional)')}</span>
                <input
                  value={title}
                  maxLength={500}
                  placeholder={t('留空则使用网站名称', 'Defaults to the website name')}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              <label className="rlib-field">
                <span>{t('存入收藏夹', 'Save to collection')}</span>
                <select
                  value={newCollectionId}
                  onChange={(event) => setNewCollectionId(event.target.value)}
                >
                  <option value={UNFILED}>{t('默认', 'Default')}</option>
                  {collections.map((collection) => (
                    <option key={collection.id} value={collection.id}>
                      {collection.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {formError && (
            <p className="rlib-error" role="alert">
              {formError}
            </p>
          )}
        </form>
      )}

      {mode === 'library' && (
        <div className="rlib-toolbar">
          <label className="rlib-search">
            <Search size={14} aria-hidden />
            <input
              type="search"
              value={search}
              placeholder={t('搜索标题、笔记、标签……', 'Search titles, notes, tags…')}
              onChange={(event) => setSearch(event.target.value)}
            />
            {search && (
              <button
                type="button"
                className="rlib-search-clear"
                aria-label={t('清除搜索', 'Clear search')}
                onClick={() => setSearch('')}
              >
                <X size={12} />
              </button>
            )}
          </label>
          <div className="rlib-toolbar-controls">
            <label className="rlib-select">
              <Layers size={13} aria-hidden />
              <span className="rlib-select-label">{t('分组', 'Group')}</span>
              <select
                value={groupBy}
                onChange={(event) => setGroupBy(event.target.value as GroupBy)}
              >
                <option value="collection">{t('按收藏夹', 'By collection')}</option>
                <option value="website">{t('按网站', 'By website')}</option>
                <option value="type">{t('按类型', 'By type')}</option>
                <option value="state">{t('按状态', 'By state')}</option>
                <option value="none">{t('不分组', 'None')}</option>
              </select>
            </label>
            <label className="rlib-select">
              <span className="rlib-select-label">{t('排序', 'Sort')}</span>
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortBy)}>
                <option value="newest">{t('最新在前', 'Newest first')}</option>
                <option value="oldest">{t('最早在前', 'Oldest first')}</option>
                <option value="title">{t('按标题', 'By title')}</option>
              </select>
            </label>
            <button
              type="button"
              className={`rlib-filter-toggle ${filtersOpen ? 'is-open' : ''}`}
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((previous) => !previous)}
            >
              <Filter size={13} />
              {t('筛选', 'Filter')}
              {activeFilterCount > 0 && (
                <span className="rlib-filter-badge">{activeFilterCount}</span>
              )}
            </button>
          </div>
        </div>
      )}

      {mode === 'library' && filtersOpen && (
        <div className="rlib-filters">
          <div className="rlib-filter-row">
            <span className="rlib-filter-label">
              <Folder size={12} /> {t('收藏夹', 'Collections')}
            </span>
            <div className="rlib-chips">
              <button
                type="button"
                className={`rlib-chip ${collectionFilter.has(UNFILED) ? 'is-on' : ''}`}
                onClick={() => toggleCollectionFilter(UNFILED)}
              >
                {t('默认', 'Default')}
                <small>{resources.filter((resource) => !resource.collectionId).length}</small>
              </button>
              {collections.map((collection) => {
                const on = collectionFilter.has(collection.id);
                return (
                  <button
                    key={collection.id}
                    type="button"
                    className={`rlib-chip ${on ? 'is-on' : ''}`}
                    onClick={() => toggleCollectionFilter(collection.id)}
                  >
                    {collection.name}
                    <small>
                      {
                        resources.filter((resource) => resource.collectionId === collection.id)
                          .length
                      }
                    </small>
                  </button>
                );
              })}
              <button
                type="button"
                className="rlib-chip rlib-chip-add"
                onClick={() => setCreatingCollection(true)}
              >
                <Plus size={12} /> {t('新建', 'New')}
              </button>
            </div>
          </div>
          {creatingCollection && (
            <form className="rlib-inline-form" onSubmit={createCollection}>
              <input
                autoFocus
                aria-label={t('新收藏夹名称', 'New collection name')}
                placeholder={t('留空自动命名', 'Leave blank for an automatic name')}
                value={collectionName}
                maxLength={60}
                onChange={(event) => {
                  setCollectionName(event.target.value);
                  setCollectionError('');
                }}
              />
              <button type="submit" className="secondary-button">
                {t('创建', 'Create')}
              </button>
              <button
                type="button"
                className="secondary-button rlib-ghost"
                onClick={() => {
                  setCreatingCollection(false);
                  setCollectionName('');
                  setCollectionError('');
                }}
              >
                {t('取消', 'Cancel')}
              </button>
            </form>
          )}
          {collectionError && (
            <p className="rlib-error" role="alert">
              {collectionError}
            </p>
          )}
          <div className="rlib-filter-row">
            <span className="rlib-filter-label">
              <FileText size={12} /> {t('类型', 'Type')}
            </span>
            <div className="rlib-chips">
              {RESOURCE_TYPES.filter((type) =>
                resources.some((resource) => resource.resourceType === type),
              ).map((type) => {
                const on = typeFilter.has(type);
                return (
                  <button
                    key={type}
                    type="button"
                    className={`rlib-chip ${on ? 'is-on' : ''}`}
                    onClick={() => toggleTypeFilter(type)}
                  >
                    {t(typeNames[type].zh, typeNames[type].en)}
                    <small>
                      {resources.filter((resource) => resource.resourceType === type).length}
                    </small>
                  </button>
                );
              })}
            </div>
          </div>
          {topWebsites.length > 0 && (
            <div className="rlib-filter-row">
              <span className="rlib-filter-label">
                <Link2 size={12} /> {t('网站', 'Website')}
              </span>
              <div className="rlib-chips">
                {topWebsites.map((site) => {
                  const on = websiteFilter.has(site);
                  return (
                    <button
                      key={site}
                      type="button"
                      className={`rlib-chip ${on ? 'is-on' : ''}`}
                      onClick={() => toggleWebsiteFilter(site)}
                    >
                      {site}
                      <small>{websiteCounts.get(site) ?? 0}</small>
                    </button>
                  );
                })}
                {websites.length > topWebsites.length && (
                  <span className="rlib-chip-more">
                    {t(
                      `+${websites.length - topWebsites.length} 个`,
                      `+${websites.length - topWebsites.length} more`,
                    )}
                  </span>
                )}
              </div>
            </div>
          )}
          {activeFilterCount > 0 && (
            <button type="button" className="rlib-clear" onClick={clearFilters}>
              {t('清除所有筛选', 'Clear all filters')}
            </button>
          )}
        </div>
      )}

      {resources.length === 0 ? (
        <section className="rlib-empty">
          <BookOpen size={28} />
          <h2>{t('还没有收藏资源', 'No resources saved yet')}</h2>
          <p>
            {mode === 'saved'
              ? t(
                  '从发现页收藏一些内容,之后可以在这里快速查看。',
                  'Save a few items from Discover to find them here later.',
                )
              : t(
                  '粘贴上方链接,或从发现页收藏公开来源。',
                  'Paste a link above or save a public-source item from Discover.',
                )}
          </p>
          <button className="primary-button" onClick={onDiscover}>
            <Search size={15} /> {t('去发现资源', 'Discover resources')}
          </button>
        </section>
      ) : totalVisible === 0 ? (
        <div className="rlib-empty-state">
          <span>{t('没有符合当前筛选的资源。', 'Nothing matches these filters.')}</span>
          {activeFilterCount > 0 && (
            <button type="button" className="rlib-link" onClick={clearFilters}>
              {t('清除筛选', 'Clear filters')}
            </button>
          )}
        </div>
      ) : (
        <div className="rlib-groups">
          {mode === 'library' && (
            <div className="rlib-count">
              {t(
                `显示 ${totalVisible} / ${resources.length} 条`,
                `Showing ${totalVisible} of ${resources.length}`,
              )}
            </div>
          )}
          {groups.map((group) => {
            const collapsed = collapsedGroups.has(group.id);
            const showHeader = mode === 'library' && groupBy !== 'none';
            const isCollectionGroup = groupBy === 'collection' && mode === 'library';
            const isRenaming = renamingId !== null && renamingId === group.meta?.id;
            const isDeleting = deletingId !== null && deletingId === group.meta?.id;
            return (
              <section className="rlib-group" key={group.id}>
                {showHeader && (
                  <div className="rlib-group-head">
                    <button
                      type="button"
                      className="rlib-group-toggle"
                      onClick={() => toggleCollapsed(group.id)}
                      aria-expanded={!collapsed}
                    >
                      {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                      {isRenaming ? (
                        <span
                          className="rlib-inline-slot"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <form
                            className="rlib-inline-form rlib-inline-form-tight"
                            onSubmit={renameCollection}
                          >
                            <input
                              autoFocus
                              value={renameName}
                              maxLength={60}
                              required
                              onChange={(event) => setRenameName(event.target.value)}
                            />
                            <button type="submit" className="secondary-button">
                              {t('保存', 'Save')}
                            </button>
                            <button
                              type="button"
                              className="secondary-button rlib-ghost"
                              onClick={() => {
                                setRenamingId(null);
                                setCollectionError('');
                              }}
                            >
                              {t('取消', 'Cancel')}
                            </button>
                          </form>
                        </span>
                      ) : (
                        <>
                          <span className="rlib-group-title">{group.title}</span>
                          <span className="rlib-group-count">{group.items.length}</span>
                        </>
                      )}
                    </button>
                    {isCollectionGroup && group.meta && !isRenaming && (
                      <div className="rlib-group-actions">
                        <button
                          type="button"
                          className="rlib-icon-btn"
                          aria-label={t(`重命名 ${group.meta.name}`, `Rename ${group.meta.name}`)}
                          onClick={() => {
                            setRenamingId(group.meta!.id);
                            setRenameName(group.meta!.name);
                            setCollectionError('');
                          }}
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          type="button"
                          className="rlib-icon-btn rlib-icon-btn-danger"
                          aria-label={t(`删除 ${group.meta.name}`, `Delete ${group.meta.name}`)}
                          onClick={() => setDeletingId(group.meta!.id)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {isDeleting && group.meta && (
                  <div className="rlib-group-confirm">
                    <span>
                      {t(
                        '删除收藏夹后,其中的内容会移到"默认"。',
                        'Deleting this collection moves its content to Default.',
                      )}
                    </span>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        onDeleteCollection(group.meta!.id);
                        if (newCollectionId === group.meta!.id) setNewCollectionId(UNFILED);
                        if (collectionFilter.has(group.meta!.id)) {
                          setCollectionFilter((previous) => {
                            const next = new Set(previous);
                            next.delete(group.meta!.id);
                            return next;
                          });
                        }
                        setDeletingId(null);
                      }}
                    >
                      {t('删除收藏夹', 'Delete collection')}
                    </button>
                    <button
                      type="button"
                      className="secondary-button rlib-ghost"
                      onClick={() => setDeletingId(null)}
                    >
                      {t('取消', 'Cancel')}
                    </button>
                  </div>
                )}
                {!collapsed && group.items.length === 0 && showHeader && (
                  <div className="rlib-group-empty">
                    {isCollectionGroup
                      ? t(
                          '这个收藏夹还没有内容。在其他条目的编辑中把它们移入。',
                          'Empty. Move items here from an item’s Edit panel.',
                        )
                      : t('没有条目。', 'No items.')}
                  </div>
                )}
                {!collapsed && group.items.length > 0 && (
                  <ul className="rlib-list">
                    {group.items.map((resource) => {
                      const website = resourceWebsite(resource.url);
                      const isEditing = editingResourceId === resource.id;
                      const isBilibili =
                        resource.source === 'Bilibili' || website === 'bilibili.com';
                      const isYouTube =
                        resource.source === 'YouTube' ||
                        ['youtube.com', 'm.youtube.com', 'youtu.be'].includes(website);
                      const hasEmbed =
                        (isBilibili || isYouTube) && (resource.embedUrl || resource.imageUrl);
                      return (
                        <li
                          key={resource.id}
                          className={`rlib-item ${isEditing ? 'is-editing' : ''}`}
                        >
                          <div className="rlib-item-row">
                            <div
                              className="rlib-favicon"
                              aria-hidden
                              style={{ background: siteColor(website) }}
                            >
                              {initials(website)}
                            </div>
                            <div className="rlib-item-body">
                              <div className="rlib-item-meta">
                                <span className="rlib-item-source">{website}</span>
                                <i />
                                <span>
                                  {t(
                                    typeNames[resource.resourceType].zh,
                                    typeNames[resource.resourceType].en,
                                  )}
                                </span>
                                <i />
                                <span>{relativeTime(resource.savedAt, locale)}</span>
                                {resource.author && (
                                  <>
                                    <i />
                                    <span>{resource.author}</span>
                                  </>
                                )}
                              </div>
                              <h3 className="rlib-item-title">{resource.title}</h3>
                              {resource.tags.length > 0 && (
                                <div className="rlib-item-tags">
                                  {resource.tags.slice(0, 5).map((tag) => (
                                    <span key={tag}>{tag}</span>
                                  ))}
                                  {resource.tags.length > 5 && (
                                    <span className="rlib-item-tags-more">
                                      +{resource.tags.length - 5}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="rlib-item-actions">
                              <a
                                href={resource.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rlib-icon-btn"
                                aria-label={t('打开原始链接', 'Open original')}
                                onClick={() => onOpen(resource)}
                              >
                                <ExternalLink size={13} />
                              </a>
                              <button
                                type="button"
                                className={`rlib-icon-btn ${isEditing ? 'is-active' : ''}`}
                                aria-expanded={isEditing}
                                aria-label={t(`编辑 ${resource.title}`, `Edit ${resource.title}`)}
                                onClick={() => setEditingResourceId(isEditing ? null : resource.id)}
                              >
                                <Pencil size={13} />
                              </button>
                            </div>
                          </div>
                          {isEditing && (
                            <div className="rlib-item-expand">
                              {hasEmbed && (
                                <div className="rlib-item-video">
                                  {isBilibili ? (
                                    <BilibiliVideo item={resource} />
                                  ) : (
                                    <YouTubeVideo item={resource} />
                                  )}
                                </div>
                              )}
                              {resource.summary && (
                                <p className="rlib-item-summary">{resource.summary}</p>
                              )}
                              <div className="rlib-item-edit-grid">
                                <label className="rlib-field">
                                  <span>{t('收藏夹', 'Collection')}</span>
                                  <select
                                    value={resource.collectionId ?? UNFILED}
                                    onChange={(event) =>
                                      onUpdate(resource.id, {
                                        collectionId:
                                          event.target.value === UNFILED
                                            ? null
                                            : event.target.value,
                                      })
                                    }
                                  >
                                    <option value={UNFILED}>{t('默认', 'Default')}</option>
                                    {collections.map((collection) => (
                                      <option key={collection.id} value={collection.id}>
                                        {collection.name}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="rlib-field">
                                  <span>{t('类型', 'Type')}</span>
                                  <select
                                    value={resource.resourceType}
                                    onChange={(event) =>
                                      onUpdate(resource.id, {
                                        resourceType: event.target.value as ResourceType,
                                      })
                                    }
                                  >
                                    {RESOURCE_TYPES.map((type) => (
                                      <option key={type} value={type}>
                                        {t(typeNames[type].zh, typeNames[type].en)}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="rlib-field">
                                  <span>{t('知识状态', 'Knowledge state')}</span>
                                  <select
                                    value={resource.knowledgeState}
                                    onChange={(event) =>
                                      onUpdate(resource.id, {
                                        knowledgeState: event.target.value as KnowledgeState,
                                      })
                                    }
                                  >
                                    {(Object.keys(stateNames) as KnowledgeState[]).map((state) => (
                                      <option key={state} value={state}>
                                        {t(stateNames[state].zh, stateNames[state].en)}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              </div>
                              <label className="rlib-field rlib-field-note">
                                <span>{t('我的笔记', 'My note')}</span>
                                <textarea
                                  value={resource.note}
                                  maxLength={10_000}
                                  placeholder={t(
                                    '记录为什么值得保留、下一步要验证什么……',
                                    'Why keep this? What should be verified next?',
                                  )}
                                  onChange={(event) =>
                                    onUpdate(resource.id, { note: event.target.value })
                                  }
                                />
                              </label>
                              <div className="rlib-item-edit-footer">
                                <button
                                  type="button"
                                  className="rlib-remove"
                                  onClick={() => {
                                    onRemove(resource.id);
                                    setEditingResourceId(null);
                                  }}
                                >
                                  <Trash2 size={13} /> {t('移出资源库', 'Remove from library')}
                                </button>
                                <button
                                  type="button"
                                  className="secondary-button rlib-ghost"
                                  onClick={() => setEditingResourceId(null)}
                                >
                                  {t('完成', 'Done')}
                                </button>
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
