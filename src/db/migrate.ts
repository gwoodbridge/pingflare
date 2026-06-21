let migrated = false

/** For use in tests only, resets the migration flag so a fresh in-memory DB can be initialized. */
export function resetMigratedFlag(): void {
  migrated = false
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS monitors (
  id text PRIMARY KEY NOT NULL,
  name text NOT NULL,
  type text NOT NULL,
  tags text DEFAULT '[]' NOT NULL,
  interval integer DEFAULT 60 NOT NULL,
  active integer DEFAULT true NOT NULL,
  last_checked_at integer,
  last_status text DEFAULT 'pending' NOT NULL,
  reminder_interval_hours integer,
  callbacks_enabled integer DEFAULT false NOT NULL,
  tolerance_failures integer DEFAULT 1 NOT NULL,
  url text,
  method text DEFAULT 'GET' NOT NULL,
  body text,
  headers text DEFAULT '{}' NOT NULL,
  expected_status integer DEFAULT 200 NOT NULL,
  follow_redirects integer DEFAULT true NOT NULL,
  timeout integer DEFAULT 30 NOT NULL,
  ip_version text DEFAULT 'auto' NOT NULL,
  auth_type text DEFAULT 'none' NOT NULL,
  auth_username text,
  auth_password text,
  auth_token text,
  heartbeat_interval integer,
  heartbeat_grace integer DEFAULT 30 NOT NULL,
  tolerance_missed integer DEFAULT 1 NOT NULL,
  surge_protection_limit integer,
  created_at integer DEFAULT (unixepoch()) NOT NULL,
  updated_at integer DEFAULT (unixepoch()) NOT NULL
);

CREATE TABLE IF NOT EXISTS status_logs (
  id text PRIMARY KEY NOT NULL,
  monitor_id text NOT NULL,
  status text NOT NULL,
  message text,
  response_time_ms integer,
  checked_at integer NOT NULL,
  FOREIGN KEY (monitor_id) REFERENCES monitors(id) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS incidents (
  id text PRIMARY KEY NOT NULL,
  monitor_id text NOT NULL,
  started_at integer NOT NULL,
  resolved_at integer,
  duration_seconds integer,
  FOREIGN KEY (monitor_id) REFERENCES monitors(id) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS notification_channels (
  id text PRIMARY KEY NOT NULL,
  name text NOT NULL,
  type text NOT NULL,
  config text DEFAULT '{}' NOT NULL,
  active integer DEFAULT true NOT NULL,
  is_default integer DEFAULT false NOT NULL,
  created_at integer DEFAULT (unixepoch()) NOT NULL
);

CREATE TABLE IF NOT EXISTS monitor_notifications (
  monitor_id text NOT NULL,
  channel_id text NOT NULL,
  PRIMARY KEY(monitor_id, channel_id),
  FOREIGN KEY (monitor_id) REFERENCES monitors(id) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (channel_id) REFERENCES notification_channels(id) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS heartbeat_tokens (
  monitor_id text PRIMARY KEY NOT NULL,
  token text NOT NULL,
  last_ping_at integer,
  FOREIGN KEY (monitor_id) REFERENCES monitors(id) ON UPDATE no action ON DELETE cascade
);

CREATE UNIQUE INDEX IF NOT EXISTS heartbeat_tokens_token_unique ON heartbeat_tokens (token);

CREATE INDEX IF NOT EXISTS idx_sl_monitor_checked ON status_logs (monitor_id, checked_at);
CREATE INDEX IF NOT EXISTS idx_sl_checked_at ON status_logs (checked_at);
CREATE INDEX IF NOT EXISTS idx_monitors_active ON monitors (active);

CREATE TABLE IF NOT EXISTS alert_state (
  monitor_id text PRIMARY KEY NOT NULL,
  consecutive_failures integer DEFAULT 0 NOT NULL,
  consecutive_missed integer DEFAULT 0 NOT NULL,
  alert_sent_at integer,
  consecutive_alerts integer DEFAULT 0 NOT NULL,
  last_reminder_at integer,
  surge_paused_until integer,
  FOREIGN KEY (monitor_id) REFERENCES monitors(id) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY NOT NULL,
  value text NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES ('retention_days', '90');

CREATE TABLE IF NOT EXISTS status_pages (
  id text PRIMARY KEY NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  password_hash text,
  show_all_monitors integer DEFAULT false NOT NULL,
  created_at integer DEFAULT (unixepoch()) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS status_pages_slug_unique ON status_pages (slug);

CREATE TABLE IF NOT EXISTS status_page_monitors (
  page_id text NOT NULL,
  monitor_id text NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  PRIMARY KEY(page_id, monitor_id),
  FOREIGN KEY (page_id) REFERENCES status_pages(id) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (monitor_id) REFERENCES monitors(id) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS incident_reports (
  id text PRIMARY KEY NOT NULL,
  title text NOT NULL,
  status text NOT NULL,
  started_at integer DEFAULT (unixepoch()) NOT NULL,
  resolved_at integer
);

CREATE TABLE IF NOT EXISTS incident_updates (
  id text PRIMARY KEY NOT NULL,
  incident_id text NOT NULL,
  message text NOT NULL,
  status text NOT NULL,
  created_at integer DEFAULT (unixepoch()) NOT NULL,
  FOREIGN KEY (incident_id) REFERENCES incident_reports(id) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS incident_monitors (
  incident_id text NOT NULL,
  monitor_id text NOT NULL,
  PRIMARY KEY(incident_id, monitor_id),
  FOREIGN KEY (incident_id) REFERENCES incident_reports(id) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (monitor_id) REFERENCES monitors(id) ON UPDATE no action ON DELETE cascade
);
`

export async function ensureSchema(d1: D1Database): Promise<void> {
  if (migrated) return
  const statements = SCHEMA_SQL
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0)
  await d1.batch(statements.map(s => d1.prepare(s)))

  const alterStatements = [
    `ALTER TABLE status_pages ADD COLUMN show_all_monitors integer DEFAULT false NOT NULL`,
    `ALTER TABLE notification_channels ADD COLUMN is_default integer DEFAULT false NOT NULL`,
    `ALTER TABLE monitors ADD COLUMN ssl_check_enabled integer DEFAULT false NOT NULL`,
    `ALTER TABLE monitors ADD COLUMN ssl_status text DEFAULT 'unknown' NOT NULL`,
    `ALTER TABLE monitors ADD COLUMN cache_booster integer DEFAULT false NOT NULL`,
    `ALTER TABLE status_logs ADD COLUMN colo text`,
    `ALTER TABLE status_logs ADD COLUMN country_code text`,
    `ALTER TABLE status_logs ADD COLUMN origin_ip text`,
    `ALTER TABLE monitors ADD COLUMN dns_hostname text`,
    `ALTER TABLE monitors ADD COLUMN dns_record_type text DEFAULT 'A'`,
    `ALTER TABLE monitors ADD COLUMN dns_resolver_url text`,
    `ALTER TABLE monitors ADD COLUMN dns_expected_ip text`,
    `ALTER TABLE monitors ADD COLUMN content_check text`,
    `ALTER TABLE status_pages ADD COLUMN hide_monitor_urls integer DEFAULT false NOT NULL`,
  ]
  for (const sql of alterStatements) {
    try { await d1.prepare(sql).run() } catch { /* column already exists */ }
  }

  migrated = true
}
