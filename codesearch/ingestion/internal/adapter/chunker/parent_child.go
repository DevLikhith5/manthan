package chunker

import (
	"crypto/sha1"
	"fmt"
	"strings"

	"github.com/cvlikhith/codesearch/ingestion/internal/adapter/ast"
)

type ParentChildPair struct {
	Child ast.Chunk
	Parent ast.Chunk
}

func ChunkID(filePath, name string) string {
	h := sha1.Sum([]byte(filePath + "::" + name))
	hex := fmt.Sprintf("%x", h)
	// UUID format: 8-4-4-4-12 (32 hex chars + hyphens)
	return fmt.Sprintf("%s-%s-%s-%s-%s", hex[:8], hex[8:12], hex[12:16], hex[16:20], hex[20:32])
}

func SplitIntoPairs(chunks []ast.Chunk) []ParentChildPair {
	pairs := make([]ParentChildPair, 0, len(chunks))
	for _, c := range chunks {
		// Child: what we embed (signature + docstring)
		childText := c.EmbedText
		if childText == "" {
			childText = c.Signature
		}

		// Parent: what we return to the LLM (full function body)
		parentText := c.Content
		if parentText == "" {
			parentText = c.Signature
		}

		childChunk := c
		childChunk.EmbedText = childText

		parentChunk := c
		parentChunk.Content = parentText
		parentChunk.EmbedText = "" // parent is never embedded

		pairs = append(pairs, ParentChildPair{Child: childChunk, Parent: parentChunk})
	}
	return pairs
}

func BuildEmbedText(chunk ast.Chunk) string {
	parts := []string{}
	switch chunk.Kind {
	case "function", "method":
		parts = append(parts, fmt.Sprintf("func: %s", chunk.Name))
		parts = append(parts, fmt.Sprintf("signature: %s", chunk.Signature))
	case "class", "struct":
		parts = append(parts, fmt.Sprintf("%s: %s", chunk.Kind, chunk.Name))
	default:
		parts = append(parts, fmt.Sprintf("%s: %s", chunk.Kind, chunk.Name))
		parts = append(parts, fmt.Sprintf("signature: %s", chunk.Signature))
	}
	if chunk.Docstring != "" {
		parts = append(parts, fmt.Sprintf("docs: %s", stripDocstring(chunk.Docstring)))
	}
	if chunk.ParentClass != "" {
		parts = append(parts, fmt.Sprintf("class: %s", chunk.ParentClass))
	}
	return strings.Join(parts, "\n")
}

func stripDocstring(doc string) string {
	doc = strings.TrimSpace(doc)
	doc = strings.TrimPrefix(doc, "\"\"\"")
	doc = strings.TrimPrefix(doc, "'''")
	doc = strings.TrimSuffix(doc, "\"\"\"")
	doc = strings.TrimSuffix(doc, "'''")
	doc = strings.TrimPrefix(doc, "/*")
	doc = strings.TrimSuffix(doc, "*/")
	doc = strings.TrimPrefix(doc, "//")
	doc = strings.TrimPrefix(doc, "#")
	return strings.TrimSpace(doc)
}
