import { useEffect, useState } from 'react';
import { createItem, deleteItem, fetchItems, updateItem } from '../api/items.js';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import Input from '../components/ui/Input.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getErrorMessage } from '../utils/errors.js';

// Working example of a protected, user-owned CRUD feature.
// Rename this page (and the Item model/controller/route) for your project.
export default function Dashboard() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const data = await fetchItems();
      setItems(data.items);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleAdd = async (event) => {
    event.preventDefault();
    if (!title.trim()) return;
    try {
      const data = await createItem({ title: title.trim(), description: description.trim() });
      setItems([data.item, ...items]);
      setTitle('');
      setDescription('');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleToggle = async (item) => {
    try {
      const data = await updateItem(item._id, { completed: !item.completed });
      setItems(items.map((i) => (i._id === item._id ? data.item : i)));
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const handleDelete = async (item) => {
    try {
      await deleteItem(item._id);
      setItems(items.filter((i) => i._id !== item._id));
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <>
      <h1>Welcome, {user?.name}</h1>
      <p className="muted">Signed in as {user?.email}. This is a protected page.</p>

      <Card title="Add an item">
        <form onSubmit={handleAdd} className="form">
          {error && <p className="alert alert-error">{error}</p>}
          <Input
            label="Title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Input
            label="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Button type="submit">Add item</Button>
        </form>
      </Card>

      <Card title={`Your items (${items.length})`}>
        {loading && <p className="muted">Loading…</p>}
        {!loading && items.length === 0 && (
          <p className="muted">Nothing here yet — add your first item above.</p>
        )}
        <ul className="item-list">
          {items.map((item) => (
            <li key={item._id} className={item.completed ? 'done' : ''}>
              <label>
                <input
                  type="checkbox"
                  checked={item.completed}
                  onChange={() => handleToggle(item)}
                />
                <span>
                  <strong>{item.title}</strong>
                  {item.description && <small>{item.description}</small>}
                </span>
              </label>
              <Button variant="danger" onClick={() => handleDelete(item)}>
                Delete
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
