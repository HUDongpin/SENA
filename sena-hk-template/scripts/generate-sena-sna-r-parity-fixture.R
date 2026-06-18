#!/usr/bin/env Rscript

out_path <- "lib/sena/__fixtures__/r-sna-social-parity.json"
args <- commandArgs(trailingOnly = TRUE)
if (length(args) >= 1) out_path <- args[[1]]

if (!requireNamespace("sna", quietly = TRUE)) {
  stop("The R package `sna` is required to regenerate SNA parity fixtures.")
}
if (!requireNamespace("igraph", quietly = TRUE)) {
  stop("The R package `igraph` is required to regenerate SNA community fixtures.")
}
if (!requireNamespace("jsonlite", quietly = TRUE)) {
  stop("The R package `jsonlite` is required to write SNA parity fixtures.")
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

edge_df <- function(edges) {
  data.frame(
    source = vapply(edges, function(edge) edge[[1]], character(1)),
    target = vapply(edges, function(edge) edge[[2]], character(1)),
    weight = vapply(edges, function(edge) ifelse(length(edge) >= 3, as.numeric(edge[[3]]), 1), numeric(1)),
    stringsAsFactors = FALSE
  )
}

make_directed_matrix <- function(people, edges) {
  mat <- matrix(0, nrow = length(people), ncol = length(people), dimnames = list(people, people))
  for (edge in edges) {
    mat[edge[[1]], edge[[2]]] <- mat[edge[[1]], edge[[2]]] + ifelse(length(edge) >= 3, as.numeric(edge[[3]]), 1)
  }
  mat
}

make_undirected_sena_matrix <- function(directed) {
  mat <- matrix(0, nrow = nrow(directed), ncol = ncol(directed), dimnames = dimnames(directed))
  for (i in seq_len(nrow(directed))) {
    for (j in seq_len(ncol(directed))) {
      if (i != j) mat[i, j] <- directed[i, j] + directed[j, i]
    }
  }
  mat
}

distance_summary <- function(distances) {
  closeness <- numeric(nrow(distances))
  reachable <- integer(nrow(distances))
  for (i in seq_len(nrow(distances))) {
    row <- distances[i, ]
    finite <- row[is.finite(row) & row > 0]
    reachable[[i]] <- length(finite)
    closeness[[i]] <- ifelse(length(finite) > 0, length(finite) / sum(finite), 0)
  }
  finite_all <- distances[row(distances) != col(distances) & is.finite(distances) & distances > 0]
  list(
    distances = distances,
    closeness = closeness,
    reachable = reachable,
    averagePathLength = ifelse(length(finite_all) > 0, mean(finite_all), 0)
  )
}

graph_payload <- function(name, people, edges, community = FALSE) {
  directed <- make_directed_matrix(people, edges)
  undirected <- make_undirected_sena_matrix(directed)
  geo <- sna::geodist(undirected)$gdist
  distances <- distance_summary(geo)
  degree <- sna::degree(undirected, gmode = "graph", cmode = "freeman", ignore.eval = TRUE)
  weighted_degree <- sna::degree(undirected, gmode = "graph", cmode = "freeman", ignore.eval = FALSE)
  betweenness <- sna::betweenness(undirected, gmode = "graph", cmode = "undirected", rescale = FALSE)
  reciprocity <- as.numeric(sna::grecip(directed, measure = "edgewise"))
  component <- sna::component.dist(undirected, connected = "weak")
  component_labels <- normalize_labels(component$membership)

  out <- list(
    name = name,
    people = people,
    interactions = edge_df(edges),
    directedMatrix = unname(directed),
    undirectedMatrix = unname(undirected),
    degree = as.numeric(degree),
    weightedDegree = as.numeric(weighted_degree),
    betweenness = as.numeric(betweenness),
    closeness = as.numeric(distances$closeness),
    reachable = as.integer(distances$reachable),
    reciprocity = reciprocity,
    averagePathLength = as.numeric(distances$averagePathLength),
    componentCount = length(unique(component_labels)),
    componentLabels = component_labels
  )

  if (community) {
    graph <- igraph::graph_from_adjacency_matrix(undirected, mode = "undirected", weighted = TRUE, diag = FALSE)
    communities <- igraph::cluster_label_prop(graph, weights = igraph::E(graph)$weight, initial = seq_along(people))
    out$communityLabels <- normalize_labels(igraph::membership(communities))
    out$communityCount <- length(unique(out$communityLabels))
  }

  out
}

path_pair_edges <- list(
  c("A", "B", 1),
  c("B", "A", 1),
  c("B", "C", 1),
  c("C", "D", 1),
  c("E", "F", 1),
  c("F", "E", 1)
)

two_clique_edges <- list(
  c("A", "B", 1), c("B", "A", 1),
  c("A", "C", 1), c("C", "A", 1),
  c("B", "C", 1), c("C", "B", 1),
  c("D", "E", 1), c("E", "D", 1),
  c("D", "F", 1), c("F", "D", 1),
  c("E", "F", 1), c("F", "E", 1)
)

weighted_broker_people <- c("A", "B", "C", "D", "E", "F", "G", "H")
weighted_broker_edges <- list(
  c("A", "B", 3), c("B", "A", 1),
  c("B", "C", 2),
  c("C", "D", 1), c("D", "E", 4), c("E", "D", 1),
  c("C", "F", 2), c("F", "G", 1), c("G", "C", 1),
  c("G", "H", 2)
)

isolates_and_dyad_people <- c("A", "B", "C", "D", "E", "F")
isolates_and_dyad_edges <- list(
  c("A", "B", 2),
  c("B", "A", 1),
  c("C", "D", 1)
)

directed_reciprocity_star_people <- c("A", "B", "C", "D", "E", "F")
directed_reciprocity_star_edges <- list(
  c("A", "B", 1),
  c("A", "C", 1),
  c("A", "D", 1),
  c("B", "A", 1),
  c("C", "A", 1),
  c("E", "A", 1),
  c("F", "E", 1)
)

payload <- list(
  pathPair = graph_payload("pathPair", c("A", "B", "C", "D", "E", "F"), path_pair_edges, community = FALSE),
  twoCliques = graph_payload("twoCliques", c("A", "B", "C", "D", "E", "F"), two_clique_edges, community = TRUE),
  weightedBroker = graph_payload("weightedBroker", weighted_broker_people, weighted_broker_edges, community = FALSE),
  isolatesAndDyad = graph_payload("isolatesAndDyad", isolates_and_dyad_people, isolates_and_dyad_edges, community = FALSE),
  directedReciprocityStar = graph_payload("directedReciprocityStar", directed_reciprocity_star_people, directed_reciprocity_star_edges, community = FALSE)
)

dir.create(dirname(out_path), recursive = TRUE, showWarnings = FALSE)
jsonlite::write_json(payload, out_path, pretty = TRUE, auto_unbox = TRUE, digits = 16, null = "null")
message("Wrote ", out_path)
