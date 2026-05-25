-- Phase 40 - Tenant WhatsApp template module
-- Purpose: manage tenant-level WhatsApp templates inside the CRM and sync with Meta

CREATE TABLE IF NOT EXISTS tenant_whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'meta_cloud',
  template_key TEXT NOT NULL,
  meta_template_name TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'es',
  language_code TEXT NOT NULL DEFAULT 'es',
  category TEXT NOT NULL CHECK (category IN ('marketing', 'utility', 'authentication')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_meta', 'in_review', 'approved', 'rejected', 'archived', 'sync_error')),
  meta_status TEXT,
  meta_template_id TEXT,
  body_text TEXT NOT NULL,
  header_text TEXT,
  footer_text TEXT,
  variables_count INTEGER NOT NULL DEFAULT 0,
  variables_schema JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_synced_at TIMESTAMPTZ,
  rejection_reason TEXT,
  last_error TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, template_key),
  UNIQUE (tenant_id, meta_template_name, language_code)
);

ALTER TABLE tenant_whatsapp_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_whatsapp_templates_select_own" ON tenant_whatsapp_templates
  FOR SELECT USING (true);

CREATE POLICY "tenant_whatsapp_templates_insert_own" ON tenant_whatsapp_templates
  FOR INSERT WITH CHECK (true);

CREATE POLICY "tenant_whatsapp_templates_update_own" ON tenant_whatsapp_templates
  FOR UPDATE USING (true);

CREATE POLICY "tenant_whatsapp_templates_delete_own" ON tenant_whatsapp_templates
  FOR DELETE USING (true);

CREATE INDEX IF NOT EXISTS idx_tenant_whatsapp_templates_tenant_id
  ON tenant_whatsapp_templates(tenant_id);

CREATE INDEX IF NOT EXISTS idx_tenant_whatsapp_templates_meta_status
  ON tenant_whatsapp_templates(tenant_id, meta_status);

CREATE INDEX IF NOT EXISTS idx_tenant_whatsapp_templates_active
  ON tenant_whatsapp_templates(tenant_id, is_active, status);

INSERT INTO tenant_whatsapp_templates (
  tenant_id,
  provider,
  template_key,
  meta_template_name,
  locale,
  language_code,
  category,
  status,
  body_text,
  header_text,
  footer_text,
  variables_count,
  variables_schema,
  is_active,
  metadata
)
SELECT
  tenants.id,
  'meta_cloud',
  templates.template_key,
  templates.meta_template_name,
  'es',
  'es',
  templates.category,
  'draft',
  templates.body_text,
  templates.header_text,
  templates.footer_text,
  templates.variables_count,
  templates.variables_schema,
  true,
  jsonb_build_object('seeded_by', 'phase40_whatsapp_template_module')
FROM tenants
CROSS JOIN (
  VALUES
    ('lead_bienvenida_es', 'lead_bienvenida_es', 'marketing', 'Hola {{1}}, gracias por contactar con {{2}}. Te ayudamos a encontrar la propiedad adecuada. ¿Buscas comprar o alquilar y en qué zona te interesa?', 'Nuevo lead inmobiliario', 'Responde a este WhatsApp y seguimos contigo.', 2, '[{"key":"lead_name","label":"Nombre del lead","example":"Marta","required":true},{"key":"agency_name","label":"Nombre de la inmobiliaria","example":"Growthia Global CRM Homes","required":true}]'::jsonb),
    ('lead_origen_portal_es', 'lead_origen_portal_es', 'utility', 'Hola {{1}}, hemos recibido tu consulta desde {{2}} sobre {{3}}. Si quieres, te comparto más información o coordinamos una llamada hoy.', 'Consulta recibida', 'Estamos disponibles para ayudarte.', 3, '[{"key":"lead_name","label":"Nombre del lead","example":"Carlos","required":true},{"key":"portal_name","label":"Portal de origen","example":"Idealista","required":true},{"key":"property_reference","label":"Propiedad consultada","example":"Piso 3 habitaciones en Chamberí","required":true}]'::jsonb),
    ('lead_propiedad_especifica_es', 'lead_propiedad_especifica_es', 'utility', 'Hola {{1}}, te escribo por la propiedad {{2}} en {{3}}. El precio actual es {{4}}. Si te interesa, te envío ficha completa y disponibilidad de visita.', 'Propiedad consultada', 'Podemos ayudarte por aquí sin problema.', 4, '[{"key":"lead_name","label":"Nombre del lead","example":"Lucía","required":true},{"key":"property_name","label":"Nombre de la propiedad","example":"Ático con terraza","required":true},{"key":"property_zone","label":"Zona","example":"Valdebebas","required":true},{"key":"property_price","label":"Precio","example":"425.000 EUR","required":true}]'::jsonb),
    ('lead_zona_interes_es', 'lead_zona_interes_es', 'utility', 'Hola {{1}}, para ayudarte mejor con tu búsqueda en {{2}}, dime si prefieres comprar o alquilar y el tipo de inmueble que te interesa.', 'Búsqueda por zona', 'Con esa información te enviamos opciones más ajustadas.', 2, '[{"key":"lead_name","label":"Nombre del lead","example":"David","required":true},{"key":"search_zone","label":"Zona de interés","example":"Pozuelo","required":true}]'::jsonb),
    ('lead_reactivacion_es', 'lead_reactivacion_es', 'marketing', 'Hola {{1}}, han entrado nuevas propiedades en {{2}} que encajan con lo que estabas buscando. Si quieres, te envío una selección actualizada.', 'Nuevas oportunidades', 'Seguimos pendientes de tu búsqueda.', 2, '[{"key":"lead_name","label":"Nombre del lead","example":"Andrea","required":true},{"key":"search_zone","label":"Zona de interés","example":"Majadahonda","required":true}]'::jsonb),
    ('calificacion_presupuesto_es', 'calificacion_presupuesto_es', 'utility', 'Hola {{1}}, para proponerte inmuebles realistas, compárteme por favor el rango de presupuesto con el que te sientes cómodo.', 'Calificación del lead', 'Así afinamos mejor la búsqueda.', 1, '[{"key":"lead_name","label":"Nombre del lead","example":"Sofía","required":true}]'::jsonb),
    ('calificacion_tipo_propiedad_es', 'calificacion_tipo_propiedad_es', 'utility', 'Hola {{1}}, ¿qué tipo de propiedad necesitas exactamente: piso, casa, chalet, ático o local?', 'Tipo de propiedad', 'Con eso reducimos las opciones adecuadas.', 1, '[{"key":"lead_name","label":"Nombre del lead","example":"Raúl","required":true}]'::jsonb),
    ('calificacion_habitaciones_es', 'calificacion_habitaciones_es', 'utility', 'Hola {{1}}, ¿cuántas habitaciones necesitas como mínimo y si hay algún requisito importante adicional me lo indicas por aquí?', 'Necesidades del inmueble', 'Queremos enviarte opciones realmente útiles.', 1, '[{"key":"lead_name","label":"Nombre del lead","example":"Paula","required":true}]'::jsonb),
    ('calificacion_compra_o_alquiler_es', 'calificacion_compra_o_alquiler_es', 'utility', 'Hola {{1}}, confírmame por favor si tu búsqueda es para compra o para alquiler, y te preparo opciones en esa línea.', 'Operación buscada', 'Es un paso clave para acertar.', 1, '[{"key":"lead_name","label":"Nombre del lead","example":"Nuria","required":true}]'::jsonb),
    ('calificacion_financiacion_es', 'calificacion_financiacion_es', 'utility', 'Hola {{1}}, ¿ya tienes la financiación resuelta o necesitas orientación con hipoteca antes de avanzar con visitas y reserva?', 'Financiación', 'Si lo necesitas, te orientamos en el proceso.', 1, '[{"key":"lead_name","label":"Nombre del lead","example":"Javier","required":true}]'::jsonb),
    ('envio_ficha_propiedad_es', 'envio_ficha_propiedad_es', 'marketing', 'Hola {{1}}, te comparto la ficha de {{2}}. Resumen rápido: {{3}}. Si quieres, te explico más detalles o coordinamos visita.', 'Ficha de propiedad', 'Estoy atento a tus dudas.', 3, '[{"key":"lead_name","label":"Nombre del lead","example":"Elena","required":true},{"key":"property_name","label":"Nombre de la propiedad","example":"Piso reformado en Retiro","required":true},{"key":"property_summary","label":"Resumen corto","example":"3 habitaciones, garaje y terraza","required":true}]'::jsonb),
    ('envio_seleccion_propiedades_es', 'envio_seleccion_propiedades_es', 'marketing', 'Hola {{1}}, he preparado una selección de {{2}} propiedades que encajan con tu búsqueda en {{3}}. Si quieres te las envío ahora mismo.', 'Selección personalizada', 'Así avanzamos con opciones concretas.', 3, '[{"key":"lead_name","label":"Nombre del lead","example":"Miguel","required":true},{"key":"properties_count","label":"Número de propiedades","example":"4","required":true},{"key":"search_zone","label":"Zona","example":"Aravaca","required":true}]'::jsonb),
    ('envio_nueva_opcion_es', 'envio_nueva_opcion_es', 'marketing', 'Hola {{1}}, nos acaba de entrar una nueva opción en {{2}} que puede encajarte: {{3}}. Si quieres te paso ficha y disponibilidad.', 'Nueva opción disponible', 'Te la comparto antes de que vuele.', 3, '[{"key":"lead_name","label":"Nombre del lead","example":"Noelia","required":true},{"key":"search_zone","label":"Zona","example":"Boadilla","required":true},{"key":"property_name","label":"Nombre de la propiedad","example":"Bajo con jardín privado","required":true}]'::jsonb),
    ('envio_bajada_precio_es', 'envio_bajada_precio_es', 'marketing', 'Hola {{1}}, la propiedad {{2}} ha bajado de precio y ahora está en {{3}}. Si te seguía interesando, este puede ser un buen momento.', 'Bajada de precio', 'Si quieres, revisamos siguiente paso.', 3, '[{"key":"lead_name","label":"Nombre del lead","example":"Pablo","required":true},{"key":"property_name","label":"Nombre de la propiedad","example":"Dúplex en Salamanca","required":true},{"key":"new_price","label":"Nuevo precio","example":"510.000 EUR","required":true}]'::jsonb),
    ('envio_documentacion_propiedad_es', 'envio_documentacion_propiedad_es', 'utility', 'Hola {{1}}, te envío la documentación disponible de {{2}}: {{3}}. Si necesitas algún documento adicional, dímelo y lo revisamos.', 'Documentación del inmueble', 'Queremos que tengas toda la información.', 3, '[{"key":"lead_name","label":"Nombre del lead","example":"Beatriz","required":true},{"key":"property_name","label":"Nombre de la propiedad","example":"Chalet adosado en Las Rozas","required":true},{"key":"documents_list","label":"Documentos enviados","example":"nota simple, planos y memoria de calidades","required":true}]'::jsonb),
    ('visita_propuesta_es', 'visita_propuesta_es', 'utility', 'Hola {{1}}, te propongo visitar {{2}} el {{3}} a las {{4}}. Si te encaja, te lo dejo reservado.', 'Propuesta de visita', 'Confírmanos y la cerramos.', 4, '[{"key":"lead_name","label":"Nombre del lead","example":"Claudia","required":true},{"key":"property_name","label":"Nombre de la propiedad","example":"Loft en Chamartín","required":true},{"key":"visit_date","label":"Fecha de la visita","example":"25/04/2026","required":true},{"key":"visit_time","label":"Hora de la visita","example":"18:00","required":true}]'::jsonb),
    ('visita_confirmacion_es', 'visita_confirmacion_es', 'utility', 'Hola {{1}}, tu visita a {{2}} queda confirmada para el {{3}} a las {{4}}. Si surge cualquier cambio, escríbeme por aquí.', 'Visita confirmada', 'Nos vemos pronto.', 4, '[{"key":"lead_name","label":"Nombre del lead","example":"Óscar","required":true},{"key":"property_name","label":"Nombre de la propiedad","example":"Piso con terraza en Centro","required":true},{"key":"visit_date","label":"Fecha de la visita","example":"25/04/2026","required":true},{"key":"visit_time","label":"Hora de la visita","example":"11:00","required":true}]'::jsonb),
    ('visita_recordatorio_es', 'visita_recordatorio_es', 'utility', 'Hola {{1}}, te recuerdo tu visita a {{2}} el {{3}} a las {{4}}. Si necesitas ubicación o indicaciones, te las mando por aquí.', 'Recordatorio de visita', 'Gracias por confirmar asistencia.', 4, '[{"key":"lead_name","label":"Nombre del lead","example":"Irene","required":true},{"key":"property_name","label":"Nombre de la propiedad","example":"Casa unifamiliar en Montecarmelo","required":true},{"key":"visit_date","label":"Fecha de la visita","example":"26/04/2026","required":true},{"key":"visit_time","label":"Hora de la visita","example":"17:30","required":true}]'::jsonb),
    ('visita_reprogramacion_es', 'visita_reprogramacion_es', 'utility', 'Hola {{1}}, hemos reprogramado la visita a {{2}} para el {{3}} a las {{4}}. Si no te encaja, dime otra franja y lo ajustamos.', 'Visita reprogramada', 'Gracias por tu flexibilidad.', 4, '[{"key":"lead_name","label":"Nombre del lead","example":"Teresa","required":true},{"key":"property_name","label":"Nombre de la propiedad","example":"Piso exterior en Goya","required":true},{"key":"visit_date","label":"Nueva fecha","example":"27/04/2026","required":true},{"key":"visit_time","label":"Nueva hora","example":"19:00","required":true}]'::jsonb),
    ('visita_cancelacion_es', 'visita_cancelacion_es', 'utility', 'Hola {{1}}, la visita a {{2}} prevista para el {{3}} ha sido cancelada. Si quieres, te propongo una nueva fecha o una opción similar.', 'Visita cancelada', 'Perdón por la molestia.', 3, '[{"key":"lead_name","label":"Nombre del lead","example":"Rocío","required":true},{"key":"property_name","label":"Nombre de la propiedad","example":"Bajo reformado en Delicias","required":true},{"key":"visit_date","label":"Fecha cancelada","example":"28/04/2026","required":true}]'::jsonb),
    ('seguimiento_post_visita_es', 'seguimiento_post_visita_es', 'marketing', 'Hola {{1}}, quería saber qué sensación te dejó la visita a {{2}}. Si quieres, resolvemos dudas o buscamos alternativas.', 'Seguimiento post visita', 'Tu feedback nos ayuda a avanzar.', 2, '[{"key":"lead_name","label":"Nombre del lead","example":"Marcos","required":true},{"key":"property_name","label":"Nombre de la propiedad","example":"Piso en Conde Orgaz","required":true}]'::jsonb),
    ('seguimiento_interes_es', 'seguimiento_interes_es', 'marketing', 'Hola {{1}}, ¿sigues interesado en {{2}}? Si quieres, te explico condiciones, plazos y siguiente paso para avanzar.', 'Seguimiento de interés', 'Quedo atento a tu respuesta.', 2, '[{"key":"lead_name","label":"Nombre del lead","example":"Verónica","required":true},{"key":"property_name","label":"Nombre de la propiedad","example":"Ático dúplex en Chamberí","required":true}]'::jsonb),
    ('seguimiento_sin_respuesta_es', 'seguimiento_sin_respuesta_es', 'marketing', 'Hola {{1}}, te escribo por si sigues buscando en {{2}}. Si aún te interesa, puedo retomar la búsqueda y enviarte opciones actualizadas.', 'Seguimiento comercial', 'Si prefieres, también cerramos la consulta sin problema.', 2, '[{"key":"lead_name","label":"Nombre del lead","example":"Natalia","required":true},{"key":"search_zone","label":"Zona de interés","example":"Valdemarín","required":true}]'::jsonb),
    ('seguimiento_urgencia_es', 'seguimiento_urgencia_es', 'marketing', 'Hola {{1}}, te aviso porque {{2}} está recibiendo mucho movimiento esta semana. Si quieres priorizarla, te ayudo a dar el siguiente paso hoy.', 'Aviso de urgencia', 'Me dices y lo vemos enseguida.', 2, '[{"key":"lead_name","label":"Nombre del lead","example":"Luis","required":true},{"key":"property_name","label":"Nombre de la propiedad","example":"Piso reformado en Retiro","required":true}]'::jsonb),
    ('seguimiento_negociacion_es', 'seguimiento_negociacion_es', 'utility', 'Hola {{1}}, te actualizo la negociación de {{2}}: {{3}}. Si te parece, hoy mismo cerramos la estrategia para avanzar.', 'Negociación en curso', 'Seguimos contigo hasta el cierre.', 3, '[{"key":"lead_name","label":"Nombre del lead","example":"Alberto","required":true},{"key":"property_name","label":"Nombre de la propiedad","example":"Chalet pareado en Arroyofresno","required":true},{"key":"negotiation_update","label":"Actualización","example":"la propiedad sigue disponible y el vendedor está abierto a revisar oferta","required":true}]'::jsonb),
    ('documentacion_solicitud_es', 'documentacion_solicitud_es', 'utility', 'Hola {{1}}, para avanzar con {{2}} necesitamos la siguiente documentación: {{3}}. En cuanto la tengamos, seguimos con el proceso.', 'Solicitud de documentación', 'Si tienes dudas con algún documento, te ayudamos.', 3, '[{"key":"lead_name","label":"Nombre del lead","example":"Alicia","required":true},{"key":"process_name","label":"Proceso","example":"la reserva de la vivienda","required":true},{"key":"documents_list","label":"Listado de documentos","example":"DNI, nóminas y última declaración","required":true}]'::jsonb),
    ('documentacion_recibida_es', 'documentacion_recibida_es', 'utility', 'Hola {{1}}, confirmamos que ya hemos recibido la documentación para {{2}}. La estamos revisando y te actualizo en cuanto quede validada.', 'Documentación recibida', 'Gracias por enviarla tan rápido.', 2, '[{"key":"lead_name","label":"Nombre del lead","example":"Fernando","required":true},{"key":"process_name","label":"Proceso","example":"la operación de compra","required":true}]'::jsonb),
    ('documentacion_faltante_es', 'documentacion_faltante_es', 'utility', 'Hola {{1}}, hemos revisado tu expediente y aún falta esta documentación para {{2}}: {{3}}. Cuando la tengas, me la envías por aquí.', 'Documentación pendiente', 'En cuanto esté completa, avanzamos.', 3, '[{"key":"lead_name","label":"Nombre del lead","example":"Patricia","required":true},{"key":"process_name","label":"Proceso","example":"la formalización del alquiler","required":true},{"key":"missing_documents","label":"Documentación faltante","example":"vida laboral y justificante de ingresos","required":true}]'::jsonb),
    ('reserva_confirmacion_es', 'reserva_confirmacion_es', 'utility', 'Hola {{1}}, la reserva de {{2}} ha quedado confirmada correctamente. El siguiente paso previsto es {{3}}.', 'Reserva confirmada', 'Enhorabuena, seguimos con la operación.', 3, '[{"key":"lead_name","label":"Nombre del lead","example":"Diego","required":true},{"key":"property_name","label":"Nombre de la propiedad","example":"Piso con terraza en Sanchinarro","required":true},{"key":"next_step","label":"Siguiente paso","example":"firma de arras el viernes","required":true}]'::jsonb),
    ('firma_recordatorio_es', 'firma_recordatorio_es', 'utility', 'Hola {{1}}, te recuerdo la firma de {{2}} el {{3}} a las {{4}} en {{5}}. Si necesitas algo antes, dímelo por aquí.', 'Recordatorio de firma', 'Gracias por confirmar asistencia.', 5, '[{"key":"lead_name","label":"Nombre del lead","example":"Sara","required":true},{"key":"process_name","label":"Tipo de firma","example":"contrato de arras","required":true},{"key":"sign_date","label":"Fecha","example":"30/04/2026","required":true},{"key":"sign_time","label":"Hora","example":"12:30","required":true},{"key":"sign_location","label":"Lugar","example":"oficina de Growthia Global CRM Homes","required":true}]'::jsonb)
) AS templates(template_key, meta_template_name, category, body_text, header_text, footer_text, variables_count, variables_schema)
ON CONFLICT (tenant_id, template_key) DO NOTHING;
