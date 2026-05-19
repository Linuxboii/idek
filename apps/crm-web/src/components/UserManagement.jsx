import { useState } from 'react'
import { usersApi } from '@spacelink/whatsapp-crm'

export default function UserManagement({ users, onRefresh }) {
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'clerk' })
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)

  const create = async (e) => {
    e.preventDefault()
    setCreating(true); setError('')
    try {
      await usersApi.create(form)
      setForm({ email: '', name: '', password: '', role: 'clerk' })
      onRefresh()
    } catch (err) { setError(err.response?.data?.detail || 'Failed') }
    finally { setCreating(false) }
  }

  const toggle = async (u) => {
    await usersApi.update(u.id, { active: !u.active })
    onRefresh()
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border p-6">
        <h3 className="font-semibold text-gray-800 mb-4">Add Agent</h3>
        <form onSubmit={create} className="grid grid-cols-2 gap-3">
          <input placeholder="Email" type="email" required value={form.email}
            onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
            className="border rounded-lg px-3 py-2 text-sm" />
          <input placeholder="Full name" required value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            className="border rounded-lg px-3 py-2 text-sm" />
          <input placeholder="Password" type="password" required value={form.password}
            onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
            className="border rounded-lg px-3 py-2 text-sm" />
          <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
            className="border rounded-lg px-3 py-2 text-sm">
            <option value="clerk">Clerk</option>
            <option value="admin">Admin</option>
          </select>
          {error && <p className="col-span-2 text-red-500 text-sm">{error}</p>}
          <button type="submit" disabled={creating}
            className="col-span-2 bg-green-500 text-white py-2 rounded-lg font-medium disabled:opacity-50">
            {creating ? 'Creating...' : 'Create Agent'}
          </button>
        </form>
      </div>
      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              {['Name', 'Email', 'Role', 'Status', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{u.name}</td>
                <td className="px-4 py-3 text-gray-600">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium
                    ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium
                    ${u.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {u.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => toggle(u)}
                    className="text-xs text-gray-500 hover:text-gray-800 underline">
                    {u.active ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
