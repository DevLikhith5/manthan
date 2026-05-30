package ast

type CallSite struct {
	Name      string // function/method name being called
	Qualifier string // receiver/qualifier (e.g., "client" in client.Do())
	Line      int    // line number of the call
}

type Decorator struct {
	Name      string   // decorator name
	Module    string   // import module path
	Arguments []string // decorator arguments
}

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

	Calls      []CallSite
	Extends    string
	Implements []string
	Decorators []Decorator
	IsExported bool
	Package    string
}
