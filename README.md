# VPS Manager

> Self-hosted VPS management dashboard. SSH terminal, real-time metrics, PM2, Docker, file browser, and CV editor — all in one web interface.

![License](https://img.shields.io/badge/license-MIT-purple) ![Next.js](https://img.shields.io/badge/Next.js-15-black) ![Node](https://img.shields.io/badge/node-18+-green)

**Companion app:** [vps-key-manager](https://github.com/Jok-Holk/vps-key-manager) — Electron desktop app for Ed25519 authentication.

---

## How authentication works

VPS Manager uses **Ed25519 challenge-response** — no passwords stored on the server.

```
vps-key-manager (desktop)          vps-manager (server)
        │                                   │
        │  ── GET /api/auth/nonce ─────────▶ │  generate random nonce
        │  ◀─ { nonce } ────────────────────│
        │                                   │
        │  sign(nonce, privateKey)           │
        │  ── POST /api/auth/verify ────────▶│  verify signature with PUBLIC_KEY_ED25519
        │  ◀─ { key, pass } ────────────────│  store key+pass hash in Redis (TTL 10min)
        │                                   │
  user copies key+pass                      │
  into browser login page ─────────────────▶│  verify hash → issue JWT cookie
```

**First run (no desktop app yet):** The server generates a one-time setup password printed in PM2 logs. Use it to log in, configure your Ed25519 public key in Settings, then use the desktop app for all future logins.

---

## Requirements

| Dependency                 | Purpose                           |
| -------------------------- | --------------------------------- |
| Node.js 18+                | Runtime                           |
| PM2                        | Process manager                   |
| Redis                      | Auth key-pass exchange (required) |
| Git                        | Deploy feature                    |
| SSH server (`sshd`)        | Terminal module                   |
| Docker (optional)          | Docker module                     |
| Chromium/Chrome (optional) | CV PDF export                     |

---

## Quick start

```bash
# 1. Clone and install
git clone https://github.com/Jok-Holk/vps-manager.git
cd vps-manager
npm install

# 2. Build
npm run build

# 3. Start
pm2 start ecosystem.config.js
pm2 save

# 4. Get setup password
pm2 logs vps-manager --lines 50
# Look for: SETUP PASSWORD: xxxxxxxxxxxxxx

# 5. Open browser → http://your-server:3000
#    Enter setup password → configure Settings → done
```

---

## First run flow

```
npm start
    ↓
startup.ts runs automatically
    ↓
.env created with all defaults
JWT_SECRET auto-generated
    ↓
Check PM2 logs for SETUP PASSWORD
    ↓
Login → Settings → fill in:
  • VPS Host / User
  • Redis URL
  • SSH Key Path
  • Ed25519 Public Key  ← from vps-key-manager desktop app
    ↓
Save → server rebuilds → setup password disabled
    ↓
Future logins use vps-key-manager desktop app only
```

---

## SSH Terminal setup

The terminal connects to `localhost` via SSH key (not password). Generate a dedicated key pair:

```bash
# On your VPS
mkdir -p keys
ssh-keygen -t ed25519 -f ./keys/id_rsa -N ""
cat ./keys/id_rsa.pub >> ~/.ssh/authorized_keys
chmod 600 ./keys/id_rsa ~/.ssh/authorized_keys

# Verify
ssh -i ./keys/id_rsa -o StrictHostKeyChecking=no root@127.0.0.1 "echo OK"
# Must print: OK

# Then set in Settings:
# VPS_HOST = 127.0.0.1
# VPS_USER = root
# VPS_PRIVATE_KEY_PATH = ./keys/id_rsa
```

---

## CV Editor (optional)

Requires the `cv-service` Astro app for Markdown → HTML → PDF conversion.

```bash
cd cv-service
npm install
npm run build
pm2 start ecosystem.config.js --only cv-service
```

Add your resume files (gitignored — personal content):

```
cv-service/public/resumes/vi/resume-vi.md
cv-service/public/resumes/en/resume-en.md
cv-service/public/resumes/styles.css
```

Enable in Settings → Modules → CV Editor → set `CV_SERVICE_URL=http://localhost:4321`.

---

## Environment variables

All configurable via Settings GUI. For reference:

```env
# Core
VPS_HOST=127.0.0.1
VPS_USER=root
VPS_PRIVATE_KEY_PATH=./keys/id_rsa
REDIS_URL=redis://localhost:6379

# Auth (auto-generated on first run)
JWT_SECRET=
PUBLIC_KEY_ED25519=

# Public (embedded at build time — require rebuild to change)
NEXT_PUBLIC_VPS_HOST=your-server-ip
NEXT_PUBLIC_VPS_USER=root
NEXT_PUBLIC_WS_URL=wss://your-domain.com

# Deploy
APP_DIR=/path/to/vps-manager
PM2_APP_NAME=vps-manager
GIT_REMOTE=origin
GIT_BRANCH=main

# Modules
NEXT_PUBLIC_ENABLE_METRICS=true
NEXT_PUBLIC_ENABLE_DOCKER=false
NEXT_PUBLIC_ENABLE_PM2=true
NEXT_PUBLIC_ENABLE_FILES=true
NEXT_PUBLIC_ENABLE_CV=false

# CV Service
CV_SERVICE_URL=http://localhost:4321
```

---

## Nginx example

```nginx
server {
    listen 443 ssl;
    server_name console.your-domain.com;

    location /socket.io/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_buffering off;
        add_header X-Accel-Buffering no;
    }
}
```

---

## Security

- Setup password never stored in plaintext — SHA-256 hash only, auto-deleted after key is configured
- JWT tokens expire after 1 hour
- Files tab restricted to safe paths — `/root`, `/home`, `/var/log`, `/etc/nginx`, `/opt`
- SSH private key never leaves the server
- All dashboard routes protected by JWT middleware

---

## Author

**Jok-Holk** — [github.com/Jok-Holk](https://github.com/Jok-Holk)

Related: [vps-key-manager](https://github.com/Jok-Holk/vps-key-manager)

---

## Bug reports & feedback

Found a bug or have a suggestion? Open an [issue on GitHub](https://github.com/Jok-Holk/vps-manager/issues) or email **jokholk.dev@gmail.com**.
