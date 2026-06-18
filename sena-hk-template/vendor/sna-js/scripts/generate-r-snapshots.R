# Generate small R `sna` parity snapshots.
# Usage:
#   R CMD INSTALL reference/r-sna-2.8
#   Rscript scripts/generate-r-snapshots.R

if (!requireNamespace("sna", quietly = TRUE)) {
  stop("The R package `sna` is not installed. Run: R CMD INSTALL reference/r-sna-2.8")
}

json_num <- function(x) {
  if (is.nan(x)) return("null")
  if (is.infinite(x)) return(ifelse(x > 0, "\"Inf\"", "\"-Inf\""))
  format(x, scientific = FALSE, digits = 16)
}
json_vec <- function(x) paste0("[", paste(vapply(x, json_num, character(1)), collapse = ","), "]")
json_mat <- function(m) paste0("[", paste(apply(m, 1, json_vec), collapse = ","), "]")
closeness_from_geodist <- function(distances) {
  out <- numeric(nrow(distances))
  for (i in seq_len(nrow(distances))) {
    row <- distances[i, ]
    finite <- row[is.finite(row) & row > 0]
    out[[i]] <- ifelse(length(finite) > 0, length(finite) / sum(finite), 0)
  }
  out
}
reachable_from_geodist <- function(distances) {
  out <- integer(nrow(distances))
  for (i in seq_len(nrow(distances))) {
    row <- distances[i, ]
    out[[i]] <- length(row[is.finite(row) & row > 0])
  }
  out
}
average_path_length_from_geodist <- function(distances) {
  finite <- distances[row(distances) != col(distances) & is.finite(distances) & distances > 0]
  ifelse(length(finite) > 0, mean(finite), 0)
}
normalize_labels <- function(labels) {
  remap <- new.env(parent = emptyenv())
  next_id <- 0
  out <- integer(length(labels))
  for (i in seq_along(labels)) {
    key <- as.character(labels[[i]])
    if (!exists(key, envir = remap, inherits = FALSE)) {
      assign(key, next_id, envir = remap)
      next_id <- next_id + 1
    }
    out[[i]] <- get(key, envir = remap, inherits = FALSE)
  }
  out
}
label_propagation_fixture <- function(matrix) {
  if (!requireNamespace("igraph", quietly = TRUE)) {
    return(rep(0, nrow(matrix)))
  }
  graph <- igraph::graph_from_adjacency_matrix(matrix, mode = "undirected", weighted = TRUE, diag = FALSE)
  communities <- igraph::cluster_label_prop(graph, weights = igraph::E(graph)$weight, initial = seq_len(nrow(matrix)))
  normalize_labels(igraph::membership(communities))
}

path3 <- matrix(c(
  0, 1, 0,
  0, 0, 1,
  0, 0, 0
), byrow = TRUE, nrow = 3)

triangle3 <- matrix(c(
  0, 1, 1,
  1, 0, 1,
  1, 1, 0
), byrow = TRUE, nrow = 3)

geo <- sna::geodist(path3)
triangle_geo <- sna::geodist(triangle3, gmode = "graph")

out <- paste0(
  "{\n",
  "  \"directedPath3\": {\n",
    "    \"gden\": ", json_num(sna::gden(path3, mode = "digraph")), ",\n",
    "    \"degreeOut\": ", json_vec(sna::degree(path3, cmode = "outdegree")), ",\n",
    "    \"degreeIn\": ", json_vec(sna::degree(path3, cmode = "indegree")), ",\n",
    "    \"degreeTotal\": ", json_vec(sna::degree(path3, cmode = "freeman")), ",\n",
    "    \"geodist\": ", json_mat(geo$gdist), ",\n",
    "    \"geodistCounts\": ", json_mat(geo$counts), ",\n",
    "    \"betweenness\": ", json_vec(sna::betweenness(path3, gmode = "digraph", cmode = "directed", rescale = FALSE)), ",\n",
    "    \"closeness\": ", json_vec(closeness_from_geodist(geo$gdist)), ",\n",
    "    \"reachable\": ", json_vec(reachable_from_geodist(geo$gdist)), ",\n",
    "    \"averagePathLength\": ", json_num(average_path_length_from_geodist(geo$gdist)), ",\n",
    "    \"grecipEdgewise\": ", json_num(sna::grecip(path3, measure = "edgewise")), ",\n",
    "    \"grecipDyadic\": ", json_num(sna::grecip(path3, measure = "dyadic")), ",\n",
    "    \"grecipDyadicNonnull\": ", json_num(sna::grecip(path3, measure = "dyadic.nonnull")), ",\n",
    "    \"grecipCorrelation\": ", json_num(sna::grecip(path3, measure = "correlation")), "\n",
  "  },\n",
  "  \"triangle3\": {\n",
  "    \"nties\": ", json_num(sna::nties(triangle3, mode = "graph")), ",\n",
  "    \"gden\": ", json_num(sna::gden(triangle3, mode = "graph")), ",\n",
  "    \"degree\": ", json_vec(sna::degree(triangle3, gmode = "graph", cmode = "freeman")), ",\n",
  "    \"betweenness\": ", json_vec(sna::betweenness(triangle3, gmode = "graph", cmode = "undirected", rescale = FALSE)), ",\n",
  "    \"closeness\": ", json_vec(closeness_from_geodist(triangle_geo$gdist)), ",\n",
  "    \"reachable\": ", json_vec(reachable_from_geodist(triangle_geo$gdist)), ",\n",
  "    \"averagePathLength\": ", json_num(average_path_length_from_geodist(triangle_geo$gdist)), ",\n",
  "    \"communityLabels\": ", json_vec(label_propagation_fixture(triangle3)), ",\n",
  "    \"grecipEdgewise\": ", json_num(sna::grecip(triangle3, measure = "edgewise")), ",\n",
  "    \"grecipDyadic\": ", json_num(sna::grecip(triangle3, measure = "dyadic")), ",\n",
  "    \"grecipDyadicNonnull\": ", json_num(sna::grecip(triangle3, measure = "dyadic.nonnull")), ",\n",
  "    \"grecipCorrelation\": ", json_num(sna::grecip(triangle3, measure = "correlation")), "\n",
  "  }\n",
  "}\n"
)

if (!dir.exists("test/fixtures")) dir.create("test/fixtures", recursive = TRUE)
writeLines(out, "test/fixtures/r-snapshots.json")
cat("Wrote test/fixtures/r-snapshots.json\n")
