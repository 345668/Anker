import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { 
  Upload, FileText, Loader2, CheckCircle, X, Sparkles
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export default function PitchDeckUploader({ onUploadComplete, currentUrl }) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedUrl, setUploadedUrl] = useState(currentUrl || '');
  const [fileName, setFileName] = useState('');

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) handleFileUpload(file);
  };

  const handleFileUpload = async (file) => {
    if (!file) return;

    // Validate file type
    const validTypes = ['application/pdf', 'application/vnd.ms-powerpoint', 
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'];
    
    if (!validTypes.includes(file.type) && !file.name.match(/\.(pdf|ppt|pptx)$/i)) {
      alert('Please upload a PDF or PowerPoint file');
      return;
    }

    setIsUploading(true);
    setFileName(file.name);
    setUploadProgress(0);

    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      
      clearInterval(progressInterval);
      setUploadProgress(100);
      setUploadedUrl(file_url);
      
      if (onUploadComplete) {
        onUploadComplete(file_url, file.name);
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to upload file. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const clearUpload = () => {
    setUploadedUrl('');
    setFileName('');
    if (onUploadComplete) {
      onUploadComplete('', '');
    }
  };

  return (
    <div className="space-y-4">
      {!uploadedUrl ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer",
            isDragging 
              ? "border-indigo-500 bg-indigo-50" 
              : "border-slate-200 hover:border-indigo-400 hover:bg-slate-50",
            isUploading && "pointer-events-none"
          )}
          onClick={() => !isUploading && document.getElementById('pitch-deck-input').click()}
        >
          <input
            id="pitch-deck-input"
            type="file"
            accept=".pdf,.ppt,.pptx"
            onChange={handleFileSelect}
            className="hidden"
            disabled={isUploading}
          />

          {isUploading ? (
            <div className="space-y-4">
              <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mx-auto" />
              <div>
                <p className="text-sm font-medium text-slate-700">Uploading {fileName}...</p>
                <Progress value={uploadProgress} className="mt-2 h-2 max-w-xs mx-auto" />
              </div>
            </div>
          ) : (
            <>
              <div className="w-14 h-14 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Upload className="w-7 h-7 text-indigo-600" />
              </div>
              <p className="text-base font-medium text-slate-700">
                Drop your pitch deck here or click to browse
              </p>
              <p className="text-sm text-slate-500 mt-1">
                Supports PDF and PowerPoint files (max 50MB)
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="font-medium text-emerald-900">
                {fileName || 'Pitch deck uploaded'}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-xs text-emerald-700">Ready for AI analysis</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              asChild
              className="border-emerald-300"
            >
              <a href={uploadedUrl} target="_blank" rel="noopener noreferrer">
                View
              </a>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={clearUpload}
              className="text-slate-400 hover:text-red-600"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {uploadedUrl && (
        <div className="flex items-center gap-2 text-sm text-indigo-600">
          <Sparkles className="w-4 h-4" />
          <span>Your pitch deck is ready for AI-powered analysis</span>
        </div>
      )}
    </div>
  );
}