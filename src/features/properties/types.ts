export type PropertyType = 'apartment' | 'house' | 'penthouse' | 'villa' | 'office' | 'commercial' | 'land' | 'garage' | 'storage'
export type DealType = 'sale' | 'rent'
export type PropertyStatus = 'active' | 'inactive' | 'sold' | 'rented'

export interface Property {
  id: string
  tenant_id: string
  title: string
  description: string | null
  property_type: PropertyType
  deal_type: DealType
  price: number
  address: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country: string
  area_sqm: number | null
  rooms: number | null
  bathrooms: number | null
  parking: number | null
  features: string[] | null
  images: string[] | null
  status: PropertyStatus
  agent_id: string | null
  created_at: string
  updated_at: string
}

export const PROPERTY_TYPES: { value: PropertyType; label: string }[] = [
  { value: 'apartment', label: 'Apartamento' },
  { value: 'house', label: 'Casa' },
  { value: 'penthouse', label: 'Atico' },
  { value: 'villa', label: 'Villa' },
  { value: 'office', label: 'Oficina' },
  { value: 'commercial', label: 'Local Comercial' },
  { value: 'land', label: 'Terreno' },
  { value: 'garage', label: 'Garaje' },
  { value: 'storage', label: 'Trastero' },
]

export const DEAL_TYPES: { value: DealType; label: string }[] = [
  { value: 'sale', label: 'Venta' },
  { value: 'rent', label: 'Alquiler' },
]

export const PROPERTY_STATUSES: { value: PropertyStatus; label: string }[] = [
  { value: 'active', label: 'Activa' },
  { value: 'inactive', label: 'Inactiva' },
  { value: 'sold', label: 'Vendida' },
  { value: 'rented', label: 'Alquilada' },
]
