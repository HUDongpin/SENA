# ADR 0012 — Explicit deterministic numerical runtime

Date: 2026-09-06

Status: owner-selected direction; implementation and release acceptance pending.

## Context

Genuine snapshots built from identical synthetic inputs differ across JavaScript engines because native transcendental functions need not return identical last bits. Exact canonical reconstruction correctly refuses differing persisted analysis. Weakening that comparison would change the evidence-integrity contract.

## Decision

Introduce the explicit build-option profile `sena-deterministic-v1`. The SENA workspace will select it for new calculations after its implementation is verified. An absent profile remains the existing legacy-native path, preserving old callers and snapshots without silent migration. Unknown profile identifiers fail closed. Profile selection must propagate through all model, temporal, report, method, figure and snapshot consumers. Imports retain the declared profile; they do not switch it to the new default.

Use fixed, attributed mathematical implementations for required nonlinear primitives. Do not monkeypatch global Math, edit installed dependencies, or replace the entire ENA runtime. Construct deterministic SVD/mean rotations through SENA's algebraic eigensolver and jENA's public `rotationSet` API; retain pinned jENA accumulation, projection, full-axis variance, node solving and centroid semantics. Compute Fisher interval fields using fixed primitives before serialization.

For the new SVD profile, normalize Gram matrices by maximum magnitude and use the existing algebraic eigensolver with zero value-clipping tolerance. Its relative convergence floor and canonical SVD signs form part of the new numerical profile. Preserve all axes, including small positive eigenvalues; retain group order/sign for mean rotation. Borrowed rotations must have compatible profile and exact adjacency provenance. New profile output is not represented as byte-identical to legacy output.

Mean rotation uses a cancellation-safe Householder orthogonal complement. Independent review reproduced rank loss in the pinned helper's single-pass Gram-Schmidt completion near a coordinate-axis mean; the local correction preserves the ordered mean axis and residual-space definition while retaining a complete orthonormal basis. Native dependency files remain untouched.

Profile propagation includes exact request and inference carrier admission, source build-option projection, and the analysis-configuration hash payload. A present profile must affect configuration identity; absence retains the historical hash payload. Runtime consistency, method/development artifacts and review-packet checks must identify the selected public pipeline and SENA override accurately. Their generic hash, statistical formulas and canonical comparators are not changed by this decision.

The global canonical comparator and all persisted-analysis comparisons remain exact. Changing a profile, altering one representable numeric value, or providing an unknown profile cannot grant acceptance. Numerical oracle/parity tolerances evaluate implementation accuracy; they are not snapshot admission tolerances.

## Compatibility and limits

Legacy snapshots continue using legacy reconstruction. This does not promise to accept legacy foreign-engine snapshots already rejected by that reconstruction. No source-only recomputation, automatic rounding, overwrite-before-validation or schema migration is introduced under the name of restore.

The source package remains pinned. Any SENA-owned rotation or primitive override must be explicit in provenance. No mathematical formula, statistical definition, directionality or research-readiness boundary changes. The publication target remains research-pilot/reviewer handoff, not production deployment.

## Acceptance

Require fixed primitive oracle vectors and cross-engine bit equality, full-axis SVD/mean/shared-space invariants, sign-aware rENA parity, degenerate/repeated-eigenvalue/scaled cases, unknown/changed-profile rejection, legacy fixtures, one-step tamper rejection, and full cross-engine snapshot roundtrips. Then run the complete candidate verification ladder, strict performance last, followed by hook-enforced commit/push and exact-head Draft PR checks. This ADR alone proves none of those gates and adds no Ready, merge, deployment, upstream publication or cleanup authority.
