"""RAGAS evaluation runner.
Usage: python evaluate.py
"""
import json
from datasets import Dataset
from ragas import evaluate
from ragas.metrics import (
    faithfulness,
    context_precision,
    answer_relevancy,
)

def run_ragas_eval():
    with open('eval/test_queries.json') as f:
        queries = json.load(f)

    data = {
        'question': [q['query'] for q in queries],
        'answer': [''] * len(queries),
        'contexts': [['']] * len(queries),
    }

    dataset = Dataset.from_dict(data)
    result = evaluate(dataset, metrics=[faithfulness, context_precision, answer_relevancy])
    print(result)

if __name__ == '__main__':
    run_ragas_eval()
