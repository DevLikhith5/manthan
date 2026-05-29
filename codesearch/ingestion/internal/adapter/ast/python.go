package ast

import (
	"strings"

	sitter "github.com/smacker/go-tree-sitter"
)

type pyExtractor struct {
	filePath string
	source   []byte
}

func (e *pyExtractor) extract(root *sitter.Node) []Chunk {
	var chunks []Chunk
	imports := e.extractImports(root)
	e.walk(root, "", &chunks, imports)
	return chunks
}

func (e *pyExtractor) walk(node *sitter.Node, parentClass string, chunks *[]Chunk, imports []string) {
	switch node.Type() {
	case "function_definition":
		if chunk := e.extractFunction(node, parentClass, imports); chunk != nil {
			*chunks = append(*chunks, *chunk)
		}
	case "class_definition":
		if chunk := e.extractClass(node, imports); chunk != nil {
			*chunks = append(*chunks, *chunk)
			className := e.childText(node, "identifier")
			for i := 0; i < int(node.ChildCount()); i++ {
				e.walk(node.Child(i), className, chunks, imports)
			}
			return
		}
	}
	for i := 0; i < int(node.ChildCount()); i++ {
		e.walk(node.Child(i), parentClass, chunks, imports)
	}
}

func (e *pyExtractor) extractFunction(node *sitter.Node, parentClass string, imports []string) *Chunk {
	name := e.childText(node, "identifier")
	if name == "" {
		return nil
	}
	fullText := string(e.source[node.StartByte():node.EndByte()])
	signature := e.extractSignature(fullText)
	docstring := e.extractDocstring(node)

	embedLines := []string{"func: " + name, "signature: " + signature}
	if docstring != "" {
		embedLines = append(embedLines, "docs: "+docstring)
	}
	embedText := strings.Join(embedLines, "\n")

	kind := "function"
	if parentClass != "" {
		kind = "method"
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
		Language:    "python",
		StartLine:   int(node.StartPoint().Row) + 1,
		EndLine:     int(node.EndPoint().Row) + 1,
		Imports:     imports,
	}
}

func (e *pyExtractor) extractClass(node *sitter.Node, imports []string) *Chunk {
	name := e.childText(node, "identifier")
	if name == "" {
		return nil
	}
	fullText := string(e.source[node.StartByte():node.EndByte()])
	docstring := e.extractDocstring(node)

	embedText := "class: " + name
	if docstring != "" {
		embedText += "\ndocs: " + docstring
	}

	return &Chunk{
		Content:   fullText,
		EmbedText: embedText,
		Signature: "class " + name,
		Docstring: docstring,
		Name:      name,
		Kind:      "class",
		FilePath:  e.filePath,
		Language:  "python",
		StartLine: int(node.StartPoint().Row) + 1,
		EndLine:   int(node.EndPoint().Row) + 1,
		Imports:   imports,
	}
}

func (e *pyExtractor) extractImports(root *sitter.Node) []string {
	var imports []string
	q := []*sitter.Node{root}
	for len(q) > 0 {
		node := q[0]
		q = q[1:]
		if node.Type() == "import_statement" || node.Type() == "import_from_statement" {
			imports = append(imports, string(e.source[node.StartByte():node.EndByte()]))
		}
		for i := 0; i < int(node.ChildCount()); i++ {
			q = append(q, node.Child(i))
		}
	}
	return imports
}

func (e *pyExtractor) extractSignature(fullText string) string {
	idx := strings.Index(fullText, ":")
	if idx == -1 {
		return fullText
	}
	return strings.TrimSpace(fullText[:idx]) + ":"
}

func (e *pyExtractor) extractDocstring(node *sitter.Node) string {
	body := node.ChildByFieldName("body")
	if body == nil {
		return ""
	}
	for i := 0; i < int(body.ChildCount()); i++ {
		child := body.Child(i)
		if child.Type() == "expression_statement" {
			expr := child.Child(0)
			if expr != nil && expr.Type() == "string" {
				return strings.TrimSpace(string(e.source[expr.StartByte():expr.EndByte()]))
			}
			if expr != nil && expr.Type() == "string_content" {
				return strings.TrimSpace(string(e.source[expr.StartByte():expr.EndByte()]))
			}
		}
	}
	return ""
}

func (e *pyExtractor) childText(node *sitter.Node, childType string) string {
	for i := 0; i < int(node.ChildCount()); i++ {
		child := node.Child(i)
		if child.Type() == childType {
			return string(e.source[child.StartByte():child.EndByte()])
		}
	}
	return ""
}
