import { useState, useRef, useEffect, useCallback } from 'react'
import { api } from '../../services/api'
import type { Project, Spec, EvalResult } from '../../types'
import type { WorkflowStatus } from '../../services/api'

// ─── Types ────────────────────────────────────────────────────────────────────

type AgentTab = 'chat' | 'evaluate' | 'workflow'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

interface EvalRun {
  specType: string
  specName: string
  status: 'idle' | 'running' | 'done' | 'error'
  result?: EvalResult
  error?: string
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function TabButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
        active
          ? 'bg-va-accent/20 text-va-accent'
          : 'text-va-text-muted hover:text-va-text hover:bg-va-panel'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

// ─── Chat Tab ─────────────────────────────────────────────────────────────────

function ChatTab({
  activeSpec,
  specContent,
}: {
  activeSpec: Spec | null
  specContent: string
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [useContext, setUseContext] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: Date.now() }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)
    try {
      const ctx = useContext && specContent ? specContent : undefined
      const response = await api.chat(text, ctx)
      setMessages(prev => [...prev, { role: 'assistant', content: response, timestamp: Date.now() }])
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `Error: ${err}`, timestamp: Date.now() },
      ])
    } finally {
      setLoading(false)
    }
  }, [input, loading, useContext, specContent])

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Context toggle */}
      {activeSpec && (
        <div className="px-3 py-1.5 border-b border-va-border flex items-center gap-2">
          <button
            onClick={() => setUseContext(v => !v)}
            className={`w-8 h-4 rounded-full transition-colors relative ${
              useContext ? 'bg-va-accent' : 'bg-va-border'
            }`}
          >
            <span
              className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform ${
                useContext ? 'left-4.5' : 'left-0.5'
              }`}
            />
          </button>
          <span className="text-xs text-va-text-muted">
            Include <span className="text-va-text">{activeSpec.name}</span> as context
          </span>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="text-center py-8 text-va-text-muted text-xs space-y-2">
            <div className="text-2xl">✦</div>
            <p>Ask me to review a spec, suggest improvements,</p>
            <p>or explain VisionSpec methodology.</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div
              className={`rounded-xl px-3 py-2 text-sm max-w-full whitespace-pre-wrap break-words ${
                msg.role === 'user'
                  ? 'bg-va-accent/20 text-va-text'
                  : 'bg-va-panel text-va-text border border-va-border'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-start">
            <div className="bg-va-panel border border-va-border rounded-xl px-3 py-2 flex gap-1">
              {[0, 1, 2].map(i => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 bg-va-text-muted rounded-full animate-bounce"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
              ))}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-va-border">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask the agent…"
            rows={1}
            className="flex-1 bg-va-panel border border-va-border rounded-lg px-3 py-2 text-sm text-va-text placeholder-va-text-muted focus:outline-none focus:border-va-accent resize-none"
            disabled={loading}
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="px-3 py-2 bg-va-accent text-white rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-va-accent/80 transition-colors"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Evaluate Tab ─────────────────────────────────────────────────────────────

function EvaluateTab({
  project,
  activeSpec,
}: {
  project: Project | null
  activeSpec: Spec | null
}) {
  const [runs, setRuns] = useState<Record<string, EvalRun>>({})

  const specs = project?.specs ?? []

  const runEval = useCallback(async (spec: Spec) => {
    if (!project) return
    setRuns(prev => ({
      ...prev,
      [spec.type]: { specType: spec.type, specName: spec.name, status: 'running' },
    }))
    try {
      const result = await api.evaluateSpec(project.name, spec.type)
      setRuns(prev => ({
        ...prev,
        [spec.type]: { specType: spec.type, specName: spec.name, status: 'done', result },
      }))
    } catch (err) {
      setRuns(prev => ({
        ...prev,
        [spec.type]: {
          specType: spec.type,
          specName: spec.name,
          status: 'error',
          error: String(err),
        },
      }))
    }
  }, [project])

  const scoreColor = (score: number) => {
    if (score >= 7) return 'text-va-success'
    if (score >= 5) return 'text-va-warning'
    return 'text-va-error'
  }

  const decisionBadge = (decision: string) => {
    const styles: Record<string, string> = {
      pass: 'bg-va-success/20 text-va-success border-va-success/30',
      conditional: 'bg-va-warning/20 text-va-warning border-va-warning/30',
      fail: 'bg-va-error/20 text-va-error border-va-error/30',
    }
    return styles[decision] ?? 'bg-va-panel text-va-text-muted border-va-border'
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full text-va-text-muted text-xs">
        Select a project to run evaluations
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-3 space-y-2">
        {/* Quick-run for active spec */}
        {activeSpec && (
          <div className="mb-3 p-3 bg-va-accent/10 border border-va-accent/20 rounded-lg">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-va-accent">Active spec</span>
              <button
                onClick={() => runEval(activeSpec)}
                disabled={runs[activeSpec.type]?.status === 'running'}
                className="text-xs px-2 py-0.5 bg-va-accent text-white rounded disabled:opacity-50 hover:bg-va-accent/80 transition-colors"
              >
                {runs[activeSpec.type]?.status === 'running' ? 'Running…' : 'Evaluate'}
              </button>
            </div>
            <div className="text-sm text-va-text font-medium">{activeSpec.name}</div>
            <EvalResultInline run={runs[activeSpec.type]} scoreColor={scoreColor} decisionBadge={decisionBadge} />
          </div>
        )}

        {/* All specs */}
        <div className="text-xs text-va-text-muted font-medium uppercase tracking-wider mb-2">
          All Specs
        </div>
        {specs.filter(s => s.type !== activeSpec?.type).map(spec => {
          const run = runs[spec.type]
          const disabled = spec.status === 'not_started' || run?.status === 'running'
          return (
            <div
              key={spec.type}
              className="p-2.5 bg-va-panel border border-va-border rounded-lg space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-va-text font-medium">{spec.name}</div>
                  <div className="text-xs text-va-text-muted">{spec.type}</div>
                </div>
                <button
                  onClick={() => runEval(spec)}
                  disabled={disabled}
                  className="text-xs px-2 py-0.5 bg-va-border text-va-text rounded disabled:opacity-40 hover:bg-va-accent/20 hover:text-va-accent transition-colors"
                >
                  {run?.status === 'running' ? '…' : 'Run'}
                </button>
              </div>
              <EvalResultInline run={run} scoreColor={scoreColor} decisionBadge={decisionBadge} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function EvalResultInline({
  run,
  scoreColor,
  decisionBadge,
}: {
  run?: EvalRun
  scoreColor: (n: number) => string
  decisionBadge: (d: string) => string
}) {
  if (!run || run.status === 'idle') return null

  if (run.status === 'running') {
    return (
      <div className="flex items-center gap-2 text-xs text-va-text-muted animate-pulse">
        <div className="w-3 h-3 border border-va-accent border-t-transparent rounded-full animate-spin" />
        Evaluating with LLM judge…
      </div>
    )
  }

  if (run.status === 'error') {
    return <div className="text-xs text-va-error">Error: {run.error}</div>
  }

  if (run.status === 'done' && run.result) {
    const { score, decision, findings } = run.result
    const critical = findings.filter(f => f.severity === 'critical').length
    const high = findings.filter(f => f.severity === 'high').length
    const medium = findings.filter(f => f.severity === 'medium').length

    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className={`text-lg font-bold tabular-nums ${scoreColor(score)}`}>
            {score.toFixed(1)}
          </span>
          <span className="text-xs text-va-text-muted">/10</span>
          <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${decisionBadge(decision)}`}>
            {decision}
          </span>
        </div>
        {findings.length > 0 && (
          <div className="flex gap-2 text-xs">
            {critical > 0 && <span className="text-va-error">{critical} critical</span>}
            {high > 0 && <span className="text-va-warning">{high} high</span>}
            {medium > 0 && <span className="text-va-text-muted">{medium} medium</span>}
          </div>
        )}
        {findings.slice(0, 2).map((f, i) => (
          <div key={i} className="text-xs text-va-text-muted border-l-2 border-va-border pl-2">
            {f.message}
          </div>
        ))}
        {findings.length > 2 && (
          <div className="text-xs text-va-text-muted">+{findings.length - 2} more findings</div>
        )}
      </div>
    )
  }

  return null
}

// ─── Workflow Tab ──────────────────────────────────────────────────────────────

function WorkflowTab({ project }: { project: Project | null }) {
  const [status, setStatus] = useState<WorkflowStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!project) return
    setLoading(true)
    setError(null)
    try {
      const s = await api.getWorkflowStatus(project.name)
      setStatus(s)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [project])

  useEffect(() => {
    load()
  }, [load])

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full text-va-text-muted text-xs">
        Select a project to see workflow status
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-5 h-5 border-2 border-va-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 text-xs text-va-error">
        {error}
        <button onClick={load} className="ml-2 text-va-accent underline">Retry</button>
      </div>
    )
  }

  if (!status) return null

  const phases = [
    { id: 'source', label: 'Discovery', specs: ['mrd', 'opportunity-spec'] },
    { id: 'gtm', label: 'Vision', specs: ['press', 'faq', 'narrative-1p', 'narrative-6p'] },
    { id: 'product', label: 'Product', specs: ['prd', 'uxd'] },
    { id: 'technical', label: 'Technical', specs: ['trd', 'tpd', 'ird'] },
    { id: 'reconcile', label: 'Reconcile', specs: ['spec', 'current-truth'] },
  ]

  const statusIcon = (s: string) => {
    if (s === 'approved') return { icon: '✓', cls: 'text-va-success' }
    if (s === 'evaluated') return { icon: '◉', cls: 'text-va-warning' }
    if (s === 'draft') return { icon: '○', cls: 'text-va-accent' }
    return { icon: '·', cls: 'text-va-text-muted' }
  }

  const pct = Math.round(status.progress * 100)

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-3 space-y-4">
        {/* Progress bar */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-va-text-muted">Overall progress</span>
            <span className="text-xs font-bold text-va-text tabular-nums">{pct}%</span>
          </div>
          <div className="h-1.5 bg-va-border rounded-full overflow-hidden">
            <div
              className="h-full bg-va-accent rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Current phase badge */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-va-text-muted">Current phase</span>
          <span className="text-xs px-2 py-0.5 bg-va-accent/20 text-va-accent border border-va-accent/30 rounded font-medium capitalize">
            {status.currentPhase}
          </span>
        </div>

        {/* Phase breakdown */}
        <div className="space-y-3">
          {phases.map(phase => {
            const phaseSpecs = phase.specs.filter(s => s in status.specStatuses)
            if (phaseSpecs.length === 0) return null

            const isCompleted = status.completedPhases.includes(phase.id)
            const isCurrent = status.currentPhase === phase.id

            return (
              <div key={phase.id}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className={`text-xs font-medium ${
                      isCompleted
                        ? 'text-va-success'
                        : isCurrent
                        ? 'text-va-accent'
                        : 'text-va-text-muted'
                    }`}
                  >
                    {isCompleted ? '✓ ' : isCurrent ? '▶ ' : '  '}
                    {phase.label}
                  </span>
                  {isCurrent && (
                    <span className="text-xs text-va-text-muted">active</span>
                  )}
                </div>
                <div className="pl-4 space-y-1">
                  {phaseSpecs.map(specType => {
                    const s = status.specStatuses[specType]
                    const { icon, cls } = statusIcon(s)
                    const isBlocked = status.blockedBy?.includes(specType)
                    return (
                      <div key={specType} className="flex items-center gap-2">
                        <span className={`text-xs font-mono ${cls}`}>{icon}</span>
                        <span className={`text-xs ${isBlocked ? 'text-va-warning' : 'text-va-text-muted'}`}>
                          {specType}
                          {isBlocked && ' ← needed'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        {/* Refresh */}
        <button
          onClick={load}
          className="w-full text-xs text-va-text-muted hover:text-va-text py-1 border border-va-border rounded hover:border-va-text-muted transition-colors"
        >
          Refresh
        </button>
      </div>
    </div>
  )
}

// ─── AgentPanel (root export) ─────────────────────────────────────────────────

interface AgentPanelProps {
  project: Project | null
  activeSpec: Spec | null
  specContent: string
}

export function AgentPanel({ project, activeSpec, specContent }: AgentPanelProps) {
  const [tab, setTab] = useState<AgentTab>('chat')

  return (
    <div className="flex flex-col h-full bg-va-sidebar border-l border-va-border w-72">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 border-b border-va-border">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-5 h-5 bg-va-accent/20 rounded flex items-center justify-center">
            <span className="text-va-accent text-xs">✦</span>
          </div>
          <span className="text-sm font-semibold text-va-text">Agent</span>
        </div>
        <div className="flex gap-1">
          <TabButton
            label="Chat"
            icon={<span>💬</span>}
            active={tab === 'chat'}
            onClick={() => setTab('chat')}
          />
          <TabButton
            label="Evaluate"
            icon={<span>⚖</span>}
            active={tab === 'evaluate'}
            onClick={() => setTab('evaluate')}
          />
          <TabButton
            label="Workflow"
            icon={<span>◎</span>}
            active={tab === 'workflow'}
            onClick={() => setTab('workflow')}
          />
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'chat' && (
          <ChatTab activeSpec={activeSpec} specContent={specContent} />
        )}
        {tab === 'evaluate' && (
          <EvaluateTab project={project} activeSpec={activeSpec} />
        )}
        {tab === 'workflow' && (
          <WorkflowTab project={project} />
        )}
      </div>
    </div>
  )
}
