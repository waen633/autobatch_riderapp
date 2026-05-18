const { Router } = require('express');
const { ObjectId } = require('mongodb');
const { getClsClient, getClsTopicId } = require('../lib/cls');
const { getClient } = require('../lib/db');

const router = Router();

router.get('/job-diagnostics', async (req, res) => {
  try {
    const { jobId, hours = '24' } = req.query;
    if (!jobId) return res.status(400).json({ error: 'jobId required' });
    if (!process.env.CLS_SECRET_ID) return res.status(503).json({ error: 'CLS not configured' });

    const hoursMs = Math.min(parseInt(hours) || 24, 720) * 3600 * 1000;
    const now = Date.now();

    const [client, topicId] = await Promise.all([
      Promise.resolve(getClsClient()),
      getClsTopicId(),
    ]);

    const [result, assignedResult] = await Promise.all([
      client.SearchLog({
        TopicId: topicId,
        From: now - hoursMs,
        To: now,
        Query: `event:"auto_assign_job" AND jobId:"${jobId}" AND action:"no_available_riders_for_chunk"`,
        Limit: 500,
        Sort: 'asc',
        SyntaxRule: 1,
      }),
      client.SearchLog({
        TopicId: topicId,
        From: now - hoursMs,
        To: now,
        Query: `event:"auto_assign_job" AND jobId:"${jobId}" AND action:"assigned"`,
        Limit: 1,
        Sort: 'asc',
        SyntaxRule: 1,
      }),
    ]);

    const rounds = [];
    let assignedEvent = null;

    for (const record of (result.Results || [])) {
      let fields = {};
      try { fields = JSON.parse(record.LogJson || '{}'); } catch {}
      let msg = {};
      try { msg = JSON.parse(fields.msg || '{}'); } catch {}
      const riderStatusMap = msg.jobUnAssignDiagnostics?.riderStatusMap || {};
      rounds.push({
        time: fields.time || null,
        zoneIds: msg.zoneIds || [],
        clusterIds: msg.jobUnAssignDiagnostics?.clusterIds || [],
        riderStatusMap,
        totalRiders: Object.keys(riderStatusMap).length,
      });
    }

    const assignedRecord = (assignedResult.Results || [])[0];
    if (assignedRecord) {
      let fields = {};
      try { fields = JSON.parse(assignedRecord.LogJson || '{}'); } catch {}
      let msg = {};
      try { msg = JSON.parse(fields.msg || '{}'); } catch {}
      assignedEvent = {
        time: fields.time || null,
        riderId: msg.riderId || null,
        assignedAt: msg.assignedAt || fields.time || null,
        zoneId: msg.zoneId || null,
      };
    }

    if (assignedEvent?.riderId) {
      try {
        const c = await getClient();
        const staff = await c.db('4pl-fleet').collection('staffs').findOne(
          { userId: new ObjectId(assignedEvent.riderId) },
          { projection: { firstname: 1, lastname: 1 } }
        );
        if (staff) {
          assignedEvent.riderName = `${staff.firstname || ''} ${staff.lastname || ''}`.trim();
        }
      } catch {}
    }

    res.json({ jobId, rounds, assignedEvent });
  } catch (e) {
    console.error('[/api/job-diagnostics]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
