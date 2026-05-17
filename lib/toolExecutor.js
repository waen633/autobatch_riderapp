// Tool Executor — รับ tool_call จาก AI แล้วเรียก dashboard API จริง
const { distance } = require('fastest-levenshtein');

// helper: วันนี้ตั้งแต่ 00:00 ถึง 23:59 UTC+7
function todayRange() {
  const now = new Date();
  // offset to Asia/Bangkok UTC+7
  const bkk = new Date(now.getTime() + 7 * 3600 * 1000);
  const ymd  = bkk.toISOString().slice(0, 10); // "2025-05-17"
  const from = new Date(ymd + 'T00:00:00+07:00').toISOString();
  const to   = new Date(ymd + 'T23:59:59+07:00').toISOString();
  return { from, to };
}

// helper: fetch JSON จาก API ภายใน
async function fetchAPI(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error ${res.status}: ${url}`);
  return res.json();
}

// fuzzy score 0–1 (1 = เหมือนกันเป๊ะ)
function fuzzyScore(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const dist = distance(a, b);
  return 1 - dist / maxLen;
}

async function executeTool(toolName, args, baseUrl) {
  const { from: todayFrom, to: todayTo } = todayRange();

  switch (toolName) {

    case 'get_pending_orders': {
      const data = await fetchAPI(
        `${baseUrl}/api/pending?storeCode=${encodeURIComponent(args.storeCode)}`
      );
      return data;
    }

    case 'get_jobs': {
      const from = args.from || todayFrom;
      const to   = args.to   || todayTo;
      const data = await fetchAPI(
        `${baseUrl}/api/jobs?storeCode=${encodeURIComponent(args.storeCode)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      );
      if (data.data) {
        data.data = data.data.map(j => ({
          jobId:        j.jobId,
          storeCode:    j.storeCode,
          riderName:    j.riderName,
          riderId:      j.riderId,
          orderIds:     j.orderIds || [],
          orderCount:   j.orderCount,
          status:       j.status,
          pickUpSLA:    j.pickUpSLA,
          deliverySLA:  j.deliverySLA,
          createdAt:    j.createdAt,
          updatedAt:    j.updatedAt,
        }));
      }
      return data;
    }

    case 'get_job_by_id': {
      // ค้น job จาก jobId โดย scan ย้อนหลัง 7 วัน
      const now = new Date();
      const from7 = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();
      const to7   = now.toISOString();
      const data  = await fetchAPI(
        `${baseUrl}/api/jobs?storeCode=${encodeURIComponent(args.storeCode)}&from=${encodeURIComponent(from7)}&to=${encodeURIComponent(to7)}`
      );
      const job = (data.data || []).find(j => j.jobId === args.jobId);
      if (!job) return { found: false, jobId: args.jobId };
      return {
        found: true,
        job: {
          jobId:       job.jobId,
          storeCode:   job.storeCode,
          riderName:   job.riderName,
          riderId:     job.riderId,
          orderIds:    job.orderIds || [],
          orderCount:  job.orderCount,
          status:      job.status,
          pickUpSLA:   job.pickUpSLA,
          deliverySLA: job.deliverySLA,
          createdAt:   job.createdAt,
          updatedAt:   job.updatedAt,
        }
      };
    }

    case 'get_stuck_jobs': {
      const from = args.from || todayFrom;
      const to   = args.to   || todayTo;
      const data = await fetchAPI(
        `${baseUrl}/api/stuck?storeCode=${encodeURIComponent(args.storeCode)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      );
      return data;
    }

    case 'get_order_detail': {
      const data = await fetchAPI(
        `${baseUrl}/api/orders?type=${encodeURIComponent(args.type)}&values=${encodeURIComponent(args.values)}`
      );
      // ตัด rawResults (polyline) ออก ไม่จำเป็นสำหรับ AI
      if (data.data) {
        data.data = data.data.map(o => ({
          orderId:              o.orderId,
          consignment:          o.consignment,
          storeCode:            o.storeCode,
          currentOrderStatus:   o.currentOrderStatus,
          isOrderItemsConfirmation: o.isOrderItemsConfirmation,
          riderName:            o.riderName,
          riderId:              o.riderId,
          paymentMethod:        o.paymentMethod,
          codAmount:            o.codAmount,
          createdAt:            o.createdAt,
          updatedAt:            o.updatedAt,
          statusHistory:        (o.statusHistory || []).map(s => ({
            status:    s.status,
            updatedAt: s.updatedAt,
          })),
        }));
      }
      return data;
    }

    case 'check_order_confirm': {
      const data = await fetchAPI(
        `${baseUrl}/api/order-confirm-check?orderId=${encodeURIComponent(args.orderId)}`
      );
      return data;
    }

    case 'get_riders': {
      const data = await fetchAPI(
        `${baseUrl}/api/riders?storeCode=${encodeURIComponent(args.storeCode)}`
      );
      if (data.data) {
        data.data = data.data.map(r => ({
          userId:                r.userId,
          name:                  r.name,
          username:              r.username,
          storeCode:             r.storeCode,
          queue:                 r.queue,
          status:                r.status,
          ready_for_auto_assign: r.ready_for_auto_assign,
          staff_online:          r.staff_online,
          no_active_job:         r.no_active_job,
          not_on_break:          r.not_on_break,
          not_banned:            r.not_banned,
          job_on_hand_id:        r.job_on_hand_id,
          job_on_hand_status:    r.job_on_hand_status,
          join_pool_at:          r.join_pool_at,
        }));
      }
      return data;
    }

    case 'get_live_riders': {
      const data = await fetchAPI(
        `${baseUrl}/api/live?storeCode=${encodeURIComponent(args.storeCode)}`
      );
      // ไม่ต้องตัด — ข้อมูล live compact อยู่แล้ว
      return data;
    }

    case 'get_rider_performance': {
      const from = args.from || todayFrom;
      const to   = args.to   || todayTo;
      const data = await fetchAPI(
        `${baseUrl}/api/rider-performance?storeCode=${encodeURIComponent(args.storeCode)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      );
      return data;
    }

    case 'get_rider_breaks': {
      let url = `${baseUrl}/api/rider-breaks?userId=${encodeURIComponent(args.userId)}&from=${encodeURIComponent(args.from)}`;
      if (args.to) url += `&to=${encodeURIComponent(args.to)}`;
      const data = await fetchAPI(url);
      return data;
    }

    case 'get_job_diagnostics': {
      const hours = args.hours || 24;
      const data = await fetchAPI(
        `${baseUrl}/api/job-diagnostics?jobId=${encodeURIComponent(args.jobId)}&hours=${hours}`
      );
      return data;
    }

    case 'get_rider_jobs': {
      const from = args.from || todayFrom;
      const to   = args.to   || todayTo;
      const data = await fetchAPI(
        `${baseUrl}/api/jobs?storeCode=${encodeURIComponent(args.storeCode)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      );
      const allJobs = data.data || [];

      // filter by riderId exact หรือ riderName fuzzy
      let matched = allJobs;
      if (args.riderId) {
        matched = allJobs.filter(j => j.riderId === args.riderId);
      } else if (args.riderName) {
        const q = args.riderName.toLowerCase();
        matched = allJobs.filter(j => {
          const n = (j.riderName || '').toLowerCase();
          return n.includes(q) || fuzzyScore(n, q) > 0.45;
        });
      }

      const totalOrders = matched.reduce((s, j) => s + (j.orderCount || 0), 0);

      return {
        riderName:   matched.length > 0 ? matched[0].riderName : null,
        totalJobs:   matched.length,
        totalOrders,
        jobs: matched.map(j => ({
          jobId:      j.jobId,
          status:     j.status,
          orderCount: j.orderCount,
          orderIds:   j.orderIds || [],
          pickUpSLA:  j.pickUpSLA,
          deliverySLA: j.deliverySLA,
          createdAt:  j.createdAt,
          updatedAt:  j.updatedAt,
        }))
      };
    }

    case 'search_rider_by_name': {
      // ดึง riders ทั้งหมดของสาขา แล้วทำ fuzzy match
      const data = await fetchAPI(
        `${baseUrl}/api/riders?storeCode=${encodeURIComponent(args.storeCode)}`
      );
      const query = args.name.toLowerCase().trim();
      const riders = data.data || [];

      const scored = riders.map(r => {
        const fullName = (r.name || '').toLowerCase();
        const username = (r.username || '').toLowerCase();
        // คะแนนสูงสุดจาก: fuzzy ชื่อ, contains, fuzzy username
        const s1 = fuzzyScore(fullName, query);
        const s2 = fullName.includes(query) ? 0.9 : 0;
        const s3 = fuzzyScore(username, query);
        return { rider: r, score: Math.max(s1, s2, s3) };
      });

      const matches = scored
        .filter(x => x.score > 0.35)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(x => ({
          userId:    x.rider.userId,
          name:      x.rider.name,
          username:  x.rider.username,
          storeCode: x.rider.storeCode,
          queue:     x.rider.queue,
          status:    x.rider.status,
          job_on_hand_id:     x.rider.job_on_hand_id,
          job_on_hand_status: x.rider.job_on_hand_status,
          score: Math.round(x.score * 100),
        }));

      return {
        query: args.name,
        found: matches.length,
        matches,
      };
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

module.exports = { executeTool };
