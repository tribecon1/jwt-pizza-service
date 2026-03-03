const app = require('./service.js');
const { sendMetricsPeriodically } = require('./metrics');

// Start pushing HTTP method metrics to Grafana once every 10 seconds.
sendMetricsPeriodically(10000);

const port = process.argv[2] || 3000;
app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
