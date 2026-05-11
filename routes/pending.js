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

module.exports = router;
