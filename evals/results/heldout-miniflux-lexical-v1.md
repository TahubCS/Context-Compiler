# Retrieval eval: heldout-miniflux-lexical-v1

Base URL: `http://127.0.0.1:3100` · k = 5 · 2026-10-14T20:55:47.127Z

| Dataset | Layout | Questions | Hit@5 | Recall@5 | MRR | Pack recall | Pack tokens | Latency |
|---|---|---|---|---|---|---|---|---|
| miniflux | Go service (internal/ packages) | 22 | 77% | 75% | 0.63 | 75% | 6627 | 378 ms |
| **overall** | | 22 | 77% | 75% | 0.63 | 75% | 6627 | 378 ms |

## By question kind

| Kind | Questions | Hit@5 | Recall@5 | MRR |
|---|---|---|---|---|
| nl | 21 | 81% | 79% | 0.66 |
| task | 1 | 0% | 0% | 0.00 |

## Misses (expected file not in the top 5)

- **miniflux-02** "Where is HTML from feed entries sanitized?" expected `internal/reader/sanitizer/sanitizer.go`; got `contrib/bruno/miniflux/Get feed entries.bru`, `internal/ui/feed_entries.go`, `internal/ui/feed_entries_all.go`, `internal/ui/entry_feed.go`, `internal/ui/category_entries.go`
- **miniflux-05** "How does the background scheduler refresh feeds?" expected `internal/cli/scheduler.go`, `internal/worker/worker.go`; got `internal/cli/scheduler.go`, `internal/ui/feed_refresh.go`, `internal/ui/category_refresh.go`, `internal/model/feed.go`, `internal/cli/refresh_feeds.go`
- **miniflux-13** "How are entries queried with filters like status, category and search text?" expected `internal/storage/entry_query_builder.go`; got `internal/template/templates/views/search.html`, `internal/template/templates/views/category_entries.html`, `internal/ui/entry_update_status.go`, `contrib/bruno/miniflux/Get category entries.bru`, `contrib/bruno/miniflux/Update entries status.bru`
- **miniflux-15** "How are images proxied to protect reader privacy?" expected `internal/mediaproxy/rewriter.go`; got `internal/reader/rss/rss.go`, `internal/reader/rewrite/content_rewrite_rules.go`, `internal/reader/itunes/itunes.go`, `internal/reader/icon/finder.go`, `internal/reader/json/json.go`
- **miniflux-21** "How is a single feed refreshed and its new entries stored?" expected `internal/reader/handler/handler.go`; got `internal/storage/entry.go`, `internal/ui/feed_refresh.go`, `internal/ui/category_refresh.go`, `contrib/bruno/miniflux/Refresh a single feed.bru`, `internal/storage/feed.go`
- **miniflux-22** "Add a new integration that posts entries to Mastodon" expected `internal/integration/integration.go`; got `internal/integration/discord/discord.go`, `internal/integration/slack/slack.go`, `internal/integration/apprise/apprise.go`, `internal/integration/wallabag/wallabag.go`, `internal/integration/ntfy/ntfy.go`
