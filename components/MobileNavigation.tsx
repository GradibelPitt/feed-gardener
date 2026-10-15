'use client';

import Link from 'next/link';
import {
  Bookmark,
  CircleHelp,
  Compass,
  Layers3,
  Sprout,
  Clapperboard,
  KeyRound,
  UserRound,
  Settings,
} from 'lucide-react';
import type { WorkspacePage } from './WorkspaceSidebar';

const tabs = [
  { id: 'discover', icon: Compass, label: 'Discover' },
  { id: 'shorts', icon: Clapperboard, label: 'Shorts' },
  { id: 'library', icon: Layers3, label: 'Library' },
  { id: 'settings', icon: Settings, label: 'Settings' },
  { id: 'saved', icon: Bookmark, label: 'Saved' },
  { id: 'api', icon: KeyRound, label: 'API' },
] as const;

export default function MobileNavigation({
  page,
  onNavigate,
}: {
  page: WorkspacePage;
  onNavigate: (page: WorkspacePage) => void;
}) {
  return (
    <>
      <header className="mobile-app-header" data-immersive={page === 'shorts'}>
        <button
          className="mobile-brand"
          onClick={() => onNavigate('discover')}
          aria-label="Feeder home"
        >
          <Sprout size={23} aria-hidden="true" />
          <span>Feeder</span>
        </button>
        <button className="mobile-help" aria-label="Account" onClick={() => onNavigate('account')}><UserRound size={21} /></button>
        <Link href="/instructions" className="mobile-help" aria-label="Instructions">
          <CircleHelp size={21} aria-hidden="true" />
        </Link>
      </header>
      <nav
        className="mobile-tab-bar"
        aria-label="Mobile workspace"
        data-immersive={page === 'shorts'}
      >
        {tabs.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            aria-current={page === id ? 'page' : undefined}
            onClick={() => onNavigate(id)}
          >
            <span className="mobile-tab-icon">
              <Icon size={21} strokeWidth={1.8} aria-hidden="true" />
            </span>
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
