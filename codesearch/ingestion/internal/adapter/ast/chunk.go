package ast

type Chunk struct {
	Content     string
	Signature   string
	Docstring   string
	EmbedText   string
	Name        string
	Kind        string
	ParentClass string
	FilePath    string
	Language    string
	StartLine   int
	EndLine     int
	Imports     []string
}
