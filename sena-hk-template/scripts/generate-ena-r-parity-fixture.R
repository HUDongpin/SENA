#!/usr/bin/env Rscript

if (!requireNamespace("rENA", quietly = TRUE)) {
  stop("The R package `rENA` is required to regenerate ENA parity fixtures.")
}

text <- "participant,conversation,turn,stage,group,PoP,GO,SC,MV,MR,RoP,PR
T1,lesson-1,1,Study,Planning,1,0,1,0,0,0,0
T2,lesson-1,2,Study,Planning,0,1,1,0,0,0,0
T3,lesson-1,3,Study,Planning,1,1,0,0,1,0,0
T1,lesson-1,4,Plan,Planning,0,1,0,1,1,0,0
T2,lesson-1,5,Plan,Planning,0,0,1,1,0,1,0
T3,lesson-1,6,Plan,Planning,1,0,0,1,0,1,0
T1,lesson-2,1,Teach,Reflecting,0,1,1,1,0,0,1
T2,lesson-2,2,Teach,Reflecting,0,0,1,1,1,0,1
T4,lesson-2,3,Teach,Reflecting,1,0,0,1,1,1,0
T1,lesson-2,4,Reflect,Reflecting,0,0,1,1,1,1,1
T2,lesson-2,5,Reflect,Reflecting,0,1,0,1,1,1,1
T4,lesson-2,6,Reflect,Reflecting,1,0,1,0,1,1,1
T5,lesson-3,1,Study,Comparison,1,1,0,0,0,0,1
T6,lesson-3,2,Study,Comparison,0,1,0,1,0,0,1
T5,lesson-3,3,Plan,Comparison,1,0,1,0,1,0,0
T6,lesson-3,4,Plan,Comparison,0,0,1,1,1,0,0
T5,lesson-3,5,Reflect,Comparison,0,1,1,0,1,1,0
T6,lesson-3,6,Reflect,Comparison,1,0,0,1,1,1,0"

df <- read.csv(text = text, stringsAsFactors = FALSE)
code_cols <- c("PoP", "GO", "SC", "MV", "MR", "RoP", "PR")

set <- rENA::ena(
  data = df,
  units = c("participant"),
  conversation = c("conversation"),
  codes = code_cols,
  metadata = c("turn", "stage", "group"),
  model = "EndPoint",
  weight.by = "binary",
  window = "MovingStanzaWindow",
  window.size.back = 1,
  include.plots = FALSE,
  print.plots = FALSE
)

eigenvalues <- as.numeric(set$rotation$eigenvalues[1:2])
variance <- eigenvalues / sum(eigenvalues)

out <- list(
  variance = list(SVD1 = variance[[1]], SVD2 = variance[[2]]),
  points = as.data.frame(set$points)[, c("participant", "SVD1", "SVD2")],
  nodes = as.data.frame(set$rotation$nodes)[, c("code", "SVD1", "SVD2")],
  lineWeights = as.data.frame(set$line.weights)[, !(names(as.data.frame(set$line.weights)) %in% c("ENA_UNIT"))],
  connectionCounts = as.data.frame(set$connection.counts)[, !(names(as.data.frame(set$connection.counts)) %in% c("ENA_UNIT"))]
)

out_path <- "lib/ena/__fixtures__/r-ena-sample-parity.json"
writeLines(jsonlite::toJSON(out, auto_unbox = TRUE, pretty = TRUE, digits = 16), out_path)
cat(sprintf("Wrote %s\n", out_path))
