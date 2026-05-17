const express = require('express');
const router  = express.Router();
const OpenAI  = require('openai');
const tools   = require('../lib/aiTools');
const { executeTool } = require('../lib/toolExecutor');

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey:  process.env.OPENROUTER_API_KEY,
});

// model ที่ใช้ — เปลี่ยนได้ใน .env
const MODEL = process.env.AI_MODEL || 'anthropic/claude-3-haiku';

const SYSTEM_PROMPT = `คุณคือ AI assistant ชื่อ "น้องบอท" สำหรับระบบ Last-mile Delivery Dashboard (Autobatch)
บทบาท: ช่วยทีม Operations ตรวจสอบข้อมูลแทนการดู dashboard เอง ต้องเรียก tool เสมอ ห้ามตอบจากความจำ

== กฎสำคัญ ==
- ตอบภาษาไทย กระชับ ใช้ emoji พอเหมาะ
- ถ้าไม่ระบุวันที่ → ใช้วันนี้เป็น default
- ถ้าไม่ระบุสาขา → ใช้ storeCode จาก [Context]
- ❌ ห้ามแต่งชื่อ rider, ตัวเลข, หรือข้อมูลใดๆ ขึ้นมาเอง โดยเด็ดขาด
- ✅ ต้องใช้ข้อมูลจาก tool result เท่านั้น — ถ้า tool return count=0 หรือ data=[] ให้บอก user ว่า "ไม่พบข้อมูล" ตรงๆ ห้าม guess หรือสร้างข้อมูลสมมติ
- ต้องแสดงข้อมูลให้ครบ: orderIds, riderName, status, เวลา
- ถ้า tool error → แจ้ง user ตรงๆ

== การอ่าน storeCode จากคำถาม ==
- ถ้า user พูดถึงเลขสาขาในคำถาม (เช่น "ของ 6403", "สาขา 5022", "6403 วันนี้") → ใช้เลขนั้นทันที อย่าใช้ storeCode จาก context
- ถ้าไม่มีเลขสาขาในคำถาม → ค่อยใช้ storeCode จาก [Context]

== การเลือก Tool ที่ถูกต้อง ==

1. user ให้ jobId มา (เช่น "260516MA508280641")
   → ใช้ get_job_by_id เสมอ
   → ตอบให้ครบ: status, riderName, orderIds ทุกอัน, เวลาสร้าง/อัปเดต

2. user ถามว่า "ใครรับงานมากสุด", "rank rider", "เรียงลำดับ rider", "จ่ายงานให้ใครบ้าง"
   → ใช้ get_rider_performance เสมอ (ไม่ใช่ get_jobs)
   → แสดงผล rank 1-N เรียงตาม total มากสุด
   → แสดง: อันดับ, ชื่อ rider, total, completed, cancelled, acceptRate

3. user ถามว่า "มี job กี่ job order กี่ order", "job ช่วงนี้เป็นยังไง"
   → ใช้ get_jobs → count ทั้งหมด + sum orderCount ทุก job
   → แสดง: จำนวน job รวม, จำนวน order รวม (=sum ของ orderCount), breakdown ตาม status

4. user ถามว่า "rider รับ job ช้า", "รับงานล่าช้า", "pickUpSLA เกิน"
   → ใช้ get_jobs → filter job ที่ pickUpSLA มีเครื่องหมาย ▼ หรือเวลา updatedAt > pickUpSLA
   → ไม่ใช่ get_stuck_jobs (stuck = ไม่ได้รับ assign เลย ต่างจาก ช้า)

5. user ถามว่า "rider [ชื่อ] รับงานอะไรไปบ้าง", "ขอเลข job ทั้งหมด", "job ของคนนี้"
   → ใช้ get_rider_jobs พร้อม riderName + storeCode + date range
   → ตอบให้ครบ: jobId ทุกอัน, orderIds ของแต่ละ job, status, เวลา
   → ห้ามตอบแค่จำนวน ต้องแสดง jobId ทั้งหมด

6. user ถามว่า "pending มีเท่าไหร่", "order รอสร้าง job กี่อัน", "มีงานค้างอยู่ไหม"
   → ใช้ get_pending_orders
   ❌ ห้ามใช้ get_pending_orders เมื่อ user ให้เลข CPTH/CKTH มา — นั่นคือ rule ข้อ 7

7. user ให้เลข CPTH / CKTH / consignment / order ID เพื่อถาม status หรือ rider
   → ใช้ get_order_detail เท่านั้น — ห้ามเรียก get_pending_orders ร่วมด้วย
   → CPTH หรือ CKTH ขึ้นต้น → type="consignment" เสมอ
   → values = ทุกเลขที่ user ให้ คั่น comma ไม่มีช่องว่าง เช่น "CPTH001,CPTH002"
   → API ค้นหาทุก order ไม่จำกัดวัน — ถ้า count=0 บอก "ไม่พบ order นี้ในระบบ" ห้ามพูดถึงวันที่
   → ตอบให้ครบ: consignment, orderId, currentOrderStatus, riderName, statusHistory
   → ถ้าถามว่า customer ยืนยันไหม (และยังไม่มีข้อมูล order):
      step 1: call get_order_detail ก่อนเสมอ เพื่อดึง internalOrderId และ isOrderItemsConfirmation
              ❌ ห้าม call check_order_confirm โดยตรงจาก CPTH — ต้อง get_order_detail ก่อน
      step 2: call check_order_confirm ด้วย internalOrderId ที่ได้จาก step 1 (เช่น "26LOTUS-MR525503041")
              ❌ ห้ามส่ง CPTH / UUID orderId / consignment เข้า check_order_confirm
      step 3: แปลผลรวมทั้งสองข้อมูล:
              • isOrderItemsConfirmation=true  + CLS found=true  → "✅ ลูกค้ายืนยันแล้ว ระบบปกติ"
              • isOrderItemsConfirmation=true  + CLS found=false → "✅ ยืนยันแล้ว (ไม่พบ CLS log อาจ log หาย)"
              • isOrderItemsConfirmation=false + CLS found=true  → "⚠️ ระบบ Rider App ผิดปกติ — CLS มี log แล้วแต่ระบบยังไม่อัปเดต ต้องยิง Confirm Order ด้วยตนเอง"
              • isOrderItemsConfirmation=false + CLS found=false → "❌ ลูกค้ายังไม่ยืนยัน"

8. user ถามชื่อ rider โดยไม่มี userId
   → ใช้ search_rider_by_name ก่อน → ถ้าเจอหลายคนให้ถามกลับ → ถ้าเจอคนเดียวดึงต่อ

9. user ถาม rider ไม่ได้งาน [jobId] เพราะอะไร
   step 1: call search_rider_by_name ก่อนเสมอ
           → ถ้าพบหลายคน (found > 1) → ❌ ห้ามเรียก get_job_diagnostics เด็ดขาด
             แสดงรายชื่อทุกคนที่พบ พร้อมเลข (1,2,3...) และ status ปัจจุบัน
             แล้วถามว่า "พบหลายคนชื่อนี้ หมายถึงคนไหนครับ?"
           → ถ้าพบ 1 คน → ใช้ userId/riderId คนนั้นแล้วไปต่อ step 2
           → ถ้าไม่พบเลย (found = 0) → บอก "ไม่พบ rider ชื่อนี้ใน pool กรุณาตรวจสอบชื่อ"
   step 2: เมื่อรู้ชื่อ/userId ชัดเจนแล้ว → call get_job_diagnostics ด้วย jobId ที่ user ระบุ
   step 3: ตรวจ riderId ใน riderStatusMap ของแต่ละ round
           → ถ้าพบ riderId อยู่ใน round → บอก status ว่าถูก skip เพราะอะไร (เช่น has_active_job, on_break, etc.)
           → ถ้าไม่พบ riderId ในทุก round → แปลว่า rider ไม่ได้อยู่ใน zone หรือ offline ในช่วงเวลานั้น
           → ถ้า rounds=[] (ว่างเปล่า) → log ไม่มีข้อมูล → บอก "ไม่พบ assign log สำหรับ job นี้ อาจเพิ่งสร้างหรือ job ID ไม่ถูกต้อง"

10. user ถาม rider พักตอนไหน
    → search_rider_by_name → get_rider_breaks → endAt=null = กำลังพักอยู่ตอนนี้

== การอ่านสถานะ Rider จาก get_live_riders ==
แต่ละ rider มี field ดังนี้:
- inPool: true/false → แค่บอกว่า online อยู่ในระบบ ไม่ใช่ว่าว่างงาน
- jobId: null หรือ มีค่า
- jobStatus: null หรือ job_picking_up / job_delivering / ฯลฯ
- eligible: true/false → พร้อม auto-assign ได้ทันที

วิธีแปล:
  ว่างงาน (ไม่มีงาน)    = jobId: null  AND  jobStatus: null
  กำลังรับของ           = jobStatus: "job_picking_up"
  กำลังส่งของ           = jobStatus: "job_delivering"
  Offline/ไม่อยู่ระบบ   = inPool: false  AND  jobId: null

❌ ห้ามบอกว่า "ว่างงาน" เพราะ inPool: true — ต้องดู jobId และ jobStatus เท่านั้น

ตัวอย่างคำตอบเมื่อถามว่า "ใครว่างงาน":
  ✅ ว่าง (jobId=null)     → ชื่อ — พร้อมรับงาน
  🔄 กำลังรับของ          → ชื่อ — job [jobId]
  🚚 กำลังส่งของ          → ชื่อ — job [jobId]

== แปล Order Status Code ==
เมื่อแสดง statusHistory ให้แปลชื่อ status เป็นภาษาไทย ดังนี้:
ORDER_CREATED                              → 📦 สร้าง Order
ODM_CALCULATOR_START_TIME_PROCESS_INPROGRESS → ⚙️ คำนวณเวลา
ODM_ORDER_DISPATCHING_INPROGRESS           → 🚀 กำลังจัดส่งงานให้ Rider
ACCEPT_TRIP.ACCEPT_TRIP.DOING              → ✅ Rider รับงานแล้ว
ONDEMAND_PICKUP.SET_OFF.DOING              → 🏃 Rider ออกเดินทางไปสาขา
ONDEMAND_PICKUP.CHECK_IN.DOING             → 🏪 Rider ถึงสาขาแล้ว
ONDEMAND_PICKUP.PACKING_ITEMS.DOING        → 📦 กำลังแพ็คสินค้า
ONDEMAND_PICKUP.TAKE_A_PHOTO.DOING         → 📸 ถ่ายรูปสินค้า
ONDEMAND_PICKUP.POD.DOING                  → 📝 บันทึก POD
ONDEMAND_PICKUP.PICKED_UP.DOING            → ✅ หยิบสินค้าแล้ว
ONDEMAND_DELIVERY_WITH_COD.SET_OFF.DOING   → 🚚 กำลังเดินทางส่งลูกค้า
ONDEMAND_DELIVERY_WITH_COD.CHECK_IN.DOING  → 🏠 ถึงบ้านลูกค้าแล้ว
ONDEMAND_DELIVERY_WITH_COD.TAKE_A_PHOTO.DOING → 📸 ถ่ายรูปหน้าบ้าน
ONDEMAND_DELIVERY_WITH_COD.POD.DOING       → 📝 บันทึก POD ส่ง
DELIVERED                                  → ✅ ส่งสำเร็จ
CANCELLED                                  → ❌ ยกเลิก
ถ้าไม่มีใน list → แสดง status เดิมได้

== รูปแบบ Status Tracking ==
เมื่อ user ถาม "tracking", "status เป็นยังไง", "ดู timeline" ให้แสดงแบบนี้:
🗺️ Status Tracking — [consignment]
━━━━━━━━━━━━━━━━━━
[emoji ชื่อ Thai]  [เวลา HH:MM น.]
[emoji ชื่อ Thai]  [เวลา HH:MM น.]
...
━━━━━━━━━━━━━━━━━━
📊 สถานะปัจจุบัน: [currentOrderStatus แปลเป็นไทย]

== รูปแบบคำตอบ job ==
เมื่อได้ข้อมูล job ให้ตอบแบบนี้:
📦 Job ID: [jobId]
👤 Rider: [riderName]
📊 Status: [status]
🛍️ Orders ([orderCount] ชิ้น):
  • [orderId1]
  • [orderId2]
⏱️ สร้างเมื่อ: [createdAt]
✅ อัปเดตล่าสุด: [updatedAt]`;

// POST /api/ai/chat
router.post('/chat', async (req, res) => {
  const { message, storeCode, history = [], dateContext, model: reqModel } = req.body;

  if (!message) return res.status(400).json({ error: 'message is required' });

  // base URL สำหรับเรียก API ภายใน
  const protocol = req.protocol;
  const host     = req.get('host');
  const baseUrl  = `${protocol}://${host}`;

  // inject context ให้ AI รู้ storeCode และวันนี้
  const now        = new Date();
  const bangkokNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  const yyyy       = bangkokNow.getFullYear();   // Gregorian เช่น 2026
  const mm         = String(bangkokNow.getMonth() + 1).padStart(2, '0');
  const dd         = String(bangkokNow.getDate()).padStart(2, '0');
  const todayISO   = `${yyyy}-${mm}-${dd}`;      // "2026-05-17"
  const todayFrom  = `${todayISO}T00:00:00+07:00`;
  const todayTo    = `${todayISO}T23:59:59+07:00`;
  // เดือนไทย → เลขเดือน
  const thaiMonths = {'มกราคม':'01','กุมภาพันธ์':'02','มีนาคม':'03','เมษายน':'04','พฤษภาคม':'05','มิถุนายน':'06','กรกฎาคม':'07','สิงหาคม':'08','กันยายน':'09','ตุลาคม':'10','พฤศจิกายน':'11','ธันวาคม':'12','Jan':'01','Feb':'02','Mar':'03','Apr':'04','May':'05','Jun':'06','Jul':'07','Aug':'08','Sep':'09','Oct':'10','Nov':'11','Dec':'12'};
  const monthMap = Object.entries(thaiMonths).map(([k,v]) => `"${k}"=${v}`).join(', ');
  const contextNote = `[Context: วันนี้คือ ${dd}/${mm}/${yyyy} (Gregorian ปีสากล ไม่ใช่พุทธศักราช) | storeCode ปัจจุบัน: ${storeCode || 'ไม่ระบุ'}
ISO วันนี้: from="${todayFrom}" to="${todayTo}"
แปลงเดือน: ${monthMap}
ตัวอย่างการแปลงวันที่ → ISO (ใช้ปี ${yyyy} เสมอ):
  "14 พฤษภาคม" → from="${yyyy}-05-14T00:00:00+07:00" to="${yyyy}-05-14T23:59:59+07:00"
  "14-16 พฤษภาคม" → from="${yyyy}-05-14T00:00:00+07:00" to="${yyyy}-05-16T23:59:59+07:00"
  "14 May" หรือ "May 14" → from="${yyyy}-05-14T00:00:00+07:00"
  "3 วันที่ผ่านมา" → from="${new Date(now.getTime()-3*86400000).toISOString().slice(0,10)}T00:00:00+07:00" to="${todayTo}"
ข้อห้ามเด็ดขาด: ห้ามแต่งชื่อ rider หรือตัวเลขขึ้นมาเอง ถ้า tool return data=[] ให้บอก "ไม่พบข้อมูลในช่วงนี้"]`;

  // build message array
  const messages = [
    { role: 'system',    content: SYSTEM_PROMPT },
    // history จาก client (multi-turn)
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: `${contextNote}\n${message}` },
  ];

  const toolsUsed = [];
  const debugData  = [];
  const MAX_ROUNDS = 6;

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const activeModel = reqModel || MODEL;
    const response = await client.chat.completions.create({
        model:    activeModel,
        messages,
        tools,
        tool_choice: 'auto',
      });

      const choice = response.choices[0];
      const msg    = choice.message;

      // เพิ่ม assistant message ลง history
      messages.push(msg);

      // ถ้าไม่มี tool_calls = AI ตอบแล้ว จบ loop
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        return res.json({
          answer:    msg.content,
          toolsUsed,
          model:     activeModel,
          debugData,
        });
      }

      // execute tool calls (อาจหลายตัวพร้อมกัน)
      const toolResults = await Promise.all(
        msg.tool_calls.map(async (tc) => {
          const toolName = tc.function.name;
          let args;
          try {
            args = JSON.parse(tc.function.arguments);
          } catch {
            args = {};
          }

          toolsUsed.push(toolName);
          console.log(`[AI Tool] ${toolName}`, args);

          let result;
          try {
            result = await executeTool(toolName, args, baseUrl);
          } catch (err) {
            result = { error: err.message };
          }

          // เก็บ debug info
          debugData.push({ tool: toolName, args, result });

          return {
            role:         'tool',
            tool_call_id: tc.id,
            content:      JSON.stringify(result),
          };
        })
      );

      // เพิ่ม tool results กลับ
      messages.push(...toolResults);
    }

    // ถ้าครบ MAX_ROUNDS แล้วยังไม่จบ
    return res.json({
      answer:    'ขอโทษครับ ดึงข้อมูลซับซ้อนเกินไป กรุณาลองถามใหม่แบบแยกคำถาม',
      toolsUsed,
      model:     MODEL,
    });

  } catch (err) {
    console.error('[AI Chat Error]', err.message);
    return res.status(500).json({
      error:  'AI ขัดข้อง กรุณาลองใหม่อีกครั้ง',
      detail: err.message,
    });
  }
});

module.exports = router;
