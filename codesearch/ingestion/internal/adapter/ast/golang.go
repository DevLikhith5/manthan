package ast

import (
	"strings"

	sitter "github.com/smacker/go-tree-sitter"
)

type goExtractor struct {
	filePath string
	source   []byte
}

func (e *goExtractor) extract(root *sitter.Node) []Chunk {
	var chunks []Chunk
	imports := e.extractImports(root)
	e.walk(root, "", &chunks, imports)
	return chunks
}

func (e *goExtractor) walk(node *sitter.Node, parentType string, chunks *[]Chunk, imports []string) {
	switch node.Type() {
	case "function_declaration", "method_declaration":
		if chunk := e.extractFunction(node, parentType, imports); chunk != nil {
			*chunks = append(*chunks, *chunk)
		}
	case "type_declaration":
		if chunk := e.extractType(node, imports); chunk != nil {
			*chunks = append(*chunks, *chunk)
		}
	}
	for i := 0; i < int(node.ChildCount()); i++ {
		e.walk(node.Child(i), node.Type(), chunks, imports)
	}
}

func (e *goExtractor) extractFunction(node *sitter.Node, parentType string, imports []string) *Chunk {
	name := e.childText(node, "identifier")
	if name == "" {
		// method_declaration has field_identifier
		name = e.childText(node, "field_identifier")
	}
	if name == "" {
		return nil
	}
	fullText := string(e.source[node.StartByte():node.EndByte()])
	signature := e.extractSignature(fullText)
	docstring := e.extractComment(node)
	embedText := strings.Join([]string{
		"func: " + name,
		"signature: " + signature,
		"docs: " + docstring,
	}, "\n")

	kind := "function"
	parentClass := ""
	if parentType == "type_declaration" {
		kind = "method"
		parentClass = parentType
	}

	return &Chunk{
		Content:     fullText,
		EmbedText:   embedText,
		Signature:   signature,
		Docstring:   docstring,
		Name:        name,
		Kind:        kind,
		ParentClass: parentClass,
		FilePath:    e.filePath,
		Language:    "go",
		StartLine:   int(node.StartPoint().Row) + 1,
		EndLine:     int(node.EndPoint().Row) + 1,
		Imports:     imports,
	}
}

func (e *goExtractor) extractType(node *sitter.Node, imports []string) *Chunk {
	name := e.childText(node, "type_identifier")
	if name == "" {
		return nil
	}
	fullText := string(e.source[node.StartByte():node.EndByte()])
	docstring := e.extractComment(node)
	embedText := strings.Join([]string{
		"type: " + name,
		"docs: " + docstring,
	}, "\n")

	return &Chunk{
		Content:   fullText,
		EmbedText: embedText,
		Signature: "type " + name,
		Docstring: docstring,
		Name:      name,
		Kind:      "struct",
		FilePath:  e.filePath,
		Language:  "go",
		StartLine: int(node.StartPoint().Row) + 1,
		EndLine:   int(node.EndPoint().Row) + 1,
		Imports:   imports,
	}
}

func (e *goExtractor) extractImports(root *sitter.Node) []string {
	var imports []string
	q := []*sitter.Node{root}
	for len(q) > 0 {
		node := q[0]
		q = q[1:]
		if node.Type() == "import_specification" {
			path := e.childText(node, "interpreted_string_literal")
			if path != "" {
				imports = append(imports, strings.Trim(path, "\""))
			}
		}
		for i := 0; i < int(node.ChildCount()); i++ {
			q = append(q, node.Child(i))
		}
	}
	return imports
}

func (e *goExtractor) extractSignature(fullText string) string {
	idx := strings.Index(fullText, "{")
	if idx == -1 {
		return fullText
	}
	return strings.TrimSpace(fullText[:idx])
}

func (e *goExtractor) extractComment(node *sitter.Node) string {
	prev := node.PrevSibling()
	if prev != nil && (prev.Type() == "comment" || strings.HasPrefix(prev.Type(), "comment")) {
		return strings.TrimSpace(string(e.source[prev.StartByte():prev.EndByte()]))
	}
	parent := node.Parent()
	if parent != nil {
		prev = parent.PrevSibling()
		if prev != nil && prev.Type() == "comment" {
			return strings.TrimSpace(string(e.source[prev.StartByte():prev.EndByte()]))
		}
	}
	return ""
}

func (e *goExtractor) childText(node *sitter.Node, childType string) string {
	for i := 0; i < int(node.ChildCount()); i++ {
		child := node.Child(i)
		if child.Type() == childType {
			return string(e.source[child.StartByte():child.EndByte()])
		}
	}
	return ""
}
