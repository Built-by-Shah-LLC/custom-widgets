import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { supabase } from '@/lib/db';
import {
  AllowedDomainsUnavailableError,
  getAllowedDomains,
  getRequestOrigin,
  isOriginAllowed,
} from '@/lib/domain-utils';
import { NO_STORE_HEADERS } from '@/lib/cache-headers';
import * as formConfig from '@/lib/form-config';

export const dynamic = 'force-dynamic';

// Strict UUID so an invalid id is rejected before hitting the DB.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Leaky-bucket rate limit keyed by client IP — in-memory per instance, good
// enough to blunt casual abuse on the public submit endpoint.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;
const hits = new Map<string, { count: number; resetAt: number }>();

function clientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || entry.resetAt <= now) {
    hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_MAX;
}

function corsHeaders(request: Request, allowed: boolean): Record<string, string> {
  const origin = getRequestOrigin(request);
  if (!allowed) {
    return {
      ...NO_STORE_HEADERS,
      'Content-Type': 'application/json',
      'Vary': 'Origin, Referer',
    };
  }
  return {
    ...NO_STORE_HEADERS,
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin, Referer',
  };
}

function clampString(value: unknown, max: number): string {
  return String(value ?? '')
    .slice(0, max)
    .trim();
}

/**
 * Public form-submission intake for the embed widget. Origin-checked against
 * the allowed_domains allowlist, rate-limited, honeypot-filtered, then the
 * answers are re-validated against the row's `steps` config (including
 * conditional-visibility rules) before storing to form_submissions and/or
 * delivering to a webhook / email per the row's settings.
 */
export async function OPTIONS(request: Request) {
  let allowedDomains: string[];
  try {
    allowedDomains = await getAllowedDomains();
  } catch (error) {
    if (error instanceof AllowedDomainsUnavailableError) {
      return NextResponse.json(
        { error: 'Widget access policy unavailable' },
        { status: 503, headers: corsHeaders(request, false) }
      );
    }
    throw error;
  }
  const origin = getRequestOrigin(request);
  const allowed = isOriginAllowed(origin, allowedDomains);
  return new NextResponse(null, {
    status: allowed ? 204 : 403,
    headers: corsHeaders(request, allowed),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const headers = (allowed: boolean) => corsHeaders(request, allowed);

  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { error: 'Invalid form id' },
      { status: 400, headers: headers(false) }
    );
  }

  let allowedDomains: string[];
  try {
    allowedDomains = await getAllowedDomains();
  } catch (error) {
    if (error instanceof AllowedDomainsUnavailableError) {
      return NextResponse.json(
        { error: 'Widget access policy unavailable' },
        { status: 503, headers: corsHeaders(request, false) }
      );
    }
    throw error;
  }
  const origin = getRequestOrigin(request);
  if (origin && !isOriginAllowed(origin, allowedDomains)) {
    return NextResponse.json(
      { error: 'Origin not allowed' },
      { status: 403, headers: headers(false) }
    );
  }

  if (rateLimited(clientIp(request))) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: headers(true) }
    );
  }

  let body: {
    answers?: unknown;
    meta?: Record<string, unknown>;
    schemaFingerprint?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON' },
      { status: 400, headers: headers(true) }
    );
  }

  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    body.answers === undefined ||
    typeof body.answers !== 'object' ||
    body.answers === null ||
    Array.isArray(body.answers)
  ) {
    return NextResponse.json(
      { error: 'answers object is required' },
      { status: 400, headers: headers(true) }
    );
  }
  const answers = body.answers as Record<string, unknown>;

  const { data: row, error: loadError } = await supabase
    .from('form_widgets')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (loadError || !row) {
    return NextResponse.json(
      { error: 'Form not found' },
      { status: 404, headers: headers(true) }
    );
  }

  const config = formConfig.formFromDbRow(row);

  const suppliedFingerprint =
    typeof body.schemaFingerprint === 'string' ? body.schemaFingerprint : null;
  if (
    suppliedFingerprint &&
    suppliedFingerprint !== formConfig.formSchemaFingerprint(row)
  ) {
    return NextResponse.json(
      {
        error: 'FORM_SCHEMA_CHANGED',
        message: 'This form changed while it was open. Please reload and try again.',
      },
      { status: 409, headers: headers(true) }
    );
  }

  const answerShapeError = formConfig.validateAnswerShape(config, answers);
  if (answerShapeError) {
    return NextResponse.json(
      { error: 'FORM_SCHEMA_CHANGED', message: answerShapeError },
      { status: 409, headers: headers(true) }
    );
  }

  // Honeypot: silent success + drop when the invisible field got a value.
  const honeypot = clampString(
    (body.meta?.honeypot ?? answers['website'] ?? '') as unknown,
    2000
  );
  if (config.honeypotEnabled && honeypot) {
    return NextResponse.json({ ok: true }, { headers: headers(true) });
  }

  // Re-validate every visible field against its config (server is the source
  // of truth — never trust client-side validation).
  const allFields = config.steps.flatMap((s) => s.fields);
  const fieldErrors: Record<string, string> = {};
  const storedAnswers: Record<string, unknown> = {};
  let missingRequiredField = false;
  let originDomain = '';
  try {
    originDomain = origin ? new URL(origin).hostname : '';
  } catch {
    originDomain = '';
  }
  const sanitizedMeta = {
    referrer: clampString(body.meta?.referrer as unknown, 2000),
    userAgent: clampString(body.meta?.userAgent as unknown, 1000),
    originDomain,
    ip: clientIp(request),
  };

  for (const step of config.steps) {
    if (!formConfig.stepVisible(step, answers)) continue;
    for (const field of step.fields) {
      if (!formConfig.fieldVisible(field, answers)) continue;

      const value = formConfig.fieldAnswer(field, answers);
      const error = formConfig.validateFieldValue(field, value);
      if (error) {
        fieldErrors[field.id] = error;
        if (
          !suppliedFingerprint &&
          !(field.id in answers) &&
          (field.validation?.required ?? field.required)
        ) {
          missingRequiredField = true;
        }
        continue;
      }

      if (field.type === 'static-text') continue;
      // Keep hidden-field defaults (e.g. injected campaign tags) in the
      // submission payload alongside visible answers.
      const clean = Array.isArray(value)
        ? value.map((v) => clampString(v as unknown, 5000))
        : clampString(value, 5000);
      storedAnswers[field.id] = Array.isArray(value) ? clean : clean;
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    if (missingRequiredField) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          message: 'This form changed while it was open. Please reload and try again.',
          fields: fieldErrors,
        },
        { status: 400, headers: headers(true) }
      );
    }
    return NextResponse.json(
      { error: 'Validation failed', fields: fieldErrors },
      { status: 400, headers: headers(true) }
    );
  }

  const submittedAt = new Date().toISOString();
  const summary = formConfig.summarizeAnswers(allFields, storedAnswers);

  // 1) Store (recommended — enables the submissions viewer later).
  if (config.storeSubmissions) {
    const { error: insertError } = await supabase
      .from('form_submissions')
      .insert({
        form_widget_id: row.id,
        answers: storedAnswers,
        meta: sanitizedMeta,
      });
    if (insertError) {
      console.error('[form-submit] store failed', insertError.message);
      return NextResponse.json(
        { error: 'Storage failed' },
        { status: 500, headers: headers(true) }
      );
    }
  }

  // 2) Webhook delivery (best effort — never fail the submission for it).
  if (config.submitWebhookUrl && process.env.DISABLE_EXTERNAL_DELIVERIES !== 'true') {
    void postWebhook(config.submitWebhookUrl, {
      formWidgetId: row.id,
      submittedAt,
      answers: storedAnswers,
      summary: Object.values(summary),
    });
  }

  // 3) Email notification (best effort).
  if (config.submitEmail && process.env.DISABLE_EXTERNAL_DELIVERIES !== 'true') {
    void sendSubmissionEmail(
      config.submitEmail,
      row.name,
      submittedAt,
      Object.values(summary)
    );
  }

  return NextResponse.json({ ok: true }, { headers: headers(true) });
}

async function postWebhook(
  url: string,
  payload: Record<string, unknown>
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[form-submit] webhook ${url} responded ${res.status}`);
    }
  } catch (err) {
    console.warn(`[form-submit] webhook delivery failed for ${url}`, err);
  } finally {
    clearTimeout(timer);
  }
}

async function sendSubmissionEmail(
  recipients: string,
  widgetName: string,
  submittedAt: string,
  answers: { label: string; value: string }[]
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_FROM || process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    console.warn('[form-submit] missing RESEND_API_KEY or ALERT_FROM — email not sent');
    return;
  }
  const to = recipients
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
  if (to.length === 0) return;

  const lines = answers
    .map((a) => `${a.label}: ${a.value}`)
    .join('\n');

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to,
      subject: `New submission — ${widgetName}`,
      text: `A new submission was received via "${widgetName}".\n\n${lines}\n\nSubmitted: ${submittedAt}`,
    });
    if (error) console.error('[form-submit] Resend error:', error);
  } catch (err) {
    console.error('[form-submit] failed to send email', err);
  }
}
