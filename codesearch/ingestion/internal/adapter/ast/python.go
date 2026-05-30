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
	case "decorated_definition":
		for i := 0; i < int(node.ChildCount()); i++ {
			child := node.Child(i)
			if child.Type() == "function_definition" || child.Type() == "class_definition" {
				e.walk(child, parentClass, chunks, imports)
			}
		}
		return
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

	calls := e.extractCallSites(node)
	decorators := e.extractDecorators(node)
	isExported := len(name) > 0 && name[0] != '_'

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
		Calls:       calls,
		Decorators:  decorators,
		IsExported:  isExported,
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

	extends := e.extractClassBases(node)
	decorators := e.extractDecorators(node)

	return &Chunk{
		Content:    fullText,
		EmbedText:  embedText,
		Signature:  "class " + name,
		Docstring:  docstring,
		Name:       name,
		Kind:       "class",
		FilePath:   e.filePath,
		Language:   "python",
		StartLine:  int(node.StartPoint().Row) + 1,
		EndLine:    int(node.EndPoint().Row) + 1,
		Imports:    imports,
		Extends:    extends,
		Decorators: decorators,
		IsExported: len(name) > 0 && name[0] != '_',
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

func (e *pyExtractor) extractCallSites(node *sitter.Node) []CallSite {
	var calls []CallSite
	e.walkForCalls(node, &calls)
	return calls
}

func (e *pyExtractor) walkForCalls(node *sitter.Node, calls *[]CallSite) {
	if node.Type() == "function_definition" {
		body := node.ChildByFieldName("body")
		if body != nil {
			e.walkForCalls(body, calls)
		}
		return
	}

	if node.Type() == "call" {
		name := ""
		qualifier := ""
		if node.ChildCount() > 0 {
			callee := node.Child(0)
			if callee.Type() == "identifier" {
				name = string(e.source[callee.StartByte():callee.EndByte()])
			} else if callee.Type() == "attribute" {
				count := int(callee.ChildCount())
				if count >= 2 {
					qualifier = string(e.source[callee.Child(0).StartByte():callee.Child(0).EndByte()])
					name = string(e.source[callee.Child(count-1).StartByte():callee.Child(count-1).EndByte()])
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

func (e *pyExtractor) extractClassBases(node *sitter.Node) string {
	for i := 0; i < int(node.ChildCount()); i++ {
		child := node.Child(i)
		if child.Type() == "argument_list" {
			if child.ChildCount() > 0 {
				first := child.Child(0)
				if first.Type() == "identifier" || first.Type() == "attribute" {
					return string(e.source[first.StartByte():first.EndByte()])
				}
			}
		}
	}
	return ""
}

func (e *pyExtractor) extractDecorators(node *sitter.Node) []Decorator {
	var decs []Decorator
	parent := node.Parent()
	if parent == nil || parent.Type() != "decorated_definition" {
		return decs
	}
	for i := 0; i < int(parent.ChildCount()); i++ {
		child := parent.Child(i)
		if child.Type() == "decorator" {
			name := ""
			for j := 0; j < int(child.ChildCount()); j++ {
				inner := child.Child(j)
				if inner.Type() == "identifier" || inner.Type() == "dotted_name" {
					name = string(e.source[inner.StartByte():inner.EndByte()])
					break
				}
			}
			if name != "" {
				decs = append(decs, Decorator{Name: name})
			}
		}
	}
	return decs
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
