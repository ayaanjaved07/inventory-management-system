import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Bot, Send, User as UserIcon, Wrench } from 'lucide-react'

import { api, apiError } from '@/lib/api'
import type { AgentInfo, ChatReply, ChatTurn } from '@/lib/types'
import { Button, Card, ErrorNote, Input, Spinner } from '@/components/ui'

export default function Assistant() {
  const { t } = useTranslation()
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  const info = useQuery({
    queryKey: ['agent-info'],
    queryFn: async () => (await api.get<AgentInfo>('/agent/chat/')).data,
  })

  const ask = useMutation({
    mutationFn: async (message: string) => {
      // History is sent from here rather than kept server-side: there is no
      // conversation table, and the backend caps what it replays anyway.
      const { data } = await api.post<ChatReply>('/agent/chat/', {
        message,
        history: turns.map((turn) => ({ role: turn.role, text: turn.text })),
      })
      return data
    },
    onSuccess: (data) => {
      setTurns((current) => [
        ...current,
        { role: 'assistant', text: data.reply, tools: data.tool_calls },
      ])
      setError('')
    },
    onError: (err) => setError(apiError(err)),
  })

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns, ask.isPending])

  const send = (message: string) => {
    const text = message.trim()
    if (!text || ask.isPending) return
    setTurns((current) => [...current, { role: 'user', text }])
    setDraft('')
    ask.mutate(text)
  }

  const available = info.data?.available ?? false

  return (
    <div className="space-y-5">
      {info.isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-7 w-7" />
        </div>
      ) : !available ? (
        /* No key configured. The app is designed to run without the assistant,
           so this is an explanation rather than an error. */
        <Card className="p-8 text-center">
          <Bot className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-900">
            {t('assistant.unavailable')}
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            {t('assistant.unavailableHint')}
          </p>
        </Card>
      ) : (
        <>
          <Card className="flex h-[28rem] flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {turns.length === 0 && (
                <div className="py-6 text-center">
                  <Bot className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-3 text-sm text-slate-500">{t('assistant.empty')}</p>
                </div>
              )}

              {turns.map((turn, index) => (
                <div key={index} className="flex gap-3">
                  <div
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                      turn.role === 'user'
                        ? 'bg-slate-100 text-slate-600'
                        : 'bg-teal-50 text-teal-700'
                    }`}
                  >
                    {turn.role === 'user' ? (
                      <UserIcon className="h-4 w-4" />
                    ) : (
                      <Bot className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-pre-wrap text-sm text-slate-800">{turn.text}</p>
                    {/* Which tools the answer came from. An assistant over live
                        business data should not be a black box. */}
                    {turn.tools && turn.tools.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Wrench className="h-3 w-3 text-slate-400" />
                        {turn.tools.map((call, i) => (
                          <span
                            key={i}
                            className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-500"
                          >
                            {call.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {ask.isPending && (
                <div className="flex gap-3">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700">
                    <Bot className="h-4 w-4" />
                  </div>
                  <Spinner className="mt-1 h-4 w-4" />
                </div>
              )}
              <div ref={endRef} />
            </div>

            <form
              className="flex gap-2 border-t border-slate-200 p-3"
              onSubmit={(e) => {
                e.preventDefault()
                send(draft)
              }}
            >
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t('assistant.placeholder')}
                aria-label={t('assistant.placeholder')}
              />
              <Button type="submit" disabled={ask.isPending || !draft.trim()}>
                <Send className="h-4 w-4" />
                <span className="sr-only">{t('assistant.send')}</span>
              </Button>
            </form>
          </Card>

          {error && <ErrorNote message={error} />}
        </>
      )}
    </div>
  )
}
