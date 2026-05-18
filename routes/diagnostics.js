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

    const [clsClient, topicId] = await Promise.all([
      Promise.resolve(getClsClient()),
      getClsTopicId(),
    ]);

    // ดึง no_available_riders_for_chunk และ assigned events พร้อมกัน
    const [roundResult, assignedResult] = await Promise.all([
      clsClient.SearchLog({
        TopicId: topicId,
        From: now - hoursMs,
        To: now,
        Query: `event:"auto_assign_job" AND jobId:"${jobId}" AND action:"no_available_riders_for_chunk"`,
        Limit: 500,
        Sort: 'asc',
        SyntaxRule: 1,
      }),
      clsClient.SearchLog({
        TopicId: topicId,
        From: now - hoursMs,
        To: now,
        Query: `event:"auto_assign_job" AND jobId:"${jobId}" AND action:"assigned"`,
        Limit: 100,   // รับทุกรอบที่ assign (rider reject แล้ว re-assign)
        Sort: 'asc',
        SyntaxRule: 1,
      }),
    ]);

    // --- parse rounds ---
    const rounds = [];
    for (const record of (roundResult.Results || [])) {
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

    // --- parse ALL assigned events ---
    const assignedEvents = [];
    for (const record of (assignedResult.Results || [])) {
      let fields = {};
      try { fields = JSON.parse(record.LogJson || '{}'); } catch {}
      let msg = {};
      try { msg = JSON.parse(fields.msg || '{}'); } catch {}
      const riderId = msg.riderId || null;
      if (riderId) {
        assignedEvents.push({
          time:       fields.time || null,
          riderId,
          assignedAt: msg.assignedAt || fields.time || null,
          zoneId:     msg.zoneId || null,
          riderName:  null, // fill below
        });
      }
    }

    // --- lookup rider names for all assigned events ---
    if (assignedEvents.length) {
      try {
        const dbClient = await getClient();
        const riderIds = [...new Set(assignedEvents.map(e => e.riderId))];
        const staffs = await dbClient.db('4pl-fleet').collection('staffs').find(
          { userId: { $in: riderIds.map(id => { try { return new ObjectId(id); } catch { return null; } }).filter(Boolean) } },
          { projection: { userId: 1, firstname: 1, lastname: 1 } }
        ).toArray();

        const nameMap = {};
        for (const s of staffs) {
          nameMap[s.userId.toString()] = `${s.firstname || ''} ${s.lastname || ''}`.trim();
        }
        for (const e of assignedEvents) {
          e.riderName = nameMap[e.riderId] || null;
        }
      } catch {}
    }

    // assignedEvent = last one (final assignment)
    const assignedEvent = assignedEvents.length
      ? assignedEvents[assignedEvents.length - 1]
      : null;

    res.json({ jobId, rounds, assignedEvent, assignedEvents });
  } catch (e) {
    console.error('[/api/job-diagnostics]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
