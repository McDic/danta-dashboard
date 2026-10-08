import { GoogleAuth } from 'google-auth-library'
import { SafeError } from './errors.ts'

const SHEETS_HINTS: Record<number, string> = {
  400: 'wrong SHEET_RANGE (check the tab name)',
  403: 'the spreadsheet is not shared with the service account, or SHEET_ID is not the mirror spreadsheet',
  404: 'wrong SHEET_ID',
}

/**
 * Reads one range with Application Default Credentials: `gcloud auth application-default login`
 * locally, or the credentials file written by google-github-actions/auth (Workload Identity Federation) in CI.
 */
export async function fetchSheetValues(spreadsheetId: string, range: string): Promise<unknown[][]> {
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] })

  // Authenticate separately so a credential failure isn't reported as a Sheets permission error.
  let client: Awaited<ReturnType<GoogleAuth['getClient']>>
  try {
    client = await auth.getClient()
    await client.getAccessToken()
  } catch (err) {
    const status = httpStatus(err)
    throw new SafeError(
      `Could not obtain Google credentials${status ? ` (HTTP ${status})` : ''}: ` +
        'in CI check GCP_WORKLOAD_IDENTITY_PROVIDER / GCP_SERVICE_ACCOUNT; locally check `gcloud auth application-default login` ' +
        '(new IAM grants can take a few minutes to apply)',
    )
  }

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`
  try {
    const res = await client.request<{ values?: unknown[][] }>({
      url,
      params: {
        majorDimension: 'ROWS',
        // Raw numbers instead of "₩1,234" strings; dates stay as displayed text (e.g. 2026/01/05).
        valueRenderOption: 'UNFORMATTED_VALUE',
        dateTimeRenderOption: 'FORMATTED_STRING',
      },
    })
    return res.data.values ?? []
  } catch (err) {
    // Google API errors don't carry cell data, but keep only the HTTP status to be safe.
    const status = httpStatus(err)
    const hint = status ? SHEETS_HINTS[status] : undefined
    throw new SafeError(`Sheets API request failed${status ? ` with HTTP ${status}` : ''}${hint ? `: ${hint}` : ''}`)
  }
}

function httpStatus(err: unknown): number | undefined {
  const e = err as { status?: number; response?: { status?: number } } | undefined
  return e?.status ?? e?.response?.status
}
