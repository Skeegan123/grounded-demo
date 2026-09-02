import { useEffect } from 'react'
import { useStore } from 'zustand'
import { demoProject, findDocument } from '../demoProject/demoProject'
import type { createWorkspaceStore } from '../workspace/workspaceStore'

export function useDocumentKeyboardShortcuts(
  workspaceStore: ReturnType<typeof createWorkspaceStore>,
  onHumanTakeover: () => void = () => {},
) {
  const selectedLocation = useStore(
    workspaceStore,
    (state) => state.selectedLocation,
  )
  const selectPage = useStore(workspaceStore, (state) => state.selectPage)
  const setFitPreference = useStore(
    workspaceStore,
    (state) => state.setFitPreference,
  )
  const zoomIn = useStore(workspaceStore, (state) => state.zoomIn)
  const zoomOut = useStore(workspaceStore, (state) => state.zoomOut)

  useEffect(() => {
    const selectedDocument = findDocument(
      selectedLocation.documentId,
      selectedLocation.documentVersionId,
    ) ?? demoProject.documents[0]!
    const selectedPageIndex = selectedDocument.pages.findIndex(
      (page) => page.id === selectedLocation.pageId,
    )
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return
      if (event.key === 'ArrowLeft' && selectedPageIndex > 0) {
        event.preventDefault()
        onHumanTakeover()
        selectPage(selectedDocument.pages[selectedPageIndex - 1]!.id)
      } else if (
        event.key === 'ArrowRight' &&
        selectedPageIndex >= 0 &&
        selectedPageIndex < selectedDocument.pages.length - 1
      ) {
        event.preventDefault()
        onHumanTakeover()
        selectPage(selectedDocument.pages[selectedPageIndex + 1]!.id)
      } else if (event.key === '+' || event.key === '=') {
        event.preventDefault()
        onHumanTakeover()
        zoomIn()
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault()
        onHumanTakeover()
        zoomOut()
      } else if (event.key === '0') {
        event.preventDefault()
        onHumanTakeover()
        setFitPreference(event.shiftKey ? 'width' : 'page')
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [
    selectPage,
    onHumanTakeover,
    selectedLocation,
    setFitPreference,
    zoomIn,
    zoomOut,
  ])
}

function isEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && (
    target.matches('input, textarea, select') || target.isContentEditable
  )
}
