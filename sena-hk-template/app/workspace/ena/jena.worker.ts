// The packaged jENA worker host implements worker protocol v1 (versioned
// run/cancel messages, chunked accumulation progress, cooperative
// cancellation) that createENAWorkerClient from "jena-js/browser" speaks.
// It registers its message handler when evaluated inside a Worker scope.
//
// jena-js declares sideEffects:false, so a bare side-effect import here
// would be tree-shaken into an EMPTY worker chunk (the registration is a
// side effect). Reading an export anchors the module in the bundle; its
// evaluation then registers the protocol-v1 host exactly once.
import { ENA_WORKER_PROTOCOL_VERSION } from "jena-js/browser/worker";

if (!Number.isInteger(ENA_WORKER_PROTOCOL_VERSION)) {
  throw new Error("jena-js worker host failed to initialize.");
}

export {};
