package domain

import "fmt"

type ErrUnsupportedLanguage struct {
	FilePath string
}

func (e *ErrUnsupportedLanguage) Error() string {
	return fmt.Sprintf("unsupported language: %s", e.FilePath)
}

type ErrEmbeddingFailed struct {
	Source error
}

func (e *ErrEmbeddingFailed) Error() string {
	return fmt.Sprintf("embedding failed: %v", e.Source)
}

func (e *ErrEmbeddingFailed) Unwrap() error {
	return e.Source
}
