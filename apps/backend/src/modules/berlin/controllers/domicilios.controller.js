const supabase = require('../../../config/supabase');
const listar = async(req,res,next)=>{ try{ const {estado}=req.query; let q=supabase.from('br_domicilios').select(`*, domiciliario:domiciliario_id(id,nombre,telefono)`).order('hora_asignacion',{ascending:false}); if(estado) q=q.eq('estado',estado); const {data}=await q; res.json(data||[]); }catch(err){next(err);} };
const crear = async(req,res,next)=>{ try{ const {data,error}=await supabase.from('br_domicilios').insert(req.body).select().single(); if(error) throw error; res.status(201).json(data); }catch(err){next(err);} };
const cambiarEstado = async(req,res,next)=>{ try{ const u={estado:req.body.estado}; if(req.body.estado==='en_camino') u.hora_salida=new Date(); if(req.body.estado==='entregado') u.hora_entrega=new Date(); await supabase.from('br_domicilios').update(u).eq('id',req.params.id); res.json({ok:true}); }catch(err){next(err);} };
module.exports={listar,crear,cambiarEstado};
