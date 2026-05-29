import type { ChatMessage as ChatMessageType } from '../domain/types'
import StreamingText from './StreamingText'
import FormattedAnswer from './FormattedAnswer'

interface ChatMessageProps {
  message: ChatMessageType
}

function UserIcon() {
  return (
    <div className="w-7 h-7 rounded-lg bg-stone-800 dark:bg-stone-200 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all hover:scale-110">
      <svg className="w-4 h-4 text-white dark:text-stone-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
      </svg>
    </div>
  )
}

function AssistantIcon() {
  return (
    <div className="w-7 h-7 rounded-lg bg-stone-800 dark:bg-stone-200 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all hover:scale-110">
      <span className="text-[11px] font-bold text-white dark:text-stone-800">M</span>
    </div>
  )
}

export default function ChatMessage({ message }: ChatMessageProps) {
  return (
    <div className={`flex gap-3 px-1 ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
      {message.role === 'user' ? <UserIcon /> : <AssistantIcon />}
      <div className={`flex-1 min-w-0 ${message.role === 'user' ? 'text-right' : 'text-left'}`}>
        <p className={`text-[11px] font-medium mb-1.5 tracking-wide uppercase ${message.role === 'user' ? 'text-stone-400 dark:text-stone-500' : 'text-stone-500 dark:text-stone-400'}`}>
          {message.role === 'user' ? 'You' : 'Manthan'}
        </p>
        <div className={`${message.role === 'user' ? 'text-stone-700 dark:text-stone-200' : 'font-serif'}`}>
          {message.role === 'user' ? (
            <span className="inline-block px-4 py-2.5 rounded-2xl bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200 max-w-[80%] text-left text-[15px] leading-relaxed font-[450]">
              {message.content}
            </span>
          ) : message.isStreaming ? (
            <StreamingText text={message.content} />
          ) : (
            <FormattedAnswer text={message.content} citations={message.citations || []} />
          )}
        </div>
      </div>
    </div>
  )
}
