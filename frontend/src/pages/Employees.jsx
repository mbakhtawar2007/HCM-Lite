import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createEmployee, exportEmployees, importDryRun, importEmployees, listEmployees, orgList } from '../api/p1.js';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import Input from '../components/ui/Input.jsx';
import Select from '../components/ui/Select.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import DataTable from '../components/ui/DataTable.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import { getErrorMessage } from '../utils/errors.js';

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [formError, setFormError] = useState('');
  const [dryRun, setDryRun] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [csvText, setCsvText] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', email: '', password: '', employeeCode: '', department: '', designation: '', joiningDate: '', basicSalary: '', phone: '', address: '' });
  const load = (p = page) => { setLoading(true); listEmployees({ q, page: p, limit: 20 }).then((d) => { setEmployees(d.employees); setPages(d.pages || 1); setTotal(d.total || 0); }).catch((e) => setError(getErrorMessage(e))).finally(() => setLoading(false)); };
  useEffect(() => { orgList('departments').then((d) => setDepartments(d.items)).catch(() => {}); orgList('designations').then((d) => setDesignations(d.items)).catch(() => {}); }, []);
  useEffect(() => { load(1); }, [q]);
  const submit = async (e) => {
    e.preventDefault(); setError(''); setMsg(''); setFormError('');
    if (form.basicSalary !== '' && !(Number(form.basicSalary) > 0)) { setFormError('Basic salary must be greater than 0.'); return; }
    setBusy(true);
    try {
      await createEmployee({ ...form, basicSalary: Number(form.basicSalary), designation: form.designation || null });
      setMsg('Employee registered; login created with a temporary password.');
      setForm({ name: '', email: '', password: '', employeeCode: '', department: '', designation: '', joiningDate: '', basicSalary: '', phone: '', address: '' });
      load(1); setPage(1);
    } catch (err) { setError(getErrorMessage(err)); }
    finally { setBusy(false); }
  };
  const onCsv = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const text = await file.text();
    setCsvText(text); setImportResult(null);
    try { setDryRun(await importDryRun(text)); } catch (err) { setError(getErrorMessage(err)); }
  };
  const doImport = async () => {
    setError(''); setMsg(''); setBusy(true);
    try {
      const result = await importEmployees(csvText);
      setImportResult(result);
      setMsg(`Imported ${result.createdRows} employee(s).`);
      setDryRun(null); load(1); setPage(1);
    } catch (err) { setError(getErrorMessage(err)); }
    finally { setBusy(false); }
  };
  return (
    <>
      <PageHeader title="Employees" subtitle="Register employees, search the directory, and import from CSV. A registration creates the employee's login." />
      {error && <ErrorState message={error} onRetry={() => load(1)} />}
      {msg && <p className="alert alert-success">{msg}</p>}
      <Card title="Register an employee">
        <form onSubmit={submit} className="form">
          {formError && <p className="alert alert-error">{formError}</p>}
          <Input label="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label="Temporary password (leave blank for a generated one)" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <Input label="Employee code" required value={form.employeeCode} onChange={(e) => setForm({ ...form, employeeCode: e.target.value })} />
          <Select label="Department" required value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}><option value="">Select…</option>{departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}</Select>
          <Select label="Designation" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })}><option value="">None</option>{designations.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}</Select>
          <Input label="Joining date" type="date" required value={form.joiningDate} onChange={(e) => setForm({ ...form, joiningDate: e.target.value })} />
          <Input label="Basic salary (Rs)" type="number" min="1" required value={form.basicSalary} onChange={(e) => setForm({ ...form, basicSalary: e.target.value })} />
          <Input label="Phone" value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label="Address" value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <Button type="submit" disabled={busy}>{busy ? 'Registering…' : 'Register employee'}</Button>
        </form>
      </Card>
      <Card title="Directory">
        <div className="form"><Input label="Search name, email or code" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
        <p className="no-print"><Button variant="ghost" onClick={exportEmployees}>Export CSV</Button> <label className="btn btn-ghost">Import dry-run (CSV) <input type="file" accept=".csv" hidden onChange={onCsv} /></label></p>
        {dryRun && (
          <div>
            <p className="muted">Dry-run only — nothing was imported. Valid rows: {dryRun.validRows} / {dryRun.totalRows}</p>
            <ul>{dryRun.errors.map((er, i) => <li key={i}>Row {er.row} · {er.field}: {er.reason}</li>)}</ul>
            <p><Button disabled={busy} onClick={doImport}>{busy ? 'Importing…' : `Import ${dryRun.validRows} valid row(s)`}</Button> <span className="muted">Invalid rows are skipped and reported, not imported.</span></p>
          </div>
        )}
        {importResult && (
          <div>
            <p className="muted">Import done: {importResult.createdRows} created, {importResult.failedRows} failed, of {importResult.totalRows} rows.</p>
            <ul>{importResult.results.filter((r) => r.status === 'failed').map((r, i) => <li key={i}>Row {r.row} · {r.employeeCode}: {r.reason}</li>)}</ul>
          </div>
        )}
        {loading ? <Skeleton lines={4} /> : employees.length === 0 ? (
          <EmptyState icon="👥" title="No employees yet" text="Register the first employee above, or import a CSV." />
        ) : (
          <DataTable
            columns={[
              { key: 'name', label: 'Name', render: (em) => <strong>{em.user?.name}</strong> },
              { key: 'code', label: 'Code', render: (em) => em.employeeCode },
              { key: 'department', label: 'Department', render: (em) => em.department?.name || '—' },
              { key: 'salary', label: 'Basic salary', render: (em) => `Rs ${em.basicSalary}` },
              { key: 'actions', label: '', render: (em) => <Link to={`/employees/${em._id}`}>View 360</Link> },
            ]}
            rows={employees}
            sortKeys={{ name: (em) => em.user?.name || '', code: (em) => em.employeeCode || '', department: (em) => em.department?.name || '', salary: (em) => em.basicSalary || 0 }}
            emptyText="No employees yet."
          />
        )}
        <p className="pager muted">Page {page} of {pages} · {total} employee(s) <Button variant="ghost" className="btn-sm" disabled={page <= 1} onClick={() => { const p = page - 1; setPage(p); load(p); }}>Previous</Button> <Button variant="ghost" className="btn-sm" disabled={page >= pages} onClick={() => { const p = page + 1; setPage(p); load(p); }}>Next</Button></p>
      </Card>
    </>
  );
}
