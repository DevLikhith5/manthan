package graph

import (
	"fmt"

	"github.com/cvlikhith/codesearch/ingestion/internal/adapter/ast"
)

func BuildGraphFromChunks(chunks []ast.Chunk, repo string) ([]Node, []Edge) {
	var nodes []Node
	var edges []Edge

	fileSeen := map[string]bool{}
	classSeen := map[string]bool{}

	for _, c := range chunks {
		fileID := FileNodeID(c.FilePath, repo)
		if !fileSeen[fileID] {
			fileSeen[fileID] = true
			nodes = append(nodes, NewNode(fileID, "File", map[string]interface{}{
				"path":     c.FilePath,
				"repo":     repo,
				"language": c.Language,
				"name":     fileName(c.FilePath),
			}))
		}

		switch c.Kind {
		case "function", "method":
			funcID := FunctionNodeID(c.Name, c.FilePath)
			props := map[string]interface{}{
				"name":       c.Name,
				"file_path":  c.FilePath,
				"start_line": c.StartLine,
				"end_line":   c.EndLine,
				"signature":  c.Signature,
				"kind":       c.Kind,
				"repo":       repo,
			}
			nodes = append(nodes, NewNode(funcID, "Function", props))
			edges = append(edges, NewEdge(fileID, funcID, "DEFINES", nil))

			if c.ParentClass != "" {
				classID := ClassNodeID(c.ParentClass, c.FilePath)
				edges = append(edges, NewEdge(classID, funcID, "CONTAINS", nil))
			}

			for _, call := range c.Calls {
				calleeID := FunctionNodeID(call.Name, c.FilePath)
				callProps := map[string]interface{}{
					"line": call.Line,
				}
				edges = append(edges, NewEdge(funcID, calleeID, "CALLS", callProps))
			}

		case "class", "struct":
			classID := ClassNodeID(c.Name, c.FilePath)
			classSeen[classID] = true
			props := map[string]interface{}{
				"name":      c.Name,
				"file_path": c.FilePath,
				"start_line": c.StartLine,
				"end_line":  c.EndLine,
				"kind":      c.Kind,
				"repo":      repo,
			}
			nodes = append(nodes, NewNode(classID, "Class", props))
			edges = append(edges, NewEdge(fileID, classID, "DEFINES", nil))

			if c.Extends != "" {
				extendsID := ClassNodeID(c.Extends, c.FilePath)
				edges = append(edges, NewEdge(classID, extendsID, "EXTENDS", nil))
			}
			for _, iface := range c.Implements {
				ifaceID := ClassNodeID(iface, c.FilePath)
				edges = append(edges, NewEdge(classID, ifaceID, "IMPLEMENTS", nil))
			}

		case "file":
			_ = fileID
		}

		for _, imp := range c.Imports {
			impPath := cleanImportPath(imp)
			if impPath == "" {
				continue
			}
			impID := ImportNodeID(impPath, repo)
			nodes = append(nodes, NewNode(impID, "Import", map[string]interface{}{
				"path": impPath,
				"repo": repo,
			}))
			edges = append(edges, NewEdge(fileID, impID, "IMPORTS", nil))
		}
	}

	return dedup(nodes), dedupEdges(edges)
}

func fileName(filePath string) string {
	for i := len(filePath) - 1; i >= 0; i-- {
		if filePath[i] == '/' {
			return filePath[i+1:]
		}
	}
	return filePath
}

func cleanImportPath(imp string) string {
	if len(imp) == 0 {
		return ""
	}
	if imp[0] == '"' {
		imp = imp[1:]
	}
	if len(imp) > 0 && imp[len(imp)-1] == '"' {
		imp = imp[:len(imp)-1]
	}
	if len(imp) > 2 && imp[:2] == "github.com" || len(imp) > 3 && imp[:3] == "std" {
		return imp
	}
	if len(imp) > 10 && imp[:10] == "github.com/" {
		return imp
	}
	return imp
}

func dedup(nodes []Node) []Node {
	seen := map[string]bool{}
	var out []Node
	for _, n := range nodes {
		if seen[n.ID] {
			continue
		}
		seen[n.ID] = true
		out = append(out, n)
	}
	return out
}

func dedupEdges(edges []Edge) []Edge {
	seen := map[string]bool{}
	var out []Edge
	for _, e := range edges {
		key := fmt.Sprintf("%s->%s->%s", e.FromID, e.Type, e.ToID)
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, e)
	}
	return out
}
