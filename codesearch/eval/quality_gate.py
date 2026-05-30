"""Quality gate runner for retrieval accuracy slices.
Usage: python eval/quality_gate.py
"""
import asyncio
from benchmark import run_benchmark

BASELINE = {
    'mrr': 0.15,
    'recall@5': 0.20,
}


async def main():
    print('Running main benchmark slice...')
    main_res = await run_benchmark('eval/test_queries.json')
    print('\nRunning service-explanation slice...')
    svc_res = await run_benchmark('eval/service_explanation_queries.json')

    def avg(res, key):
        vals = res.get(key, [])
        return (sum(vals) / len(vals)) if vals else 0.0

    main_mrr = avg(main_res, 'mrr')
    main_r5 = avg(main_res, 'recall@5')
    svc_mrr = avg(svc_res, 'mrr')
    svc_r5 = avg(svc_res, 'recall@5')

    print('\n=== QUALITY GATE SUMMARY ===')
    print(f'Main MRR: {main_mrr:.3f} (>= {BASELINE["mrr"]:.3f})')
    print(f'Main Recall@5: {main_r5:.3f} (>= {BASELINE["recall@5"]:.3f})')
    print(f'Service MRR: {svc_mrr:.3f}')
    print(f'Service Recall@5: {svc_r5:.3f}')

    failed = []
    if main_mrr < BASELINE['mrr']:
        failed.append('main_mrr')
    if main_r5 < BASELINE['recall@5']:
        failed.append('main_recall@5')

    if failed:
        print(f'QUALITY GATE FAILED: {", ".join(failed)}')
        raise SystemExit(1)

    print('QUALITY GATE PASSED')


if __name__ == '__main__':
    asyncio.run(main())
