package ast

import (
	"path/filepath"
	"strings"

	sitter "github.com/smacker/go-tree-sitter"
	"github.com/smacker/go-tree-sitter/golang"
	"github.com/smacker/go-tree-sitter/python"
	"github.com/smacker/go-tree-sitter/typescript/tsx"
)

var languageMap = map[string]*sitter.Language{
	".go":  golang.GetLanguage(),
	".py":  python.GetLanguage(),
	".ts":  tsx.GetLanguage(),
	".tsx": tsx.GetLanguage(),
	".js":  tsx.GetLanguage(),
	".jsx": tsx.GetLanguage(),
}

type Extractor interface {
	extract(root *sitter.Node) []Chunk
}

func Parse(filePath string, content []byte) ([]Chunk, error) {
	ext := strings.ToLower(filepath.Ext(filePath))
	lang, ok := languageMap[ext]
	if !ok {
		return nil, nil
	}

	parser := sitter.NewParser()
	parser.SetLanguage(lang)
	tree := parser.Parse(nil, content)
	defer tree.Close()

	var extractor Extractor
	switch ext {
	case ".go":
		extractor = &goExtractor{filePath: filePath, source: content}
	case ".py":
		extractor = &pyExtractor{filePath: filePath, source: content}
	case ".ts", ".tsx", ".js", ".jsx":
		extractor = &tsExtractor{filePath: filePath, source: content}
	default:
		return nil, nil
	}

	chunks := extractor.extract(tree.RootNode())
	for i := range chunks {
		chunks[i].Language = strings.TrimPrefix(ext, ".")
	}
	return chunks, nil
}
