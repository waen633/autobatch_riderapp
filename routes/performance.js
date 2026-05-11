const { Router } = require('express');
const { getClient } = require('../lib/db');
const { safeStr, splitCodes } = require('../lib/helpers');

const router = Router();

router.get('/rider-performance', async (req, res) => {
  try {
    const { from, to } = req.query;
    const storeCodes = splitCodes(req.query.storeCode);
    if (!storeCodes.length || !from || !to) return res.status(400).json({ error: 'storeCode, from, to required' });

    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (isNaN(fromDate) || isNaN(toDate)) return res.status(400).json({ error: 'invalid date format' });

    const c = await getClient();
    const storeList = await c.db('lastmile').collection('stores')
      .find({ code: { $in: storeCodes } }, { projection: { _id: 1, code: 1 } })
      .toArray();
    if (!storeList.length) return res.status(404).json({ error: 'No stores found' });

    const storeIdToCode = {};
    storeList.forEach(s => { storeIdToCode[safeStr(s._id)] = s.code; });
    const storeIds = storeList.map(s => s._id);

    const ACTIVE    = ['job_assigned', 'job_accepted', 'job_picking_up', 'job_picked_up', 'job_delivering'];
    const COMPLETED = ['job_delivered', 'job_completed'];

    const pipeline = [
      { $match: {
        storeId: { $in: storeIds },
        createdAt: { $gte: fromDate, $lt: toDate },
        'assignment.rider.id': { $exists: true, $ne: null }
      }},
      { $group: {
        _id: { riderId: '$assignment.rider.id', storeId: '$storeId' },
        riderName: { $first: '$assignment.rider.name' },
        total:     { $sum: 1 },
        active:    { $sum: { $cond: [{ $in: ['$status', ACTIVE] },    1, 0] }},
        completed: { $sum: { $cond: [{ $in: ['$status', COMPLETED] }, 1, 0] }},
        cancelled: { $sum: { $cond: [{ $eq: ['$status', 'job_cancelled'] }, 1, 0] }}
      }},
      { $addFields: {
        accepted:   { $add: ['$active', '$completed'] },
        acceptRate: { $round: [{ $multiply: [{ $divide: [{ $add: ['$active', '$completed'] }, { $max: ['$total', 1] }] }, 100] }, 1] },
        cancelRate: { $round: [{ $multiply: [{ $divide: ['$cancelled', { $max: ['$total', 1] }] }, 100] }, 1] }
      }},
      { $sort: { '_id.storeId': 1, total: -1 } }
    ];

    const rows = await c.db('4pl-oms').collection('autobatchingjobs').aggregate(pipeline).toArray();
    const data = rows.map(r => ({
      riderId:    safeStr(r._id.riderId),
      riderName:  r.riderName || safeStr(r._id.riderId) || 'Unknown',
      storeCode:  storeIdToCode[safeStr(r._id.storeId)] || safeStr(r._id.storeId),
      total:      r.total,
      active:     r.active,
      completed:  r.completed,
      cancelled:  r.cancelled,
      accepted:   r.accepted,
      acceptRate: r.acceptRate,
      cancelRate: r.cancelRate
    }));

    res.json({ count: data.length, data });
  } catch (e) {
    console.error('[/api/rider-performance]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
