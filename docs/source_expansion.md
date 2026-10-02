# 免费来源与社交平台扩展评估

核验日期：2026-10-02（America/Los_Angeles）。本次实现免费学术检索；社交平台仅评估，尚未新增采集器。

## 已实现的学术方案

- **Semantic Scholar**：官方 bulk paper search，无需账号或 key 即可使用；支持兴趣检索、作者、摘要、DOI 和发表日期。匿名容量共享，可能限流。[官方说明](https://webflow.semanticscholar.org/product/api)
- **Crossref**：公开 DOI 元数据与 bibliographic search，无需注册；补充期刊、会议、书籍等研究记录，部分记录无摘要。[官方文档](https://www.crossref.org/documentation/retrieve-metadata/rest-api/)
- **arXiv**：沿用现有采集器。
- **Google Scholar / SerpApi**：保留兼容入口，仅显式选择时调用。批量采集使用免费来源，不会自动消耗 SerpApi 配额，也不会在免费接口故障时切换到付费调用。

在当前 Windows 电脑上，通过新采集器用 Robotics 和 Computer vision 进行真实网络测试，两种免费来源均返回 20 条记录、状态为 live、无 warnings。免费的是检索与元数据访问，论文全文的开放程度取决于出版方；这些来源的覆盖与排序不等于 Google Scholar。现有 Jev 评分配置与展示门槛保持原有行为。

OpenAlex 也有免费额度，但目前采用按量定价：免费账号每日有 1 美元 API 额度，超额使用需付费。因此本次选择无需付费 key 的 Semantic Scholar 与 Crossref 作为默认入口。[OpenAlex 当前定价](https://help.openalex.org/access/pricing/)

## 社交平台建议

下列优先级是依据当前接口能力、项目的兴趣发现功能和本机连通性作出的工程判断；一次成功请求不代表长期可用性。

| 优先级 | 平台 | 可扩展内容与接口 | 本机实测 | 接入时的边界 |
| --- | --- | --- | --- | --- |
| 1 | DEV.to / Forem | 公开技术文章、讨论与标签；`GET /api/articles?tag=ai` | 无 key，HTTP 200，返回 2 条样本 | 适合 AI/编程兴趣；兴趣词需映射到平台标签，不是任意全文搜索；按页缓存与去重 |
| 2 | Mastodon | 实例内公开话题流；`GET /api/v1/timelines/tag/robotics` | mastodon.social 无 key，HTTP 200，返回 2 条样本 | 覆盖取决于实例可见内容；实例可以关闭匿名访问，需要固定实例与明确的鉴权状态 |
| 3 | Bluesky | 指定公开作者动态；`app.bsky.feed.getAuthorFeed` | bsky.app 作者流 HTTP 200，返回 2 条样本；同主机 `searchPosts?q=robotics` 返回 HTTP 403 | 可先做作者订阅或公开链接导入；关键词搜索需要单独验证可用入口/官方鉴权，不能承诺免登录全站搜索 |

依据：[Forem 官方文章 API](https://developers.forem.com/api/v1#tag/articles/operation/getArticles)、[Mastodon 官方时间线 API](https://docs.joinmastodon.org/methods/timelines/)、[Bluesky 官方 API 路由说明](https://github.com/bluesky-social/bsky-docs/blob/main/docs/advanced-guides/api-directory.mdx)。

下一阶段建议先接 DEV.to 的标签文章，再接 Mastodon 的话题流；Bluesky 先支持作者流。每个平台复用现有 `HarvestItem`、来源健康状态、兴趣过滤、去重及收藏链路，保留真实 provenance。实例型来源应只访问经验证的公开 HTTPS 主机，避免把任意 URL 当成服务器抓取入口。
