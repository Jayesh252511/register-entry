import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Link } from '@tanstack/react-router';
import { Check, FileSpreadsheet, Loader2, RefreshCw, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { PageTitle } from './EntryViews';
import { BUSY_FIELDS, changedSource, detectMapping, duplicateFileRows, parseBusyRows, rowIssues, type BusyRow, type Mapping } from '@/lib/busy-model';
import { readBusyWorkbook, type BusySheet } from '@/lib/busy-workbook';
import { busyHistory, confirmBusy, previewBusy } from '@/lib/busy.functions';
import { getState, sync, useRegister } from '@/lib/local-store';

const LABELS = { entry_date: 'Date', source_reference: 'BUSY Voucher Reference', maal_diya: 'माल दिया / Party Name', weight_value: 'Qty. / वजन', unit: 'Unit', vehicle_no: 'गाड़ी नं. / Vehicle Number', item: 'Item Details' };
type Comparison = Awaited<ReturnType<typeof previewBusy>>;
type Batch = Awaited<ReturnType<typeof confirmBusy>>;
type Submission = Parameters<typeof confirmBusy>[0]['data'];
const EMPTY_MAPPING = Object.fromEntries(BUSY_FIELDS.map(k => [k, -1])) as Mapping;

export function BusyImport() {
  const { online } = useRegister();
  const upload = useRef<HTMLInputElement>(null);
  const submission = useRef<Submission | null>(null);
  const previewFn = useServerFn(previewBusy), confirmFn = useServerFn(confirmBusy);
  const history = useQuery({ queryKey: ['busy-history'], queryFn: () => busyHistory(), retry: false, enabled: online });
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<BusySheet[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [header, setHeader] = useState(0);
  const [mapping, setMapping] = useState<Mapping>(EMPTY_MAPPING);
  const [company, setCompany] = useState('');
  const [rows, setRows] = useState<BusyRow[]>([]);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [checkedCompany, setCheckedCompany] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState<'row' | 'date'>('row');
  const [incomplete, setIncomplete] = useState(false);
  const [weightConfirmed, setWeightConfirmed] = useState(false);
  const [fillReceiver, setFillReceiver] = useState('');
  const [result, setResult] = useState<Batch | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [historyOpen, setHistoryOpen] = useState<string | null>(null);
  const sheet = sheets[sheetIndex];
  const repeats = duplicateFileRows(rows);
  const existing = new Map((comparison?.existing ?? []).map(e => [e.source_reference, e]));
  const frozen = working || uncertain || !!result;

  function resetPreview() { setRows([]); setComparison(null); setResult(null); setWeightConfirmed(false); setError(''); submission.current = null; }
  function clear() { setFile(null); setSheets([]); resetPreview(); setCompany(''); setUncertain(false); if (upload.current) upload.current.value = ''; }
  function chooseSheet(i: number, choices = sheets) {
    const s = choices[i]; if (!s) return;
    const found = detectMapping(s.grid); setSheetIndex(i); setHeader(found.header); setMapping(found.mapping); resetPreview();
  }
  async function loadFile(f: File | undefined) {
    if (!f || frozen) return;
    setWorking(true); setError('');
    try {
      const parsed = await readBusyWorkbook(f);
      if (!parsed.length) throw new Error('No worksheets found.');
      setFile(f); setSheets(parsed); chooseSheet(0, parsed);
      setCompany(parsed[0]?.grid[0]?.[0]?.trim() ?? '');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not read workbook.'); }
    finally { setWorking(false); }
  }
  async function preview() {
    if (!sheet) return;
    setWorking(true); setError('');
    try {
      await sync();
      if (getState().syncError || getState().entries.some(e => e._pending)) throw new Error('Sync pending register entries first, then preview the import.');
      const candidates = parseBusyRows(sheet.grid, header, mapping);
      if (!candidates.length) throw new Error('No voucher rows found. Check the header row and column mapping.');
      if (candidates.length > 500) throw new Error('Preview up to 500 vouchers at a time. Export a smaller date range.');
      const res = await previewFn({ data: { company, references: candidates.map(r => r.source_reference), count: candidates.length } });
      const duplicates = duplicateFileRows(candidates);
      setRows(candidates.map(r => ({ ...r, selected: !duplicates.has(r.source_reference) && !res.existing.some(e => e.source_reference === r.source_reference) && !rowIssues(r, incomplete).length })));
      setComparison(res); setCheckedCompany(company.trim()); setResult(null); submission.current = null;
    } catch (e) { setError(e instanceof Error ? e.message : 'Preview failed.'); }
    finally { setWorking(false); }
  }
  function status(r: BusyRow) {
    if (repeats.has(r.source_reference)) return 'Duplicate within file';
    const old = existing.get(r.source_reference);
    if (old) {
      const diff = changedSource((old.source_values ?? {}) as Record<string, unknown>, r.source_values);
      if (r.action === 'update') return rowIssues(r, incomplete).length ? 'Missing required fields' : 'Ready to update';
      return diff.length ? 'Existing voucher has changed' : 'Duplicate — already imported';
    }
    return rowIssues(r, incomplete).length ? 'Missing required fields' : 'Ready to import';
  }
  const selected = rows.filter(r => r.selected);
  const duplicateCount = rows.filter(r => existing.has(r.source_reference) || repeats.has(r.source_reference)).length;
  const invalidCount = rows.filter(r => rowIssues(r, incomplete).length).length;
  const ready = selected.length > 0 && selected.every(r => ['Ready to import', 'Ready to update'].includes(status(r))) && !!comparison && weightConfirmed && checkedCompany === company.trim() && online;
  const visible = rows.filter(r => filter === 'all' || (filter === 'duplicates' ? existing.has(r.source_reference) || repeats.has(r.source_reference) : filter === 'issues' ? rowIssues(r, incomplete).length > 0 : r.selected)).sort((a, b) => sort === 'date' ? a.entry_date.localeCompare(b.entry_date) || a.row - b.row : a.row - b.row);
  const proposed = new Map<number, string>();
  // Numbers are supplied by the database; these are estimates, not reservations.
  selected.filter(r => r.action === 'new' && !existing.has(r.source_reference)).forEach((r, i) => proposed.set(r.row, comparison?.numbers[i] ?? 'Assigned on import'));
  function edit(row: number, key: keyof BusyRow, value: string) {
    setRows(current => current.map(r => r.row === row ? { ...r, [key]: value } : r));
  }
  function paste(event: React.ClipboardEvent<HTMLInputElement>, row: number, key: 'maal_liya' | 'vehicle_no' | 'weight_value' | 'maal_diya') {
    const text = event.clipboardData.getData('text');
    if (!text.includes('\n')) return;
    event.preventDefault();
    const start = visible.findIndex(r => r.row === row), values = text.replace(/\r/g, '').trimEnd().split('\n');
    setRows(current => current.map(r => {
      const i = visible.findIndex(v => v.row === r.row) - start;
      return i >= 0 && i < values.length ? { ...r, [key]: values[i]?.split('\t')[0] ?? '' } : r;
    }));
  }
  async function importRows(retry = false) {
    if (!retry && (!ready || !file)) return;
    if (!retry && !window.confirm(`Import ${selected.length} selected vouchers? Register Bill Nos. are assigned when saved. Approved updates keep their existing Bill No., serial and receiver.`)) return;
    if (!retry && file) submission.current = { id: crypto.randomUUID(), filename: file.name, company: checkedCompany, candidate_count: rows.length, review_count: rows.filter(r => rowIssues(r, incomplete).length || repeats.has(r.source_reference)).length, rows: selected.map(r => ({ row: r.row, source_reference: r.source_reference, entry_date: r.entry_date, maal_diya: r.maal_diya, maal_liya: r.maal_liya, weight_value: r.weight_value.trim(), vehicle_no: r.vehicle_no, action: r.action, existing_updated_at: r.existing_updated_at, source_values: r.source_values, allow_incomplete: incomplete, weight_confirmed: true as const })) };
    const payload = submission.current; if (!payload) return;
    setWorking(true); setError('');
    try {
      const saved = await confirmFn({ data: payload });
      setResult(saved); setUncertain(false); await history.refetch(); await sync();
      toast.success(`${saved.inserted_count} added · ${saved.updated_count} updated · ${saved.failed_count} failed`);
    } catch {
      const found = (await history.refetch()).data?.find(b => b.id === payload.id);
      if (found) { setResult(found); setUncertain(false); await sync(); }
      else { setUncertain(true); setError('Confirmation was interrupted. Check the batch result or retry the same request safely; do not choose a new file yet.'); }
    } finally { setWorking(false); }
  }
  const fields = ['entry_date', 'maal_diya', 'maal_liya', 'weight_value', 'vehicle_no'] as const;
  const fieldLabels = { entry_date: 'Date', maal_diya: 'माल दिया', maal_liya: 'माल लिया', weight_value: 'वजन (MT)', vehicle_no: 'गाड़ी नं.' };
  function inputs(r: BusyRow, mobile: boolean) {
    return fields.map((key, index) => {
      const input = <Input aria-label={`${fieldLabels[key]} row ${r.row}`} type={key === 'entry_date' ? 'date' : 'text'} inputMode={key === 'weight_value' ? 'decimal' : undefined} value={r[key]} disabled={frozen || (r.action === 'update' && key === 'maal_liya')} maxLength={key === 'weight_value' ? 30 : key === 'vehicle_no' ? 50 : 200} onChange={e => edit(r.row, key, e.target.value)} onPaste={e => { if (key !== 'entry_date') paste(e, r.row, key); }} onKeyDown={e => {
        if (e.key !== 'Enter') return; e.preventDefault();
        const nextKey = fields[index + 1];
        const label = nextKey ? `${fieldLabels[nextKey]} row ${r.row}` : `Date row ${visible[visible.findIndex(x => x.row === r.row) + 1]?.row}`;
        const root = e.currentTarget.closest('[data-preview]');
        const target = root?.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`); target?.focus();
      }} />;
      return mobile ? <div key={key} className={key === 'maal_diya' || key === 'maal_liya' ? 'col-span-2 space-y-1' : 'space-y-1'}><Label className="text-xs">{fieldLabels[key]}</Label>{input}</div> : <td key={key} className="min-w-36 p-2">{input}</td>;
    });
  }
  function rowActions(r: BusyRow) {
    const old = existing.get(r.source_reference), issues = rowIssues(r, incomplete), duplicate = repeats.get(r.source_reference);
    const differences = old ? changedSource((old.source_values ?? {}) as Record<string, unknown>, r.source_values) : [];
    return <div className="min-w-40 space-y-2 text-xs">
      <div className={status(r).startsWith('Ready') ? 'text-success font-semibold' : 'text-destructive font-semibold'}>{status(r)}</div>
      {issues.map(issue => <div key={issue}>{issue}</div>)}
      {duplicate && <div>Excel rows: {duplicate.join(', ')}. Review item rows; remove repeated candidates only after choosing the weight.</div>}
      {old && <div>Existing Bill No. {old.bill_no} · Sr. {old.register_serial_no}</div>}
      {differences.map(k => <div key={k} className="break-words">{k}: {String((old?.source_values as Record<string, unknown> | null)?.[k] ?? '—')} → {r.source_values[k]}</div>)}
      {old && differences.length > 0 && !old.archived_at && !old.cancelled_at && <Button size="sm" variant="outline" disabled={frozen} onClick={() => {
        if (!window.confirm(`Update Bill No. ${old.bill_no} from this BUSY voucher? The receiver, Bill No. and serial will stay unchanged.`)) return;
        setRows(current => current.map(x => x.row === r.row ? { ...x, action: 'update', selected: true, maal_liya: old.maal_liya, existing_updated_at: old.updated_at } : x));
      }}>Review & approve update</Button>}
      <Button variant="ghost" size="sm" disabled={frozen} onClick={() => { if (window.confirm(`Remove Excel row ${r.row} from this preview?`)) setRows(current => current.filter(x => x.row !== r.row)); }}><Trash2 /> Remove row</Button>
    </div>;
  }

  return <div className="space-y-7">
    <PageTitle title="Import from BUSY Excel" />
    {!online && <p className="text-destructive">You can read the workbook offline. Duplicate checks and final import need an internet connection.</p>}
    {error && <div role="alert" className="rounded-md border border-destructive p-4 text-destructive break-words">{error}</div>}
    <section className="space-y-4">
      <input ref={upload} aria-label="Upload BUSY Excel file" className="hidden" type="file" accept=".xlsx" onChange={e => void loadFile(e.target.files?.[0])} />
      <div onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void loadFile(e.dataTransfer.files[0]); }} className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed bg-muted/40 px-4 py-8 text-center">
        <FileSpreadsheet className="h-9 w-9 text-primary" />
        {file ? <div className="max-w-full"><div className="break-all font-semibold">{file.name}</div><div className="text-sm text-muted-foreground">{(file.size / 1024).toFixed(1)} KB · {sheets.length} worksheet{sheets.length === 1 ? '' : 's'}</div></div> : <div className="text-sm text-muted-foreground">BUSY Sales Vouchers · .xlsx</div>}
        <div className="flex flex-wrap justify-center gap-2"><Button size="lg" disabled={frozen} onClick={() => upload.current?.click()}>{working ? <Loader2 className="animate-spin" /> : <Upload />} {file ? 'Browse Files' : 'Upload Excel File'}</Button>{file && <Button variant="outline" disabled={working || uncertain} onClick={clear}><Trash2 /> Clear File</Button>}</div>
      </div>
      {sheet && <fieldset disabled={frozen} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1"><Label htmlFor="busy-company">Company / financial-year scope</Label><Input id="busy-company" maxLength={200} value={company} onChange={e => { setCompany(e.target.value); setComparison(null); }} /></div>
          <div className="space-y-1"><Label htmlFor="busy-sheet">Worksheet</Label><select id="busy-sheet" className="h-9 w-full rounded-md border bg-background px-3" value={sheetIndex} onChange={e => chooseSheet(Number(e.target.value))}>{sheets.map((s, i) => <option value={i} key={s.name}>{s.name}</option>)}</select></div>
          <div className="space-y-1"><Label htmlFor="busy-header">Header row</Label><Input id="busy-header" type="number" min={1} max={sheet.grid.length} value={header + 1} onChange={e => { setHeader(Math.max(0, Math.min(sheet.grid.length - 1, Number(e.target.value) - 1))); setRows([]); setComparison(null); }} /></div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {BUSY_FIELDS.map(k => <div key={k} className="space-y-1"><Label htmlFor={`map-${k}`} className="text-xs">{LABELS[k]}</Label><select id={`map-${k}`} value={mapping[k]} className="h-9 w-full rounded-md border bg-background px-2 text-sm" onChange={e => { setMapping(m => ({ ...m, [k]: Number(e.target.value) })); setRows([]); setComparison(null); }}><option value={-1}>Choose column</option>{sheet.grid[header]?.map((v, i) => <option key={i} value={i}>Column {i + 1}: {v || '(blank)'}</option>)}</select></div>)}
        </div>
        <Button disabled={working || !online || !company.trim() || ['entry_date', 'source_reference', 'maal_diya'].some(k => mapping[k as keyof Mapping] < 0) || (!incomplete && (mapping.weight_value < 0 || mapping.vehicle_no < 0))} onClick={() => void preview()}><Check /> Preview Import</Button>
      </fieldset>}
    </section>

    {sheet && <fieldset disabled={frozen} className="space-y-3 border-y py-4 text-sm">
      <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-primary" checked={incomplete} onChange={e => setIncomplete(e.target.checked)} />Allow blank weight or vehicle for later correction. Date, BUSY reference and party are still required for import; माल लिया is optional.</label>
      {rows.length > 0 && <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-primary" checked={weightConfirmed} onChange={e => setWeightConfirmed(e.target.checked)} /><span>I confirm the selected quantities represent weight in MT, without conversion. Source units: {[...new Set(rows.map(r => r.unit || '(blank)'))].join(', ')}.</span></label>}
    </fieldset>}

    {rows.length > 0 && <section className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{[['Candidate rows', rows.length], ['Valid new records', rows.filter(r => status(r) === 'Ready to import').length], ['Duplicates / existing', duplicateCount], ['Missing information', invalidCount], ['Selected', selected.length]].map(([label, n]) => <div key={label} className="border-l-2 border-primary pl-3"><div className="text-xs text-muted-foreground">{label}</div><div className="text-2xl font-semibold tabular">{n}</div></div>)}</div>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Filter preview" value={filter} onChange={e => setFilter(e.target.value)} className="h-9 rounded-md border bg-background px-2"><option value="all">All rows</option><option value="duplicates">Review Duplicates</option><option value="issues">Missing / invalid</option><option value="selected">Selected rows</option></select>
        <select aria-label="Sort preview" value={sort} onChange={e => setSort(e.target.value as 'row' | 'date')} className="h-9 rounded-md border bg-background px-2"><option value="row">Excel row order</option><option value="date">Date order (view only)</option></select>
        <Button variant="outline" disabled={frozen} onClick={() => setRows(current => current.map(r => ({ ...r, action: 'new', selected: status(r) === 'Ready to import' })))}>Import New Records Only</Button>
        <Button variant="ghost" disabled={frozen} onClick={() => setRows(current => current.map(r => ({ ...r, selected: false })))}>Deselect all</Button>
      </div>
      <div className="flex flex-wrap gap-2"><Input aria-label="Fill receiver for selected rows" placeholder="माल लिया for selected rows" className="max-w-xs" value={fillReceiver} onChange={e => setFillReceiver(e.target.value)} disabled={frozen} maxLength={200} /><Button variant="secondary" disabled={frozen || !selected.length} onClick={() => setRows(current => current.map(r => r.selected && r.action === 'new' ? { ...r, maal_liya: fillReceiver } : r))}>Fill selected receivers</Button></div>
      <div data-preview className="hidden max-h-[650px] overflow-auto border md:block">
        <table className="w-full text-sm"><thead className="sticky top-0 z-10 bg-muted text-left"><tr>{['Select', 'Row', 'BUSY Reference', 'Proposed Bill No.', ...fields.map(k => fieldLabels[k]), 'Status / Actions'].map(h => <th className="whitespace-nowrap p-2" key={h}>{h}</th>)}</tr></thead><tbody>
          {visible.map(r => <tr key={r.row} className="border-t"><td className="p-2"><input type="checkbox" aria-label={`Select row ${r.row}`} className="h-4 w-4 accent-primary" checked={r.selected} disabled={frozen || repeats.has(r.source_reference) || (!!existing.get(r.source_reference) && r.action !== 'update')} onChange={e => setRows(current => current.map(x => x.row === r.row ? { ...x, selected: e.target.checked } : x))} /></td><td className="p-2">{r.row}</td><td className="min-w-36 p-2 font-mono text-xs">{r.source_reference}<div className="mt-1 font-sans text-muted-foreground">{r.item} · {r.unit}</div></td><td className="p-2 font-mono">{existing.get(r.source_reference)?.bill_no ?? proposed.get(r.row) ?? '—'}</td>{inputs(r, false)}<td className="p-2">{rowActions(r)}</td></tr>)}
        </tbody></table>
      </div>
      <div data-preview className="space-y-3 md:hidden">{visible.map(r => <article key={r.row} className="space-y-3 rounded-md border bg-card p-4">
        <div className="flex items-start justify-between gap-3"><label className="flex items-center gap-2 font-semibold"><input type="checkbox" aria-label={`Select mobile row ${r.row}`} className="h-5 w-5 accent-primary" checked={r.selected} disabled={frozen || repeats.has(r.source_reference) || (!!existing.get(r.source_reference) && r.action !== 'update')} onChange={e => setRows(current => current.map(x => x.row === r.row ? { ...x, selected: e.target.checked } : x))} />Row {r.row}</label><span className="text-sm">Bill No. {existing.get(r.source_reference)?.bill_no ?? proposed.get(r.row) ?? '—'}</span></div>
        <div className="break-words font-mono text-sm">{r.source_reference}</div><div className="text-xs text-muted-foreground break-words">{r.item} · {r.unit}</div><div className="grid grid-cols-2 gap-3">{inputs(r, true)}</div>{rowActions(r)}
      </article>)}</div>
      {!visible.length && <p className="text-muted-foreground">No rows match this filter.</p>}
      {!result && <div className="sticky bottom-16 z-10 flex flex-wrap items-center justify-between gap-3 border-t bg-background py-4 md:bottom-0">
        <div className="text-sm"><strong>{selected.length} selected</strong><div className="text-xs text-muted-foreground">Excel order · final Bill Nos. assigned on save, never reserved in preview</div></div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={frozen} onClick={resetPreview}>Cancel Import</Button>{uncertain ? <Button disabled={working || !online} onClick={() => void importRows(true)}><RefreshCw /> Check / retry same batch</Button> : <Button disabled={!ready || working} onClick={() => void importRows()}>{working && <Loader2 className="animate-spin" />} Confirm Import</Button>}</div>
      </div>}
    </section>}
    {result && <section role="status" className="space-y-3 border-y py-5"><h2 className="text-lg font-semibold">Import result</h2><p>{result.inserted_count} added · {result.updated_count} updated · {result.duplicate_count} skipped as duplicates · {result.failed_count} failed</p><p className="break-all text-xs text-muted-foreground">Batch {result.id}</p><ResultRows results={result.results} /><Button asChild variant="outline"><Link to="/register">View Full Register</Link></Button></section>}
    <section className="space-y-3 border-t pt-6"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Import History</h2><Button variant="ghost" size="icon" title="Refresh import history" aria-label="Refresh import history" onClick={() => void history.refetch()} disabled={!online}><RefreshCw /></Button></div>
      {history.isError && <p className="text-destructive">Import history needs an authorized online connection.</p>}
      {!history.data?.length && !history.isError && <p className="text-sm text-muted-foreground">{history.isPending ? 'Checking history…' : 'No imports yet.'}</p>}
      {history.data?.map(b => <article key={b.id} className="border-b py-3"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="break-all font-medium">{b.filename}</div><div className="text-xs text-muted-foreground">{new Date(b.created_at).toLocaleString('en-IN')} · {b.status.replaceAll('_', ' ')}</div><div className="mt-1 text-sm">{b.candidate_count} candidates · {b.inserted_count} added · {b.updated_count} updated · {b.duplicate_count} duplicates · {b.review_count} review · {b.failed_count} failed</div></div><Button variant="outline" size="sm" onClick={() => setHistoryOpen(historyOpen === b.id ? null : b.id)}>Inspect result</Button></div>{historyOpen === b.id && <div className="mt-3 space-y-2"><p className="break-all text-xs">Batch {b.id} · {b.company}</p><ResultRows results={b.results} /></div>}</article>)}
    </section>
  </div>;
}
function ResultRows({ results }: { results: unknown }) {
  if (!Array.isArray(results)) return null;
  return <ul className="max-h-64 overflow-auto space-y-1 text-sm">{results.map((r, i) => <li key={i} className={r.status === 'failed' ? 'text-destructive' : ''}>Row {r.row}: {r.status}{r.bill && ` · Bill No. ${r.bill}`}{r.reason && ` · ${r.reason}`}</li>)}</ul>;
}