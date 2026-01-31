import * as pdfjsLib from 'pdfjs-dist';

// Use unpkg.com CDN with dynamic version matching for the worker
// This ensures the worker version matches the installed pdfjs-dist package
const pdfjsVersion = pdfjsLib.version || '5.4.449';
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`;

export interface PDFParseResult {
  text: string;
  pageCount: number;
  metadata?: {
    title?: string;
    author?: string;
    subject?: string;
    creator?: string;
  };
}

export async function extractTextFromPDF(file: File): Promise<string> {
  // Validate file before processing
  if (!file) {
    throw new Error('No file provided');
  }
  
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('File must be a PDF document');
  }
  
  // Check file size (max 50MB)
  const MAX_FILE_SIZE = 50 * 1024 * 1024;
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('PDF file is too large. Maximum size is 50MB.');
  }
  
  if (file.size === 0) {
    throw new Error('PDF file is empty');
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    
    // Enhanced PDF loading with better configuration
    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      useWorkerFetch: true,
      isEvalSupported: false, // Disable eval for security
      useSystemFonts: true,
    });
    
    const pdf = await loadingTask.promise;
    
    if (pdf.numPages === 0) {
      throw new Error('PDF has no pages');
    }
    
    let fullText = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
      try {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        fullText += `\n--- Page ${i} ---\n${pageText}`;
      } catch (pageError) {
        console.warn(`Failed to extract text from page ${i}:`, pageError);
        fullText += `\n--- Page ${i} ---\n[Could not extract text from this page]`;
      }
    }
    
    return fullText.trim();
  } catch (error: any) {
    // Provide more helpful error messages
    if (error.name === 'PasswordException') {
      throw new Error('PDF is password protected. Please provide an unprotected PDF.');
    }
    if (error.name === 'InvalidPDFException') {
      throw new Error('The file appears to be corrupted or is not a valid PDF.');
    }
    if (error.message?.includes('worker')) {
      throw new Error('PDF processing failed. Please try again or use a different PDF.');
    }
    
    console.error('PDF extraction error:', error);
    throw new Error(`Failed to extract text from PDF: ${error.message || 'Unknown error'}`);
  }
}

export async function extractTextFromPDFWithMetadata(file: File): Promise<PDFParseResult> {
  // Validate file before processing
  if (!file) {
    throw new Error('No file provided');
  }
  
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('File must be a PDF document');
  }
  
  const MAX_FILE_SIZE = 50 * 1024 * 1024;
  if (file.size > MAX_FILE_SIZE) {
    throw new Error('PDF file is too large. Maximum size is 50MB.');
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    
    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      useWorkerFetch: true,
      isEvalSupported: false,
      useSystemFonts: true,
    });
    
    const pdf = await loadingTask.promise;
    
    // Extract metadata
    let metadata: PDFParseResult['metadata'] = {};
    try {
      const pdfMetadata = await pdf.getMetadata();
      if (pdfMetadata.info) {
        metadata = {
          title: (pdfMetadata.info as any).Title,
          author: (pdfMetadata.info as any).Author,
          subject: (pdfMetadata.info as any).Subject,
          creator: (pdfMetadata.info as any).Creator,
        };
      }
    } catch (metaError) {
      console.warn('Failed to extract PDF metadata:', metaError);
    }
    
    let fullText = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
      try {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        fullText += `\n--- Page ${i} ---\n${pageText}`;
      } catch (pageError) {
        console.warn(`Failed to extract text from page ${i}:`, pageError);
        fullText += `\n--- Page ${i} ---\n[Could not extract text from this page]`;
      }
    }
    
    return {
      text: fullText.trim(),
      pageCount: pdf.numPages,
      metadata,
    };
  } catch (error: any) {
    if (error.name === 'PasswordException') {
      throw new Error('PDF is password protected. Please provide an unprotected PDF.');
    }
    if (error.name === 'InvalidPDFException') {
      throw new Error('The file appears to be corrupted or is not a valid PDF.');
    }
    
    console.error('PDF extraction error:', error);
    throw new Error(`Failed to extract text from PDF: ${error.message || 'Unknown error'}`);
  }
}

export function validatePDFFile(file: File): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }
  
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    return { valid: false, error: 'File must be a PDF document' };
  }
  
  const MAX_FILE_SIZE = 50 * 1024 * 1024;
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: 'PDF file is too large. Maximum size is 50MB.' };
  }
  
  if (file.size === 0) {
    return { valid: false, error: 'PDF file is empty' };
  }
  
  return { valid: true };
}
