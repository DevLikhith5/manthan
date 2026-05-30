package graph

import (
	"context"
	"fmt"
	"log/slog"

	neo4j "github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

type Neo4jClient struct {
	driver neo4j.DriverWithContext
	logger *slog.Logger
}

type Neo4jConfig struct {
	URI      string
	User     string
	Password string
}

func NewNeo4jClient(cfg Neo4jConfig, logger *slog.Logger) (*Neo4jClient, error) {
	driver, err := neo4j.NewDriverWithContext(cfg.URI, neo4j.BasicAuth(cfg.User, cfg.Password, ""))
	if err != nil {
		return nil, fmt.Errorf("neo4j driver: %w", err)
	}
	return &Neo4jClient{driver: driver, logger: logger}, nil
}

func (c *Neo4jClient) Close(ctx context.Context) error {
	return c.driver.Close(ctx)
}

func (c *Neo4jClient) EnsureIndexes(ctx context.Context) error {
	session := c.driver.NewSession(ctx, neo4j.SessionConfig{DatabaseName: "neo4j"})
	defer session.Close(ctx)

	queries := []string{
		"CREATE INDEX file_path IF NOT EXISTS FOR (f:File) ON (f.path, f.repo)",
		"CREATE INDEX func_name IF NOT EXISTS FOR (f:Function) ON (f.name, f.file_path)",
		"CREATE INDEX class_name IF NOT EXISTS FOR (c:Class) ON (c.name, c.file_path)",
		"CREATE INDEX import_path IF NOT EXISTS FOR (i:Import) ON (i.path, i.repo)",
		"CREATE INDEX package_name IF NOT EXISTS FOR (p:Package) ON (p.name, p.repo)",
	}
	for _, q := range queries {
		if _, err := session.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (interface{}, error) {
			_, err := tx.Run(ctx, q, nil)
			return nil, err
		}); err != nil {
			c.logger.Warn("index creation failed (may already exist)", "error", err)
		}
	}
	return nil
}

func (c *Neo4jClient) UpsertNodes(ctx context.Context, nodes []Node) error {
	if len(nodes) == 0 {
		return nil
	}
	session := c.driver.NewSession(ctx, neo4j.SessionConfig{DatabaseName: "neo4j"})
	defer session.Close(ctx)

	byLabel := map[string][]Node{}
	for _, n := range nodes {
		byLabel[n.Label] = append(byLabel[n.Label], n)
	}

	for label, labelNodes := range byLabel {
		batchSize := 500
		for i := 0; i < len(labelNodes); i += batchSize {
			end := i + batchSize
			if end > len(labelNodes) {
				end = len(labelNodes)
			}
			batch := labelNodes[i:end]

			_, err := session.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (interface{}, error) {
				nodeMaps := make([]map[string]interface{}, len(batch))
				for j, node := range batch {
					props := map[string]interface{}{}
					for k, v := range node.Properties {
						props[k] = v
					}
					props["id"] = node.ID
					nodeMaps[j] = props
				}
				query := fmt.Sprintf("UNWIND $nodes AS n MERGE (v:%s {id: n.id}) SET v += n RETURN count(v)", label)
				_, err := tx.Run(ctx, query, map[string]interface{}{"nodes": nodeMaps})
				return nil, err
			})
			if err != nil {
				return fmt.Errorf("upsert nodes batch (%s): %w", label, err)
			}
		}
	}
	return nil
}

func (c *Neo4jClient) UpsertEdges(ctx context.Context, edges []Edge) error {
	if len(edges) == 0 {
		return nil
	}
	session := c.driver.NewSession(ctx, neo4j.SessionConfig{DatabaseName: "neo4j"})
	defer session.Close(ctx)

	byType := map[string][]Edge{}
	for _, e := range edges {
		byType[e.Type] = append(byType[e.Type], e)
	}

	for edgeType, typeEdges := range byType {
		batchSize := 500
		for i := 0; i < len(typeEdges); i += batchSize {
			end := i + batchSize
			if end > len(typeEdges) {
				end = len(typeEdges)
			}
			batch := typeEdges[i:end]

			_, err := session.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (interface{}, error) {
				edgeMaps := make([]map[string]interface{}, len(batch))
				for j, edge := range batch {
					edgeMaps[j] = map[string]interface{}{
						"from_id": edge.FromID,
						"to_id":   edge.ToID,
						"props":   edge.Properties,
					}
				}
				query := fmt.Sprintf(`UNWIND $edges AS e
					MATCH (a {id: e.from_id}), (b {id: e.to_id})
					MERGE (a)-[r:%s]->(b)
					SET r += e.props
					RETURN count(r)`, edgeType)
				_, err := tx.Run(ctx, query, map[string]interface{}{"edges": edgeMaps})
				return nil, err
			})
			if err != nil {
				return fmt.Errorf("upsert edges batch (%s): %w", edgeType, err)
			}
		}
	}
	return nil
}

func (c *Neo4jClient) DeleteByFile(ctx context.Context, filePath string, repo string) error {
	session := c.driver.NewSession(ctx, neo4j.SessionConfig{DatabaseName: "neo4j"})
	defer session.Close(ctx)

	_, err := session.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (interface{}, error) {
		query := `MATCH (f:File {path: $path, repo: $repo})
			OPTIONAL MATCH (f)-[r1]->(n)
			OPTIONAL MATCH (m)-[r2]->(n)
			WHERE m:Function OR m:Class
			DETACH DELETE f, n, r1, r2`
		_, err := tx.Run(ctx, query, map[string]interface{}{"path": filePath, "repo": repo})
		return nil, err
	})
	return err
}

func (c *Neo4jClient) GetNeighbors(ctx context.Context, nodeID string, repo string) ([]Node, []Edge, error) {
	session := c.driver.NewSession(ctx, neo4j.SessionConfig{DatabaseName: "neo4j"})
	defer session.Close(ctx)

	result, err := session.ExecuteRead(ctx, func(tx neo4j.ManagedTransaction) (interface{}, error) {
		query := `MATCH (n {id: $id})-[r]-(m)
			WHERE (m.repo = $repo OR m.repo IS NULL)
			RETURN m.id AS id, labels(m) AS labels, properties(m) AS props,
			       type(r) AS rel_type, startNode(r).id AS from_id, endNode(r).id AS to_id, properties(r) AS rel_props
			LIMIT 50`
		cursor, err := tx.Run(ctx, query, map[string]interface{}{"id": nodeID, "repo": repo})
		if err != nil {
			return nil, err
		}

		var nodes []Node
		var edges []Edge
		seen := map[string]bool{}

		for cursor.Next(ctx) {
			record := cursor.Record()
			id, _ := record.Get("id")
			idStr, _ := id.(string)

			if !seen[idStr] {
				seen[idStr] = true
				labels, _ := record.Get("labels")
				props, _ := record.Get("props")
				labelList, _ := labels.([]interface{})
				label := ""
				if len(labelList) > 0 {
					label, _ = labelList[0].(string)
				}
				propMap, _ := props.(map[string]interface{})
				nodes = append(nodes, Node{ID: idStr, Label: label, Properties: propMap})
			}

			relType, _ := record.Get("rel_type")
			fromID, _ := record.Get("from_id")
			toID, _ := record.Get("to_id")
			relProps, _ := record.Get("rel_props")
			relPropMap, _ := relProps.(map[string]interface{})
			edges = append(edges, Edge{
				FromID:     fmt.Sprintf("%v", fromID),
				ToID:       fmt.Sprintf("%v", toID),
				Type:       fmt.Sprintf("%v", relType),
				Properties: relPropMap,
			})
		}
		return map[string]interface{}{"nodes": nodes, "edges": edges}, cursor.Err()
	})
	if err != nil {
		return nil, nil, err
	}
	resultMap := result.(map[string]interface{})
	return resultMap["nodes"].([]Node), resultMap["edges"].([]Edge), nil
}

func (c *Neo4jClient) GetCallGraph(ctx context.Context, name string, filePath string, depth int) ([]Node, []Edge, error) {
	session := c.driver.NewSession(ctx, neo4j.SessionConfig{DatabaseName: "neo4j"})
	defer session.Close(ctx)

	result, err := session.ExecuteRead(ctx, func(tx neo4j.ManagedTransaction) (interface{}, error) {
		query := fmt.Sprintf(`MATCH (start:Function {name: $name, file_path: $fp})
			MATCH path = (start)-[:CALLS*1..%d]->(target)
			UNWIND nodes(path) AS n
			UNWIND relationships(path) AS r
			RETURN DISTINCT n.id AS id, labels(n) AS labels, properties(n) AS props,
			       type(r) AS rel_type, startNode(r).id AS from_id, endNode(r).id AS to_id
			LIMIT 100`, depth)
		cursor, err := tx.Run(ctx, query, map[string]interface{}{"name": name, "fp": filePath})
		if err != nil {
			return nil, err
		}

		var nodes []Node
		var edges []Edge
		seen := map[string]bool{}

		for cursor.Next(ctx) {
			record := cursor.Record()
			id, _ := record.Get("id")
			idStr, _ := id.(string)
			if !seen[idStr] {
				seen[idStr] = true
				labels, _ := record.Get("labels")
				props, _ := record.Get("props")
				labelList, _ := labels.([]interface{})
				label := ""
				if len(labelList) > 0 {
					label, _ = labelList[0].(string)
				}
				propMap, _ := props.(map[string]interface{})
				nodes = append(nodes, Node{ID: idStr, Label: label, Properties: propMap})
			}
			relType, _ := record.Get("rel_type")
			fromID, _ := record.Get("from_id")
			toID, _ := record.Get("to_id")
			edges = append(edges, Edge{
				FromID: fmt.Sprintf("%v", fromID),
				ToID:   fmt.Sprintf("%v", toID),
				Type:   fmt.Sprintf("%v", relType),
			})
		}
		return map[string]interface{}{"nodes": nodes, "edges": edges}, cursor.Err()
	})
	if err != nil {
		return nil, nil, err
	}
	resultMap := result.(map[string]interface{})
	return resultMap["nodes"].([]Node), resultMap["edges"].([]Edge), nil
}

func (c *Neo4jClient) GetFileDependencyGraph(ctx context.Context, filePath string, repo string) ([]Node, []Edge, error) {
	session := c.driver.NewSession(ctx, neo4j.SessionConfig{DatabaseName: "neo4j"})
	defer session.Close(ctx)

	result, err := session.ExecuteRead(ctx, func(tx neo4j.ManagedTransaction) (interface{}, error) {
		query := `MATCH (f:File {path: $path, repo: $repo})-[r]-(m)
			RETURN m.id AS id, labels(m) AS labels, properties(m) AS props,
			       type(r) AS rel_type, startNode(r).id AS from_id, endNode(r).id AS to_id
			LIMIT 100`
		cursor, err := tx.Run(ctx, query, map[string]interface{}{"path": filePath, "repo": repo})
		if err != nil {
			return nil, err
		}

		var nodes []Node
		var edges []Edge
		seen := map[string]bool{}

		for cursor.Next(ctx) {
			record := cursor.Record()
			id, _ := record.Get("id")
			idStr, _ := id.(string)
			if !seen[idStr] {
				seen[idStr] = true
				labels, _ := record.Get("labels")
				props, _ := record.Get("props")
				labelList, _ := labels.(([]interface{}))
				label := ""
				if len(labelList) > 0 {
					label, _ = labelList[0].(string)
				}
				propMap, _ := props.(map[string]interface{})
				nodes = append(nodes, Node{ID: idStr, Label: label, Properties: propMap})
			}
			relType, _ := record.Get("rel_type")
			fromID, _ := record.Get("from_id")
			toID, _ := record.Get("to_id")
			edges = append(edges, Edge{
				FromID: fmt.Sprintf("%v", fromID),
				ToID:   fmt.Sprintf("%v", toID),
				Type:   fmt.Sprintf("%v", relType),
			})
		}
		return map[string]interface{}{"nodes": nodes, "edges": edges}, cursor.Err()
	})
	if err != nil {
		return nil, nil, err
	}
	resultMap := result.(map[string]interface{})
	return resultMap["nodes"].([]Node), resultMap["edges"].([]Edge), nil
}
