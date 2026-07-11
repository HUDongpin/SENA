import {
  listEnterpriseProjectCollaborationWithPostgresEvidenceAsync
} from "@/lib/sena/enterprise/team-collaboration";
import { observeSenaApiRoute, requireApiSession } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const streamSchemaVersion = "sena-project-collaboration-stream/v1";

type ProjectRouteContext = { params: Promise<{ projectId: string }> };

export async function GET(request: Request, { params }: ProjectRouteContext) {
  return observeSenaApiRoute(request, { routeId: "sena-project-collaboration-stream" }, async () => {
    const { projectId } = await params;
    const context = await requireApiSession();
    const initialCollaboration = await listEnterpriseProjectCollaborationWithPostgresEvidenceAsync(context, projectId);
    const encoder = new TextEncoder();
    let sequence = 0;
    let currentCollaboration: Awaited<ReturnType<typeof listEnterpriseProjectCollaborationWithPostgresEvidenceAsync>> | null = initialCollaboration;
    let closed = false;
    let pushing = false;
    let interval: ReturnType<typeof setInterval> | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const writeEvent = (event: string, data: unknown) => {
          if (closed) return;
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        const pushState = async () => {
          if (pushing) return;
          pushing = true;
          try {
            sequence += 1;
            const collaboration = currentCollaboration ?? await listEnterpriseProjectCollaborationWithPostgresEvidenceAsync(context, projectId);
            currentCollaboration = null;
            writeEvent("collaboration", {
              schemaVersion: streamSchemaVersion,
              sequence,
              generatedAt: new Date().toISOString(),
              collaboration
            });
          } catch (error) {
            writeEvent("error", {
              schemaVersion: streamSchemaVersion,
              sequence,
              generatedAt: new Date().toISOString(),
              error: error instanceof Error ? error.message : "Collaboration stream failed."
            });
            close();
          } finally {
            pushing = false;
          }
        };

        const close = () => {
          if (closed) return;
          closed = true;
          if (interval) clearInterval(interval);
          if (heartbeat) clearInterval(heartbeat);
          try {
            controller.close();
          } catch {
            // The browser may already have closed the event stream.
          }
        };

        void pushState();
        interval = setInterval(() => {
          void pushState();
        }, 5000);
        heartbeat = setInterval(() => {
          writeEvent("heartbeat", {
            schemaVersion: streamSchemaVersion,
            sequence,
            generatedAt: new Date().toISOString()
          });
        }, 15000);
        request.signal.addEventListener("abort", close, { once: true });
      },
      cancel() {
        closed = true;
        if (interval) clearInterval(interval);
        if (heartbeat) clearInterval(heartbeat);
      }
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
        "x-sena-collaboration-stream-observation": "setup-only",
        "x-sena-collaboration-stream-auth": "session-rbac-project-read",
        "x-sena-collaboration-comment-source": initialCollaboration.evidenceSource.comments,
        "x-sena-collaboration-presence-source": initialCollaboration.evidenceSource.presence,
        "x-sena-collaboration-reliability-source": initialCollaboration.evidenceSource.reliabilityRuns,
        "x-sena-collaboration-validation-source": initialCollaboration.evidenceSource.validationRuns,
        "x-sena-collaboration-expert-review-source": initialCollaboration.evidenceSource.expertReviews,
        "x-sena-collaboration-adjudication-source": initialCollaboration.evidenceSource.adjudications
      }
    });
  });
}
