# Change Request (CR): Lotus Auto-Batching Dashboard
**CR No.:** CR-2025-001
**วันที่ยื่น:** 2025-05-03
**ยื่นโดย:** Project Owner
**ผู้รับผิดชอบ (Assignee):** Backend Developer + Frontend Developer
**Priority:** High
**Target Release:** Phase 1 (Auth + Security) ภายใน 3 สัปดาห์

---

## 1. Background / ที่มา

Dashboard ปัจจุบัน (Lotus Auto-Batching Dashboard) เชื่อมต่อกับ MongoDB โดยตรงผ่าน Node.js/Express โดยไม่มีระบบ Authentication หรือการจำกัดสิทธิ์การเข้าถึง ส่งผลให้ไม่สามารถเปิดให้ทีมงานสาขาหรือผู้ใช้ภายนอกใช้งานได้อย่างปลอดภัย

**ปัญหาหลักที่ต้องแก้:**
- ไม่มีระบบ Login → ใครรู้ URL ก็เข้าได้
- API ส่งข้อมูลดิบทั้งหมดกลับมา → ข้อมูลส่วนตัวอาจรั่วไหล
- ไม่มีการแบ่งสิทธิ์ตามสาขา → User สาขา A เห็นข้อมูลสาขา B ได้
- ไม่มี Rate Limiting → อาจถูก Spam Request จน DB ล่ม

---

## 2. Scope of Work (สิ่งที่ต้องทำ)

> **อ้างอิง:** `system_architecture_plan.md` และ `api_security_spec.md` ในโปรเจกต์นี้

---

### CR-001: ระบบ Authentication (Login)

**ประเภทงาน:** Backend + Frontend
**ประมาณ Man-day:** 5 วัน

#### Backend Tasks
- [ ] สร้าง `users` Collection/Table ใน Database โดยมีฟิลด์ดังนี้:
  ```
  username, passwordHash (bcrypt), displayName, email,
  role, allowedStoreCodes[], isActive, lastLoginAt, createdAt
  ```
- [ ] สร้าง Endpoint `POST /auth/login`
  - รับ `username`, `password`
  - ตรวจสอบกับ DB และ Compare password ด้วย `bcrypt.compare()`
  - ออก **Access Token (JWT)** อายุ **15 นาที**
  - ออก **Refresh Token (JWT)** อายุ **7 วัน** แล้วส่งกลับผ่าน `HttpOnly Cookie`
- [ ] สร้าง Endpoint `POST /auth/refresh` — ต่ออายุ Access Token
- [ ] สร้าง Endpoint `POST /auth/logout` — Revoke Refresh Token
- [ ] สร้าง Endpoint `GET /auth/me` — ส่ง Profile + Role + `allowedStoreCodes` กลับมา
- [ ] สร้าง `authMiddleware` ที่ตรวจสอบ JWT Header `Authorization: Bearer <token>` ก่อนทุก API

#### Frontend Tasks
- [ ] สร้างหน้า Login Page (Username / Password Form)
- [ ] หลัง Login สำเร็จ เก็บ Access Token ไว้ใน **Memory** (ห้ามเก็บใน `localStorage`)
- [ ] ทุก API Request ต้องแนบ `Authorization: Bearer <access_token>` ใน Header
- [ ] ถ้า API ตอบ `401 Unauthorized` → Auto-redirect กลับหน้า Login

---

### CR-002: ระบบแบ่งสิทธิ์ตาม Role (RBAC)

**ประเภทงาน:** Backend + Frontend
**ประมาณ Man-day:** 5 วัน

#### Role ที่ต้องรองรับ

| Role | สิทธิ์ |
|---|---|
| `super_admin` | เข้าถึงได้ทุกสาขา ทุก Feature |
| `ops_manager` | เข้าถึงได้ทุกสาขา แต่จำกัดบาง Field |
| `branch_manager` | เฉพาะสาขาใน `allowedStoreCodes` ย้อนหลังได้สูงสุด 7 วัน |
| `branch_staff` | เฉพาะสาขาตัวเอง ดูได้แค่วันปัจจุบัน ไม่เห็น Rider Detail |
| `viewer` | Track Order ด้วย Consignment ของตัวเองเท่านั้น |

#### Backend Tasks
- [ ] เพิ่ม **RBAC Middleware** ที่ทุก Endpoint เช็ค Role ว่ามีสิทธิ์เข้าถึงหรือไม่
- [ ] **Branch Scope Enforcement (สำคัญมาก):**
  ทุก Query ที่รับ `storeCode` จาก Client → Backend ต้อง **override** ด้วย `allowedStoreCodes` ของ User เสมอ ห้ามเชื่อค่าที่ Client ส่งมา 100%
  ```javascript
  // ตัวอย่าง Logic
  const effectiveStoreCodes = user.role === 'super_admin'
    ? clientStoreCodes               // super_admin ไว้วางใจได้
    : user.allowedStoreCodes;        // Role อื่น ใช้ Scope ของ User เสมอ
  ```
- [ ] `branch_staff` ต้องถูกจำกัดให้ดูข้อมูลได้แค่ภายในวันปัจจุบัน (Override Date Range)
- [ ] `branch_staff` ต้องไม่เห็น Field: `phone`, `userId` ของ Rider

#### Frontend Tasks
- [ ] หลังจาก `GET /auth/me` → อ่าน Role แล้วซ่อน/แสดง Section ตาม Role
  - `branch_staff` → ซ่อน Date Picker, ซ่อน Rider Detail Columns
  - `viewer` → แสดงแค่ Order Query Section
- [ ] ถ้า Role ไม่มีสิทธิ์กด → Grey-out Button หรือซ่อนออกไป

---

### CR-003: ปรับ API ให้ Secure (Data Projection)

**ประเภทงาน:** Backend
**ประมาณ Man-day:** 3 วัน

> **อ้างอิง:** ดูรายละเอียด Response Field แต่ละ API ได้ที่ `api_security_spec.md`

#### สิ่งที่ต้องแก้ในทุก Endpoint

- [ ] **ห้าม return ข้อมูลดิบ (`SELECT *`)** ต้องระบุ MongoDB Projection ชัดเจนในทุก Query
- [ ] เพิ่ม **Input Validation** ด้วย `Joi` หรือ `Zod` ในทุก Endpoint:
  - `storeCode` → ต้องเป็น String เท่านั้น ห้ามเป็น Object (กัน NoSQL Injection)
  - `startDate` / `endDate` → ต้องเป็น ISO Date Format ที่ Valid
  - `endDate - startDate` → ต้องไม่เกิน 7 วัน (ตรวจที่ Backend ด้วย ไม่ใช่แค่หน้าบ้าน)
  - `values` (Order IDs Array) → รับได้สูงสุด 100 รายการต่อ Request
- [ ] เพิ่ม MongoDB Index สำหรับ Field ที่ Query บ่อย:
  ```javascript
  db.orders.createIndex({ storeCode: 1, createdAt: -1 })
  db.orders.createIndex({ consignment: 1 })
  db.orders.createIndex({ internalOrderId: 1 })
  db.jobs.createIndex({ storeCode: 1, createdAt: -1 })
  db.jobs.createIndex({ jobId: 1 })
  db.riders.createIndex({ storeCode: 1 })
  ```

---

### CR-004: Rate Limiting และ Security Headers

**ประเภทงาน:** Backend
**ประมาณ Man-day:** 1.5 วัน

- [ ] ติดตั้ง `helmet` → เพิ่ม Security Headers (XSS Protection, Clickjacking, etc.)
- [ ] ติดตั้ง `express-rate-limit` และตั้งค่าดังนี้:

  | Endpoint | Limit |
  |---|---|
  | `POST /auth/login` | 10 ครั้ง / นาที / IP |
  | Business APIs (`/api/v1/*`) | 60 ครั้ง / นาที / User |
  | `/api/v1/orders/search` | 30 ครั้ง / นาที / User |

- [ ] ตั้งค่า `CORS` ให้ระบุ `allowedOrigins` ชัดเจน ห้ามใช้ `origin: '*'`
- [ ] ใส่ Validation ว่า Environment ที่ Deploy เป็น Production ต้องบังคับ HTTPS (Redirect HTTP → HTTPS)

---

### CR-005: Redis Cache Layer

**ประเภทงาน:** Backend + Infrastructure
**ประมาณ Man-day:** 2.5 วัน

- [ ] Setup Redis Server (Docker หรือ Cloud Redis)
- [ ] ติดตั้ง `ioredis` ใน Node.js Project
- [ ] เพิ่ม Cache Layer สำหรับ Endpoint ดังนี้:

  | Endpoint | Cache Key | TTL |
  |---|---|---|
  | Rider Pool | `riders:{storeCode}` | 30 วินาที |
  | Pending Orders | `pending:{storeCode}` | 30 วินาที |
  | Jobs | `jobs:{storeCode}:{startDate}:{endDate}` | 2 นาที |
  | User Profile + Role | `user:profile:{userId}` | 5 นาที |

- [ ] เพิ่ม Refresh Token Blacklist ใน Redis (ไว้ตรวจว่า Logout แล้วหรือยัง)

---

### CR-006: Admin Panel (User Management)

**ประเภทงาน:** Backend + Frontend
**ประมาณ Man-day:** 3 วัน

- [ ] Backend Endpoints (เฉพาะ `super_admin` เท่านั้น):
  ```
  GET    /admin/users           - ดูรายชื่อ User ทั้งหมด
  POST   /admin/users           - สร้าง User ใหม่ + Hash Password
  PATCH  /admin/users/:id       - แก้ไข Role / allowedStoreCodes / isActive
  DELETE /admin/users/:id       - ลบ หรือ Suspend User
  ```
- [ ] Frontend: หน้า Admin Panel แสดงตาราง User + Form สร้าง/แก้ไข

---

### CR-007: Audit Log

**ประเภทงาน:** Backend
**ประมาณ Man-day:** 1 วัน

- [ ] สร้าง `audit_logs` Collection ใน DB
- [ ] บันทึก Log ทุกครั้งที่ User ทำสิ่งเหล่านี้:
  - Login / Logout
  - Query ข้อมูล (Orders, Jobs, Riders)
  - Export CSV
  - สร้าง/แก้ไข User (Admin Actions)
- [ ] ข้อมูลที่ต้องบันทึก: `userId`, `action`, `params`, `ip`, `userAgent`, `timestamp`
- [ ] สร้าง Endpoint `GET /admin/audit-logs` (เฉพาะ `super_admin`)

---

## 3. สิ่งที่ไม่อยู่ใน Scope CR นี้ (Out of Scope)

- การย้าย Server หรือ Change Infrastructure
- การปรับแต่ง MongoDB ในระดับ DBA (Replication, Sharding)
- Push Notification หรือ Real-time WebSocket
- Mobile App
- Report / Analytics Dashboard

---

## 4. Acceptance Criteria (เงื่อนไขการรับงาน)

- [ ] Login ด้วย Username/Password แล้วเข้าระบบได้
- [ ] User Role `branch_manager` เห็นได้เฉพาะ storeCode ที่กำหนด แม้จะแก้ไข Request ด้วย DevTools ก็ตาม
- [ ] User Role `branch_staff` ดูข้อมูลย้อนหลังเกิน 1 วันไม่ได้ (Backend Block)
- [ ] API `/auth/login` ถูกยิงเกิน 10 ครั้ง/นาที → ตอบ `429 Too Many Requests`
- [ ] Response ของทุก API ไม่มีฟิลด์ที่ไม่จำเป็น (เช่น password hash, internal token)
- [ ] Logout แล้ว Token เก่าใช้งานไม่ได้ทันที
- [ ] MongoDB Index ถูกสร้างแล้ว (ตรวจด้วย `db.collection.getIndexes()`)

---

## 5. ข้อมูลอ้างอิง (References)

| ไฟล์ | ลิงก์ |
|---|---|
| API Security Specification | `api_security_spec.md` |
| System Architecture Plan | `system_architecture_plan.md` |
| Project Pricing Estimate | `project_pricing_estimate.md` |
| Source Code (Current) | `server.js`, `public/index.html` |

---

*CR นี้อาจมีการแก้ไขเพิ่มเติมได้โดย Project Owner หลังจากการ Review กับ Developer*
