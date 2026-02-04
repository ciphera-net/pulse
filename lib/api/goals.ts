import apiRequest from './client'

export interface Goal {
  id: string
  site_id: string
  name: string
  event_name: string
  funnel_steps: string[]
  created_at: string
  updated_at: string
}

export interface CreateGoalRequest {
  name: string
  event_name: string
  funnel_steps?: string[]
}

export interface UpdateGoalRequest {
  name: string
  event_name: string
  funnel_steps?: string[]
}

export async function listGoals(siteId: string): Promise<Goal[]> {
  const res = await apiRequest<{ goals: Goal[] }>(`/sites/${siteId}/goals`)
  return res?.goals ?? []
}

export async function createGoal(siteId: string, data: CreateGoalRequest): Promise<Goal> {
  return apiRequest<Goal>(`/sites/${siteId}/goals`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateGoal(siteId: string, goalId: string, data: UpdateGoalRequest): Promise<Goal> {
  return apiRequest<Goal>(`/sites/${siteId}/goals/${goalId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteGoal(siteId: string, goalId: string): Promise<void> {
  await apiRequest(`/sites/${siteId}/goals/${goalId}`, {
    method: 'DELETE',
  })
}
