from abc import ABC, abstractmethod

class EmbeddingModel(ABC):
    @abstractmethod
    def encode(self, texts: list[str]) -> list[list[float]]:
        ...

    @abstractmethod
    def dimension(self) -> int:
        ...

    @abstractmethod
    def name(self) -> str:
        ...
