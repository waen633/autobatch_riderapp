const { Router } = require('express');
const { ObjectId } = require('mongodb');
const { getClient } = require('../lib/db');
const { safeStr, splitCodes } = require('../lib/helpers');
const { evalEligibility } = require('../lib/eligibility');

const router = Router();

// In-memory audit log (survives server restarts only in process lifetime)
const activityLog = [];
const MAX_LOG = 500;

function pushLog(entry) {
  activityLog.unshift({ ...entry, timestamp: new Date().toISOString() });
  if (activityLog.length > MAX_LOG) activityLog.pop();
}

// ─────────────────────────────────────────────────────────────
// GET /api/dispatch/orders?storeCode=
// Pending orders enriched with order metadata
// ─────────────────────────────────────────────────────────────
router.get('/dispatch/orders', async (req, res) => {
  try {
    const storeCodes = splitCodes(req.query.storeCode);
    if (!storeCodes.length) return res.status(400).json({ error: 'storeCode required' });

    const c = await getClient();
    const codeFilter = storeCodes.length === 1 ? storeCodes[0] : { $in: storeCodes };

    // Pending (not yet batched)
    const pending = await c.db('4pl-oms').collection('pendingorders')
      .find(
        { storeCode: codeFilter, deleted: { $ne: true } },
        { projection: { orderId: 1, consignment: 1, serviceType: 1, storeCode: 1, createdAt: 1, batchId: 1 } }
      )
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();

    // Enrich with order metadata (customer name, delivery address, SLA)
    const consignments = pending.map(p => p.consignment).filter(Boolean);
    let orderMeta = {};
    if (consignments.length) {
      const orders = await c.db('4pl-oms').collection('orders')
        .find(
          { 'workflowInput.metadata.consignment': { $in: consignments }, orderReferenceId: { $exists: false } },
          {
            projection: {
              'workflowInput.metadata.consignment': 1,
              'workflowInput.metadata.orderId': 1,
              'workflowInput.tasks': 1,
              'metadata.staff.name': 1,
              'metadata.staff.riderId': 1,
              currentOrderStatus: 1,
              createdAt: 1,
              sla: 1,
            }
          }
        )
        .toArray();

      orders.forEach(o => {
        const cons = o.workflowInput?.metadata?.consignment;
        if (!cons) return;
        const delivTask = (o.workflowInput?.tasks || []).find(t => t.direction === 'DELIVERY');
        orderMeta[cons] = {
          customerName: delivTask?.contactName || delivTask?.name || 'N/A',
          deliveryAddress: delivTask?.address || delivTask?.location?.address || 'N/A',
          deliveryLat: delivTask?.lat || null,
          deliveryLng: delivTask?.lng || null,
          riderName: o.metadata?.staff?.name || null,
          riderId: o.metadata?.staff?.riderId ? safeStr(o.metadata.staff.riderId) : null,
          currentStatus: o.currentOrderStatus || null,
          sla: o.sla || null,
          internalOrderId: o.workflowInput?.metadata?.orderId || null,
        };
      });
    }

    const data = pending.map(p => {
      const meta = orderMeta[p.consignment] || {};
      const createdAt = p.createdAt ? new Date(p.createdAt) : null;
      const slaMs = 60 * 60 * 1000; // default SLA 60 min
      const slaDue = createdAt ? new Date(createdAt.getTime() + slaMs) : null;
      const now = new Date();
      const ageMin = createdAt ? Math.floor((now - createdAt) / 60000) : null;
      return {
        orderId: p.orderId || null,
        consignment: p.consignment || null,
        internalOrderId: meta.internalOrderId || null,
        storeCode: p.storeCode,
        serviceType: p.serviceType || null,
        createdAt: p.createdAt || null,
        slaDue: slaDue ? slaDue.toISOString() : null,
        ageMin,
        batchId: p.batchId || null,
        phase: p.batchId ? 'batched' : 'pending',
        customerName: meta.customerName || 'N/A',
        deliveryAddress: meta.deliveryAddress || 'N/A',
        deliveryLat: meta.deliveryLat || null,
        deliveryLng: meta.deliveryLng || null,
        currentStatus: meta.currentStatus || 'pending',
        assignedRiderName: meta.riderName || null,
        assignedRiderId: meta.riderId || null,
      };
    });

    res.json({ count: data.length, data });
  } catch (e) {
    console.error('[/api/dispatch/orders]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/dispatch/eligible-riders?storeCode=
// Returns eligible riders for manual assignment
// ─────────────────────────────────────────────────────────────
router.get('/dispatch/eligible-riders', async (req, res) => {
  try {
    const storeCodes = splitCodes(req.query.storeCode);
    if (!storeCodes.length) return res.status(400).json({ error: 'storeCode required' });

    const c = await getClient();

    // Reuse store/cluster lookup from riders route pattern
    const zones = await c.db('4pl-address-and-zoning').collection('geographies')
      .find(
        { storeCode: { $in: storeCodes }, deleted: { $ne: true }, areaPath: { $exists: true, $ne: ',,' } },
        { projection: { _id: 0, storeCode: 1, areaPath: 1 } }
      ).toArray();

    const storeClusterMap = {};
    zones.forEach(z => {
      const clusters = (z.areaPath || '').split(',').map(x => x.trim()).filter(x => /^[a-f0-9]{24}$/i.test(x));
      if (!storeClusterMap[z.storeCode]) storeClusterMap[z.storeCode] = new Set();
      clusters.forEach(x => storeClusterMap[z.storeCode].add(x));
    });

    const eligible = [];
    for (const [code, clusterSet] of Object.entries(storeClusterMap)) {
      const clusterList = Array.from(clusterSet).map(id => new ObjectId(id));
      const staffs = await c.db('4pl-fleet').collection('staffs')
        .find(
          { 'metaData.shifts.clusterId': { $in: clusterList }, status: 'ONLINE' },
          { projection: { _id: 0, userId: 1, username: 1, firstname: 1, lastname: 1, phone: 1, breakAt: 1 } }
        ).toArray();

      const staffUserIds = staffs.map(s => s.userId).filter(Boolean);
      if (!staffUserIds.length) continue;

      const [jobs, pools] = await Promise.all([
        c.db('4pl-oms').collection('autobatchingjobs')
          .find(
            { 'assignment.rider.id': { $in: staffUserIds }, status: { $in: ['job_accepted', 'job_assigned', 'job_picking_up', 'job_picked_up', 'job_delivering'] } },
            { projection: { _id: 0, jobId: 1, status: 1, 'assignment.rider.id': 1 } }
          ).toArray(),
        c.db('4pl-oms').collection('autobatchingriderpools')
          .find({ userId: { $in: staffUserIds } }, { projection: { _id: 0, userId: 1, status: 1, createdAt: 1 } })
          .toArray()
      ]);

      const activeJobMap = new Map();
      jobs.forEach(j => {
        const rid = safeStr(j.assignment?.rider?.id);
        if (rid && !activeJobMap.has(rid)) activeJobMap.set(rid, { jobId: j.jobId, status: j.status });
      });

      const poolMap = {};
      pools.forEach(p => { poolMap[safeStr(p.userId)] = p; });

      staffs.forEach(staff => {
        const uid = safeStr(staff.userId);
        const pool = poolMap[uid] || null;
        const { flags, eligible: isEligible } = evalEligibility(uid, pool, new Date(), activeJobMap, staff);
        eligible.push({
          userId: uid,
          name: `${staff.firstname || ''} ${staff.lastname || ''}`.trim() || staff.username || uid,
          phone: staff.phone || '',
          storeCode: code,
          eligible: isEligible,
          inPool: !!pool,
          flags,
          jobOnHand: activeJobMap.get(uid) || null,
        });
      });
    }

    res.json({ count: eligible.length, data: eligible });
  } catch (e) {
    console.error('[/api/dispatch/eligible-riders]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/dispatch/reassign
// Log manual reassignment action (audit trail)
// Body: { orderId, consignment, storeCode, fromRiderId, fromRiderName,
//         toRiderId, toRiderName, reason, dispatcherName }
// ─────────────────────────────────────────────────────────────
router.post('/dispatch/reassign', async (req, res) => {
  try {
    const { orderId, consignment, storeCode, fromRiderId, fromRiderName,
            toRiderId, toRiderName, reason, dispatcherName } = req.body;

    if (!storeCode || !toRiderId) {
      return res.status(400).json({ error: 'storeCode and toRiderId are required' });
    }

    // Validate target rider eligibility
    const c = await getClient();
    const zones = await c.db('4pl-address-and-zoning').collection('geographies')
      .find(
        { storeCode, deleted: { $ne: true }, areaPath: { $exists: true, $ne: ',,' } },
        { projection: { _id: 0, areaPath: 1 } }
      ).toArray();

    const clusterSet = new Set();
    zones.forEach(z => {
      (z.areaPath || '').split(',').map(x => x.trim()).filter(x => /^[a-f0-9]{24}$/i.test(x))
        .forEach(x => clusterSet.add(x));
    });

    let riderObj = null;
    try {
      riderObj = await c.db('4pl-fleet').collection('staffs')
        .findOne({ userId: new ObjectId(toRiderId) }, { projection: { userId: 1, firstname: 1, lastname: 1, breakAt: 1, status: 1 } });
    } catch (_) {}

    const activeJob = await c.db('4pl-oms').collection('autobatchingjobs')
      .findOne({ 'assignment.rider.id': riderObj?.userId, status: { $in: ['job_accepted', 'job_assigned', 'job_picking_up', 'job_picked_up', 'job_delivering'] } });

    const activeJobMap = new Map();
    if (activeJob) activeJobMap.set(toRiderId, { jobId: activeJob.jobId, status: activeJob.status });

    const pool = await c.db('4pl-oms').collection('autobatchingriderpools')
      .findOne({ userId: riderObj?.userId });

    const { eligible, flags } = evalEligibility(toRiderId, pool, new Date(), activeJobMap, riderObj);

    if (!eligible) {
      const reasons = Object.entries(flags).filter(([, v]) => !v).map(([k]) => k).join(', ');
      return res.status(422).json({ error: `Rider not eligible: ${reasons}`, flags });
    }

    const logEntry = {
      action: 'manual_reassign',
      orderId: orderId || null,
      consignment: consignment || null,
      storeCode,
      fromRiderId: fromRiderId || null,
      fromRiderName: fromRiderName || null,
      toRiderId,
      toRiderName: toRiderName || null,
      reason: reason || null,
      dispatcherName: dispatcherName || 'Dispatcher',
      eligibilityFlags: flags,
      result: 'logged',
    };

    pushLog(logEntry);
    res.json({ success: true, message: 'Reassignment logged. Please confirm via ops system.', log: logEntry });
  } catch (e) {
    console.error('[/api/dispatch/reassign]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/dispatch/activity-log?storeCode=&days=7&limit=100
// Merges real DB manual-dispatch jobs + in-memory session log
// ─────────────────────────────────────────────────────────────
router.get('/dispatch/activity-log', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, MAX_LOG);
  const days  = Math.min(parseInt(req.query.days) || 7, 30);
  const storeCodes = splitCodes(req.query.storeCode);

  // Always return in-memory log if no storeCode provided
  if (!storeCodes.length) {
    return res.json({ count: activityLog.length, data: activityLog.slice(0, limit) });
  }

  try {
    const c = await getClient();
    const fromDate = new Date(Date.now() - days * 86400000);

    // Resolve storeIds
    const storeList = await c.db('lastmile').collection('stores')
      .find({ code: { $in: storeCodes } }, { projection: { _id: 1, code: 1 } }).toArray();
    const storeIdToCode = {};
    storeList.forEach(s => { storeIdToCode[safeStr(s._id)] = s.code; });
    const storeIds = storeList.map(s => s._id);

    // Query manual-dispatch jobs from DB
    const manualJobs = storeIds.length ? await c.db('4pl-oms').collection('autobatchingjobs')
      .find(
        { storeId: { $in: storeIds }, 'assignment.assigner.type': 'dispatcher', createdAt: { $gte: fromDate } },
        { projection: {
          jobId: 1, orderIds: 1, status: 1, createdAt: 1,
          'assignment.rider.id': 1, 'assignment.rider.name': 1,
          'assignment.assigner.userId': 1, 'assignment.assigner.name': 1,
          storeId: 1,
        }}
      )
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray() : [];

    const dbEntries = manualJobs.map(j => ({
      source:        'db',
      action:        'manual_reassign',
      timestamp:     j.createdAt ? new Date(j.createdAt).toISOString() : null,
      jobId:         j.jobId || null,
      orderIds:      Array.isArray(j.orderIds) ? j.orderIds : [],
      storeCode:     storeIdToCode[safeStr(j.storeId)] || safeStr(j.storeId),
      toRiderId:     j.assignment?.rider?.id ? safeStr(j.assignment.rider.id) : null,
      toRiderName:   j.assignment?.rider?.name || null,
      dispatcherName: j.assignment?.assigner?.name || j.assignment?.assigner?.userId || 'Dispatcher',
      jobStatus:     j.status || null,
      result:        'dispatched',
    }));

    // Merge with in-memory session log (most recent first)
    const sessionEntries = activityLog.slice(0, limit);
    const merged = [...sessionEntries, ...dbEntries]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);

    res.json({ count: merged.length, data: merged });
  } catch (e) {
    console.error('[/api/dispatch/activity-log]', e.message);
    // Fallback to in-memory only on error
    res.json({ count: activityLog.length, data: activityLog.slice(0, limit) });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/dispatch/break-events
// ?userIds=id1,id2,...  — batch query by userId directly (fast path)
// ?storeCode=xxx&since=<ISO>  — fallback: resolve from store cluster
//
// Frontend should prefer passing userIds (already known from eligible-riders call)
// to avoid redundant zone+staff lookups.
// ─────────────────────────────────────────────────────────────
router.get('/dispatch/break-events', async (req, res) => {
  try {
    const since = req.query.since ? new Date(req.query.since) : (() => {
      const d = new Date(); d.setHours(0, 0, 0, 0); return d;
    })();
    const c = await getClient();

    let staffUserIds = [];
    let nameMap = {};

    // Fast path: frontend passes userIds directly (already resolved from eligible-riders)
    if (req.query.userIds) {
      const rawIds = req.query.userIds.split(',').map(s => s.trim()).filter(Boolean);
      rawIds.forEach(id => {
        try { staffUserIds.push(new ObjectId(id)); } catch (_) {}
      });
      // Fetch names in one batch
      if (staffUserIds.length) {
        const staffs = await c.db('4pl-fleet').collection('staffs')
          .find({ userId: { $in: staffUserIds } }, { projection: { _id: 0, userId: 1, firstname: 1, lastname: 1 } })
          .toArray();
        staffs.forEach(s => { nameMap[safeStr(s.userId)] = `${s.firstname || ''} ${s.lastname || ''}`.trim(); });
      }
    } else {
      // Fallback: resolve from storeCode → zones → clusters → staffs
      const storeCodes = splitCodes(req.query.storeCode);
      if (!storeCodes.length) return res.status(400).json({ error: 'userIds or storeCode required' });

      const zones = await c.db('4pl-address-and-zoning').collection('geographies')
        .find({ storeCode: { $in: storeCodes }, deleted: { $ne: true }, areaPath: { $exists: true, $ne: ',,' } }, { projection: { _id: 0, areaPath: 1 } })
        .toArray();
      const clusterSet = new Set();
      zones.forEach(z => {
        (z.areaPath || '').split(',').map(x => x.trim()).filter(x => /^[a-f0-9]{24}$/i.test(x)).forEach(x => clusterSet.add(x));
      });
      const clusterList = Array.from(clusterSet).map(id => new ObjectId(id));
      const staffs = await c.db('4pl-fleet').collection('staffs')
        .find({ 'metaData.shifts.clusterId': { $in: clusterList }, status: 'ONLINE' }, { projection: { _id: 0, userId: 1, firstname: 1, lastname: 1 } })
        .toArray();
      staffUserIds = staffs.map(s => s.userId).filter(Boolean);
      staffs.forEach(s => { nameMap[safeStr(s.userId)] = `${s.firstname || ''} ${s.lastname || ''}`.trim(); });
    }

    if (!staffUserIds.length) return res.json({ events: [] });

    // Single batch query: all breaks for these riders in range
    const breakDocs = await c.db('4pl-fleet').collection('riderbreaklogs')
      .find({
        userId: { $in: staffUserIds },
        deleted: { $ne: true },
        $or: [{ startAt: { $gte: since } }, { endAt: { $gte: since } }],
      }, { projection: { userId: 1, startAt: 1, endAt: 1 } })
      .sort({ startAt: -1 })
      .limit(100)
      .toArray();

    const events = breakDocs.map(b => ({
      userId:     safeStr(b.userId),
      riderName:  nameMap[safeStr(b.userId)] || safeStr(b.userId),
      startAt:    b.startAt || null,
      endAt:      b.endAt   || null,
      type:       b.endAt && new Date(b.endAt) >= since ? 'break_end' : 'break_start',
      active:     !b.endAt,
    }));

    res.json({ events });
  } catch (e) {
    console.error('[/api/dispatch/break-events]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/dispatch/rider-performance?storeCode=&from=&to=
// Enhanced metrics: on-time, avg delivery time, travel distance, break time
// ─────────────────────────────────────────────────────────────
router.get('/dispatch/rider-performance', async (req, res) => {
  try {
    const { from, to } = req.query;
    const storeCodes = splitCodes(req.query.storeCode);
    if (!storeCodes.length || !from || !to) return res.status(400).json({ error: 'storeCode, from, to required' });

    const fromDate = new Date(from);
    const toDate = new Date(to);
    const c = await getClient();

    const storeList = await c.db('lastmile').collection('stores')
      .find({ code: { $in: storeCodes } }, { projection: { _id: 1, code: 1 } }).toArray();
    if (!storeList.length) return res.status(404).json({ error: 'No stores found' });

    const storeIdToCode = {};
    storeList.forEach(s => { storeIdToCode[safeStr(s._id)] = s.code; });
    const storeIds = storeList.map(s => s._id);

    const COMPLETED = ['job_delivered', 'job_completed'];

    const pipeline = [
      { $match: { storeId: { $in: storeIds }, createdAt: { $gte: fromDate, $lt: toDate }, 'assignment.rider.id': { $exists: true, $ne: null } } },
      { $group: {
        _id: { riderId: '$assignment.rider.id', storeId: '$storeId' },
        riderName:       { $first: '$assignment.rider.name' },
        total:           { $sum: 1 },
        completed:       { $sum: { $cond: [{ $in: ['$status', COMPLETED] }, 1, 0] } },
        cancelled:       { $sum: { $cond: [{ $eq: ['$status', 'job_cancelled'] }, 1, 0] } },
        totalDistanceM:  { $sum: { $ifNull: ['$routeOptimizationResult.totalDistance', 0] } },
        totalDurationS:  { $sum: { $ifNull: ['$routeOptimizationResult.travelDuration', 0] } },
        // On-time: delivered before sla
        onTime: { $sum: {
          $cond: [{
            $and: [
              { $in: ['$status', COMPLETED] },
              { $ne: ['$sla', null] },
              { $lte: ['$updatedAt', '$sla'] }
            ]
          }, 1, 0]
        }},
        completedWithSla: { $sum: { $cond: [{ $and: [{ $in: ['$status', COMPLETED] }, { $ne: ['$sla', null] }] }, 1, 0] } },
      }},
      { $addFields: {
        accepted:        { $add: ['$completed', { $subtract: ['$total', { $add: ['$completed', '$cancelled'] }] }] },
        cancelRate:      { $round: [{ $multiply: [{ $divide: ['$cancelled', { $max: ['$total', 1] }] }, 100] }, 1] },
        completionRate:  { $round: [{ $multiply: [{ $divide: ['$completed', { $max: ['$total', 1] }] }, 100] }, 1] },
        onTimeRate:      { $round: [{ $multiply: [{ $divide: ['$onTime', { $max: ['$completedWithSla', 1] }] }, 100] }, 1] },
        avgDistanceKm:   { $round: [{ $divide: [{ $divide: ['$totalDistanceM', 1000] }, { $max: ['$completed', 1] }] }, 2] },
        totalDistanceKm: { $round: [{ $divide: ['$totalDistanceM', 1000] }, 2] },
        avgDurationMin:  { $round: [{ $divide: [{ $divide: ['$totalDurationS', 60] }, { $max: ['$completed', 1] }] }, 1] },
      }},
      { $sort: { '_id.storeId': 1, total: -1 } }
    ];

    const rows = await c.db('4pl-oms').collection('autobatchingjobs').aggregate(pipeline).toArray();

    // Fetch break time per rider in date range
    const riderIds = rows.map(r => r._id.riderId).filter(Boolean);
    let breakTimeMap = {};
    if (riderIds.length) {
      try {
        const breakDocs = await c.db('4pl-fleet').collection('riderbreaklogs')
          .find({ userId: { $in: riderIds }, deleted: { $ne: true }, startAt: { $gte: fromDate, $lt: toDate } }, { projection: { userId: 1, startAt: 1, endAt: 1 } })
          .toArray();
        breakDocs.forEach(b => {
          if (!b.startAt) return;
          const uid = safeStr(b.userId);
          const end = b.endAt ? new Date(b.endAt) : toDate;
          const mins = Math.max(0, Math.round((end - new Date(b.startAt)) / 60000));
          breakTimeMap[uid] = (breakTimeMap[uid] || 0) + mins;
        });
      } catch (_) {}
    }

    const data = rows.map(r => ({
      riderId:        safeStr(r._id.riderId),
      riderName:      r.riderName || safeStr(r._id.riderId) || 'Unknown',
      storeCode:      storeIdToCode[safeStr(r._id.storeId)] || safeStr(r._id.storeId),
      total:          r.total,
      completed:      r.completed,
      cancelled:      r.cancelled,
      cancelRate:     r.cancelRate,
      completionRate: r.completionRate,
      onTimeRate:     r.onTimeRate,
      avgDistanceKm:  r.avgDistanceKm,
      totalDistanceKm: r.totalDistanceKm,
      avgDurationMin: r.avgDurationMin,
      totalBreakMin:  breakTimeMap[safeStr(r._id.riderId)] || 0,
      // Note: missedAcceptanceRate and rejectAtDoorRate require additional data not in autobatchingjobs
    }));

    res.json({ count: data.length, data });
  } catch (e) {
    console.error('[/api/dispatch/rider-performance]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
module.exports.activityLog = activityLog;
module.exports.pushLog = pushLog;
