package graph

type Node struct {
	ID         string
	Label      string // "File", "Function", "Class", "Import", "Package"
	Properties map[string]interface{}
}

type Edge struct {
	FromID     string
	ToID       string
	Type       string // "CALLS", "EXTENDS", "IMPLEMENTS", "IMPORTS", "DEFINES", "CONTAINS", "USES", "OVERRIDES", "HAS_DECORATOR"
	Properties map[string]interface{}
}

func NewNode(id, label string, props map[string]interface{}) Node {
	if props == nil {
		props = make(map[string]interface{})
	}
	return Node{ID: id, Label: label, Properties: props}
}

func NewEdge(from, to, edgeType string, props map[string]interface{}) Edge {
	if props == nil {
		props = make(map[string]interface{})
	}
	return Edge{FromID: from, ToID: to, Type: edgeType, Properties: props}
}

func FileNodeID(filePath, repo string) string {
	return repo + "::" + filePath
}

func FunctionNodeID(name, filePath string) string {
	return filePath + "::" + name
}

func ClassNodeID(name, filePath string) string {
	return filePath + "::" + name
}

func ImportNodeID(path, repo string) string {
	return repo + "::import::" + path
}

func PackageNodeID(name, repo string) string {
	return repo + "::pkg::" + name
}
