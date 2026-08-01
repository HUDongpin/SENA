#!/usr/bin/env python3
"""Rebuild the TP1/TP2/TP3 ENA input CSVs used by the rENA 0.3.1 goldens.

Mirrors Class 1_ENA/3D-ENA-pipeline/prepare_tp{1,2,3}_data.py exactly so the
jena-js run consumes byte-identical rows to the R run.
"""
import csv
import os
from collections import Counter

import openpyxl

SRC = "/Users/dongpinhu/Desktop/Class 1_ENA/Details of CoI_Coded Results.xlsx"
OUT_DIR = os.path.dirname(os.path.abspath(__file__))
CODES = ["TE", "EX", "IN", "RE", "SP", "TP"]

wb = openpyxl.load_workbook(SRC, read_only=True)
ws = wb["Coded Messages"]
rows = list(ws.iter_rows(values_only=True))
hdr = rows[0]
idx = {h: i for i, h in enumerate(hdr)}

for tp in (1, 2, 3):
    kept = []
    dropped_ai = 0
    dropped_teacher = 0
    for r in rows[1:]:
        if r[idx["TimePoint"]] != tp:
            continue
        if r[idx["ContentSource"]] != "Human":
            dropped_ai += 1
            continue
        # TP3 alone drops teacher turns (project convention: units are students).
        if tp == 3 and r[idx["Role"]] == "Teacher":
            dropped_teacher += 1
            continue
        rec = {
            "MsgID": r[idx["MsgID"]],
            "Group": f"G{r[idx['Group']]}",
            "Condition": r[idx["Condition"]],
            "Speaker": r[idx["Speaker"]],
            "Seq": r[idx["Seq"]],
        }
        for c in CODES:
            v = r[idx[f"{c}_Final"]]
            assert v in (0, 1), (rec["MsgID"], c, v)
            rec[c] = v
        kept.append(rec)

    kept.sort(key=lambda x: (x["Group"], x["Seq"]))
    out = os.path.join(OUT_DIR, f"tp{tp}_ena_input.csv")
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["MsgID", "Group", "Condition", "Speaker", "Seq"] + CODES)
        w.writeheader()
        w.writerows(kept)

    students = sorted(set((r["Condition"], r["Group"], r["Speaker"]) for r in kept))
    print(
        f"tp{tp}: rows={len(kept)} students={len(students)} "
        f"dropped_ai={dropped_ai} dropped_teacher={dropped_teacher} "
        f"groups={dict(sorted(Counter(r['Group'] for r in kept).items()))}"
    )
