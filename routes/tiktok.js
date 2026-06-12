const express = require('express');
const { getClient } = require('../lib/db');

const router = express.Router();

// Temporary probe to find which collections exist
router.get('/tiktok/probe', async (req, res) => {
  try {
    const c = await getClient();
    const results = {};
    const dbNames = ['4pl-fleet', '4pl-oms', 'lastmile'];
    for (const db of dbNames) {
      try {
        const cols = await c.db(db).listCollections().toArray();
        results[db] = cols.map(c => c.name);
      } catch (e) {
        results[db] = `error: ${e.message}`;
      }
    }
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/tiktok/live?zoneName=zone_district_prawet,zone_district_bang_kapi
router.get('/tiktok/live', async (req, res) => {
  try {
    const zoneNames = req.query.zoneName
      ? req.query.zoneName.split(',').map(z => z.trim()).filter(Boolean)
      : [];

    const c = await getClient();

    // Fetch zone polygons
    const zoneQuery = { serviceAreaType: 'polygon', deleted: { $ne: true } };
    if (zoneNames.length) zoneQuery.name = { $in: zoneNames };
    else zoneQuery['businessUnit'] = 'TIKTOK'; // default: all tiktok zones

    const zoneData = await c.db('4pl-address-and-zoning').collection('geographies')
      .find(zoneQuery)
      .project({ name: 1, code: 1, 'feature.geometry': 1 })
      .toArray();

    // Fetch Tiktok riders
    const riderQuery = { 'metaData.serviceTypes': 'Tiktok_Express', deleted: { $ne: true } };
    if (zoneNames.length) {
      riderQuery['locationDetail.stores.name'] = { $in: zoneNames };
    }

    const staffs = await c.db('4pl-fleet').collection('staffs')
      .find(riderQuery)
      .project({
        userId: 1, firstname: 1, lastname: 1, phone: 1,
        status: 1, location: 1, locationDetail: 1, breakAt: 1
      })
      .toArray();

    // Fetch active jobs for these riders
    const staffUserIds = staffs.map(s => s.userId).filter(Boolean);
    const jobMap = new Map();

    if (staffUserIds.length) {
      try {
        const jobs = await c.db('4pl-fleet').collection('jobs')
          .find(
            {
              'assignment.rider.id': { $in: staffUserIds },
              status: { $in: ['job_accepted', 'job_assigned', 'job_picking_up', 'job_picked_up', 'job_delivering'] }
            },
            { projection: { jobId: 1, status: 1, 'assignment.rider.id': 1 } }
          ).toArray();
        jobs.forEach(j => {
          const rid = j.assignment?.rider?.id?.toString();
          if (rid && !jobMap.has(rid)) jobMap.set(rid, { jobId: j.jobId, status: j.status });
        });
      } catch (_) {
        // jobs collection optional — skip if not found
      }
    }

    const riders = staffs.map(staff => {
      const uid = staff.userId?.toString();
      const lng = staff.location?.coordinates?.[0];
      const lat = staff.location?.coordinates?.[1];
      if (lat == null || lng == null) return null;
      const jobInfo = uid ? jobMap.get(uid) : null;
      const zones = (staff.locationDetail?.stores || []).map(s => s.name).filter(Boolean);
      return {
        userId: uid,
        name: `${staff.firstname || ''} ${staff.lastname || ''}`.trim() || uid,
        phone: staff.phone || '',
        status: staff.status || 'UNKNOWN',
        lat, lng,
        zones,
        onBreak: !!staff.breakAt,
        jobId: jobInfo?.jobId || null,
        jobStatus: jobInfo?.status || null
      };
    }).filter(Boolean);

    const zones = zoneData.map(z => ({
      name: z.name,
      code: z.code,
      geometry: z.feature?.geometry || null
    }));

    res.json({ ok: true, riders, zones, riderCount: riders.length });
  } catch (e) {
    console.error('[/api/tiktok/live]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/tiktok/riders?zoneName=...  (rider pool table)
router.get('/tiktok/riders', async (req, res) => {
  try {
    const zoneNames = req.query.zoneName
      ? req.query.zoneName.split(',').map(z => z.trim()).filter(Boolean)
      : [];

    const c = await getClient();
    const riderQuery = { 'metaData.serviceTypes': 'Tiktok_Express', deleted: { $ne: true } };
    if (zoneNames.length) {
      riderQuery['locationDetail.stores.name'] = { $in: zoneNames };
    }

    const staffs = await c.db('4pl-fleet').collection('staffs')
      .find(riderQuery)
      .project({
        userId: 1, firstname: 1, lastname: 1, phone: 1,
        status: 1, location: 1, locationDetail: 1, breakAt: 1, heading: 1
      })
      .toArray();

    const staffUserIds = staffs.map(s => s.userId).filter(Boolean);
    const jobMap = new Map();
    if (staffUserIds.length) {
      try {
        const jobs = await c.db('4pl-fleet').collection('jobs')
          .find(
            { 'assignment.rider.id': { $in: staffUserIds }, status: { $in: ['job_accepted', 'job_assigned', 'job_picking_up', 'job_picked_up', 'job_delivering'] } },
            { projection: { jobId: 1, status: 1, 'assignment.rider.id': 1 } }
          ).toArray();
        jobs.forEach(j => {
          const rid = j.assignment?.rider?.id?.toString();
          if (rid && !jobMap.has(rid)) jobMap.set(rid, { jobId: j.jobId, status: j.status });
        });
      } catch (_) {}
    }

    const data = staffs.map(staff => {
      const uid = staff.userId?.toString();
      const jobInfo = uid ? jobMap.get(uid) : null;
      const zones = (staff.locationDetail?.stores || []).map(s => s.name).filter(Boolean);
      return {
        userId: uid,
        name: `${staff.firstname || ''} ${staff.lastname || ''}`.trim(),
        phone: staff.phone || '',
        status: staff.status || 'UNKNOWN',
        onBreak: !!staff.breakAt,
        zones,
        jobId: jobInfo?.jobId || null,
        jobStatus: jobInfo?.status || null
      };
    });

    res.json({ ok: true, count: data.length, data });
  } catch (e) {
    console.error('[/api/tiktok/riders]', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/tiktok/pending?zoneName=...
router.get('/tiktok/pending', async (req, res) => {
  try {
    const c = await getClient();
    const docs = await c.db('4pl-oms').collection('pendingorders')
      .find(
        { serviceType: 'Tiktok_Express', deleted: { $ne: true } },
        { projection: { batchId: 1, orderId: 1, consignment: 1, serviceType: 1, storeCode: 1, createdAt: 1 } }
      )
      .sort({ createdAt: -1 })
      .limit(500)
      .toArray();

    res.json({ count: docs.length, data: docs, batchTimeMap: {} });
  } catch (e) {
    console.error('[/api/tiktok/pending]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/tiktok/jobs?from=&to=&zoneName=...
router.get('/tiktok/jobs', async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from, to required' });

    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (isNaN(fromDate) || isNaN(toDate)) return res.status(400).json({ error: 'invalid date format' });

    const c = await getClient();
    const docs = await c.db('4pl-oms').collection('autobatchingjobs')
      .find(
        {
          'metadata.serviceTypes': 'Tiktok_Express',
          createdAt: { $gte: fromDate, $lt: toDate }
        },
        {
          projection: {
            jobId: 1, orderIds: 1, status: 1, createdAt: 1, updatedAt: 1, updateStatuses: 1,
            'assignment.rider.id': 1, 'assignment.rider.name': 1, 'assignment.assigner.type': 1,
            pickUpSLA: 1, sla: 1, 'metadata.districtClusterId': 1,
            'routeOptimizationResult.totalDistance': 1, 'routeOptimizationResult.travelDuration': 1,
            'routeOptimizationResult.visitDuration': 1
          }
        }
      )
      .sort({ createdAt: -1 })
      .limit(2000)
      .toArray();

    const data = docs.map(d => ({
      jobId: d.jobId || null,
      storeCode: d.metadata?.districtClusterId?.replace(/,/g, '') || '–',
      riderName: d.assignment?.rider?.name || null,
      riderId: d.assignment?.rider?.id ? d.assignment.rider.id.toString() : null,
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
      } : null
    }));

    res.json({ count: data.length, data });
  } catch (e) {
    console.error('[/api/tiktok/jobs]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/tiktok/performance?from=&to=
router.get('/tiktok/performance', async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from, to required' });

    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (isNaN(fromDate) || isNaN(toDate)) return res.status(400).json({ error: 'invalid date format' });

    const c = await getClient();
    const ACTIVE    = ['job_assigned','job_accepted','job_picking_up','job_picked_up','job_delivering'];
    const COMPLETED = ['job_delivered','job_completed'];

    const pipeline = [
      { $match: {
        'metadata.serviceTypes': 'Tiktok_Express',
        createdAt: { $gte: fromDate, $lt: toDate },
        'assignment.rider.id': { $exists: true, $ne: null }
      }},
      { $group: {
        _id: '$assignment.rider.id',
        riderName: { $first: '$assignment.rider.name' },
        total:     { $sum: 1 },
        active:    { $sum: { $cond: [{ $in: ['$status', ACTIVE] },    1, 0] }},
        completed: { $sum: { $cond: [{ $in: ['$status', COMPLETED] }, 1, 0] }},
        cancelled: { $sum: { $cond: [{ $eq: ['$status', 'job_cancelled'] }, 1, 0] }}
      }},
      { $addFields: {
        accepted:   { $add: ['$active','$completed'] },
        acceptRate: { $round: [{ $multiply: [{ $divide: [{ $add: ['$active','$completed'] }, { $max: ['$total',1] }] }, 100] }, 1] },
        cancelRate: { $round: [{ $multiply: [{ $divide: ['$cancelled', { $max: ['$total',1] }] }, 100] }, 1] }
      }},
      { $sort: { total: -1 } }
    ];

    const rows = await c.db('4pl-oms').collection('autobatchingjobs').aggregate(pipeline).toArray();
    const data = rows.map(r => ({
      riderId:    r._id?.toString(),
      riderName:  r.riderName || r._id?.toString() || 'Unknown',
      storeCode:  'TikTok',
      total: r.total, active: r.active, completed: r.completed,
      cancelled: r.cancelled, accepted: r.accepted,
      acceptRate: r.acceptRate, cancelRate: r.cancelRate
    }));

    res.json({ count: data.length, data });
  } catch (e) {
    console.error('[/api/tiktok/performance]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
