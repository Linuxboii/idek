import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { usersApi } from '@spacelink/whatsapp-crm'
import UserManagement from '../components/UserManagement'

export default function AdminUsers() {
  const [users, setUsers] = useState([])
  const load = async () => {
    try { const { data } = await usersApi.list(); setUsers(data) } catch { /* ignore */ }
  }
  useEffect(() => { load() }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-green-600 text-white px-6 py-4 flex items-center gap-4 shadow">
        <Link to="/" className="text-sm opacity-80 hover:opacity-100">&larr; Back</Link>
        <h1 className="font-bold text-lg">Agent Management</h1>
      </header>
      <div className="max-w-3xl mx-auto p-6">
        <UserManagement users={users} onRefresh={load} />
      </div>
    </div>
  )
}
