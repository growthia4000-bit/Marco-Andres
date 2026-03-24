'use client'

import { createContext, useContext } from 'react'

interface User {
  id: string
  email: string
}

interface AuthContextType {
  user: User | null
  loading: boolean
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
})

export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ 
  children, 
  user 
}: { 
  children: React.ReactNode
  user: any 
}) {
  return (
    <AuthContext.Provider value={{ user, loading: false }}>
      {children}
    </AuthContext.Provider>
  )
}
