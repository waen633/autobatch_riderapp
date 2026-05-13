const { Router } = require('express');
const { ObjectId } = require('mongodb');
const { getClient } = require('../lib/db');
const { safeStr, splitCodes } = require('../lib/helpers');
const { evalEligibility, buildMapUrl } = require('../lib/eligibility');

const router = Router();

async function fetchRiderPool(c, storeCodes) {
  const [zones, stores] = await Promise.all([
    c.db('4pl-address-and-zoning').collection('geographies')
      .find(
        { storeCode: { $in: storeCodes }, deleted: { $ne: true }, areaPath: { $exists: true, $ne: ',,' } },
        { projection: { _id: 0, storeCode: 1, areaPath: 1 } }
      ).toArray(),
    c.db('lastmile').collection('stores')
      .find(
        { code: { $in: storeCodes } },
        { projection: { _id: 0, code: 1, location: 1, name: 1, 'metadata.config.assignment.autoAssign.jobSurface.radius': 1 } }
      ).toArray()
  ]);

  const storeMap = {};
  stores.forEach(s => { storeMap[s.code] = s; });

  const storeClusterMap = {};
  zones.forEach(z => {
    const clusters = (z.areaPath || '').split(',').map(x => x.trim()).filter(x => /^[a-f0-9]{24}$/i.test(x));
    if (!storeClusterMap[z.storeCode]) storeClusterMap[z.storeCode] = { storeCode: z.storeCode, clusterIds: new Set() };
    clusters.forEach(x => storeClusterMap[z.storeCode].clusterIds.add(x));
  });

  return { storeMap, storeClusterMap };
}

router.get('/riders', async (req, res) => {
  try {
    const storeCodes = splitCodes(req.query.storeCode);
    if (!storeCodes.length) return res.status(400).json({ error: 'storeCode required' });

    const c = await getClient();
    const { storeMap, storeClusterMap } = await fetchRiderPool(c, storeCodes);
    const finalResult = [];

    for (const [code, item] of Object.entries(storeClusterMap)) {
      const clusterList = Array.from(item.clusterIds).map(id => new ObjectId(id));
      const store = storeMap[code] || null;

      const staffs = await c.db('4pl-fleet').collection('staffs')
        .find(
          { 'metaData.shifts.clusterId': { $in: clusterList }, status: 'ONLINE' },
          { projection: { _id: 0, userId: 1, username: 1, firstname: 1, lastname: 1, phone: 1, status: 1, breakAt: 1, location: 1, 'metaData.autoBatchRejected': 1 } }
        ).toArray();

      const staffMap = {};
      const staffUserIds = [];
      staffs.forEach(s => {
        const uid = safeStr(s.userId);
        if (uid) { staffMap[uid] = s; staffUserIds.push(s.userId); }
      });
      if (!staffUserIds.length) continue;

      const jobs = await c.db('4pl-oms').collection('autobatchingjobs')
        .find(
          { 'assignment.rider.id': { $in: staffUserIds }, status: { $in: ['job_accepted', 'job_assigned', 'job_picking_up', 'job_picked_up', 'job_delivering'] } },
          { projection: { _id: 0, jobId: 1, status: 1, 'assignment.rider.id': 1 } }
        ).toArray();

      const activeJobMap = new Map();
      jobs.forEach(j => {
        const rid = safeStr(j.assignment?.rider?.id);
        if (rid && !activeJobMap.has(rid)) activeJobMap.set(rid, { jobId: j.jobId, status: j.status });
      });

      const pools = await c.db('4pl-oms').collection('autobatchingriderpools')
        .find({ userId: { $in: staffUserIds } }, { projection: { _id: 1, userId: 1, status: 1, createdAt: 1 } })
        .sort({ createdAt: 1 })
        .toArray();

      const poolMap = {};
      const poolOrder = [];
      pools.forEach(p => {
        const uid = safeStr(p.userId);
        if (uid) { poolMap[uid] = p; poolOrder.push(uid); }
      });

      const now = new Date();
      let queueIndex = 1;

      poolOrder.forEach(uid => {
        const p = poolMap[uid];
        const staff = staffMap[uid];
        const { flags, eligible } = evalEligibility(uid, p, now, activeJobMap, staff);
        const jobInfo = activeJobMap.get(uid);
        finalResult.push({
          storeCode: code, queue: queueIndex++, poolId: safeStr(p._id), userId: uid,
          status: p.status, join_pool_at: p.createdAt || null,
          username: staff?.username || '',
          name: `${staff?.firstname || ''} ${staff?.lastname || ''}`.trim(),
          phone: staff?.phone || '', ready_for_auto_assign: eligible,
          staff_online: flags.staff_online, not_banned: flags.not_banned,
          no_active_job: flags.no_active_job, not_on_break: flags.not_on_break,
          job_on_hand_id: !flags.no_active_job && jobInfo ? jobInfo.jobId : null,
          job_on_hand_status: !flags.no_active_job && jobInfo ? jobInfo.status : null,
          mapUrl: buildMapUrl(staff, store)
        });
      });

      Object.keys(staffMap).forEach(uid => {
        if (poolMap[uid]) return;
        const staff = staffMap[uid];
        const { flags, eligible } = evalEligibility(uid, null, now, activeJobMap, staff);
        const jobInfo = activeJobMap.get(uid);
        finalResult.push({
          storeCode: code, queue: 'not_in_pool', poolId: null, userId: uid,
          status: 'N/A', join_pool_at: null,
          username: staff?.username || '',
          name: `${staff?.firstname || ''} ${staff?.lastname || ''}`.trim(),
          phone: staff?.phone || '', ready_for_auto_assign: eligible,
          staff_online: flags.staff_online, not_banned: flags.not_banned,
          no_active_job: flags.no_active_job, not_on_break: flags.not_on_break,
          job_on_hand_id: !flags.no_active_job && jobInfo ? jobInfo.jobId : null,
          job_on_hand_status: !flags.no_active_job && jobInfo ? jobInfo.status : null,
          mapUrl: buildMapUrl(staff, store)
        });
      });
    }

    const readyCount = finalResult.filter(r => r.ready_for_auto_assign && r.queue !== 'not_in_pool').length;
    res.json({ count: finalResult.length, readyCount, data: finalResult });
  } catch (e) {
    console.error('[/api/riders]', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/live', async (req, res) => {
  try {
    const storeCodes = splitCodes(req.query.storeCode);
    if (!storeCodes.length) return res.status(400).json({ error: 'storeCode required' });

    const c = await getClient();
    const { storeMap, storeClusterMap } = await fetchRiderPool(c, storeCodes);
    const riders = [];
    const storeMarkers = [];

    for (const [code, item] of Object.entries(storeClusterMap)) {
      const clusterList = Array.from(item.clusterIds).map(id => new ObjectId(id));
      const store = storeMap[code] || null;
      const storeLng = store?.location?.coordinates?.[0];
      const storeLat = store?.location?.coordinates?.[1];
      const radius = store?.metadata?.config?.assignment?.autoAssign?.jobSurface?.radius || 100;

      if (storeLat != null) {
        storeMarkers.push({ storeCode: code, name: store.name || code, lat: storeLat, lng: storeLng, radius });
      }

      const staffs = await c.db('4pl-fleet').collection('staffs')
        .find(
          { 'metaData.shifts.clusterId': { $in: clusterList }, status: 'ONLINE' },
          { projection: { _id: 0, userId: 1, username: 1, firstname: 1, lastname: 1, phone: 1, breakAt: 1, location: 1, 'metaData.autoBatchRejected': 1 } }
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
          .find({ userId: { $in: staffUserIds } }, { projection: { _id: 0, userId: 1 } })
          .toArray()
      ]);

      const activeJobMap = new Map();
      jobs.forEach(j => {
        const rid = safeStr(j.assignment?.rider?.id);
        if (rid && !activeJobMap.has(rid)) activeJobMap.set(rid, { jobId: j.jobId, status: j.status });
      });
      const poolUserIds = new Set(pools.map(p => safeStr(p.userId)).filter(Boolean));

      const now = new Date();
      staffs.forEach(staff => {
        const uid = safeStr(staff.userId);
        if (!uid) return;
        const riderLng = staff.location?.coordinates?.[0];
        const riderLat = staff.location?.coordinates?.[1];
        if (riderLat == null) return;
        const jobInfo = activeJobMap.get(uid);
        const inPool = poolUserIds.has(uid);
        const { eligible } = evalEligibility(uid, inPool ? {} : null, now, activeJobMap, staff);
        riders.push({
          storeCode: code, userId: uid,
          name: `${staff.firstname || ''} ${staff.lastname || ''}`.trim() || staff.username || uid,
          phone: staff.phone || '',
          lat: riderLat, lng: riderLng,
          inPool, eligible,
          jobId: jobInfo?.jobId || null,
          jobStatus: jobInfo?.status || null
        });
      });
    }

    res.json({ riders, stores: storeMarkers });
  } catch (e) {
    console.error('[/api/live]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/rider-breaks?userId=<id>&from=<datetime>&to=<datetime>
router.get('/rider-breaks', async (req, res) => {
  try {
    const { userId, from, to } = req.query;
    if (!userId || !from) return res.status(400).json({ error: 'userId and from are required' });

    const c = await getClient();
    const fromDt = new Date(from);
    const toDt   = to ? new Date(to) : new Date(fromDt.getTime() + 86400000); // +1 day default

    const filter = {
      userId:    new ObjectId(userId),
      deleted:   { $ne: true },
      createdAt: { $gte: fromDt, $lt: toDt }
    };

    const docs = await c.db('4pl-fleet')
      .collection('riderbreaklogs')
      .find(filter)
      .sort({ startAt: 1 })
      .toArray();

    const breaks = docs.map(b => {
      let duration = null;
      if (b.startAt && b.endAt) {
        const mins = Math.round((new Date(b.endAt) - new Date(b.startAt)) / 60000);
        duration = mins >= 60
          ? `${Math.floor(mins / 60)}h ${mins % 60}m`
          : `${mins}m`;
      }
      return {
        startAt:   b.startAt,
        endAt:     b.endAt || null,
        createdAt: b.createdAt,
        updatedBy: b.updatedBy,
        duration
      };
    });

    res.json({ count: breaks.length, breaks });
  } catch (e) {
    console.error('[rider-breaks]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
