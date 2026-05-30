package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"

	"github.com/cvlikhith/codesearch/ingestion/internal/adapter/ast"
	"github.com/cvlikhith/codesearch/ingestion/internal/adapter/graph"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	// Test Neo4j connection
	client, err := graph.NewNeo4jClient(graph.Neo4jConfig{
		URI:      "bolt://localhost:7687",
		User:     "neo4j",
		Password: "graphpassword",
	}, logger)
	if err != nil {
		fmt.Printf("Neo4j connection error: %v\n", err)
		return
	}
	defer client.Close(context.Background())

	ctx := context.Background()
	if err := client.EnsureIndexes(ctx); err != nil {
		fmt.Printf("Index error: %v\n", err)
	}

	// Parse and extract graph from wal.go
	content, _ := os.ReadFile("/tmp/codesearch_repos/kasoku/internal/store/wal.go")
	chunks, _ := ast.Parse("internal/store/wal.go", content)
	nodes, edges := graph.BuildGraphFromChunks(chunks, "kasoku")

	fmt.Printf("\n=== Writing to Neo4j ===\n")
	fmt.Printf("Nodes: %d, Edges: %d\n", len(nodes), len(edges))
	if err := client.UpsertNodes(ctx, nodes); err != nil {
		fmt.Printf("Node upsert error: %v\n", err)
	} else {
		fmt.Println("Nodes written OK")
	}
	if err := client.UpsertEdges(ctx, edges); err != nil {
		fmt.Printf("Edge upsert error: %v\n", err)
	} else {
		fmt.Println("Edges written OK")
	}

	// Query neighbors
	fmt.Printf("\n=== Querying Neighbors ===\n")
	neighbors, neighborEdges, err := client.GetNeighbors(ctx, "internal/store/wal.go::Append", "kasoku")
	if err != nil {
		fmt.Printf("Neighbor error: %v\n", err)
	} else {
		fmt.Printf("Append neighbors: %d nodes, %d edges\n", len(neighbors), len(neighborEdges))
		for _, n := range neighbors {
			fmt.Printf("  %s (%s)\n", n.Properties["name"], n.Label)
		}
		for _, e := range neighborEdges {
			fmt.Printf("  %s -> %s [%s]\n", e.FromID, e.ToID, e.Type)
		}
	}

	// Query call graph
	fmt.Printf("\n=== Querying Call Graph ===\n")
	callNodes, callEdges, err := client.GetCallGraph(ctx, "Append", "internal/store/wal.go", 2)
	if err != nil {
		fmt.Printf("Call graph error: %v\n", err)
	} else {
		fmt.Printf("Append call graph (depth 2): %d nodes, %d edges\n", len(callNodes), len(callEdges))
	}
}
