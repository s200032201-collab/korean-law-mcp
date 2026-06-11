/**
 * legal_research — 체인 8개 통합 진입점 (v4.4.0)
 *
 * 기존 chain_* 8개를 task 파라미터 하나로 통합해 MCP 노출 도구 수와
 * ListTools 컨텍스트 비용을 줄인다. 기존 chain_* 도구는 allTools에
 * 그대로 남아 직접 호출/execute_tool 경유가 계속 동작한다 (하위호환).
 */

import { z } from "zod"
import type { LawApiClient } from "../lib/api-client.js"
import {
  chainLawSystem,
  chainActionBasis,
  chainDisputePrep,
  chainAmendmentTrack,
  chainOrdinanceCompare,
  chainFullResearch,
  chainProcedureDetail,
  chainDocumentReview,
} from "./chains.js"

export const LegalResearchSchema = z.object({
  query: z.string().optional()
    .describe("자연어 질문/법령명/키워드 (예: '음주운전 처벌 기준', '관세법 체계'). document_review 외 모든 task에서 필수"),
  task: z.enum([
    "full_research", "law_system", "action_basis", "dispute_prep",
    "amendment_track", "ordinance_compare", "procedure_detail", "document_review",
  ]).optional().default("full_research")
    .describe("리서치 유형 (도구 설명의 task 표 참조). 미지정 시 full_research"),
  scenario: z.enum([
    "delegation", "impact", "penalty", "timeline", "time_travel",
    "compliance", "customs", "action_plan", "manual",
  ]).optional()
    .describe("확장 시나리오. 미지정 시 쿼리에서 자동 감지. task별 호환: law_system=delegation·impact | action_basis=penalty | amendment_track=timeline·time_travel | ordinance_compare=compliance | full_research=customs·action_plan | procedure_detail=manual"),
  domain: z.enum(["tax", "labor", "privacy", "competition", "general"]).optional()
    .describe("[dispute_prep] 전문 분야 (tax=조세심판, labor=노동위, privacy=개인정보위, competition=공정위). 미지정 시 자동 감지"),
  articles: z.array(z.string()).optional()
    .describe("[law_system] 함께 조회할 조문 번호 (예: ['제38조'])"),
  parentLaw: z.string().optional()
    .describe("[ordinance_compare] 상위 법령명. 미지정 시 자동 검색"),
  mst: z.string().optional().describe("[amendment_track] 법령일련번호 (알고 있으면)"),
  lawId: z.string().optional().describe("[amendment_track] 법령ID (알고 있으면)"),
  fromDate: z.string().regex(/^\d{8}$/).optional()
    .describe("[time_travel] 비교 시작 시점 YYYYMMDD"),
  toDate: z.string().regex(/^\d{8}$/).optional()
    .describe("[time_travel] 비교 종료 시점 YYYYMMDD"),
  text: z.string().optional()
    .describe("[document_review 전용·필수] 검토할 계약서/약관 전문 텍스트"),
  maxClauses: z.number().min(1).max(30).optional()
    .describe("[document_review] 최대 분석 조항 수 (기본 15)"),
  apiKey: z.string().optional(),
})

export type LegalResearchInput = z.infer<typeof LegalResearchSchema>

type ToolResponse = Awaited<ReturnType<typeof chainFullResearch>>

/** task별 허용 시나리오 — 비호환 시나리오는 무시하고 자동 감지에 맡긴다 */
const TASK_SCENARIOS: Record<string, Set<string>> = {
  law_system: new Set(["delegation", "impact"]),
  action_basis: new Set(["penalty"]),
  amendment_track: new Set(["timeline", "time_travel"]),
  ordinance_compare: new Set(["compliance"]),
  full_research: new Set(["customs", "action_plan"]),
  procedure_detail: new Set(["manual"]),
}

function inputError(message: string): ToolResponse {
  return { content: [{ type: "text", text: message }], isError: true }
}

export async function legalResearch(
  apiClient: LawApiClient,
  input: LegalResearchInput
): Promise<ToolResponse> {
  const task = input.task ?? "full_research"

  if (task === "document_review") {
    if (!input.text) return inputError("task=document_review에는 text(문서 전문)가 필요합니다.")
    return chainDocumentReview(apiClient, {
      text: input.text,
      maxClauses: input.maxClauses ?? 15,
      apiKey: input.apiKey,
    })
  }

  if (!input.query) return inputError(`task=${task}에는 query가 필요합니다.`)
  const query = input.query

  // 비호환 시나리오는 버리고 각 체인의 자동 감지에 맡긴다
  const scenario = input.scenario && TASK_SCENARIOS[task]?.has(input.scenario)
    ? input.scenario
    : undefined
  const apiKey = input.apiKey

  switch (task) {
    case "law_system":
      return chainLawSystem(apiClient, {
        query, articles: input.articles,
        scenario: scenario as "delegation" | "impact" | undefined, apiKey,
      })
    case "action_basis":
      return chainActionBasis(apiClient, {
        query, scenario: scenario as "penalty" | undefined, apiKey,
      })
    case "dispute_prep":
      return chainDisputePrep(apiClient, { query, domain: input.domain, apiKey })
    case "amendment_track":
      return chainAmendmentTrack(apiClient, {
        query, mst: input.mst, lawId: input.lawId,
        scenario: scenario as "timeline" | "time_travel" | undefined,
        fromDate: input.fromDate, toDate: input.toDate, apiKey,
      })
    case "ordinance_compare":
      return chainOrdinanceCompare(apiClient, {
        query, parentLaw: input.parentLaw,
        scenario: scenario as "compliance" | undefined, apiKey,
      })
    case "procedure_detail":
      return chainProcedureDetail(apiClient, {
        query, scenario: scenario as "manual" | undefined, apiKey,
      })
    case "full_research":
    default:
      return chainFullResearch(apiClient, {
        query, scenario: scenario as "customs" | "action_plan" | undefined, apiKey,
      })
  }
}
