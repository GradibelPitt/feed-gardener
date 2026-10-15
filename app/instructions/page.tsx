'use client';

import Link from 'next/link';
import { type Locale, visibleInterfaceLocale } from '@/lib/locale';

export default function InstructionsPage() {
  const locale: Locale = visibleInterfaceLocale;
  const t = (zh: string, en: string) => (locale === 'zh' ? zh : en);

  return (
    <main className="instructions-page">
      <header>
        <Link href="/">← {t('返回', 'Back')}</Link>
        <span>FEEDER</span>
      </header>
      <section>
        <p className="instructions-kicker">{t('使用说明', 'INSTRUCTIONS')}</p>
        <h1>{t('从兴趣开始。', 'Start with your interests.')}</h1>

        <ol>
          <li>
            <strong>{t('设置兴趣', 'Set interests')}</strong>
            <span>
              {t(
                '选择领域、主题、探索比例和屏蔽项。',
                'Choose domains, topics, exploration, and exclusions.',
              )}
            </span>
          </li>
          <li>
            <strong>{t('发现内容', 'Discover')}</strong>
            <span>
              {t(
                '选择 1–10 的 Jev 最低分，推荐流和来源页只展示达到门槛且置信度合格的内容。',
                'Choose a minimum Jev score from 1–10. The feed and source boards show only confident scores meeting this threshold.',
              )}
            </span>
          </li>
          <li>
            <strong>{t('保存与反馈', 'Save and give feedback')}</strong>
            <span>
              {t(
                '打开原文、稍后读、隐藏或标记不感兴趣。',
                'Open a source, save for later, hide, or mark not interested.',
              )}
            </span>
          </li>
          <li>
            <strong>{t('调整相关度', 'Adjust relevance')}</strong>
            <span>
              {t(
                'Relevance 是每条内容的最低分：设为 9，就只显示 Jev 至少 9 分的内容。调高可能减少结果。',
                'Relevance is the minimum score for each item: set it to 9 to show only Jev scores of at least 9. Higher may show fewer results.',
              )}
            </span>
          </li>
        </ol>

      </section>
    </main>
  );
}
