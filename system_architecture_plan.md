# System Architecture Plan: Multi-Branch Dashboard with Login & User Tiers

เอกสารนี้วางแผนการออกแบบระบบ Dashboard ให้รองรับการใช้งานหลายสาขา พร้อมระบบ Login และการแบ่ง User Tier อย่างปลอดภัยและมีประสิทธิภาพ

---

## 1. ภาพรวม Architecture (High-Level Overview)

```
[Browser / Dashboard]
        │
        │ HTTPS only
        ▼
[API Gateway + Auth Middleware]   ◄── JWT Token Validation
        │
        ├── /auth         ◄── Login / Refresh Token
        ├── /api/v1/...   ◄── Secured Business APIs
        │
        ▼
[Business Logic Layer (Service)]
        │
        ├── Permission Check (RBAC)
        ├── Data Filtering by storeCode scope
        ├── Input Validation + Sanitization
        │
        ▼
[Data Layer]
        ├── MongoDB (Primary)       ◄── Orders, Jobs, Batches
        ├── Redis Cache             ◄── Token Blacklist, Rate Limit, Hot Data
        └── PostgreSQL (Optional)   ◄── Users, Roles, Audit Logs
```

---

## 2. User Tier และสิทธิ์การใช้งาน (RBAC - Role Based Access Control)

| Role | ชื่อ | สิ่งที่เข้าถึงได้ | ข้อจำกัด |
|---|---|---|---|
| `super_admin` | ทีม Dev / IT | ทุกสาขา, ทุก Feature, ดู Audit Log | ไม่มี |
| `ops_manager` | ผู้จัดการ Operations | ทุกสาขา, ดึงข้อมูลได้ทุก Section | ไม่สามารถดู Rider ส่วนตัวได้ |
| `branch_manager` | ผู้จัดการสาขา | **เฉพาะสาขาตัวเอง** เท่านั้น | Query ย้อนหลังได้ไม่เกิน 7 วัน |
| `branch_staff` | พนักงานหน้าร้าน | ดู Pending, Jobs ของสาขาตัวเอง | ดู Rider detail ไม่ได้, ดูแค่วันนี้ |
| `viewer` | ลูกค้า / ภายนอก | Track Order ด้วย Consignment ของตัวเองเท่านั้น | API ที่ให้ใช้ได้มีเดียว 1 |

### กฎสำคัญ
- **Branch Scope:** ทุก Role ยกเว้น `super_admin` และ `ops_manager` ต้องมี `allowedStoreCodes[]` ผูกกับ Account
- **Backend บังคับ Scope เสมอ:** ถึงแม้หน้าบ้านจะส่ง storeCode อื่นมา Backend ต้องตัดออกและใช้เฉพาะ scope ที่อนุญาตเท่านั้น

---

## 3. ระบบ Authentication (Login Flow)

### Flow การ Login

```
[User กรอก Username/Password]
          │
          ▼
[POST /auth/login]
          │
          ├── ตรวจสอบ Username/Password จาก DB (bcrypt hash)
          ├── ตรวจสอบสถานะ Account (active/suspended)
          │
          ▼
[ออก Token 2 ตัว]
   ├── Access Token  (JWT, อายุ 15 นาที)
   └── Refresh Token (JWT, อายุ 7 วัน, เก็บใน HttpOnly Cookie)

[ทุก API Request ต้องแนบ]
   Authorization: Bearer <access_token>
```

### Token Strategy
- **Access Token (Short-lived):** เก็บใน Memory (ไม่เก็บใน localStorage เพราะเสี่ยง XSS)
- **Refresh Token (Long-lived):** เก็บใน `HttpOnly Cookie` เพื่อกัน JavaScript อ่าน
- **Token Blacklist:** เก็บ Revoked Token ใน Redis เพื่อให้ Logout มีผลทันที

---

## 4. API Endpoints ที่ต้องทำ (Secured)

### Auth Endpoints
```
POST   /auth/login          - Login
POST   /auth/refresh        - ต่ออายุ Access Token
POST   /auth/logout         - Revoke Token

GET    /auth/me             - ดู Profile + Role + allowedStoreCodes ของตัวเอง
```

### Business Endpoints (ต้องมี JWT ทุกตัว)
```
GET    /api/v1/orders/pending      - Pending Orders
GET    /api/v1/riders/pool         - Rider Pool
GET    /api/v1/jobs                - Jobs History
GET    /api/v1/orders/search       - Track Order by Consignment / Order ID
GET    /api/v1/batches/search      - Batch Query
```

### Admin Endpoints (เฉพาะ super_admin)
```
GET    /admin/users                - ดูรายชื่อ User ทั้งหมด
POST   /admin/users                - สร้าง User ใหม่
PATCH  /admin/users/:id            - แก้ไข Role / Store Scope
DELETE /admin/users/:id            - ลบ / ระงับ User

GET    /admin/audit-logs           - ดูประวัติการใช้งาน
```

---

## 5. Performance และ Scalability

### 5.1 Redis Cache Strategy

| ข้อมูล | Cache Duration | เหตุผล |
|---|---|---|
| Rider Pool ต่อ storeCode | 30 วินาที | ข้อมูล Real-time แต่ยอมรับความล่าช้าเล็กน้อยได้ |
| Pending Orders ต่อ storeCode | 30 วินาที | ลด Load หาก 10 คน Query พร้อมกัน |
| Job List ต่อ storeCode+dateRange | 2 นาที | ข้อมูลเปลี่ยนช้ากว่า |
| User Profile + Permissions | 5 นาที | ไม่ต้อง Query DB ทุก Request |

### 5.2 Rate Limiting (ต่อ IP และ ต่อ User)

| Endpoint | Limit |
|---|---|
| `/auth/login` | 10 ครั้ง / นาที (ป้องกัน Brute Force) |
| Business APIs | 60 ครั้ง / นาที ต่อ User |
| `/orders/search` | 30 ครั้ง / นาที (Query หนักสุด) |

### 5.3 MongoDB Indexes ที่ต้องสร้าง

```javascript
// Orders Collection
db.orders.createIndex({ storeCode: 1, createdAt: -1 })
db.orders.createIndex({ consignment: 1 })
db.orders.createIndex({ internalOrderId: 1 })

// Jobs Collection
db.jobs.createIndex({ storeCode: 1, createdAt: -1 })
db.jobs.createIndex({ jobId: 1 })

// Riders Collection
db.riders.createIndex({ storeCode: 1 })
db.riders.createIndex({ userId: 1 })
```

### 5.4 Server-side Pagination
ทุก List API ต้องรับ `page` และ `limit` และ Query จาก DB โดยใช้ `.skip().limit()` ห้ามดึงข้อมูลทั้งหมดมาก่อนแล้วค่อย Page

---

## 6. Database Schema สำหรับ User Management

```javascript
// Users Collection (PostgreSQL หรือ MongoDB ก็ได้)
{
  _id: ObjectId,
  username: String,           // unique
  passwordHash: String,       // bcrypt hash เท่านั้น ห้ามเก็บ plaintext
  displayName: String,
  email: String,
  role: Enum["super_admin", "ops_manager", "branch_manager", "branch_staff", "viewer"],
  allowedStoreCodes: [String], // ["1104", "6304"] - [] = ทุกสาขา (สำหรับ super_admin)
  isActive: Boolean,
  lastLoginAt: Date,
  createdAt: Date,
  updatedAt: Date
}

// Audit Logs Collection
{
  _id: ObjectId,
  userId: ObjectId,
  username: String,
  action: String,             // เช่น "QUERY_ORDERS", "LOGIN", "EXPORT_CSV"
  params: Object,             // Query Parameters ที่ใช้
  ip: String,
  userAgent: String,
  timestamp: Date
}
```

---

## 7. Security Checklist

- [ ] HTTPS บังคับทุก Environment (ห้าม HTTP ใน Production)
- [ ] HttpOnly Cookie สำหรับ Refresh Token
- [ ] CORS ต้องกำหนด `allowedOrigins` ให้ชัดเจน ห้ามใช้ `*`
- [ ] Helmet.js ใส่ Security Headers ป้องกัน XSS, Clickjacking
- [ ] Input Validation ทุก Parameter ด้วย Joi หรือ Zod
- [ ] เก็บ Audit Log ทุกการ Query ข้อมูลสำคัญ
- [ ] Environment Variables ไม่ Hardcode ใน Code
- [ ] Secret/Key Rotation: เปลี่ยน JWT Secret เป็นระยะ

---

## 8. Tech Stack แนะนำ

| Layer | Tech | หมายเหตุ |
|---|---|---|
| Frontend | React + Vite (หรือ Next.js) | รองรับ SPA ได้ดีกว่า HTML เดิม |
| Backend | Node.js + Express (หรือ Fastify) | ต่อยอดจากของเดิมได้ |
| Auth | JWT + Redis (ioredis) | Token Blacklist + Session Store |
| Cache | Redis | Hot Data + Rate Limiting |
| Primary DB | MongoDB (ของเดิม) | ไม่ต้อง Migrate |
| User DB | PostgreSQL (แนะนำ) | Relational ดีกว่าสำหรับ Users/Roles |
| Deploy | Docker + Docker Compose | ง่ายต่อการ Scale |

---

## 9. ลำดับการพัฒนาที่แนะนำ (Roadmap)

```
Phase 1 - Foundation (2-3 สัปดาห์)
  ├── ทำ User DB Schema + Password Hash
  ├── POST /auth/login + JWT issuance
  ├── Auth Middleware บน Express
  └── เชื่อม Frontend ให้ส่ง Token

Phase 2 - RBAC (1-2 สัปดาห์)
  ├── Branch Scope Enforcement
  ├── Role-based UI (ซ่อน/แสดง Section ตาม Role)
  └── Admin Panel สร้าง/แก้ไข User

Phase 3 - Performance (1-2 สัปดาห์)
  ├── Redis Cache Layer
  ├── Rate Limiting
  ├── MongoDB Indexes
  └── Server-side Pagination

Phase 4 - Observability (1 สัปดาห์)
  ├── Audit Log
  ├── Error Monitoring (Sentry)
  └── Health Check Endpoint
```
