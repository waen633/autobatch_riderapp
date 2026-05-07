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

- [x] **ห้าม return ข้อมูลดิบ (`SELECT *`)** ต้องระบุ MongoDB Projection ชัดเจนในทุก Query (Implemented in `server.js`)
- [/] เพิ่ม **Input Validation** ในทุก Endpoint:
  - [x] `storeCode` → ต้องเป็น String เท่านั้น (Implemented)
  - [x] `startDate` / `endDate` → ต้องเป็น ISO Date Format ที่ Valid (Implemented)
  - [x] `endDate - startDate` → ต้องไม่เกิน 7 วัน (Enforced in Frontend)
  - [x] `values` (Order IDs Array) → รับได้สูงสุด 50 รายการต่อ Request (Enforced in Frontend)
- [x] **Bulk Query Enhancement:** รองรับการกรอก Order ID/Consignment แบบหลายรายการ (Multi-line/Space/Comma)
- [x] **Data Integrity:** แสดงผล "No data" สำหรับรายการที่ค้นหาไม่พบเพื่อให้ตรวจสอบได้ง่าย (Requested & Implemented)
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
- [x] Response ของทุก API ไม่มีฟิลด์ที่ไม่จำเป็น (Projection implemented)
- [x] **Order Query Enhancement:** ระบบรองรับ Multi-line input และจำกัด 50 รายการ
- [x] **Error Handling:** รายการที่ค้นหาไม่พบจะแสดงเป็นแถว "No data" ในตารางผลลัพธ์
- [ ] MongoDB Index ถูกสร้างแล้ว (ตรวจด้วย `db.collection.getIndexes()`)

## 5. Developer Implementation Guide (สรุปงานสำหรับ Developer)

เพื่อให้ Dashboard ทำงานได้อย่างปลอดภัยและสมบูรณ์ Dev ต้องจัดการส่วนหลักดังนี้:

### 5.1 Current API Endpoints — Accurate Spec (อัปเดต 2025-05-07)

> **หมายเหตุ:** ชื่อ endpoint ด้านล่างคือชื่อปัจจุบันใน `server.js` ที่ใช้งานจริง  
> หลังทำ CR-001 (Auth) เสร็จ ให้เปลี่ยน prefix เป็น `/api/v1/` และเพิ่ม `authMiddleware` ก่อน register route ทุกเส้น

---

#### `GET /api/pending`

| | รายละเอียด |
|---|---|
| **Query Params** | `storeCode` — comma-separated store codes (required) |
| **MongoDB** | `4pl-oms`.`pendingorders` |
| **Filter** | `storeCode: $in storeCodes`, `deleted: { $ne: true }` |
| **Returns** | `{ count, data: [{ _id, batchId, orderId, consignment, serviceType, storeCode, createdAt }] }` |
| **Security Gap** | ❌ ไม่มี `.limit()` → ถ้า store มี pending orders เยอะมากจะ return ทั้งหมด |
| **ต้องแก้** | เพิ่ม `.limit(500)` · Backend validate storeCode scope · Rate limit 60/min/user |

---

#### `GET /api/jobs`

| | รายละเอียด |
|---|---|
| **Query Params** | `storeCode` (comma-separated, required), `from` (ISO datetime, required), `to` (ISO datetime, required) |
| **MongoDB** | `lastmile`.`stores` → แปลง storeCode→storeId, แล้ว `4pl-oms`.`autobatchingjobs` |
| **Filter** | `storeId: $in storeIds`, `createdAt: { $gte: from, $lt: to }` |
| **Returns** | `{ count, data: [{ jobId, storeCode, riderName, riderId, orderIds[], orderCount, pickUpSLA, deliverySLA, status, createdAt, updatedAt, updateStatuses[] }] }` |
| **หมายเหตุ** | `rawResults` (polyline) **ถูกถอดออกแล้ว** — ดึงเฉพาะตอนกด See Route ผ่าน `/api/job-route` |
| **Security Gap** | ❌ ไม่มี backend date range validation (frontend จำกัด 7 วัน แต่ backend ไม่ block) · `.limit(2000)` อาจยังมากเกินไปสำหรับ export |
| **ต้องแก้** | เพิ่ม backend date range check ≤ 7 วัน · Rate limit 30/min/user (query หนัก 2 collections) |

---

#### `GET /api/job-route`

| | รายละเอียด |
|---|---|
| **Query Params** | `jobId` (string, required) |
| **MongoDB** | `4pl-oms`.`autobatchingjobs` (findOne) |
| **Filter** | `{ jobId }` |
| **Returns** | `{ rawResults: string[] }` — Array ของ encoded polyline JSON strings |
| **หมายเหตุ** | Lazy-load endpoint สำหรับ "See Route" modal ดึงข้อมูลเฉพาะเมื่อกด button |
| **Security Gap** | ❌ ไม่มี auth → ใครรู้ jobId สามารถดู route ได้ |
| **ต้องแก้** | เพิ่ม authMiddleware · validate jobId format · Rate limit 60/min/user |

---

#### `GET /api/stuck`

| | รายละเอียด |
|---|---|
| **Query Params** | `storeCode` (comma-separated, required), `from` (ISO datetime), `to` (ISO datetime) |
| **MongoDB** | `4pl-oms`.`autobatchingjobs` |
| **Filter** | `workflowInput.metadata.storeId: $in storeCodes`, `orderReferenceId: { $exists: false }`, `fleetDispatchType: AUTO_BATCHING`, `workflowInput.metadata.jobId: { $exists: false }`, `currentOrderStatus: { $ne: ORDER_CANCELLED }` |
| **Returns** | `{ count, data: [{ _id, orderId, currentOrderStatus, createdAt, workflowInput.metadata.storeId, workflowInput.fleetDispatchType }] }` |
| **หมายเหตุ** | ⚠️ endpoint นี้ query ด้วย `workflowInput.metadata.storeId` (string) โดยตรง ต่างจาก `/api/jobs` ที่แปลง storeCode → ObjectId ก่อน |
| **Security Gap** | ❌ ไม่มี backend date range validation · storeCode trusted จาก client โดยตรง |
| **ต้องแก้** | Backend enforce date range ≤ 7 วัน · Rate limit 30/min/user |

---

#### `GET /api/riders`

| | รายละเอียด |
|---|---|
| **Query Params** | `storeCode` (comma-separated, required) |
| **MongoDB** | ดึง 5 collections ต่อกัน (sequential per store): `4pl-address-and-zoning`.`geographies` → `lastmile`.`stores` → `4pl-fleet`.`staffs` → `4pl-oms`.`autobatchingjobs` → `4pl-oms`.`autobatchingriderpools` |
| **Returns** | `{ count, readyCount, data: [{ storeCode, queue, poolId, userId, username, name, phone, status, join_pool_at, ready_for_auto_assign, staff_online, not_banned, no_active_job, not_on_break, job_on_hand_id, job_on_hand_status, mapUrl }] }` |
| **Security Gap** | ❌ `phone`, `userId` ส่งออกไปทุก role · query หนักมาก (5 DBs/store, sequential loop) |
| **ต้องแก้** | RBAC: `branch_staff` ต้องไม่เห็น `phone`, `userId` · Rate limit 20/min/user (query หนักที่สุด) · พิจารณา Redis cache TTL 30s |

---

#### `GET /api/live`

| | รายละเอียด |
|---|---|
| **Query Params** | `storeCode` (comma-separated, required) |
| **MongoDB** | เหมือน `/api/riders` แต่ใช้ `Promise.all` parallel ในบางส่วน: `geographies` + `stores` (parallel) → `staffs` → `autobatchingjobs` + `autobatchingriderpools` (parallel) |
| **Returns** | `{ riders: [{ storeCode, userId, name, phone, lat, lng, inPool, eligible, jobId, jobStatus }], stores: [{ storeCode, name, lat, lng, radius }] }` |
| **หมายเหตุ** | ใช้กับ Live Rider Map บน Dashboard · riders ที่ไม่มี location coordinates จะถูก filter ออก |
| **Security Gap** | ❌ ส่ง `phone` ออกไปทุก role · ไม่มีการ validate จำนวน storeCode (ถ้าส่ง 20 store จะ query หนักมาก) |
| **ต้องแก้** | จำกัด storeCode สูงสุด 5 ต่อ request (หรือตาม allowedStoreCodes ของ user) · RBAC hide `phone` สำหรับ `branch_staff` · Rate limit 20/min/user · Redis cache TTL 15s |

---

#### `GET /api/orders`

| | รายละเอียด |
|---|---|
| **Query Params** | `type` (`consignment` หรือ `orderid`, required), `values` (comma-separated, required) |
| **MongoDB** | `4pl-oms`.`orders` |
| **Filter** | `orderReferenceId: { $exists: false }` + `workflowInput.metadata.consignment` หรือ `workflowInput.metadata.orderId` |
| **Returns** | `{ count, data: [{ _id, orderId, internalOrderId, consignment, storeCode, storeName, jobId, isOrderItemsConfirmation, fleetDispatchType, currentOrderStatus, paymentMethod, paymentChannel, codChannel, codAmount, riderName, riderId, riderPhone, workingType, createdAt, updatedAt, statusHistory[], rawResults[] }] }` |
| **หมายเหตุ** | `rawResults` คือ encoded polyline ที่สร้างจาก pickup/delivery coordinates ในตัว document เอง (ไม่ได้ดึง DB เพิ่ม) |
| **Security Gap** | ❌ ไม่มี `.limit()` · ไม่มี server-side limit บน `values` array (frontend จำกัด 50 แต่ backend ไม่ block) · `riderPhone` ส่งออกทุก role |
| **ต้องแก้** | เพิ่ม `.limit(100)` · Backend validate `values.length ≤ 50` · RBAC: hide `riderPhone`, `riderId` สำหรับ `branch_staff` · Rate limit 30/min/user |

---

#### `GET /api/batches`

| | รายละเอียด |
|---|---|
| **Query Params** | `orderIds` (comma-separated, required) |
| **MongoDB** | `4pl-oms`.`autobatchingbatches` |
| **Filter** | `orderIds: $in idList` |
| **Returns** | `{ count, data: [{ _id, batchId, orderIds[], orderCount, storeId, status, roStartTime, roEndTime, roStatus, createdAt }] }` |
| **Security Gap** | ❌ ไม่มี server-side limit บน `orderIds` array |
| **ต้องแก้** | Backend validate `orderIds.length ≤ 100` · Rate limit 30/min/user |

---

### 5.2 Rate Limit Summary (ต้องตั้งค่าหลัง CR-001 เสร็จ)

| Endpoint (ปัจจุบัน) | Endpoint (หลัง CR-001) | Rate Limit | เหตุผล |
|---|---|---|---|
| `POST /auth/login` | `POST /auth/login` | **10 ครั้ง / นาที / IP** | ป้องกัน brute-force |
| `POST /auth/refresh` | `POST /auth/refresh` | 20 ครั้ง / นาที / IP | |
| `GET /api/pending` | `GET /api/v1/orders/pending` | 60 ครั้ง / นาที / user | query เบา |
| `GET /api/jobs` | `GET /api/v1/jobs` | **30 ครั้ง / นาที / user** | query 2 collections |
| `GET /api/job-route` | `GET /api/v1/jobs/route` | 60 ครั้ง / นาที / user | findOne เร็ว |
| `GET /api/stuck` | `GET /api/v1/jobs/stuck` | 30 ครั้ง / นาที / user | |
| `GET /api/riders` | `GET /api/v1/riders` | **20 ครั้ง / นาที / user** | query 5 DBs หนักสุด |
| `GET /api/live` | `GET /api/v1/riders/live` | **20 ครั้ง / นาที / user** | query 5 DBs หนักสุด |
| `GET /api/orders` | `GET /api/v1/orders/search` | **30 ครั้ง / นาที / user** | |
| `GET /api/batches` | `GET /api/v1/batches` | 30 ครั้ง / นาที / user | |

> **Implementation:** ใช้ `express-rate-limit` แยก limiter ตาม endpoint group  
> ```javascript
> const heavyLimiter = rateLimit({ windowMs: 60_000, max: 20, keyGenerator: req => req.user?.id || req.ip });
> const normalLimiter = rateLimit({ windowMs: 60_000, max: 60, keyGenerator: req => req.user?.id || req.ip });
> const searchLimiter = rateLimit({ windowMs: 60_000, max: 30, keyGenerator: req => req.user?.id || req.ip });
> const loginLimiter = rateLimit({ windowMs: 60_000, max: 10 }); // key by IP เท่านั้น
> ```

---

### 5.3 Server-side Validation ที่ต้องเพิ่ม (ปัจจุบันยังไม่มี)

| Validation | Endpoint | ปัจจุบัน | ต้องแก้ |
|---|---|---|---|
| Date range ≤ 7 วัน | `/api/jobs`, `/api/stuck` | Frontend เท่านั้น | ❌ ต้องเพิ่ม Backend check |
| `values.length ≤ 50` | `/api/orders` | Frontend เท่านั้น | ❌ ต้องเพิ่ม Backend check |
| `orderIds.length ≤ 100` | `/api/batches` | ไม่มี | ❌ ต้องเพิ่ม Backend check |
| `storeCode` count ≤ 5 | `/api/riders`, `/api/live` | ไม่มี | ❌ ต้องเพิ่ม (ป้องกัน DB overload) |
| Result limit | `/api/pending`, `/api/orders` | ไม่มี `.limit()` | ❌ เพิ่ม `.limit(500)` และ `.limit(100)` |
| storeCode scope enforcement | ทุก endpoint | Client trusted 100% | ❌ ต้อง override ด้วย `user.allowedStoreCodes` |

---

### 5.4 มาตรฐานความปลอดภัยและ Logic ที่ต้องรักษาไว้

1. **Data Projection (สำคัญ):** ห้ามส่งฟิลด์ที่เป็นความลับ เช่น `passwordHash`, `internalToken` หรือข้อมูลส่วนตัวลูกค้าที่ไม่ได้ใช้แสดงผลบนหน้าเว็บ
2. **Route Polylines:** ฟิลด์ `rawResults` ต้องส่งเป็น Array ของ String (Encoded Polyline) เพื่อให้ฟีเจอร์ "See Route" / "Location" modal ทำงานได้
3. **Timeline Calculation:** ข้อมูลใน `statusHistory` และ `updateStatuses` ต้องมีทั้ง `status` และ `updatedAt` เพื่อให้หน้าบ้านคำนวณ Duration ในแต่ละขั้นตอนได้
4. **Jobs Lazy Loading:** `/api/jobs` ไม่ส่ง `routeOptimizationResult` — ดึงผ่าน `/api/job-route` เฉพาะเมื่อกด "See Route" เท่านั้น (ลด payload จาก ~40MB → <1MB)
5. **Performance:** สร้าง MongoDB Index สำหรับฟิลด์ `storeCode`, `createdAt`, `consignment`, `jobId`
6. **CORS:** เปลี่ยนจาก `cors()` (wildcard `*`) → ระบุ `allowedOrigins` ชัดเจน

---

## 6. ข้อมูลอ้างอิง (References)

| ไฟล์ | ลิงก์ |
| :--- | :--- |
| API Security Specification | `api_security_spec.md` |
| System Architecture Plan | `system_architecture_plan.md` |
| Project Pricing Estimate | `project_pricing_estimate.md` |
| Source Code (Current) | `server.js`, `public/index.html` |

---

*CR นี้อาจมีการแก้ไขเพิ่มเติมได้โดย Project Owner หลังจากการ Review กับ Developer*
