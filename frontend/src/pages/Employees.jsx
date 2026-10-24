import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createEmployee, exportEmployees, importDryRun, listEmployees, orgList } from '../api/p1.js';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import Input from '../components/ui/Input.jsx';
import { getErrorMessage } from '../utils/errors.js';

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [dryRun, setDryRun] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', employeeCode: '', department: '', designation: '', joiningDate: '', basicSalary: '' });
  const load = () => listEmployees({ q }).then((d) => setEmployees(d.employees)).catch((e) => setError(getErrorMessage(e)));
  useEffect(() => { orgList('departments').then((d) => setDepartments(d.items)).catch(() => {}); orgList('designations').then((d) => setDesignations(d.items)).catch(() => {}); }, []);
  useEffect(load, [q]);
  const submit = async (e) => {
    e.preventDefault(); setError(''); setMsg('');
    try {
      await createEmployee({ ...form, basicSalary: Number(form.basicSalary), designation: form.designation || null });
      setMsg('Employee registered; login created with a temporary password.');
      setForm({ name: '', email: '', password: '', employeeCode: '', department: '', designation: '', joiningDate: '', basicSalary: '' });
      load();
    } catch (err) { setError(getErrorMessage(err)); }
  };
  const onCsv = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const text = await file.text();
    try { setDryRun(await importDryRun(text)); } catch (err) { setError(getErrorMessage(err)); }
  };
  return (
    <>
      <h1>Employees</h1>
      {error && <p className="alert alert-error">{error}</p>}
      {msg && <p className="alert">{msg}</p>}
      <Card title="Register an employee">
        <form onSubmit={submit} className="form">
          <Input label="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label="Temporary password (leave blank for a generated one)" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <Input label="Employee code" required value={form.employeeCode} onChange={(e) => setForm({ ...form, employeeCode: e.target.value })} />
          <label className="field"><span>Department</span><select required value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}><option value="">Select…</option>{departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}</select></label>
          <label className="field"><span>Designation</span><select value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })}><option value="">None</option>{designations.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}</select></label>
          <Input label="Joining date" type="date" required value={form.joiningDate} onChange={(e) => setForm({ ...form, joiningDate: e.target.value })} />
          <Input label="Basic salary (Rs)" type="number" required value={form.basicSalary} onChange={(e) => setForm({ ...form, basicSalary: e.target.value })} />
          <Input label="Phone" value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Button type="submit">Register employee</Button>
        </form>
      </Card>
      <Card title="Directory">
        <div className="form"><Input label="Search name, email or code" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <p><Button variant="ghost" onClick={exportEmployees}>Export CSV</Button> <label className="btn btn-ghost">Import dry-run (CSV) <input type="file" accept=".csv" hidden onChange={onCsv} /></label></p>
        {dryRun && (
          <div>
            <p className="muted">Dry-run only — nothing was imported. Valid rows: {dryRun.validRows} / {dryRun.totalRows}</p>
            <ul>{dryRun.errors.map((er, i) => <li key={i}>Row {er.row} · {er.field}: {er.reason}</li>)}</ul>
          </div>
        )}
        <ul className="item-list">
          {employees.map((em) => (
            <li key={em._id}><span><strong>{em.user?.name}</strong> · {em.employeeCode} · {em.department?.name} · Rs {em.basicSalary}</span><Link to={`/employees/${em._id}`}>View 360</Link></li>
          ))}
          {employees.length === 0 && <li className="muted">No employees yet.</li>}
        </ul>
      </Card>
    </>
  );
}
