package chunker

import (
	"github.com/cvlikhith/codesearch/ingestion/internal/adapter/ast"
)

type Metadata struct {
	FilePath    string
	Language    string
	Imports     []string
	HasReturns  bool
	HasAsync    bool
	HasError    bool
}

func ExtractMetadata(chunk ast.Chunk) Metadata {
	return Metadata{
		FilePath: chunk.FilePath,
		Language: chunk.Language,
		Imports:  chunk.Imports,
	}
}
