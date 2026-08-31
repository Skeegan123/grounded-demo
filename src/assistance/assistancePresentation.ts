import type { ProjectDocument } from '../demoProject/demoProject'
import type { StoredPoint } from '../demoSession/demoSession'
import type {
  AssistanceCompletedResult,
  AssistanceRequestView,
} from './assistance'

export type PointSetRequestView = Extract<
  AssistanceRequestView,
  { responseType: 'point_set' }
>
export type TextRequestView = Extract<
  AssistanceRequestView,
  { responseType: 'text' }
>
type PointSetProfessionalResponse = Extract<
  AssistanceCompletedResult['professionalResponse'],
  { type: 'point_set' }
>
export type PointSetCompletedResult = Omit<
  AssistanceCompletedResult,
  'professionalResponse'
> & {
  professionalResponse: PointSetProfessionalResponse
}

export function asPointSetRequest(
  request?: AssistanceRequestView,
): PointSetRequestView | undefined {
  return request?.responseType === 'point_set' ? request : undefined
}

export function asTextRequest(
  request?: AssistanceRequestView,
): TextRequestView | undefined {
  return request?.responseType === 'text' ? request : undefined
}

export function asPointSetResult(
  result: AssistanceCompletedResult,
): PointSetCompletedResult | undefined {
  return result.professionalResponse.type === 'point_set'
    ? result as PointSetCompletedResult
    : undefined
}

export function findPointSetResult(
  results: AssistanceCompletedResult[],
  id: string,
) {
  const result = results.find((candidate) => candidate.id === id)
  return result ? asPointSetResult(result) : undefined
}

export function toStoredPoints(result?: PointSetCompletedResult): StoredPoint[] {
  return result?.professionalResponse.points.map((point) => ({
    pointNumber: point.pointNumber,
    pageId: point.page.id,
    pageLabel: point.page.label,
    pageNumber: point.page.number,
    x: point.x,
    y: point.y,
  })) ?? []
}

export function firstMarkedPageId(
  document: ProjectDocument,
  result: PointSetCompletedResult,
) {
  const markedPageIds = new Set(
    result.professionalResponse.points.map((point) => point.page.id),
  )
  return document.pages.find((page) => markedPageIds.has(page.id))?.id ??
    document.pages[0]!.id
}
