package domain

type ChangeType string

const (
	ChangeTypeAdded     ChangeType = "A"
	ChangeTypeModified  ChangeType = "M"
	ChangeTypeDeleted   ChangeType = "D"
)

type Job struct {
	FilePath   string     `json:"file_path"`
	ChangeType ChangeType `json:"change_type"`
	CommitSHA  string     `json:"commit_sha"`
}
