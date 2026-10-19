import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireDevice } from './access.functions';
import { admin, sha256 } from './device.server';
import { busyDate } from './busy-model';

const source = z.record(z.string().max(500)).refine(v => Object.keys(v).length <= 10);
const rowSchema = z.object({ row: z.number().int().positive(), entry_date: z.string().refine(v => !!busyDate(v), 'Invalid date'), source_reference: z.string().min(1).max(200).refine(v => !!v.trim()), maal_diya: z.string().max(200).refine(v => !!v.trim()), maal_liya: z.string().max(200), weight_value: z.string().max(30).refine(v => v === '' || /^\d+(\.\d+)?$/.test(v), 'Invalid quantity'), vehicle_no: z.string().max(50), source_values: source, action: z.enum(['new', 'update']), existing_updated_at: z.string().datetime().optional(), allow_incomplete: z.boolean(), weight_confirmed: z.literal(true) }).superRefine((r, ctx) => {
  if (!r.allow_incomplete && (!r.weight_value || !r.vehicle_no.trim())) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Missing weight or vehicle' });
  if (r.action === 'update' && !r.existing_updated_at) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Preview existing voucher again' });
});
export const previewBusy = createServerFn({ method: 'POST' }).middleware([requireDevice]).inputValidator((v: unknown) => z.object({ company: z.string().trim().min(1).max(200), references: z.array(z.string().max(200)).max(500), count: z.number().int().min(0).max(500) }).parse(v)).handler(async ({ data }) => {
  const db = await admin();
  const [existing, numbers] = await Promise.all([
    db.from('transport_entries').select('id,bill_no,register_serial_no,source_reference,source_values,updated_at,maal_liya,archived_at,cancelled_at').eq('source_system', 'BUSY').eq('source_company', data.company).in('source_reference', data.references),
    db.rpc('busy_proposed_numbers', { p_count: data.count }),
  ]);
  if (existing.error || numbers.error) throw new Error('Could not check duplicates. Try again online.');
  return { existing: existing.data ?? [], numbers: numbers.data as string[] };
});
export const confirmBusy = createServerFn({ method: 'POST' }).middleware([requireDevice]).inputValidator((v: unknown) => z.object({ id: z.string().uuid(), filename: z.string().min(1).max(255), company: z.string().trim().min(1).max(200), candidate_count: z.number().int().min(0).max(500), review_count: z.number().int().min(0).max(500), rows: z.array(rowSchema).min(1).max(500) }).parse(v)).handler(async ({ data, context }) => {
  const db = await admin();
  const hash = await sha256(JSON.stringify(data));
  const { data: result, error } = await db.rpc('import_busy_batch', { p_id: data.id, p_filename: data.filename, p_company: data.company, p_device: context.deviceId, p_hash: hash, p_candidates: data.candidate_count, p_review: data.review_count, p_rows: data.rows });
  if (error) throw new Error('Import could not be confirmed. Check Import History before trying again.');
  return result;
});
export const busyHistory = createServerFn({ method: 'GET' }).middleware([requireDevice]).handler(async () => {
  const db = await admin();
  const { data, error } = await db.from('import_batches').select('*').order('created_at', { ascending: false }).limit(50);
  if (error) throw new Error('Import history is unavailable.');
  return data ?? [];
});