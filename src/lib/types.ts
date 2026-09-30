// Tipos fijos de la base (sección 6.1). Etiquetas en español para la interfaz.
export type MemberRole = 'admin' | 'editor' | 'approver' | 'viewer'

export const ROLE_LABELS: Record<MemberRole, string> = {
  admin: 'Admin',
  editor: 'Editor',
  approver: 'Aprobador',
  viewer: 'Lector',
}

export type MyMembership = {
  id: string
  role: MemberRole
  client_id: string | null
  clients: { name: string } | null
}
