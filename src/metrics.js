const config = require('./config');
const os = require('os');

// These are process-lifetime monotonic counters; Grafana can derive per-minute
// rates using rate() / increase() on these sums.
const requestsByMethod = {};
let totalRequests = 0;
let authAttemptsSuccess = 0;
let authAttemptsFailed = 0;
let pizzaPurchasesSuccess = 0;
let pizzaPurchasesFailed = 0;
let pizzaRevenueBtc = 0;
let pizzaLatencyTotalSeconds = 0;
let pizzaLatencyCount = 0;
let httpLatencyTotalSeconds = 0;
let httpLatencyCount = 0;
const ACTIVE_USER_WINDOW_MS = 60_000;
const activeUsersLastSeen = new Map();


// Middleware to track requests globally by HTTP method only.
function requestTracker(req, res, next) {
  const method = req.method || 'UNKNOWN';
  requestsByMethod[method] = (requestsByMethod[method] || 0) + 1;
  totalRequests += 1;
  next();
}

function recordHttpRequest({ latencyMs }) {
  if (latencyMs < 0) {
    return;
  }

  httpLatencyTotalSeconds += latencyMs / 1000;
  httpLatencyCount += 1;
}

function latencyTracker(req, res, next) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    try {
      const end = process.hrtime.bigint();
      const diffNs = end - start;
      const latencyMs = Number(diffNs) / 1e6;
      recordHttpRequest({ latencyMs });
    } catch (error) {
      console.error('Failed to record HTTP latency metric', error);
    }
  });

  next();
}

function recordActiveUser(userId) {
  if (!userId) {
    return;
  }

  activeUsersLastSeen.set(String(userId), Date.now());
}

function pruneAndCountActiveUsers(now) {
  let count = 0;

  for (const [userId, lastSeen] of activeUsersLastSeen.entries()) {
    if (now - lastSeen > ACTIVE_USER_WINDOW_MS) {
      activeUsersLastSeen.delete(userId);
    } else {
      count += 1;
    }
  }

  return count;
}

function activeUserTracker(req, res, next) {
  try {
    if (req.user && req.user.id) {
      recordActiveUser(req.user.id);
    }
  } catch (error) {
    console.error('Failed to record active user metric', error);
  } finally {
    next();
  }
}

function recordAuthAttempt(success) {
  if (success) {
    authAttemptsSuccess += 1;
  } else {
    authAttemptsFailed += 1;
  }
}

function recordPizzaPurchase({ success, latencyMs, priceBtc }) {
  if (success) {
    pizzaPurchasesSuccess += 1;
    pizzaRevenueBtc += priceBtc;
  } else {
    pizzaPurchasesFailed += 1;
  }

  // track latency for both success and failure (in decimal seconds)
  pizzaLatencyTotalSeconds += latencyMs / 1000;
  pizzaLatencyCount += 1;
}

function getCpuUsagePercentage() {
  const cpuUsage = os.loadavg()[0] / os.cpus().length;
  return Number((cpuUsage * 100).toFixed(2));
}

function getMemoryUsagePercentage() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryUsage = (usedMemory / totalMemory) * 100;
  return Number(memoryUsage.toFixed(2));
}

// Build a single OTLP metric object for inclusion in a batch
function createMetric(metricName, metricValue, unit, type, valueType = 'asInt', attributes = {}) {
  const merged = { ...attributes, source: config.metrics.source };
  const dataPoint = {
    [valueType]: metricValue,
    timeUnixNano: Date.now() * 1000000,
    attributes: Object.entries(merged).map(([key, value]) => ({
      key,
      value: { stringValue: String(value) },
    })),
  };

  const metric = {
    name: metricName,
    unit,
    [type]: {
      dataPoints: [dataPoint],
    },
  };

  if (type === 'sum') {
    metric[type].aggregationTemporality = 'AGGREGATION_TEMPORALITY_CUMULATIVE';
    metric[type].isMonotonic = true;
  }

  return metric;
}

// Send a batch of OTLP metric objects to Grafana in a single POST.
function sendMetricsToGrafana(metrics) {
  if (metrics.length === 0) return;

  const body = {
    resourceMetrics: [
      {
        scopeMetrics: [
          {
            metrics,
          },
        ],
      },
    ]
  };

  const bodyStr = JSON.stringify(body);
  fetch(`${config.metrics.endpointUrl}`, {
    method: 'POST',
    body: bodyStr,
    headers: {
      Authorization: `Bearer ${config.metrics.accountId}:${config.metrics.apiKey}`,
      'Content-Type': 'application/json',
    },
  })
    .then((response) => {
      if (!response.ok) {
        response.text().then((text) => {
          console.error(`Failed to push metrics to Grafana: ${text}\n${bodyStr}`);
        });
      } else {
        console.log(`Pushed ${metrics.length} metrics to Grafana`);
      }
    })
    .catch((error) => {
      console.error('Error pushing metrics:', error);
    });
}

// ---- Metric builder functions ------------------------------------------------
function buildHttpMetrics() {
  const metrics = [];

  for (const [method, count] of Object.entries(requestsByMethod)) {
    metrics.push({
      metricName: `http_requests_${method.toLowerCase()}_total`,
      metricValue: count,
      type: 'sum',
      unit: '1',
    });
  }

  metrics.push({
    metricName: 'http_requests_total',
    metricValue: totalRequests,
    type: 'sum',
    unit: '1',
  });

  return metrics;
}


function buildSystemMetrics() {
  return [
    {
      metricName: 'system_cpu_usage_percentage',
      metricValue: getCpuUsagePercentage(),
      type: 'gauge',
      unit: '%',
      valueType: 'asDouble',
    },
    {
      metricName: 'system_memory_usage_percentage',
      metricValue: getMemoryUsagePercentage(),
      type: 'gauge',
      unit: '%',
      valueType: 'asDouble',
    },
  ];
}

function buildUserMetrics() {
  const now = Date.now();
  const activeUserCount = pruneAndCountActiveUsers(now);

  return [
    {
      metricName: 'active_authenticated_users_1m',
      metricValue: activeUserCount,
      type: 'gauge',
      unit: '1',
    },
  ];
}

function buildPurchaseMetrics() {
  return [
    {
      metricName: 'pizza_purchases_success_total',
      metricValue: pizzaPurchasesSuccess,
      type: 'sum',
      unit: '1',
    },
    {
      metricName: 'pizza_purchases_failed_total',
      metricValue: pizzaPurchasesFailed,
      type: 'sum',
      unit: '1',
    },
    {
      metricName: 'pizza_revenue_btc_total',
      metricValue: pizzaRevenueBtc,
      type: 'sum',
      unit: 'BTC',
      valueType: 'asDouble',
    },
    {
      metricName: 'pizza_purchase_latency_seconds_total',
      metricValue: pizzaLatencyTotalSeconds,
      type: 'sum',
      unit: 's',
      valueType: 'asDouble',
    },
    {
      metricName: 'pizza_purchase_latency_count_total',
      metricValue: pizzaLatencyCount,
      type: 'sum',
      unit: '1',
    },
  ];
}

function buildHttpLatencyMetrics() {
  return [
    {
      metricName: 'http_request_latency_seconds_total',
      metricValue: httpLatencyTotalSeconds,
      type: 'sum',
      unit: 's',
      valueType: 'asDouble',
    },
    {
      metricName: 'http_request_latency_count_total',
      metricValue: httpLatencyCount,
      type: 'sum',
      unit: '1',
    },
  ];
}

// Build auth-related metrics (login success vs failed).
function buildAuthMetrics() {
  return [
    {
      metricName: 'auth_success_total',
      metricValue: authAttemptsSuccess,
      type: 'sum',
      unit: '1',
    },
    {
      metricName: 'auth_failed_total',
      metricValue: authAttemptsFailed,
      type: 'sum',
      unit: '1',
    },
  ];
}

// Periodically collect all metric sets, batch them into one OTLP payload, and send to Grafana.
// `periodMs` is the interval in milliseconds (e.g., 60000 for "per minute").
function sendMetricsPeriodically(periodMs) {
  setInterval(() => {
    try {
      const descriptors = [
        ...buildHttpMetrics(),
        ...buildSystemMetrics(),
        ...buildUserMetrics(),
        ...buildPurchaseMetrics(),
        ...buildAuthMetrics(),
        ...buildHttpLatencyMetrics(),
      ];

      const metricObjects = descriptors.map(({ metricName, metricValue, type, unit, valueType = 'asInt' }) =>
        createMetric(metricName, metricValue, unit, type, valueType, {})
      );

      sendMetricsToGrafana(metricObjects);
    } catch (error) {
      console.log('Error sending metrics', error);
    }
  }, periodMs);
}

module.exports = {
  requestTracker,
  latencyTracker,
  requestsByMethod,
  recordAuthAttempt,
  buildHttpMetrics,
  buildSystemMetrics,
  buildUserMetrics,
  buildPurchaseMetrics,
  buildAuthMetrics,
  sendMetricsPeriodically,
  recordPizzaPurchase,
  recordHttpRequest,
  recordActiveUser,
  activeUserTracker,
};