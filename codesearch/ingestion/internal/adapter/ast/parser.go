package ast

import (
	"path/filepath"
	"strings"

	sitter "github.com/smacker/go-tree-sitter"
	"github.com/smacker/go-tree-sitter/bash"
	"github.com/smacker/go-tree-sitter/c"
	"github.com/smacker/go-tree-sitter/cpp"
	"github.com/smacker/go-tree-sitter/css"
	"github.com/smacker/go-tree-sitter/dockerfile"
	"github.com/smacker/go-tree-sitter/golang"
	"github.com/smacker/go-tree-sitter/html"
	"github.com/smacker/go-tree-sitter/java"
	"github.com/smacker/go-tree-sitter/kotlin"
	"github.com/smacker/go-tree-sitter/lua"
	"github.com/smacker/go-tree-sitter/php"
	"github.com/smacker/go-tree-sitter/python"
	"github.com/smacker/go-tree-sitter/ruby"
	"github.com/smacker/go-tree-sitter/rust"
	"github.com/smacker/go-tree-sitter/scala"
	"github.com/smacker/go-tree-sitter/sql"
	"github.com/smacker/go-tree-sitter/swift"
	"github.com/smacker/go-tree-sitter/toml"
	"github.com/smacker/go-tree-sitter/typescript/tsx"
	"github.com/smacker/go-tree-sitter/yaml"
)

var languageMap = map[string]*sitter.Language{
	".go":    golang.GetLanguage(),
	".py":    python.GetLanguage(),
	".ts":    tsx.GetLanguage(),
	".tsx":   tsx.GetLanguage(),
	".js":    tsx.GetLanguage(),
	".jsx":   tsx.GetLanguage(),
	".java":  java.GetLanguage(),
	".rs":    rust.GetLanguage(),
	".c":     c.GetLanguage(),
	".h":     c.GetLanguage(),
	".cpp":   cpp.GetLanguage(),
	".cc":    cpp.GetLanguage(),
	".hpp":   cpp.GetLanguage(),
	".cs":    c.GetLanguage(),
	".rb":    ruby.GetLanguage(),
	".php":   php.GetLanguage(),
	".swift": swift.GetLanguage(),
	".kt":    kotlin.GetLanguage(),
	".kts":   kotlin.GetLanguage(),
	".scala": scala.GetLanguage(),
	".sh":    bash.GetLanguage(),
	".bash":  bash.GetLanguage(),
	".sql":   sql.GetLanguage(),
	".html":  html.GetLanguage(),
	".htm":   html.GetLanguage(),
	".css":   css.GetLanguage(),
	".scss":  css.GetLanguage(),
	".less":  css.GetLanguage(),
	".yaml":  yaml.GetLanguage(),
	".yml":   yaml.GetLanguage(),
	".toml":  toml.GetLanguage(),
	".json":  nil,
	".lua":   lua.GetLanguage(),
	".dockerfile": dockerfile.GetLanguage(),
	"Dockerfile":  dockerfile.GetLanguage(),
}

var treeSitterExts = map[string]bool{
	".go": true, ".py": true, ".ts": true, ".tsx": true, ".js": true, ".jsx": true,
	".java": true, ".rs": true, ".c": true, ".h": true, ".cpp": true, ".cc": true, ".hpp": true,
	".rb": true, ".php": true, ".swift": true, ".kt": true, ".kts": true, ".scala": true,
	".sh": true, ".bash": true, ".sql": true, ".html": true, ".htm": true,
	".css": true, ".scss": true, ".less": true,
	".yaml": true, ".yml": true, ".toml": true,
	".lua": true, ".dockerfile": true,
}

type Extractor interface {
	extract(root *sitter.Node) []Chunk
}

func Parse(filePath string, content []byte) ([]Chunk, error) {
	ext := strings.ToLower(filepath.Ext(filePath))
	baseName := filepath.Base(filePath)
	if baseName == "Dockerfile" {
		ext = ".dockerfile"
	}

	lang, hasGrammar := languageMap[ext]
	if lang == nil && !hasGrammar {
		return fallbackExtract(filePath, content), nil
	}

	if lang == nil {
		return fallbackExtract(filePath, content), nil
	}

	parser := sitter.NewParser()
	parser.SetLanguage(lang)
	tree := parser.Parse(nil, content)
	defer tree.Close()

	var extractor Extractor
	switch {
	case ext == ".go":
		extractor = &goExtractor{filePath: filePath, source: content}
	case ext == ".py":
		extractor = &pyExtractor{filePath: filePath, source: content}
	case ext == ".ts" || ext == ".tsx" || ext == ".js" || ext == ".jsx":
		extractor = &tsExtractor{filePath: filePath, source: content}
	case treeSitterExts[ext]:
		extractor = &genericExtractor{filePath: filePath, source: content, ext: ext}
	default:
		return fallbackExtract(filePath, content), nil
	}

	chunks := extractor.extract(tree.RootNode())
	for i := range chunks {
		chunks[i].Language = langName(ext)
	}
	return chunks, nil
}

func langName(ext string) string {
	names := map[string]string{
		".go": "go", ".py": "python", ".ts": "typescript", ".tsx": "typescript",
		".js": "javascript", ".jsx": "jsx", ".java": "java", ".rs": "rust",
		".c": "c", ".h": "c", ".cpp": "cpp", ".cc": "cpp", ".hpp": "cpp",
		".rb": "ruby", ".php": "php", ".swift": "swift", ".kt": "kotlin",
		".kts": "kotlin", ".scala": "scala", ".sh": "bash", ".bash": "bash",
		".sql": "sql", ".html": "html", ".htm": "html", ".css": "css",
		".scss": "css", ".less": "css", ".yaml": "yaml", ".yml": "yaml",
		".toml": "toml", ".lua": "lua", ".dockerfile": "dockerfile",
	}
	if n, ok := names[ext]; ok {
		return n
	}
	return strings.TrimPrefix(ext, ".")
}
