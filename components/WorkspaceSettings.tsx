'use client';

import { useEffect, useState } from 'react';
import { Clapperboard } from 'lucide-react';
import styles from './WorkspaceSettings.module.css';

type Props = {
  nearbyTopicsEnabled: boolean;
  onNearbyTopicsChange: (enabled: boolean) => void;
  durationFilterEnabled: boolean;
  maxDurationSeconds: number;
  onDurationFilterChange: (enabled: boolean) => void;
  onMaxDurationChange: (seconds: number) => void;
};

const durationPresets = [
  { seconds: 120, label: '2 min' },
  { seconds: 90, label: '1 min 30 sec' },
  { seconds: 60, label: '1 min' },
  { seconds: 30, label: '30 sec' },
];

export default function WorkspaceSettings({
  nearbyTopicsEnabled,
  onNearbyTopicsChange,
  durationFilterEnabled,
  maxDurationSeconds,
  onDurationFilterChange,
  onMaxDurationChange,
}: Props) {
  const [durationDraft, setDurationDraft] = useState(String(maxDurationSeconds));
  useEffect(() => setDurationDraft(String(maxDurationSeconds)), [maxDurationSeconds]);

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
        <div className={styles.row}>
          <div className={styles.copy}>
            <label htmlFor="shorts-duration-filter">Filter videos longer than</label>
            <p id="shorts-duration-description">Apply this limit only to Shorts videos.</p>
          </div>
          <label className={styles.toggle}>
            <input
              id="shorts-duration-filter"
              type="checkbox"
              role="switch"
              aria-describedby="shorts-duration-description"
              checked={durationFilterEnabled}
              onChange={(event) => onDurationFilterChange(event.target.checked)}
            />
            <span className={styles.track} aria-hidden="true" />
          </label>
        </div>
        {durationFilterEnabled && (
          <div className={styles.durationControls}>
            <div className={styles.presets} role="group" aria-label="Shorts duration presets">
              {durationPresets.map(({ seconds, label }) => (
                <button
                  key={seconds}
                  type="button"
                  className={maxDurationSeconds === seconds ? styles.selectedPreset : ''}
                  aria-pressed={maxDurationSeconds === seconds}
                  onClick={() => onMaxDurationChange(seconds)}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className={styles.customDuration} htmlFor="shorts-custom-duration">
              Custom
              <input
                id="shorts-custom-duration"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                aria-label="Custom Shorts duration in seconds"
                value={durationDraft}
                onChange={(event) => {
                  const value = event.target.value;
                  if (!/^\d*$/.test(value)) return;
                  setDurationDraft(value);
                  const seconds = Number(value);
                  if (Number.isInteger(seconds) && seconds >= 1 && seconds <= 86400)
                    onMaxDurationChange(seconds);
                }}
                onBlur={() => setDurationDraft(String(maxDurationSeconds))}
              />
              sec
            </label>
          </div>
        )}
      </section>
    </main>
  );
}
