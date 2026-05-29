import type { SearchState } from './types'

export const SEARCH_STATES = {
  IDLE: 'idle' as SearchState,
  LOADING: 'loading' as SearchState,
  STREAMING: 'streaming' as SearchState,
  DONE: 'done' as SearchState,
  ERROR: 'error' as SearchState,
}
