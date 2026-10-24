import Button from './ui/Button.jsx';
import Card from './ui/Card.jsx';
import Input from './ui/Input.jsx';

export default function DashboardFilters({ filters, setFilters, departments = [], includeDepartment = true, onApply }) {
  return (
    <Card title="Filters">
      <form className="form" onSubmit={(e) => { e.preventDefault(); onApply(); }}>
        <Input label="From" type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
        <Input label="To" type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
        {includeDepartment && (
          <label className="field"><span>Department</span>
            <select value={filters.department} onChange={(e) => setFilters({ ...filters, department: e.target.value })}>
              <option value="">All departments</option>
              {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
            </select>
          </label>
        )}
        <Button type="submit">Apply filters</Button>
      </form>
      <p className="muted">All numbers are computed on the server for these filters — never from a list in the browser.</p>
    </Card>
  );
}
