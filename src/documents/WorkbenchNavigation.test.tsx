import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import type { ProjectDocument } from '../demoProject/demoProject'
import { WorkbenchNavigation } from './WorkbenchNavigation'

const estimate: ProjectDocument = {
  id: 'fixture-estimate',
  versionId: 'fixture-estimate-v1',
  kind: 'estimate',
  title: 'Fixture estimate',
  description: 'Independent estimating workflow document',
  file: {
    name: 'estimate.pdf',
    url: '/fixtures/estimate.pdf',
    byteSize: 35,
    sha256: '9cbdaf7af491c087cc5a53908017230e66e30c2a17c4052e16151dd2f707f427',
    pageCount: 1,
  },
  pages: [{
    id: 'fixture-estimate-page-1',
    label: '1',
    number: 1,
    title: 'Door allowance estimate',
    width: 612,
    height: 792,
    rotation: 0,
  }],
}

test('the document picker labels a new manifest kind without treating it as a submittal', () => {
  const page = estimate.pages[0]!
  render(
    <WorkbenchNavigation
      currentDocument={estimate}
      currentPage={page}
      documents={[estimate]}
      onSelectDocument={vi.fn()}
      onSelectPage={vi.fn()}
      pageItems={[{ page }]}
    />,
  )

  fireEvent.click(screen.getByRole('button', { name: 'Documents' }))

  expect(screen.getByText(/Estimate · fixture-estimate-v1 · estimate.pdf/)).toBeVisible()
  expect(screen.queryByText(/Submittal product data/)).not.toBeInTheDocument()
})
