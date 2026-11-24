'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './Landing.module.css';

type Props = { onEnter: (page: 'discover' | 'account') => void };

const REPO_URL = 'https://github.com/GradibelPitt/feed-gardener';

/** Headline pairs. The first one swaps its second line: see `swap`. */
const SLOGANS: Array<{ lead: string; punch: string; swap?: string }> = [
  { lead: 'Big Tech stole your data.', punch: "We don't.", swap: 'Fuck them.' },
  { lead: 'The algorithm works for advertisers.', punch: 'Fire it.' },
  { lead: 'Your feed has a landlord.', punch: 'Evict them.' },
  { lead: 'They optimize for your time.', punch: 'We optimize for your taste.' },
  { lead: 'You are not the product.', punch: 'You are the editor.' },
  { lead: 'Twelve things worth your time.', punch: 'Not twelve hundred.' },
];
const HOLD_MS = 3400;
const SWAP_HOLD_MS = 5600;
const FLICKER_AT_MS = 1700;
const SLAM_AT_MS = 2250;

/** Sample titles for the slider demo. Scores are illustrative, not live Jev output. */
const SAMPLE_FEED: Array<[number, string]> = [
  [8.8, 'REFLEX with Jev for Efficient Selective Control in LLM Agents'],
  [8.8, 'Agensh: Scaling Organizational Intelligence to 1,024 Agents'],
  [8.4, 'Grow the Harness, Not the Context: From Strategy-Free Scaffolds to Reusable Specialist Agents'],
  [8.2, 'MAGIC: Mixed-Granularity Agent Graphs via Incremental Construction'],
  [7.9, 'A2M: Trace-Optimized Agent Hijacking in the MCP Ecosystem'],
  [7.6, 'Measuring the Serving Stack Instead of the Model'],
  [6.8, 'From Alignment to Access Control: A Framework for GenAI Policy Enforcement'],
  [5.9, 'HARMONY: Hierarchical Agentic Reasoning for Monocular Image-to-Scene Synthesis'],
];

const NOISE_PATHS = [
  'M0 20C140 10 180 250 300 260',
  'M0 70C120 160 200 60 300 260',
  'M0 120C90 20 230 330 300 260',
  'M0 170C150 170 150 300 300 260',
  'M0 215C80 330 220 150 300 260',
  'M0 260C120 200 200 320 300 260',
  'M0 305C100 420 210 190 300 260',
  'M0 350C140 300 170 230 300 260',
  'M0 395C90 500 240 200 300 260',
  'M0 440C160 430 190 280 300 260',
  'M0 485C110 380 230 420 300 260',
  'M0 510C180 520 220 300 300 260',
];
const CLEAN_PATHS = [
  'M300 260C400 260 420 120 640 110',
  'M300 260C420 260 460 260 640 260',
  'M300 260C400 260 420 400 640 410',
];

function Mark({ size = 34 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 48 48">
      <rect width="48" height="48" rx="14" fill="#a6f26b" />
      <g fill="none" stroke="#0b100d" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M24 36V23M24 27C11 27 10 16 10 13c10 0 14 5 14 14ZM24 23c0-10 6-14 14-14 0 10-5 14-14 14Z" />
      </g>
    </svg>
  );
}

function Arrow() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export default function Landing({ onEnter }: Props) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<0 | 1 | 2>(0);
  const [cycle, setCycle] = useState(0);
  const [target, setTarget] = useState(8);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const slogan = SLOGANS[index];
    const queue = timers.current;
    if (slogan.swap) {
      queue.push(setTimeout(() => setPhase(1), FLICKER_AT_MS));
      queue.push(setTimeout(() => setPhase(2), SLAM_AT_MS));
    }
    queue.push(
      setTimeout(
        () => {
          setPhase(0);
          setIndex((current) => (current + 1) % SLOGANS.length);
          setCycle((current) => current + 1);
        },
        slogan.swap ? SWAP_HOLD_MS : HOLD_MS,
      ),
    );
    return () => {
      queue.forEach(clearTimeout);
      queue.length = 0;
    };
  }, [index, cycle]);

  const show = (next: number) => {
    setPhase(0);
    setIndex(next);
    setCycle((current) => current + 1);
  };

  const slogan = SLOGANS[index];
  const swapped = Boolean(slogan.swap) && phase === 2;
  const punchClass = [
    styles.punch,
    slogan.swap && phase === 1 ? styles.flicker : '',
    swapped ? styles.slam : '',
  ]
    .filter(Boolean)
    .join(' ');

  const shown = SAMPLE_FEED.filter(([score]) => score >= target);
  const average = shown.length
    ? (shown.reduce((sum, [score]) => sum + score, 0) / shown.length).toFixed(2)
    : '—';
  const enter = (page: 'discover' | 'account') => (event: React.MouseEvent) => {
    event.preventDefault();
    onEnter(page);
  };

  return (
    <div className={styles.page} data-landing>
      <div className={styles.grain} aria-hidden="true" />

      <header className={styles.nav}>
        <a className={styles.brand} href="#top">
          <Mark />
          Feeder
        </a>
        <nav aria-label="Main" className={styles.navLinks}>
          <a href="#how">How it works</a>
          <a href="#dial">The dial</a>
          <a href="#privacy">Your data</a>
          <a href={REPO_URL}>GitHub</a>
        </nav>
        <div className={styles.navActions}>
          <a href="#account" onClick={enter('account')}>
            Sign in
          </a>
          <a className={styles.buttonLight} href="#discover" onClick={enter('discover')}>
            Build my feed
          </a>
        </div>
      </header>

      <section id="top" className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>YOUR INTERESTS. YOUR FEED.</p>
          {/* key restarts the entrance animation for each headline */}
          <h1 className={styles.headline} key={`${index}-${cycle}`} aria-live="off">
            <span className={styles.lead}>{slogan.lead}</span>
            <span className={punchClass} data-swapped={swapped || undefined}>
              {swapped ? slogan.swap : slogan.punch}
            </span>
          </h1>
          <p className={styles.sub}>
            Feeder pulls from arXiv, GitHub, Hacker News, Bilibili and YouTube, scores titles against
            the topics you picked, and tells you why each one is on your screen.
          </p>
          <div className={styles.ctaRow}>
            <a className={styles.buttonPrimary} href="#discover" onClick={enter('discover')}>
              Build my feed
              <Arrow />
            </a>
            <a className={styles.buttonGlass} href={REPO_URL}>
              Read the source
            </a>
          </div>
          <p className={styles.fine}>No account needed to start. MIT licensed.</p>
          <div className={styles.dots} role="group" aria-label="Headline variants">
            {SLOGANS.map((item, position) => (
              <button
                key={item.lead}
                type="button"
                aria-label={`Show headline: ${item.lead}`}
                aria-pressed={position === index}
                onClick={() => show(position)}
              >
                <span />
              </button>
            ))}
          </div>
        </div>

        <div className={styles.heroArt}>
          <svg aria-hidden="true" viewBox="0 0 640 520" fill="none" strokeLinecap="round">
            <g className={styles.noise} strokeWidth="1.4">
              {NOISE_PATHS.map((d, position) => (
                <path
                  key={d}
                  d={d}
                  stroke={position % 3 === 1 ? '#ff5b3a' : '#f2efe6'}
                  opacity={position % 3 === 1 ? 0.46 : 0.22}
                />
              ))}
            </g>
            <g className={styles.clean} stroke="#a6f26b" strokeWidth="2.2">
              {CLEAN_PATHS.map((d) => (
                <path key={d} d={d} />
              ))}
            </g>
            <circle cx="300" cy="260" r="60" fill="#a6f26b" opacity="0.12" />
            <circle cx="300" cy="260" r="34" fill="#0b100d" stroke="#a6f26b" strokeWidth="2" />
            <circle cx="300" cy="260" r="6" fill="#a6f26b" />
          </svg>
          <span className={styles.artLabel}>EVERYTHING THEY PUSH</span>
          <div className={`${styles.glass} ${styles.cardTop}`}>
            <div className={styles.cardMeta}>
              <span>ARXIV · SAMPLE</span>
              <span className={styles.scoreChip}>JEV 8.8</span>
            </div>
            <strong>Agensh: Scaling Organizational Intelligence to 1,024 Agents</strong>
            <p>
              <b>Why this is here</b>
              Matches your topics Agents and RAG.
            </p>
          </div>
          <div className={`${styles.glass} ${styles.cardBottom}`}>
            <span className={styles.cardLabel}>WHAT YOU ASKED FOR</span>
            <div className={styles.topicRow}>
              <span>Agents</span>
              <span>RAG</span>
              <span>Local inference</span>
              <span className={styles.blocked}>Crypto</span>
            </div>
          </div>
        </div>
      </section>

      <section aria-label="Sources" className={styles.sources}>
        <div>
          <small>ONE FEED FROM</small>
          <span>arXiv</span>
          <span>GitHub</span>
          <span>Hacker News</span>
          <span>Bilibili</span>
          <span>YouTube</span>
          <span>Google Scholar</span>
        </div>
      </section>

      <section id="how" className={styles.section}>
        <h2 className={styles.h2}>Three moves. Then it is yours.</h2>
        <div className={styles.steps}>
          <article className={styles.glass}>
            <small>01</small>
            <h3>Say what you want</h3>
            <p>
              Pick topics. Block the ones you are done with. Blocked topics and sources are hard
              limits, and a high score cannot override them.
            </p>
          </article>
          <article className={styles.glass}>
            <small>02</small>
            <h3>Set how strict</h3>
            <p>
              One slider, 1 to 10. Jev scores each title against your topics, and only items at or
              above your number get through.
            </p>
          </article>
          <article className={styles.glass}>
            <small>03</small>
            <h3>Keep what matters</h3>
            <p>
              Open the source, save it with notes, hide it, or say not interested. Feedback can be
              undone, and none of it touches your accounts on other platforms.
            </p>
          </article>
        </div>
      </section>

      <section id="dial" className={`${styles.section} ${styles.dial}`}>
        <div className={styles.dialCopy}>
          <p className={styles.eyebrow}>THE DIAL</p>
          <h2 className={styles.h2}>You hold the knob they hide.</h2>
          <p className={styles.sub}>
            Turn it up for only the closest matches. Turn it down to let neighbouring topics in. If
            nothing clears the bar, Feeder says so. It does not invent matches.
          </p>
          <label className={styles.dialLabel} htmlFor="landing-dial">
            <span>Minimum relevance</span>
            <output htmlFor="landing-dial">{target} / 10</output>
          </label>
          <input
            id="landing-dial"
            type="range"
            min={1}
            max={10}
            step={1}
            value={target}
            onChange={(event) => setTarget(Number(event.target.value))}
          />
          <dl className={styles.stats}>
            <div>
              <dd>{average}</dd>
              <dt>AVERAGE SHOWN</dt>
            </div>
            <div>
              <dd>{shown.length}</dd>
              <dt>ITEMS SHOWN</dt>
            </div>
          </dl>
        </div>
        <div className={`${styles.glass} ${styles.sample}`}>
          <small>SAMPLE FEED · DRAG THE SLIDER</small>
          <ul>
            {SAMPLE_FEED.map(([score, title]) => (
              <li key={title} data-off={score < target || undefined}>
                <b>{score.toFixed(1)}</b>
                <span>{title}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="privacy" className={styles.light}>
        <div className={styles.section}>
          <h2 className={styles.h2}>Their feed is a business model. Yours is a list.</h2>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <td />
                  <th scope="col" data-side="them">
                    A PLATFORM FEED
                  </th>
                  <th scope="col" data-side="us">
                    FEEDER
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Who picks the topics</th>
                  <td>A ranking system you cannot inspect</td>
                  <td>You, in a list you can edit or delete</td>
                </tr>
                <tr>
                  <th scope="row">Why an item appears</th>
                  <td>No reason given</td>
                  <td>Why this is here, on every card</td>
                </tr>
                <tr>
                  <th scope="row">What your clicks do</th>
                  <td>Feed a profile that follows you around</td>
                  <td>Change this feed only. Nothing is sent back to the source platforms</td>
                </tr>
                <tr>
                  <th scope="row">Where your data lives</th>
                  <td>Their servers, their terms</td>
                  <td>
                    As a guest, in your browser. With an account, in your own workspace, with API
                    keys encrypted using AES-256-GCM
                  </td>
                </tr>
                <tr>
                  <th scope="row">Can you read the code</th>
                  <td>No</td>
                  <td>Yes. All of it, MIT licensed</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section aria-label="Manifesto" className={`${styles.section} ${styles.manifesto}`}>
        <p className={styles.eyebrow}>WHAT WE BELIEVE</p>
        {SLOGANS.map((item, position) => (
          <p key={item.lead} data-first={position === 0 || undefined}>
            {item.lead} <b>{item.punch}</b>
            {item.swap ? <i> {item.swap}</i> : null}
          </p>
        ))}
      </section>

      <section className={styles.section}>
        <div className={styles.closing}>
          <h2>Unfollow the algorithm.</h2>
          <div>
            <a className={styles.buttonDark} href="#discover" onClick={enter('discover')}>
              Build my feed
            </a>
            <span>Free to start. No account needed.</span>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div>
          <span>Feeder, the browser interface of Feed Gardener. MIT licensed.</span>
          <nav aria-label="Footer">
            <a href={REPO_URL}>GitHub</a>
            <a href="#how">How it works</a>
            <a href="#privacy">Your data</a>
            <a href="/instructions">Instructions</a>
            <a href="#account" onClick={enter('account')}>
              Sign in
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
