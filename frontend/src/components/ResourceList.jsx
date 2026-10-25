import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, Search, Pencil, Eye, Power, Trash2, Loader2, X, Users, Target, CalendarClock, Wrench, Package, FileText, Receipt, Wallet, Repeat, ShoppingBag, UserCog, History } from 'lucide-react';
import PageHeader from './PageHeader.jsx';
import DataTable from './DataTable.jsx';
import Modal from './Modal.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import { EntityForm, validateFields } from './Field.jsx';
import { useList, useDebounce } from '../hooks/useData';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

// The page header shows an icon for the module this list belongs to.
const MODULE_ICONS = { customers: Users, leads: Target, followUps: CalendarClock, services: Wrench, packages: Package, quotations: FileText, invoices: Receipt, payments: Wallet, subscriptions: Repeat, purchases: ShoppingBag };

// Lists that have no permission module use their entity name instead (Agents, Activity log).
const ENTITY_ICONS = { agent: UserCog, 'activity entry': History };
// Banner colour per module (see PageHeader).
const MODULE_TONES = { customers: 'indigo', leads: 'blue', followUps: 'teal', services: 'amber', packages: 'violet', quotations: 'rose', invoices: 'indigo', payments: 'green', subscriptions: 'sky', purchases: 'amber' };
const ENTITY_TONES = { agent: 'violet', 'activity entry': 'slate' };

// Default form used inside the modal when no custom FormComponent is supplied.
function DefaultForm({ fields, initial, saving, errors, formError, onSubmit, onCancel, submitLabel }) {
  const [values, setValues] = useState(initial);
  const [localErrors, setLocalErrors] = useState({});
  const merged = { ...localErrors, ...errors };
  const submit = (e) => {
    e.preventDefault(); if (saving) return;
    const errs = validateFields(fields, values); setLocalErrors(errs);
    if (Object.keys(errs).length) return;
    onSubmit(values);
  };
  return (
    <form onSubmit={submit} noValidate>
      {formError && <div className="form-error" role="alert">{formError}</div>}
      <EntityForm fields={fields} values={values} errors={merged} onChange={(k, v) => { setValues((s) => ({ ...s, [k]: v })); setLocalErrors((s) => ({ ...s, [k]: undefined })); }} />
      <div className="modal-foot">
        <button type="button" className="btn sec" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="btn" disabled={saving}>{saving && <Loader2 size={15} className="spin-i" />}{submitLabel}</button>
      </div>
    </form>
  );
}

export default function ResourceList({
  title, subtitle, entity = 'record', api, module, perm, columns, fields, FormComponent, wideForm = false,
  initialValues = {}, toForm = (r) => r, toPayload = (v) => v,
  filters = [], tabs, tabParam = 'view', searchPlaceholder = 'Search...', defaultSort, defaultDir = 'asc', extraParams,
  headerActions, rowActions, onView, onCreate, onEdit, deactivate, deletable, canEditRow, emptyText, pageSize = 10, createLabel,
}) {
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const loc = useLocation();
  const allow = (a) => (perm ? Boolean(perm[a]) : can(module, a));

  const [search, setSearch] = useState('');
  const searchRef = useRef(null);
  const dSearch = useDebounce(search, 300);
  const [filterVals, setFilterVals] = useState({});
  const [tab, setTab] = useState(tabs?.[0]?.value);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState(defaultSort ? { key: defaultSort, dir: defaultDir } : null);
  const [modal, setModal] = useState(null);       // { mode, row, prefill }
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [dup, setDup] = useState(null);           // duplicate-customer confirmation
  const [confirm, setConfirm] = useState(null);   // deactivate / activate confirmation
  const [busy, setBusy] = useState(false);
  const [delRow, setDelRow] = useState(null);     // permanent delete confirmation

  const params = { search: dSearch, page, pageSize, sort: sort?.key, dir: sort?.dir, ...filterVals, ...(tabs ? { [tabParam]: tab } : {}), ...extraParams };
  const { rows, total, loading, error, reload } = useList(api.list, params);

  useEffect(() => { setPage(1); }, [dSearch, JSON.stringify(filterVals), tab]);

  // Press "/" anywhere (outside a text field or dialog) to jump to the search box.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target; const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return;
      if (document.querySelector('.ov')) return;
      e.preventDefault(); searchRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Pages can open the "new" form with prefilled values via navigate(path, { state: { prefill } }).
  useEffect(() => {
    if (loc.state?.prefill && allow('create') && !onCreate) { setModal({ mode: 'create', row: null, prefill: loc.state.prefill }); navigate(loc.pathname, { replace: true, state: null }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.state]);

  const filtersActive = Object.values(filterVals).some(Boolean);
  const clearAll = () => { setSearch(''); setFilterVals({}); };
  const closeModal = () => { setModal(null); setErrors({}); setFormError(''); setDup(null); };
  const openCreate = () => { if (onCreate) onCreate(); else setModal({ mode: 'create', row: null }); };

  async function submit(values, extra = {}) {
    setSaving(true); setFormError(''); setErrors({});
    const payload = values === null ? { ...extra } : { ...toPayload(values, modal.row), ...extra };
    try {
      if (modal.mode === 'create') await api.create(payload); else await api.update(modal.row.id, payload);
      toast.success(modal.mode === 'create' ? `${entity} created.` : `${entity} updated.`);
      closeModal(); reload();
    } catch (e) {
      if (e.code === 'DUPLICATE') setDup({ payload, message: e.message });
      else { setErrors(e.errors || {}); setFormError(e.errors ? 'Please correct the highlighted fields.' : e.message); }
    } finally { setSaving(false); }
  }

  async function toggleStatus() {
    const row = confirm.row; const to = row[deactivate.field || 'status'] === deactivate.from ? deactivate.to : deactivate.from;
    setBusy(true);
    try { await api.setStatus(row.id, to); toast.success(`${entity} ${to === deactivate.from ? 'activated' : 'deactivated'}.`); setConfirm(null); reload(); }
    catch (e) { toast.error(e.message); setConfirm(null); } finally { setBusy(false); }
  }

  async function doDelete() {
    setBusy(true);
    try { await api.remove(delRow.id); toast.success(`${entity} deleted.`); setDelRow(null); reload(); }
    catch (e) { toast.error(e.message); setDelRow(null); } finally { setBusy(false); }
  }

  const actionCol = {
    key: '_actions', label: '', className: 'actions-col',
    render: (r) => (
      <div className="act">
        {rowActions && rowActions(r, { reload })}
        {onView && <button type="button" className="icon-btn" title="View details" aria-label="View details" onClick={() => onView(r)}><Eye size={16} /></button>}
        {allow('edit') && (!canEditRow || canEditRow(r)) && <button type="button" className="icon-btn" title="Edit" aria-label="Edit" onClick={() => (onEdit ? onEdit(r) : setModal({ mode: 'edit', row: r }))}><Pencil size={16} /></button>}
        {deletable && allow('delete') && <button type="button" className="icon-btn danger" title="Delete permanently" aria-label="Delete" onClick={() => setDelRow(r)}><Trash2 size={16} /></button>}
        {deactivate && allow(deactivate.action || 'delete') && (
          <button type="button" className={`icon-btn ${r[deactivate.field || 'status'] === deactivate.from ? 'danger' : 'ok'}`} title={r[deactivate.field || 'status'] === deactivate.from ? 'Deactivate' : 'Activate'} aria-label="Toggle active status" onClick={() => setConfirm({ row: r })}><Power size={16} /></button>
        )}
      </div>
    ),
  };

  const formProps = modal && {
    fields, saving, errors, formError, onCancel: closeModal, mode: modal.mode, row: modal.row,
    initial: { ...initialValues, ...(modal.mode === 'edit' ? toForm(modal.row) : {}), ...(modal.prefill || {}) },
    submitLabel: modal.mode === 'create' ? `Create ${entity}` : 'Save changes',
    onSubmit: (v) => submit(v),
  };

  return (
    <>
      <PageHeader title={title} subtitle={subtitle} icon={MODULE_ICONS[module] || ENTITY_ICONS[entity]} tone={MODULE_TONES[module] || ENTITY_TONES[entity] || 'indigo'}>
        {headerActions}
        {allow('create') && <button type="button" className="btn" onClick={openCreate}><Plus size={16} />{createLabel || `Add ${entity}`}</button>}
      </PageHeader>

      {tabs && (
        <div className="tabs" role="tablist">
          {tabs.map((t) => <button key={t.value} type="button" role="tab" aria-selected={tab === t.value} className={`tab${tab === t.value ? ' on' : ''}`} onClick={() => setTab(t.value)}>{t.label}</button>)}
        </div>
      )}

      <div className="toolbar">
        <div className="search"><Search size={15} /><input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={searchPlaceholder} aria-label="Search" />{!search && <kbd className="kbd-hint" aria-hidden="true">/</kbd>}</div>
        {filters.map((f) => (
          <select key={f.name} className={`select${filterVals[f.name] ? ' active' : ''}`} aria-label={f.label} value={filterVals[f.name] || ''} onChange={(e) => setFilterVals((s) => ({ ...s, [f.name]: e.target.value }))}>
            <option value="">{f.label}: All</option>
            {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ))}
        {(search || filtersActive) && <button type="button" className="link clear-btn" onClick={clearAll}><X size={13} />Clear</button>}
        {!error && Number.isFinite(total) && (!loading || rows.length > 0) && <span className="result-count" role="status">{total} {total === 1 ? 'result' : 'results'}</span>}
      </div>

      <div className="card flush">
        <DataTable
          columns={[...columns, actionCol]} rows={rows} loading={loading} error={error} onRetry={reload}
          sort={sort} onSort={(key) => setSort((s) => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))}
          page={page} pageSize={pageSize} total={total} onPage={setPage}
          emptyTitle={`No ${entity}s found`} emptyText={emptyText || (search || Object.values(filterVals).some(Boolean) ? 'Nothing matches your search or filters.' : allow('create') ? `Add your first ${entity} to get started.` : 'There is nothing to show yet.')}
          emptyAction={allow('create') && !search ? <button type="button" className="btn sm" onClick={openCreate}><Plus size={14} />{createLabel || `Add ${entity}`}</button> : null}
        />
      </div>

      {modal && (
        <Modal title={modal.mode === 'create' ? (createLabel || `Add ${entity}`) : `Edit ${entity}`} icon={MODULE_ICONS[module] || (modal.mode === 'create' ? Plus : Pencil)} subtitle={modal.mode === 'create' ? 'Fill in the details below. Fields marked * are required.' : 'Update the details and save your changes.'} onClose={saving ? () => {} : closeModal} wide={wideForm}>
          {FormComponent ? <FormComponent {...formProps} /> : <DefaultForm {...formProps} />}
        </Modal>
      )}
      {dup && (
        <ConfirmDialog title="Possible duplicate customer" message={`${dup.message} Do you still want to create a new customer record?`} confirmLabel="Create anyway" danger={false} busy={saving}
          onCancel={() => setDup(null)} onConfirm={() => { const p = dup.payload; setDup(null); submit(null, { ...p, allowDuplicate: true }); }} />
      )}
      {delRow && (
        <ConfirmDialog title={`Delete ${entity}?`} message={`This permanently deletes this ${entity}. It cannot be undone. If it has linked records the server will refuse and you can deactivate it instead.`} confirmLabel="Delete" busy={busy} onCancel={() => setDelRow(null)} onConfirm={doDelete} />
      )}
      {confirm && deactivate && (
        <ConfirmDialog
          title={confirm.row[deactivate.field || 'status'] === deactivate.from ? `Deactivate ${entity}?` : `Activate ${entity}?`}
          message={confirm.row[deactivate.field || 'status'] === deactivate.from ? (deactivate.message || `This ${entity} will be hidden from new selections. Existing records are kept.`) : `This ${entity} will become active again.`}
          confirmLabel={confirm.row[deactivate.field || 'status'] === deactivate.from ? 'Deactivate' : 'Activate'} danger={confirm.row[deactivate.field || 'status'] === deactivate.from} busy={busy}
          onCancel={() => setConfirm(null)} onConfirm={toggleStatus} />
      )}
    </>
  );
}