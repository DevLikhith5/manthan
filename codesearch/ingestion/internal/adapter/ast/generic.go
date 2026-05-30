package ast

import (
	"strings"

	sitter "github.com/smacker/go-tree-sitter"
)

type genericExtractor struct {
	filePath string
	source   []byte
	ext      string
}

func (e *genericExtractor) extract(root *sitter.Node) []Chunk {
	var chunks []Chunk
	e.walk(root, "", &chunks)
	if len(chunks) == 0 {
		chunks = e.wholeFileChunk()
	}
	return chunks
}

func (e *genericExtractor) walk(node *sitter.Node, parentClass string, chunks *[]Chunk) {
	switch node.Type() {
	case "function_definition", "function_declaration", "method_definition", "method_declaration":
		if chunk := e.extractNamed(node, parentClass, "function"); chunk != nil {
			*chunks = append(*chunks, *chunk)
		}
	case "class_definition", "class_declaration", "interface_declaration", "struct_declaration", "enum_declaration", "trait_declaration":
		if chunk := e.extractNamed(node, "", "class"); chunk != nil {
			*chunks = append(*chunks, *chunk)
			className := e.firstChildName(node)
			for i := 0; i < int(node.ChildCount()); i++ {
				child := node.Child(i)
				if child.IsNamed() {
					e.walk(child, className, chunks)
				}
			}
			return
		}
	case "constructor_declaration", "constructor_definition":
		if chunk := e.extractNamed(node, parentClass, "function"); chunk != nil {
			*chunks = append(*chunks, *chunk)
		}
	}
	for i := 0; i < int(node.ChildCount()); i++ {
		child := node.Child(i)
		if child.IsNamed() {
			e.walk(child, parentClass, chunks)
		}
	}
}

func (e *genericExtractor) extractNamed(node *sitter.Node, parentClass string, kind string) *Chunk {
	name := e.functionName(node)
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

	if parentClass != "" {
		kind = "method"
	}

	return &Chunk{
		Content:     fullText,
		EmbedText:   strings.Join(embedLines, "\n"),
		Signature:   signature,
		Docstring:   comment,
		Name:        name,
		Kind:        kind,
		ParentClass: parentClass,
		FilePath:    e.filePath,
		StartLine:   int(node.StartPoint().Row) + 1,
		EndLine:     int(node.EndPoint().Row) + 1,
	}
}

func (e *genericExtractor) functionName(node *sitter.Node) string {
	for _, childType := range []string{"name", "identifier", "field_identifier", "type_identifier"} {
		if name := e.childText(node, childType); name != "" {
			return name
		}
	}
	return ""
}

func (e *genericExtractor) firstChildName(node *sitter.Node) string {
	for i := 0; i < int(node.ChildCount()); i++ {
		child := node.Child(i)
		if child.Type() == "name" || child.Type() == "identifier" || child.Type() == "type_identifier" {
			return string(e.source[child.StartByte():child.EndByte()])
		}
	}
	return ""
}

func (e *genericExtractor) extractSignature(fullText string) string {
	idx := strings.Index(fullText, "{")
	if idx == -1 {
		idx = strings.Index(fullText, "->")
		if idx == -1 {
			idx = strings.Index(fullText, "=>")
		}
		if idx == -1 {
			if len(fullText) > 200 {
				return fullText[:200]
			}
			return fullText
		}
	}
	return strings.TrimSpace(fullText[:idx])
}

func (e *genericExtractor) extractComment(node *sitter.Node) string {
	prev := node.PrevSibling()
	if prev != nil {
		t := prev.Type()
		if strings.HasPrefix(t, "comment") || t == "doc" || t == "doc_comment" || strings.HasPrefix(t, "line_comment") || strings.HasPrefix(t, "block_comment") {
			return strings.TrimSpace(string(e.source[prev.StartByte():prev.EndByte()]))
		}
	}
	return ""
}

func (e *genericExtractor) childText(node *sitter.Node, childType string) string {
	for i := 0; i < int(node.ChildCount()); i++ {
		child := node.Child(i)
		if child.Type() == childType {
			return string(e.source[child.StartByte():child.EndByte()])
		}
	}
	return ""
}

func (e *genericExtractor) wholeFileChunk() []Chunk {
	content := string(e.content())
	if len(strings.TrimSpace(content)) == 0 {
		return nil
	}
	name := e.filePath
	if idx := strings.LastIndex(name, "/"); idx >= 0 {
		name = name[idx+1:]
	}
	return []Chunk{{
		Content:   content,
		EmbedText: "file: " + name,
		Signature: name,
		Name:      name,
		Kind:      "file",
		FilePath:  e.filePath,
		StartLine: 1,
		EndLine:   strings.Count(content, "\n") + 1,
	}}
}

func (e *genericExtractor) content() []byte {
	return e.source
}
