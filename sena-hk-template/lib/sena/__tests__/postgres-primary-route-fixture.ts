import type { SenaEnterpriseDb } from "../enterprise/state";

export class RouteMemoryPostgres {
  state: { revision: number; payload: SenaEnterpriseDb } | null = null;
  auditRows: Array<Record<string, unknown>> = [];
  uploads: Array<Record<string, unknown>> = [];
  importRuns: Array<Record<string, unknown>> = [];
  analysisRuns: Array<Record<string, unknown>> = [];
  reliabilityRuns: Array<Record<string, unknown>> = [];
  adjudications: Array<Record<string, unknown>> = [];
  validationRuns: Array<Record<string, unknown>> = [];
  expertReviews: Array<Record<string, unknown>> = [];
  projectComments: Array<Record<string, unknown>> = [];
  projectPresence: Array<Record<string, unknown>> = [];
  serverJobs: Array<Record<string, unknown>> = [];
  observedRequests: Array<Record<string, unknown>> = [];
  queries: string[] = [];

  serverJobSourceReady(record: Record<string, unknown>) {
    const delivery = record.delivery as Record<string, unknown> | undefined;
    if (!delivery || typeof delivery !== "object" || Array.isArray(delivery)) return false;
    const deliveryReady = Object.hasOwn(delivery, "sourceReady")
      ? delivery.sourceReady === true
      : delivery.webhookStatus === "delivered" || delivery.webhookStatus === "local-sink" ||
        (delivery.webhookStatus === "failed" && delivery.failureStage === "queue-dispatch");
    if (!deliveryReady) return false;
    const summary = record.payload_summary as Record<string, unknown> | undefined;
    const worker = record.worker as Record<string, unknown> | undefined;
    if (!summary || !worker || summary.hasInlineSnapshot !== false ||
      summary.hasInlineDataset !== false || worker.payloadDelivery === "inline-payload-enabled") {
      return false;
    }
    const kind = record.kind;
    if (kind === "analysis") {
      const currentCustody = summary.commandCustody === "encrypted-upload-v1" &&
        typeof summary.commandEnvelopeUploadId === "string" &&
        /^upload_[a-f0-9]{24}$/.test(summary.commandEnvelopeUploadId) &&
        typeof summary.commandEnvelopeSha256 === "string" &&
        /^[a-f0-9]{64}$/.test(summary.commandEnvelopeSha256);
      const legacyCustody = summary.commandCustody === "legacy-inline-v2" &&
        summary.commandEnvelopeUploadId === undefined &&
        summary.commandEnvelopeSha256 === undefined;
      const heartbeatCustody = summary.commandCustody === "synthetic-heartbeat-v1" &&
        summary.commandEnvelopeUploadId === undefined &&
        summary.commandEnvelopeSha256 === undefined &&
        typeof record.id === "string" && /^server_job_worker_heartbeat_[a-f0-9]{24}$/.test(record.id) &&
        record.team_id === "ops-heartbeat" && record.project_id === "worker-heartbeat" &&
        record.actor_user_id === "ops-heartbeat";
      return (currentCustody || legacyCustody || heartbeatCustody) &&
        worker.payloadDelivery === "project-pointer" &&
        typeof record.project_id === "string" && record.project_id.trim().length > 0 &&
        Number.isSafeInteger(summary.projectVersion) && Number(summary.projectVersion) > 0;
    }
    if (kind === "validation") {
      return worker.payloadDelivery === "project-pointer" &&
        typeof record.project_id === "string" && record.project_id.trim().length > 0 &&
        Number.isSafeInteger(summary.projectVersion) && Number(summary.projectVersion) > 0 &&
        summary.projectTeamId === record.team_id;
    }
    const uploadIds = summary.uploadIds;
    const exactUploadIds = Array.isArray(uploadIds) && uploadIds.length > 0 && uploadIds.length <= 100 &&
      uploadIds.every((value) => typeof value === "string" && value.trim().length > 0) &&
      new Set(uploadIds.map((value) => (value as string).trim())).size === uploadIds.length;
    if (kind === "import") return worker.payloadDelivery === "upload-pointer" && exactUploadIds;
    if (kind === "reliability") return worker.payloadDelivery === "upload-pointer" && exactUploadIds;
    return false;
  }

  serverJobRowsForSql(sql: string, values: unknown[]) {
    if (/WHERE id = \$1 LIMIT 1/i.test(sql)) {
      return this.serverJobs.filter((record) => record.id === values[0]);
    }

    let valueIndex = 0;
    let rows = [...this.serverJobs];
    if (/status\s*=\s*\$\d+/i.test(sql)) {
      const status = values[valueIndex++];
      rows = rows.filter((record) => record.status === status);
    }
    if (/kind\s*=\s*\$\d+/i.test(sql)) {
      const kind = values[valueIndex++];
      rows = rows.filter((record) => record.kind === kind);
    }
    if (/team_id\s*=\s*\$\d+/i.test(sql)) {
      const teamId = values[valueIndex++];
      rows = rows.filter((record) => record.team_id === teamId);
    }
    if (/project_id\s*=\s*\$\d+/i.test(sql)) {
      const projectId = values[valueIndex++];
      rows = rows.filter((record) => record.project_id === projectId);
    }
    if (/sena-analysis-custody-quarantine/i.test(sql)) {
      rows = rows.filter((record) => {
        const delivery = record.delivery as Record<string, unknown> | undefined;
        const rawReady = delivery && Object.hasOwn(delivery, "sourceReady")
          ? delivery.sourceReady === true
          : delivery?.webhookStatus === "delivered" || delivery?.webhookStatus === "local-sink" ||
            (delivery?.webhookStatus === "failed" && delivery?.failureStage === "queue-dispatch");
        return record.kind === "analysis" && rawReady && !this.serverJobSourceReady(record);
      });
    } else if (/delivery->'?sourceReady'?/i.test(sql) || /delivery \? 'sourceReady'/i.test(sql)) {
      rows = rows.filter((record) => this.serverJobSourceReady(record));
    }
    return rows.sort((left, right) => String(right.updated_at).localeCompare(String(left.updated_at)));
  }

  async query(sql: string, values: unknown[] = []) {
    const normalizedSql = sql.replace(/\s+/g, " ").trim();
    this.queries.push(normalizedSql);
    if (/CREATE TABLE IF NOT EXISTS/i.test(normalizedSql)) {
      return { rows: [], rowCount: 0 };
    }
    if (/CREATE INDEX IF NOT EXISTS/i.test(normalizedSql) || /CREATE UNIQUE INDEX IF NOT EXISTS/i.test(normalizedSql)) {
      return { rows: [], rowCount: 0 };
    }
    if (/ALTER TABLE .* ALTER COLUMN .* DROP NOT NULL/i.test(normalizedSql)) {
      return { rows: [], rowCount: 0 };
    }
    if (/SELECT revision, payload FROM "public"\."sena_enterprise_state"/i.test(normalizedSql)) {
      return {
        rows: this.state ? [{ revision: this.state.revision, payload: this.state.payload }] : [],
        rowCount: this.state ? 1 : 0
      };
    }
    if (/INSERT INTO "public"\."sena_enterprise_state".*ON CONFLICT \(id\) DO NOTHING/i.test(normalizedSql)) {
      if (!this.state) {
        this.state = {
          revision: 0,
          payload: values[2] as SenaEnterpriseDb
        };
      }
      return { rows: [], rowCount: 1 };
    }
    if (/UPDATE "public"\."sena_enterprise_state" SET payload/i.test(normalizedSql)) {
      const expectedRevision = Number(values[2]);
      if (!this.state || this.state.revision !== expectedRevision) {
        return { rows: [], rowCount: 0 };
      }
      this.state = {
        revision: this.state.revision + 1,
        payload: values[0] as SenaEnterpriseDb
      };
      return { rows: [{ revision: this.state.revision }], rowCount: 1 };
    }
    if (/INSERT INTO "public"\."sena_enterprise_state".*ON CONFLICT \(id\) DO UPDATE/i.test(normalizedSql)) {
      this.state = {
        revision: (this.state?.revision ?? -1) + 1,
        payload: values[2] as SenaEnterpriseDb
      };
      return { rows: [{ revision: this.state.revision }], rowCount: 1 };
    }
    if (/INSERT INTO "public"\."sena_enterprise_uploads"/i.test(normalizedSql)) {
      this.uploads.unshift({
        id: values[0],
        teamId: values[1],
        userId: values[2],
        originalName: values[3],
        storedName: values[4],
        contentType: values[5],
        size: values[6],
        sha256: values[7],
        importProfile: values[8],
        warningCount: values[9],
        scanStatus: values[10],
        scanEngine: values[11],
        scanFindings: values[12],
        storagePath: values[13],
        objectStorageCustody: values[14],
        createdAt: values[15]
      });
      return { rows: [], rowCount: 1 };
    }
    if (/SELECT \*/i.test(normalizedSql) && /FROM "public"\."sena_enterprise_uploads"/i.test(normalizedSql)) {
      let rows = [...this.uploads];
      if (/team_id = \$1/i.test(normalizedSql)) {
        rows = rows.filter((record) => record.teamId === values[0]);
      } else if (/team_id = ANY\(\$1::text\[\]\)/i.test(normalizedSql)) {
        const teamIds = new Set(Array.isArray(values[0]) ? values[0] : []);
        rows = rows.filter((record) => teamIds.has(record.teamId));
      }
      return {
        rows: rows.map((record) => ({
          id: record.id,
          team_id: record.teamId,
          user_id: record.userId,
          original_name: record.originalName,
          stored_name: record.storedName,
          content_type: record.contentType,
          size_bytes: record.size,
          sha256: record.sha256,
          import_profile: record.importProfile ?? null,
          warning_count: record.warningCount ?? 0,
          scan_status: record.scanStatus ?? "passed",
          scan_engine: record.scanEngine ?? "sena-local-upload-scan/v1",
          scan_findings: record.scanFindings ?? [],
          storage_path: record.storagePath,
          object_storage_custody: record.objectStorageCustody ?? null,
          created_at: record.createdAt ?? new Date().toISOString(),
          updated_at: record.createdAt ?? new Date().toISOString()
        })),
        rowCount: rows.length
      };
    }
    if (/INSERT INTO "public"\."sena_enterprise_import_runs"/i.test(normalizedSql)) {
      this.importRuns.unshift({
        id: values[0],
        teamId: values[1],
        status: values[3],
        payload: values[11]
      });
      return { rows: [], rowCount: 1 };
    }
    if (/INSERT INTO "public"\."sena_enterprise_analysis_runs"/i.test(normalizedSql)) {
      this.analysisRuns.unshift({
        id: values[0],
        teamId: values[2],
        projectId: values[4],
        persistedProjectId: values[5],
        sourceKind: values[6],
        payload: values[14]
      });
      return { rows: [], rowCount: 1 };
    }
    if (/INSERT INTO "public"\."sena_enterprise_reliability_runs"/i.test(normalizedSql)) {
      this.reliabilityRuns.unshift({
        id: values[0],
        teamId: values[1],
        projectId: values[2],
        status: values[4],
        payload: values[19]
      });
      return { rows: [], rowCount: 1 };
    }
    if (/INSERT INTO "public"\."sena_enterprise_adjudications"/i.test(normalizedSql)) {
      this.adjudications.unshift({
        id: values[0],
        projectId: values[1],
        teamId: values[2],
        reliabilityRunId: values[3],
        decision: values[6],
        payload: values[9]
      });
      return { rows: [], rowCount: 1 };
    }
    if (/INSERT INTO "public"\."sena_enterprise_validation_runs"/i.test(normalizedSql)) {
      this.validationRuns.unshift({
        id: values[0],
        teamId: values[1],
        projectId: values[2],
        status: values[4],
        payload: values[23]
      });
      return { rows: [], rowCount: 1 };
    }
    if (/INSERT INTO "public"\."sena_enterprise_expert_reviews"/i.test(normalizedSql)) {
      this.expertReviews.unshift({
        id: values[0],
        teamId: values[1],
        projectId: values[2],
        status: values[4],
        claimScope: values[11],
        payload: values[15]
      });
      return { rows: [], rowCount: 1 };
    }
    if (/INSERT INTO "public"\."sena_enterprise_project_comments"/i.test(normalizedSql)) {
      const row = {
        id: values[0],
        projectId: values[1],
        teamId: values[2],
        userId: values[3],
        project_id: values[1],
        team_id: values[2],
        user_id: values[3],
        target_kind: values[4],
        target_id: values[5],
        target_label: values[6],
        status: values[7],
        payload: values[8],
        created_at: values[9],
        updated_at: values[10]
      };
      this.projectComments = [
        row,
        ...this.projectComments.filter((record) => record.id !== row.id)
      ];
      return { rows: [], rowCount: 1 };
    }
    if (/INSERT INTO "public"\."sena_enterprise_project_presence"/i.test(normalizedSql)) {
      this.projectPresence = this.projectPresence.filter((record) => (
        record.projectId !== values[1] || record.userId !== values[3]
      ));
      const row = {
        id: values[0],
        projectId: values[1],
        teamId: values[2],
        userId: values[3],
        project_id: values[1],
        team_id: values[2],
        user_id: values[3],
        activeView: values[4],
        active_view: values[4],
        cursor_label: values[5],
        payload: values[6],
        updated_at: values[7],
        expires_at: values[8]
      };
      this.projectPresence.unshift(row);
      return { rows: [], rowCount: 1 };
    }
    if (/UPDATE "public"\."sena_enterprise_server_jobs"/i.test(normalizedSql) &&
      /SET delivery = \$2::jsonb/i.test(normalizedSql)) {
      const current = this.serverJobs.find((record) => record.id === values[0]);
      if (!current) return { rows: [], rowCount: 0 };
      const failQueuedJob = current.status === "queued" && values[2] === true;
      const finalized: Record<string, unknown> = {
        ...current,
        delivery: values[1],
        status: failQueuedJob ? "failed" : current.status,
        lifecycle: failQueuedJob ? values[3] : current.lifecycle,
        updated_at: values[4]
      };
      this.serverJobs = [
        finalized,
        ...this.serverJobs.filter((record) => record.id !== finalized.id)
      ];
      return { rows: [finalized], rowCount: 1 };
    }
    if (/UPDATE "public"\."sena_enterprise_server_jobs"/i.test(normalizedSql) &&
      /WHERE id = \$1 AND status = 'queued'/i.test(normalizedSql)) {
      const current = this.serverJobs.find((record) => record.id === values[0]);
      if (!current || current.status !== "queued" ||
        !this.serverJobSourceReady(current)) {
        return { rows: [], rowCount: 0 };
      }
      const claimed: Record<string, unknown> = {
        ...current,
        status: "running",
        lifecycle: values[1],
        updated_at: values[2]
      };
      this.serverJobs = [
        claimed,
        ...this.serverJobs.filter((record) => record.id !== claimed.id)
      ];
      return { rows: [claimed], rowCount: 1 };
    }
    if (/UPDATE "public"\."sena_enterprise_server_jobs"/i.test(normalizedSql) &&
      /SET status = \$2/i.test(normalizedSql) &&
      /WHERE id = \$1 AND status = \$5/i.test(normalizedSql)) {
      const current = this.serverJobs.find((record) => record.id === values[0]);
      const expectedStatus = values[4];
      const workerPredicate = /lifecycle->>'workerRunId' = \$(\d+)/i.exec(normalizedSql);
      const expectedWorkerRunId = workerPredicate ? values[Number(workerPredicate[1]) - 1] : undefined;
      const requiresReady = /delivery->'?sourceReady'?/i.test(normalizedSql) || /delivery \? 'sourceReady'/i.test(normalizedSql);
      const lifecycle = current?.lifecycle as { workerRunId?: unknown } | undefined;
      if (!current || current.status !== expectedStatus ||
        (workerPredicate && lifecycle?.workerRunId !== expectedWorkerRunId) ||
        (requiresReady && !this.serverJobSourceReady(current))) {
        return { rows: [], rowCount: 0 };
      }
      const transitioned: Record<string, unknown> = {
        ...current,
        status: values[1],
        lifecycle: values[2],
        updated_at: values[3]
      };
      this.serverJobs = [
        transitioned,
        ...this.serverJobs.filter((record) => record.id !== transitioned.id)
      ];
      return { rows: [transitioned], rowCount: 1 };
    }
    if (/INSERT INTO "public"\."sena_enterprise_server_jobs"/i.test(normalizedSql)) {
      const row = {
        id: values[0],
        schema_version: values[1],
        kind: values[2],
        status: values[3],
        team_id: values[4],
        project_id: values[5],
        actor_user_id: values[6],
        payload_sha256: values[7],
        payload_summary: values[8],
        provider: values[9],
        delivery: values[10],
        worker: values[11],
        lifecycle: values[12],
        redaction: values[13],
        queued_at: values[14],
        updated_at: values[15]
      };
      this.serverJobs = [
        row,
        ...this.serverJobs.filter((record) => record.id !== row.id)
      ];
      return { rows: [], rowCount: 1 };
    }
    if (/INSERT INTO "public"\."sena_enterprise_audit_log"/i.test(normalizedSql)) {
      this.auditRows.unshift({
        id: values[0],
        event: values[1],
        userId: values[2],
        teamId: values[3],
        projectId: values[4],
        detail: values[5],
        webhookDelivery: values[6],
        createdAt: values[7]
      });
      return { rows: [], rowCount: 1 };
    }
    if (/INSERT INTO .*"public"\."sena_enterprise_observed_requests"/i.test(normalizedSql)) {
      this.observedRequests.unshift({
        request_id_hash: values[0],
        observed_at: values[1],
        route_id: values[2],
        method: values[3],
        status_code: values[4],
        status_class: values[5],
        duration_ms: values[6],
        slow: values[7],
        error: values[8],
        error_code_hash: values[9],
        payload: values[10]
      });
      return { rows: [], rowCount: 1 };
    }
    if (/SELECT count\(\*\) AS total FROM "public"\."sena_enterprise_audit_log"/i.test(normalizedSql)) {
      return { rows: [{ total: this.auditRows.length }], rowCount: 1 };
    }
    if (/SELECT \* FROM "public"\."sena_enterprise_audit_log"/i.test(normalizedSql)) {
      return {
        rows: this.auditRows.map((record) => ({
          id: record.id,
          event: record.event,
          user_id: record.userId,
          team_id: record.teamId,
          project_id: record.projectId,
          detail: record.detail,
          webhook_delivery: record.webhookDelivery,
          created_at: record.createdAt
        })),
        rowCount: this.auditRows.length
      };
    }
    if (/SELECT count\(\*\) AS total.*FROM "public"\."sena_enterprise_server_jobs"/i.test(normalizedSql)) {
      const rows = this.serverJobRowsForSql(normalizedSql, values);
      return {
        rows: [{
          total: rows.length,
          queued: rows.filter((job) => job.status === "queued").length,
          running: rows.filter((job) => job.status === "running").length,
          succeeded: rows.filter((job) => job.status === "succeeded").length,
          failed: rows.filter((job) => job.status === "failed").length,
          dead_lettered: rows.filter((job) => job.status === "dead-lettered").length,
          retryable: rows.filter((job) => (job.lifecycle as { retryable?: boolean } | undefined)?.retryable).length
        }],
        rowCount: 1
      };
    }
    if (/SELECT \* FROM "public"\."sena_enterprise_server_jobs"/i.test(normalizedSql)) {
      const rows = this.serverJobRowsForSql(normalizedSql, values);
      const rawLimit = values.at(-1);
      const limit = typeof rawLimit === "number" ? rawLimit : rows.length;
      return { rows: rows.slice(0, limit), rowCount: Math.min(rows.length, limit) };
    }
    if (/SELECT \* FROM "public"\."sena_enterprise_observed_requests"/i.test(normalizedSql)) {
      return {
        rows: this.observedRequests,
        rowCount: this.observedRequests.length
      };
    }
    if (/SELECT \* FROM "public"\."sena_enterprise_(reliability_runs|validation_runs|expert_reviews|adjudications)"/i.test(normalizedSql)) {
      return { rows: [], rowCount: 0 };
    }
    if (/SELECT \* FROM "public"\."sena_enterprise_project_comments"/i.test(normalizedSql)) {
      const teamMatch = normalizedSql.match(/team_id = \$(\d+)/i);
      const projectMatch = normalizedSql.match(/project_id = \$(\d+)/i);
      const statusMatch = normalizedSql.match(/status = \$(\d+)/i);
      const rows = this.projectComments.filter((record) => (
        (!teamMatch || record.teamId === values[Number(teamMatch[1]) - 1]) &&
        (!projectMatch || record.projectId === values[Number(projectMatch[1]) - 1]) &&
        (!statusMatch || record.status === values[Number(statusMatch[1]) - 1])
      ));
      return {
        rows,
        rowCount: rows.length
      };
    }
    if (/SELECT \* FROM "public"\."sena_enterprise_project_presence"/i.test(normalizedSql)) {
      const teamMatch = normalizedSql.match(/team_id = \$(\d+)/i);
      const projectMatch = normalizedSql.match(/project_id = \$(\d+)/i);
      const activeMatch = normalizedSql.match(/expires_at > \$(\d+)/i);
      const rows = this.projectPresence.filter((record) => (
        (!teamMatch || record.teamId === values[Number(teamMatch[1]) - 1]) &&
        (!projectMatch || record.projectId === values[Number(projectMatch[1]) - 1]) &&
        (!activeMatch || String(record.expires_at) > String(values[Number(activeMatch[1]) - 1]))
      ));
      return {
        rows,
        rowCount: rows.length
      };
    }
    throw new Error(`Unexpected Postgres query in route primary-state test: ${normalizedSql}`);
  }
}
