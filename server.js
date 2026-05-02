require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

let client = null;

async function getClient() {
  if (!client) {
    client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    await client.connect();
    console.log('MongoDB connected');
  }
  return client;
}

app.use(express.static(path.join(__dirname, 'public')));

function splitCodes(raw) {
  return (raw || '').split(',').map(s => s.trim()).filter(Boolean);
}

// ─── PENDING ORDERS ───────────────────────────────────────────────────────────
app.get('/api/pending', async (req, res) => {
  try {
    const storeCodes = splitCodes(req.query.storeCode);
    if (!storeCodes.length) return res.status(400).json({ error: 'storeCode required' });

    const c = await getClient();
    const codeFilter = storeCodes.length === 1 ? storeCodes[0] : { $in: storeCodes };
    const docs = await c
      .db('4pl-oms')
      .collection('pendingorders')
      .find(
        { storeCode: codeFilter, deleted: { $ne: true } },
        { projection: { batchId: 1, orderId: 1, consignment: 1, serviceType: 1, storeCode: 1, createdAt: 1 } }
      )
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ count: docs.length, data: docs });
  } catch (e) {
    console.error('[/api/pending]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── JOBS ─────────────────────────────────────────────────────────────────────
app.get('/api/jobs', async (req, res) => {
  try {
    const { from, to } = req.query;
    const storeCodes = splitCodes(req.query.storeCode);
    if (!storeCodes.length || !from || !to) return res.status(400).json({ error: 'storeCode, from, to required' });

    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (isNaN(fromDate) || isNaN(toDate)) return res.status(400).json({ error: 'invalid date format' });

    const c = await getClient();

    const storeList = await c
      .db('lastmile')
      .collection('stores')
      .find({ code: { $in: storeCodes } }, { projection: { _id: 1, code: 1 } })
      .toArray();

    if (!storeList.length) return res.status(404).json({ error: 'No stores found' });

    const storeIds = storeList.map(s => s._id);
    const storeIdToCode = {};
    storeList.forEach(s => { storeIdToCode[safeStr(s._id)] = s.code; });

    const docs = await c
      .db('4pl-oms')
      .collection('autobatchingjobs')
      .find(
        { storeId: { $in: storeIds }, createdAt: { $gte: fromDate, $lt: toDate } },
        {
          projection: {
            jobId: 1, orderIds: 1, status: 1, createdAt: 1, storeId: 1,
            'assignment.rider.id': 1, 'assignment.rider.name': 1,
            pickUpSLA: 1
          }
        }
      )
      .sort({ createdAt: -1 })
      .limit(2000)
      .toArray();

    const enriched = docs.map(d => ({
      jobId: d.jobId || null,
      storeCode: storeIdToCode[safeStr(d.storeId)] || null,
      riderName: d.assignment?.rider?.name || null,
      riderId: d.assignment?.rider?.id ? safeStr(d.assignment.rider.id) : null,
      orderIds: Array.isArray(d.orderIds) ? d.orderIds : [],
      orderCount: Array.isArray(d.orderIds) ? d.orderIds.length : 0,
      pickUpSLA: d.pickUpSLA || null,
      status: d.status || null,
      createdAt: d.createdAt || null
    }));

    res.json({ count: enriched.length, data: enriched });
  } catch (e) {
    console.error('[/api/jobs]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── STUCK JOBS ───────────────────────────────────────────────────────────────
app.get('/api/stuck', async (req, res) => {
  try {
    const { from, to } = req.query;
    const storeCodes = splitCodes(req.query.storeCode);
    if (!storeCodes.length || !from || !to) return res.status(400).json({ error: 'storeCode, from, to required' });

    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (isNaN(fromDate) || isNaN(toDate)) return res.status(400).json({ error: 'invalid date format' });

    const c = await getClient();
    const codeFilter = storeCodes.length === 1 ? storeCodes[0] : { $in: storeCodes };

    const docs = await c
      .db('4pl-oms')
      .collection('autobatchingjobs')
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

// ─── RIDERS POOL ──────────────────────────────────────────────────────────────
app.get('/api/riders', async (req, res) => {
  try {
    const storeCodes = splitCodes(req.query.storeCode);
    if (!storeCodes.length) return res.status(400).json({ error: 'storeCode required' });

    const c = await getClient();

    const zones = await c
      .db('4pl-address-and-zoning')
      .collection('geographies')
      .find(
        { storeCode: { $in: storeCodes }, deleted: { $ne: true }, areaPath: { $exists: true, $ne: ',,' } },
        { projection: { _id: 0, storeCode: 1, areaPath: 1 } }
      )
      .toArray();

    const stores = await c
      .db('lastmile')
      .collection('stores')
      .find(
        { code: { $in: storeCodes } },
        {
          projection: {
            _id: 0, code: 1, location: 1,
            'metadata.config.assignment.autoAssign.jobSurface.radius': 1
          }
        }
      )
      .toArray();

    const storeMap = {};
    stores.forEach(s => { storeMap[s.code] = s; });

    const storeClusterMap = {};
    zones.forEach(z => {
      const code = z.storeCode;
      const clusters = (z.areaPath || '')
        .split(',').map(x => x.trim()).filter(x => /^[a-f0-9]{24}$/i.test(x));
      if (!storeClusterMap[code]) storeClusterMap[code] = { storeCode: code, clusterIds: new Set() };
      clusters.forEach(x => storeClusterMap[code].clusterIds.add(x));
    });

    const finalResult = [];

    for (const [code, item] of Object.entries(storeClusterMap)) {
      const clusterList = Array.from(item.clusterIds).map(id => new ObjectId(id));
      const store = storeMap[code] || null;

      const staffs = await c
        .db('4pl-fleet')
        .collection('staffs')
        .find(
          { 'metaData.shifts.clusterId': { $in: clusterList }, status: 'ONLINE' },
          {
            projection: {
              _id: 0, userId: 1, username: 1, firstname: 1, lastname: 1,
              phone: 1, status: 1, breakAt: 1, location: 1,
              'metaData.autoBatchRejected': 1
            }
          }
        )
        .toArray();

      const staffMap = {};
      const staffUserIds = [];
      staffs.forEach(s => {
        const uid = safeStr(s.userId);
        if (uid) { staffMap[uid] = s; staffUserIds.push(s.userId); }
      });

      if (staffUserIds.length === 0) continue;

      const jobs = await c
        .db('4pl-oms')
        .collection('autobatchingjobs')
        .find(
          {
            'assignment.rider.id': { $in: staffUserIds },
            status: { $in: ['job_accepted', 'job_assigned', 'job_picking_up', 'job_picked_up', 'job_delivering'] }
          },
          { projection: { _id: 0, jobId: 1, status: 1, 'assignment.rider.id': 1 } }
        )
        .toArray();

      const activeJobMap = new Map();
      jobs.forEach(j => {
        const rid = safeStr(j.assignment?.rider?.id);
        if (rid && !activeJobMap.has(rid)) activeJobMap.set(rid, { jobId: j.jobId, status: j.status });
      });

      const pools = await c
        .db('4pl-oms')
        .collection('autobatchingriderpools')
        .find(
          { userId: { $in: staffUserIds } },
          { projection: { _id: 1, userId: 1, status: 1, createdAt: 1 } }
        )
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

    const readyCount = finalResult.filter(r => r.ready_for_auto_assign).length;
    res.json({ count: finalResult.length, readyCount, data: finalResult });
  } catch (e) {
    console.error('[/api/riders]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── ORDER QUERY ──────────────────────────────────────────────────────────────
app.get('/api/orders', async (req, res) => {
  try {
    const { type, values } = req.query;
    if (!type || !values) return res.status(400).json({ error: 'type and values required' });

    const valList = values.split(',').map(v => v.trim()).filter(Boolean);
    if (!valList.length) return res.status(400).json({ error: 'no values provided' });

    const c = await getClient();

    const filter = { orderReferenceId: { $exists: false } };
    if (type === 'consignment') {
      filter['workflowInput.metadata.consignment'] = valList.length === 1 ? valList[0] : { $in: valList };
    } else if (type === 'orderid') {
      filter['workflowInput.metadata.orderId'] = valList.length === 1 ? valList[0] : { $in: valList };
    } else {
      return res.status(400).json({ error: 'type must be consignment or orderid' });
    }

    const docs = await c
      .db('4pl-oms')
      .collection('orders')
      .find(filter, {
        projection: {
          _id: 1, orderId: 1, currentOrderStatus: 1, createdAt: 1, updatedAt: 1,
          'workflowInput.metadata.consignment': 1,
          'workflowInput.metadata.orderId': 1,
          'workflowInput.metadata.storeCode': 1,
          'workflowInput.metadata.storeName': 1,
          'workflowInput.metadata.jobId': 1,
          'workflowInput.metadata.jobs': 1,
          'workflowInput.metadata.isOrderItemsConfirmation': 1,
          'workflowInput.fleetDispatchType': 1,
          'workflowInput.tasks.direction': 1,
          'workflowInput.tasks.information.payment': 1,
          'metadata.staff.name': 1,
          'metadata.staff.riderId': 1,
          'metadata.staff.phone': 1,
          'metadata.staff.workingType': 1,
          'payment.method': 1,
          'payment.extraCOD.channel': 1,
          'payment.extraCODAmount': 1,
          orderStatuses: 1
        }
      })
      .sort({ createdAt: -1 })
      .toArray();

    const enriched = docs.map(d => {
      const pickupTask = (d.workflowInput?.tasks || []).find(t => t.direction === 'PICKUP');
      return {
        _id: safeStr(d._id),
        orderId: d.orderId || null,
        internalOrderId: d.workflowInput?.metadata?.orderId || null,
        consignment: d.workflowInput?.metadata?.consignment || null,
        storeCode: d.workflowInput?.metadata?.storeCode || null,
        storeName: d.workflowInput?.metadata?.storeName || null,
        jobId: d.workflowInput?.metadata?.jobId || d.workflowInput?.metadata?.jobs?.[0] || null,
        isOrderItemsConfirmation: d.workflowInput?.metadata?.isOrderItemsConfirmation ?? null,
        fleetDispatchType: d.workflowInput?.fleetDispatchType || null,
        currentOrderStatus: d.currentOrderStatus || null,
        paymentMethod: d.payment?.method || null,
        paymentChannel: pickupTask?.information?.payment?.channel || null,
        codChannel: d.payment?.extraCOD?.channel || null,
        codAmount: d.payment?.extraCODAmount || null,
        riderName: d.metadata?.staff?.name || null,
        riderId: safeStr(d.metadata?.staff?.riderId) || null,
        riderPhone: d.metadata?.staff?.phone || null,
        workingType: d.metadata?.staff?.workingType || null,
        createdAt: d.createdAt || null,
        updatedAt: d.updatedAt || null,
        statusHistory: (d.orderStatuses || []).map(s => ({ status: s.status, updatedAt: s.updatedAt }))
      };
    });

    res.json({ count: enriched.length, data: enriched });
  } catch (e) {
    console.error('[/api/orders]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── BATCH QUERY ─────────────────────────────────────────────────────────────
app.get('/api/batches', async (req, res) => {
  try {
    const { orderIds } = req.query;
    if (!orderIds) return res.status(400).json({ error: 'orderIds required' });
    const idList = orderIds.split(',').map(s => s.trim()).filter(Boolean);
    if (!idList.length) return res.status(400).json({ error: 'no orderIds provided' });

    const c = await getClient();
    const filter = idList.length === 1
      ? { orderIds: idList[0] }
      : { orderIds: { $in: idList } };

    const docs = await c
      .db('4pl-oms')
      .collection('autobatchingbatches')
      .find(filter, {
        projection: {
          _id: 1, orderIds: 1, storeId: 1, status: 1, createdAt: 1,
          batchId: 1,
          'routeOptimization.startTime': 1,
          'routeOptimization.endTime': 1,
          'routeOptimization.status': 1
        }
      })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    const enriched = docs.map(d => ({
      _id: safeStr(d._id),
      batchId: d.batchId || null,
      orderIds: Array.isArray(d.orderIds) ? d.orderIds : [],
      orderCount: Array.isArray(d.orderIds) ? d.orderIds.length : 0,
      storeId: safeStr(d.storeId) || null,
      status: d.status || null,
      roStartTime: d.routeOptimization?.startTime || null,
      roEndTime: d.routeOptimization?.endTime || null,
      roStatus: d.routeOptimization?.status || null,
      createdAt: d.createdAt || null
    }));

    res.json({ count: enriched.length, data: enriched });
  } catch (e) {
    console.error('[/api/batches]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function safeStr(val) {
  try {
    if (!val) return null;
    if (typeof val?.toHexString === 'function') return val.toHexString();
    return val.toString();
  } catch { return null; }
}

function evalEligibility(uid, pool, now, activeJobMap, staff) {
  const flags = {
    staff_online: staff?.status === 'ONLINE',
    not_banned: checkNotBanned(staff, now),
    no_active_job: !activeJobMap.has(uid),
    not_on_break: checkNotOnBreak(staff)
  };
  return { flags, eligible: Object.values(flags).every(Boolean) };
}

function checkNotBanned(staff, now) {
  if (!staff?.metaData?.autoBatchRejected) return true;
  return now > new Date(staff.metaData.autoBatchRejected);
}

function checkNotOnBreak(staff) {
  if (!staff?.breakAt) return true;
  return isNaN(new Date(staff.breakAt).getTime());
}

function buildMapUrl(staff, store) {
  const riderLng = staff?.location?.coordinates?.[0];
  const riderLat = staff?.location?.coordinates?.[1];
  const storeLng = store?.location?.coordinates?.[0];
  const storeLat = store?.location?.coordinates?.[1];
  const radius = store?.metadata?.config?.assignment?.autoAssign?.jobSurface?.radius || 100;
  if (riderLat == null || storeLat == null) return null;
  const circles = [
    [5, riderLat, riderLng, '#3AAA24', '#3DFF1F', 0.4],
    [radius, storeLat, storeLng, '#FF0000', '#AA0000', 0.4]
  ];
  return `https://www.mapdevelopers.com/draw-circle-tool.php?circles=${encodeURIComponent(JSON.stringify(circles))}`;
}

// ─── START ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Dashboard running at http://localhost:${PORT}`);
});
