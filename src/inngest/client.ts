import { Inngest } from 'inngest'

/**
 * Event payload types for the Faiceoff generation pipeline.
 *
 * These types are used in inngest.send() calls and createFunction triggers
 * to provide consistent typing across the codebase.
 */
export type GenerationCreatedEvent = {
  name: 'generation/created'
  data: { generation_id: string }
}

export type GenerationApprovedEvent = {
  name: 'generation/approved'
  data: { generation_id: string }
}

export type GenerationRejectedEvent = {
  name: 'generation/rejected'
  data: { generation_id: string }
}

export type FaiceoffEvent =
  | GenerationCreatedEvent
  | GenerationApprovedEvent
  | GenerationRejectedEvent

export const inngest = new Inngest({
  id: 'faiceoff',
})
