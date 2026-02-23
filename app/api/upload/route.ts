import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, readdir, unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads');

// Clean up old files (older than 1 hour)
async function cleanupOldFiles() {
  try {
    if (!existsSync(UPLOAD_DIR)) return;
    
    const files = await readdir(UPLOAD_DIR);
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    
    for (const file of files) {
      const filePath = join(UPLOAD_DIR, file);
      const stats = await import('fs').then(fs => fs.promises.stat(filePath));
      if (stats.mtimeMs < oneHourAgo) {
        await unlink(filePath);
      }
    }
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}

export async function POST(request: NextRequest) {
  try {
    // Ensure upload directory exists
    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true });
    }
    
    // Clean up old files occasionally
    if (Math.random() < 0.1) { // 10% chance on each upload
      cleanupOldFiles();
    }
    
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    
    if (!file) {
      return NextResponse.json(
        { success: false, message: 'No file provided' },
        { status: 400 }
      );
    }
    
    // Generate unique filename
    const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const ext = file.name.split('.').pop() || '';
    const filename = `${uniqueId}.${ext}`;
    const filepath = join(UPLOAD_DIR, filename);
    
    // Convert file to buffer and save
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await writeFile(filepath, buffer);
    
    // Return the download URL
    const downloadUrl = `/uploads/${filename}`;
    
    return NextResponse.json({
      success: true,
      link: downloadUrl,
      filename: file.name,
      size: file.size
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { success: false, message: 'Upload failed' },
      { status: 500 }
    );
  }
}
