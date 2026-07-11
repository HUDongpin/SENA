// The packaged jENA worker host implements worker protocol v1 (versioned
// run/cancel messages, chunked accumulation progress, cooperative
// cancellation) that createENAWorkerClient from "jena-js/browser" speaks.
// It self-registers its message handler when evaluated inside a Worker
// scope. jena-js >= 0.6.2 declares this module in package.json sideEffects,
// so the bare import survives bundler tree-shaking (0.6.1 shipped
// sideEffects: false and this import produced an empty worker chunk).
import "jena-js/browser/worker";

export {};
