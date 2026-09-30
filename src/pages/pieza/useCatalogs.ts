import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

// Catálogos del cliente para los desplegables del formulario (§6.2).
// Se muestran los activos y, si la pieza ya usa uno inactivo, también ese.

export type CatalogItem = { id: string; name: string; active: boolean; confidential?: boolean }
export type CatalogTable = 'pillars' | 'services' | 'series' | 'projects'

export function useCatalog(table: CatalogTable, clientId: string | undefined) {
  return useQuery({
    queryKey: ['catalog', table, clientId],
    enabled: Boolean(clientId),
    queryFn: async (): Promise<CatalogItem[]> => {
      const columns = table === 'projects' ? 'id, name, active, confidential' : 'id, name, active'
      const { data, error } = await supabase()
        .from(table)
        .select(columns)
        .eq('client_id', clientId!)
        .order('position')
        .order('name')
        .returns<CatalogItem[]>()
      if (error) throw error
      return data ?? []
    },
    staleTime: 5 * 60_000,
  })
}

export function visibleOptions(items: CatalogItem[] | undefined, selectedId: string): CatalogItem[] {
  return (items ?? []).filter((item) => item.active || item.id === selectedId)
}
