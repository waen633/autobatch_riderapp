const { safeStr } = require('./helpers');

function evalEligibility(uid, pool, now, activeJobMap, staff) {
  const flags = {
    staff_online: staff?.status === 'ONLINE',
    not_banned: checkNotBanned(staff, now),
    no_active_job: !activeJobMap.has(uid),
    not_on_break: checkNotOnBreak(staff)
  };
  return { flags, eligible: Object.values(flags).every(Boolean) };
}

function checkNotBanned(staff, now) {
  if (!staff?.metaData?.autoBatchRejected) return true;
  return now > new Date(staff.metaData.autoBatchRejected);
}

function checkNotOnBreak(staff) {
  if (!staff?.breakAt) return true;
  return isNaN(new Date(staff.breakAt).getTime());
}

function buildMapUrl(staff, store) {
  const riderLng = staff?.location?.coordinates?.[0];
  const riderLat = staff?.location?.coordinates?.[1];
  const storeLng = store?.location?.coordinates?.[0];
  const storeLat = store?.location?.coordinates?.[1];
  const radius = store?.metadata?.config?.assignment?.autoAssign?.jobSurface?.radius || 100;
  if (riderLat == null || storeLat == null) return null;
  const circles = [
    [5, riderLat, riderLng, '#3AAA24', '#3DFF1F', 0.4],
    [radius, storeLat, storeLng, '#FF0000', '#AA0000', 0.4]
  ];
  return `https://www.mapdevelopers.com/draw-circle-tool.php?circles=${encodeURIComponent(JSON.stringify(circles))}`;
}

module.exports = { evalEligibility, buildMapUrl };
