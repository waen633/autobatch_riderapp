function safeStr(val) {
  try {
    if (!val) return null;
    if (typeof val?.toHexString === 'function') return val.toHexString();
    return val.toString();
  } catch { return null; }
}

function splitCodes(raw) {
  return (raw || '').split(',').map(s => s.trim()).filter(Boolean);
}

module.exports = { safeStr, splitCodes };
