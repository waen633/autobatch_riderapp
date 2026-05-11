const { google } = require('googleapis');
const { ObjectId } = require('mongodb');
const { getClient } = require('../lib/db');
const { safeStr, splitCodes } = require('../lib/helpers');
const { evalEligibility, buildMapUrl } = require('../lib/eligibility');

const HEADERS = [
  'อัพเดตล่าสุด',
  'ลำดับคิว',
  'ชื่อ Rider',
  'Username',
  'เบอร์โทร',
  'สถานะ Pool',
  'พร้อม Auto-Assign',
  'ไม่โดน Ban',
  'ไม่มีงานในมือ',
  'ไม่ได้พัก',
  'Job ปัจจุบัน',
  'สถานะ Job',
  'แผนที่'
];

const JOB_STATUS_LABEL = {
  job_accepted:   'รับงานแล้ว',
  job_assigned:   'กำลัง Assign',
  job_picking_up: 'กำลังไปรับ',
  job_picked_up:  'รับของแล้ว',
  job_delivering: 'กำลังส่ง'
};

function bool(val) {
  return val ? '✅ ใช่' : '❌ ไม่';
}

function getSheetsClient() {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/spreadsheets']
  );
  return google.sheets({ version: 'v4', auth });
}

async function ensureSheetTab(sheets, sheetId, tabName) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const exists = (meta.data.sheets || []).some(s => s.properties.title === tabName);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] }
    });
  }
}

async function fetchRiderData(storeCodes) {
  const c = await getClient();

  const [zones, stores] = await Promise.all([
    c.db('4pl-address-and-zoning').collection('geographies')
      .find(
        { storeCode: { $in: storeCodes }, deleted: { $ne: true }, areaPath: { $exists: true, $ne: ',,' } },
        { projection: { _id: 0, storeCode: 1, areaPath: 1 } }
      ).toArray(),
    c.db('lastmile').collection('stores')
      .find(
        { code: { $in: storeCodes } },
        { projection: { _id: 0, code: 1, location: 1, 'metadata.config.assignment.autoAssign.jobSurface.radius': 1 } }
      ).toArray()
  ]);

  const storeMap = {};
  stores.forEach(s => { storeMap[s.code] = s; });

  const storeClusterMap = {};
  zones.forEach(z => {
    const clusters = (z.areaPath || '').split(',').map(x => x.trim()).filter(x => /^[a-f0-9]{24}$/i.test(x));
    if (!storeClusterMap[z.storeCode]) storeClusterMap[z.storeCode] = { storeCode: z.storeCode, clusterIds: new Set() };
    clusters.forEach(x => storeClusterMap[z.storeCode].clusterIds.add(x));
  });

  // result grouped by storeCode
  const byStore = {};

  for (const [code, item] of Object.entries(storeClusterMap)) {
    const clusterList = Array.from(item.clusterIds).map(id => new ObjectId(id));
    const store = storeMap[code] || null;
    byStore[code] = [];

    const staffs = await c.db('4pl-fleet').collection('staffs')
      .find(
        { 'metaData.shifts.clusterId': { $in: clusterList }, status: 'ONLINE' },
        { projection: { _id: 0, userId: 1, username: 1, firstname: 1, lastname: 1, phone: 1, status: 1, breakAt: 1, location: 1, 'metaData.autoBatchRejected': 1 } }
      ).toArray();

    const staffMap = {};
    const staffUserIds = [];
    staffs.forEach(s => {
      const uid = safeStr(s.userId);
      if (uid) { staffMap[uid] = s; staffUserIds.push(s.userId); }
    });
    if (!staffUserIds.length) continue;

    const jobs = await c.db('4pl-oms').collection('autobatchingjobs')
      .find(
        { 'assignment.rider.id': { $in: staffUserIds }, status: { $in: ['job_accepted', 'job_assigned', 'job_picking_up', 'job_picked_up', 'job_delivering'] } },
        { projection: { _id: 0, jobId: 1, status: 1, 'assignment.rider.id': 1 } }
      ).toArray();

    const activeJobMap = new Map();
    jobs.forEach(j => {
      const rid = safeStr(j.assignment?.rider?.id);
      if (rid && !activeJobMap.has(rid)) activeJobMap.set(rid, { jobId: j.jobId, status: j.status });
    });

    const pools = await c.db('4pl-oms').collection('autobatchingriderpools')
      .find({ userId: { $in: staffUserIds } }, { projection: { _id: 1, userId: 1, status: 1, createdAt: 1 } })
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
      byStore[code].push({
        queue: queueIndex++,
        name: `${staff?.firstname || ''} ${staff?.lastname || ''}`.trim(),
        username: staff?.username || '', phone: staff?.phone || '',
        poolStatus: p.status,
        eligible, not_banned: flags.not_banned, no_active_job: flags.no_active_job, not_on_break: flags.not_on_break,
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
      byStore[code].push({
        queue: 'ไม่อยู่ใน Pool',
        name: `${staff?.firstname || ''} ${staff?.lastname || ''}`.trim(),
        username: staff?.username || '', phone: staff?.phone || '',
        poolStatus: 'N/A',
        eligible, not_banned: flags.not_banned, no_active_job: flags.no_active_job, not_on_break: flags.not_on_break,
        job_on_hand_id: !flags.no_active_job && jobInfo ? jobInfo.jobId : null,
        job_on_hand_status: !flags.no_active_job && jobInfo ? jobInfo.status : null,
        mapUrl: buildMapUrl(staff, store)
      });
    });
  }

  return byStore;
}

async function syncRidersToSheet() {
  const storeCodes = splitCodes(process.env.SYNC_STORE_CODES);
  const sheetId = process.env.GOOGLE_SHEET_ID;

  if (!storeCodes.length || !sheetId) {
    console.log('[Sheet Sync] skipped — SYNC_STORE_CODES or GOOGLE_SHEET_ID not set');
    return;
  }

  try {
    const byStore = await fetchRiderData(storeCodes);
    const sheets = getSheetsClient();
    const timestamp = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
    let totalRows = 0;

    for (const [storeCode, riders] of Object.entries(byStore)) {
      const tabName = `Store ${storeCode}`;
      await ensureSheetTab(sheets, sheetId, tabName);

      const rows = riders.map(r => [
        r.queue,
        r.name,
        r.username,
        r.phone,
        r.poolStatus,
        bool(r.eligible),
        bool(r.not_banned),
        bool(r.no_active_job),
        bool(r.not_on_break),
        r.job_on_hand_id || '',
        r.job_on_hand_status ? (JOB_STATUS_LABEL[r.job_on_hand_status] || r.job_on_hand_status) : '',
        r.mapUrl || ''
      ]);

      // row 1 = updated timestamp, row 2 = headers, row 3+ = data
      const updatedRow = [`🕐 Updated: ${timestamp}`, '', '', '', '', '', '', '', '', '', '', ''];
      const headerRow = HEADERS.filter(h => h !== 'อัพเดตล่าสุด');

      await sheets.spreadsheets.values.clear({ spreadsheetId: sheetId, range: `${tabName}!A:Z` });
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `${tabName}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [updatedRow, headerRow, ...rows] }
      });

      totalRows += rows.length;
      console.log(`[Sheet Sync] ${tabName} — ${rows.length} riders`);
    }

    console.log(`[Sheet Sync] done — ${totalRows} rows total at ${timestamp}`);
  } catch (e) {
    console.error('[Sheet Sync] error:', e.message);
  }
}

function startSyncScheduler() {
  if (!process.env.SYNC_STORE_CODES || !process.env.GOOGLE_SHEET_ID) {
    console.log('[Sheet Sync] disabled — SYNC_STORE_CODES or GOOGLE_SHEET_ID not set');
    return;
  }

  // รันทันทีตอน start
  syncRidersToSheet();

  // รอจนถึง :00 นาทีถัดไป แล้วค่อย setInterval ทุก 1 ชม.
  const now = new Date();
  const msUntilNextHour =
    (60 - now.getMinutes()) * 60 * 1000
    - now.getSeconds() * 1000
    - now.getMilliseconds();

  const nextHour = new Date(now.getTime() + msUntilNextHour);
  console.log(`[Sheet Sync] scheduler started — next sync at ${nextHour.toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' })} (ทุก :00)`);

  setTimeout(() => {
    syncRidersToSheet();
    setInterval(syncRidersToSheet, 60 * 60 * 1000);
  }, msUntilNextHour);
}

module.exports = { startSyncScheduler };
