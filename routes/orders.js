const { Router } = require('express');
const polyline = require('polyline');
const { getClient } = require('../lib/db');
const { safeStr } = require('../lib/helpers');

const router = Router();

router.get('/orders', async (req, res) => {
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

    const docs = await c.db('4pl-oms').collection('orders')
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
          'workflowInput.tasks': 1,
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

    const data = docs.map(d => {
      const pickupTask = (d.workflowInput?.tasks || []).find(t => t.direction === 'PICKUP');
      const deliveryTask = (d.workflowInput?.tasks || []).find(t => t.direction === 'DELIVERY');
      const rawResults = [];
      if (pickupTask?.lat && pickupTask?.lng && deliveryTask?.lat && deliveryTask?.lng) {
        const consignmentLabel = d.workflowInput?.metadata?.consignment || 'Order';
        const encoded = polyline.encode([[pickupTask.lat, pickupTask.lng], [deliveryTask.lat, deliveryTask.lng]], 5);
        rawResults.push(JSON.stringify({
          visits: [
            { isPickup: true, visitLabel: 'Pickup', shipmentLabel: consignmentLabel, loadDemands: {} },
            { isPickup: false, visitLabel: 'Delivery', shipmentLabel: consignmentLabel, loadDemands: {} }
          ],
          transitions: [{ routePolyline: {} }, { routePolyline: { points: encoded } }]
        }));
      }
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
        statusHistory: (d.orderStatuses || []).map(s => ({ status: s.status, updatedAt: s.updatedAt, taskId: s.metadata?.taskId || null })),
        rawResults
      };
    });

    res.json({ count: data.length, data });
  } catch (e) {
    console.error('[/api/orders]', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/batches', async (req, res) => {
  try {
    const { orderIds } = req.query;
    if (!orderIds) return res.status(400).json({ error: 'orderIds required' });

    const idList = orderIds.split(',').map(s => s.trim()).filter(Boolean);
    if (!idList.length) return res.status(400).json({ error: 'no orderIds provided' });

    const c = await getClient();
    const filter = idList.length === 1 ? { orderIds: idList[0] } : { orderIds: { $in: idList } };
    const docs = await c.db('4pl-oms').collection('autobatchingbatches')
      .find(filter, {
        projection: {
          _id: 1, orderIds: 1, storeId: 1, status: 1, createdAt: 1, batchId: 1,
          'routeOptimization.startTime': 1,
          'routeOptimization.endTime': 1,
          'routeOptimization.status': 1
        }
      })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    const data = docs.map(d => ({
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

    res.json({ count: data.length, data });
  } catch (e) {
    console.error('[/api/batches]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
