# Todo Tracker (TypeScript + SQLite + Apache)

Single-user web todo tracker for Linux VPS hosting at `https://web4.leho-62.info/` behind Apache in a multi-vhost setup.

## Features

- Simple Bootstrap UI for task entry and completion
- SQLite backend
- Optional per-task email when completed (checkbox in UI)
- Scheduled email summary reports for:
  - Daily
  - Weekly
  - Monthly
- On-demand report preview and download (CSV/TXT)
- No paid services required
- SMTP credentials handled via environment variables

## Tech Stack

- Node.js + Express
- TypeScript
- SQLite (`sqlite3`)
- Bootstrap 5 (CDN)
- Nodemailer
- node-cron

## 1. Local setup

```bash
cp .env.example .env
npm install
npm run build
npm start
```

App runs on `http://localhost:3000` by default.

## 2. Environment variables

Use `.env` locally. For production, use an external env file in `/etc/todo-tracker/todo-tracker.env`.

Required for login:

- `AUTH_USERNAME`
- `AUTH_PASSWORD`
- `AUTH_SESSION_SECRET`
- `AUTH_SESSION_MAX_AGE_HOURS`

Required for email:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

Recipient address is managed dynamically in the app UI (`Email Settings`) and stored in SQLite.

Other important vars:

- `PORT` (default: `3000`)
- `DB_PATH` (default: `./data/todos.sqlite`)
- `BASE_URL` (set to `https://web4.leho-62.info`)
- `TIMEZONE` (example: `UTC` or `Europe/Prague`)
- `ENABLE_SCHEDULED_EMAILS` (`true`/`false`)

Security guidance:

```bash
sudo mkdir -p /etc/todo-tracker
sudo cp .env.example /etc/todo-tracker/todo-tracker.env
sudo chown root:root /etc/todo-tracker/todo-tracker.env
sudo chmod 600 /etc/todo-tracker/todo-tracker.env
```

## 3. Build and deploy on VPS

Example target paths:

- App code: `/var/www/todo-tracker`
- Data file: `/var/www/todo-tracker/data/todos.sqlite`

```bash
sudo mkdir -p /var/www/todo-tracker
sudo chown -R $USER:$USER /var/www/todo-tracker
# copy repository contents here
npm install
npm run build
```

## 4. Run with systemd

Copy `deploy/todo-tracker.service` to `/etc/systemd/system/todo-tracker.service` and adjust paths if needed.

```bash
sudo systemctl daemon-reload
sudo systemctl enable todo-tracker
sudo systemctl start todo-tracker
sudo systemctl status todo-tracker
```

## 5. Apache virtual host setup

Enable required modules:

```bash
sudo a2enmod proxy proxy_http ssl rewrite headers
```

Copy `deploy/apache-web4.leho-62.info.conf` to `/etc/apache2/sites-available/web4.leho-62.info.conf`, then:

```bash
sudo a2ensite web4.leho-62.info.conf
sudo systemctl reload apache2
```

This forwards HTTPS traffic on `web4.leho-62.info` to `127.0.0.1:3000`.

## 6. Report behavior

- Daily email: 23:55 (configured timezone)
- Weekly email: Sunday 23:55
- Monthly email: 23:55 on last day of month
- UI buttons can also generate/download reports immediately

## API overview

- `GET /api/todos`
- `POST /api/todos`
- `PATCH /api/todos/:id/complete`
- `PATCH /api/todos/:id/reopen`
- `GET /api/reports/:period` (`daily|weekly|monthly`)
- `POST /api/reports/:period/email`
- `GET /api/reports/:period/download?format=csv|txt`

## Notes

- If SMTP is not configured, app still works but email sending is skipped.
- Data is persisted in SQLite file defined by `DB_PATH`.
