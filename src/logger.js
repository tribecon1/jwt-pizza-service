const config = require('./config');

class Logger {
  httpLogger = (req, res, next) => {
    let send = res.send;
    res.send = (resBody) => {
      const logData = {
        authorized: !!req.headers.authorization,
        path: req.originalUrl,
        method: req.method,
        statusCode: res.statusCode,
        reqBody: JSON.stringify(req.body),
        resBody: JSON.stringify(resBody),
      };
      const level = this.statusToLogLevel(res.statusCode);
      this.log(level, 'http', logData);
      res.send = send;
      return res.send(resBody);
    };
    next();
  };

  dbQuery(sql, meta = {}) {
    const logData = {
      sql,
      // safest default: omit params entirely
      ...meta, // e.g. durationMs, rowCount, error
    };
    const level = meta.error ? 'error' : 'info';
    this.log(level, 'db', logData);
  }

  factoryCall(logData) {
    this.log('info', 'factory', logData);
  }

  log(level, type, logData) {
    const labels = { component: config.logging.source, level: level, type: type };
    const values = [this.nowString(), this.sanitize(logData)];
    const logEvent = { streams: [{ stream: labels, values: [values] }] };

    this.sendLogToGrafana(logEvent);
  }

  statusToLogLevel(statusCode) {
    if (statusCode >= 500) return 'error';
    if (statusCode >= 400) return 'warn';
    return 'info';
  }

  nowString() {
    return (Math.floor(Date.now()) * 1000000).toString();
  }

  sanitize(logData) {
    logData = JSON.stringify(logData);
    logData = logData.replace(/\\"password\\":\s*\\"[^"]*\\"/gi, '\\"password\\": \\"*****\\"');
    logData = logData.replace(/\\"authorization\\":\s*\\"Bearer [^"]+\\"/gi, '\\"authorization\\": \\"Bearer *****\\"');
    logData = logData.replace(/\\"token\\":\s*\\"[^"]*\\"/gi, '\\"token\\": \\"*****\\"');
    logData = logData.replace(/\\"jwt\\":\s*\\"[^"]*\\"/gi, '\\"jwt\\": \\"*****\\"');
    logData = logData.replace(/\\"jwtSecret\\":\s*\\"[^"]*\\"/gi, '\\"jwtSecret\\": \\"*****\\"');
    logData = logData.replace(/\\"apiKey\\":\s*\\"[^"]*\\"/gi, '\\"apiKey\\": \\"*****\\"');

    return logData;
  }

  sendLogToGrafana(event) {
    const body = JSON.stringify(event);
    fetch(`${config.logging.endpointUrl}`, {
      method: 'post',
      body: body,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.logging.accountId}:${config.logging.apiKey}`,
      },
    }).then((res) => {
      if (!res.ok) console.log('Failed to send log to Grafana Loki');
    });
  }
}
module.exports = new Logger();