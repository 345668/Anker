import { sql, Company, Investor, Deal, InvestorMatch, PitchDeck, Activity, DataRoomFile, Contact } from './index'

// ============ NEWS ARTICLES ============

export type NewsArticle = {
  id: string
  headline: string
  /** Added by the 2026-05-08-news-articles migration; nullable for back-compat. */
  subheadline: string | null
  content: string | null
  author: string
  blog_type: string
  tags: string[] | null
  published_at: string
  status: string
  image_url: string | null
  created_at: string
  updated_at: string
}

export async function getPublishedArticles(limit = 20): Promise<NewsArticle[]> {
  return sql`
    SELECT id, headline, subheadline, author, blog_type, tags, published_at, status, image_url, created_at
    FROM news_articles
    WHERE status = 'published' 
    ORDER BY published_at DESC 
    LIMIT ${limit}
  `
}

export async function getArticleById(id: string): Promise<NewsArticle | null> {
  const results = await sql`SELECT * FROM news_articles WHERE id = ${id}`
  return results[0] || null
}

export async function getArticlesByType(blogType: string, limit = 10): Promise<NewsArticle[]> {
  return sql`
    SELECT id, headline, subheadline, author, blog_type, tags, published_at, status, image_url
    FROM news_articles
    WHERE status = 'published' AND blog_type = ${blogType}
    ORDER BY published_at DESC 
    LIMIT ${limit}
  `
}

export async function getFeaturedArticles(limit = 2): Promise<NewsArticle[]> {
  return sql`
    SELECT id, headline, subheadline, author, blog_type, tags, published_at, status, image_url
    FROM news_articles
    WHERE status = 'published'
    ORDER BY published_at DESC 
    LIMIT ${limit}
  `
}

// ============ COMPANIES ============

export async function getCompaniesByUserId(userId: string): Promise<Company[]> {
  return sql`SELECT * FROM public.companies WHERE user_id = ${userId} ORDER BY created_at DESC`
}

export async function getCompanyById(id: string): Promise<Company | null> {
  const results = await sql`SELECT * FROM public.companies WHERE id = ${id}`
  return results[0] || null
}

export async function createCompany(data: Partial<Company> & { user_id: string; name: string }): Promise<Company> {
  const results = await sql`
    INSERT INTO public.companies (user_id, name, description, industry, stage, location, website, logo_url, founded_year, team_size, funding_target)
    VALUES (${data.user_id}, ${data.name}, ${data.description || null}, ${data.industry || null}, ${data.stage || null}, ${data.location || null}, ${data.website || null}, ${data.logo_url || null}, ${data.founded_year || null}, ${data.team_size || null}, ${data.funding_target || null})
    RETURNING *
  `
  return results[0]
}

export async function updateCompany(id: string, data: Partial<Company>): Promise<Company> {
  const results = await sql`
    UPDATE public.companies 
    SET name = COALESCE(${data.name}, name),
        description = COALESCE(${data.description}, description),
        industry = COALESCE(${data.industry}, industry),
        stage = COALESCE(${data.stage}, stage),
        location = COALESCE(${data.location}, location),
        website = COALESCE(${data.website}, website),
        funding_target = COALESCE(${data.funding_target}, funding_target),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
    RETURNING *
  `
  return results[0]
}

// ============ INVESTORS ============

export async function getInvestors(filters?: { type?: string; industry?: string; stage?: string }): Promise<Investor[]> {
  if (!filters || Object.keys(filters).length === 0) {
    return sql`SELECT * FROM public.investors ORDER BY name`
  }
  
  // Simple filter - can be expanded
  return sql`SELECT * FROM public.investors ORDER BY name`
}

export async function getInvestorById(id: string): Promise<Investor | null> {
  const results = await sql`SELECT * FROM public.investors WHERE id = ${id}`
  return results[0] || null
}

export async function createInvestor(data: Partial<Investor> & { name: string }): Promise<Investor> {
  const results = await sql`
    INSERT INTO public.investors (name, type, firm_name, description, website, logo_url, location, check_size_min, check_size_max, industries, stages, contact_email)
    VALUES (${data.name}, ${data.type || null}, ${data.firm_name || null}, ${data.description || null}, ${data.website || null}, ${data.logo_url || null}, ${data.location || null}, ${data.check_size_min || null}, ${data.check_size_max || null}, ${JSON.stringify(data.industries || [])}, ${JSON.stringify(data.stages || [])}, ${data.contact_email || null})
    RETURNING *
  `
  return results[0]
}

// ============ DEALS ============

export async function getDealsByCompanyId(companyId: string): Promise<Deal[]> {
  return sql`SELECT * FROM public.deals WHERE company_id = ${companyId} ORDER BY created_at DESC`
}

export async function getDealById(id: string): Promise<Deal | null> {
  const results = await sql`SELECT * FROM public.deals WHERE id = ${id}`
  return results[0] || null
}

export async function createDeal(data: { company_id: string; investor_id: string; status?: string }): Promise<Deal> {
  const results = await sql`
    INSERT INTO public.deals (company_id, investor_id, status)
    VALUES (${data.company_id}, ${data.investor_id}, ${data.status || 'prospect'})
    RETURNING *
  `
  return results[0]
}

export async function updateDealStatus(id: string, status: string, notes?: string): Promise<Deal> {
  const results = await sql`
    UPDATE public.deals 
    SET status = ${status}, notes = COALESCE(${notes}, notes), updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
    RETURNING *
  `
  return results[0]
}

// ============ INVESTOR MATCHES ============

export async function getMatchesByCompanyId(companyId: string): Promise<InvestorMatch[]> {
  return sql`SELECT * FROM public.investor_matches WHERE company_id = ${companyId} ORDER BY match_score DESC`
}

export async function createMatch(data: { company_id: string; investor_id: string; match_score: number; match_factors?: Record<string, unknown> }): Promise<InvestorMatch> {
  const results = await sql`
    INSERT INTO public.investor_matches (company_id, investor_id, match_score, match_factors)
    VALUES (${data.company_id}, ${data.investor_id}, ${data.match_score}, ${JSON.stringify(data.match_factors || {})})
    ON CONFLICT (company_id, investor_id) DO UPDATE SET match_score = ${data.match_score}, match_factors = ${JSON.stringify(data.match_factors || {})}
    RETURNING *
  `
  return results[0]
}

// ============ PITCH DECKS ============

export async function getPitchDecksByCompanyId(companyId: string): Promise<PitchDeck[]> {
  return sql`SELECT * FROM public.pitch_decks WHERE company_id = ${companyId} ORDER BY version DESC`
}

export async function createPitchDeck(data: { company_id: string; title: string; file_url: string; file_size?: number; slides_count?: number }): Promise<PitchDeck> {
  const results = await sql`
    INSERT INTO public.pitch_decks (company_id, title, file_url, file_size, slides_count)
    VALUES (${data.company_id}, ${data.title}, ${data.file_url}, ${data.file_size || null}, ${data.slides_count || null})
    RETURNING *
  `
  return results[0]
}

// ============ ACTIVITIES ============

export async function getActivitiesByCompanyId(companyId: string, limit = 20): Promise<Activity[]> {
  return sql`SELECT * FROM public.activities WHERE company_id = ${companyId} ORDER BY created_at DESC LIMIT ${limit}`
}

export async function createActivity(data: { user_id?: string; company_id?: string; deal_id?: string; type: string; title: string; description?: string }): Promise<Activity> {
  const results = await sql`
    INSERT INTO public.activities (user_id, company_id, deal_id, type, title, description)
    VALUES (${data.user_id || null}, ${data.company_id || null}, ${data.deal_id || null}, ${data.type}, ${data.title}, ${data.description || null})
    RETURNING *
  `
  return results[0]
}

// ============ DATA ROOM FILES ============

export async function getDataRoomFilesByCompanyId(companyId: string): Promise<DataRoomFile[]> {
  return sql`SELECT * FROM public.data_room_files WHERE company_id = ${companyId} ORDER BY folder, name`
}

export async function createDataRoomFile(data: { company_id: string; name: string; file_url: string; file_type?: string; file_size?: number; folder?: string; uploaded_by?: string }): Promise<DataRoomFile> {
  const results = await sql`
    INSERT INTO public.data_room_files (company_id, name, file_url, file_type, file_size, folder, uploaded_by)
    VALUES (${data.company_id}, ${data.name}, ${data.file_url}, ${data.file_type || null}, ${data.file_size || null}, ${data.folder || 'general'}, ${data.uploaded_by || null})
    RETURNING *
  `
  return results[0]
}

// ============ CONTACTS ============

export async function getContactsByUserId(userId: string): Promise<Contact[]> {
  return sql`SELECT * FROM public.contacts WHERE user_id = ${userId} ORDER BY last_name, first_name`
}

export async function createContact(data: { user_id: string; investor_id: string; first_name?: string; last_name?: string; email?: string; title?: string }): Promise<Contact> {
  const results = await sql`
    INSERT INTO public.contacts (user_id, investor_id, first_name, last_name, email, title)
    VALUES (${data.user_id}, ${data.investor_id}, ${data.first_name || null}, ${data.last_name || null}, ${data.email || null}, ${data.title || null})
    RETURNING *
  `
  return results[0]
}
