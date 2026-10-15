import { fileURLToPath } from 'node:url';
import { sites } from '@openai/sites-vite-plugin';
import vinext from 'vinext';
import { defineConfig } from 'vite';

export default defineConfig(async () => {
  const { cloudflare } = await import('@cloudflare/vite-plugin');
  return {
    resolve: {
      alias: [
        {
          find: /^.*\/runtime-env\.ts$/,
          replacement: fileURLToPath(new URL('./lib/runtime-env.worker.ts', import.meta.url)),
        },
        {
          find: /^.*\/account-db\.ts$/,
          replacement: fileURLToPath(new URL('./lib/account-db.worker.ts', import.meta.url)),
        },
        {
          find: './score-cache.ts',
          replacement: fileURLToPath(new URL('./lib/score-cache.worker.ts', import.meta.url)),
        },
      ],
    },
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        config: {
          main: 'vinext/server/fetch-handler',
          compatibility_flags: ['nodejs_compat'],
          d1_databases: [
            {
              binding: 'DB',
              database_name: 'feeder-accounts',
              database_id: 'local-feeder-accounts',
              migrations_dir: 'drizzle',
            },
          ],
        },
      }),
    ],
  };
});
