import {
  runPipeline,
  handleApproval,
  handleRejection,
} from './functions/generation/generation-pipeline'
import { faceAnchorGeneration } from './functions/creator/face-anchor-generation'
import { expireLicenses } from './functions/license/expire-licenses'

// All Inngest functions registered with the serve handler
export const functions = [
  runPipeline,
  handleApproval,
  handleRejection,
  faceAnchorGeneration,
  expireLicenses,
]
