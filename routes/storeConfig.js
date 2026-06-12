const { Router } = require('express');
const { getClient } = require('../lib/db');
const { splitCodes } = require('../lib/helpers');

const router = Router();

router.get('/store-config', async (req, res) => {
  try {
    const storeCodes = splitCodes(req.query.storeCode);
    if (!storeCodes.length) return res.status(400).json({ error: 'storeCode required' });

    const c = await getClient();
    const codeFilter = storeCodes.length === 1 ? storeCodes[0] : { $in: storeCodes };

    const stores = await c
      .db('lastmile')
      .collection('stores')
      .find(
        { code: codeFilter },
        {
          projection: {
            code: 1,
            name: 1,
            'metadata.config': 1,
          }
        }
      )
      .toArray();

    const result = stores.map(s => {
      const cfg = s.metadata?.config || {};
      return {
        code: s.code,
        name: s.name,
        batch: {
          batchTime: cfg.batch?.batchTime ?? null,
        },
        routeOptimization: {
          maximumOrders: cfg.routeOptimization?.maximumOrders ?? null,
          bufferTime: cfg.routeOptimization?.bufferTime ?? null,
          stopTime: cfg.routeOptimization?.stopTime ?? null,
          slaTime: cfg.routeOptimization?.slaTime ?? null,
          loadCapacity: cfg.routeOptimization?.fleet?.loadCapacity ?? null,
        },
        autoAssign: {
          duration: cfg.assignment?.autoAssign?.jobSurface?.duration ?? null,
          radius: cfg.assignment?.autoAssign?.jobSurface?.radius ?? null,
          rejectPunishmentTimeout: cfg.assignment?.autoAssign?.jobSurface?.rejectPunishmentTimeout ?? null,
        },
        fleet: {
          outOfStoreCountdown: cfg.fleet?.outOfStoreCountdown ?? null,
        },
      };
    });

    res.json({ data: result });
  } catch (e) {
    console.error('[/api/store-config]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
