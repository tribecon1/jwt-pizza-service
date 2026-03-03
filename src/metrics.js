const config = require('./config');

// Cumulative counters by HTTP method, plus overall.
// These are process-lifetime monotonic counters; Grafana can derive per-minute
// rates using rate() / increase() on these sums.
const requestsByMethod = {};
let totalRequests = 0;

// Middleware to track requests globally by HTTP method only.
function requestTracker(req, res, next) {
  const method = req.method || 'UNKNOWN';
  requestsByMethod[method] = (requestsByMethod[method] || 0) + 1;
  totalRequests += 1;
  next();
}

// Send a single metric payload to Grafana OTLP HTTP endpoint.
function sendMetricToGrafana(metricName, metricValue, type, unit) {
  const metric = {
    resourceMetrics: [
      {
        scopeMetrics: [
          {
            metrics: [
              {
                name: metricName,
                unit: unit,
                [type]: {
                  dataPoints: [
                    {
                      asInt: metricValue,
                      timeUnixNano: Date.now() * 1000000,
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    ],
  };

  if (type === 'sum') {
    metric.resourceMetrics[0].scopeMetrics[0].metrics[0][type].aggregationTemporality = 'AGGREGATION_TEMPORALITY_CUMULATIVE';
    metric.resourceMetrics[0].scopeMetrics[0].metrics[0][type].isMonotonic = true;
  }

  const body = JSON.stringify(metric);
  fetch(`${config.metrics.endpointUrl}`, {
    method: 'POST',
    body: body,
    headers: { Authorization: `Bearer ${config.metrics.accountId}:${config.metrics.apiKey}`, 'Content-Type': 'application/json' },
  })
    .then((response) => {
      if (!response.ok) {
        response.text().then((text) => {
          console.error(`Failed to push metrics data to Grafana: ${text}\n${body}`);
        });
      } else {
        console.log(`Pushed ${metricName}`);
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

// Stub: build system-level metrics (CPU, memory, etc.).
// Fill this out later as you implement system metrics.
function buildSystemMetrics() {
  return [];
}

// Stub: build user-related metrics.
function buildUserMetrics() {
  return [];
}

// Stub: build purchase/order-related metrics (e.g., pizzas ordered).
function buildPurchaseMetrics() {
  return [];
}

// Stub: build auth-related metrics.
function buildAuthMetrics() {
  return [];
}

// Periodically collect all metric sets and send them to Grafana.
// `periodMs` is the interval in milliseconds (e.g., 60000 for "per minute").
function sendMetricsPeriodically(periodMs) {
  setInterval(() => {
    try {
      const allMetrics = [
        ...buildHttpMetrics(),
        ...buildSystemMetrics(),
        ...buildUserMetrics(),
        ...buildPurchaseMetrics(),
        ...buildAuthMetrics(),
      ];

      for (const { metricName, metricValue, type, unit } of allMetrics) {
        sendMetricToGrafana(metricName, metricValue, type, unit);
      }
    } catch (error) {
      console.log('Error sending metrics', error);
    }
  }, periodMs);
}

module.exports = {
  requestTracker,
  requestsByMethod,
  buildHttpMetrics,
  buildSystemMetrics,
  buildUserMetrics,
  buildPurchaseMetrics,
  buildAuthMetrics,
  sendMetricsPeriodically,
};