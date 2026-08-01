#!/usr/bin/env Rscript
# Pull full-precision variance + goodness-of-fit correlations out of the saved
# rENA 0.3.1 ENA sets so the jena-js diff can be checked past the 3-digit
# rounding used in the manuscript.
options(stringsAsFactors = FALSE, warn = 1)
.libPaths(c("/Users/dongpinhu/Desktop/Class 1_ENA/.codex-work/r-libs/rENA-0.3.1", .libPaths()))
suppressPackageStartupMessages(library(rENA))
stopifnot(identical(as.character(packageVersion("rENA")), "0.3.1"))

OUT <- dirname(sub("--file=", "", grep("--file=", commandArgs(trailingOnly = FALSE), value = TRUE)[1]))
sets <- list(
  tp1 = "/Users/dongpinhu/Desktop/Class 1_ENA/Lesson 1_In-class_3D ENA outputs/tp1_ena_set.RData",
  tp2 = "/Users/dongpinhu/Desktop/Class 1_ENA/Lesson 1_After-class_3D ENA outputs/tp2_ena_set.RData",
  tp3 = "/Users/dongpinhu/Desktop/Class 1_ENA/Lesson 2_3D ENA outputs/tp3_ena_set.RData"
)

records <- list()
for (tp in names(sets)) {
  env <- new.env()
  load(sets[[tp]], envir = env)
  set <- get("set", envir = env)
  variance <- set$model$variance[1:3]
  cors <- rENA::ena.correlations(set)
  records[[tp]] <- list(
    variance = as.numeric(variance),
    pearson = as.numeric(cors$pearson),
    spearman = as.numeric(cors$spearman)
  )
  cat(tp, "variance:", sprintf("%.15f", variance), "\n")
  cat(tp, "pearson:", sprintf("%.15f", cors$pearson), "\n")
  cat(tp, "spearman:", sprintf("%.15f", cors$spearman), "\n")
}

json <- paste0(
  "{\n",
  paste(vapply(names(records), function(tp) {
    r <- records[[tp]]
    sprintf(
      '  "%s": {"variance": [%s], "pearson": [%s], "spearman": [%s]}',
      tp,
      paste(sprintf("%.17g", r$variance), collapse = ", "),
      paste(sprintf("%.17g", r$pearson), collapse = ", "),
      paste(sprintf("%.17g", r$spearman), collapse = ", ")
    )
  }, character(1)), collapse = ",\n"),
  "\n}\n"
)
writeLines(json, file.path(OUT, "r-goldens-diagnostics.json"))
cat("written.\n")
