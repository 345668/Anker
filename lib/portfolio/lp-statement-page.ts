import { listDocumentsForLp, noticesFor, statementFor, type LpDocView, type LpStatementView, type NoticeView } from "./lp-statement"

/** Everything the portal's "Your account" card shows, in one call. A failure in any part hides that part, not the portal. */
export interface AccountView { statement: LpStatementView | null; notices: NoticeView[]; documents: LpDocView[] }
export async function documentsAndStatement(fundId: string, lpId: string): Promise<AccountView> {
  const [statement, notices, documents] = await Promise.all([statementFor(fundId, lpId).catch(() => null), noticesFor(lpId).catch(() => []), listDocumentsForLp(fundId, lpId).catch(() => [])])
  return { statement, notices, documents }
}
