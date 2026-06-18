import { ena, type ENAOptions } from "jena-js";

type ENAWorkerRequest = {
  id: string;
  options: ENAOptions;
};

type ENAWorkerCancel = {
  id: string;
  cancel: true;
};

type ENAWorkerResponse = {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
  progress?: number;
  stage?: string;
};

const cancelled = new Set<string>();

function isCancel(message: ENAWorkerRequest | ENAWorkerCancel): message is ENAWorkerCancel {
  return "cancel" in message && message.cancel;
}

function send(response: ENAWorkerResponse) {
  self.postMessage(response);
}

self.addEventListener("message", (event: MessageEvent<ENAWorkerRequest | ENAWorkerCancel>) => {
  const message = event.data;

  if (isCancel(message)) {
    cancelled.add(message.id);
    send({ id: message.id, ok: false, error: "Worker request was cancelled.", progress: 1, stage: "cancelled" });
    return;
  }

  try {
    if (cancelled.has(message.id)) throw new Error("Worker request was cancelled.");
    send({ id: message.id, ok: true, progress: 0, stage: "started" });

    const result = ena(message.options);

    if (cancelled.has(message.id)) throw new Error("Worker request was cancelled.");
    send({ id: message.id, ok: true, result, progress: 1, stage: "complete" });
  } catch (error) {
    send({ id: message.id, ok: false, error: error instanceof Error ? error.message : String(error) });
  } finally {
    cancelled.delete(message.id);
  }
});

export {};
