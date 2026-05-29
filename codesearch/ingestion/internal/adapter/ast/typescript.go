package ast

import (
	"strings"

	sitter "github.com/smacker/go-tree-sitter"
)

type tsExtractor struct {
	filePath string
	source   []byte
}

func (e *tsExtractor) extract(root *sitter.Node) []Chunk {
	var chunks []Chunk
	imports := e.extractImports(root)
	e.walk(root, "", &chunks, imports)
	return chunks
}

func (e *tsExtractor) walk(node *sitter.Node, parentClass string, chunks *[]Chunk, imports []string) {
	switch node.Type() {
	case "function_declaration":
		if chunk := e.extractFunction(node, parentClass, imports); chunk != nil {
			*chunks = append(*chunks, *chunk)
		}
	case "method_definition":
		if chunk := e.extractFunction(node, parentClass, imports); chunk != nil {
			*chunks = append(*chunks, *chunk)
		}
	case "class_declaration":
		if chunk := e.extractClass(node, imports); chunk != nil {
			*chunks = append(*chunks, *chunk)
			className := e.childText(node, "type_identifier")
			for i := 0; i < int(node.ChildCount()); i++ {
				e.walk(node.Child(i), className, chunks, imports)
			}
			return
		}
	case "arrow_function":
		if chunk := e.extractArrowFunction(node, parentClass, imports); chunk != nil {
			*chunks = append(*chunks, *chunk)
		}
	}
	for i := 0; i < int(node.ChildCount()); i++ {
		e.walk(node.Child(i), parentClass, chunks, imports)
	}
}

func (e *tsExtractor) extractFunction(node *sitter.Node, parentClass string, imports []string) *Chunk {
	name := e.childText(node, "identifier")
	if name == "" {
		return nil
	}
	fullText := string(e.source[node.StartByte():node.EndByte()])
	signature := e.extractSignature(fullText)
	comment := e.extractComment(node)

	embedLines := []string{"func: " + name, "signature: " + signature}
	if comment != "" {
		embedLines = append(embedLines, "docs: "+comment)
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
		Docstring:   comment,
		Name:        name,
		Kind:        kind,
		ParentClass: parentClass,
		FilePath:    e.filePath,
		Language:    "typescript",
		StartLine:   int(node.StartPoint().Row) + 1,
		EndLine:     int(node.EndPoint().Row) + 1,
		Imports:     imports,
	}
}

func (e *tsExtractor) extractArrowFunction(node *sitter.Node, parentClass string, imports []string) *Chunk {
	// Arrow functions may be assigned to variables
	fullText := string(e.source[node.StartByte():node.EndByte()])
	comment := e.extractComment(node)

	name := "anonymous"
	embedText := "func: arrow function"
	if comment != "" {
		embedText += "\ndocs: " + comment
	}

	return &Chunk{
		Content:     fullText,
		EmbedText:   embedText,
		Docstring:   comment,
		Name:        name,
		Kind:        "function",
		ParentClass: parentClass,
		FilePath:    e.filePath,
		Language:    "typescript",
		StartLine:   int(node.StartPoint().Row) + 1,
		EndLine:     int(node.EndPoint().Row) + 1,
		Imports:     imports,
	}
}

func (e *tsExtractor) extractClass(node *sitter.Node, imports []string) *Chunk {
	name := e.childText(node, "type_identifier")
	if name == "" {
		return nil
	}
	fullText := string(e.source[node.StartByte():node.EndByte()])
	comment := e.extractComment(node)

	embedText := "class: " + name
	if comment != "" {
		embedText += "\ndocs: " + comment
	}

	return &Chunk{
		Content:   fullText,
		EmbedText: embedText,
		Signature: "class " + name,
		Docstring: comment,
		Name:      name,
		Kind:      "class",
		FilePath:  e.filePath,
		Language:  "typescript",
		StartLine: int(node.StartPoint().Row) + 1,
		EndLine:   int(node.EndPoint().Row) + 1,
		Imports:   imports,
	}
}

func (e *tsExtractor) extractImports(root *sitter.Node) []string {
	var imports []string
	q := []*sitter.Node{root}
	for len(q) > 0 {
		node := q[0]
		q = q[1:]
		if node.Type() == "import_statement" {
			imports = append(imports, string(e.source[node.StartByte():node.EndByte()]))
		}
		for i := 0; i < int(node.ChildCount()); i++ {
			q = append(q, node.Child(i))
		}
	}
	return imports
}

func (e *tsExtractor) extractSignature(fullText string) string {
	idx := strings.Index(fullText, "{")
	if idx == -1 {
		return fullText
	}
	// Handle arrow functions
	if strings.Contains(fullText, "=>") {
		arrowIdx := strings.Index(fullText, "=>")
		if arrowIdx < idx {
			return strings.TrimSpace(fullText[:arrowIdx]) + " =>"
		}
	}
	return strings.TrimSpace(fullText[:idx])
}

func (e *tsExtractor) extractComment(node *sitter.Node) string {
	prev := node.PrevSibling()
	if prev != nil && strings.HasPrefix(prev.Type(), "comment") {
		return strings.TrimSpace(string(e.source[prev.StartByte():prev.EndByte()]))
	}
	return ""
}

func (e *tsExtractor) childText(node *sitter.Node, childType string) string {
	for i := 0; i < int(node.ChildCount()); i++ {
		child := node.Child(i)
		if child.Type() == childType {
			return string(e.source[child.StartByte():child.EndByte()])
		}
	}
	return ""
}
