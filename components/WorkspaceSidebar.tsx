'use client';

import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Bookmark,
  CircleHelp,
  Compass,
  Layers3,
  Leaf,
  Sprout,
} from 'lucide-react';

export type WorkspacePage = 'discover' | 'garden' | 'library' | 'saved';

export const WORKSPACE_TABS = [
  { id: 'discover', icon: Compass, zh: '发现好内容', en: 'Discover' },
  { id: 'garden', icon: Sprout, zh: '我的信息花园', en: 'My garden' },
  { id: 'library', icon: Layers3, zh: '资源库', en: 'Resource library' },
] as const;

type Props = {
  page: WorkspacePage;
  t: (zh: string, en: string) => string;
  onNavigate: (page: WorkspacePage) => void;
};

export default function WorkspaceSidebar({ page, t, onNavigate }: Props) {
  const [libraryExpanded, setLibraryExpanded] = useState(page === 'saved');

  useEffect(() => {
    if (page === 'saved') setLibraryExpanded(true);
  }, [page]);

  const navigate = (next: WorkspacePage) => {
    if (next === 'library') {
      setLibraryExpanded((open) => (page === 'library' ? !open : true));
    } else if (next === 'saved') {
      setLibraryExpanded(true);
    } else {
      setLibraryExpanded(false);
    }
    onNavigate(next);
  };

  return (
    <>
      <aside className="sidebar" aria-label={t('工作台导航', 'Workspace navigation')}>
        <button className="brand" onClick={() => navigate('discover')}>
          <span className="brand-mark">
            <Sprout size={27} strokeWidth={1.6} />
          </span>
          <span>
            <span className="brand-serif">Feeder</span>
            <small>YOUR INTERESTS. YOUR FEED.</small>
          </span>
        </button>
        <span className="nav-label">{t('你的工作台', 'WORKSPACE')}</span>
        <nav aria-label={t('主页面', 'Main pages')}>
          {WORKSPACE_TABS.map((item) => (
            <div className="sidebar-nav-group" key={item.id}>
              <button
                aria-current={page === item.id ? 'page' : undefined}
                aria-expanded={item.id === 'library' ? libraryExpanded : undefined}
                className={`nav-item ${page === item.id ? 'active' : ''}`}
                onClick={() => navigate(item.id)}
              >
                <item.icon size={19} strokeWidth={1.7} />
                <span>{t(item.zh, item.en)}</span>
                {item.id === 'garden' && <i />}
              </button>
              {item.id === 'library' && libraryExpanded && (
                <div className="sidebar-subnav">
                  <button
                    className={`nav-item sidebar-subitem ${page === 'saved' ? 'active' : ''}`}
                    aria-current={page === 'saved' ? 'page' : undefined}
                    onClick={() => navigate('saved')}
                  >
                    <Bookmark size={19} strokeWidth={1.7} />
                    <span>{t('稍后阅读', 'Saved for later')}</span>
                  </button>
                </div>
              )}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="slow-note">
            <div>
              <Leaf size={19} />
              <span>{t('让注意力，回到你手里。', 'Make room for what matters.')}</span>
            </div>
            <p>
              {t('信息不必更多，只需更适合你。', 'A little less scrolling. A little more growing.')}
            </p>
          </div>
          <a className="nav-item" href="/instructions">
            <CircleHelp size={18} />
            {t('使用说明', 'Instructions')}
            <ArrowUpRight size={14} className="push-right" />
          </a>
        </div>
      </aside>
    </>
  );
}
