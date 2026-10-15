<div align="center">
  <img src="app/icon.svg" alt="Feed Gardener icon" width="72" height="72">
  <h1>Feed Gardener</h1>
  <p>
    <a href="https://feed-gardener.gradibel.chatgpt.site/#discover">Website</a> |
    <a href="#quick-start">Quick start</a> |
    <a href="LICENSE">License</a>
  </p>
</div>

**Find content around your interests, watch the moments that matter, and save what you want to revisit.**

Feed Gardener brings public sources into one local workspace. You choose the topics; it fetches results on demand, explains why they appear, and keeps your reading list and feedback on your device. The browser interface is called **Feeder**.

## What you can do

- **Explore one feed:** Browse results from arXiv, GitHub, Hacker News, and Bilibili. Add YouTube or Google Scholar with an API key.
- **Watch Shorts:** See short clips from YouTube videos matched to your interests, or search for a topic. Active clips play automatically when the browser allows it. Sound preference carries across clips, and compact icons let you save a video or open the full version.
- **Shape your feed:** Choose interests, block topics or sources, and see why an item appears. Optional Jev scoring helps filter titles by relevance.
- **Keep what matters:** Save links with notes and reading status. Hide or reject feed items, and undo feedback. Your library and preferences stay local.

Jev evaluates titles, not full articles or videos. Its score is a relevance estimate from Feed Gardener, not a source-platform rating.

## Quick start

**Requirements:** Node.js 22.13+ and pnpm 11.19.

```sh
git clone https://github.com/GradibelPitt/feed-gardener.git
cd feed-gardener
pnpm install --frozen-lockfile
pnpm dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000), choose interests in **Discover → Manage interests**, then browse **Discover** or **Shorts**. You can also start the app with `Launch.command` on macOS or `Launch.bat` on Windows.

The library and preferences work without an account or database. Shorts and YouTube search need a YouTube API key.

### Optional integrations

Copy [`.env.example`](.env.example) to `.env.local` and add only the credentials you need:

| Variable                                   | Enables                                            |
| ------------------------------------------ | -------------------------------------------------- |
| `TYPESAFE_API_KEY`                         | Optional Jev title scoring and relevance filtering |
| `YOUTUBE_API_KEY`                          | Public YouTube video search                        |
| `SERPAPI_API_KEY`                          | Google Scholar search through SerpApi              |
| `GITHUB_TOKEN`                             | A higher GitHub Search API rate limit              |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional read-only YouTube account connection      |

You can also enter YouTube and Google Scholar keys in their source views for the current local server session. See [`.env.example`](.env.example) for other settings. Without a Jev key, public-source browsing and the library still work.

## Development

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm cli -- help
```

Feed Gardener is a local prototype. Source availability depends on upstream services and configured keys. Your feedback changes only this app's feed; it does not change recommendations, likes, or subscriptions on the source platforms.

For implementation details, see the [API contract](docs/interface_contract.md) and [project structure](docs/project_structure.md).

## License

Feed Gardener is licensed under the [MIT License](LICENSE). Bundled third-party materials retain their own notices: [DM Sans (SIL Open Font License 1.1)](public/fonts/dmsans-OFL.txt) and the [TypeSafe AI skill (MIT)](.agents/skills/typesafe-ai/LICENSE).
