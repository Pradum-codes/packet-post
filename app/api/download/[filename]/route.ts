import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join, basename } from 'path';
import { tmpdir } from 'os';

export const runtime = 'nodejs';

const UPLOAD_DIR = join(tmpdir(), 'packet-post-uploads');

type Params = {
  params: Promise<{
    filename: string;
  }>;
};

export async function GET(request: NextRequest, context: Params) {
  try {
    const { filename } = await context.params;
    const safeName = basename(filename);
    const path = join(UPLOAD_DIR, safeName);
    const data = await readFile(path);

    const originalName = request.nextUrl.searchParams.get('name') || safeName;
    const contentType = 'application/octet-stream';

    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(originalName)}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'File not found or expired' },
      { status: 404 }
    );
  }
}
