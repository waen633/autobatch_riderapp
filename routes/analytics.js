const { Router } = require('express');
const { getClient } = require('../lib/db');
const { splitCodes } = require('../lib/helpers');

const router = Router();

// helper: BKK midnight range for a date offset (0=today, -1=yesterday)
function dayRange(offsetDays = 0) {
  const now = new Date();
  const bkk = new Date(now.getTime() + 7 * 3600 * 1000);
  const base = new Date(bkk);
  base.setUTCDate(base.getUTCDate() + offsetDays);
  const ymd = base.toISOString().slice(0, 10);
  return {
    from: new Date(ymd + 'T00:00:00+07:00'),
    to:   new Date(ymd + 'T23:59:59+07:00'),
  };
}

// helper: pickup lag = time from job createdAt → first job_assigned status
function pickupLagMin(job) {
  if (!job.createdAt) return null;
  const assigned = (job.updateStatuses || []).find(s => s.status === 'job_assigned');
  if (!assigned?.updatedAt) return null;
  return (new Date(assigned.updatedAt) - new Date(job.createdAt)) / 60000;
}

// helper: delivery lag = job_assigned → job_completed
function deliveryLagMin(job) {
  const assigned = (job.updateStatuses || []).find(s => s.status === 'job_assigned');
  const completed = (job.updateStatuses || []).find(s => s.status === 'job_completed');
  if (!assigned?.updatedAt || !completed?.updatedAt) return null;
  return (new Date(completed.updatedAt) - new Date(assigned.updatedAt)) / 60000;
}

// helper: pick terminal status of a job
function isSLABreach(job) {
  if (!job.pickUpSLA || !job.updatedAt) return false;
  return new Date(job.updatedAt) > new Date(job.pickUpSLA);
}

// resolve storeCode strings → storeId ObjectIds (same pattern as routes/jobs.js)
async function resolveStoreIds(db, storeCodes) {
  const storeList = await db.db('lastmile').collection('stores')
    .find({ code: { $in: storeCodes } }, { projection: { _id: 1, code: 1 } })
    .toArray();
  return storeList.map(s => s._id);
}

async function fetchJobs(db, storeIds, from, to) {
  return db.db('4pl-oms').collection('autobatchingjobs').find({
    storeId: { $in: storeIds },
    createdAt: { $gte: from, $lte: to },
  }, {
    projection: {
      storeId: 1, status: 1, createdAt: 1, updatedAt: 1,
      pickUpSLA: 1, updateStatuses: 1,
      'assignment.rider.id': 1, 'assignment.rider.name': 1,
    }
  }).toArray();
}

// ─── GET /api/analytics/daily-summary ──────────────────────────────────────
router.get('/analytics/daily-summary', async (req, res) => {
  try {
    const { storeCode, date, compare } = req.query;
    if (!storeCode) return res.status(400).json({ error: 'storeCode required' });

    const codes = splitCodes(storeCode);
    const db = await getClient();
    const storeIds = await resolveStoreIds(db, codes);
    if (!storeIds.length) return res.json({ today: {totalJobs:0,completedJobs:0,completionRate:0,slaBreaches:0,avgPickupLagMin:null}, yesterday: {totalJobs:0,completedJobs:0,completionRate:0,slaBreaches:0,avgPickupLagMin:null}, delta: {totalJobsPct:null,completionRateDelta:0,slaBreachesDelta:0,avgPickupLagDelta:null} });

    const todayR = dayRange(0);
    const yesterR = dayRange(-1);

    // cut-off = ตอนนี้ (BKK), yesterday ตัดที่เวลาเดียวกัน → เปรียบ apples-to-apples
    const nowUtc = new Date();
    const todayTo   = nowUtc < todayR.to   ? nowUtc : todayR.to;
    const yesterCut = new Date(nowUtc.getTime() - 86400000); // เมื่อวาน เวลาเดียวกัน
    const yesterTo  = yesterCut < yesterR.to ? yesterCut : yesterR.to;

    const [todayJobs, yesterJobs] = await Promise.all([
      fetchJobs(db, storeIds, todayR.from, todayTo),
      fetchJobs(db, storeIds, yesterR.from, yesterTo),
    ]);

    function summarize(jobs) {
      const total = jobs.length;
      const completed = jobs.filter(j => j.status === 'job_completed').length;
      const slaBreaches = jobs.filter(isSLABreach).length;
      const lags = jobs.map(pickupLagMin).filter(v => v !== null && v >= 0);
      const avgPickupLagMin = lags.length ? lags.reduce((a, b) => a + b, 0) / lags.length : null;
      return {
        totalJobs: total,
        completedJobs: completed,
        completionRate: total ? Math.round(completed / total * 100) : 0,
        slaBreaches,
        avgPickupLagMin: avgPickupLagMin !== null ? Math.round(avgPickupLagMin * 10) / 10 : null,
      };
    }

    const today = summarize(todayJobs);
    const yesterday = summarize(yesterJobs);

    const delta = {
      totalJobsPct: yesterday.totalJobs ? Math.round((today.totalJobs - yesterday.totalJobs) / yesterday.totalJobs * 100) : null,
      completionRateDelta: today.completionRate - yesterday.completionRate,
      slaBreachesDelta: today.slaBreaches - yesterday.slaBreaches,
      avgPickupLagDelta: today.avgPickupLagMin !== null && yesterday.avgPickupLagMin !== null
        ? Math.round((today.avgPickupLagMin - yesterday.avgPickupLagMin) * 10) / 10
        : null,
    };

    res.json({ today, yesterday, delta });
  } catch (e) {
    console.error('[/api/analytics/daily-summary]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/analytics/hourly ─────────────────────────────────────────────
router.get('/analytics/hourly', async (req, res) => {
  try {
    const { storeCode, from, to } = req.query;
    if (!storeCode) return res.status(400).json({ error: 'storeCode required' });

    const codes = splitCodes(storeCode);
    const db = await getClient();
    const storeIds = await resolveStoreIds(db, codes);

    const fromDate = from ? new Date(from) : dayRange(0).from;
    const toDate   = to   ? new Date(to)   : dayRange(0).to;
    const prevFrom = new Date(fromDate.getTime() - 86400000);
    const prevTo   = new Date(toDate.getTime()   - 86400000);

    const [todayJobs, yesterJobs] = await Promise.all([
      fetchJobs(db, storeIds, fromDate, toDate),
      fetchJobs(db, storeIds, prevFrom, prevTo),
    ]);

    function bucketByHour(jobs) {
      const hours = {};
      for (let h = 0; h < 24; h++) hours[h] = { jobCount: 0, lags: [], riderIds: new Set(), slaBreaches: 0 };
      for (const job of jobs) {
        const bkkHour = (new Date(job.createdAt).getTime() / 3600000 + 7) % 24 | 0;
        hours[bkkHour].jobCount++;
        const lag = pickupLagMin(job);
        if (lag !== null && lag >= 0) hours[bkkHour].lags.push(lag);
        if (job.assignment?.rider?.id) hours[bkkHour].riderIds.add(job.assignment.rider.id.toString());
        if (isSLABreach(job)) hours[bkkHour].slaBreaches++;
      }
      return hours;
    }

    const todayBuckets  = bucketByHour(todayJobs);
    const yesterBuckets = bucketByHour(yesterJobs);

    // find peak hour (top 3 hours by job count)
    const sortedHours = Object.entries(todayBuckets)
      .sort((a, b) => b[1].jobCount - a[1].jobCount)
      .slice(0, 3)
      .map(x => parseInt(x[0]));
    const peakSet = new Set(sortedHours);

    const result = [];
    for (let h = 0; h < 24; h++) {
      const b = todayBuckets[h];
      const avgLag = b.lags.length ? b.lags.reduce((a, c) => a + c, 0) / b.lags.length : null;
      result.push({
        hour: h,
        jobCount: b.jobCount,
        yesterdayJobCount: yesterBuckets[h].jobCount,
        avgPickupLagMin: avgLag !== null ? Math.round(avgLag * 10) / 10 : null,
        isPeak: peakSet.has(h),
        isSlowPickup: avgLag !== null && avgLag > 15,
        activeRiderCount: b.riderIds.size,
        slaBreachCount: b.slaBreaches,
      });
    }

    res.json(result);
  } catch (e) {
    console.error('[/api/analytics/hourly]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/analytics/rider-score ────────────────────────────────────────
router.get('/analytics/rider-score', async (req, res) => {
  try {
    const { storeCode, from, to } = req.query;
    if (!storeCode) return res.status(400).json({ error: 'storeCode required' });

    const codes = splitCodes(storeCode);
    const db = await getClient();
    const storeIds = await resolveStoreIds(db, codes);

    // default: last 7 days
    const fromDate = from ? new Date(from) : dayRange(-6).from;
    const toDate   = to   ? new Date(to)   : dayRange(0).to;

    const jobs = await fetchJobs(db, storeIds, fromDate, toDate);

    // group by rider id from assignment.rider.id
    const byRider = {};
    for (const job of jobs) {
      const rid = job.assignment?.rider?.id;
      if (!rid) continue;
      const ridStr = rid.toString();
      if (!byRider[ridStr]) byRider[ridStr] = { name: job.assignment?.rider?.name || null, jobs: [] };
      byRider[ridStr].jobs.push(job);
    }

    const riderIds = Object.keys(byRider);

    const scores = riderIds.map(rid => {
      const { name: riderName, jobs: rJobs } = byRider[rid];
      const total = rJobs.length;
      const completed = rJobs.filter(j => j.status === 'job_completed').length;
      const cancelled = rJobs.filter(j => ['job_cancelled', 'cancelled'].includes(j.status)).length;
      const slaBreaches = rJobs.filter(isSLABreach).length;

      const acceptRate    = total ? completed / total : 0;
      const completionRate = total ? completed / total : 0;
      const cancelRate    = total ? cancelled / total : 0;
      const slaBreachRate = total ? slaBreaches / total : 0;

      const score = Math.round(
        (acceptRate * 0.4 + completionRate * 0.4 - slaBreachRate * 0.2) * 100
      );

      let recommendation = 'ปกติ';
      if (score < 30 || cancelRate > 0.3) recommendation = 'ติดตามด่วน';
      else if (score < 50) recommendation = 'ควรปรับปรุง';
      else if (score >= 75) recommendation = 'รับงานเพิ่มได้';

      return {
        riderId: rid,
        riderName: riderName || rid,
        score,
        total,
        completed,
        cancelled,
        slaBreaches,
        acceptRate: Math.round(acceptRate * 100),
        cancelRate: Math.round(cancelRate * 100),
        slaBreachRate: Math.round(slaBreachRate * 100),
        recommendation,
      };
    }).filter(r => r.total > 0).sort((a, b) => b.score - a.score);

    res.json(scores);
  } catch (e) {
    console.error('[/api/analytics/rider-score]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/analytics/delivery-speed ─────────────────────────────────────
// mode=daily (default): 7-day trend + prediction
// mode=hourly&date=YYYY-MM-DD: 24-hour breakdown for a specific date
router.get('/analytics/delivery-speed', async (req, res) => {
  try {
    const { storeCode, days = '7', mode, date } = req.query;
    if (!storeCode) return res.status(400).json({ error: 'storeCode required' });

    const codes = splitCodes(storeCode);
    const db = await getClient();
    const storeIds = await resolveStoreIds(db, codes);

    // ── HOURLY MODE ──────────────────────────────────────────────────────────
    if (mode === 'hourly') {
      const targetDate = date || new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
      const from = new Date(targetDate + 'T00:00:00+07:00');
      const to   = new Date(targetDate + 'T23:59:59+07:00');
      const jobs = await fetchJobs(db, storeIds, from, to);

      const buckets = Array.from({ length: 24 }, () => ({
        pickupLags: [], deliveryLags: [], riderIds: new Set(), slaBreaches: 0,
      }));

      for (const job of jobs) {
        const h = (new Date(job.createdAt).getTime() / 3600000 + 7) % 24 | 0;
        const pLag = pickupLagMin(job);
        const dLag = deliveryLagMin(job);
        if (pLag !== null && pLag >= 0 && pLag < 180) buckets[h].pickupLags.push(pLag);
        if (dLag !== null && dLag >= 0 && dLag < 300) buckets[h].deliveryLags.push(dLag);
        if (job.assignment?.rider?.id) buckets[h].riderIds.add(job.assignment.rider.id.toString());
        if (isSLABreach(job)) buckets[h].slaBreaches++;
      }

      const data = buckets.map((b, h) => ({
        hour: h,
        avgPickupLagMin:   b.pickupLags.length   ? Math.round(b.pickupLags.reduce((a, c) => a + c, 0)   / b.pickupLags.length   * 10) / 10 : null,
        avgDeliveryLagMin: b.deliveryLags.length ? Math.round(b.deliveryLags.reduce((a, c) => a + c, 0) / b.deliveryLags.length * 10) / 10 : null,
        activeRiderCount: b.riderIds.size,
        slaBreachCount:   b.slaBreaches,
      }));

      return res.json({ mode: 'hourly', date: targetDate, data });
    }

    // ── DAILY MODE (default) ─────────────────────────────────────────────────
    const numDays = Math.min(parseInt(days) || 7, 30);
    const results = [];

    for (let i = numDays - 1; i >= 0; i--) {
      const { from, to } = dayRange(-i);
      const jobs = await fetchJobs(db, storeIds, from, to);

      const pLags = jobs.map(pickupLagMin).filter(v => v !== null && v >= 0 && v < 180);
      const dLags = jobs.map(deliveryLagMin).filter(v => v !== null && v >= 0 && v < 300);

      const avgPickup   = pLags.length ? pLags.reduce((a, b) => a + b, 0) / pLags.length : null;
      const avgDelivery = dLags.length ? dLags.reduce((a, b) => a + b, 0) / dLags.length : null;

      const riderIds = new Set(jobs.map(j => j.assignment?.rider?.id?.toString()).filter(Boolean));
      const slaBreaches = jobs.filter(isSLABreach).length;

      const bkk = new Date(from.getTime() + 7 * 3600 * 1000);
      results.push({
        date: bkk.toISOString().slice(0, 10),
        avgPickupLagMin:   avgPickup   !== null ? Math.round(avgPickup   * 10) / 10 : null,
        avgDeliveryLagMin: avgDelivery !== null ? Math.round(avgDelivery * 10) / 10 : null,
        activeRiderCount: riderIds.size,
        slaBreachCount:   slaBreaches,
      });
    }

    // rolling avg 3 days for predictive next day
    const last3Pickup   = results.slice(-3).map(r => r.avgPickupLagMin).filter(v => v !== null);
    const last3Delivery = results.slice(-3).map(r => r.avgDeliveryLagMin).filter(v => v !== null);
    const predictedPickup   = last3Pickup.length   ? last3Pickup.reduce((a, b) => a + b, 0)   / last3Pickup.length   : null;
    const predictedDelivery = last3Delivery.length ? last3Delivery.reduce((a, b) => a + b, 0) / last3Delivery.length : null;

    const tomorrowBkk = new Date(dayRange(1).from.getTime() + 7 * 3600 * 1000);
    results.push({
      date: tomorrowBkk.toISOString().slice(0, 10),
      avgPickupLagMin: null, avgDeliveryLagMin: null, activeRiderCount: null, slaBreachCount: null,
      predicted: true,
      predictedPickupLagMin:   predictedPickup   !== null ? Math.round(predictedPickup   * 10) / 10 : null,
      predictedDeliveryLagMin: predictedDelivery !== null ? Math.round(predictedDelivery * 10) / 10 : null,
    });

    res.json({ mode: 'daily', data: results });
  } catch (e) {
    console.error('[/api/analytics/delivery-speed]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/analytics/demand-forecast ────────────────────────────────────
// predict tomorrow's job count per hour using 7-day same-weekday avg
router.get('/analytics/demand-forecast', async (req, res) => {
  try {
    const { storeCode, days = '7' } = req.query;
    if (!storeCode) return res.status(400).json({ error: 'storeCode required' });

    const codes = splitCodes(storeCode);
    const db = await getClient();
    const storeIds = await resolveStoreIds(db, codes);
    const numDays = Math.min(parseInt(days) || 7, 30);

    // collect hourly job counts for past N days
    const hourTotals = Array(24).fill(0);
    const hourCounts = Array(24).fill(0); // how many days had data for this hour

    for (let i = numDays; i >= 1; i--) {
      const { from, to } = dayRange(-i);
      const jobs = await fetchJobs(db, storeIds, from, to);
      if (!jobs.length) continue;

      const dayBuckets = Array(24).fill(0);
      for (const job of jobs) {
        const bkkHour = (new Date(job.createdAt).getTime() / 3600000 + 7) % 24 | 0;
        dayBuckets[bkkHour]++;
      }
      for (let h = 0; h < 24; h++) {
        hourTotals[h] += dayBuckets[h];
        if (dayBuckets[h] > 0) hourCounts[h]++;
      }
    }

    // predicted = weighted avg (simple mean across days that had data)
    const forecast = [];
    let totalPredicted = 0;
    for (let h = 0; h < 24; h++) {
      const predicted = hourCounts[h] > 0 ? Math.round(hourTotals[h] / numDays * 10) / 10 : 0;
      totalPredicted += predicted;
      forecast.push({ hour: h, predictedJobs: predicted });
    }

    // peak hours tomorrow = top 3
    const peaks = [...forecast].sort((a, b) => b.predictedJobs - a.predictedJobs).slice(0, 3);

    const tomorrowBkk = new Date(dayRange(1).from.getTime() + 7 * 3600 * 1000);
    res.json({
      date: tomorrowBkk.toISOString().slice(0, 10),
      totalPredictedJobs: Math.round(totalPredicted),
      peakHours: peaks.filter(h => h.predictedJobs > 0).map(h => ({ hour: h.hour, predictedJobs: h.predictedJobs })),
      hourly: forecast,
    });
  } catch (e) {
    console.error('[/api/analytics/demand-forecast]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
