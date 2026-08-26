export interface Negocio {
  id:     string
  nombre: string
  tipo:   string
  slug:   string
  color:  string
}

// Solo los roles que de verdad pueden entrar a esta app (ver
// ROLES_PERMITIDOS en el backend, auth/routes.js) + los operativos
// del negocio, que el admin_berlin puede crear.
export type RolUsuario =
  | 'super_admin'
  | 'admin_berlin'
  | 'panadero'
  | 'vendedor'
  | 'cajero'
  | 'mesero'
  | 'domiciliario'

export interface Usuario {
  id:         string
  email:      string
  nombre:     string
  apellido:   string
  rol:        RolUsuario
  negocio_id: string | null
  activo:     boolean
  avatar_url: string | null
  negocio:    Negocio | null
}

// ── Berlín (esquema idéntico a Panadería Tulio, tablas br_*) ──

export interface Insumo {
  id:             string
  nombre:         string
  unidad_medida:  string
  stock_actual:   number
  stock_minimo:   number
  costo_unitario: number
  proveedor?:     string
  activo:         boolean
  es_gratis?:     boolean
}

export interface RecetaIngrediente {
  id:         string
  receta_id:  string
  insumo_id:  string
  cantidad:   number
  unidad:     string
  insumo:     Insumo
}

export interface Receta {
  id:                    string
  producto_id:           string
  nombre:                string
  rendimiento:           number
  tipo_receta:           'horneada' | 'congelada' | 'frito'
  tiempo_prep_min:       number
  tiempo_horno_min:      number
  tiempo_congelado_min?: number
  temperatura_horno?:    number
  instrucciones?:        string
  costo_calculado:       number
  activo:                boolean
  producto?:             { id: string; nombre: string; unidad_venta: string; precio_venta: number; imagen_url?: string }
  ingredientes?:         RecetaIngrediente[]
}

export interface Categoria {
  id:                string
  nombre:            string
  emoji?:            string
  color?:            string
  orden?:            number
  activo:            boolean
  sin_stock_control?: boolean
  productos?:        { count: number }[]
}

export interface Producto {
  id:                    string
  nombre:                string
  categoria_id?:         string
  origen:                'receta' | 'externo'
  tipo_producto:         'compra_venta' | 'receta'
  codigo_barras?:        string
  precio_venta:          number
  precio_compra:         number
  porcentaje_utilidad:   number
  porcentaje_iva:        number
  precio_docena?:        number
  unidad_venta:          string
  stock_actual:          number
  stock_minimo:          number
  disponible:            boolean
  activo:                boolean
  imagen_url?:           string
  reportar_a_dian:       boolean
  categoria?:            { id: string; nombre: string; color?: string; sin_stock_control?: boolean } | null
}

export interface PlanillaItem {
  id:                string
  planilla_id:       string
  cantidad_producida: number
  notas?:            string
  created_at:        string
  producto?:         { id: string; nombre: string; imagen_url?: string; stock_actual: number; unidad_venta: string }
  receta?:           { id: string; nombre: string; rendimiento?: number } | null
}

export interface Planilla {
  id:         string
  fecha:      string
  turno:      'mañana' | 'tarde' | 'noche' | 'completo'
  estado:     'abierta' | 'cerrada'
  notas?:     string
  created_at: string
  usuario?:   { id: string; nombre: string }
  items:      PlanillaItem[]
}

export type EstadoMoje = 'pendiente' | 'validado' | 'con_incidencia'

export interface Moje {
  id:                     string
  numero_moje:            string
  receta_id:              string
  estado:                 EstadoMoje
  cantidad_esperada:      number
  instrucciones_extra?:   string
  fecha_registro:         string
  usuario_registro_id:    string
  cantidad_real?:         number
  tiene_incidencia?:      boolean
  descripcion_incidencia?: string
  cantidad_merma?:        number
  fecha_validacion?:      string
  usuario_validacion_id?: string
  costo_produccion:       number
  receta?: Receta & {
    producto?: { id: string; nombre: string; imagen_url?: string }
  }
  usuario_registro?:   { id: string; nombre: string; apellido: string }
  usuario_validacion?: { id: string; nombre: string; apellido: string }
}

export interface MovimientoInsumo {
  id:         string
  insumo_id:  string
  tipo:       'entrada' | 'salida' | 'ajuste' | 'produccion'
  cantidad:   number
  saldo:      number
  motivo:     string
  created_at: string
}

export interface AuthTokens {
  accessToken:  string
  refreshToken: string
}

export interface LoginResponse {
  user:   Usuario
  tokens: AuthTokens
}
