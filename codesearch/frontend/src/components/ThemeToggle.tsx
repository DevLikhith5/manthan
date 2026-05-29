import { useEffect, useState } from 'react'
import { SunIcon, MoonIcon } from './Icons'

export default function ThemeToggle() {
  const [dark, setDark] = useState(true)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  return (
    <button
      onClick={() => setDark(!dark)}
      className="p-1.5 rounded-md hover:bg-stone-100 dark:hover:bg-stone-800 transition-all duration-150 active:scale-85 text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300"
      aria-label="Toggle theme"
    >
      {dark ? (
        <SunIcon className="w-3.5 h-3.5" />
      ) : (
        <MoonIcon className="w-3.5 h-3.5" />
      )}
    </button>
  )
}
