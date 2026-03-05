const config = require('./config');
const os = require('os');

// These are process-lifetime monotonic counters; Grafana can derive per-minute
// rates using rate() / increase() on these sums.
const requestsByMethod = {};
let totalRequests = 0;

let loginAttemptsSuccess = 0;
let loginAttemptsFailed = 0;

// Middleware to track requests globally by HTTP method only.
function requestTracker(req, res, next) {
  const method = req.method || 'UNKNOWN';
  requestsByMethod[method] = (requestsByMethod[method] || 0) + 1;
  totalRequests += 1;
  next();
}

function recordLoginAttempt(success) {
  if (success) {
    loginAttemptsSuccess += 1;
  } else {
    loginAttemptsFailed += 1;
  }
}

// Build a single OTLP metric object for inclusion in a batch.
// attributes are merged with config.metrics.source so Grafana can filter by source.
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

// Build HTTP request metrics (per-method and overall).
// Returns an array of simple metric descriptors, which can be extended to
// include labels or additional metadata in the future.
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

// Stub: build system-level metrics (CPU, memory, etc.).
// Fill this out later as you implement system metrics.
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

// Stub: build user-related metrics.
function buildUserMetrics() {
  return [];
}

// Stub: build purchase/order-related metrics (e.g., pizzas ordered).
function buildPurchaseMetrics() {
  return [];
}

// Build auth-related metrics (login success vs failed).
function buildAuthMetrics() {
  return [
    {
      metricName: 'auth_login_success_total',
      metricValue: loginAttemptsSuccess,
      type: 'sum',
      unit: '1',
    },
    {
      metricName: 'auth_login_failed_total',
      metricValue: loginAttemptsFailed,
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
  requestsByMethod,
  recordLoginAttempt,
  buildHttpMetrics,
  buildSystemMetrics,
  buildUserMetrics,
  buildPurchaseMetrics,
  buildAuthMetrics,
  sendMetricsPeriodically,
};