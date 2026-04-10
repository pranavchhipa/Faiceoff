import {
  runPipeline,
  handleApproval,
  handleRejection,
} from './functions/generation/generation-pipeline'

// All Inngest functions registered with the serve handler
export const functions = [
  runPipeline,
  handleApproval,
  handleRejection,
]
