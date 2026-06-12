import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: process.env.DD_SERVICE ?? 'box-box-bits-ai',
    env: process.env.DD_ENV ?? 'development',
    ts: Date.now(),
  });
}
