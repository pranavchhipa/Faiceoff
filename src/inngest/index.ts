import {
  runPipeline,
  handleApproval,
  handleRejection,
} from './functions/generation/generation-pipeline'
import { faceAnchorGeneration } from './functions/creator/face-anchor-generation'

// All Inngest functions registered with the serve handler
export const functions = [
  runPipeline,
  handleApproval,
  handleRejection,
  faceAnchorGeneration,
]
