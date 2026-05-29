package store

import (
	"context"
	"encoding/json"
	"math"
	"os"
	"sort"
	"strings"

	"github.com/cvlikhith/codesearch/ingestion/internal/domain"
)

type bm25Doc struct {
	Tokens []string
	Chunk  domain.Chunk
}

type bm25Persisted struct {
	Corpus [][]string      `json:"corpus"`
	Chunks []domain.Chunk  `json:"chunks"`
}

type BM25Store struct {
	indexPath string
	docs      []bm25Doc
	avgDocLen float64
	k1        float64
	b         float64
}

func NewBM25(indexPath string) *BM25Store {
	s := &BM25Store{
		indexPath: indexPath,
		k1:        1.5,
		b:         0.75,
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
	for i, tokens := range p.Corpus {
		b.docs = append(b.docs, bm25Doc{Tokens: tokens, Chunk: p.Chunks[i]})
	}
	b.recalcAvgDocLen()
}

func (b *BM25Store) recalcAvgDocLen() {
	if len(b.docs) == 0 {
		b.avgDocLen = 0
		return
	}
	var total float64
	for _, d := range b.docs {
		total += float64(len(d.Tokens))
	}
	b.avgDocLen = total / float64(len(b.docs))
}

func (b *BM25Store) Add(ctx context.Context, chunks []domain.Chunk) error {
	for _, c := range chunks {
		b.docs = append(b.docs, bm25Doc{Tokens: tokenize(c.Content), Chunk: c})
	}
	b.recalcAvgDocLen()
	return nil
}

func (b *BM25Store) Remove(ctx context.Context, filePath string) error {
	filtered := make([]bm25Doc, 0, len(b.docs))
	for _, d := range b.docs {
		if d.Chunk.FilePath != filePath {
			filtered = append(filtered, d)
		}
	}
	b.docs = filtered
	b.recalcAvgDocLen()
	return nil
}

func (b *BM25Store) Persist() error {
	if len(b.docs) == 0 {
		return nil
	}
	p := bm25Persisted{
		Corpus: make([][]string, len(b.docs)),
		Chunks: make([]domain.Chunk, len(b.docs)),
	}
	for i, d := range b.docs {
		p.Corpus[i] = d.Tokens
		p.Chunks[i] = d.Chunk
	}
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
	if len(qTokens) == 0 {
		return nil
	}

	n := float64(len(b.docs))
	idfCache := make(map[string]float64)
	for _, t := range qTokens {
		if _, ok := idfCache[t]; ok {
			continue
		}
		var df float64
		for _, d := range b.docs {
			for _, dt := range d.Tokens {
				if dt == t {
					df++
					break
				}
			}
		}
		idfCache[t] = math.Log(1 + (n-df+0.5)/(df+0.5))
	}

	type scored struct {
		idx   int
		score float64
	}
	scores := make([]scored, 0, len(b.docs))
	for i, d := range b.docs {
		docLen := float64(len(d.Tokens))
		var s float64
		for _, qt := range qTokens {
			var tf float64
			for _, dt := range d.Tokens {
				if dt == qt {
					tf++
				}
			}
			if tf == 0 {
				continue
			}
			idf := idfCache[qt]
			s += idf * (tf * (b.k1 + 1)) / (tf + b.k1*(1-b.b+b.b*docLen/b.avgDocLen))
		}
		if s > 0 {
			scores = append(scores, scored{idx: i, score: s})
		}
	}

	sort.Slice(scores, func(i, j int) bool {
		return scores[i].score > scores[j].score
	})

	if k > len(scores) {
		k = len(scores)
	}
	results := make([]domain.Chunk, k)
	for i := 0; i < k; i++ {
		results[i] = b.docs[scores[i].idx].Chunk
	}
	return results
}
