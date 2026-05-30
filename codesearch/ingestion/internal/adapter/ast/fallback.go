package ast

import (
	"path/filepath"
	"strings"
)

var skipExtensions = map[string]bool{
	".png": true, ".jpg": true, ".jpeg": true, ".gif": true, ".webp": true,
	".ico": true, ".svg": true, ".bmp": true, ".tiff": true,
	".mp3": true, ".mp4": true, ".wav": true, ".avi": true, ".mov": true,
	".zip": true, ".tar": true, ".gz": true, ".rar": true, ".7z": true,
	".pdf": true, ".doc": true, ".docx": true, ".xls": true, ".xlsx": true,
	".woff": true, ".woff2": true, ".ttf": true, ".eot": true,
	".exe": true, ".so": true, ".dylib": true, ".dll": true,
	".DS_Store": true, ".lock": true, ".min.js": true, ".min.css": true,
	".map": true, ".wasm": true, ".pickle": true, ".pkl": true,
}

func isBinaryFile(content []byte) bool {
	if len(content) == 0 {
		return true
	}
	checkLen := len(content)
	if checkLen > 8192 {
		checkLen = 8192
	}
	nulls := 0
	for i := 0; i < checkLen; i++ {
		if content[i] == 0 {
			nulls++
		}
	}
	return nulls > 0 || float64(nulls)/float64(checkLen) > 0.1
}

func fallbackExtract(filePath string, content []byte) []Chunk {
	ext := strings.ToLower(filepath.Ext(filePath))
	baseName := filepath.Base(filePath)
	if skipExtensions[ext] || skipExtensions[baseName] {
		return nil
	}
	if isBinaryFile(content) {
		return nil
	}

	text := string(content)
	if len(strings.TrimSpace(text)) == 0 {
		return nil
	}

	name := filePath
	if idx := strings.LastIndex(name, "/"); idx >= 0 {
		name = name[idx+1:]
	}

	lines := strings.Split(text, "\n")
	totalLines := len(lines)

	const maxChunkLines = 200
	if totalLines <= maxChunkLines {
		return []Chunk{{
			Content:   text,
			EmbedText: "file: " + name + "\nbody: " + firstNLines(text, 3),
			Signature: name,
			Name:      name,
			Kind:      "file",
			FilePath:  filePath,
			StartLine: 1,
			EndLine:   totalLines,
		}}
	}

	var chunks []Chunk
	start := 0
	chunkIdx := 0
	for start < totalLines {
		end := start + maxChunkLines
		if end > totalLines {
			end = totalLines
		}
		chunkText := strings.Join(lines[start:end], "\n")
		chunkName := name
		chunkIdx++
		chunks = append(chunks, Chunk{
			Content:   chunkText,
			EmbedText: "file: " + chunkName + "\nbody: " + firstNLines(chunkText, 3),
			Signature: chunkName,
			Name:      chunkName,
			Kind:      "file",
			FilePath:  filePath,
			StartLine: start + 1,
			EndLine:   end,
		})
		start = end
	}
	return chunks
}

func firstNLines(text string, n int) string {
	lines := strings.SplitN(text, "\n", n+1)
	if len(lines) > n {
		return strings.Join(lines[:n], " ")
	}
	return strings.Join(lines, " ")
}
