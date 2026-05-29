package store

import (
	"context"
	"fmt"

	pb "github.com/qdrant/go-client/qdrant"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	"github.com/cvlikhith/codesearch/ingestion/internal/domain"
)

const collectionName = "codebase"

type QdrantStore struct {
	client pb.PointsClient
	coll   pb.CollectionsClient
}

func NewQdrant(url string) (*QdrantStore, error) {
	conn, err := grpc.NewClient(url, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, fmt.Errorf("grpc dial: %w", err)
	}
	return &QdrantStore{
		client: pb.NewPointsClient(conn),
		coll:   pb.NewCollectionsClient(conn),
	}, nil
}

func (q *QdrantStore) EnsureCollection(ctx context.Context, dim int) error {
	_, err := q.coll.Get(ctx, &pb.GetCollectionInfoRequest{CollectionName: collectionName})
	if err == nil {
		return nil
	}

	quantile := float32(0.99)
	alwaysRam := true

	_, err = q.coll.Create(ctx, &pb.CreateCollection{
		CollectionName: collectionName,
		VectorsConfig: &pb.VectorsConfig{
			Config: &pb.VectorsConfig_ParamsMap{
				ParamsMap: &pb.VectorParamsMap{
					Map: map[string]*pb.VectorParams{
						"code": {
							Size:     uint64(dim),
							Distance: pb.Distance_Cosine,
						},
						"docstring": {
							Size:     uint64(dim),
							Distance: pb.Distance_Cosine,
						},
					},
				},
			},
		},
		QuantizationConfig: &pb.QuantizationConfig{
			Quantization: &pb.QuantizationConfig_Scalar{
				Scalar: &pb.ScalarQuantization{
					Type:      pb.QuantizationType_Int8,
					Quantile:  &quantile,
					AlwaysRam: &alwaysRam,
				},
			},
		},
	})
	return err
}

func (q *QdrantStore) Upsert(ctx context.Context, chunks []domain.Chunk) error {
	points := make([]*pb.PointStruct, len(chunks))
	for i, c := range chunks {
		if c.CodeVec == nil {
			c.CodeVec = []float32{}
		}
		if c.DocVec == nil {
			c.DocVec = []float32{}
		}

		points[i] = &pb.PointStruct{
			Id: &pb.PointId{
				PointIdOptions: &pb.PointId_Uuid{Uuid: c.ID},
			},
			Vectors: &pb.Vectors{
				VectorsOptions: &pb.Vectors_Vectors{
					Vectors: &pb.NamedVectors{
						Vectors: map[string]*pb.Vector{
							"code":      {Data: c.CodeVec},
							"docstring": {Data: c.DocVec},
						},
					},
				},
			},
			Payload: map[string]*pb.Value{
				"file_path":     {Kind: &pb.Value_StringValue{StringValue: c.FilePath}},
				"function_name": {Kind: &pb.Value_StringValue{StringValue: c.Name}},
				"kind":          {Kind: &pb.Value_StringValue{StringValue: c.Kind}},
				"language":      {Kind: &pb.Value_StringValue{StringValue: c.Language}},
				"content":       {Kind: &pb.Value_StringValue{StringValue: c.Content}},
				"signature":     {Kind: &pb.Value_StringValue{StringValue: c.Signature}},
				"start_line":    {Kind: &pb.Value_IntegerValue{IntegerValue: int64(c.StartLine)}},
				"end_line":      {Kind: &pb.Value_IntegerValue{IntegerValue: int64(c.EndLine)}},
				"parent_class":  {Kind: &pb.Value_StringValue{StringValue: c.ParentClass}},
				"repo":          {Kind: &pb.Value_StringValue{StringValue: c.Repo}},
			},
		}
	}

	wait := true
	_, err := q.client.Upsert(ctx, &pb.UpsertPoints{
		CollectionName: collectionName,
		Points:         points,
		Wait:           &wait,
	})
	return err
}

func (q *QdrantStore) Delete(ctx context.Context, filePath string) error {
	_, err := q.client.Delete(ctx, &pb.DeletePoints{
		CollectionName: collectionName,
		Points: &pb.PointsSelector{
			PointsSelectorOneOf: &pb.PointsSelector_Filter{
				Filter: &pb.Filter{
					Must: []*pb.Condition{
						{
							ConditionOneOf: &pb.Condition_Field{
								Field: &pb.FieldCondition{
									Key: "file_path",
									Match: &pb.Match{
										MatchValue: &pb.Match_Keyword{
											Keyword: filePath,
										},
									},
								},
							},
						},
					},
				},
			},
		},
		Wait: func() *bool { v := true; return &v }(),
	})
	return err
}
