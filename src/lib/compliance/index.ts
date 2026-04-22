/**
 * Faiceoff Compliance Library
 *
 * Three-layer content compliance check for generation briefs:
 *  1. Blocked Categories  (fast keyword rules)
 *  2. Vector Similarity   (semantic pgvector search)
 *  3. LLM Classification  (nuanced OpenRouter review)
 */

export { runComplianceCheck, ComplianceError } from './three-layer-check';
export type { ComplianceInput, ComplianceResult } from './three-layer-check';

export { detectCategories, CATEGORY_KEYWORDS } from './category-mapping';
export type { Category } from './category-mapping';
