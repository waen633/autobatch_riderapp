const express = require('express');
const { getClient } = require('../lib/db');

const router = express.Router();

router.get('/zones', async (req, res) => {
  try {
    const client = await getClient();
    const db = client.db('4pl-address-and-zoning');
    const raw = await db.collection('geographies')
      .find({ serviceAreaType: 'polygon', deleted: { $ne: true } })
      .project({ name: 1, code: 1, _id: 1, 'metadata.areaCode': 1, businessUnit: 1, serviceType: 1, 'feature.geometry': 1 })
      .sort({ name: 1 })
      .toArray();

    // Deduplicate by name — prefer TIKTOK businessUnit
    const nameMap = {};
    for (const z of raw) {
      if (!nameMap[z.name] || z.businessUnit === 'TIKTOK') nameMap[z.name] = z;
    }
    const zones = Object.values(nameMap).sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      ok: true,
      count: zones.length,
      data: zones.map(z => ({
        id: z._id.toString(),
        name: z.name,
        code: z.code,
        areaCode: z.metadata?.areaCode,
        businessUnit: z.businessUnit,
        serviceType: z.serviceType,
        geometry: z.feature?.geometry || null
      }))
    });
  } catch (e) {
    console.error('GET /api/zones error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
