const { Router } = require('express');
const { getClient } = require('../lib/db');
const { splitCodes } = require('../lib/helpers');

const router = Router();

router.get('/pending', async (req, res) => {
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
        { projection: { batchId: 1, orderId: 1, consignment: 1, serviceType: 1, storeCode: 1, createdAt: 1, 'workflowInput.fleetDispatchType': 1 } }
      )
      .sort({ createdAt: -1 })
      .toArray();

    // Fetch batchTime from lastmile.stores
    const storesList = await c
      .db('lastmile')
      .collection('stores')
      .find(
        { code: codeFilter },
        { projection: { code: 1, 'metadata.config.batch.batchTime': 1 } }
      )
      .toArray();

    const batchTimeMap = {};
    for (const store of storesList) {
      if (store.metadata?.config?.batch?.batchTime !== undefined) {
        batchTimeMap[store.code] = store.metadata.config.batch.batchTime;
      }
    }

    const data = docs.map(d => ({
      ...d,
      fleetDispatchType: d.workflowInput?.fleetDispatchType || null,
    }));
    res.json({ count: data.length, data, batchTimeMap });
  } catch (e) {
    console.error('[/api/pending]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
