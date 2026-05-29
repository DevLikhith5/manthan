package domain

type Chunk struct {
	ID          string
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
	Repo        string
	CodeVec     []float32
	DocVec      []float32
}
