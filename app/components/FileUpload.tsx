'use client';

import { useState, useRef, useEffect, DragEvent, ChangeEvent } from 'react';
import {
  Upload,
  File,
  X,
  Copy,
  Check,
  Download,
  Loader2,
  Image,
  Film,
  Music,
  FileText,
  Archive,
  Link as LinkIcon,
  Shield,
  Zap,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface UploadResult {
  success: boolean;
  link?: string;
  filename?: string;
  size?: number;
  message?: string;
}

function getFileIcon(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp'].includes(ext)) return Image;
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return Film;
  if (['mp3', 'wav', 'ogg', 'flac', 'aac'].includes(ext)) return Music;
  if (ext === 'pdf') return FileText;
  if (['doc', 'docx', 'txt', 'rtf'].includes(ext)) return FileText;
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return Archive;
  return File;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function FileUpload() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<UploadResult | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (file: File) => {
    setSelectedFile(file);
    setError('');
    setResult(null);
  };

  const handleRemove = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setError('');
    setResult(null);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        setResult(data);
      } else {
        setError(data.message || 'Upload failed');
      }
    } catch (err) {
      setError('Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const copyToClipboard = async () => {
    if (!result?.link) return;
    const fullLink = origin ? origin + result.link : result.link;
    try {
      await navigator.clipboard.writeText(fullLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      const textarea = document.createElement('textarea');
      textarea.value = fullLink;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const FileIcon = selectedFile ? getFileIcon(selectedFile.name) : Upload;
  const fullLink = result?.link ? (origin ? origin + result.link : result.link) : '';

  return (
    <div className="relative min-h-dvh w-full overflow-hidden bg-transparent">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_14%,rgba(6,182,212,0.14),transparent_34%),radial-gradient(circle_at_85%_8%,rgba(16,185,129,0.12),transparent_40%)]" />
      <div className="relative mx-auto grid min-h-dvh w-full max-w-4xl place-items-center p-3 md:p-4">
        <Card className="w-full border-zinc-700/60 bg-zinc-900/80 shadow-2xl backdrop-blur xl:max-w-3xl">
          <CardHeader className="space-y-3 border-b border-zinc-700/70 pb-4 md:pb-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge
                variant="secondary"
                className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-200"
              >
                No Signup Required
              </Badge>
              <div className="flex items-center gap-1.5 text-xs text-zinc-300">
                <Shield className="h-3.5 w-3.5 text-emerald-300" />
                Secure temporary links
              </div>
            </div>
            <div className="space-y-1">
              <CardTitle className="text-balance text-2xl font-semibold tracking-tight text-zinc-100 md:text-3xl">
                Share files in seconds
              </CardTitle>
              <CardDescription className="max-w-2xl text-sm text-zinc-300">
                Drop one file, upload instantly, then copy a ready-to-share link.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="grid gap-4 p-4 md:grid-cols-5 md:gap-6 md:p-6">
            <section className="space-y-3 md:col-span-3">
              <div
                className={cn(
                  'group relative rounded-xl border-2 border-dashed p-6 text-center transition-all',
                  isDragOver
                    ? 'border-emerald-400 bg-emerald-400/10 shadow-[0_0_0_4px_rgba(52,211,153,0.16)]'
                    : 'border-zinc-700 bg-zinc-900/70 hover:border-zinc-500 hover:bg-zinc-900'
                )}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800/80">
                  <FileIcon className="h-6 w-6 text-emerald-300" />
                </div>
                <p className="text-sm font-medium text-zinc-100">Drag and drop a file</p>
                <p className="mt-1 text-sm text-zinc-400">
                  or <span className="font-semibold text-emerald-300">browse your device</span>
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  id="fileInput"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>

              {selectedFile && (
                <div className="animate-fade-in rounded-xl border border-zinc-700 bg-zinc-900/70 p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
                      {(() => {
                        const Icon = getFileIcon(selectedFile.name);
                        return <Icon className="h-5 w-5 text-emerald-300" />;
                      })()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-100">{selectedFile.name}</p>
                      <p className="text-xs text-zinc-400">{formatFileSize(selectedFile.size)}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemove();
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {error && (
                <div className="animate-fade-in rounded-lg border border-red-300/40 bg-red-500/10 p-3 text-sm text-red-200">
                  {error}
                </div>
              )}

              <Button
                className="h-10 w-full bg-emerald-400 text-zinc-900 hover:bg-emerald-300"
                onClick={handleUpload}
                disabled={!selectedFile || isUploading}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload file
                  </>
                )}
              </Button>

              {result?.success && (
                <div className="animate-fade-in space-y-3 rounded-xl border border-emerald-300/40 bg-emerald-500/10 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-emerald-100">
                    <Check className="h-4 w-4" />
                    Upload successful
                  </div>
                  <div className="flex items-center gap-2">
                    <Input readOnly value={fullLink} className="h-9 border-emerald-200/30 bg-zinc-950 text-xs text-zinc-200" />
                    <Button size="icon" onClick={copyToClipboard} className="h-9 w-9 bg-emerald-400 text-zinc-900 hover:bg-emerald-300">
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                    <a
                      href={result.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        buttonVariants({ variant: 'outline', size: 'icon' }),
                        'h-9 w-9 border-emerald-200/40 bg-transparent text-emerald-100 hover:bg-emerald-500/20'
                      )}
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  </div>
                </div>
              )}
            </section>

            <section className="md:col-span-2">
              <div className="rounded-xl border border-zinc-700 bg-zinc-900/65 p-3 md:p-4">
                <h3 className="text-sm font-semibold text-zinc-100">How it works</h3>
                <Separator className="my-2 bg-zinc-700" />
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <Badge className="mt-0.5 h-5 w-5 justify-center rounded-full bg-emerald-400 p-0 text-xs text-zinc-900">1</Badge>
                    <p className="text-xs text-zinc-300">Choose a file from your computer.</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <Badge className="mt-0.5 h-5 w-5 justify-center rounded-full bg-emerald-400 p-0 text-xs text-zinc-900">2</Badge>
                    <p className="text-xs text-zinc-300">Upload it with one click.</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <Badge className="mt-0.5 h-5 w-5 justify-center rounded-full bg-emerald-400 p-0 text-xs text-zinc-900">3</Badge>
                    <p className="text-xs text-zinc-300">Copy your shareable download link.</p>
                  </div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3 md:grid-cols-1">
                <div className="rounded-lg border border-zinc-700 bg-zinc-900/65 p-2">
                  <div className="mb-1 flex items-center gap-1.5 text-emerald-200">
                    <Zap className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">Fast transfer</span>
                  </div>
                  <p className="text-xs text-zinc-400">Optimized upload flow for quick sharing.</p>
                </div>
                <div className="rounded-lg border border-zinc-700 bg-zinc-900/65 p-2">
                  <div className="mb-1 flex items-center gap-1.5 text-emerald-200">
                    <LinkIcon className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">Direct links</span>
                  </div>
                  <p className="text-xs text-zinc-400">Get a clean link right after upload.</p>
                </div>
                <div className="rounded-lg border border-zinc-700 bg-zinc-900/65 p-2">
                  <div className="mb-1 flex items-center gap-1.5 text-emerald-200">
                    <Shield className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium">Simple + safe</span>
                  </div>
                  <p className="text-xs text-zinc-400">No account required to share files.</p>
                </div>
              </div>
            </section>
          </CardContent>

          <CardFooter className="justify-between border-t border-zinc-700 px-4 py-3 text-xs text-zinc-400 md:px-6">
            <span className='text-emerald-200'>Packet Post</span>
            <span>Built with Next.js, Tailwind, Shadcn and Lot's of Coffee</span>
            {/* credit to the creator */}
            <span>Created by <a href="https://github.com/atomic-panda/file-share"> <span className='text-emerald-200'> Atomic Panda</span></a></span>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
