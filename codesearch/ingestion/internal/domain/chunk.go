package domain

type CallSite struct {
	Name      string
	Qualifier string
	Line      int
}

type Decorator struct {
	Name      string
	Module    string
	Arguments []string
}

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

	Calls      []CallSite
	Extends    string
	Implements []string
	Decorators []Decorator
	IsExported bool
	Package    string
}
