// ⚠️ DEMO ONLY — this file contains INTENTIONAL security vulnerabilities
// used to demonstrate Datadog PR Gates (SAST + SCA + Secret Scanning).
// It is in the `demo/security-issues` branch ONLY and must NEVER merge to main.
//
// PR Gates will detect:
//   1. SQL injection vulnerability (SAST — Critical)
//   2. Used alongside a known-CVE dependency added to package.json (SCA)
//   3. Hardcoded API key (Secret Scanning)

import { NextResponse } from 'next/server';

// ── VULNERABILITY 1: Hardcoded API key (Secret Scanning) ─────────────────────
// Datadog Secret Scanning will flag this pattern as a leaked secret.
const PAYMENT_API_KEY = 'sk_live_4xKj8mNpQrStUvWxYzAb2CdEfGhIjKlMnOpQr'; // noqa

// ── VULNERABILITY 2: SQL Injection (SAST — Critical) ─────────────────────────
// User input is concatenated directly into a SQL-like query string without
// sanitization. Datadog Static Analysis will flag this as a critical injection.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const productId = searchParams.get('id');

  // INSECURE: direct string interpolation of user input into query
  // Datadog SAST rule: javascript-node-security/sql-injection
  const query = `SELECT * FROM products WHERE id = '${productId}'`;

  // In a real app this would execute the query — for demo purposes we just
  // return the constructed string so Datadog SAST can detect the pattern.
  console.log(`Executing: ${query}`);

  return NextResponse.json({
    demo: true,
    note: 'This endpoint contains intentional SAST vulnerabilities for PR Gates demo',
    query_preview: query.substring(0, 30) + '...',
  });
}
