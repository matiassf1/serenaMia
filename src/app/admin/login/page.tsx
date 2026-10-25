import type { Metadata } from 'next'
import LoginForm from './LoginForm'

export const metadata: Metadata = { title: 'Ingresar · Serena Mia Admin' }

export default function AdminLoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-10">
      <h1 className="text-3xl font-bold text-[#C2398C]">Serena Mia</h1>
      <p className="mb-8 mt-1 text-sm text-[#7A4FA0]">Panel de administración</p>
      <LoginForm />
    </main>
  )
}
