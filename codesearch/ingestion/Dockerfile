FROM golang:1.25-alpine AS builder

RUN apk add --no-cache gcc musl-dev

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=1 go build -o /indexer ./cmd/indexer

FROM alpine:3.19

RUN apk add --no-cache git

COPY --from=builder /indexer /usr/local/bin/indexer

ENTRYPOINT ["indexer"]
