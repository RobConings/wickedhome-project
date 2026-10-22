# WickedHome CI/CD — private GitHub repository + existing PM2

The main branch runs GitHub-hosted CI. Deployments use a separately registered
self-hosted runner and are **disabled** until the repository variable
`WICKEDHOME_AUTO_DEPLOY=true` is explicitly set.

## Verified on this server (2026-10-16)

- User `wicked` owns the running PM2 daemon (`pm2-wicked.service`).
- The PM2 processes `wickedhome`, `wickedhome-dev`, and
  `wickedhome-storybook` **all currently have cwd `/var/www/WickedHome`**.
- `wickedhome-tts` has cwd `/home/wicked/piper`; `wickedhome-search`
  has cwd `/home/wicked/searxng/src`.
- Do **not** move, rename, delete, symlink over, or run `npm ci` in
  `/var/www/WickedHome` as part of automated deployment. Dev and Storybook
  keep using that existing checkout.
- The existing `wickedhome` PM2 service is the only process to cut over.
  It listens on `127.0.0.1:3100` behind nginx for `home.example.be`.
- Application health check: `http://127.0.0.1:3100/api/health` returns
  `{"ok":true}`. The built backend includes its own scheduled jobs;
  do not add duplicate cron jobs.

## Proposed release layout

```text
/var/www/WickedHome/                      existing checkout: KEEP UNCHANGED
  (wickedhome-dev & wickedhome-storybook still run here)

/var/www/wickedhome-live                  symlink -> /var/www/wickedhome-deploy/releases/<sha>
  (only PM2 wickedhome uses this)

/var/www/wickedhome-deploy/
  releases/
    legacy/                               COPY of currently working production version
    <sha>/                                separately built versioned release
  shared/
    .env                                  copy of production secrets; owner wicked, mode 600
    data/                                 if STORAGE_DIR uses a relative path

/var/www/wickedhome-data/files            optional absolute persistent STORAGE_DIR
```

**Do not create the live symlink or switch PM2 until you've confirmed
PostgreSQL, .env, STORAGE_DIR, backups, and how PM2 is launched.**

## Before any changes (read-only checks)

As `wicked`, without printing private .env values:

```bash
pm2 show wickedhome
pm2 show wickedhome-dev
pm2 show wickedhome-storybook
pm2 ls
node -v
command -v pm2 node npm
ls -ld /var/www/WickedHome /var/www/WickedHome/data /var/www/wickedhome-data/files 2>/dev/null || true
find /var/www/WickedHome -maxdepth 1 -type d -printf '%f\n' | sort
# Show only whether STORAGE_DIR is set and whether it is absolute.
node -e 'const fs=require("fs"); const s=fs.readFileSync("/var/www/WickedHome/.env","utf8"); const line=s.split(/\r?\n/).find(x=>/^STORAGE_DIR=/.test(x)); const v=line?.split("=").slice(1).join("=").trim().replace(/^["\x27]|["\x27]$/g,"")||"data/files"; console.log("STORAGE_DIR:",v.startsWith("/")?"absolute":"relative",v.startsWith("/")?"(path omitted)":v);'
curl -fsS http://127.0.0.1:3100/api/health
sudo systemctl is-active pm2-wicked.service
df -h /var/www
```

Check the database backup and on-disk uploads independently. Files uploaded
through WickedHome are not necessarily in PostgreSQL; a DB dump alone is
insufficient. Do not paste secrets, connection strings or private SSH keys.

## One-time preparation and cutover (after backup verification)

1. Back up and verify restore for PostgreSQL, the original .env, any stored
   documents, and the PM2 dump. Keep `/var/www/WickedHome` as-is.
2. Create directories under `/var/www/wickedhome-deploy`, owner `wicked`.
   Make a *copy* (not move) of the currently running checkout into
   `releases/legacy` for initial rollback. A `cp -a` copy is acceptable if
   sufficient disk space; this includes `node_modules`, `dist`, `ai/skills`,
   and any relative files that the running service needs.
3. Copy production .env into `shared/.env` (mode 600); symlink it in
   `releases/legacy`. Do not modify the original .env used by dev.
4. If the production `STORAGE_DIR` is relative (the app defaults to
   `data/files`), copy its data into `shared/data` and point the
   `legacy/data` directory to it. Use an absolute path in the production
   .env for a truly external storage folder, or ensure every release has the
   `shared/data` symlink. Avoid splitting uploads between releases.
5. Create `/var/www/wickedhome-live` as a symlink to
   `releases/legacy`. Verify the app can start from that directory with its
   stored settings.
6. In a short maintenance window, replace **only** the PM2 app called
   `wickedhome`, starting it from `/var/www/wickedhome-live` using the
   copied `ecosystem.config.cjs`. Confirm port 3100 and /api/health first.
   Then run `pm2 save` as `wicked`. Never `pm2 restart all` or
   `pm2 delete all`. Dev/Storybook/search/TTS are not restarted.
7. Install the reviewed deployment helper from this repository as a
   root-owned file:

```bash
sudo install -o root -g root -m 0755 \
  scripts/deploy/wickedhome-deploy.sh /usr/local/sbin/wickedhome-deploy
```

8. Create a new **read-only** GitHub deploy SSH key as Linux user `wicked`
   and register the public key for this repo only. The helper expects the
   private key at `/home/wicked/.ssh/wickedhome-ci-deploy`. Keep key and
   GitHub host verification separate from other repos/runners.
9. Create an unprivileged `whrunner` user with no app, Docker, DB or
   writable deploy permissions. Register the GitHub Actions Linux x64
   **repository runner** using GitHub's current commands in Settings >
   Actions > Runners. Assign the unique label `wickedhome-deploy`.
   Install its runner service under `whrunner`.
10. Using `sudo visudo -f /etc/sudoers.d/wickedhome-deploy`:

```sudoers
whrunner ALL=(root) NOPASSWD: /usr/local/sbin/wickedhome-deploy *
```

Only the fixed root-owned script may be invoked; it accepts exactly one
40-character SHA and clones the current main commit **as wicked** through a
read-only key. The runner has no app credentials.
11. When all prerequisites are verified, create repository Actions variable
`WICKEDHOME_AUTO_DEPLOY=true`. Only successful CI for `main` may
then deploy. With this variable absent, CI runs but deployment is skipped.

## What each deployment does

1. Clone main into a fresh release, check exact expected SHA.
2. Link shared secrets and relative persistent data if applicable.
3. `npm ci`, validate/generate Prisma, and `npm run build` outside live path.
4. `npx prisma migrate deploy` (production DB, after compatible schema
   changes and a verified backup).
5. Atomically repoint **only** `/var/www/wickedhome-live`.
6. Delete and re-create the PM2 entry **only** named `wickedhome` from
   that release (PM2 can otherwise retain an old cwd after a symlink switch).
7. Check `/api/health`. If broken, repoint to the previous app release
   and restart the previous code; do not change dev/storybook/search/TTS.
8. Run `pm2 save` only after a successful start or successful app rollback.

Prisma migrations **are not reversed** by an application rollback. Prefer
backwards-compatible migrations, and always keep a verified database backup.
Switching a PM2 process creates a brief service interruption; it is not
zero-downtime.

## Useful commands

```bash
pm2 ls
pm2 show wickedhome
pm2 logs wickedhome --lines 80
readlink -f /var/www/wickedhome-live
curl -fsS http://127.0.0.1:3100/api/health
sudo systemctl status pm2-wicked.service
```
