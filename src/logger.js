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

  unhandledError(err, req) {
    const statusCode = err.statusCode ?? 500;
    const logData = {
      path: req.originalUrl,
      method: req.method,
      statusCode,
      message: err.message,
      stack: err.stack,
      userId: req.user?.id,
    };
    this.log('error', 'unhandled', logData);
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
    let text = JSON.stringify(logData);

    // Redact common secret-bearing keys (case-insensitive), including auth token variants.
    text = text.replace(
      /\\"(?:password|pass|pwd|token|accessToken|refreshToken|idToken|access_token|refresh_token|id_token|jwt|jwtSecret|apiKey|api_key|secret|clientSecret|authorization)\\":\s*\\"[^"]*\\"/gi,
      (match) => match.replace(/:\s*\\"[^"]*\\"/i, ': \\"*****\\"')
    );

    // Redact bearer tokens that may appear in any string field/message.
    text = text.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer *****');

    return text;
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