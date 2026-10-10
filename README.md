# Feed Gardener

**A local-first workspace for discovering, filtering, and saving public content around your interests.**

Feed Gardener brings results from multiple public sources into one feed. You choose the topics and exclusions; the app fetches candidates on demand, explains why items appear, and keeps your reading list and feedback locally. Optional Jev scoring filters titles by a minimum relevance score. It does not change recommendations or activity on the source platforms.

> The browser interface currently uses the name **Feeder**.

## Features

- **Cross-source discovery:** Browse public results from arXiv, GitHub, Hacker News, and Bilibili. YouTube search and Google Scholar are available when their API keys are configured.
- **Explicit controls:** Select interests, block topics or sources, and set a minimum Jev title-relevance score from 1 to 10. Items need at least 70% scoring confidence to appear in the scored feed.
- **Transparent results:** Inspect an item's source and the interest, source, and freshness signals behind its placement. Missing scores and source errors are shown rather than filled in.
- **Local feedback and library:** Save links for later, hide or reject feed items, undo feedback, and organize saved resources with notes and reading status.
- **Separate CLI:** Use the same domain logic from the command line with its own local state.

Jev evaluates **titles**, not full articles or videos. Its score is a Feed Gardener relevance estimate, not a quality judgment or a score from the source platform.

## Quick start

**Requirements:** Node.js 22.13+ and pnpm 11.19.

```sh
git clone https://github.com/GradibelPitt/feed-gardener-project-pack.git
cd feed-gardener-project-pack
pnpm install --frozen-lockfile
pnpm dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). On macOS or Windows, you can use `Launch.command` or `Launch.bat` instead; the launchers install missing dependencies, build, and start the app.

The workspace opens directly. In **Discover → Manage interests**, choose topics or enter your own. Then fetch public sources from **Discover**. The local library and preferences do not require an account or database.

### Optional integrations

Copy [`.env.example`](.env.example) to `.env.local` and add only the credentials you need:

| Variable | Enables |
| --- | --- |
| `TYPESAFE_API_KEY` | Jev title scoring and the relevance-filtered feed |
| `YOUTUBE_API_KEY` | Public YouTube video search |
| `SERPAPI_API_KEY` | Google Scholar search through SerpApi |
| `GITHUB_TOKEN` | A higher GitHub Search API rate limit |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional read-only YouTube account connection |

YouTube and Google Scholar search keys can also be entered in their source views for the current local server session. See [`.env.example`](.env.example) for the full configuration list and the OAuth redirect URI. Without a Jev key, public-source browsing and the library remain available, but unscored items do not enter the relevance-filtered feed.

## Project layout

| Path | Purpose |
| --- | --- |
| [`app/`](app/) | Next.js pages and HTTP routes |
| [`components/`](components/) | Workspace and source UI |
| [`lib/`](lib/) | Feed logic, scoring, storage, and source adapters |
| [`cli/`](cli/) | Command-line interface |
| [`docs/`](docs/) | API contract and project notes |

## Development

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm cli -- help
```

The app is a local prototype. Public-source availability and result counts depend on the upstream services and configured keys. Recommendation quality has not been validated in a real-user study. Feedback in Feed Gardener affects only its local experience; the app does not read platform cookies, autoplay content, or write likes and subscriptions.

For implementation details, see the [API contract](docs/interface_contract.md) and [generated project structure](docs/project_structure.md).

## License

Feed Gardener is licensed under the [MIT License](LICENSE). Bundled third-party materials retain their own notices: [DM Sans (SIL Open Font License 1.1)](public/fonts/dmsans-OFL.txt) and the [TypeSafe AI skill (MIT)](.agents/skills/typesafe-ai/LICENSE).

## Star history

[![Star history chart for Feed Gardener](https://api.star-history.com/svg?repos=GradibelPitt/feed-gardener-project-pack&type=Date)](https://www.star-history.com/#GradibelPitt/feed-gardener-project-pack&Date)
