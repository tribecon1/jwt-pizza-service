function loadFreshMetricsModule() {
  jest.resetModules();
  jest.doMock('../src/config', () => ({
    metrics: {
      source: 'test-suite',
      endpointUrl: 'http://example.test/otlp',
      accountId: 'test-account',
      apiKey: 'test-api-key',
    },
  }));

  return require('../src/metrics');
}

describe('metrics basics', () => {
  test('requestTracker increments totals by method', () => {
    const metrics = loadFreshMetricsModule();

    const next = jest.fn();
    metrics.requestTracker({ method: 'GET' }, {}, next);
    metrics.requestTracker({ method: 'GET' }, {}, next);
    metrics.requestTracker({ method: 'POST' }, {}, next);

    expect(next).toHaveBeenCalledTimes(3);
    expect(metrics.requestsByMethod.GET).toBe(2);
    expect(metrics.requestsByMethod.POST).toBe(1);

    const httpMetrics = metrics.buildHttpMetrics();
    const byName = Object.fromEntries(httpMetrics.map((m) => [m.metricName, m.metricValue]));
    expect(byName.http_requests_get_total).toBe(2);
    expect(byName.http_requests_post_total).toBe(1);
    expect(byName.http_requests_total).toBe(3);
  });

  test('recordHttpRequest ignores negative latency (indirectly)', () => {
    const metrics = loadFreshMetricsModule();

    metrics.recordHttpRequest({ latencyMs: -1 });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue('ok'),
    });

    jest.useFakeTimers();
    metrics.sendMetricsPeriodically(10);
    jest.advanceTimersByTime(11);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    const sentMetricNames = body.resourceMetrics[0].scopeMetrics[0].metrics.map((m) => m.name);

    expect(sentMetricNames).toContain('http_request_latency_seconds_total');
    expect(sentMetricNames).toContain('http_request_latency_count_total');

    jest.useRealTimers();
  });

  test('recordAuthAttempt increments success and failed counters', () => {
    const metrics = loadFreshMetricsModule();

    metrics.recordAuthAttempt(true);
    metrics.recordAuthAttempt(false);
    metrics.recordAuthAttempt(false);

    const authMetrics = metrics.buildAuthMetrics();
    const byName = Object.fromEntries(authMetrics.map((m) => [m.metricName, m.metricValue]));
    expect(byName.auth_success_total).toBe(1);
    expect(byName.auth_failed_total).toBe(2);
  });

  test('recordPizzaPurchase tracks success, revenue, and latency', () => {
    const metrics = loadFreshMetricsModule();

    metrics.recordPizzaPurchase({ success: true, latencyMs: 250, priceBtc: 0.123 });
    metrics.recordPizzaPurchase({ success: false, latencyMs: 750, priceBtc: 999 });

    const purchaseMetrics = metrics.buildPurchaseMetrics();
    const byName = Object.fromEntries(purchaseMetrics.map((m) => [m.metricName, m.metricValue]));

    expect(byName.pizza_purchases_success_total).toBe(1);
    expect(byName.pizza_purchases_failed_total).toBe(1);
    expect(byName.pizza_revenue_btc_total).toBeCloseTo(0.123, 10);
    expect(byName.pizza_purchase_latency_seconds_total).toBeCloseTo(1.0, 10);
    expect(byName.pizza_purchase_latency_count_total).toBe(2);
  });

  test('activeUserTracker records authenticated user and calls next', () => {
    const metrics = loadFreshMetricsModule();

    jest.spyOn(Date, 'now').mockReturnValue(1_000_000);

    const next = jest.fn();
    metrics.activeUserTracker({ user: { id: 42 } }, {}, next);

    expect(next).toHaveBeenCalledTimes(1);
    const userMetrics = metrics.buildUserMetrics();
    expect(userMetrics).toEqual([
      expect.objectContaining({
        metricName: 'active_authenticated_users_1m',
        metricValue: 1,
      }),
    ]);

    Date.now.mockRestore();
  });

  test('latencyTracker records latency on response finish', () => {
    const metrics = loadFreshMetricsModule();

    const { EventEmitter } = require('events');
    const res = new EventEmitter();
    const next = jest.fn();

    metrics.latencyTracker({}, res, next);
    expect(next).toHaveBeenCalledTimes(1);

    res.emit('finish');

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue('ok'),
    });

    jest.useFakeTimers();
    metrics.sendMetricsPeriodically(10);
    jest.advanceTimersByTime(11);

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    const sentMetrics = body.resourceMetrics[0].scopeMetrics[0].metrics;
    const latencyCountMetric = sentMetrics.find((m) => m.name === 'http_request_latency_count_total');
    expect(latencyCountMetric).toBeDefined();
    expect(latencyCountMetric.sum.dataPoints[0].asInt).toBeGreaterThanOrEqual(1);

    jest.useRealTimers();
  });

  test('sendMetricsPeriodically handles fetch not-ok response', async () => {
    const metrics = loadFreshMetricsModule();

    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      text: jest.fn().mockResolvedValue('nope'),
    });

    jest.useFakeTimers();
    metrics.sendMetricsPeriodically(10);
    jest.advanceTimersByTime(11);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    // allow the nested fetch().then(...).then(...) chain to run
    await Promise.resolve();
    await Promise.resolve();
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
    jest.useRealTimers();
  });

  test('active user pruning drops users after 60s window', () => {
    const metrics = loadFreshMetricsModule();

    jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    metrics.recordActiveUser('abc');

    Date.now.mockReturnValue(1_000_000 + 61_000);
    const userMetrics = metrics.buildUserMetrics();
    expect(userMetrics[0].metricValue).toBe(0);

    Date.now.mockRestore();
  });
});

