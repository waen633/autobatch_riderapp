const { Router } = require('express');
const { ObjectId } = require('mongodb');
const tencentcloud = require('tencentcloud-sdk-nodejs-cls');
const ClsClient = tencentcloud.cls.v20201016.Client;
const { getClient } = require('../lib/db');

const router = Router();

let _clsClient = null;
let _clsTopicId = null;

function getClsClient() {
  if (!_clsClient) {
    _clsClient = new ClsClient({
      credential: {
        secretId: process.env.CLS_SECRET_ID,
        secretKey: process.env.CLS_SECRET_KEY,
      },
      region: process.env.CLS_REGION || 'ap-singapore',
    });
  }
  return _clsClient;
}

async function getClsTopicId() {
  if (_clsTopicId) return _clsTopicId;
  if (process.env.CLS_TOPIC_ID) {
    _clsTopicId = process.env.CLS_TOPIC_ID;
    return _clsTopicId;
  }
  const client = getClsClient();
  const res = await client.DescribeTopics({
    Filters: [{ Key: 'topicName', Values: [process.env.CLS_TOPIC_NAME || 'allnow-prod-log'] }],
    Limit: 10,
  });
  const topic = (res.Topics || []).find(t => t.TopicName === (process.env.CLS_TOPIC_NAME || 'allnow-prod-log'));
  if (!topic) throw new Error(`CLS topic "${process.env.CLS_TOPIC_NAME}" not found`);
  _clsTopicId = topic.TopicId;
  return _clsTopicId;
}

router.get('/job-diagnostics', async (req, res) => {
  try {
    const { jobId, hours = '24' } = req.query;
    if (!jobId) return res.status(400).json({ error: 'jobId required' });
    if (!process.env.CLS_SECRET_ID) return res.status(503).json({ error: 'CLS not configured' });

    const hoursMs = Math.min(parseInt(hours) || 24, 168) * 3600 * 1000;
    const now = Date.now();

    const [client, topicId] = await Promise.all([
      Promise.resolve(getClsClient()),
      getClsTopicId(),
    ]);

    const result = await client.SearchLog({
      TopicId: topicId,
      From: now - hoursMs,
      To: now,
      Query: `event:"auto_assign_job" AND jobId:"${jobId}"`,
      Limit: 500,
      Sort: 'asc',
      SyntaxRule: 1,
    });

    const rounds = [];
    let assignedEvent = null;

    for (const record of (result.Results || [])) {
      let fields = {};
      try { fields = JSON.parse(record.LogJson || '{}'); } catch {}

      let msg = {};
      try { msg = JSON.parse(fields.msg || '{}'); } catch {}

      const action = fields.action || '';
      const time = fields.time || null;

      if (action === 'assigned') {
        assignedEvent = {
          time,
          riderId: msg.riderId || null,
          assignedAt: msg.assignedAt || time,
          zoneId: msg.zoneId || null,
        };
      } else if (action === 'no_available_riders_for_chunk') {
        const riderStatusMap = msg.jobUnAssignDiagnostics?.riderStatusMap || {};
        rounds.push({
          time,
          zoneIds: msg.zoneIds || [],
          clusterIds: msg.jobUnAssignDiagnostics?.clusterIds || [],
          riderStatusMap,
          totalRiders: Object.keys(riderStatusMap).length,
        });
      }
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
