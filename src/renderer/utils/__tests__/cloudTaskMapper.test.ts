import { describe, it, expect } from 'vitest'
import { mapCloudTaskToTask, mapCloudTasksToTasks } from '../cloudTaskMapper'
import type { CloudTaskResponse } from '../../../shared/types/cloud-api'

const baseTask: CloudTaskResponse = {
  id: 'task-1',
  file_type: 'pdf',
  file_name: 'demo.pdf',
  status: 3,
  status_name: 'PROCESSING',
  description: 'desc',
  error_message: undefined,
  page_count: 10,
  pages_completed: 4,
  pages_failed: 1,
  pdf_url: '/pdf',
  credits_estimated: 10,
  credits_consumed: 2,
  created_at: '2026-02-01T00:00:00.000Z',
  model_tier: 'lite',
}

describe('cloudTaskMapper', () => {
  it('maps cloud task to local task shape', () => {
    const result = mapCloudTaskToTask(baseTask)

    expect(result.id).toBe('task-1')
    expect(result.filename).toBe('demo.pdf')
    expect(result.type).toBe('pdf')
    expect(result.provider).toBe(-1)
    expect(result.isCloud).toBe(true)
    expect(result.model_name).toContain('Fit Lite')
    expect(result.model_name).toContain('Markdown.Fit')
    expect(result.progress).toBe(40)
    expect(result.completed_count).toBe(4)
    expect(result.failed_count).toBe(1)
    expect(result.sortTimestamp).toBe(new Date('2026-02-01T00:00:00.000Z').getTime())
  })

  it('forces completed status progress to 100', () => {
    const result = mapCloudTaskToTask({ ...baseTask, status: 6, pages_completed: 1 })
    expect(result.progress).toBe(100)
  })

  it('keeps progress at 0 when page_count is 0', () => {
    const result = mapCloudTaskToTask({
      ...baseTask,
      page_count: 0,
      pages_completed: 3,
      status: 3,
    })
    expect(result.progress).toBe(0)
  })

  it('clamps non-completed progress to 100 when completed pages overflow page_count', () => {
    const result = mapCloudTaskToTask({
      ...baseTask,
      page_count: 10,
      pages_completed: 15,
      status: 3,
    })
    expect(result.progress).toBe(100)
  })

  it('uses started_at as timestamp fallback', () => {
    const result = mapCloudTaskToTask({
      ...baseTask,
      created_at: '',
      started_at: '2026-02-02T00:00:00.000Z',
    })

    expect(result.sortTimestamp).toBe(new Date('2026-02-02T00:00:00.000Z').getTime())
  })

  it('uses current timestamp fallback when no created_at and no started_at', () => {
    const nowMin = Date.now() - 1000
    const result = mapCloudTaskToTask({ ...baseTask, created_at: '', started_at: undefined })
    expect(result.sortTimestamp).toBeGreaterThanOrEqual(nowMin)
  })

  it('maps office file type to file extension', () => {
    const officeTask = {
      ...baseTask,
      file_type: 'office' as const,
      file_name: 'slides.pptx',
    }

    const result = mapCloudTaskToTask(officeTask)
    expect(result.type).toBe('pptx')
  })

  it('uses pdf fallback when office extension is empty', () => {
    const officeTask = {
      ...baseTask,
      file_type: 'office' as const,
      file_name: 'README.',
    }

    const result = mapCloudTaskToTask(officeTask)
    expect(result.type).toBe('pdf')
  })

  it('uses Cloud display name for unknown model tier', () => {
    const result = mapCloudTaskToTask({ ...baseTask, model_tier: 'unknown-tier' })
    expect(result.model_name.startsWith('Cloud |')).toBe(true)
  })

  it('maps description/error fields for UI display', () => {
    const result = mapCloudTaskToTask({
      ...baseTask,
      description: 'human readable',
      error_message: 'api failed',
    })

    expect(result.description).toBe('human readable')
    expect(result.error_message).toBe('api failed')
    expect(result.error).toBe('api failed')
  })

  it('maps list with mapCloudTasksToTasks', () => {
    const result = mapCloudTasksToTasks([baseTask, { ...baseTask, id: 'task-2' }])
    expect(result).toHaveLength(2)
    expect(result[1].id).toBe('task-2')
  })
})
