export type SupportedTemplateLanguage = 'es' | 'en' | 'it'

export type WhatsAppTemplateCategory = 'marketing' | 'utility' | 'authentication'

export type WhatsAppTemplateVariable = {
  key: string
  label: string
  example: string
  required: boolean
}

export type SeedWhatsAppTemplate = {
  base_template_key: string
  template_key: string
  meta_template_name: string
  language_code: SupportedTemplateLanguage
  locale: SupportedTemplateLanguage
  category: WhatsAppTemplateCategory
  body_text: string
  header_text: string | null
  footer_text: string | null
  variables_schema: WhatsAppTemplateVariable[]
}

type LocalizedText = Record<SupportedTemplateLanguage, string>

type TemplateDefinition = {
  base_template_key: string
  category: WhatsAppTemplateCategory
  variables_schema: WhatsAppTemplateVariable[]
  header_text: LocalizedText | null
  body_text: LocalizedText
  footer_text: LocalizedText | null
}

function makeVariables(...variables: Array<[string, string, string]>): WhatsAppTemplateVariable[] {
  return variables.map(([key, label, example]) => ({ key, label, example, required: true }))
}

const TEMPLATE_DEFINITIONS: TemplateDefinition[] = [
  {
    base_template_key: 'lead_bienvenida',
    category: 'marketing',
    variables_schema: makeVariables(['client_name', 'Client name', 'Marta'], ['agency_name', 'Agency name', 'Growthia Global CRM Homes']),
    header_text: {
      es: 'Nuevo lead inmobiliario',
      en: 'New property lead',
      it: 'Nuovo lead immobiliare',
    },
    body_text: {
      es: 'Hola {{1}}, gracias por contactar con {{2}}. Estamos listos para ayudarte a encontrar la propiedad adecuada. Si quieres, empezamos por zona, presupuesto y tipo de inmueble.',
      en: 'Hi {{1}}, thanks for contacting {{2}}. We are ready to help you find the right property. If you want, we can start with area, budget, and property type.',
      it: 'Ciao {{1}}, grazie per aver contattato {{2}}. Siamo pronti ad aiutarti a trovare l immobile giusto. Se vuoi, possiamo iniziare da zona, budget e tipologia.',
    },
    footer_text: {
      es: 'Responde a este WhatsApp y seguimos contigo.',
      en: 'Reply to this WhatsApp and we will continue from here.',
      it: 'Rispondi a questo WhatsApp e continuiamo da qui.',
    },
  },
  {
    base_template_key: 'lead_origen_portal',
    category: 'utility',
    variables_schema: makeVariables(['client_name', 'Client name', 'Carlos'], ['portal_name', 'Portal name', 'Idealista'], ['property_reference', 'Property reference', '2 bed flat in Chamberi']),
    header_text: {
      es: 'Consulta recibida',
      en: 'Enquiry received',
      it: 'Richiesta ricevuta',
    },
    body_text: {
      es: 'Hola {{1}}, hemos recibido tu consulta desde {{2}} sobre {{3}}. Si quieres, te comparto detalles, disponibilidad y próximos pasos por aquí.',
      en: 'Hi {{1}}, we received your enquiry from {{2}} about {{3}}. If you want, I can share details, availability, and next steps here.',
      it: 'Ciao {{1}}, abbiamo ricevuto la tua richiesta da {{2}} su {{3}}. Se vuoi, posso inviarti qui dettagli, disponibilita e prossimi passi.',
    },
    footer_text: null,
  },
  {
    base_template_key: 'lead_propiedad_especifica',
    category: 'utility',
    variables_schema: makeVariables(['client_name', 'Client name', 'Lucia'], ['property_name', 'Property name', 'Penthouse with terrace'], ['property_area', 'Property area', 'Valdebebas'], ['property_price', 'Property price', '425,000 EUR']),
    header_text: {
      es: 'Propiedad consultada',
      en: 'Property enquiry',
      it: 'Immobile richiesto',
    },
    body_text: {
      es: 'Hola {{1}}, te escribo por {{2}} en {{3}}. El precio actual es {{4}}. Si te interesa, te envío ficha, fotos y opciones de visita.',
      en: 'Hi {{1}}, I am reaching out about {{2}} in {{3}}. The current price is {{4}}. If you are interested, I can send the brochure, photos, and viewing options.',
      it: 'Ciao {{1}}, ti scrivo per {{2}} in {{3}}. Il prezzo attuale e {{4}}. Se ti interessa, posso inviarti scheda, foto e disponibilita per la visita.',
    },
    footer_text: null,
  },
  {
    base_template_key: 'lead_zona_interes',
    category: 'utility',
    variables_schema: makeVariables(['client_name', 'Client name', 'David'], ['area_name', 'Area name', 'Pozuelo']),
    header_text: {
      es: 'Búsqueda por zona',
      en: 'Area search',
      it: 'Ricerca per zona',
    },
    body_text: {
      es: 'Hola {{1}}, para ayudarte mejor en {{2}}, dime si buscas compra o alquiler y qué tipo de inmueble encaja contigo.',
      en: 'Hi {{1}}, to help you better in {{2}}, please let me know if you are looking to buy or rent, and what type of property suits you best.',
      it: 'Ciao {{1}}, per aiutarti meglio in {{2}}, dimmi se cerchi acquisto o affitto e quale tipo di immobile fa per te.',
    },
    footer_text: null,
  },
  {
    base_template_key: 'lead_reactivacion',
    category: 'marketing',
    variables_schema: makeVariables(['client_name', 'Client name', 'Andrea'], ['area_name', 'Area name', 'Majadahonda']),
    header_text: {
      es: 'Nuevas oportunidades',
      en: 'New opportunities',
      it: 'Nuove opportunita',
    },
    body_text: {
      es: 'Hola {{1}}, han entrado nuevas propiedades en {{2}} que pueden encajar con tu búsqueda. Si quieres, te preparo una selección actualizada.',
      en: 'Hi {{1}}, new properties have just come in around {{2}} that could fit your search. If you want, I can prepare an updated shortlist for you.',
      it: 'Ciao {{1}}, sono entrati nuovi immobili in {{2}} che possono adattarsi alla tua ricerca. Se vuoi, preparo una selezione aggiornata per te.',
    },
    footer_text: null,
  },
  {
    base_template_key: 'calificacion_presupuesto',
    category: 'utility',
    variables_schema: makeVariables(['client_name', 'Client name', 'Sofia']),
    header_text: null,
    body_text: {
      es: 'Hola {{1}}, para proponerte opciones realistas, compárteme por favor el rango de presupuesto con el que te sientes cómodo.',
      en: 'Hi {{1}}, to suggest realistic options, please share the budget range you feel comfortable with.',
      it: 'Ciao {{1}}, per proporti opzioni realistiche, condividimi per favore la fascia di budget con cui ti senti a tuo agio.',
    },
    footer_text: null,
  },
  {
    base_template_key: 'calificacion_tipo_propiedad',
    category: 'utility',
    variables_schema: makeVariables(['client_name', 'Client name', 'Raul']),
    header_text: null,
    body_text: {
      es: 'Hola {{1}}, ¿qué tipo de propiedad necesitas exactamente: piso, casa, ático, chalet o local?',
      en: 'Hi {{1}}, what kind of property do you need exactly: flat, house, penthouse, villa, or commercial unit?',
      it: 'Ciao {{1}}, che tipo di immobile cerchi esattamente: appartamento, casa, attico, villa o locale commerciale?',
    },
    footer_text: null,
  },
  {
    base_template_key: 'calificacion_habitaciones',
    category: 'utility',
    variables_schema: makeVariables(['client_name', 'Client name', 'Paula']),
    header_text: null,
    body_text: {
      es: 'Hola {{1}}, ¿cuántas habitaciones necesitas como mínimo? Si hay otro requisito clave, me lo puedes indicar por aquí.',
      en: 'Hi {{1}}, how many bedrooms do you need at minimum? If there is any other key requirement, you can share it here.',
      it: 'Ciao {{1}}, quante camere ti servono come minimo? Se hai altri requisiti importanti, puoi indicarmeli qui.',
    },
    footer_text: null,
  },
  {
    base_template_key: 'calificacion_compra_o_alquiler',
    category: 'utility',
    variables_schema: makeVariables(['client_name', 'Client name', 'Nuria']),
    header_text: null,
    body_text: {
      es: 'Hola {{1}}, confírmame por favor si tu búsqueda es para compra o para alquiler y ajusto la selección en esa línea.',
      en: 'Hi {{1}}, please confirm whether your search is for buying or renting, and I will tailor the selection accordingly.',
      it: 'Ciao {{1}}, confermami per favore se la tua ricerca e per acquisto o affitto e adattero la selezione di conseguenza.',
    },
    footer_text: null,
  },
  {
    base_template_key: 'calificacion_financiacion',
    category: 'utility',
    variables_schema: makeVariables(['client_name', 'Client name', 'Javier']),
    header_text: null,
    body_text: {
      es: 'Hola {{1}}, ¿ya tienes la financiación resuelta o necesitas orientación antes de avanzar con visitas y negociación?',
      en: 'Hi {{1}}, do you already have financing in place, or do you need guidance before moving forward with viewings and negotiation?',
      it: 'Ciao {{1}}, hai gia la parte finanziaria definita oppure ti serve orientamento prima di procedere con visite e trattativa?',
    },
    footer_text: null,
  },
  {
    base_template_key: 'envio_ficha_propiedad',
    category: 'marketing',
    variables_schema: makeVariables(['client_name', 'Client name', 'Elena'], ['property_name', 'Property name', 'Refurbished flat in Retiro'], ['property_summary', 'Property summary', '3 bedrooms, terrace, and parking']),
    header_text: {
      es: 'Ficha de propiedad',
      en: 'Property brochure',
      it: 'Scheda immobile',
    },
    body_text: {
      es: 'Hola {{1}}, te comparto la ficha de {{2}}. Resumen rápido: {{3}}. Si quieres, te explico detalles o coordinamos visita.',
      en: 'Hi {{1}}, I am sharing the brochure for {{2}}. Quick summary: {{3}}. If you want, I can explain the details or arrange a viewing.',
      it: 'Ciao {{1}}, ti condivido la scheda di {{2}}. Riassunto rapido: {{3}}. Se vuoi, ti spiego i dettagli o organizziamo una visita.',
    },
    footer_text: null,
  },
  {
    base_template_key: 'envio_seleccion_propiedades',
    category: 'marketing',
    variables_schema: makeVariables(['client_name', 'Client name', 'Miguel'], ['properties_count', 'Properties count', '4'], ['area_name', 'Area name', 'Aravaca']),
    header_text: {
      es: 'Selección personalizada',
      en: 'Curated shortlist',
      it: 'Selezione personalizzata',
    },
    body_text: {
      es: 'Hola {{1}}, he preparado una selección de {{2}} propiedades que encajan con tu búsqueda en {{3}}. Si quieres, te la envío ahora mismo.',
      en: 'Hi {{1}}, I have prepared a shortlist of {{2}} properties that match your search in {{3}}. If you want, I can send it right away.',
      it: 'Ciao {{1}}, ho preparato una selezione di {{2}} immobili che corrispondono alla tua ricerca in {{3}}. Se vuoi, te la invio subito.',
    },
    footer_text: null,
  },
  {
    base_template_key: 'envio_nueva_opcion',
    category: 'marketing',
    variables_schema: makeVariables(['client_name', 'Client name', 'Noelia'], ['area_name', 'Area name', 'Boadilla'], ['property_name', 'Property name', 'Ground floor with garden']),
    header_text: {
      es: 'Nueva opción disponible',
      en: 'New option available',
      it: 'Nuova opzione disponibile',
    },
    body_text: {
      es: 'Hola {{1}}, nos acaba de entrar una nueva opción en {{2}} que puede encajarte: {{3}}. Si quieres, te paso ficha y disponibilidad.',
      en: 'Hi {{1}}, a new option has just come in around {{2}} that could suit you: {{3}}. If you want, I can send the brochure and availability.',
      it: 'Ciao {{1}}, e appena entrata una nuova opzione in {{2}} che potrebbe fare per te: {{3}}. Se vuoi, ti mando scheda e disponibilita.',
    },
    footer_text: null,
  },
  {
    base_template_key: 'envio_bajada_precio',
    category: 'marketing',
    variables_schema: makeVariables(['client_name', 'Client name', 'Pablo'], ['property_name', 'Property name', 'Duplex in Salamanca'], ['new_price', 'New price', '510,000 EUR']),
    header_text: {
      es: 'Bajada de precio',
      en: 'Price reduction',
      it: 'Riduzione di prezzo',
    },
    body_text: {
      es: 'Hola {{1}}, la propiedad {{2}} ha bajado de precio y ahora está en {{3}}. Si te sigue interesando, puede ser un buen momento para retomarla.',
      en: 'Hi {{1}}, the property {{2}} has had a price reduction and is now listed at {{3}}. If you are still interested, this could be a good time to revisit it.',
      it: 'Ciao {{1}}, l immobile {{2}} ha ridotto il prezzo e ora e a {{3}}. Se ti interessa ancora, potrebbe essere un buon momento per riprenderlo.',
    },
    footer_text: null,
  },
  {
    base_template_key: 'envio_documentacion_propiedad',
    category: 'utility',
    variables_schema: makeVariables(['client_name', 'Client name', 'Beatriz'], ['property_name', 'Property name', 'Townhouse in Las Rozas'], ['documents_list', 'Documents list', 'title deed, floor plan, and quality specs']),
    header_text: {
      es: 'Documentación del inmueble',
      en: 'Property documents',
      it: 'Documentazione immobile',
    },
    body_text: {
      es: 'Hola {{1}}, te envío la documentación disponible de {{2}}: {{3}}. Si necesitas algo más, lo revisamos contigo.',
      en: 'Hi {{1}}, I am sending the available documents for {{2}}: {{3}}. If you need anything else, I will review it with you.',
      it: 'Ciao {{1}}, ti invio la documentazione disponibile di {{2}}: {{3}}. Se ti serve altro, la rivediamo insieme.',
    },
    footer_text: null,
  },
  {
    base_template_key: 'visita_propuesta',
    category: 'utility',
    variables_schema: makeVariables(['client_name', 'Client name', 'Claudia'], ['property_name', 'Property name', 'Loft in Chamartin'], ['visit_date', 'Visit date', '25/04/2026'], ['visit_time', 'Visit time', '18:00']),
    header_text: {
      es: 'Propuesta de visita',
      en: 'Viewing proposal',
      it: 'Proposta di visita',
    },
    body_text: {
      es: 'Hola {{1}}, te propongo visitar {{2}} el {{3}} a las {{4}}. Si te encaja, te lo dejo reservado.',
      en: 'Hi {{1}}, I would like to propose a viewing of {{2}} on {{3}} at {{4}}. If it works for you, I will reserve the slot.',
      it: 'Ciao {{1}}, ti propongo di visitare {{2}} il {{3}} alle {{4}}. Se per te va bene, ti riservo lo slot.',
    },
    footer_text: null,
  },
  {
    base_template_key: 'visita_confirmacion',
    category: 'utility',
    variables_schema: makeVariables(['client_name', 'Client name', 'Oscar'], ['property_name', 'Property name', 'Flat with terrace in Centro'], ['visit_date', 'Visit date', '25/04/2026'], ['visit_time', 'Visit time', '11:00']),
    header_text: {
      es: 'Visita confirmada',
      en: 'Viewing confirmed',
      it: 'Visita confermata',
    },
    body_text: {
      es: 'Hola {{1}}, tu visita a {{2}} queda confirmada para el {{3}} a las {{4}}. Si surge cualquier cambio, escríbeme por aquí.',
      en: 'Hi {{1}}, your viewing of {{2}} is confirmed for {{3}} at {{4}}. If anything changes, feel free to message me here.',
      it: 'Ciao {{1}}, la tua visita a {{2}} e confermata per il {{3}} alle {{4}}. Se cambia qualcosa, scrivimi pure qui.',
    },
    footer_text: null,
  },
  {
    base_template_key: 'visita_recordatorio',
    category: 'utility',
    variables_schema: makeVariables(['client_name', 'Client name', 'Irene'], ['property_name', 'Property name', 'House in Montecarmelo'], ['visit_date', 'Visit date', '26/04/2026'], ['visit_time', 'Visit time', '17:30']),
    header_text: {
      es: 'Recordatorio de visita',
      en: 'Viewing reminder',
      it: 'Promemoria visita',
    },
    body_text: {
      es: 'Hola {{1}}, te recuerdo tu visita a {{2}} el {{3}} a las {{4}}. Si necesitas ubicación o indicaciones, te las mando por aquí.',
      en: 'Hi {{1}}, this is a reminder for your viewing of {{2}} on {{3}} at {{4}}. If you need directions or location details, I can send them here.',
      it: 'Ciao {{1}}, ti ricordo la visita a {{2}} il {{3}} alle {{4}}. Se ti servono posizione o indicazioni, te le invio qui.',
    },
    footer_text: null,
  },
  {
    base_template_key: 'visita_reprogramacion',
    category: 'utility',
    variables_schema: makeVariables(['client_name', 'Client name', 'Teresa'], ['property_name', 'Property name', 'Flat in Goya'], ['visit_date', 'Visit date', '27/04/2026'], ['visit_time', 'Visit time', '19:00']),
    header_text: {
      es: 'Visita reprogramada',
      en: 'Viewing rescheduled',
      it: 'Visita riprogrammata',
    },
    body_text: {
      es: 'Hola {{1}}, hemos reprogramado la visita a {{2}} para el {{3}} a las {{4}}. Si no te encaja, dime otra franja y lo ajustamos.',
      en: 'Hi {{1}}, we have rescheduled the viewing of {{2}} to {{3}} at {{4}}. If that does not work for you, let me know another time and we will adjust it.',
      it: 'Ciao {{1}}, abbiamo riprogrammato la visita a {{2}} per il {{3}} alle {{4}}. Se non ti va bene, dimmi un altra fascia oraria e la sistemiamo.',
    },
    footer_text: null,
  },
  {
    base_template_key: 'visita_cancelacion',
    category: 'utility',
    variables_schema: makeVariables(['client_name', 'Client name', 'Rocio'], ['property_name', 'Property name', 'Ground floor in Delicias'], ['visit_date', 'Visit date', '28/04/2026']),
    header_text: {
      es: 'Visita cancelada',
      en: 'Viewing cancelled',
      it: 'Visita cancellata',
    },
    body_text: {
      es: 'Hola {{1}}, la visita a {{2}} prevista para el {{3}} ha sido cancelada. Si quieres, te propongo una nueva fecha o una opción parecida.',
      en: 'Hi {{1}}, the viewing of {{2}} planned for {{3}} has been cancelled. If you want, I can propose a new date or a similar option.',
      it: 'Ciao {{1}}, la visita a {{2}} prevista per il {{3}} e stata cancellata. Se vuoi, posso proporti una nuova data o un opzione simile.',
    },
    footer_text: null,
  },
  {
    base_template_key: 'seguimiento_post_visita',
    category: 'marketing',
    variables_schema: makeVariables(['client_name', 'Client name', 'Marcos'], ['property_name', 'Property name', 'Flat in Conde Orgaz']),
    header_text: {
      es: 'Seguimiento post visita',
      en: 'Post-viewing follow-up',
      it: 'Follow-up post visita',
    },
    body_text: {
      es: 'Hola {{1}}, quería saber qué sensación te dejó la visita a {{2}}. Si quieres, resolvemos dudas o buscamos alternativas.',
      en: 'Hi {{1}}, I wanted to ask how you felt after viewing {{2}}. If you want, we can go through any questions or look at alternatives.',
      it: 'Ciao {{1}}, volevo sapere che impressione ti ha lasciato la visita a {{2}}. Se vuoi, possiamo chiarire i dubbi o valutare alternative.',
    },
    footer_text: null,
  },
  {
    base_template_key: 'seguimiento_interes',
    category: 'marketing',
    variables_schema: makeVariables(['client_name', 'Client name', 'Veronica'], ['property_name', 'Property name', 'Penthouse duplex in Chamberi']),
    header_text: {
      es: 'Seguimiento de interés',
      en: 'Interest follow-up',
      it: 'Follow-up interesse',
    },
    body_text: {
      es: 'Hola {{1}}, ¿sigues interesado en {{2}}? Si quieres, te explico condiciones, plazos y siguiente paso para avanzar.',
      en: 'Hi {{1}}, are you still interested in {{2}}? If you want, I can explain terms, timing, and the next step to move forward.',
      it: 'Ciao {{1}}, sei ancora interessato a {{2}}? Se vuoi, ti spiego condizioni, tempi e prossimo passo per andare avanti.',
    },
    footer_text: null,
  },
  {
    base_template_key: 'seguimiento_sin_respuesta',
    category: 'marketing',
    variables_schema: makeVariables(['client_name', 'Client name', 'Natalia'], ['area_name', 'Area name', 'Valdemarin']),
    header_text: {
      es: 'Seguimiento comercial',
      en: 'Commercial follow-up',
      it: 'Follow-up commerciale',
    },
    body_text: {
      es: 'Hola {{1}}, te escribo por si sigues buscando en {{2}}. Si aún te interesa, puedo retomar la búsqueda y enviarte opciones actualizadas.',
      en: 'Hi {{1}}, I am checking in in case you are still searching in {{2}}. If you are still interested, I can pick this up again and send updated options.',
      it: 'Ciao {{1}}, ti scrivo nel caso tu stia ancora cercando in {{2}}. Se ti interessa ancora, posso riprendere la ricerca e inviarti opzioni aggiornate.',
    },
    footer_text: null,
  },
  {
    base_template_key: 'seguimiento_urgencia',
    category: 'marketing',
    variables_schema: makeVariables(['client_name', 'Client name', 'Luis'], ['property_name', 'Property name', 'Refurbished flat in Retiro']),
    header_text: {
      es: 'Aviso de urgencia',
      en: 'Urgency update',
      it: 'Avviso urgente',
    },
    body_text: {
      es: 'Hola {{1}}, te aviso porque {{2}} está recibiendo bastante interés esta semana. Si quieres priorizarla, te ayudo a dar el siguiente paso hoy.',
      en: 'Hi {{1}}, just a quick update: {{2}} is getting strong interest this week. If you want to prioritise it, I can help you take the next step today.',
      it: 'Ciao {{1}}, ti avviso che {{2}} sta ricevendo molto interesse questa settimana. Se vuoi darle priorita, ti aiuto a fare il prossimo passo oggi.',
    },
    footer_text: null,
  },
  {
    base_template_key: 'seguimiento_negociacion',
    category: 'utility',
    variables_schema: makeVariables(['client_name', 'Client name', 'Alberto'], ['property_name', 'Property name', 'Semi-detached house in Arroyofresno'], ['negotiation_update', 'Negotiation update', 'the owner is open to reviewing an offer']),
    header_text: {
      es: 'Negociación en curso',
      en: 'Negotiation update',
      it: 'Aggiornamento trattativa',
    },
    body_text: {
      es: 'Hola {{1}}, te actualizo la negociación de {{2}}: {{3}}. Si te parece, hoy mismo cerramos estrategia para avanzar.',
      en: 'Hi {{1}}, here is the latest on the negotiation for {{2}}: {{3}}. If you agree, we can define the next move today.',
      it: 'Ciao {{1}}, ti aggiorno sulla trattativa di {{2}}: {{3}}. Se per te va bene, definiamo oggi la strategia per proseguire.',
    },
    footer_text: null,
  },
  {
    base_template_key: 'documentacion_solicitud',
    category: 'utility',
    variables_schema: makeVariables(['client_name', 'Client name', 'Alicia'], ['process_name', 'Process name', 'the reservation process'], ['documents_list', 'Documents list', 'ID, payslips, and latest tax return']),
    header_text: {
      es: 'Solicitud de documentación',
      en: 'Document request',
      it: 'Richiesta documenti',
    },
    body_text: {
      es: 'Hola {{1}}, para avanzar con {{2}} necesitamos esta documentación: {{3}}. En cuanto la tengamos, seguimos con el proceso.',
      en: 'Hi {{1}}, to move forward with {{2}}, we need the following documents: {{3}}. Once we have them, we will continue with the process.',
      it: 'Ciao {{1}}, per procedere con {{2}} ci servono i seguenti documenti: {{3}}. Appena li riceviamo, continuiamo con il processo.',
    },
    footer_text: null,
  },
  {
    base_template_key: 'documentacion_recibida',
    category: 'utility',
    variables_schema: makeVariables(['client_name', 'Client name', 'Fernando'], ['process_name', 'Process name', 'the purchase process']),
    header_text: {
      es: 'Documentación recibida',
      en: 'Documents received',
      it: 'Documenti ricevuti',
    },
    body_text: {
      es: 'Hola {{1}}, confirmamos que ya hemos recibido la documentación para {{2}}. La estamos revisando y te actualizo en cuanto quede validada.',
      en: 'Hi {{1}}, we confirm that we have received the documents for {{2}}. We are reviewing them now and I will update you as soon as they are validated.',
      it: 'Ciao {{1}}, confermiamo di aver ricevuto la documentazione per {{2}}. La stiamo verificando e ti aggiorno appena viene validata.',
    },
    footer_text: null,
  },
  {
    base_template_key: 'documentacion_faltante',
    category: 'utility',
    variables_schema: makeVariables(['client_name', 'Client name', 'Patricia'], ['process_name', 'Process name', 'the rental file'], ['missing_documents', 'Missing documents', 'employment history and proof of income']),
    header_text: {
      es: 'Documentación pendiente',
      en: 'Missing documents',
      it: 'Documenti mancanti',
    },
    body_text: {
      es: 'Hola {{1}}, hemos revisado tu expediente y para {{2}} aún falta esta documentación: {{3}}. Cuando la tengas, me la envías por aquí.',
      en: 'Hi {{1}}, we reviewed your file and for {{2}} we are still missing these documents: {{3}}. Once you have them, you can send them to me here.',
      it: 'Ciao {{1}}, abbiamo controllato la tua pratica e per {{2}} manca ancora questa documentazione: {{3}}. Quando la hai, puoi inviarmela qui.',
    },
    footer_text: null,
  },
  {
    base_template_key: 'reserva_confirmacion',
    category: 'utility',
    variables_schema: makeVariables(['client_name', 'Client name', 'Diego'], ['property_name', 'Property name', 'Flat with terrace in Sanchinarro'], ['next_step', 'Next step', 'signing the reservation agreement on Friday']),
    header_text: {
      es: 'Reserva confirmada',
      en: 'Reservation confirmed',
      it: 'Prenotazione confermata',
    },
    body_text: {
      es: 'Hola {{1}}, la reserva de {{2}} ha quedado confirmada correctamente. El siguiente paso previsto es {{3}}.',
      en: 'Hi {{1}}, the reservation for {{2}} has been confirmed successfully. The next planned step is {{3}}.',
      it: 'Ciao {{1}}, la prenotazione di {{2}} e stata confermata correttamente. Il prossimo passo previsto e {{3}}.',
    },
    footer_text: null,
  },
  {
    base_template_key: 'firma_recordatorio',
    category: 'utility',
    variables_schema: makeVariables(['client_name', 'Client name', 'Sara'], ['process_name', 'Process name', 'the deposit contract'], ['sign_date', 'Signing date', '30/04/2026'], ['sign_time', 'Signing time', '12:30'], ['sign_location', 'Signing location', 'Growthia Global CRM Homes office']),
    header_text: {
      es: 'Recordatorio de firma',
      en: 'Signing reminder',
      it: 'Promemoria firma',
    },
    body_text: {
      es: 'Hola {{1}}, te recuerdo la firma de {{2}} el {{3}} a las {{4}} en {{5}}. Si necesitas algo antes, dímelo por aquí.',
      en: 'Hi {{1}}, this is a reminder for the signing of {{2}} on {{3}} at {{4}} in {{5}}. If you need anything beforehand, just let me know here.',
      it: 'Ciao {{1}}, ti ricordo la firma di {{2}} il {{3}} alle {{4}} presso {{5}}. Se ti serve qualcosa prima, scrivimi qui.',
    },
    footer_text: null,
  },
]

export const WHATSAPP_TEMPLATE_CATALOG: SeedWhatsAppTemplate[] = TEMPLATE_DEFINITIONS.flatMap((definition) => (
  (['es', 'en', 'it'] as SupportedTemplateLanguage[]).map((language) => ({
    base_template_key: definition.base_template_key,
    template_key: `${definition.base_template_key}_${language}`,
    meta_template_name: `${definition.base_template_key}_${language}`,
    language_code: language,
    locale: language,
    category: definition.category,
    body_text: definition.body_text[language],
    header_text: definition.header_text?.[language] || null,
    footer_text: definition.footer_text?.[language] || null,
    variables_schema: definition.variables_schema,
  }))
))

const EXTRA_TEMPLATE_SEEDS: SeedWhatsAppTemplate[] = [
  {
    base_template_key: 'visita_confirmacion_detalle',
    template_key: 'visita_confirmacion_detalle_es',
    meta_template_name: 'visita_confirmacion_detalle_es',
    language_code: 'es',
    locale: 'es',
    category: 'utility',
    body_text: 'Tu visita ha sido confirmada para el {{1}} a las {{2}}. Si necesitas cambiarla, responde a este mensaje.',
    header_text: null,
    footer_text: null,
    variables_schema: makeVariables(['visit_date', 'Visit date', '30/04/2026'], ['visit_time', 'Visit time', '10:00']),
  },
]

WHATSAPP_TEMPLATE_CATALOG.push(...EXTRA_TEMPLATE_SEEDS)

export function countTemplateVariables(text: string | null | undefined) {
  if (!text) return 0
  const matches = Array.from(text.matchAll(/{{\s*(\d+)\s*}}/g)).map((match) => Number(match[1]))
  return matches.length > 0 ? Math.max(...matches) : 0
}

export function renderTemplatePreview(bodyText: string, params: string[]) {
  let rendered = bodyText
  params.forEach((param, index) => {
    rendered = rendered.replaceAll(`{{${index + 1}}}`, param)
  })
  return rendered
}

export function slugifyTemplateKey(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function buildDefaultVariablesSchema(bodyText: string) {
  const count = countTemplateVariables(bodyText)
  return Array.from({ length: count }, (_, index) => ({
    key: `param_${index + 1}`,
    label: `Parametro ${index + 1}`,
    example: `Ejemplo ${index + 1}`,
    required: true,
  }))
}

export function getTemplateUsableFlag(args: { isActive: boolean; metaStatus: string | null; status: string }) {
  return args.isActive && args.status !== 'archived' && args.metaStatus === 'APPROVED'
}

export function getBaseTemplateKey(templateKey: string) {
  return templateKey.replace(/_(es|en|it)$/i, '')
}
