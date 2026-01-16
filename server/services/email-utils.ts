import DOMPurify from 'isomorphic-dompurify';

const EMAIL_SAFE_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr', 'div', 'span',
  'strong', 'b', 'em', 'i', 'u', 's', 'strike',
  'a', 'img',
  'ul', 'ol', 'li',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'blockquote', 'pre', 'code',
];

const EMAIL_SAFE_ATTRS = [
  'href', 'src', 'alt', 'title', 'target',
  'width', 'height', 'style', 'class', 'id',
  'align', 'valign', 'border', 'cellpadding', 'cellspacing',
  'bgcolor', 'color',
];

export function sanitizeEmailHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: EMAIL_SAFE_TAGS,
    ALLOWED_ATTR: EMAIL_SAFE_ATTRS,
    FORBID_TAGS: ['script', 'style', 'svg', 'math', 'iframe', 'object', 'embed', 'form', 'input', 'button'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
    ALLOW_DATA_ATTR: false,
    KEEP_CONTENT: true,
  });
}

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface PersonalizationContext {
  name?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  startupName?: string;
  startupIndustry?: string;
  founderName?: string;
  investorFirm?: string;
  investorTitle?: string;
  investorFirstName?: string;
  investorLastName?: string;
  dealTitle?: string;
  targetAmount?: string;
  stage?: string;
  location?: string;
  meetingLink?: string;
  [key: string]: string | undefined;
}

const SUPPORTED_VARIABLES = [
  'name', 'firstName', 'lastName', 'company',
  'startupName', 'startupIndustry', 'founderName',
  'investorFirm', 'investorTitle', 'investorFirstName', 'investorLastName',
  'dealTitle', 'targetAmount', 'stage', 'location', 'meetingLink',
];

export function personalizeContent(template: string, context: PersonalizationContext): string {
  let result = template;
  
  for (const variable of SUPPORTED_VARIABLES) {
    const value = context[variable] || '';
    const regex = new RegExp(`\\{\\{${variable}\\}\\}`, 'gi');
    result = result.replace(regex, value);
  }
  
  result = result.replace(/\{\{[^}]+\}\}/g, '');
  
  return result;
}

export function buildPersonalizationContext(data: {
  investor?: {
    name?: string;
    title?: string;
    firm?: string;
  };
  startup?: {
    name?: string;
    industry?: string;
    targetAmount?: number;
    stage?: string;
    location?: string;
  };
  founder?: {
    name?: string;
  };
  recipient?: {
    name?: string;
    email?: string;
    company?: string;
  };
  custom?: Record<string, string>;
}): PersonalizationContext {
  const { investor, startup, founder, recipient, custom } = data;
  
  const recipientName = recipient?.name || '';
  const nameParts = recipientName.split(' ');
  
  const investorName = investor?.name || '';
  const investorNameParts = investorName.split(' ');
  
  return {
    name: recipientName,
    firstName: nameParts[0] || '',
    lastName: nameParts.slice(1).join(' ') || '',
    company: recipient?.company || investor?.firm || '',
    
    startupName: startup?.name || '',
    startupIndustry: startup?.industry || '',
    founderName: founder?.name || '',
    
    investorFirm: investor?.firm || '',
    investorTitle: investor?.title || '',
    investorFirstName: investorNameParts[0] || '',
    investorLastName: investorNameParts.slice(1).join(' ') || '',
    
    targetAmount: startup?.targetAmount ? `$${(startup.targetAmount / 1000000).toFixed(1)}M` : '',
    stage: startup?.stage || '',
    location: startup?.location || '',
    
    ...custom,
  };
}

export const RESEND_ERROR_CODES: Record<string, { userMessage: string; retryable: boolean }> = {
  'validation_error': { userMessage: 'Invalid recipient email address', retryable: false },
  'rate_limit_exceeded': { userMessage: 'Email service rate limit reached, please try again in a few minutes', retryable: true },
  'forbidden': { userMessage: 'Sender domain not authorized', retryable: false },
  'not_found': { userMessage: 'Email service configuration error', retryable: false },
  'internal_server_error': { userMessage: 'Email service temporarily unavailable', retryable: true },
  'service_unavailable': { userMessage: 'Email service temporarily unavailable', retryable: true },
  'missing_required_field': { userMessage: 'Missing required email field', retryable: false },
  'invalid_api_key': { userMessage: 'Email service authentication failed', retryable: false },
  'daily_quota_exceeded': { userMessage: 'Daily email quota exceeded, please try again tomorrow', retryable: false },
  'bounce_limit_exceeded': { userMessage: 'Too many bounces, email sending temporarily suspended', retryable: false },
  'suppression_error': { userMessage: 'Recipient has unsubscribed from this sender', retryable: false },
};

export interface SendError {
  code: string;
  message: string;
  userMessage: string;
  retryable: boolean;
}

export function parseResendError(error: any): SendError {
  const errorName = error?.name || error?.type || 'unknown_error';
  const errorMessage = error?.message || 'Unknown error occurred';
  
  const mappedError = RESEND_ERROR_CODES[errorName] || {
    userMessage: 'Failed to send email. Please try again.',
    retryable: true,
  };
  
  return {
    code: errorName,
    message: errorMessage,
    userMessage: mappedError.userMessage,
    retryable: mappedError.retryable,
  };
}

export function getSupportedVariables(): string[] {
  return [...SUPPORTED_VARIABLES];
}
