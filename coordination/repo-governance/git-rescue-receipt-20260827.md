# SENA Git and disk rescue receipt — 2026-08-27

Scope: local preservation only

Remote rescue refs pushed: **no**

Branches/worktrees deleted: **none**

Credential documents copied or opened: **none**

## Git object rescue

Pre-rescue `git fsck` evidence:

- `git fsck --full --unreachable`: 41 unreachable commits;
- `git fsck --full --unreachable --no-reflogs`: 45 unreachable commits;
- exact graph calculation found 26 maximal tips covering all 45 commits.

Before creating refs, each maximal tip was checked using commit metadata,
parents, diff stat, patch-equivalence counts, and changed path names. No file
content was printed. The candidate rescue histories contained neither forbidden
`All API Keys.docx` path and did not reach known sensitive blob
`15a131415d0206782265902b0af612a80e16bae2`.

Created local-only namespace:

```text
refs/rescue/sena-20260827/*
```

Key refs:

- `refs/rescue/sena-20260827/unreachable-6654112` ->
  `6654112296aeb78daa8e747b8c118f67b1dd9adb`
- `refs/rescue/sena-20260827/reflog-only-0190acc` ->
  `0190acc272f12b037cf7b85443e6e8114668589a`
- 24 additional refs protect the remaining maximal tips.

The sorted ref-list SHA-256 is:

```text
2b4834c8bf701ed416a408ac2cfae5be44c7037cdcee309eec24b5d4ead9ad88
```

Post-rescue verification:

- unreachable commits with reflogs: `0`;
- unreachable commits without reflogs: `0`;
- local rescue ref count: `26`.

These refs preserve evidence for semantic review. They do not authorize merge,
cherry-pick, push, archive, or deletion.

## Git bundle

Owner-only repository-external path:

```text
/Volumes/Starship/SENA-RESCUE-QUARANTINE-20260827/git-bundle/sena-rescue-refs-20260827.bundle
```

Evidence:

- mode: `0600`;
- size: `191011680` bytes;
- SHA-256:
  `26753db5921b1bfbe6f9e58220737e6a68e769fd97132c2684f3a1e35088159e`;
- `git bundle verify`: pass;
- ref count: `26`;
- history: complete.

The contaminated docs branch is not a rescue ref and its known sensitive blob
is not reachable from the bundle refs.

## Broken-worktree inventory

Four unregistered directories remain preserved in place. Their `.git` files
point to the pre-migration Desktop repository and are invalid. No directory was
removed or modified.

Final owner-only manifest:

```text
/Volumes/Starship/SENA-RESCUE-QUARANTINE-20260827/manifests/orphan-worktree-inventory-20260827-v2.json
```

Evidence:

- mode: `0600`;
- size: `1734346` bytes;
- SHA-256:
  `e7f9ce7fbb267d8fb74ba3539f26e741294dc4019acb5b307e90e6dd923326c0`;
- non-generated files inventoried: `3860`;
- exact blobs represented in `origin/main`: `3849`;
- disk-only files: `11` total;
- disk-only reviewable source files: `2`;
- disk-only machine-local files: `6`;
- disk-only regenerable files: `1`;
- sensitive-runtime file metadata/hash records: `6` (classified without copying
  or disclosing contents);
- generated directories summarized without enumerating regenerated contents:
  `25`.

The complete classification established that the only disk-only reviewable
source files are the two already identified under `gifted-meitner-dcc806`.

## Disk-only source copies

Both copies are stored outside the repository with mode `0600`.

| Source role | Quarantine path | Bytes | Git blob | SHA-256 |
|---|---|---:|---|---|
| Navigation component | `/Volumes/Starship/SENA-RESCUE-QUARANTINE-20260827/disk-only-source/components/NavBar.tsx` | 12116 | `9ea67b2c1a98383e8853aefd868a56c7d1a1892e` | `dcd6042ef3e61c4ebd66ee0ecad47db32b29583ebb6692949dc7bbe088bfe718` |
| Style regression test | `/Volumes/Starship/SENA-RESCUE-QUARANTINE-20260827/disk-only-source/lib/sena/__tests__/nav-controls-style.test.ts` | 2367 | `218bb2cf0a6a04be4c577c9ee6f8ada54372e5c2` | `3661cc0b6912b8a60d58b45c5f46b9508413210aeb2017cb95103c4def675af6` |

Source and destination size, SHA-256, Git blob hash, and preserved mtime were
verified equal. Semantic comparison is now complete. The old `xl` navigation
implementation is superseded by current main's more granular `lg` compaction
and must not be restored. Its still-useful invariant—that desktop actions and
the mobile menu switch at the same breakpoint—was selectively re-expressed for
the current strategy. Both external copies remain preserved evidence.

## Remaining gates

- owner review/acceptance of the completed 26-ref and disk-only-source semantic
  triage; no recent patch-unique commit remains unclassified;
- owner action for credential inventory and provider revocation/rotation;
- owner authorization before any remote ref deletion, history rewrite, orphan
  directory movement/removal, or root checkout restoration;
- recoverable archive/Trash only after manifest, process/cwd/open-handle,
  restored-copy, and owner checks all pass.
