/**
 * In-memory login attempt rate limiting by IP.
 */

const attemptTimestampsByIp = new Map();

let maxAttemptsPerWindow = 25;
let windowMs = 15 * 60 * 1000;

function pruneOldTimestamps(ip, now) {
  const timestamps = attemptTimestampsByIp.get(ip) || [];
  const recent = timestamps.filter((t) => now - t < windowMs);
  if (recent.length === 0) {
    attemptTimestampsByIp.delete(ip);
  } else {
    attemptTimestampsByIp.set(ip, recent);
  }
  return recent;
}

/**
 * @returns {{ allowed: boolean }}
 */
function checkLoginRateLimit(ip) {
  const safeIp = ip || 'unknown';
  const now = Date.now();
  const recent = pruneOldTimestamps(safeIp, now);
  if (recent.length >= maxAttemptsPerWindow) {
    return { allowed: false };
  }
  recent.push(now);
  attemptTimestampsByIp.set(safeIp, recent);
  return { allowed: true };
}

function configureLoginRateLimit(opts) {
  if (opts.maxAttemptsPerWindow !== undefined) {
    maxAttemptsPerWindow = opts.maxAttemptsPerWindow;
  }
  if (opts.windowMs !== undefined) {
    windowMs = opts.windowMs;
  }
}

function resetLoginRateLimitForTests() {
  attemptTimestampsByIp.clear();
  maxAttemptsPerWindow = 25;
  windowMs = 15 * 60 * 1000;
}

module.exports = {
  checkLoginRateLimit,
  configureLoginRateLimit,
  resetLoginRateLimitForTests,
};
