import { useState, useEffect, useCallback } from 'react'
import { AppLayout, Sidebar, WorkflowDiagram, SpecEditor, TerminalPanel, DEFAULT_TERMINAL_HEIGHT, AddProjectModal } from './components'
import { FindingsView } from './components/project/FindingsView'
import { AgentPanel } from './components/agent/AgentPanel'
import { api } from './services/api'
import { useProjectEvents, FileEvent } from './hooks/useProjectEvents'
import type { Project, Spec } from './types'

type ActiveView = 'workflow' | 'spec' | 'findings'

function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [activeProject, setActiveProject] = useState<Project | null>(null)
  const [activeView, setActiveView] = useState<ActiveView>('workflow')
  const [activeSpec, setActiveSpec] = useState<Spec | null>(null)
  const [specContent, setSpecContent] = useState<string>('')
  const [isDirty, setIsDirty] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [terminalHeight, setTerminalHeight] = useState(DEFAULT_TERMINAL_HEIGHT)
  const [showAddProjectModal, setShowAddProjectModal] = useState(false)
  const [isConnected, setIsConnected] = useState(false)

  // Real-time event handling
  const handleFileChanged = useCallback((event: FileEvent) => {
    console.log('File changed:', event)

    // If we're viewing a spec that was modified, reload it
    if (activeSpec && event.specType === activeSpec.type && event.type === 'file_modified') {
      if (activeProject && !isDirty) {
        // Reload spec content if user hasn't made local changes
        api.getSpec(activeProject.name, activeSpec.type).then(fullSpec => {
          setActiveSpec(fullSpec)
          setSpecContent(fullSpec.content || '')
        }).catch(console.error)
      }
    }

    // Refresh project list to update spec statuses
    if (activeProject && event.project === activeProject.name) {
      loadProjects()
    }
  }, [activeSpec, activeProject, isDirty])

  const handleEvalComplete = useCallback((event: FileEvent) => {
    console.log('Eval complete:', event)

    // Refresh project to get updated eval results
    if (activeProject && event.project === activeProject.name) {
      loadProjects()
    }

    // Show notification (could add a toast notification system here)
    if (event.data) {
      const score = event.data.score as number
      const decision = event.data.decision as string
      console.log(`Evaluation complete for ${event.specType}: score=${score}, decision=${decision}`)
    }
  }, [activeProject])

  const handleWorkflowChanged = useCallback((_event: FileEvent) => {
    // Workflow changed - refresh to update the diagram
    if (activeProject) {
      loadProjects()
    }
  }, [activeProject])

  // Subscribe to real-time events
  useProjectEvents(activeProject?.name, {
    onFileChanged: handleFileChanged,
    onEvalComplete: handleEvalComplete,
    onWorkflowChanged: handleWorkflowChanged,
    onConnected: () => setIsConnected(true),
    onDisconnected: () => setIsConnected(false),
    enabled: !!activeProject,
  })

  // Load projects on mount
  useEffect(() => {
    loadProjects()
  }, [])

  const loadProjects = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const data = await api.listProjects()
      setProjects(data)
      if (data.length > 0) {
        setActiveProject(data[0])
      }
    } catch (err) {
      setError(`Failed to connect to daemon: ${err}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleProjectSelect = (project: Project) => {
    setActiveProject(project)
    setActiveView('workflow')
    setActiveSpec(null)
  }

  const handleSpecSelect = async (spec: Spec) => {
    if (!activeProject) return

    try {
      const fullSpec = await api.getSpec(activeProject.name, spec.type)
      setActiveSpec(fullSpec)
      setSpecContent(fullSpec.content || '')
      setIsDirty(false)
      setActiveView('spec')
    } catch (err) {
      console.error('Failed to load spec:', err)
      // Fall back to the spec we have
      setActiveSpec(spec)
      setSpecContent(spec.content || '')
      setIsDirty(false)
      setActiveView('spec')
    }
  }

  const handleWorkflowClick = () => {
    setActiveView('workflow')
    setActiveSpec(null)
  }

  const handleFindingsClick = () => {
    setActiveView('findings')
    setActiveSpec(null)
  }

  const handleContentChange = (content: string) => {
    setSpecContent(content)
    setIsDirty(content !== (activeSpec?.content || ''))
  }

  const handleSave = async () => {
    if (!activeProject || !activeSpec) return

    try {
      await api.saveSpec(activeProject.name, activeSpec.type, specContent)
      setIsDirty(false)
    } catch (err) {
      console.error('Failed to save spec:', err)
    }
  }

  const handleTerminalHeightChange = useCallback((height: number) => {
    setTerminalHeight(height)
  }, [])

  const handleAddProject = async (name: string, path: string, profile: string, initialize: boolean) => {
    const newProject = await api.addProject(name, path, profile, initialize)
    setProjects([...projects, newProject])
    setActiveProject(newProject)
    setActiveView('workflow')
  }

  const handleRemoveProject = async (projectName: string) => {
    try {
      await api.removeProject(projectName)
      const updatedProjects = projects.filter(p => p.name !== projectName)
      setProjects(updatedProjects)
      // If the removed project was active, select another one
      if (activeProject?.name === projectName) {
        setActiveProject(updatedProjects.length > 0 ? updatedProjects[0] : null)
        setActiveView('workflow')
        setActiveSpec(null)
      }
    } catch (err) {
      console.error('Failed to remove project:', err)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-va-bg text-va-text">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-va-accent border-t-transparent rounded-full mx-auto mb-4" />
          <p>Connecting to daemon...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-va-bg text-va-text">
        <div className="text-center max-w-md">
          <p className="text-va-error mb-4">{error}</p>
          <button
            onClick={loadProjects}
            className="px-4 py-2 bg-va-accent text-white rounded hover:bg-va-accent/80"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <AppLayout
      sidebar={
        <>
          <Sidebar
            projects={projects}
            activeProject={activeProject}
            onProjectSelect={handleProjectSelect}
            onSpecSelect={handleSpecSelect}
            onWorkflowClick={handleWorkflowClick}
            onFindingsClick={handleFindingsClick}
            activeSpec={activeSpec}
            onAddProjectClick={() => setShowAddProjectModal(true)}
            onRemoveProject={handleRemoveProject}
            isConnected={isConnected}
          />
          {showAddProjectModal && (
            <AddProjectModal
              onClose={() => setShowAddProjectModal(false)}
              onAdd={handleAddProject}
            />
          )}
        </>
      }
      main={
        activeProject ? (
          activeView === 'workflow' ? (
            <WorkflowDiagram
              project={activeProject}
              onSpecClick={handleSpecSelect}
            />
          ) : activeView === 'findings' ? (
            <FindingsView
              project={activeProject}
              onSpecClick={handleSpecSelect}
            />
          ) : activeSpec ? (
            <SpecEditor
              spec={{ ...activeSpec, content: specContent }}
              onContentChange={handleContentChange}
              onSave={handleSave}
              isDirty={isDirty}
            />
          ) : (
            <EmptyState message="Select a spec to edit" />
          )
        ) : (
          <EmptyState message="Select a project to get started" />
        )
      }
      agent={
        <AgentPanel
          project={activeProject}
          activeSpec={activeSpec}
          specContent={specContent}
        />
      }
      terminal={
        <TerminalPanel
          height={terminalHeight}
          onHeightChange={handleTerminalHeightChange}
          projectPath={activeProject?.path}
          projectName={activeProject?.name}
        />
      }
    />
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-full text-va-text-muted">
      {message}
    </div>
  )
}

export default App
