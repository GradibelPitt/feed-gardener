# Feed Gardener 接口合同

CLI 直接调用现有 `lib/` 领域函数，命令行参数不是 HTTP API。CLI 不增加 Route、adapter 或另一份 HTTP 响应合同；其 Agent 计划、评分和评估与现有 Route 共用领域类型与校验。CLI 本地数据文件只存用户偏好、收藏、资源和模拟状态，不接收或保存平台凭据。

合同版本：`feed-gardener-api/2`  
代码唯一注册表：[`lib/api-contract.ts`](../lib/api-contract.ts)

本文件是公开接口目录与治理入口。它描述当前仓库实际存在的接口，不代表真实社交平台账号能力已经可用。

新产品方向见 [`feeder_product_goal.md`](feeder_product_goal.md)：Feeder 主页面复用 `GET /api/harvest` 的真实候选与 `POST /api/agent/v1/decisions/preview` 的 Jev 标题相关度分数，构建用户选择 1–10 目标均分的模拟 Feed；没有新增 HTTP Route。旧动作字段仅为预览兼容，主 Feed 不按 `watch_candidate` 执行任何平台操作。不能将 `executionAuthorization: none` 解释成播放或点赞授权。

`GET /api/harvest` 向后兼容地接受最多两个 `tag` 查询参数，作为配置了服务端 `YOUTUBE_API_KEY` 时的官方 YouTube `search.list` 主题查询。程序从搜索结果取得视频链接，再用 `videos.list(part=status)` 确认可嵌入且非 Made for Kids 后转换为隐私增强模式的官方播放器地址；视频卡片先显示 API 标题和封面，用户点击播放后才加载播放器，不自动播放。状态不满足时只显示 API 标题、封面及回源链接。未配置时 `health` 报 `configuration_required`，不伪造视频。搜索结果不传给 Jev，也不计入均分，因为 [YouTube 开发者政策](https://developers.google.com/youtube/terms/developer-policies)限制用 API 数据生成衍生评分。数据只在既有五分钟内存缓存中；不抓取 YouTube 页面或账号首页。

服务端调用 Google API 时通过 `x-goog-api-key` 请求头传递密钥，不将密钥写入请求 URL。

Bilibili 复用 `GET /api/harvest` 的 `source=Bilibili` 和 `tag` 参数；可选、按位置对应的 `tagZh` 参数提供最多两个中文对照。服务端也会把内置标签的英文名映射到已有中文名，对每个兴趣并行请求中英文公开搜索，按 BV 号去重。只读取公开搜索元数据，不读取账号、Cookie 或播放流。卡片显示封面、标题、UP 主、公开标签和 Bilibili 官方外链播放器；播放器仅在用户点击后加载。Bilibili 卡片可进入 Feeder 候选与 Jev 标题评分；评分输入把中英文同义名称写在同一个兴趣项中。公开搜索接口可能限制请求；失败时 `health` 显示来源错误，其他来源继续工作。

`GET /api/harvest` 还可选传单个 `source`，取值为来源名 `Semantic Scholar`、`Crossref`、`arXiv`、`Google Scholar`、`GitHub`、`Hacker News`、`YouTube`、`Bilibili`、`TikTok`、`X` 或 `Instagram`。缺失时保留原批量行为；指定时只运行该来源已有的采集器，返回相同的 `sections` / `health` / `warnings` 形状。TikTok、X、Instagram 不支持无链接的搜索，因此该参数只返回能力状态，不请求外部平台；单条公开 URL 仍用既有 `POST /api/social/resolve`。无效来源返回 400。来源与标签共同构成五分钟缓存键；`refresh=true` 仍强制刷新。前端进入页面和切换板块不调用采集，点击来源按钮或手动刷新才调用。

`PUT /api/harvest` 是同一采集资源的本机 YouTube 搜索配置操作，接收 JSON `{ "source": "YouTube", "apiKey": "..." }`。只接受本机同源请求与 20–256 个安全字符的 key；返回 `{ "configured": true }`，永不回传 key。传入空字符串 `apiKey: ""` 会清除本次进程的搜索 key 并返回 `{ "configured": false }`；若有环境变量 key，也会暂时禁用搜索，重启后恢复环境变量配置。网页以密码框提交，成功后清空输入并通过 `GET /api/harvest?source=YouTube&refresh=true` 搜索已选主题。key 仅留在本机服务进程内存，不写 localStorage、CLI 文件、磁盘或日志；重启即失效。环境变量 `YOUTUBE_API_KEY` 仍兼容；网页输入在本次进程中覆盖它。配置变更使旧的 YouTube 采集缓存失效。此 key 与 YouTube OAuth 账号连接无关。

免费学术检索支持 `GET /api/harvest?source=Semantic+Scholar&tag=...` 和 `source=Crossref`，无需 key。缺省批量采集在有兴趣时包含两者。Semantic Scholar 使用 bulk search，以 OR 合并最多两个兴趣并按发表时间排序；Crossref 使用包含这些兴趣的 bibliographic relevance query。各来源最多返回 20 条规范化记录，真实来源名与 `official_api` provenance 保留；DOI 统一后去重，只有完整合法日期才写入 `publishedAt`。无兴趣返回 `limited`；429 进入至少 60 秒且遵守 Retry-After 的冷却，失败状态可见。每个提供商至多一个在途请求，请求间隔至少一秒，沿用五分钟结果缓存。

Google Scholar 复用 `GET /api/harvest?source=Google+Scholar&tag=...`，使用服务端 `SERPAPI_API_KEY` 调用 [SerpApi Google Scholar API](https://serpapi.com/google-scholar-api)。最多两个兴趣以 OR 合并为一次查询，最多返回 20 条，排除纯引用记录；仅显式指定该来源时调用，批量采集不消耗 SerpApi 配额。无 key 返回 `configuration_required`，无兴趣返回 `limited`，请求失败返回来源错误。结果来源为 `Google Scholar`，provenance 为 `public_api`，仅保留不含 key 的 SerpApi endpoint；只接收 HTTP(S) 论文链接，缺少完整日期时 `publishedAt` 为 null。

`PUT /api/harvest` 同时接受 `{ "source": "Google Scholar", "apiKey": "..." }`，沿用本机同源、长度与字符校验、清空禁用、内存覆盖与不回传 key 的规则；非法 Scholar key 返回 `INVALID_SCHOLAR_KEY`。修改 Scholar key 使采集缓存失效。SerpApi 按其接口要求在服务端 HTTPS 请求参数中接收 key，响应中的搜索 URL、请求详情与原始错误不得进入前端响应或日志。

## 统一包络

成功响应：

```json
{
  "data": {},
  "meta": { "contractVersion": "feed-gardener-api/2" }
}
```

失败响应：

```json
{
  "error": {
    "code": "STABLE_MACHINE_CODE",
    "message": "Human-readable explanation.",
    "retryable": false,
    "details": {}
  },
  "meta": { "contractVersion": "feed-gardener-api/2" }
}
```

所有响应同时包含 `X-Feed-Gardener-Contract` header。`details` 可选；程序只能依赖稳定的 `code`、HTTP 状态和 schema，不能依赖本地化文案。

## 当前接口注册表

### YouTube 连接扩展（2026-09-21 已实现，真实授权待配置）

已搜索现有注册表、Route、Garden/Connections 页面和测试；现有 preview、plan、harvest 均不承担用户会话授权，不能混入 OAuth 副作用。新增一个连接资源及 Google 必需的回调路径；调用方为共享 YouTube 连接组件。现有 API v2 包络和其他调用方保持兼容，无旧连接数据需要迁移。

- `GET /api/connections/youtube`：返回配置状态、连接状态、经官方 `channels.list(mine=true)` 核验的频道和到期时间；不返回 token。上游验证失败不显示成功。
- `POST /api/connections/youtube`：同源校验且请求必须为 `{ acceptedPrivacy: true }`；创建十分钟、一次性、绑定浏览器的 state 与 PKCE，返回 Google 授权 URL，仅请求 `youtube.readonly`。缺少配置 503，来源错误 403，未同意 422。
- `DELETE /api/connections/youtube`：同源断开；尝试向 Google 撤销 token 并删除本地会话。撤销失败明确返回 `revoked: false` 与 Google 权限管理入口，不能声称远端已撤销。
- `GET /api/connections/youtube/callback`：Google 浏览器回调，一次性 state + 浏览器 Cookie + PKCE 验证后换取 token、核验 scope、读取频道并轮换会话 ID；安全固定结果码通过 303 返回工作台。回调仍用公共包络/合同 header，附 Location，浏览器自动跟随。拒绝、过期、身份缺失和上游失败都不会新建已连接会话。

授权码与 access token 只在服务器内存中，最长一小时或 provider 更短期限，到期/重启要求重连；无 refresh token、数据库、模型传递或 CLI 同步。仅适用于当前单进程本地部署；多实例部署需先补齐共享会话存储合同。所有连接响应 no-store，Cookie HttpOnly/SameSite=Lax，HTTPS 下 Secure；写入口做严格 Origin 校验，回调禁止请求日志和 referrer 外泄。测试覆盖上述失败模式、过期、复用与凭据不外泄。未来弃用须同步注册表、组件和 Google 已登记 redirect URI。

| 名称 | 方法与路径 | 职责 | 当前边界 |
|---|---|---|---|
| `capabilities` | `GET /api/agent/v1/capabilities` | 返回当前 Agent 接口、模式和平台能力 | 每次 run 前重新读取；不是授权 |
| `createPlan` | `POST /api/agent/v1/plans` | 编译有目标、预算和策略的计划 | YouTube/Bilibili 当前返回 policy blocked |
| `analyzeObservation` | `POST /api/agent/v1/observations/analyze` | 分析有限的可见文本/截图 | 只观察，不执行；provider 未配置则 503 |
| `previewDecision` | `POST /api/agent/v1/decisions/preview` | 接收标题与用户 tags，Jev 评分后由程序映射候选动作 | 1–10 分标题相关度；不执行播放；无评分则待复核 |
| `previewEvaluation` | `POST /api/agent/v1/evaluations/preview` | 计算基线/后测 tag 出现率与排名变化 | 观察关联，不是因果或平台权重 |
| `harvestPublicSources` | `GET /api/harvest` | 聚合允许的公开元数据来源 | 不登录、不读取 Cookie、不读取私人 feed |
| `configureYouTubeSearch` | `PUT /api/harvest` | 为当前本机进程设置 YouTube 搜索 key | 同源、本机、只在内存、响应不回传 key |
| `resolveSocialUrl` | `POST /api/social/resolve` | 解析用户提供的单条允许域公开链接 | HTTPS 与 host allowlist；不是搜索接口 |
| `suggestTags` | `POST /api/tags/suggest` | 合并内置目录与公开 GitHub topic 候选；`fresh: true` 可强制重查，`excludeTerms` 排除主题，`retrievedAt` 标记联网时间 | 候选不会自动写入用户偏好；My garden 的 Nearby topics 只展示可核验的 live 主题名称与更新时间，失败时不显示内置候选 |
| `youtubeConnection` | `GET /api/connections/youtube` | 读取配置与经核验的频道身份 | 只读，token 不出服务端 |
| `connectYouTube` | `POST /api/connections/youtube` | 发起 Google 只读授权 | 同源、明确同意、state/PKCE |
| `disconnectYouTube` | `DELETE /api/connections/youtube` | 断开并请求 Google 撤销 | 区分本地删除与远端撤销 |
| `youtubeCallback` | `GET /api/connections/youtube/callback` | 验证 Google 回调并建立短时会话 | 固定 303 返回工作台，不授权点赞 |

运行时路径与方法以代码注册表为准；本表发生差异即视为文档缺陷，必须在同一变更中修复。

## 强制治理流程

### 先复用现有接口

每个需求开始时先检索注册表、Route、调用方和测试。已有接口能表达时必须复用；语义接近时优先兼容性扩展现有接口。非必要绝不创建新 endpoint、同义 adapter 或仅供单页使用的重复合同。

只有同时满足以下条件才可新增：

- 已记录为什么所有现有接口都无法复用或合理修改；
- 有明确调用方和长期职责，而非临时 UI 便利；
- 输入、输出、身份、actor、权限、同意、预算、失败模式和重试语义清楚；
- 已加入 `API_INTERFACES`，使用统一包络并补齐测试；
- 本文件与所有调用方在同一变更中更新。

### 修改现有接口

- 优先添加向后兼容字段，不复制新路径。
- 字段含义不得静默改变；枚举新增值时调用方必须有安全 fallback。
- 删除、重命名或改变类型属于破坏性变更，必须升级合同版本并提供迁移或明确的同时切换。
- Route 不得返回自定义顶层错误形状；使用 `apiSuccess` / `apiError`。
- 前端和内部调用方使用 `readApiData`，不重复编写解包规则。
- `agent` 行为永远不能伪装成 `user` 反馈；平台 capability、用户 consent 和真实 verification 是独立字段。

## 兴趣目录的兼容扩展

首次引导复用 `lib/feed.ts` 的 domain/tag 与 `Preferences`，没有新增 HTTP 接口。检索过注册表、`suggestTags` Route、正式偏好编辑器、持久化读取和 feed/tag-suggestions 测试后，在原目录上增加生活类领域；原技术领域和 tag ID 保留。`interestCategories` 仅为同一目录提供一级导航分组，展开后的 `domains` 继续供原调用方使用，不维护另一套可选 tag。

引导最终只存储用户实际选择的 tag，领域 ID 从这些 tag 推导；排除项不能与喜欢项重复。旧本地资料无需迁移，现有读取器仍会丢弃未知 ID。扩展不增加外部采集能力；没有内容匹配时允许结果为空。唯一性、分组引用、旧 ID 兼容和非技术偏好不误配技术样例由 `lib/feed.test.ts` 验证。

`Preferences.onlySelectedTags` 为本地可选布尔字段，旧资料缺失时按 `false` 读取；首次引导跳过排除步骤时设为 `true`。发现页、Garden 控制台和偏好编辑器共用此开关：开启后必须至少匹配一个已选 tag，同领域其他 tag 与探索范围不能绕过它；额外携带未选 tag 不构成排除，但显式排除项始终优先。关闭后恢复既有领域/探索规则，保留原探索配置。资源库不因此隐藏已有收藏。公开源仅按元数据 tags 与目录 ID/中英文标签的规范化精确匹配过滤，并兼容既有采集器的 `Agent` → `agents` 别名；未标注的内容不猜测相关性。此筛选规则不以 Jev 分数作为准入条件，也不执行原生平台操作。复用既有采集响应和本地偏好，不增加 HTTP 接口；浏览器持久化、候选过滤和开关交互分别验证。

## 本地资源库的分类与粘贴链接

资源库功能复用浏览器本地 `ResourceRecord` 与现有 `resources` 持久化字段；检索过 `lib/api-contract.ts`、现有 Route、`app/page.tsx`、`components/SourceBoards.tsx` 和资源库测试后，没有增加 HTTP 接口。网站分类由 URL 域名派生；类型分类存储为可修改的 `resourceType`，旧记录读取时按 URL 与来源推断。用户粘贴的 HTTP(S) 链接直接在本地生成条目，不调用 `resolveSocialUrl`，也不抓取第三方页面。该 Route 的允许域限制仍只用于公开帖子元数据解析，与本地收藏无关。非法 URL 和重复链接不能加入收藏。

“稍后阅读”作为资源库下的次级视图，复用同一份收藏记录；旧的 `page=saved` 本地状态仍会打开这个视图。命名收藏夹存于独立的 `feed-gardener-collections-v1` 本地字段，资源条目用可选 `collectionId` 归档；旧收藏的 `collectionId: null` 在界面显示为“Default”。新建收藏夹可以留空名称，此时依次使用 `default folder 1`、`default folder 2` 等名称；用户仍可填写或修改名称。没有可选命名收藏夹时，粘贴链接归入 Default（`collectionId: null`）。删除收藏夹时，其中的资源回到 Default，资源本身不会被删除。粘贴链接时自动推断类型；卡片的收藏夹、类型修正、知识状态、笔记和移除操作仅在“编辑”展开后显示。已收藏的视频保留封面与可播放地址；旧 Bilibili 收藏从视频链接恢复播放地址，旧 YouTube 收藏从视频 ID 恢复缩略图，播放器仍只在用户点击后加载。

## HTTP 状态约定

| 状态 | 用途 |
|---|---|
| `200` | 成功读取或计算 |
| `201` | 成功创建计划/资源 |
| `400` | JSON 或请求语法无效 |
| `401` | 未认证 |
| `403` | 已认证但无权限或同意 |
| `409` | 当前状态冲突、版本冲突或策略阻塞 |
| `422` | schema 可解析但业务输入无效 |
| `429` | 配额或速率限制 |
| `502` | 上游失败 |
| `503` | 所需 provider/capability 未配置或暂不可用 |

`retryable` 必须按实际失败语义填写；不能仅凭 5xx 一律无限重试。

## 完成检查

接口变更需通过：注册表唯一性、统一包络测试、领域逻辑测试、调用方类型检查、生产构建和 HTTP 成功/失败 smoke test。写出接口合同只证明本项目的调用方式稳定，不证明外部平台允许或真实执行成功。

## Jev 标题评分与程序动作（2026-09-21）

已搜索注册表、全部 Route、调用方与测试；复用 `previewDecision`，不新增 endpoint 或 adapter。主 Feed 与 Discover → Sources 的可见公开结果复用此 API 的 Jev 标题评分。Sources 每张结果卡显示评分中、实际 1–10 分或明确的不可用状态，失败时可重试；同一标题与兴趣组合在当前页面内复用评分。YouTube API 搜索结果不送 Jev，见上文政策边界。采集独立于评分；真实播放 Runner 尚未接入。

请求继续支持 `{ platform, videoTitle, goalTags, remainingVideoBudget, remainingMinuteBudget, provider? }`；为 Feeder 兼容扩展 `platform: "feeder"` 时改用 `contentTitle`，其余字段与旧合同相同。标题 1–1000 字符，用户选定 tags 1–12 项、每项 1–80 字符，预算必须显式提供；`provider` 可为 `auto`（默认）、`jev`、`deterministic`。主 Feed 固定请求 `jev`，仅取 `relevanceScore`、`confidence` 和 `provider`，不取旧动作。标题评分不等于内容核验。

程序向 Jev 只发送标题和用户 tags，提出唯一 `target_relevance` Score 问题，使用十条相关度描述。依照 [官方 Score 合同](https://docs.typesafe.ai/primitives/score)，返回范围是 0–9（允许小数），程序加 1 得到 `relevanceScore` 1–10，保留小数。多 tags 按与任一选定 tag 的相关度评分，不代表每个 tag 都匹配。

评分题对**每个已选兴趣**采用相同准则：先从标题判断主要主题，再按标题证据最充分的那个已选兴趣评分；不能把搜索词命中、来源、未传入的简介/平台标签、可能的用途或制作方式当作主题证据。标题主要讲其他主题时，即使偶然含有所选词语、同词异义或与兴趣存在想象中的联系，也应在低档；宽泛兴趣同样需要明确的标题证据。混合主题按所选兴趣在标题中的主次评分，标题模糊时不能给高分。这适用于 AI、体育、音乐、影视等全部兴趣，而非只为某个标题设置例外。接口仍只问一道 Jev Score 题，不传输视频内容或平台标签，也不由程序伪造或强行改写 Jev 返回分数。

Feeder 标题评分在服务端有六小时本地 SQLite 缓存，网页与 CLI 复用同一份分数。键由标题、规范化后的 tags、请求模型名与评分 rubric 版本生成 SHA-256；数据库只存哈希、分数、置信度、返回模型与时间，不存标题或原始 tags。缓存只用于 `platform: "feeder"` 且 Jev 已配置的成功评分；无 key、上游失败及其他平台的决策均不命中。缓存读取或写入失败时继续正常调用 Jev。每次响应仍按本次预算与置信度重新执行程序策略，不复用旧动作。默认路径为 `.data/scores.db`，可由 `FEEDER_SCORE_DB` 覆盖；请求与响应合同不变。

通用标题证据准则使用 rubric 版本 4：旧版本的缓存行保留到过期，但不会命中新评分请求。HTTP 请求与响应字段未改变。

程序策略：分数 ≤3 跳过，≥7 为观看候选，3–7 之间待复核。置信度 <0.70 或剩余预算不足一个视频/一分钟时强制复核。阈值是本项目默认策略，尚未用真实标注视频校准，不是 Jev 的动作建议或平台权重。

响应保持 `{ data: { decision, boundary }, meta }`。`decision` 返回 `action`、`provider`、可选 `model`、`relevanceScore`、`confidence`、`evidenceBasis: title_only`、`policyOverrides`、`executionAuthorization: none`、`requiresRunnerValidation: true`。无 key 的 `auto` 和显式 `deterministic` 返回空分数/空置信度与复核动作，不制造语义评分。显式 `jev` 无 key 返回 503；坏输入返回 422；超时、上游失败、缺字段、非数值或越界评分返回 502，不产生动作结果，也不静默降级。所有平台动作仍须独立身份、同意、预算和许可核验，不能把 Agent 动作写成用户偏好。

迁移：统一 HTTP 包络版本从 `feed-gardener-api/1` 升为 `/2`，URL 保留原 `/api/agent/v1/...` 命名空间；计划的 Agent 合同版本未改变。旧 `analysis` 必填请求改为显式 `videoTitle` 与预算，停止支持仅 summary 的决策请求；删除 `modelRecommendation`、动作 `probabilities`、0–2 的 `targetRelevance`、`evidenceSufficientProbability`，调用方应读取 `relevanceScore` 与程序生成的 `action`。当前仓库没有执行调用方；Route 与测试同时切换。旧观察/决策流程的外接调用方必须按本节迁移后再接入。

测试覆盖评分边界、小数、低置信度、预算、无 key、非法响应、上游失败、标题与 tags 的最小请求和模型动作字段无效。2026-09-21 已用真实 TypeSafe key 与公开视频标题验证 Jev 评分；YouTube 自动采集和播放、账号状态及推荐效果未验证。当前合同只接收 `goalTags`，没有 `blockedTags`，因此不能称为完整的偏好执行合同。
