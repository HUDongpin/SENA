# SENA Observability Sink

Minimal external HTTPS sink for SENA production observability probes.

This service accepts only redacted SENA observed-request delivery payloads. It
validates the `x-sena-signature` HMAC with `SENA_OBSERVABILITY_SINK_SECRET` and
returns `204` on success.

Required production env:

- `SENA_OBSERVABILITY_SINK_SECRET`

Routes:

- `/api/sena-observability` - signed POST sink.
- `/api/sena-alerts` - signed alert webhook sink.
- `/api/health` - liveness check.
- `/api/dashboard` - small HTML dashboard/readiness surface.
- `/api/runbook` - operator runbook for the SENA meeting-demo path.
