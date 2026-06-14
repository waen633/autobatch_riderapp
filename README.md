# Lotus Auto-Batching Dashboard

Dashboard สำหรับ Operations team ใช้ Monitor & Manage Last-mile Delivery แบบ Real-time

---

## Features

| Phase | ความสามารถ |
|-------|-----------|
| **Phase 1** | Live Rider Map, Pending Orders, Rider Pool, Jobs, Order/Batch Query, Store Performance, Auto-Assign Diagnostic |
| **Phase 2** | AI Chat (น้องบอท) — ถามข้อมูลสาขาผ่าน chat ด้วย function calling |
| **Phase 3** | Analytics & Report — KPI, Hourly Demand, Rider Score, Delivery Speed, Demand Forecast, AI Insight |
| **Phase 4** | Keycloak Auth — Login/Logout, Role-based Access, Per-user Store & Feature Flags, User Management |

---

## Requirements

| สิ่งที่ต้องมี | Version |
|-------------|---------|
| Node.js | >= 18 |
| Docker Desktop | latest (สำหรับ Keycloak) |
| MongoDB | Read-only access (client ให้มา) |

---

## ติดตั้ง (Local Dev)

### 1. Clone & Install

```bash
git clone https://github.com/waen633/autobatch_riderapp.git
cd autobatch_riderapp
git checkout feature/phase4-auth-keycloak
npm install
```

### 2. ตั้งค่า Environment

```bash
cp .env.example .env
```

แก้ค่าใน `.env`:

```env
# MongoDB (ได้จาก client)
MONGO_URI=mongodb://user:pass@host:27017/admin?...

# Keycloak
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=autobatch
KEYCLOAK_CLIENT_ID=autobatch-dashboard
KEYCLOAK_CLIENT_SECRET=          # ได้จาก Keycloak Admin Console
KEYCLOAK_ADMIN_USER=admin
KEYCLOAK_ADMIN_PASS=admin
APP_URL=http://localhost:3000
SESSION_SECRET=                  # สร้างด้วย: openssl rand -hex 32

# AI Chat
OPENROUTER_API_KEY=sk-or-v1-...
AI_MODEL=anthropic/claude-3-haiku

# Tencent CLS (Job Diagnostic)
CLS_SECRET_ID=
CLS_SECRET_KEY=
CLS_REGION=ap-singapore
CLS_TOPIC_NAME=allnow-prod-log

# Google Sheets Sync
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
GOOGLE_SHEET_ID=
SYNC_STORE_CODES=1104,5022,6403
SYNC_SHEET_NAME=rider_queue
```

### 3. รัน Keycloak ด้วย Docker

```bash
docker run -d --name keycloak \
  -p 8080:8080 \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin \
  -e KC_BOOTSTRAP_ADMIN_PASSWORD=admin \
  quay.io/keycloak/keycloak:26.2 start-dev
```

รอ ~15 วินาที แล้วเปิด `http://localhost:8080`

### 4. Setup Keycloak (ทำครั้งแรกครั้งเดียว)

**เปิด** `http://localhost:8080` login ด้วย `admin` / `admin`

**4.1 สร้าง Realm**
- Dropdown "Keycloak" (มุมบนซ้าย) → **Create realm**
- Name: `autobatch` → **Create**

**4.2 สร้าง Client**
- Clients → **Create client**
- Client ID: `autobatch-dashboard` / Type: OpenID Connect
- Client authentication: **ON** → Next
- Valid redirect URIs: `http://localhost:3000/*`
- Web origins: `http://localhost:3000` → **Save**
- Tab **Credentials** → copy **Client secret** → ใส่ใน `.env`

**4.3 สร้าง Roles**
- Realm roles → Create role → `admin`
- Realm roles → Create role → `user`

**4.4 สร้าง Admin User คนแรก**
- Users → **Create user** → กรอก Username / Email → Create
- Tab **Credentials** → Set password (ปิด Temporary)
- Tab **Role mapping** → Assign role → `admin`

### 5. รัน Dashboard

```bash
npm start
```

เปิด `http://localhost:3000` → redirect ไปหน้า Login → เข้าสู่ระบบ

---

## Production (VM)

**Keycloak + PostgreSQL ด้วย Docker Compose:**

```yaml
# docker-compose.yml
version: "3"
services:
  keycloak:
    image: quay.io/keycloak/keycloak:26.2
    command: start
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://db/keycloak
      KC_DB_USERNAME: keycloak
      KC_DB_PASSWORD: secret
      KC_HOSTNAME: your-domain.com
      KC_BOOTSTRAP_ADMIN_USERNAME: admin
      KC_BOOTSTRAP_ADMIN_PASSWORD: change-me
    ports:
      - "8080:8080"
    depends_on: [db]
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: keycloak
      POSTGRES_USER: keycloak
      POSTGRES_PASSWORD: secret
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```

```bash
docker compose up -d
```

แก้ `.env`:
```env
KEYCLOAK_URL=https://your-domain.com:8080
APP_URL=https://your-dashboard.com
```

```bash
pm2 start server.js --name dashboard
# หรือหลังแก้ .env
pm2 restart dashboard --update-env
```

---

## โครงสร้างไฟล์

```
├── server.js                   # Entry point — Express + session + routes
├── routes/
│   ├── authRoute.js            # GET /api/auth/login|callback|token|logout
│   ├── me.js                   # GET /api/me
│   ├── admin.js                # User Management + Keycloak Admin API
│   ├── pending.js              # GET /api/pending
│   ├── jobs.js                 # GET /api/jobs /stuck /job-route /jobs-km
│   ├── orders.js               # GET /api/orders /batches /order-confirm-check
│   ├── riders.js               # GET /api/riders /live /rider-breaks
│   ├── performance.js          # GET /api/rider-performance
│   ├── diagnostics.js          # GET /api/job-diagnostics
│   ├── analytics.js            # GET /api/analytics/*
│   ├── storeConfig.js          # GET /api/store-config
│   └── ai.js                   # POST /api/ai/chat
├── lib/
│   ├── auth.js                 # JWT middleware (verify Keycloak JWKS)
│   ├── permissionsDb.js        # SQLite — feature flags & store access per user
│   ├── db.js                   # MongoDB singleton
│   ├── helpers.js              # safeStr(), splitCodes()
│   ├── eligibility.js          # evalEligibility(), buildMapUrl()
│   ├── cls.js                  # Tencent CLS client
│   ├── aiTools.js              # AI tool definitions
│   └── toolExecutor.js         # AI tool executor
├── sync/
│   └── sheetsSync.js           # Google Sheets sync (hourly)
├── public/
│   ├── index.html              # Dashboard UI (single file ~5500 lines)
│   ├── login.html              # Login page
│   └── route-viewer.html       # Delivery route map viewer
├── data/
│   └── permissions.db          # SQLite (auto-created, gitignored)
├── .env.example                # Template ตัวแปร
├── USER_MANAGEMENT_GUIDE.md    # คู่มือจัดการ User สำหรับ Admin
└── package.json
```

---

## API Reference

### Auth (Public)
| Method | Path | คำอธิบาย |
|--------|------|---------|
| GET | `/api/auth/login` | Redirect ไป Keycloak |
| GET | `/api/auth/callback` | OAuth2 callback — รับ code แลก token |
| GET | `/api/auth/token` | ดึง access token จาก session |
| GET | `/api/auth/logout` | Logout + clear session |

### User (ต้อง Bearer token)
| Method | Path | คำอธิบาย |
|--------|------|---------|
| GET | `/api/me` | Profile + feature_flags + allowed_stores |

### Admin (ต้อง role = admin)
| Method | Path | คำอธิบาย |
|--------|------|---------|
| GET | `/api/admin/users` | รายชื่อ + permissions ทั้งหมด |
| POST | `/api/admin/users/:id` | แก้ allowed_stores + feature_flags |
| GET | `/api/admin/keycloak/users` | รายชื่อ users จาก Keycloak |
| POST | `/api/admin/keycloak/users` | สร้าง user ใน Keycloak |
| PUT | `/api/admin/keycloak/users/:id` | แก้ข้อมูล user + role + password |
| DELETE | `/api/admin/keycloak/users/:id` | ลบ user ออกจาก Keycloak + DB |
| POST | `/api/admin/keycloak/users/import` | Bulk import จาก CSV |

---

## User Management

Admin เปิดได้จากปุ่ม **Users** ใน navbar

### สิ่งที่ทำได้
- **Add User** — สร้าง user ใน Keycloak พร้อม assign role / สาขา / feature flags
- **Edit User** — แก้ชื่อ, email, role, สาขา, flags, reset password
- **Delete User** — ลบออกจาก Keycloak + DB (ไม่สามารถ undo)
- **Import CSV** — นำเข้าหลาย users พร้อมกัน
- **Template CSV** — ดาวน์โหลดไฟล์ตัวอย่างสำหรับ import

### รูปแบบ CSV สำหรับ Import
```csv
username,firstName,lastName,email,password,role,allowed_stores
john.doe,John,Doe,john@lotus.com,Pass@1234,user,1104
jane.smith,Jane,Smith,jane@lotus.com,Pass@1234,user,1104|5022
ops.admin,OPS,Admin,ops@lotus.com,Admin@9999,admin,*
```
> ใช้ `|` คั่นหลายสาขาใน CSV — ระบบแปลงเป็น `,` อัตโนมัติ

### Feature Flags
| Flag | ควบคุม |
|------|-------|
| `tab_dashboard` | Tab Dashboard |
| `tab_analytics` | Tab Analytics |
| `section_pending` | Card Pending Orders |
| `section_riders` | Card Rider Pool |
| `section_jobs` | Card Jobs |
| `section_stuck` | Card Stuck Jobs |
| `section_orders` | Card Order Query |
| `section_batches` | Card Batch Query |
| `section_ai_chat` | AI Chat (น้องบอท) |
| `section_live_map` | Live Rider Map |

---

## Roles

| Role | สิทธิ์ |
|------|-------|
| `admin` | เข้าทุกสาขา (`*`), จัดการ users, เห็นทุก feature, แก้ Layout ได้ |
| `user` | เข้าได้เฉพาะสาขาที่ admin assign, เห็นเฉพาะ feature ที่เปิด, กรอก store code ไม่ได้ |

---

## Database

| Database | ใช้ทำอะไร | Permission |
|----------|----------|-----------|
| MongoDB `4pl-oms` | orders, batches | Read-only |
| MongoDB `4pl-fleet` | riders, jobs, break logs | Read-only |
| MongoDB `lastmile` | autobatch assign logs | Read-only |
| MongoDB `4pl-address-and-zoning` | store/zone geodata | Read-only |
| SQLite `data/permissions.db` | feature flags, store access per user | Read-Write (local) |
| Keycloak (H2/PostgreSQL) | users, sessions, roles | Managed by Keycloak |

> MongoDB เป็นของ client system — ห้าม write ทุกกรณี

---

## Commands

```bash
# Development
npm start

# Production (PM2)
pm2 start server.js --name dashboard
pm2 restart dashboard --update-env   # หลังแก้ .env
pm2 logs dashboard
pm2 status

# Keycloak (Docker)
docker start keycloak     # start
docker stop keycloak      # stop
docker logs keycloak -f   # logs
```

---

## Branch

| Branch | สถานะ |
|--------|-------|
| `main` | Phase 1 — core dashboard |
| `feature/phase2-ai-chat` | Phase 2 — AI Chat |
| `feature/phase3-analytics` | Phase 3 — Analytics |
| `feature/phase4-auth-keycloak` | Phase 4 — Auth (current) |
