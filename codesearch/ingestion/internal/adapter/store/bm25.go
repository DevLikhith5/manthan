package store

import (
	"context"
	"encoding/json"
	"math"
	"os"
	"sort"
	"strings"
	"sync"

	"github.com/cvlikhith/codesearch/ingestion/internal/domain"
)

type bm25Doc struct {
	Tokens []string
	Chunk  domain.Chunk
}

type bm25Persisted struct {
	Docs []bm25Doc `json:"docs"`
}

type bm25ApiFormat struct {
	Corpus [][]string    `json:"corpus"`
	Chunks []domain.Chunk `json:"chunks"`
}

type posting struct {
	DocID int
	TF    int
}

type BM25Store struct {
	indexPath string
	docs      []bm25Doc
	avgDocLen float64
	k1        float64
	b         float64

	inverted map[string][]posting
	docLen   []int
	totalLen float64
	dirty    bool
	mu       sync.Mutex
}

func NewBM25(indexPath string) *BM25Store {
	s := &BM25Store{
		indexPath: indexPath,
		k1:        1.5,
		b:         0.75,
		inverted:  map[string][]posting{},
	}
	s.load()
	return s
}

func tokenize(text string) []string {
	raw := strings.Fields(strings.ToLower(text))
	tokens := make([]string, 0, len(raw))
	for _, t := range raw {
		t = strings.Trim(t, ".,;:!?\"'()[]{}/\\<>|=+-_*&^%$#@~`")
		if t != "" {
			tokens = append(tokens, t)
		}
	}
	return tokens
}

func (b *BM25Store) load() {
	data, err := os.ReadFile(b.indexPath)
	if err != nil {
		return
	}
	var p bm25Persisted
	if err := json.Unmarshal(data, &p); err != nil {
		return
	}
	b.docs = p.Docs
	b.rebuildIndex()
}

func (b *BM25Store) rebuildIndex() {
	b.inverted = map[string][]posting{}
	b.docLen = make([]int, len(b.docs))
	var total float64
	for i, d := range b.docs {
		b.docLen[i] = len(d.Tokens)
		total += float64(len(d.Tokens))
		tf := map[string]int{}
		for _, tok := range d.Tokens {
			tf[tok]++
		}
		for term, cnt := range tf {
			b.inverted[term] = append(b.inverted[term], posting{DocID: i, TF: cnt})
		}
	}
	b.totalLen = total
	if len(b.docs) == 0 {
		b.avgDocLen = 0
	} else {
		b.avgDocLen = total / float64(len(b.docs))
	}
	b.dirty = false
}

func (b *BM25Store) addDocsIncremental(docs []bm25Doc) {
	baseID := len(b.docs)
	for _, d := range docs {
		docID := len(b.docs)
		b.docs = append(b.docs, d)
		b.docLen = append(b.docLen, len(d.Tokens))
		b.totalLen += float64(len(d.Tokens))
		tf := map[string]int{}
		for _, tok := range d.Tokens {
			tf[tok]++
		}
		_ = docID
		_ = baseID
		for term, cnt := range tf {
			b.inverted[term] = append(b.inverted[term], posting{DocID: len(b.docs) - 1, TF: cnt})
		}
	}
	if len(b.docs) > 0 {
		b.avgDocLen = b.totalLen / float64(len(b.docs))
	}
	b.dirty = true
}

func (b *BM25Store) Add(ctx context.Context, chunks []domain.Chunk) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	docs := make([]bm25Doc, len(chunks))
	for i, c := range chunks {
		docs[i] = bm25Doc{Tokens: tokenize(c.Content), Chunk: c}
	}
	b.addDocsIncremental(docs)
	return nil
}

func (b *BM25Store) Remove(ctx context.Context, filePath string) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	filtered := make([]bm25Doc, 0, len(b.docs))
	for _, d := range b.docs {
		if d.Chunk.FilePath != filePath {
			filtered = append(filtered, d)
		}
	}
	b.docs = filtered
	b.rebuildIndex()
	return nil
}

func (b *BM25Store) Persist() error {
	b.mu.Lock()
	defer b.mu.Unlock()
	p := bm25Persisted{Docs: b.docs}
	data, err := json.Marshal(p)
	if err != nil {
		return err
	}
	return os.WriteFile(b.indexPath, data, 0644)
}

func (b *BM25Store) Search(query string, k int) []domain.Chunk {
	if len(b.docs) == 0 || query == "" {
		return nil
	}
	qTokens := tokenize(query)
	if len(qTokens) == 0 || b.avgDocLen == 0 {
		return nil
	}

	n := float64(len(b.docs))
	scoreByDoc := map[int]float64{}
	seenQueryTerms := map[string]struct{}{}

	for _, term := range qTokens {
		if _, ok := seenQueryTerms[term]; ok {
			continue
		}
		seenQueryTerms[term] = struct{}{}
		postings := b.inverted[term]
		if len(postings) == 0 {
			continue
		}
		df := float64(len(postings))
		idf := math.Log(1 + (n-df+0.5)/(df+0.5))
		for _, p := range postings {
			docLen := float64(b.docLen[p.DocID])
			tf := float64(p.TF)
			scoreByDoc[p.DocID] += idf * (tf * (b.k1 + 1)) / (tf + b.k1*(1-b.b+b.b*docLen/b.avgDocLen))
		}
	}

	type scored struct {
		docID  int
		score float64
	}
	ranked := make([]scored, 0, len(scoreByDoc))
	for docID, score := range scoreByDoc {
		if score > 0 {
			ranked = append(ranked, scored{docID: docID, score: score})
		}
	}
	sort.Slice(ranked, func(i, j int) bool { return ranked[i].score > ranked[j].score })
	if k > len(ranked) {
		k = len(ranked)
	}
	out := make([]domain.Chunk, k)
	for i := 0; i < k; i++ {
		out[i] = b.docs[ranked[i].docID].Chunk
	}
	return out
}
