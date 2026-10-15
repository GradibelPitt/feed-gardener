'use client';

import { Clapperboard } from 'lucide-react';
import styles from './WorkspaceSettings.module.css';

type Props = {
  nearbyTopicsEnabled: boolean;
  onNearbyTopicsChange: (enabled: boolean) => void;
};

export default function WorkspaceSettings({ nearbyTopicsEnabled, onNearbyTopicsChange }: Props) {
  return (
    <main className={styles.page} data-page="settings">
      <header className={styles.header}>
        <span className={styles.eyebrow}>YOUR PREFERENCES</span>
        <h1>Settings</h1>
        <p>Make Feeder work for you. Changes are saved automatically.</p>
      </header>
      <section className={styles.section} aria-labelledby="shorts-settings-title">
        <h2 id="shorts-settings-title">
          <Clapperboard size={21} aria-hidden="true" /> Shorts
        </h2>
        <div className={styles.row}>
          <div className={styles.copy}>
            <label htmlFor="shorts-nearby-topics">you may also interested in</label>
            <p id="shorts-nearby-description">
              Include videos from topics related to your interests. Turn off to keep Shorts within
              your selected topics.
            </p>
          </div>
          <label className={styles.toggle}>
            <input
              id="shorts-nearby-topics"
              type="checkbox"
              role="switch"
              aria-describedby="shorts-nearby-description"
              checked={nearbyTopicsEnabled}
              onChange={(event) => onNearbyTopicsChange(event.target.checked)}
            />
            <span className={styles.track} aria-hidden="true" />
          </label>
        </div>
      </section>
    </main>
  );
}
