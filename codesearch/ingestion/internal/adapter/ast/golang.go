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
		parentClass = e.findReceiverType(node)
	}

	calls := e.extractCallSites(node)
	isExported := len(name) > 0 && name[0] >= 'A' && name[0] <= 'Z'

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
		Calls:       calls,
		IsExported:  isExported,
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

	extends := e.extractEmbeddedTypes(node)

	return &Chunk{
		Content:    fullText,
		EmbedText:  embedText,
		Signature:  "type " + name,
		Docstring:  docstring,
		Name:       name,
		Kind:       "struct",
		FilePath:   e.filePath,
		Language:   "go",
		StartLine:  int(node.StartPoint().Row) + 1,
		EndLine:    int(node.EndPoint().Row) + 1,
		Imports:    imports,
		Extends:    extends,
		IsExported: len(name) > 0 && name[0] >= 'A' && name[0] <= 'Z',
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

func (e *goExtractor) findReceiverType(node *sitter.Node) string {
	for i := 0; i < int(node.ChildCount()); i++ {
		child := node.Child(i)
		if child.Type() == "parameter_list" {
			for j := 0; j < int(child.ChildCount()); j++ {
				param := child.Child(j)
				if param.Type() == "parameter_declaration" {
					typeNode := param.ChildByFieldName("type")
					if typeNode != nil {
						text := string(e.source[typeNode.StartByte():typeNode.EndByte()])
						text = strings.TrimPrefix(text, "*")
						return text
					}
				}
			}
		}
	}
	return ""
}

func (e *goExtractor) extractEmbeddedTypes(node *sitter.Node) string {
	for i := 0; i < int(node.ChildCount()); i++ {
		child := node.Child(i)
		if child.Type() == "type_declaration" {
			for j := 0; j < int(child.ChildCount()); j++ {
				inner := child.Child(j)
				if inner.Type() == "struct_type" {
					for k := 0; k < int(inner.ChildCount()); k++ {
						field := inner.Child(k)
						if field.Type() == "field_declaration_list" {
							for l := 0; l < int(field.ChildCount()); l++ {
								f := field.Child(l)
								if f.Type() == "field_declaration" {
									typeNode := f.ChildByFieldName("type")
									if typeNode != nil {
										text := string(e.source[typeNode.StartByte():typeNode.EndByte()])
										text = strings.TrimPrefix(text, "*")
										return text
									}
								}
							}
						}
					}
				}
			}
		}
	}
	return ""
}

func (e *goExtractor) extractCallSites(node *sitter.Node) []CallSite {
	var calls []CallSite
	e.walkForCalls(node, &calls)
	return calls
}

func (e *goExtractor) walkForCalls(node *sitter.Node, calls *[]CallSite) {
	if node.Type() == "function_declaration" || node.Type() == "method_declaration" {
		for i := 0; i < int(node.ChildCount()); i++ {
			child := node.Child(i)
			if child.Type() == "block" {
				e.walkForCalls(child, calls)
			}
		}
		return
	}

	if node.Type() == "call_expression" {
		name := ""
		qualifier := ""
		if node.ChildCount() > 0 {
			callee := node.Child(0)
			if callee.Type() == "identifier" {
				name = string(e.source[callee.StartByte():callee.EndByte()])
			} else if callee.Type() == "selector_expression" {
				if callee.ChildCount() >= 2 {
					qualifier = string(e.source[callee.Child(0).StartByte():callee.Child(0).EndByte()])
					name = string(e.source[callee.Child(1).StartByte():callee.Child(1).EndByte()])
				}
			}
		}
		if name != "" {
			*calls = append(*calls, CallSite{
				Name:      name,
				Qualifier: qualifier,
				Line:      int(node.StartPoint().Row) + 1,
			})
		}
	}

	for i := 0; i < int(node.ChildCount()); i++ {
		e.walkForCalls(node.Child(i), calls)
	}
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
