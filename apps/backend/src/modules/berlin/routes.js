const express = require('express');
const { authenticate } = require('../../middleware/auth');

const productosCtrl  = require('./controllers/productos.controller');
const insumosCtrl    = require('./controllers/insumos.controller');
const recetasCtrl    = require('./controllers/recetas.controller');
const ventasCtrl     = require('./controllers/ventas.controller');
const pedidosCtrl    = require('./controllers/pedidos.controller');
const produccionCtrl = require('./controllers/produccion.controller');
const cajaCtrl        = require('./controllers/caja.controller');
const domiciliosCtrl  = require('./controllers/domicilios.controller');
const clientesCtrl    = require('./controllers/clientes.controller');
const mojsCtrl        = require('./controllers/mojes.controller');
const gastosCtrl      = require('./controllers/gastos.controller');
const empleadosCtrl   = require('./controllers/empleados.controller');
const proveedoresCtrl = require('./controllers/proveedores.controller');
const movimientosCtrl = require('./controllers/movimientos.controller');
const uploadCtrl      = require('./controllers/upload.controller');
const planillaCtrl        = require('./controllers/planilla.controller');
const mermasCtrl          = require('./controllers/mermas.controller');
const encargosCtrl        = require('./controllers/encargos.controller');
const separesCtrl         = require('./controllers/separes.controller');
const mesasCtrl           = require('./controllers/mesas.controller');
const meserosCtrl         = require('./controllers/meseros.controller');
const configuracionCtrl   = require('./controllers/configuracion.controller');
const notificacionesCtrl  = require('./controllers/notificaciones.controller');

const router = express.Router();
router.use(authenticate);

// ── PRODUCTOS
router.get   ('/productos',      productosCtrl.listar);
router.post  ('/productos',      productosCtrl.crear);
router.get   ('/productos/:id',  productosCtrl.obtener);
router.put   ('/productos/:id',  productosCtrl.actualizar);
router.delete('/productos/:id',  productosCtrl.desactivar);

// ── CATEGORÍAS
router.get   ('/categorias',      productosCtrl.listarCategorias);
router.post  ('/categorias',      productosCtrl.crearCategoria);
router.put   ('/categorias/:id',  productosCtrl.actualizarCategoria);
router.delete('/categorias/:id',  productosCtrl.eliminarCategoria);

// ── INSUMOS
router.get   ('/insumos',             insumosCtrl.listar);
router.post  ('/insumos',             insumosCtrl.crear);
router.get   ('/insumos/:id',         insumosCtrl.obtener);
router.put   ('/insumos/:id',         insumosCtrl.actualizar);
router.post  ('/insumos/:id/entrada', insumosCtrl.registrarEntrada);
router.post  ('/insumos/:id/ajuste',  insumosCtrl.ajustarStock);
router.get   ('/insumos-criticos',    insumosCtrl.criticos);

// ── RECETAS
router.get   ('/recetas',             recetasCtrl.listar);
router.post  ('/recetas',             recetasCtrl.crear);
router.get   ('/recetas/:id',         recetasCtrl.obtener);
router.put   ('/recetas/:id',         recetasCtrl.actualizar);
router.delete('/recetas/:id',         recetasCtrl.eliminar);
router.get   ('/recetas/:id/costo',   recetasCtrl.calcularCosto);

// ── VENTAS (POS)
router.get ('/ventas',           ventasCtrl.listar);
router.post('/ventas',           ventasCtrl.crear);
router.get ('/ventas/resumen',   ventasCtrl.resumenDia);
router.get ('/ventas/:id',       ventasCtrl.obtener);
router.post('/ventas/:id/anular',ventasCtrl.anular);

// ── PEDIDOS ANTICIPADOS
router.get   ('/pedidos',              pedidosCtrl.listar);
router.post  ('/pedidos',              pedidosCtrl.crear);
router.get   ('/pedidos/proximos',     pedidosCtrl.proximos);
router.get   ('/pedidos/:id',          pedidosCtrl.obtener);
router.put   ('/pedidos/:id',          pedidosCtrl.actualizar);
router.patch ('/pedidos/:id/estado',   pedidosCtrl.cambiarEstado);
router.post  ('/pedidos/:id/anticipo', pedidosCtrl.registrarAnticipo);

// ── PRODUCCIÓN
router.get  ('/produccion',            produccionCtrl.listar);
router.post ('/produccion',            produccionCtrl.crear);
router.get  ('/produccion/hoy',        produccionCtrl.planHoy);
router.put  ('/produccion/:id',        produccionCtrl.actualizar);
router.patch('/produccion/:id/estado', produccionCtrl.cambiarEstado);
router.post ('/produccion/:id/hornada',produccionCtrl.registrarHornada);

// ── CAJA / TURNOS
router.get  ('/caja/turno-activo',          cajaCtrl.turnoActivo);
router.get  ('/caja/turno-pendiente',       cajaCtrl.turnoPendiente);
router.get  ('/caja/turno-negocio-activo',  cajaCtrl.turnoNegocioActivo);
router.get  ('/caja/hoy',          cajaCtrl.obtenerCajaHoy);
router.post ('/caja/apertura',     cajaCtrl.abrirCaja);
router.post ('/caja/cierre',       cajaCtrl.cerrarCaja);
router.get  ('/caja/historial',    cajaCtrl.historial);
router.get  ('/caja/ventas-turno', cajaCtrl.ventasTurno);
router.post ('/caja/:id/cerrar',   cajaCtrl.cerrarTurnoHistorico);

// ── DOMICILIOS
router.get   ('/domicilios',             domiciliosCtrl.listar);
router.post  ('/domicilios',             domiciliosCtrl.crear);
router.patch ('/domicilios/:id/estado',  domiciliosCtrl.cambiarEstado);

// ── CLIENTES
router.get  ('/clientes/resumen',           clientesCtrl.resumen);
router.get  ('/clientes',                   clientesCtrl.listar);
router.post ('/clientes',                   clientesCtrl.crear);
router.get  ('/clientes/:id',               clientesCtrl.obtener);
router.put  ('/clientes/:id',               clientesCtrl.actualizar);
router.delete('/clientes/:id',              clientesCtrl.eliminar);
router.get  ('/clientes/:id/pedidos',       clientesCtrl.historialPedidos);
router.get  ('/clientes/:id/saldo',         clientesCtrl.saldoDetalle);
router.post ('/clientes/:id/abonar',        clientesCtrl.abonar);
router.post ('/clientes/:id/pagar-todo',    clientesCtrl.pagarTodo);
router.post ('/clientes/:id/deuda-manual',  clientesCtrl.registrarDeudaManual);

// ── ENCARGOS
router.get   ('/encargos',               encargosCtrl.listar);
router.post  ('/encargos',               encargosCtrl.crear);
router.patch ('/encargos/:id/estado',    encargosCtrl.actualizarEstado);
router.patch ('/encargos/:id/entregar',  encargosCtrl.entregar);
router.delete('/encargos/:id',           encargosCtrl.eliminar);

// ── SEPARES
router.get   ('/separes',                separesCtrl.listar);
router.post  ('/separes',                separesCtrl.crear);
router.patch ('/separes/:id/entregar',   separesCtrl.entregar);
router.patch ('/separes/:id/cancelar',   separesCtrl.cancelar);
router.delete('/separes/:id',            separesCtrl.eliminar);

// ── MOJES (Panadería de Tulio)
router.get  ('/mojes',                 mojsCtrl.listar);
router.post ('/mojes',                 mojsCtrl.crear);
router.get  ('/mojes/resumen',         mojsCtrl.resumenDia);
router.get  ('/mojes/:id',             mojsCtrl.obtener);
router.patch('/mojes/:id/validar',     mojsCtrl.validar);

// ── GASTOS
router.get   ('/gastos',         gastosCtrl.listar);
router.get   ('/gastos/resumen', gastosCtrl.resumen);
router.post  ('/gastos',         gastosCtrl.crear);
router.delete('/gastos/:id',     gastosCtrl.eliminar);

// ── EMPLEADOS
router.get   ('/empleados',      empleadosCtrl.listar);
router.post  ('/empleados',      empleadosCtrl.crear);
router.put   ('/empleados/:id',  empleadosCtrl.actualizar);
router.delete('/empleados/:id',  empleadosCtrl.eliminar);

// ── PROVEEDORES
router.get ('/proveedores',                      proveedoresCtrl.listar);
router.post('/proveedores',                      proveedoresCtrl.crear);
router.put ('/proveedores/:id',                  proveedoresCtrl.actualizar);
router.get ('/proveedores/buscar-items',          proveedoresCtrl.buscarItems);
router.get ('/proveedores/facturas',             proveedoresCtrl.listarFacturas);
router.post  ('/proveedores/facturas',            proveedoresCtrl.crearFactura);
router.put   ('/proveedores/facturas/:id',        proveedoresCtrl.actualizarFactura);
router.delete('/proveedores/facturas/:id',        proveedoresCtrl.eliminarFactura);
router.patch ('/proveedores/facturas/:id/pagar',  proveedoresCtrl.pagarFactura);
router.get ('/cuentas-por-pagar',               proveedoresCtrl.listarCuentasPorPagar);
router.get ('/cuentas-por-cobrar',              proveedoresCtrl.listarCuentasPorCobrar);
router.get ('/pedidos-proveedor',               proveedoresCtrl.listarPedidos);
router.post('/pedidos-proveedor',               proveedoresCtrl.crearPedido);
router.patch ('/pedidos-proveedor/:id',          proveedoresCtrl.actualizarPedido);
router.delete('/pedidos-proveedor/:id',          proveedoresCtrl.eliminarPedido);

// ── MOVIMIENTOS CONTABLES
router.get('/movimientos',              movimientosCtrl.listar);
router.get('/movimientos/resumen',      movimientosCtrl.resumen);
router.get('/movimientos/gran-bolsa',   movimientosCtrl.granBolsa);
router.get('/movimientos/posicion',     movimientosCtrl.posicion);
router.get('/movimientos/libro-diario', movimientosCtrl.libroDiario);

// ── REPORTES
router.get('/reportes/ventas-dia',          ventasCtrl.reporteDia);
router.get('/reportes/ventas-dia-productos', ventasCtrl.reporteDiaProductos);
router.get('/reportes/ventas-mes',       ventasCtrl.reporteMes);
router.get('/reportes/productos-top',    productosCtrl.topProductos);
router.get('/reportes/rentabilidad',     productosCtrl.rentabilidad);
router.get('/reportes/mermas',           produccionCtrl.reporteMermas);

// ── CONFIGURACIÓN DEL SISTEMA
router.get ('/configuracion',          configuracionCtrl.listar);
router.put ('/configuracion/:clave',   configuracionCtrl.actualizar);

// ── PLANILLA DE PRODUCCIÓN
router.get  ('/planilla/hoy',                       planillaCtrl.obtenerOCrearHoy);
router.get  ('/planilla/historial',                 planillaCtrl.historial);
router.get  ('/planilla/:id/verificar-insumos',     planillaCtrl.verificarInsumos);
router.post ('/planilla/:id/items',                 planillaCtrl.agregarItem);
router.put  ('/planilla/:id/items/:itemId',         planillaCtrl.actualizarItem);
router.delete('/planilla/:id/items/:itemId',        planillaCtrl.eliminarItem);
router.patch('/planilla/:id/cerrar',                planillaCtrl.cerrarPlanilla);

// ── MESAS
router.get   ('/mesas',                               mesasCtrl.listar);
router.post  ('/mesas',                               mesasCtrl.crear);
router.put   ('/mesas/:id',                           mesasCtrl.actualizar);
router.delete('/mesas/:id',                           mesasCtrl.eliminar);
router.post  ('/mesas/:id/abrir',                     mesasCtrl.abrirMesa);
router.post  ('/mesas/:id/tomar',                     mesasCtrl.tomarMesa);
router.get   ('/mesas/:id/orden',                     mesasCtrl.obtenerOrden);
router.post  ('/mesas/:id/orden/items',               mesasCtrl.agregarItem);
router.patch ('/mesas/:id/orden/items/:itemId',       mesasCtrl.actualizarItem);
router.delete('/mesas/:id/orden/items/:itemId',       mesasCtrl.eliminarItem);
router.post  ('/mesas/:id/cobrar',                    mesasCtrl.cobrar);
router.post  ('/mesas/:id/cancelar-orden',            mesasCtrl.cancelarOrden);
router.post  ('/mesas/:id/enviar-pedido',             mesasCtrl.enviarPedido);

// ── NOTIFICACIONES
router.get ('/notificaciones/pendientes',      notificacionesCtrl.pendientes);
router.put ('/notificaciones/leer-todas',      notificacionesCtrl.leerTodas);
router.put ('/notificaciones/:id/leer',        notificacionesCtrl.leerUna);

// ── MESEROS
router.get   ('/meseros',            meserosCtrl.listar);
router.post  ('/meseros',            meserosCtrl.crear);
router.put   ('/meseros/:id',        meserosCtrl.actualizar);
router.delete('/meseros/:id',        meserosCtrl.eliminar);
router.post  ('/meseros/:id/verificar-pin', meserosCtrl.verificarPin);

// ── MERMAS
router.get   ('/mermas',         mermasCtrl.listar);
router.get   ('/mermas/resumen', mermasCtrl.resumen);
router.post  ('/mermas',         mermasCtrl.crear);
router.delete('/mermas/:id',     mermasCtrl.eliminar);

// ── UPLOAD DE IMÁGENES DE PRODUCTOS
router.post('/upload/imagen',     uploadCtrl.subirImagen);
router.post('/upload/imagen-url', uploadCtrl.subirImagenUrl);

module.exports = router;
