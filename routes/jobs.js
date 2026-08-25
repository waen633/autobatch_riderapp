const { Router } = require('express');
const polyline = require('polyline');
const { getClient } = require('../lib/db');
const { safeStr, splitCodes } = require('../lib/helpers');

const router = Router();

const JOB_PROJECTION = {
  jobId: 1, orderIds: 1, status: 1, createdAt: 1, updatedAt: 1, updateStatuses: 1, storeId: 1,
  'assignment.rider.id': 1, 'assignment.rider.name': 1, 'assignment.assigner.type': 1, pickUpSLA: 1, sla: 1,
  'routeOptimizationResult.totalDistance': 1, 'routeOptimizationResult.travelDuration': 1,
  'routeOptimizationResult.visitDuration': 1, 'routeOptimizationResult.waitDuration': 1,
  'routeOptimizationResult.totalWeightGrams': 1, 'routeOptimizationResult.totalBoxDimensionVolumes': 1
};

function mapJobDoc(d, storeIdToCode) {
  return {
    jobId: d.jobId || null,
    storeCode: storeIdToCode[safeStr(d.storeId)] || null,
    riderName: d.assignment?.rider?.name || null,
    riderId: d.assignment?.rider?.id ? safeStr(d.assignment.rider.id) : null,
    assignerType: d.assignment?.assigner?.type || null,
    orderIds: Array.isArray(d.orderIds) ? d.orderIds : [],
    orderCount: Array.isArray(d.orderIds) ? d.orderIds.length : 0,
    pickUpSLA: d.pickUpSLA || null,
    deliverySLA: d.sla || null,
    status: d.status || null,
    createdAt: d.createdAt || null,
    updatedAt: d.updatedAt || null,
    updateStatuses: Array.isArray(d.updateStatuses) ? d.updateStatuses : [],
    routeOptimizationResult: d.routeOptimizationResult ? {
      totalDistance: d.routeOptimizationResult.totalDistance ?? null,
      travelDuration: d.routeOptimizationResult.travelDuration ?? null,
      visitDuration: d.routeOptimizationResult.visitDuration ?? null,
      waitDuration: d.routeOptimizationResult.waitDuration ?? null,
      totalWeightGrams: d.routeOptimizationResult.totalWeightGrams ?? null,
      totalBoxDimensionVolumes: d.routeOptimizationResult.totalBoxDimensionVolumes ?? null
    } : null
  };
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function lookupStoreCodes(c, storeIds) {
  const storeList = await c.db('lastmile').collection('stores')
    .find({ _id: { $in: storeIds } }, { projection: { _id: 1, code: 1 } })
    .toArray();
  const storeIdToCode = {};
  storeList.forEach(s => { storeIdToCode[safeStr(s._id)] = s.code; });
  return storeIdToCode;
}

function extractRawResults(d) {
  const summary = Array.isArray(d.routeOptimizationResult?.orderSummary)
    ? d.routeOptimizationResult.orderSummary : [];
  const summaryRaw = summary.map(s => s?.rawResult).filter(Boolean)
    .map(v => typeof v === 'string' ? v : JSON.stringify(v));
  const topLevelRaw = d.routeOptimizationResult?.rawResult
    ? [typeof d.routeOptimizationResult.rawResult === 'string'
        ? d.routeOptimizationResult.rawResult
        : JSON.stringify(d.routeOptimizationResult.rawResult)]
    : [];
  const polylineFallback = summary.map(s => s?.routePolylinePoints).filter(Boolean)
    .map(points => JSON.stringify({
      visits: [], transitions: [{ routePolyline: {} }, { routePolyline: { points } }]
    }));
  return [...summaryRaw, ...topLevelRaw, ...polylineFallback];
}

router.get('/jobs', async (req, res) => {
  try {
    const { from, to, jobId } = req.query;
    const storeCodes = splitCodes(req.query.storeCode);
    const c = await getClient();

    // Global job search by jobId หรือ orderId (รองรับหลายค่า คั่นด้วย comma/space) — ไม่ต้องระบุ storeCode/from/to
    if (jobId && jobId.trim() && !storeCodes.length) {
      const tokens = [...new Set(jobId.split(/[\s,]+/).map(v => v.trim()).filter(Boolean))].slice(0, 50);
      const orConds = tokens.flatMap(tok => {
        const re = { $regex: escapeRegex(tok), $options: 'i' };
        return [{ jobId: re }, { orderIds: re }];
      });
      const docs = await c.db('4pl-oms').collection('autobatchingjobs')
        .find(
          { $or: orConds },
          { projection: JOB_PROJECTION }
        )
        .sort({ createdAt: -1 })
        .limit(200)
        .toArray();

      if (!docs.length) return res.json({ count: 0, data: [] });

      const storeIds = [...new Set(docs.map(d => d.storeId).filter(Boolean))];
      const storeIdToCode = await lookupStoreCodes(c, storeIds);
      const data = docs.map(d => mapJobDoc(d, storeIdToCode));
      return res.json({ count: data.length, data });
    }

    if (!storeCodes.length || !from || !to) return res.status(400).json({ error: 'storeCode, from, to required' });

    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (isNaN(fromDate) || isNaN(toDate)) return res.status(400).json({ error: 'invalid date format' });

    const storeList = await c.db('lastmile').collection('stores')
      .find({ code: { $in: storeCodes } }, { projection: { _id: 1, code: 1 } })
      .toArray();
    if (!storeList.length) return res.status(404).json({ error: 'No stores found' });

    const storeIdToCode = {};
    storeList.forEach(s => { storeIdToCode[safeStr(s._id)] = s.code; });
    const storeIds = storeList.map(s => s._id);

    const docs = await c.db('4pl-oms').collection('autobatchingjobs')
      .find(
        { storeId: { $in: storeIds }, createdAt: { $gte: fromDate, $lt: toDate } },
        { projection: JOB_PROJECTION }
      )
      .sort({ createdAt: -1 })
      .limit(2000)
      .toArray();

    const data = docs.map(d => mapJobDoc(d, storeIdToCode));

    res.json({ count: data.length, data });
  } catch (e) {
    console.error('[/api/jobs]', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/stuck', async (req, res) => {
  try {
    const { from, to } = req.query;
    const storeCodes = splitCodes(req.query.storeCode);
    if (!storeCodes.length || !from || !to) return res.status(400).json({ error: 'storeCode, from, to required' });

    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (isNaN(fromDate) || isNaN(toDate)) return res.status(400).json({ error: 'invalid date format' });

    const c = await getClient();
    const codeFilter = storeCodes.length === 1 ? storeCodes[0] : { $in: storeCodes };
    const docs = await c.db('4pl-oms').collection('autobatchingjobs')
      .find(
        {
          'workflowInput.metadata.storeId': codeFilter,
          orderReferenceId: { $exists: false },
          'workflowInput.fleetDispatchType': 'AUTO_BATCHING',
          'workflowInput.metadata.jobId': { $exists: false },
          currentOrderStatus: { $ne: 'ORDER_CANCELLED' },
          createdAt: { $gte: fromDate, $lt: toDate }
        },
        {
          projection: {
            orderId: 1, currentOrderStatus: 1, createdAt: 1,
            'workflowInput.metadata.storeId': 1,
            'workflowInput.fleetDispatchType': 1
          }
        }
      )
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();

    res.json({ count: docs.length, data: docs });
  } catch (e) {
    console.error('[/api/stuck]', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/job-route', async (req, res) => {
  try {
    const { jobId } = req.query;
    if (!jobId) return res.status(400).json({ error: 'jobId required' });

    const c = await getClient();
    const doc = await c.db('4pl-oms').collection('autobatchingjobs').findOne(
      { jobId },
      {
        projection: {
          _id: 0, jobId: 1,
          'routeOptimizationResult.orderSummary.rawResult': 1,
          'routeOptimizationResult.rawResult': 1,
          'routeOptimizationResult.orderSummary.routePolylinePoints': 1,
          'routeOptimizationResult.totalDistance': 1,
          'routeOptimizationResult.travelDuration': 1,
          'routeOptimizationResult.totalDuration': 1,
          'routeOptimizationResult.waitDuration': 1,
          'routeOptimizationResult.visitDuration': 1,
          'routeOptimizationResult.totalWeightGrams': 1,
          'routeOptimizationResult.totalBoxDimensionVolumes': 1
        }
      }
    );
    if (!doc) return res.status(404).json({ error: 'Job not found' });
    const rawResults = extractRawResults(doc);
    if (!rawResults.length) return res.status(404).json({ error: 'No route data for this job' });
    
    const metrics = {
      totalDistance: doc.routeOptimizationResult?.totalDistance ?? null,
      travelDuration: doc.routeOptimizationResult?.travelDuration ?? null,
      totalDuration: doc.routeOptimizationResult?.totalDuration ?? null,
      waitDuration: doc.routeOptimizationResult?.waitDuration ?? null,
      visitDuration: doc.routeOptimizationResult?.visitDuration ?? null,
      totalWeightGrams: doc.routeOptimizationResult?.totalWeightGrams ?? null,
      totalBoxDimensionVolumes: doc.routeOptimizationResult?.totalBoxDimensionVolumes ?? null
    };

    res.json({ rawResults, metrics });
  } catch (e) {
    console.error('[/api/job-route]', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/jobs-km', async (req, res) => {
  try {
    const jobIds = (req.query.jobIds || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!jobIds.length) return res.status(400).json({ error: 'jobIds required' });
    if (jobIds.length > 500) return res.status(400).json({ error: 'max 500 jobIds' });

    const c = await getClient();
    const docs = await c.db('4pl-oms').collection('autobatchingjobs')
      .find(
        { jobId: { $in: jobIds } },
        { projection: { _id: 0, jobId: 1, 'routeOptimizationResult.orderSummary.rawResult': 1, 'routeOptimizationResult.rawResult': 1 } }
      ).toArray();

    const data = docs.map(d => {
      const rawResults = extractRawResults(d);
      let totalMeters = 0;
      rawResults.forEach(rawStr => {
        try {
          const raw = typeof rawStr === 'string' ? JSON.parse(rawStr) : rawStr;
          (Array.isArray(raw.transitions) ? raw.transitions : []).forEach(t => {
            if (t?.travelDistanceMeters) totalMeters += t.travelDistanceMeters;
          });
        } catch {}
      });
      return { jobId: d.jobId, totalKm: totalMeters > 0 ? parseFloat((totalMeters / 1000).toFixed(2)) : null };
    });

    res.json({ data });
  } catch (e) {
    console.error('[/api/jobs-km]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
