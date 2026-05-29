interface StreamingTextProps {
  text: string
}

export default function StreamingText({ text }: StreamingTextProps) {
  return (
    <span className="text-[15px] leading-[1.7] text-stone-700 dark:text-stone-300 font-[420]">
      {text}
      <span className="inline-flex items-center ml-0.5">
        <span className="w-[4px] h-[1em] bg-stone-400 dark:bg-stone-500 animate-pulse" />
      </span>
    </span>
  )
}
