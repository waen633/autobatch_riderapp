# แนวทางการออกแบบ API และความปลอดภัยสำหรับ Dashboard (API Security & Specification Guideline)

เอกสารฉบับนี้อธิบายถึงความเสี่ยงของสถาปัตยกรรมปัจจุบันที่ดึงข้อมูลจาก Database โดยตรง และกำหนดมาตรฐานการทำ API (Endpoint) ใหม่ที่ Backend Developer ต้องเป็นผู้เตรียมให้ เพื่อให้ระบบมีความปลอดภัย ทนทาน และพร้อมสำหรับให้ผู้ใช้งานจริง (Production) หรือทีมอื่นๆ ใช้งาน

---

## 1. ปัญหาของโครงสร้างปัจจุบัน (Why Current Architecture is Insecure)

ปัจจุบัน Dashboard ใช้ Node.js (Express) เป็นตัวกลางที่รับ Request แล้วยิง Query ตรงเข้าไปยัง MongoDB ทันที โครงสร้างแบบนี้มีจุดอ่อนร้ายแรงหากนำไปเปิดให้ทีมงานหรือลูกค้าใช้งาน:

1. **No Data Projection (ข้อมูลรั่วไหล):** การดึงข้อมูลดิบจาก Database มักจะได้ฟิลด์อื่นๆ ที่เป็นความลับ (เช่น เบอร์โทรลูกค้า, Token, ข้อมูลส่วนตัว) ติดมาด้วย แม้จะไม่ได้แสดงบน UI แต่ Hacker สามารถ Inspect ดู Data ได้
2. **No Input Sanitization (เสี่ยงโดน Injection):** หากไม่มีการดกรอง (Filter) ค่าที่รับมาจากผู้ใช้อย่างเข้มงวด อาจทำให้เกิด NoSQL Injection หรือดึงข้อมูลข้ามสิทธิ์ได้
3. **No Authentication/Authorization:** ปัจจุบันไม่มีระบบ Login หากใครรู้ URL ของ API ก็สามารถดึงข้อมูลออกไปได้ทั้งหมด
4. **Performance Issues:** การส่ง `from`, `to` เป็นระยะเวลากว้างๆ และให้ Database คืนค่าทั้งหมดกลับมา (แล้วค่อยมา Paging หน้าบ้าน) จะทำให้ Database ล่มได้ง่ายเมื่อข้อมูลมีปริมาณมหาศาล

---

## 2. โครงสร้างที่ปลอดภัย (Recommended Architecture)

ต้องเปลี่ยนจาก **Direct Database Query** เป็น **Secure RESTful API** โดยให้ Backend Developer ทำ Endpoint กลางขึ้นมา และมีคุณสมบัติดังนี้:

- **API Gateway / Auth Middleware:** บังคับให้ต้องแนบ Token (เช่น JWT) ทุกครั้งที่เรียก API
- **Strict Payload & Type Validation:** รับเฉพาะ Parameter ที่กำหนดไว้ (เช่น Date Format ต้องเป๊ะ, ห้ามส่ง Object ประหลาดเข้ามา)
- **Data Transfer Object (DTO):** Backend ต้อง แมพ (Map) เฉพาะฟิลด์ที่หน้าบ้านจำเป็นต้องใช้จริงๆ แล้วค่อยส่งกลับมา ห้าม `SELECT *` เด็ดขาด
- **Server-side Pagination:** การแบ่งหน้าและการเรียงลำดับ (Sort/Limit) ต้องทำที่ Backend เท่านั้น หน้าบ้านมีหน้าที่แค่ส่ง `page` และ `limit` ไป

---

## 3. รายละเอียด API ที่ Dev ต้องเตรียม (API Specification)

เพื่อให้ Dashboard ปัจจุบันทำงานได้ครบถ้วน Dev ต้องเตรียม 5 APIs ดังต่อไปนี้:

### API 1: Get Pending Orders
ใช้สำหรับดึงออเดอร์ที่ยังไม่ถูกจัดกลุ่ม (รอสร้าง Job)
* **Endpoint:** `GET /api/v1/orders/pending`
* **Query Parameters (Filters):**
  * `storeCodes` (Array of Strings) - รหัสสาขา เช่น `["1104", "6304"]`
* **Response Data (ข้อมูลที่ต้องส่งกลับ):**
  * `storeCode` (String)
  * `orderId` (String)
  * `consignment` (String)
  * `serviceType` (String)
  * `createdAt` (ISO Date)

### API 2: Get Rider Pool
ใช้สำหรับดึงสถานะของไรเดอร์ที่อยู่ในระบบทั้งหมด
* **Endpoint:** `GET /api/v1/riders/pool`
* **Query Parameters (Filters):**
  * `storeCodes` (Array of Strings) - รหัสสาขา
* **Response Data:**
  * `userId`, `username`, `name`, `phone` (ข้อมูลพื้นฐานของไรเดอร์)
  * `storeCode` (String)
  * `join_pool_at` (ISO Date)
  * `ready_for_auto_assign` (Boolean)
  * `job_on_hand_id`, `job_on_hand_status` (String/Nullable)
  * `rider_fraud`, `device_fraud` (Boolean)
  * `mapUrl` (String)

### API 3: Get Jobs History
ใช้สำหรับดูประวัติการสร้าง Job ตามช่วงเวลา
* **Endpoint:** `GET /api/v1/jobs`
* **Query Parameters (Filters):**
  * `storeCodes` (Array of Strings)
  * `startDate` (ISO Date) - บังคับ (Required)
  * `endDate` (ISO Date) - บังคับ (Required) ขีดจำกัดไม่เกิน 7 วัน
  * `status` (String) - (Optional) เช่น `job_completed`
  * `page` (Number), `limit` (Number) - สำหรับ Server-side pagination
* **Response Data:**
  * `jobId`, `storeCode`, `status`
  * `riderId`, `riderName`
  * `orderCount` (Number)
  * `orderIds` (Array of Strings)
  * `pickUpSLA` (ISO Date)
  * `createdAt` (ISO Date)

### API 4: Order Query (Track Order)
ค้นหาออเดอร์เจาะจงด้วยรหัส
* **Endpoint:** `GET /api/v1/orders/search`
* **Query Parameters (Filters):**
  * `searchType` (Enum: `consignment` | `internalOrderId`)
  * `values` (Array of Strings) - รหัสที่ต้องการค้น เช่น `["CPTH901", "CPTH902"]`
* **Response Data:**
  * `internalOrderId`, `consignment`, `storeCode`, `storeName`
  * `jobId`, `riderName`, `riderId`
  * `paymentMethod`, `paymentChannel`, `codChannel`, `codAmount`
  * `currentOrderStatus`
  * `isOrderItemsConfirmation` (Boolean)
  * `createdAt`, `updatedAt`
  * `statusHistory` (Array of Objects) - ประวัติการเปลี่ยนสถานะ (status, updatedAt) เพื่อเอาไปวาด Timeline

### API 5: Batch Query
ค้นหา Batch ID ที่ผูกกับ Order นั้นๆ
* **Endpoint:** `GET /api/v1/batches/search`
* **Query Parameters (Filters):**
  * `orderIds` (Array of Strings)
* **Response Data:**
  * `batchId`, `status`, `roStatus`
  * `orderCount` (Number)
  * `orderIds` (Array of Strings)
  * `roStartTime`, `roEndTime`, `createdAt` (ISO Date)

---

## 4. สิ่งที่ฝั่ง Backend ต้องจัดการให้เรียบร้อย (Backend Requirements)

เพื่อให้การทำงานปลอดภัย 100% Backend Developer ต้องรับผิดชอบสิ่งเหล่านี้:
1. **Index Optimization:** Database ต้องมี Index สำหรับฟิลด์ที่มีการ Query บ่อย เช่น `storeCode`, `createdAt`, `consignment`, `jobId` ไม่เช่นนั้นถ้าลูกค้าหาช่วงเวลา 7 วัน DB อาจค้างได้
2. **Date Range Limit:** ฝั่ง Backend ต้องเขียนดักไว้เลยว่า `endDate - startDate` ห้ามเกิน 7 วัน (กันกรณี Hacker bypass หน้าบ้านแล้วส่งคำสั่งมา 1 ปีเพื่อกวาดข้อมูล)
3. **Array Limit:** ตัวแปรประเภท Array เช่น `values` (Order IDs) ควรรับได้จำกัด เช่น ไม่เกิน 100 รหัสต่อ 1 Request
4. **Rate Limiting:** จำกัดการยิง API ของ User ป้องกันการถูกโจมตีแบบ DDoS หรือสแปมดึงข้อมูล
