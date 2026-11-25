'use client';

import { useRef, type ReactNode } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

/** Anything the user can press. Opt out with data-motion="off". */
const PRESSABLE = 'button, summary, [role="tab"], [data-press]';
const PRESS_BLOCKED = ':disabled, [aria-disabled="true"], [data-motion="off"]';
/** List entries that stagger in the first time they scroll into view. */
const ITEM = '[data-motion-item]';
const PRESS_CLASS = 'is-gsap-press';

/**
 * Shrink by a few pixels rather than a fixed ratio, so a chip and a wide
 * card both feel like they travel the same distance under the finger.
 */
const pressScale = (el: Element) => {
  const { width, height } = el.getBoundingClientRect();
  return gsap.utils.clamp(0.95, 0.99, 1 - 4 / Math.max(width, height, 1));
};

export default function MotionRoot({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const scope = root.current;
      if (!scope) return;

      // Created inside the useGSAP context, so it is reverted with it on unmount.
      const mm = gsap.matchMedia();

      mm.add('(prefers-reduced-motion: no-preference)', (context) => {
        // Handlers fire long after setup; routing them through the matchMedia
        // context keeps their tweens revertible when the query stops matching.
        const contextSafe = <T extends (...args: never[]) => void>(fn: T) =>
          context.add(null as unknown as string, fn) as unknown as T;
        document.documentElement.classList.add('gsap-motion');

        /* Press: quick squash on pointer down, springy release ------------- */
        let pressed: HTMLElement | null = null;

        const onPointerDown = contextSafe((event: PointerEvent) => {
          if (event.button !== 0 || !(event.target instanceof Element)) return;
          const el = event.target.closest<HTMLElement>(PRESSABLE);
          if (!el || !scope.contains(el) || el.matches(PRESS_BLOCKED)) return;
          pressed = el;
          el.classList.add(PRESS_CLASS);
          gsap.to(el, {
            scale: pressScale(el),
            duration: 0.14,
            ease: 'power2.out',
            overwrite: 'auto',
          });
        });

        const release = contextSafe(() => {
          const el = pressed;
          if (!el) return;
          pressed = null;
          gsap.to(el, {
            scale: 1,
            duration: 0.55,
            ease: 'elastic.out(1.1, 0.5)',
            overwrite: 'auto',
            clearProps: 'transform',
            onComplete: () => el.classList.remove(PRESS_CLASS),
          });
        });

        /* Toggle + keyboard feedback --------------------------------------- */
        const onClick = contextSafe((event: MouseEvent) => {
          if (!(event.target instanceof Element)) return;
          const el = event.target.closest<HTMLElement>(PRESSABLE);
          if (!el || !scope.contains(el) || el.matches(PRESS_BLOCKED)) return;

          // Keyboard activation has no pointer phase: give it one short pulse.
          if (event.detail === 0) {
            el.classList.add(PRESS_CLASS);
            gsap
              .timeline({ onComplete: () => el.classList.remove(PRESS_CLASS) })
              .to(el, { scale: pressScale(el), duration: 0.09, ease: 'power2.out' })
              .to(el, { scale: 1, duration: 0.4, ease: 'back.out(3)', clearProps: 'transform' });
          }

          // Toggles (save, like, block…): pop the icon once React has
          // committed the new state.
          if (el.hasAttribute('aria-pressed')) {
            requestAnimationFrame(() => {
              const icon = el.querySelector('svg');
              if (!icon || !el.isConnected) return;
              const on = el.getAttribute('aria-pressed') === 'true';
              gsap.fromTo(
                icon,
                { scale: on ? 0.55 : 0.8 },
                {
                  scale: 1,
                  duration: on ? 0.55 : 0.3,
                  ease: on ? 'back.out(3.5)' : 'power2.out',
                  overwrite: 'auto',
                  clearProps: 'transform',
                },
              );
            });
          }
        });

        /* List entrance: stagger whatever enters the viewport together ------ */
        const seen = new WeakSet<Element>();
        const reveal =
          typeof IntersectionObserver === 'undefined'
            ? null
            : new IntersectionObserver(
                contextSafe((entries: IntersectionObserverEntry[]) => {
                  const batch = entries
                    .filter((entry) => entry.isIntersecting)
                    .map((entry) => entry.target);
                  if (!batch.length) return;
                  batch.forEach((el) => reveal?.unobserve(el));
                  gsap.to(batch, {
                    autoAlpha: 1,
                    y: 0,
                    duration: 0.5,
                    ease: 'power3.out',
                    stagger: { amount: Math.min(0.32, batch.length * 0.05) },
                    overwrite: 'auto',
                    clearProps: 'transform,opacity,visibility',
                  });
                }),
                { rootMargin: '0px 0px -4% 0px' },
              );

        const prepareItems = (nodes: Iterable<Element>) => {
          if (!reveal) return;
          const fresh = [...nodes].filter((el) => !seen.has(el));
          if (!fresh.length) return;
          fresh.forEach((el) => seen.add(el));
          gsap.set(fresh, { autoAlpha: 0, y: 14 });
          fresh.forEach((el) => reveal.observe(el));
        };

        /* Surfaces: pages, dialogs, disclosure panels ----------------------- */
        const enterPage = contextSafe((page: Element) => {
          // Opacity only: a transform here would re-anchor fixed descendants.
          gsap.fromTo(
            page,
            { opacity: 0 },
            { opacity: 1, duration: 0.32, ease: 'power1.out', clearProps: 'opacity' },
          );
        });

        const openSurface = contextSafe((el: Element) => {
          if (el instanceof HTMLDialogElement) {
            gsap.fromTo(
              el,
              { autoAlpha: 0, y: 18, scale: 0.97 },
              {
                autoAlpha: 1,
                y: 0,
                scale: 1,
                duration: 0.42,
                ease: 'back.out(1.4)',
                clearProps: 'transform,opacity,visibility',
              },
            );
            return;
          }
          const content =
            el instanceof HTMLDetailsElement
              ? [...el.children].filter((child) => child.tagName !== 'SUMMARY')
              : [...el.children];
          if (!content.length) return;
          gsap.fromTo(
            content,
            { autoAlpha: 0, y: -6 },
            {
              autoAlpha: 1,
              y: 0,
              duration: 0.28,
              ease: 'power2.out',
              stagger: { amount: Math.min(0.12, content.length * 0.03) },
              overwrite: 'auto',
              clearProps: 'transform,opacity,visibility',
            },
          );
        });

        const onMutations = contextSafe((records: MutationRecord[]) => {
          const items = new Set<Element>();
          for (const record of records) {
            if (record.type === 'attributes') {
              const el = record.target as Element;
              const isOpen =
                record.attributeName === 'hidden'
                  ? !el.hasAttribute('hidden') && el.hasAttribute('data-motion-panel')
                  : el.hasAttribute('open') && el.matches('dialog, details');
              if (isOpen) openSurface(el);
              continue;
            }
            record.addedNodes.forEach((node) => {
              if (!(node instanceof Element)) return;
              if (node.tagName === 'MAIN' && node.parentElement?.matches('.main-shell')) {
                enterPage(node);
              }
              if (node.matches(ITEM)) items.add(node);
              node.querySelectorAll(ITEM).forEach((el) => items.add(el));
            });
          }
          if (items.size) prepareItems(items);
        });

        const observer = new MutationObserver(onMutations);
        prepareItems(scope.querySelectorAll(ITEM));
        observer.observe(scope, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['open', 'hidden'],
        });
        scope.addEventListener('pointerdown', onPointerDown);
        scope.addEventListener('click', onClick);
        window.addEventListener('pointerup', release);
        window.addEventListener('pointercancel', release);
        window.addEventListener('blur', release);

        return () => {
          observer.disconnect();
          reveal?.disconnect();
          scope.removeEventListener('pointerdown', onPointerDown);
          scope.removeEventListener('click', onClick);
          window.removeEventListener('pointerup', release);
          window.removeEventListener('pointercancel', release);
          window.removeEventListener('blur', release);
          scope
            .querySelectorAll(`.${PRESS_CLASS}`)
            .forEach((el) => el.classList.remove(PRESS_CLASS));
          document.documentElement.classList.remove('gsap-motion');
        };
      });
    },
    { scope: root },
  );

  return (
    <div ref={root} className="motion-shell">
      {children}
    </div>
  );
}
