import { useEffect } from 'react'
import { useStore } from 'zustand'
import { demoProject, findDocument } from '../demoProject/demoProject'
import type { UserDocumentBrowsing } from './DocumentNavigator'
import type { createWorkspaceStore } from '../workspace/workspaceStore'

export function useDocumentKeyboardShortcuts(
  workspaceStore: ReturnType<typeof createWorkspaceStore>,
  userDocumentBrowsing: UserDocumentBrowsing,
) {
  const selectedLocation = useStore(
    workspaceStore,
    (state) => state.selectedLocation,
  )
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
        userDocumentBrowsing.selectPage(
          selectedDocument.pages[selectedPageIndex - 1]!.id,
        )
      } else if (
        event.key === 'ArrowRight' &&
        selectedPageIndex >= 0 &&
        selectedPageIndex < selectedDocument.pages.length - 1
      ) {
        event.preventDefault()
        userDocumentBrowsing.selectPage(
          selectedDocument.pages[selectedPageIndex + 1]!.id,
        )
      } else if (event.key === '+' || event.key === '=') {
        event.preventDefault()
        userDocumentBrowsing.zoomIn()
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault()
        userDocumentBrowsing.zoomOut()
      } else if (event.key === '0') {
        event.preventDefault()
        userDocumentBrowsing.setFitPreference(
          event.shiftKey ? 'width' : 'page',
        )
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [
    userDocumentBrowsing,
    selectedLocation,
  ])
}

function isEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && (
    target.matches('input, textarea, select') || target.isContentEditable
  )
}
