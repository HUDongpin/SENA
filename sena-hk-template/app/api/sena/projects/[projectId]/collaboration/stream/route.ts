import { listEnterpriseProjectCollaboration } from "@/lib/sena/enterprise";
import { jsonError, requireApiSession } from "@/lib/sena/api-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const streamSchemaVersion = "sena-project-collaboration-stream/v1";

export async function GET(request: Request, { params }: { params: { projectId: string } }) {
  try {
    const context = requireApiSession();
    const initialCollaboration = listEnterpriseProjectCollaboration(context, params.projectId);
    const encoder = new TextEncoder();
    let sequence = 0;
    let currentCollaboration: ReturnType<typeof listEnterpriseProjectCollaboration> | null = initialCollaboration;
    let closed = false;
    let interval: ReturnType<typeof setInterval> | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const writeEvent = (event: string, data: unknown) => {
          if (closed) return;
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        const pushState = () => {
          try {
            sequence += 1;
            const collaboration = currentCollaboration ?? listEnterpriseProjectCollaboration(context, params.projectId);
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

        pushState();
        interval = setInterval(pushState, 5000);
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
        "x-sena-collaboration-stream-auth": "session-rbac-project-read"
      }
    });
  } catch (error) {
    return jsonError(error);
  }
}
