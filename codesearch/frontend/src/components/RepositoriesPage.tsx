interface RepositoriesPageProps {
  repos: string[]
  onAddRepo: () => void
  onSelectRepo: (repo: string) => void
}

export default function RepositoriesPage({ repos, onAddRepo, onSelectRepo }: RepositoriesPageProps) {
  return (
    <div className="w-full max-w-3xl xl:max-w-4xl mx-auto py-8 px-4 animate-slide-up">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-lg font-medium text-stone-700 dark:text-stone-200">
            Repositories
          </h1>
          <p className="text-sm text-stone-400 dark:text-stone-500 mt-0.5">
            {repos.length > 0
              ? `${repos.length} repositor${repos.length === 1 ? 'y' : 'ies'} indexed`
              : 'Add a repository to start exploring'}
          </p>
        </div>
        <button
          onClick={onAddRepo}
          className="flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-xl bg-stone-800 dark:bg-stone-100 text-white dark:text-stone-900 font-medium hover:bg-stone-700 dark:hover:bg-stone-200 transition-all active:scale-[0.97]"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add repo
        </button>
      </div>

      {repos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-200 dark:border-stone-800 p-12 text-center">
          <div className="w-10 h-10 rounded-xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center mx-auto mb-4">
            <svg className="w-5 h-5 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </div>
          <p className="text-sm text-stone-500 dark:text-stone-400 mb-1">No repositories indexed yet</p>
          <p className="text-xs text-stone-300 dark:text-stone-600 mb-5">Add a Git repository to start searching your codebase</p>
          <button
            onClick={onAddRepo}
            className="text-sm px-5 py-2 rounded-lg bg-stone-800 dark:bg-stone-100 text-white dark:text-stone-900 font-medium hover:bg-stone-700 dark:hover:bg-stone-200 transition-all"
          >
            Add your first repo
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {repos.map((repo, i) => (
            <button
              key={repo}
              onClick={() => onSelectRepo(repo)}
              className="flex flex-col gap-3 p-5 rounded-xl bg-white dark:bg-stone-850 border border-stone-150 dark:border-stone-750 hover:border-stone-300 dark:hover:border-stone-600 hover:shadow-sharp-md transition-all duration-150 text-left group active:scale-[0.98] animate-slide-up-sm"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-stone-100 dark:bg-stone-800 flex items-center justify-center flex-shrink-0 group-hover:bg-stone-200 dark:group-hover:bg-stone-700 transition-colors">
                  <svg className="w-4 h-4 text-stone-400 dark:text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 0 1-.657.643 48.39 48.39 0 0 1-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 0 1-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 0 0-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 0 1-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 0 0 .657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 0 1-.349-1.003c0-1.035 1.007-1.875 2.25-1.875s2.25.84 2.25 1.875c0 .369-.128.713-.349 1.003-.215.283-.401.604-.401.959v0c0 .333.277.599.61.58a48.1 48.1 0 0 0 5.427-.63 48.05 48.05 0 0 0 .582-4.717.532.532 0 0 0-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.37 0 .713.128 1.003.349.283.215.604.401.959.401v0a.656.656 0 0 0 .658-.663 48.422 48.422 0 0 0-.37-5.36c-1.886.342-3.81.574-5.766.689a.578.578 0 0 1-.61-.58v0Z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-stone-600 dark:text-stone-300 truncate">{repo}</p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-stone-300 dark:text-stone-600">Search this repo</span>
                <svg className="w-4 h-4 text-stone-300 dark:text-stone-600 group-hover:text-stone-400 dark:group-hover:text-stone-500 transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
