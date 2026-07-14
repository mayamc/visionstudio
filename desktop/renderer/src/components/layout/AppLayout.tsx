import { ReactNode } from 'react'

interface AppLayoutProps {
  sidebar: ReactNode
  main: ReactNode
  agent?: ReactNode
  terminal?: ReactNode
}

export function AppLayout({ sidebar, main, agent, terminal }: AppLayoutProps) {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* Left column: Sidebar */}
      <div className="flex flex-col w-72 bg-va-sidebar border-r border-va-border">
        <div className="flex-1 overflow-y-auto">
          {sidebar}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Main panel */}
        <div className="flex-1 overflow-hidden flex min-h-0">
          <div className="flex-1 overflow-hidden">
            {main}
          </div>
          {agent && (
            <div className="flex-shrink-0 overflow-hidden">
              {agent}
            </div>
          )}
        </div>

        {/* Terminal panel */}
        {terminal}
      </div>
    </div>
  )
}
