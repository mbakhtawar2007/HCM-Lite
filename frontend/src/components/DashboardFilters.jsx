import Button from './ui/Button.jsx';
import Card from './ui/Card.jsx';
import Input from './ui/Input.jsx';
import Select from './ui/Select.jsx';

export default function DashboardFilters({ filters, setFilters, departments = [], includeDepartment = true, onApply, loading = false }) {
  return (
    <Card title="Filters">
      <form onSubmit={(e) => { e.preventDefault(); onApply(); }}>
        <div className="form-row">
          <Input label="From" type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
          <Input label="To" type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
          {includeDepartment && (
            <Select label="Department" value={filters.department} onChange={(e) => setFilters({ ...filters, department: e.target.value })}>
              <option value="">All departments</option>
              {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
            </Select>
          )}
        </div>
        <p className="page-actions"><Button type="submit" disabled={loading}>{loading ? 'Loading…' : 'Apply filters'}</Button></p>
      </form>
      <p className="muted">All numbers are computed on the server for these filters — never from a list in the browser.</p>
    </Card>
  );
}
