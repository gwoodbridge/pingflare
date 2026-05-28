# Changelog

## [1.3.3] - 2026-05-28

### Added
- **DNS Providers**: Adds a public DNS list normalization for improved data processing

## [1.3.2] - 2026-05-28

### Fixed
- **Migration**: Revert ensureScheme to fix auto migration database on Cloudflare Worker + D1

## [1.3.1] - 2026-05-28

### Fixed
- **Migration**: Fixing auto migration database on Cloudflare Worker + D1

## [1.3.0] - 2026-05-28

### Added
- **DNS over HTTPS (DoH) monitor type**: New monitor type `dns` checks if a DNS resolver is responding and resolving correctly by querying any RFC 8484-compliant DoH endpoint (e.g. `https://freedns.controld.com/p0`, `https://1.1.1.1/dns-query`, `https://dns.google/resolve`)
- **Configurable record type**: Supports any DNS record type (`A`, `AAAA`, `MX`, `CNAME`, `TXT`, `NS`, etc.) via the `dnsRecordType` field

### Tests
- Added 15 new Vitest tests for `checkDns()` covering NOERROR, NXDOMAIN, SERVFAIL, REFUSED, unknown RCODE, DoH HTTP errors, expected-IP validation, timeout, network errors, and query URL construction

---

## [1.2.0] - 2026-05-28

### Performance
- **SQL aggregation**: Uptime and daily stats in `/api/monitors/:id/uptime`, `/api/monitors/:id/daily`, and public status pages are now computed in SQL
- **Database indexes**: Added composite index, dramatically speeding up history queries and the retention cleanup DELETE
- **Cron concurrency cap**: Monitor checks are now batched in groups of 10 (`CONCURRENCY = 10`) instead of firing all at once, keeping D1 write operations well within the free-tier rate limit (100k writes/day)
- **HTTP caching on status pages**: Public status page endpoints now return `Cache-Control: public, max-age=30, stale-while-revalidate=60`, reducing D1 load under traffic
- **Cloudflare origin cache**: `getWorkerOrigin()` result (colo/country/IP) is cached in module scope for 5 minutes, was fetching `1.1.1.1/cdn-cgi/trace` on every cron tick
- **Observability sampling**: Reduced `head_sampling_rate` from 100% to 10% in `wrangler.toml`, preventing log-ingest quota exhaustion at 1-minute cron cadence
- **Retention cleanup**: Log retention DELETE now runs at most once per hour (was running every cron tick even when nothing was due)

### Fixed
- **Scheduling cursor decoupled from alerts**: `lastCheckedAt` is now advanced immediately after writing `status_logs`, before `processAlert` runs, a failed alert channel no longer causes a monitor to be re-checked on every subsequent cron tick
- **Backup restore atomicity**: `/api/backup/restore` now validates the entire payload before deleting any data; rejects payloads larger than 512 KB with HTTP 413
- **Schema migration moved out of request path**: `ensureSchema` is no longer called on every incoming request in the Cloudflare Workers entrypoint, migrations run at deploy time via `wrangler d1 migrations apply`
- **SQLite shim `raw()` bug**: `ShimStatement.raw()` was calling `raw(true)` on one `Database.Statement` instance and then running `.all()` on a different instance (due to the `stmt` getter creating a new prepared statement on each access), causing `db.select()` queries with custom fields to return object rows instead of arrays and breaking all SQL aggregation in the Node.js/Docker runtime

### Tests
- Added full Vitest test suite (`src/test/`) covering cron scheduling logic, backup export/restore, history API (logs, uptime, daily aggregation, incidents), and public status pages
- Tests run against an in-memory SQLite database via the D1 shim, no network or external dependencies required

---

## [1.1.0] - 2026-05-13

### Added
- **Multi-backend support**: Pingflare can now run as a standalone Node.js server in addition to Cloudflare Workers, enabling self-hosted deployments via Docker or Fly.io
- **Docker support**: Added `Dockerfile` and `compose.yml` for containerized deployments
- **Fly.io support**: Added `fly.toml` configuration for Fly.io deployments

### Fixed
- Corrected CLI argument parsing in the Node.js server (`src/server.ts`)
- Fixed D1 and SQLite compatibility issues in the database shim
- Fixed `npm ci` call in Dockerfile (was incorrectly using `install`)

### Docs
- Expanded README with deployment instructions for Docker, Fly.io, and self-hosted Node.js setups

### Chores
- Bumped package version and updated `package-lock.json`
- Updated CI/CD workflows to support multi-deployment targets

---

## [1.0.1] - 2026-05-13

Initial stable release with Cloudflare Workers deployment, Hono backend, SvelteKit frontend, and Google Chat notification support.
