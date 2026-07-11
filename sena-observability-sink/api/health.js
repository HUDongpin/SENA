module.exports = function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  res.status(200).json({
    status: "ok",
    service: "sena-observability-sink",
    generatedAt: new Date().toISOString()
  });
};
