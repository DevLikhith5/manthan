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
	case "lexical_declaration", "variable_declaration":
		e.extractVariableDeclaration(node, parentClass, chunks, imports)
		return
	}
	for i := 0; i < int(node.ChildCount()); i++ {
		e.walk(node.Child(i), parentClass, chunks, imports)
	}
}

func (e *tsExtractor) extractVariableDeclaration(node *sitter.Node, parentClass string, chunks *[]Chunk, imports []string) {
	for i := 0; i < int(node.ChildCount()); i++ {
		decl := node.Child(i)
		if decl.Type() != "variable_declarator" {
			continue
		}
		varName := e.childText(decl, "identifier")
		for j := 0; j < int(decl.ChildCount()); j++ {
			child := decl.Child(j)
			if child.Type() == "arrow_function" {
				chunk := e.extractArrowFunction(child, parentClass, imports)
				if chunk != nil {
					if varName != "" {
						chunk.Name = varName
						chunk.EmbedText = "func: " + varName + "\n" + chunk.EmbedText[len("func: arrow function"):]
					}
					*chunks = append(*chunks, *chunk)
				}
			}
		}
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

	calls := e.extractCallSites(node)
	isExported := e.isExported(node)

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
		Calls:       calls,
		IsExported:  isExported,
	}
}

func (e *tsExtractor) extractArrowFunction(node *sitter.Node, parentClass string, imports []string) *Chunk {
	fullText := string(e.source[node.StartByte():node.EndByte()])
	comment := e.extractComment(node)

	name := "anonymous"
	embedText := "func: arrow function"
	if comment != "" {
		embedText += "\ndocs: " + comment
	}

	calls := e.extractCallSites(node)

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
		Calls:       calls,
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

	extends := e.extractExtends(node)
	implements := e.extractImplements(node)
	isExported := e.isExported(node)

	return &Chunk{
		Content:    fullText,
		EmbedText:  embedText,
		Signature:  "class " + name,
		Docstring:  comment,
		Name:       name,
		Kind:       "class",
		FilePath:   e.filePath,
		Language:   "typescript",
		StartLine:  int(node.StartPoint().Row) + 1,
		EndLine:    int(node.EndPoint().Row) + 1,
		Imports:    imports,
		Extends:    extends,
		Implements: implements,
		IsExported: isExported,
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

func (e *tsExtractor) extractCallSites(node *sitter.Node) []CallSite {
	var calls []CallSite
	e.walkForCalls(node, &calls)
	return calls
}

func (e *tsExtractor) walkForCalls(node *sitter.Node, calls *[]CallSite) {
	if node.Type() == "function_declaration" || node.Type() == "method_definition" || node.Type() == "arrow_function" {
		for i := 0; i < int(node.ChildCount()); i++ {
			child := node.Child(i)
			if child.Type() == "statement_block" || child.Type() == "arrow_function" {
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
			} else if callee.Type() == "member_expression" {
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

func (e *tsExtractor) extractExtends(node *sitter.Node) string {
	for i := 0; i < int(node.ChildCount()); i++ {
		child := node.Child(i)
		if child.Type() == "class_heritage" {
			for j := 0; j < int(child.ChildCount()); j++ {
				hc := child.Child(j)
				if hc.Type() == "extends_clause" {
					if hc.ChildCount() > 0 {
						return string(e.source[hc.Child(0).StartByte():hc.Child(0).EndByte()])
					}
				}
			}
		}
	}
	return ""
}

func (e *tsExtractor) extractImplements(node *sitter.Node) []string {
	var ifaces []string
	for i := 0; i < int(node.ChildCount()); i++ {
		child := node.Child(i)
		if child.Type() == "class_heritage" {
			for j := 0; j < int(child.ChildCount()); j++ {
				hc := child.Child(j)
				if hc.Type() == "implements_clause" {
					for k := 0; k < int(hc.ChildCount()); k++ {
						typeRef := hc.Child(k)
						if typeRef.Type() == "type_identifier" {
							ifaces = append(ifaces, string(e.source[typeRef.StartByte():typeRef.EndByte()]))
						}
					}
				}
			}
		}
	}
	return ifaces
}

func (e *tsExtractor) isExported(node *sitter.Node) bool {
	prev := node.PrevSibling()
	if prev != nil && prev.Type() == "export_statement" {
		return true
	}
	return false
}

func (e *tsExtractor) extractSignature(fullText string) string {
	idx := strings.Index(fullText, "{")
	if idx == -1 {
		return fullText
	}
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
