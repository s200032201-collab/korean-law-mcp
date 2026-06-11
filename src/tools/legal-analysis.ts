/**
 * legal_analysis — 정밀 분석/검증 4종 통합 진입점 (v4.4.0)
 *
 * verify_citations·cite_check·applicable_law·impact_map을 mode 파라미터로
 * 통합해 MCP 노출 도구 수를 줄인다. 원본 도구는 allTools에 그대로 남아
 * 직접 호출/execute_tool 경유가 계속 동작한다 (하위호환).
 * 세부 옵션(deepScan, includeMermaid 등)은 원본 도구의 기본값을 따른다.
 */

import { z } from "zod"
import type { LawApiClient } from "../lib/api-client.js"
import type { LooseToolResponse } from "../lib/types.js"
import { verifyCitations } from "./verify-citations.js"
import { citeCheck } from "./cite-check.js"
import { applicableLaw } from "./applicable-law.js"
import { impactMap } from "./impact-map.js"

export const LegalAnalysisSchema = z.object({
  mode: z.enum(["verify_citations", "cite_check", "applicable_law", "impact_map"])
    .describe("분석 유형 (도구 설명의 mode 표 참조)"),
  text: z.string().optional()
    .describe("[verify_citations 필수] 검증할 법률 텍스트 (LLM 답변/계약서 등 조문 인용 포함 문자열)"),
  caseNumber: z.string().optional()
    .describe("[cite_check 필수] 사건번호 (예: '2013다61381', 문장 포함 가능)"),
  lawName: z.string().optional()
    .describe("[applicable_law·impact_map 필수] 법령명 (예: '민법', '도로교통법')"),
  jo: z.string().optional()
    .describe("[impact_map 필수, applicable_law 선택] 조문 번호 (예: '제103조', '제10조의2')"),
  date: z.string().optional()
    .describe("[applicable_law 필수] 기준일 — 행위·계약·처분 시점 (예: '2023-05-10', '20230510')"),
  apiKey: z.string().optional(),
})

export type LegalAnalysisInput = z.infer<typeof LegalAnalysisSchema>

type ToolResponse = LooseToolResponse

function inputError(message: string): ToolResponse {
  return { content: [{ type: "text", text: message }], isError: true }
}

export async function legalAnalysis(
  apiClient: LawApiClient,
  input: LegalAnalysisInput
): Promise<ToolResponse> {
  const apiKey = input.apiKey

  switch (input.mode) {
    case "verify_citations":
      if (!input.text) return inputError("mode=verify_citations에는 text가 필요합니다.")
      return verifyCitations(apiClient, { text: input.text, maxCitations: 15, apiKey })
    case "cite_check":
      if (!input.caseNumber) return inputError("mode=cite_check에는 caseNumber가 필요합니다.")
      return citeCheck(apiClient, { caseNumber: input.caseNumber, display: 20, deepScan: true, apiKey })
    case "applicable_law":
      if (!input.lawName || !input.date) return inputError("mode=applicable_law에는 lawName과 date가 필요합니다.")
      return applicableLaw(apiClient, { lawName: input.lawName, date: input.date, jo: input.jo, apiKey })
    case "impact_map":
      if (!input.lawName || !input.jo) return inputError("mode=impact_map에는 lawName과 jo가 필요합니다.")
      return impactMap(apiClient, {
        lawName: input.lawName, jo: input.jo,
        includeOrdinances: true, includeMermaid: true, apiKey,
      })
  }
}
