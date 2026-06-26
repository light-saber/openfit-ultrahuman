import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  AssistantRuntimeProvider,
  AuiIf,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAssistantRuntime,
  useLocalRuntime,
  type ChatModelAdapter,
  type ThreadMessage,
} from '@assistant-ui/react'
import { ArrowDown, ArrowUp, Plus, Settings2, Sparkles, Square, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { normalizeFitbitData } from '@/data/normalize'
import {
  buildHealthAssistantContext,
  parseAssistantNavigation,
  stripAssistantNavigation,
  visibleAssistantText,
  type AssistantNavigation,
} from '@/lib/health-assistant'
import type {
  DashboardData,
  HealthAssistantEvent,
  HealthAssistantStatus,
  PageId,
  RawHealthArchive,
} from '@/types'

const unavailableStatus: HealthAssistantStatus = {
  available: false,
  connected: false,
  authenticated: false,
  configured: false,
  version: null,
}

const DEFAULT_MINIMAX_MODEL = 'MiniMax-Text-01'

function messageText(message: ThreadMessage | undefined) {
  if (!message) return ''
  return message.content
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim()
}

function archiveData(archive: RawHealthArchive | null | undefined) {
  if (!archive) return []
  return Object.values(archive.days)
    .map((payload) => normalizeFitbitData(payload))
    .sort((left, right) => left.selectedDate.localeCompare(right.selectedDate))
}

function statusLabel(status: HealthAssistantStatus, hasBridge: boolean) {
  if (!hasBridge) return 'Desktop only'
  if (!status.configured) return 'Add MiniMax key'
  if (!status.authenticated) return 'Check MiniMax key'
  return status.connected ? 'MiniMax connected' : 'MiniMax ready'
}

function createQueue() {
  const events: HealthAssistantEvent[] = []
  let wake: ((event: HealthAssistantEvent) => void) | null = null

  return {
    push(event: HealthAssistantEvent) {
      if (wake) {
        const resolve = wake
        wake = null
        resolve(event)
      } else {
        events.push(event)
      }
    },
    next() {
      const event = events.shift()
      if (event) return Promise.resolve(event)
      return new Promise<HealthAssistantEvent>((resolve) => { wake = resolve })
    },
  }
}

export function HealthAssistant({
  open,
  data,
  page,
  onOpenChange,
  onNavigate,
}: {
  open: boolean
  data: DashboardData
  page: PageId
  onOpenChange: (open: boolean) => void
  onNavigate: (navigation: AssistantNavigation) => void
}) {
  const dataRef = useRef(data)
  const pageRef = useRef(page)
  const navigateRef = useRef(onNavigate)
  const [status, setStatus] = useState(unavailableStatus)
  const [configuring, setConfiguring] = useState(false)

  useEffect(() => { dataRef.current = data }, [data])
  useEffect(() => { pageRef.current = page }, [page])
  useEffect(() => { navigateRef.current = onNavigate }, [onNavigate])

  const refreshStatus = useCallback(async () => {
    if (!window.healthAssistant) {
      setStatus(unavailableStatus)
      return
    }
    try {
      setStatus(await window.healthAssistant.getStatus())
    } catch (error) {
      setStatus({
        ...unavailableStatus,
        error: error instanceof Error ? error.message : 'The health coach is unavailable.',
      })
    }
  }, [])

  useEffect(() => { void refreshStatus() }, [refreshStatus])
  useEffect(() => {
    if (open) void refreshStatus()
  }, [open, refreshStatus])

  const modelAdapter = useMemo<ChatModelAdapter>(() => ({
    async *run({ messages, abortSignal }) {
      const bridge = window.healthAssistant
      if (!bridge) throw new Error('Open Pulseboard in the desktop app to use the health assistant.')

      const prompt = messageText(messages.at(-1))
      if (!prompt) throw new Error('Write a question before sending it.')

      let archived: DashboardData[] = []
      if (window.fitbit && dataRef.current.source !== 'demo') {
        try {
          archived = archiveData(await window.fitbit.getCachedArchive())
        } catch {
          archived = []
        }
      }

      const healthContext = buildHealthAssistantContext(dataRef.current, archived, pageRef.current)
      const requestId = crypto.randomUUID()
      const queue = createQueue()
      let fullText = ''
      let lastVisibleText = ''
      let completed = false

      const unsubscribe = bridge.onEvent((event) => {
        if (event.requestId === requestId) queue.push(event)
      })
      const onAbort = () => queue.push({ requestId, type: 'cancelled' })
      abortSignal.addEventListener('abort', onAbort, { once: true })

      try {
        await bridge.startTurn({ requestId, message: prompt, healthContext })
        void refreshStatus()

        while (!completed) {
          const event = await queue.next()
          if (event.type === 'delta') {
            fullText += event.delta
            const visible = visibleAssistantText(fullText)
            if (visible && visible !== lastVisibleText) {
              lastVisibleText = visible
              yield { content: [{ type: 'text', text: visible }] }
            }
          } else if (event.type === 'complete') {
            completed = true
            if (event.text) fullText = event.text
          } else if (event.type === 'error') {
            throw new Error(event.message)
          } else {
            return
          }
        }

        const navigation = parseAssistantNavigation(fullText)
        const finalText = stripAssistantNavigation(fullText)
        if (navigation) navigateRef.current(navigation)
        if (!finalText) throw new Error('The health coach finished without a response.')
        if (finalText !== lastVisibleText) {
          yield { content: [{ type: 'text', text: finalText }] }
        }
      } finally {
        abortSignal.removeEventListener('abort', onAbort)
        unsubscribe()
        if (!completed || abortSignal.aborted) void bridge.cancel(requestId)
        void refreshStatus()
      }
    },
  }), [refreshStatus])

  const runtime = useLocalRuntime(modelAdapter)
  const hasBridge = Boolean(window.healthAssistant)
  const ready = Boolean(hasBridge && status.available && status.authenticated)
  const showConfig = hasBridge && (!status.configured || configuring)

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <aside
        id="health-assistant"
        className={`health-assistant ${open ? 'is-open' : ''}`}
        aria-label="Health assistant"
        aria-hidden={!open}
        inert={!open}
      >
        <AssistantHeader
          status={status}
          ready={ready}
          canConfigure={hasBridge && Boolean(status.configured) && !showConfig}
          onConfigure={() => setConfiguring(true)}
          onClose={() => onOpenChange(false)}
          onStatusRefresh={refreshStatus}
        />
        {showConfig ? (
          <AssistantConfig
            status={status}
            canCancel={Boolean(status.configured)}
            onCancel={() => setConfiguring(false)}
            onSaved={async () => { await refreshStatus(); setConfiguring(false) }}
          />
        ) : (
          <AssistantThread ready={ready} />
        )}
      </aside>
      {open && <button className="assistant-scrim" aria-label="Close health assistant" onClick={() => onOpenChange(false)} />}
    </AssistantRuntimeProvider>
  )
}

function AssistantHeader({
  status,
  ready,
  canConfigure,
  onConfigure,
  onClose,
  onStatusRefresh,
}: {
  status: HealthAssistantStatus
  ready: boolean
  canConfigure: boolean
  onConfigure: () => void
  onClose: () => void
  onStatusRefresh: () => Promise<void>
}) {
  const runtime = useAssistantRuntime()

  const newConversation = async () => {
    runtime.thread.cancelRun()
    runtime.thread.reset()
    await window.healthAssistant?.reset()
    await onStatusRefresh()
  }

  return (
    <header className="assistant-header">
      <div className="assistant-title">
        <span className="assistant-mark"><Sparkles aria-hidden="true" /></span>
        <span>
          <strong>Health assistant</strong>
          <small><i className={ready ? 'is-ready' : ''} />{statusLabel(status, Boolean(window.healthAssistant))}</small>
        </span>
      </div>
      <div className="assistant-header-actions">
        {canConfigure && (
          <button type="button" aria-label="MiniMax settings" title="MiniMax settings" onClick={onConfigure}>
            <Settings2 aria-hidden="true" />
          </button>
        )}
        <button type="button" aria-label="New conversation" title="New conversation" onClick={() => void newConversation()}>
          <Plus aria-hidden="true" />
        </button>
        <button type="button" aria-label="Close assistant" title="Close" onClick={onClose}>
          <X aria-hidden="true" />
        </button>
      </div>
    </header>
  )
}

function AssistantConfig({
  status,
  canCancel,
  onCancel,
  onSaved,
}: {
  status: HealthAssistantStatus
  canCancel: boolean
  onCancel: () => void
  onSaved: () => Promise<void>
}) {
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(status.model || DEFAULT_MINIMAX_MODEL)
  const [apiBase, setApiBase] = useState(status.apiBase ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!window.healthAssistant || !apiKey.trim() || saving) return
    setSaving(true)
    setError(null)
    try {
      await window.healthAssistant.saveConfig({
        apiKey: apiKey.trim(),
        model: model.trim() || undefined,
        apiBase: apiBase.trim() || undefined,
      })
      await onSaved()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save the MiniMax key.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="assistant-config" onSubmit={submit}>
      <div className="assistant-config-intro">
        <h2>Connect your health coach</h2>
        <p>Paste your MiniMax API key to chat with an AI coach grounded in your Ultrahuman data. The key is encrypted on this device and never leaves it except to call MiniMax.</p>
      </div>
      <div className="form-field">
        <Label htmlFor="minimax-key">MiniMax API key</Label>
        <Input
          id="minimax-key"
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={status.configured ? '•••••••• saved — paste to replace' : 'eyJhbGciOi…'}
          autoComplete="off"
        />
      </div>
      <div className="form-field">
        <Label htmlFor="minimax-model">Model</Label>
        <Input
          id="minimax-model"
          value={model}
          onChange={(event) => setModel(event.target.value)}
          placeholder={DEFAULT_MINIMAX_MODEL}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <div className="form-field">
        <Label htmlFor="minimax-base">API base URL · optional</Label>
        <Input
          id="minimax-base"
          value={apiBase}
          onChange={(event) => setApiBase(event.target.value)}
          placeholder="https://api.minimax.chat/v1"
          autoComplete="off"
          spellCheck={false}
        />
        <p>Leave blank for the default. International accounts use https://api.minimaxi.chat/v1.</p>
      </div>
      {error && <p className="assistant-config-error" role="alert">{error}</p>}
      <div className="assistant-config-actions">
        {canCancel && <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" disabled={saving || !apiKey.trim()}>{saving ? 'Saving…' : 'Save key'}</Button>
      </div>
    </form>
  )
}

function AssistantThread({ ready }: { ready: boolean }) {
  return (
    <ThreadPrimitive.Root className="assistant-thread">
      <ThreadPrimitive.Viewport className="assistant-viewport">
        <AuiIf condition={(state) => state.thread.isEmpty}>
          <div className="assistant-welcome">
            <h2>Ask your health data.</h2>
            <p>I can compare days, explain trends, and take you to the relevant view.</p>
            <div className="assistant-suggestions" aria-label="Suggested questions">
              <ThreadPrimitive.Suggestion prompt="How did I sleep last night?" send disabled={!ready}>How did I sleep?</ThreadPrimitive.Suggestion>
              <ThreadPrimitive.Suggestion prompt="Compare my activity over the last seven days." send disabled={!ready}>Compare this week</ThreadPrimitive.Suggestion>
              <ThreadPrimitive.Suggestion prompt="Show me my heart health data." send disabled={!ready}>Open heart data</ThreadPrimitive.Suggestion>
            </div>
          </div>
        </AuiIf>

        <div className="assistant-messages">
          <ThreadPrimitive.Messages>
            {({ message }) => message.role === 'user' ? <UserMessage /> : <AssistantMessage />}
          </ThreadPrimitive.Messages>
        </div>

        <ThreadPrimitive.ViewportFooter className="assistant-viewport-footer">
          <ThreadPrimitive.ScrollToBottom className="assistant-scroll-bottom" aria-label="Scroll to latest response">
            <ArrowDown aria-hidden="true" />
          </ThreadPrimitive.ScrollToBottom>
          <ComposerPrimitive.Root className="assistant-composer">
            <ComposerPrimitive.Input
              className="assistant-composer-input"
              rows={1}
              disabled={!ready}
              placeholder={ready ? 'Ask about your health…' : 'Add your MiniMax key to chat'}
              aria-label="Message health assistant"
            />
            <AuiIf condition={(state) => !state.thread.isRunning}>
              <ComposerPrimitive.Send className="assistant-send" disabled={!ready} aria-label="Send message">
                <ArrowUp aria-hidden="true" />
              </ComposerPrimitive.Send>
            </AuiIf>
            <AuiIf condition={(state) => state.thread.isRunning}>
              <ComposerPrimitive.Cancel className="assistant-send is-cancel" aria-label="Stop response">
                <Square aria-hidden="true" />
              </ComposerPrimitive.Cancel>
            </AuiIf>
          </ComposerPrimitive.Root>
          <p className="assistant-disclaimer">Health context, not medical advice.</p>
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  )
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="assistant-user-message">
      <div><MessagePrimitive.Parts /></div>
    </MessagePrimitive.Root>
  )
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="assistant-ai-message">
      <span className="assistant-response-mark" aria-hidden="true">+</span>
      <div><MessagePrimitive.Parts /></div>
    </MessagePrimitive.Root>
  )
}
