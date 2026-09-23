(() => {
  const $ = s => document.querySelector(s);
  const MAX_PAGINAS = 1000;  // páginas leídas por documento
  const MAX_OCR = 25;        // páginas escaneadas que se leen con OCR por documento (el OCR es lento)
  const base = new URL('./lib/', document.currentScript?.src || location.href).href;
  const MODO = document.body.dataset.modo || 'general';   // 'contadores' activa las hojas contables siempre
  pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.js';

  const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const fmtNum = n => n.toLocaleString('es-CO', { maximumFractionDigits: 2 });
  const fmtMonto = (n, m) => (m ? m + ' ' : '') + fmtNum(n);

  // =====================================================================
  // TIPOS DE DOCUMENTO (palabras sin tildes, en varios idiomas).
  // "titulo": palabras que suelen ir en el encabezado (pesan más). "claves": palabras del cuerpo.
  // =====================================================================
  const TIPOS = [
    { id: 'factura', nombre: 'Factura', plural: 'Facturas', comercial: true,
      titulo: ['factura electronica de venta', 'factura de venta', 'factura electronica', 'factura', 'tax invoice', 'commercial invoice', 'retail invoice', 'invoice', 'facture', 'rechnung', 'factuur', 'fattura', 'fatura', 'nota fiscal', 'bill of supply'],
      claves: ['cufe', 'resolucion dian', 'iva', 'subtotal', 'total a pagar', 'invoice number', 'invoice date', 'amount due', 'balance due', 'bill to', 'vat', 'gst', 'gstin', 'tva', 'mwst', 'ust', 'btw', 'montant ht', 'total ttc', 'rechnungsnummer', 'rechnungsdatum', 'factuurnummer', 'factuurdatum', 'due date', 'payment terms', 'fecha de vencimiento', 'net 30', 'vervaldatum', 'unit price', 'qty', 'quantity'],
      campos: ['numero', 'fecha', 'emisor', 'nit', 'cliente', 'concepto', 'categoria', 'subtotal', 'iva', 'retencion', 'total', 'moneda'] },
    { id: 'recibo', nombre: 'Recibo', plural: 'Recibos', comercial: true,
      titulo: ['recibo de caja', 'recibo de pago', 'recibo', 'payment receipt', 'sales receipt', 'receipt', 'recu', 'quittung', 'kwitantie', 'ricevuta', 'comprovante'],
      claves: ['paid', 'pagado', 'amount paid', 'payment mode', 'payment method', 'cash', 'efectivo', 'transaction id', 'booking id', 'check in', 'check out'],
      campos: ['numero', 'fecha', 'emisor', 'cliente', 'concepto', 'categoria', 'total', 'moneda', 'formapago'] },
    { id: 'remision', nombre: 'Remisión', plural: 'Remisiones', comercial: true,
      titulo: ['remision', 'nota de entrega', 'guia de despacho', 'orden de despacho', 'nota de remision', 'delivery note', 'packing slip', 'packing list', 'bill of lading', 'bon de livraison', 'lieferschein', 'pakbon', 'guia de remessa'],
      claves: ['despacho', 'despachado', 'recibido por', 'recibi conforme', 'entregado por', 'transportador', 'conductor', 'placa', 'bultos', 'delivered', 'shipped', 'carrier', 'tracking', 'consignee', 'shipper'],
      campos: ['numero', 'fecha', 'emisor', 'cliente', 'concepto', 'direccion', 'ciudad', 'transportador', 'placa'] },
    { id: 'cotizacion', nombre: 'Cotización', plural: 'Cotizaciones', comercial: true,
      titulo: ['cotizacion', 'propuesta economica', 'oferta comercial', 'quotation', 'quote', 'estimate', 'proforma', 'pro forma', 'devis', 'angebot', 'offerte', 'preventivo', 'orcamento'],
      claves: ['validez de la oferta', 'validez', 'tiempo de entrega', 'valid until', 'validity', 'valable', 'gultig'],
      campos: ['numero', 'fecha', 'emisor', 'cliente', 'concepto', 'categoria', 'subtotal', 'iva', 'total', 'moneda'] },
    { id: 'orden', nombre: 'Orden de compra', plural: 'Órdenes de compra', comercial: true,
      titulo: ['orden de compra', 'orden de servicio', 'purchase order', 'bon de commande', 'bestellung', 'inkooporder', 'ordine di acquisto'],
      claves: ['proveedor', 'fecha de entrega', 'autorizado por', 'po number', 'ship to', 'delivery date'],
      campos: ['numero', 'fecha', 'emisor', 'proveedor', 'concepto', 'categoria', 'subtotal', 'iva', 'total', 'moneda'] },
    { id: 'nota', nombre: 'Nota crédito/débito', plural: 'Notas crédito/débito', comercial: true,
      titulo: ['nota credito', 'nota debito', 'nota de credito', 'nota de debito', 'credit note', 'credit memo', 'debit note', 'avoir', 'gutschrift', 'creditnota', 'nota di credito'],
      claves: ['factura referencia', 'original invoice', 'concepto'],
      campos: ['numero', 'fecha', 'emisor', 'cliente', 'concepto', 'categoria', 'total', 'moneda'] },
    { id: 'cobro', nombre: 'Cuenta de cobro', plural: 'Cuentas de cobro', comercial: true,
      titulo: ['cuenta de cobro'], claves: ['debe a', 'la suma de', 'por concepto de'],
      campos: ['numero', 'fecha', 'emisor', 'cliente', 'concepto', 'categoria', 'total', 'moneda'] },
    { id: 'extracto', nombre: 'Extracto', plural: 'Extractos', comercial: true,
      titulo: ['extracto bancario', 'extracto', 'estado de cuenta', 'bank statement', 'account statement', 'statement of account', 'releve de compte', 'kontoauszug', 'rekeningafschrift'],
      claves: ['saldo anterior', 'saldo final', 'saldo actual', 'movimientos', 'retiros', 'consignaciones', 'opening balance', 'closing balance', 'previous balance', 'deposits', 'withdrawals', 'solde'],
      campos: ['emisor', 'fecha', 'cliente', 'saldo', 'moneda'] },
    { id: 'contrato', nombre: 'Contrato', plural: 'Contratos',
      titulo: ['contrato', 'otrosi', 'agreement', 'contract', 'contrat', 'vertrag', 'overeenkomst', 'contratto', 'memorandum of understanding'],
      claves: ['clausula', 'clause', 'las partes', 'the parties', 'whereas', 'hereby', 'contratante', 'contratista', 'objeto del contrato', 'governing law', 'plazo'],
      campos: ['titulo', 'fecha', 'cliente', 'total', 'moneda', 'resumen'] },
    { id: 'acta', nombre: 'Acta', plural: 'Actas',
      titulo: ['acta de', 'acta', 'minutes of', 'minutes', 'proces-verbal', 'proces verbal', 'protokoll', 'notulen', 'verbale', 'agenda', 'orden del dia', 'votacion nominal'],
      claves: ['asistentes', 'orden del dia', 'compromisos', 'se da inicio', 'attendees', 'quorum', 'motion', 'seconded', 'adjourned', 'seance', 'presences', 'sitzung', 'call to order', 'approval of minutes', 'board of', 'meeting'],
      campos: ['titulo', 'fecha', 'emisor', 'paginas', 'temas', 'resumen'] },
    { id: 'tesis', nombre: 'Tesis', plural: 'Tesis',
      titulo: ['tesis doctoral', 'tesis de maestria', 'tesis', 'trabajo de grado', 'trabajo de fin de grado', 'thesis', 'dissertation', 'these', 'doktorarbeit', 'masterarbeit', 'bachelorarbeit', 'proefschrift', 'tese', 'tesi di laurea'],
      claves: ['doctor of philosophy', 'degree of', 'master of', 'partial fulfillment', 'acknowledgements', 'agradecimientos', 'declaration', 'supervisor', 'director de tesis', 'advisor', 'bibliography', 'bibliografia', 'chapter', 'capitulo', 'university', 'universidad', 'faculty', 'facultad'],
      campos: ['titulo', 'autor', 'institucion', 'fecha', 'paginas', 'palabrasclave', 'temas', 'resumen'] },
    { id: 'articulo', nombre: 'Artículo académico', plural: 'Artículos académicos',
      titulo: ['working paper', 'working papers', 'preprint', 'journal of', 'proceedings of', 'conference on', 'revista'],
      claves: ['abstract', 'keywords', 'palabras clave', 'doi', 'references', 'referencias', 'journal', 'proceedings', 'arxiv', 'et al', 'introduction', 'related work', 'conclusion'],
      campos: ['titulo', 'autor', 'fecha', 'institucion', 'palabrasclave', 'paginas', 'temas', 'resumen'] },
    { id: 'libro', nombre: 'Libro o apuntes', plural: 'Libros y apuntes',
      titulo: ['lecture notes', 'apuntes', 'skript', 'manual', 'handbook', 'guia de usuario', 'user guide', 'user manual', 'tutorial', 'course notes', 'libro', 'instructions for', 'instruction', 'instructions', 'instrucciones para', 'instructivo', 'benutzerhandbuch', 'handbuch', 'mode d emploi', 'guide d utilisation', 'configuration guide', 'redbook', 'redpaper'],
      claves: ['table of contents', 'contents', 'indice', 'inhaltsverzeichnis', 'sommaire', 'chapter', 'capitulo', 'kapitel', 'chapitre', 'preface', 'prologo', 'vorwort', 'auflage', 'edition', 'isbn', 'ubungsaufgaben', 'exercises', 'ejercicios'],
      campos: ['titulo', 'autor', 'fecha', 'paginas', 'temas', 'resumen'] },
    { id: 'norma', nombre: 'Norma o reglamento', plural: 'Normas y reglamentos',
      titulo: ['federal register', 'act of', 'public law', 'pub. l', 'statute', 'code of federal regulations', 'proposed rules', 'proposed rule', 'final rule', 'regulation', 'reglamento', 'ley', 'decreto', 'resolucion', 'circular', 'norma tecnica', 'standard', 'rules for', 'directive', 'directiva', 'reglement', 'verordnung', 'gesetz'],
      claves: ['section', 'seccion', 'article', 'articulo', 'paragraph', 'shall', 'deberan', 'pursuant', 'cfr', 'u.s.c', 'effective date', 'agency', 'requirements', 'requisitos', 'rules', 'comments'],
      campos: ['titulo', 'numero', 'fecha', 'emisor', 'paginas', 'temas', 'resumen'] },
    { id: 'transcripcion', nombre: 'Transcripción', plural: 'Transcripciones',
      titulo: ['transcript', 'transcripcion', 'transcription', 'hearing', 'deposition', 'oral argument', 'in the supreme court', 'court of appeals'],
      claves: ['the court', 'justice', 'petitioner', 'respondent', 'witness', 'examination', 'proceedings', 'argument', 'counsel'],
      campos: ['titulo', 'fecha', 'paginas', 'temas', 'resumen'] },
    { id: 'informe', nombre: 'Informe', plural: 'Informes',
      titulo: ['informe tecnico', 'informe de', 'informe', 'reporte', 'report', 'rapport', 'bericht', 'relatorio', 'relazione', 'estudio', 'study', 'assessment', 'evaluation', 'memoria de calculo', 'plan directeur', 'white paper'],
      claves: ['introduccion', 'introduction', 'objetivo', 'objective', 'alcance', 'scope', 'metodologia', 'methodology', 'conclusiones', 'conclusions', 'recomendaciones', 'recommendations', 'findings', 'executive summary', 'resumen ejecutivo', 'highlights', 'table of contents', 'anexo', 'annex', 'appendix', 'elaborado por', 'prepared by'],
      campos: ['titulo', 'autor', 'fecha', 'institucion', 'paginas', 'temas', 'resumen'] },
    { id: 'formulario', nombre: 'Formulario', plural: 'Formularios',
      titulo: ['formulario', 'application form', 'registration form', 'solicitud', 'formulaire', 'formular', 'tax return', 'anexo', 'declaracion', 'demande de', 'cerfa'],
      claves: ['please fill', 'diligencie', 'signature', 'firma del', 'check one', 'date of birth', 'fecha de nacimiento', 'tick', 'if yes', 'please complete', 'tax return', 'dni', 'd./dna', 'nie', 'pasaporte', 'cerfa', 'formulaire', 'nombre y apellidos', 'domicilio', 'firmado'],
      campos: ['titulo', 'fecha', 'emisor', 'paginas'] },
    { id: 'certificado', nombre: 'Certificado', plural: 'Certificados',
      titulo: ['certificado', 'certificacion', 'constancia', 'certificate', 'certification', 'attestation', 'bescheinigung', 'zertifikat', 'certificaat'],
      claves: ['certifica', 'hace constar', 'se expide', 'hereby certify', 'this is to certify', 'atteste'],
      campos: ['titulo', 'fecha', 'emisor', 'cliente'] },
    { id: 'laboratorio', nombre: 'Resultado clínico', plural: 'Resultados clínicos',
      titulo: ['resultado de laboratorio', 'resultados de laboratorio', 'historia clinica', 'laboratory report', 'lab report', 'medical report', 'informe medico', 'pathology report', 'body composition'],
      claves: ['paciente', 'patient', 'valor de referencia', 'reference range', 'diagnostico', 'diagnosis', 'medico', 'physician', 'specimen', 'muestra'],
      campos: ['paciente', 'fecha', 'emisor', 'resumen'] },
    { id: 'carta', nombre: 'Carta o memorando', plural: 'Cartas y memorandos',
      titulo: ['memorandum', 'memorando', 'memo', 'oficio', 'circular interna', 'carta'],
      claves: ['to whom it may concern', 'dear', 'estimado', 'estimada', 'apreciado', 'atentamente', 'cordialmente', 'best regards', 'kind regards', 'sincerely', 'yours faithfully', 'saludos', 'cordialement', 'mit freundlichen', 'a quien corresponda', 'asunto', 'subject'],
      campos: ['fecha', 'emisor', 'cliente', 'titulo', 'temas', 'resumen'] },
    { id: 'plano', nombre: 'Plano', plural: 'Planos',
      titulo: ['plano', 'planos', 'drawing', 'dessin', 'blueprint', 'plan de', 'site plan', 'floor plan'],
      claves: ['escala', 'echelle', 'scale', 'lamina', 'sheet', 'dibujo', 'dibujado por', 'drawn by', 'checked by', 'fachada', 'planta', 'elevation', 'legend', 'leyenda', 'legende', 'niveau', 'nivel', 'cota', 'rev'],
      campos: ['plano', 'titulo', 'proyecto', 'emisor', 'numproyecto', 'fecha', 'escala', 'revision', 'dibujo', 'diseno', 'reviso', 'aprobo', 'observaciones', 'paginas'] },
    { id: 'presentacion', nombre: 'Presentación', plural: 'Presentaciones',
      titulo: ['presentacion', 'presentation', 'slides', 'diapositivas', 'webinar', 'keynote'],
      claves: ['agenda', 'thank you', 'gracias', 'questions', 'preguntas', 'outline'],
      campos: ['titulo', 'autor', 'fecha', 'paginas', 'temas', 'resumen'] },
    { id: 'datos', nombre: 'Tabla de datos', plural: 'Tablas de datos',
      titulo: ['list of', 'listado', 'lista de', 'relacion de', 'estadisticas', 'statistics', 'summary of contents', 'schedule of'],
      claves: [],
      campos: ['titulo', 'fecha', 'emisor', 'paginas', 'cantidaditems'] },
  ];
  const OTRO = { id: 'otro', nombre: 'Sin clasificar', plural: 'Sin clasificar', campos: ['titulo', 'fecha', 'emisor', 'paginas', 'temas', 'resumen'] };
  const COMERCIALES = new Set(TIPOS.filter(t => t.comercial).map(t => t.id));

  // =====================================================================
  // CAMPOS: sinónimos de la etiqueta (sin tildes, varios idiomas) y tipo de valor esperado
  // =====================================================================
  const CAMPOS = {
    numero: { etiqueta: 'Número', tipo: 'codigo', syn: ['factura electronica de venta no', 'factura de venta no', 'factura no', 'numero de factura', 'no factura', 'invoice number', 'invoice no', 'invoice nr', 'invoice #', 'invoice id', 'bill no', 'bill number', 'receipt no', 'receipt number', 'booking id', 'numero de facture', 'facture n', 'facture no', 'rechnungsnummer', 'rechnungsnr', 'rechnung nr', 'factuurnummer', 'factuur nr', 'factuurnr', 'numero fattura', 'fattura n', 'remision no', 'numero de remision', 'delivery note no', 'cotizacion no', 'quote no', 'quotation no', 'orden de compra no', 'po number', 'order number', 'numero de orden', 'credit note no', 'nota credito no', 'documento no', 'document no', 'docket no', 'consecutivo', 'invoice', 'factuur', 'facture', 'rechnung', 'factura', 'numero', 'number', 'no', 'nro', 'nr', 'n'] },
    fecha: { etiqueta: 'Fecha', tipo: 'fecha', syn: ['fecha de emision', 'fecha de expedicion', 'fecha factura', 'fecha de factura', 'fecha de elaboracion', 'fecha de generacion', 'fecha de despacho', 'invoice date', 'date of issue', 'issue date', 'bill date', 'receipt date', 'date de facture', 'date d emission', 'rechnungsdatum', 'factuurdatum', 'factuur datum', 'data da fatura', 'data fattura', 'fecha', 'date', 'datum', 'data', 'dated', 'issued'], excluir: ['vencimiento', 'nacimiento', 'due', 'echeance', 'fallig', 'verval', 'scadenza', 'birth', 'check out', 'entrega', 'delivery', 'periodo', 'period', 'order date', 'besteldatum', 'report run'] },
    vencimiento: { etiqueta: 'Fecha de vencimiento', tipo: 'fecha', syn: ['fecha de vencimiento', 'vencimiento', 'due date', 'payment due', 'date d echeance', 'echeance', 'falligkeitsdatum', 'fallig am', 'vervaldatum', 'scadenza', 'pay by'] },
    emisor: { etiqueta: 'Emisor', tipo: 'texto', syn: ['razon social', 'emisor', 'expedido por', 'prestador', 'seller', 'sold by', 'vendor', 'supplier', 'issued by', 'titulaire du compte', 'account holder', 'account name', 'beneficiary', 'beneficiario', 'titular de la cuenta', 'rekeninghouder', 'kontoinhaber', 'payable to', 'pagar a', 'fournisseur', 'vendeur', 'lieferant', 'verkaufer', 'leverancier', 'verkoper', 'fornitore'] },
    proveedor: { etiqueta: 'Proveedor', tipo: 'texto', syn: ['proveedor', 'razon social', 'emisor', 'contratista', 'seller', 'sold by', 'vendor', 'supplier', 'fournisseur', 'lieferant', 'leverancier', 'fornitore'] },
    nit: { etiqueta: 'NIT / ID fiscal', tipo: 'nit', syn: ['nit', 'nit emisor', 'rut', 'cc/nit', 'gstin', 'gst no', 'gst number', 'gst reg', 'vat no', 'vat number', 'vat id', 'vat reg no', 'vat registration', 'tax id', 'tin', 'ein', 'siret', 'siren', 'tva intracommunautaire', 'n tva', 'ust-idnr', 'ust-id', 'ust id', 'steuernummer', 'btw nr', 'btw-nummer', 'btw nummer', 'btw', 'partita iva', 'cnpj', 'rfc', 'cif', 'nif'] },
    cliente: { etiqueta: 'Cliente', tipo: 'texto', syn: ['cliente', 'senor(es)', 'senores', 'senor', 'adquiriente', 'adquirente', 'comprador', 'facturar a', 'facturado a', 'destinatario', 'contratante', 'dirigido a', 'nombre del cliente', 'bill to', 'billed to', 'invoice to', 'sold to', 'customer name', 'customer', 'client name', 'client', 'guest name', 'buyer', 'facture a', 'adresse de facturation', 'kunde', 'rechnungsadresse', 'klant', 'factuuradres', 't.a.v', 'nom de l abonne', 'billing address'], excluir: ['care', 'service', 'support', 'number', 'nummer', 'numero', 'no', 'id', 'code', 'ref'] },
    nitcliente: { etiqueta: 'ID fiscal cliente', tipo: 'nit', syn: ['nit cliente', 'nit adquiriente', 'customer vat', 'customer gstin', 'buyer tax id'] },
    direccion: { etiqueta: 'Dirección', tipo: 'texto', syn: ['direccion de entrega', 'direccion de despacho', 'direccion', 'shipping address', 'billing address', 'address', 'adresse', 'adres', 'indirizzo', 'endereco'] },
    ciudad: { etiqueta: 'Ciudad', tipo: 'texto', syn: ['ciudad', 'municipio', 'ciudad destino', 'city', 'ville', 'stadt', 'plaats', 'citta', 'cidade'] },
    telefono: { etiqueta: 'Teléfono', tipo: 'texto', syn: ['telefono', 'tel', 'phone', 'telephone', 'telefon', 'telefoon', 'celular', 'movil', 'mobile'] },
    correo: { etiqueta: 'Correo', tipo: 'correo', syn: ['correo electronico', 'correo', 'email', 'e-mail', 'mail', 'courriel'] },
    subtotal: { etiqueta: 'Subtotal', tipo: 'dinero', ultimo: true, syn: ['base imponible', 'base gravable', 'totaal exclusief btw', 'exclusief btw', 'excl btw', 'subtotal', 'sub total', 'sub-total', 'valor antes de iva', 'base gravable', 'total bruto', 'net amount', 'net total', 'total excl', 'total excluding tax', 'total before tax', 'amount before tax', 'taxable amount', 'taxable value', 'montant ht', 'total ht', 'sous-total', 'sous total', 'nettobetrag', 'zwischensumme', 'netto', 'subtotaal', 'totaal excl', 'imponibile', 'totale imponibile'] },
    iva: { etiqueta: 'Impuesto (IVA/VAT)', tipo: 'dinero', syn: ['iva', 'valor iva', 'total iva', 'impuesto', 'impuestos', 'total tax', 'sales tax', 'tax', 'taxes', 'vat', 'gst', 'igst', 'cgst', 'sgst', 'tva', 'montant tva', 'mwst', 'ust', 'umsatzsteuer', 'btw', 'imposta', 'icms'], excluir: ['sin iva', 'antes de iva', 'base', 'regimen', 'responsable', 'excl', 'incl', 'tax id', 'vat no', 'vat number', 'vat id', 'vat reg', 'gst no', 'gstin', 'gst number', 'gst reg', 'tax invoice', 'btw nr', 'btw-nummer', 'btw nummer', 'tva intra', 'n tva', 'ust-id', 'ust id', 'number', 'statement', 'rate', 'tarif', 'tasa'] },
    descuento: { etiqueta: 'Descuento', tipo: 'dinero', syn: ['descuento', 'descuentos', 'dcto', 'discount', 'remise', 'rabatt', 'korting', 'sconto'] },
    retencion: { etiqueta: 'Retención', tipo: 'dinero', syn: ['retencion en la fuente', 'retefuente', 'retencion irpf', 'irpf', 'retencion', 'reteica', 'reteiva', 'withholding tax', 'withholding', 'tds'] },
    total: { etiqueta: 'Total', tipo: 'dinero', ultimo: true, syn: ['total a pagar', 'total neto', 'valor neto', 'coste total', 'costo total', 'importe total', 'total factura', 'bedrag inclusief btw', 'bedrag incl', 'totaal incl', 'somme a payer', 'montant a payer', 'total for this invoice', 'total facture', 'valor total', 'neto a pagar', 'total factura', 'total general', 'gran total', 'valor a pagar', 'total cotizacion', 'total due', 'amount due', 'balance due', 'grand total', 'invoice total', 'total amount', 'amount payable', 'total payable', 'total incl', 'total including', 'total ttc', 'montant ttc', 'net a payer', 'total a payer', 'montant total', 'gesamtbetrag', 'rechnungsbetrag', 'endbetrag', 'gesamtsumme', 'zu zahlen', 'factuur totaal', 'totaalbedrag', 'te betalen', 'totaal', 'totale fattura', 'importo totale', 'totale', 'total'], excluir: ['subtotal', 'sub total', 'sub-total', 'total items', 'total unidades', 'total bultos', 'total iva', 'total cantidad', 'total paginas', 'total bruto', 'total tax', 'total excl', 'total ht', 'total quantity', 'total qty', 'totaal excl', 'total discount', 'total hours', 'total pages', 'total weight', 'total units', 'total savings'] },
    saldo: { etiqueta: 'Saldo', tipo: 'dinero', ultimo: true, syn: ['saldo final', 'saldo actual', 'nuevo saldo', 'closing balance', 'ending balance', 'new balance', 'solde', 'saldo', 'balance'] },
    moneda: { etiqueta: 'Moneda', tipo: 'texto', syn: ['moneda', 'currency', 'devise', 'wahrung', 'valuta'] },
    formapago: { etiqueta: 'Forma de pago', tipo: 'texto', syn: ['forma de pago', 'medio de pago', 'condiciones de pago', 'metodo de pago', 'payment method', 'payment mode', 'payment terms', 'mode de paiement', 'zahlungsart', 'zahlungsbedingungen', 'betaalwijze'] },
    transportador: { etiqueta: 'Transportador', tipo: 'texto', syn: ['transportador', 'transportadora', 'conductor', 'empresa transportadora', 'carrier', 'transporteur', 'spediteur', 'vervoerder'] },
    placa: { etiqueta: 'Placa', tipo: 'codigo', syn: ['placa', 'placa vehiculo', 'license plate', 'plate'] },
    titulo: { etiqueta: 'Título', tipo: 'texto', syn: ['titulo', 'title', 'asunto', 'subject', 'titre', 'titel', 'betreff', 'onderwerp', 'oggetto'] },
    proyecto: { etiqueta: 'Proyecto', tipo: 'texto', syn: ['proyecto', 'obra', 'nombre del proyecto', 'project', 'projet', 'projekt', 'progetto', 'projeto'] },
    autor: { etiqueta: 'Autor', tipo: 'nombre', syn: ['elaborado por', 'preparado por', 'presentado por', 'autor', 'autores', 'author', 'authors', 'written by', 'prepared by', 'presented by', 'submitted by', 'auteur', 'verfasser', 'verfasst von'] },
    institucion: { etiqueta: 'Institución', tipo: 'texto', syn: ['universidad', 'university', 'institucion', 'institution', 'facultad', 'faculty', 'department', 'departamento'] },
    palabrasclave: { etiqueta: 'Palabras clave', tipo: 'largo', syn: ['palabras clave', 'keywords', 'key words', 'mots-cles', 'mots cles', 'schlusselworter', 'schlagworter', 'trefwoorden', 'palavras-chave', 'parole chiave', 'index terms'] },
    paciente: { etiqueta: 'Paciente', tipo: 'texto', syn: ['paciente', 'nombre del paciente', 'patient name', 'patient', 'nom du patient', 'nombre'] },
    concepto: { etiqueta: 'Concepto', tipo: 'largo', syn: ['concepto', 'por concepto de', 'descripcion del servicio', 'description of services'] },
    categoria: { etiqueta: 'Categoría', tipo: 'texto', syn: [] },
    temas: { etiqueta: 'Temas principales', tipo: 'largo', syn: [] },
    idioma: { etiqueta: 'Idioma', tipo: 'texto', syn: [] },
    paginas: { etiqueta: 'Páginas', tipo: 'numero', syn: [] },
    resumen: { etiqueta: 'Resumen', tipo: 'resumen', syn: [] },
    cantidaditems: { etiqueta: 'Filas / ítems', tipo: 'numero', syn: [] },
    cufe: { etiqueta: 'CUFE / CUDE', tipo: 'codigo', syn: [] },
    plano: { etiqueta: 'Número de plano', tipo: 'codigo', syn: [] },
    escala: { etiqueta: 'Escala', tipo: 'texto', syn: ['escala', 'scale', 'echelle', 'massstab'] },
    numproyecto: { etiqueta: 'Número de proyecto', tipo: 'codigo', syn: ['project number', 'project no', 'job number', 'job no', 'numero de proyecto', 'proyecto no', 'codigo del proyecto'] },
    revision: { etiqueta: 'Revisión', tipo: 'codigo', syn: ['revision', 'rev', 'version'] },
    dibujo: { etiqueta: 'Dibujó', tipo: 'texto', syn: ['drawn by', 'dibujo', 'dibujado por', 'dibujante'] },
    diseno: { etiqueta: 'Diseñó', tipo: 'texto', syn: ['designed by', 'diseno', 'disenado por', 'disenador'] },
    reviso: { etiqueta: 'Revisó', tipo: 'texto', syn: ['checked by', 'reviso', 'revisado por', 'reviewed by'] },
    aprobo: { etiqueta: 'Aprobó', tipo: 'texto', syn: ['approved by', 'aprobed by', 'aprobo', 'aprobado por'] },
    observaciones: { etiqueta: 'Observaciones', tipo: 'largo', syn: ['observaciones', 'observations', 'notas generales', 'general notes', 'notas', 'notes'] },
    tipodian: { etiqueta: 'Tipo de documento DIAN', tipo: 'texto', syn: [] },
    referencia: { etiqueta: 'Factura afectada', tipo: 'codigo', syn: ['factura de referencia', 'factura afectada', 'referencia factura', 'factura relacionada'] },
    basegravable: { etiqueta: 'Base gravable', tipo: 'dinero', syn: ['base gravable', 'base imponible', 'base iva'] },
    inc: { etiqueta: 'Impuesto al consumo (INC)', tipo: 'dinero', syn: ['impuesto nacional al consumo', 'impuesto al consumo', 'impoconsumo', 'inc'] },
    retefuente: { etiqueta: 'ReteFuente', tipo: 'dinero', syn: ['retencion en la fuente', 'retefuente', 'rete fuente', 'retencion renta', 'reterenta'] },
    reteiva: { etiqueta: 'ReteIVA', tipo: 'dinero', syn: ['reteiva', 'rete iva', 'retencion de iva', 'retencion iva'] },
    reteica: { etiqueta: 'ReteICA', tipo: 'dinero', syn: ['reteica', 'rete ica', 'retencion de ica', 'retencion ica'] },
  };
  // Palabras que la persona puede escribir y a qué campo apuntan
  const ALIAS = {
    'numero': 'numero', 'no': 'numero', 'n': 'numero', 'nro': 'numero', 'consecutivo': 'numero', 'numero de factura': 'numero', 'numero factura': 'numero', 'factura': 'numero', 'numero de remision': 'numero', 'id': 'numero', 'number': 'numero', 'invoice number': 'numero', 'invoice no': 'numero', 'invoice': 'numero', 'numero de documento': 'numero',
    'fecha': 'fecha', 'fecha de emision': 'fecha', 'fecha factura': 'fecha', 'date': 'fecha', 'invoice date': 'fecha', 'ano': 'fecha', 'year': 'fecha', 'fecha de vencimiento': 'vencimiento', 'vencimiento': 'vencimiento', 'due date': 'vencimiento',
    'emisor': 'emisor', 'empresa': 'emisor', 'razon social': 'emisor', 'company': 'emisor', 'issuer': 'emisor', 'entidad': 'emisor', 'proveedor': 'proveedor', 'vendedor': 'proveedor', 'vendor': 'proveedor', 'supplier': 'proveedor', 'seller': 'proveedor',
    'nit': 'nit', 'nit proveedor': 'nit', 'nit emisor': 'nit', 'rut': 'nit', 'id fiscal': 'nit', 'tax id': 'nit', 'vat number': 'nit', 'gstin': 'nit', 'nif': 'nit', 'rfc': 'nit', 'cif': 'nit', 'nit cliente': 'nitcliente',
    'cliente': 'cliente', 'comprador': 'cliente', 'adquiriente': 'cliente', 'destinatario': 'cliente', 'customer': 'cliente', 'client': 'cliente', 'buyer': 'cliente', 'bill to': 'cliente',
    'direccion': 'direccion', 'address': 'direccion', 'ciudad': 'ciudad', 'city': 'ciudad', 'telefono': 'telefono', 'phone': 'telefono', 'correo': 'correo', 'email': 'correo', 'e-mail': 'correo',
    'subtotal': 'subtotal', 'base': 'subtotal', 'iva': 'iva', 'impuesto': 'iva', 'impuestos': 'iva', 'tax': 'iva', 'taxes': 'iva', 'vat': 'iva', 'gst': 'iva', 'descuento': 'descuento', 'discount': 'descuento', 'retencion': 'retencion', 'retenciones': 'retencion', 'retefuente': 'retencion', 'irpf': 'retencion', 'retencion en la fuente': 'retencion', 'base imponible': 'subtotal',
    'total': 'total', 'valor total': 'total', 'valor': 'total', 'monto': 'total', 'importe': 'total', 'total a pagar': 'total', 'valor a pagar': 'total', 'el total': 'total', 'amount': 'total', 'total amount': 'total', 'amount due': 'total', 'grand total': 'total',
    'saldo': 'saldo', 'balance': 'saldo', 'moneda': 'moneda', 'divisa': 'moneda', 'currency': 'moneda', 'forma de pago': 'formapago', 'medio de pago': 'formapago', 'payment method': 'formapago',
    'transportador': 'transportador', 'conductor': 'transportador', 'carrier': 'transportador', 'placa': 'placa',
    'titulo': 'titulo', 'title': 'titulo', 'asunto': 'titulo', 'nombre del documento': 'titulo', 'proyecto': 'proyecto', 'obra': 'proyecto', 'project': 'proyecto',
    'autor': 'autor', 'autores': 'autor', 'author': 'autor', 'authors': 'autor', 'elaborado por': 'autor', 'responsable': 'autor',
    'institucion': 'institucion', 'universidad': 'institucion', 'university': 'institucion', 'facultad': 'institucion', 'institution': 'institucion',
    'palabras clave': 'palabrasclave', 'keywords': 'palabrasclave', 'idioma': 'idioma', 'lengua': 'idioma', 'language': 'idioma',
    'paginas': 'paginas', 'numero de paginas': 'paginas', 'pages': 'paginas', 'extension': 'paginas',
    'paciente': 'paciente', 'patient': 'paciente', 'resumen': 'resumen', 'abstract': 'resumen', 'summary': 'resumen', 'sintesis': 'resumen', 'descripcion': 'resumen',
    'items': 'cantidaditems', 'cantidad de items': 'cantidaditems', 'filas': 'cantidaditems',
    'concepto': 'concepto', 'productos': 'concepto', 'servicios': 'concepto', 'que se compro': 'concepto', 'detalle': 'concepto', 'descripcion de la compra': 'concepto',
    'categoria': 'categoria', 'sector': 'categoria', 'tipo de gasto': 'categoria', 'rubro': 'categoria',
    'tema': 'temas', 'temas': 'temas', 'temas principales': 'temas', 'de que trata': 'temas', 'de que tratan': 'temas', 'topic': 'temas', 'topics': 'temas',
    'numero de plano': 'plano', 'plano': 'plano', 'no de plano': 'plano', 'codigo del plano': 'plano', 'lamina': 'plano', 'hoja': 'plano', 'sheet': 'plano', 'drawing number': 'plano',
    'titulo del plano': 'titulo', 'nombre del plano': 'titulo', 'contenido': 'titulo', 'titulo del proyecto': 'proyecto', 'nombre del proyecto': 'proyecto',
    'escala': 'escala', 'scale': 'escala', 'numero de proyecto': 'numproyecto', 'project number': 'numproyecto', 'revision': 'revision', 'rev': 'revision', 'version': 'revision',
    'dibujo': 'dibujo', 'dibujante': 'dibujo', 'drawn by': 'dibujo', 'diseno': 'diseno', 'disenador': 'diseno', 'designed by': 'diseno', 'reviso': 'reviso', 'checked by': 'reviso',
    'aprobo': 'aprobo', 'aprobado por': 'aprobo', 'approved by': 'aprobo', 'firmas': 'aprobo', 'observaciones': 'observaciones', 'observations': 'observaciones', 'notas': 'observaciones', 'notes': 'observaciones', 'rotulo': 'plano',
    'cufe': 'cufe', 'cude': 'cufe', 'codigo unico': 'cufe', 'tipo dian': 'tipodian', 'factura afectada': 'referencia', 'referencia': 'referencia',
    'base gravable': 'basegravable', 'inc': 'inc', 'impoconsumo': 'inc', 'impuesto al consumo': 'inc',
    'retefuente': 'retefuente', 'retencion en la fuente': 'retefuente', 'rete fuente': 'retefuente', 'reteiva': 'reteiva', 'rete iva': 'reteiva', 'reteica': 'reteica', 'rete ica': 'reteica',
    'tipo': null, 'tipo de documento': null, 'clasificacion': null, 'archivo': null, 'nombre del archivo': null,
  };

  // Palabras frecuentes y propias de cada idioma (las compartidas, como "de", se omiten)
  const IDIOMAS = {
    'Español': ['el', 'la', 'los', 'las', 'y', 'del', 'por', 'con', 'para', 'una', 'se', 'es', 'al', 'su', 'lo', 'como', 'pero'],
    'Inglés': ['the', 'and', 'of', 'to', 'in', 'is', 'for', 'with', 'that', 'on', 'this', 'be', 'are', 'by', 'from'],
    'Francés': ['le', 'les', 'des', 'et', 'est', 'une', 'du', 'pour', 'dans', 'au', 'sur', 'aux', 'par', 'ce', 'qui'],
    'Alemán': ['der', 'die', 'und', 'das', 'ist', 'mit', 'von', 'den', 'fur', 'nicht', 'ein', 'eine', 'wird', 'dem', 'im', 'auf', 'zu'],
    'Neerlandés': ['het', 'een', 'van', 'voor', 'met', 'niet', 'op', 'zijn', 'wij', 'uw', 'bij', 'naar', 'ook', 'deze', 'te'],
    'Portugués': ['os', 'do', 'da', 'dos', 'das', 'em', 'nao', 'ao', 'pelo', 'pela', 'sao', 'um', 'uma', 'na', 'no'],
    'Italiano': ['il', 'di', 'che', 'della', 'per', 'non', 'sono', 'gli', 'nel', 'alla', 'dei', 'delle'],
  };


  // =====================================================================
  // Estado
  // =====================================================================
  let archivos = [];   // {file, nombre, estado, clase}
  let libro = null, hojaActiva = 0, esEjemplo = true, cancelado = false, ocrWorker = null;
  let idiomaActual = '';   // idioma del documento en proceso
  let mesPrimero = false;  // fechas numéricas mm/dd (EE. UU.) en el documento en proceso

  const estado = (txt, tipo = '') => { const e = $('#estado'); e.textContent = txt; e.className = 'estado ' + tipo; };
  const progreso = v => { const p = $('#progreso'); p.hidden = v === null; if (v !== null) p.value = v; };
  function ocupado(si) {
    $('#convertir').disabled = si || !archivos.length;
    $('#detener').hidden = !si;
    $('#limpiar').hidden = si || !archivos.length;
    $('#descargar').disabled = si || esEjemplo;
    $('#entrada').disabled = si;
    pintarArchivos();
  }

  // ---------- Archivos ----------
  async function agregar(lista) {
    lista = [...lista];
    let pdfOmitidos = 0;
    if (lista.some(f => RE_ZIP.test(f.name))) {
      const planos = [];
      for (const f of lista) {
        if (!RE_ZIP.test(f.name)) { planos.push(f); continue; }
        estado(`Abriendo ${f.name}…`);
        try { const r = await expandirZip(f); planos.push(...r.files); pdfOmitidos += r.pdfOmitidos; }
        catch { archivos.push({ file: f, nombre: f.name, estado: 'ZIP dañado', clase: 'error', malo: true }); }
      }
      lista = planos;
    }
    const nuevos = lista.filter(f => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name) || RE_XML.test(f.name) || RE_HOJA.test(f.name) || RE_IMAGEN.test(f.name) || RE_WORD.test(f.name) || RE_NO_SOPORTADO.test(f.name) || /^image\//.test(f.type));
    const omitidos = lista.length - nuevos.length;
    for (const f of nuevos) if (!archivos.some(a => a.nombre === f.name && a.file.size === f.size))
      archivos.push({ file: f, nombre: f.name, estado: 'Pendiente', clase: '' });
    estado(`${archivos.length} documento${archivos.length === 1 ? '' : 's'} listo${archivos.length === 1 ? '' : 's'} para procesar.` + (pdfOmitidos ? ` De los ZIP se tomó el XML (datos exactos) y no su PDF (${pdfOmitidos}).` : '') + (omitidos ? ` Se omitieron ${omitidos} archivo(s) de un formato que no se puede leer.` : ''));
    ocupado(false);
  }
  function pintarArchivos() {
    const trabajando = !$('#detener').hidden;
    $('#archivos').innerHTML = archivos.map((a, i) =>
      `<li><span class="nom" title="${esc(a.nombre)}">${esc(a.nombre)}</span><span class="est ${a.clase}">${esc(a.estado)}</span>${trabajando ? '' : `<button type="button" data-i="${i}" aria-label="Quitar ${esc(a.nombre)}">×</button>`}</li>`).join('');
  }
  $('#archivos').onclick = e => { const b = e.target.closest('button'); if (b) { archivos.splice(+b.dataset.i, 1); ocupado(false); } };
  $('#limpiar').onclick = () => { archivos = []; estado(''); ocupado(false); };
  $('#entrada').onchange = async e => { await agregar(e.target.files); e.target.value = ''; };
  const zona = $('#zona');
  zona.addEventListener('dragover', e => { e.preventDefault(); zona.classList.add('sobre'); });
  zona.addEventListener('dragleave', () => zona.classList.remove('sobre'));
  zona.addEventListener('drop', e => { e.preventDefault(); zona.classList.remove('sobre'); agregar(e.dataTransfer.files); });
  const marcarPreset = () => { const v = $('#pedido').value.trim(); for (const b of $('#presets').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === v)); };
  $('#presets').onclick = e => { const b = e.target.closest('button'); if (b) { $('#pedido').value = b.dataset.v; marcarPreset(); } };
  $('#pedido').addEventListener('input', marcarPreset);

  // =====================================================================
  // Lectura de PDF: piezas de texto con posición (y crece hacia abajo)
  // =====================================================================
  async function piezasTexto(pag) {
    // Coordenadas de pantalla: respeta páginas con origen desplazado (planos de CAD) o rotadas
    const vp = pag.getViewport({ scale: 1 });
    const { items } = await pag.getTextContent();
    const piezas = items.filter(it => it.str.trim()).map(it => {
      const h = Math.hypot(it.transform[2], it.transform[3]) || Math.abs(it.transform[0]) || 10;
      const [x1, y1] = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
      const dx = it.width / (Math.hypot(it.transform[0], it.transform[1]) || 1);
      const [x2] = vp.convertToViewportPoint(it.transform[4] + it.transform[0] * dx, it.transform[5] + it.transform[1] * dx);
      return { x: Math.min(x1, x2), fin: Math.max(x1, x2), y: y1, alto: h, txt: it.str };
    });
    return piezas;
  }
  // Equipos con poca memoria o pocos núcleos: OCR a menor resolución (un poco menos preciso, bastante más rápido)
  const EQUIPO_LIVIANO = (navigator.deviceMemory || 8) <= 4 || (navigator.hardwareConcurrency || 4) <= 2;
  const RES_OCR = EQUIPO_LIVIANO ? 2000 : 2880;
  const tiemposOcr = [];
  if (EQUIPO_LIVIANO) $('#avisoEquipo').hidden = false;
  const restante = faltan => {
    if (tiemposOcr.length < 1 || faltan < 2) return '';
    const seg = tiemposOcr.slice(-5).reduce((a, b) => a + b, 0) / Math.min(5, tiemposOcr.length) / 1000 * faltan;
    return seg < 60 ? ` (faltan unos ${Math.ceil(seg / 5) * 5} s)` : ` (faltan unos ${Math.round(seg / 60)} min)`;
  };
  async function obtenerOcr() {
    if (ocrWorker) return ocrWorker;
    estado('Preparando el lector de documentos escaneados (solo la primera vez tarda más)…');
    ocrWorker = await Tesseract.createWorker('spa', 1, { workerPath: base + 'worker.min.js', corePath: base + 'tesseract-core', langPath: base + 'lang' });
    return ocrWorker;
  }
  async function piezasOcr(pag) {
    const vp = pag.getViewport({ scale: 1 });
    const escala = Math.min(3, RES_OCR / Math.max(vp.width, vp.height));
    const v = pag.getViewport({ scale: escala });
    const c = document.createElement('canvas');
    c.width = Math.round(v.width); c.height = Math.round(v.height);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await pag.render({ canvasContext: ctx, viewport: v }).promise;
    const { data } = await (await obtenerOcr()).recognize(c);
    c.width = c.height = 0;
    return (data.words || []).filter(p => p.text.trim() && p.confidence > 20).map(p => ({
      x: p.bbox.x0 / escala, fin: p.bbox.x1 / escala, y: p.bbox.y1 / escala,
      alto: Math.max(4, (p.bbox.y1 - p.bbox.y0) / escala), txt: p.text
    }));
  }

  // Agrupa piezas en líneas y cada línea en celdas separadas por espacios amplios
  function armarLineas(piezas) {
    piezas.sort((a, b) => a.y - b.y || a.x - b.x);
    const lineas = [];
    for (const p of piezas) {
      let l = null;
      for (let k = lineas.length - 1; k >= 0 && k >= lineas.length - 6; k--)
        if (Math.abs(lineas[k].y - p.y) < Math.max(lineas[k].alto, p.alto) * 0.5) { l = lineas[k]; break; }
      if (l) { l.piezas.push(p); l.alto = Math.max(l.alto, p.alto); } else lineas.push({ y: p.y, alto: p.alto, piezas: [p] });
    }
    lineas.sort((a, b) => a.y - b.y);
    return lineas.map(l => {
      l.piezas.sort((a, b) => a.x - b.x);
      const celdas = [];
      let ult = null;
      for (const p of l.piezas) {
        const hueco = ult ? p.x - ult.fin : Infinity;
        if (hueco < p.alto * 0.9) { ult.txt += (hueco > p.alto * 0.12 && !/\s$/.test(ult.txt) ? ' ' : '') + p.txt; ult.fin = Math.max(ult.fin, p.fin); }
        else celdas.push(ult = { x: p.x, fin: p.fin, txt: p.txt });
      }
      celdas.forEach(c => c.txt = c.txt.replace(/\s+/g, ' ').trim());
      return { y: l.y, alto: l.alto, celdas: celdas.filter(c => c.txt) };
    }).filter(l => l.celdas.length);
  }

  // Páginas a 2 o 3 columnas de texto (artículos, normas, boletines): se leen columna por columna
  function porColumnas(lineas, prof = 0) {
    if (lineas.length < 15 || prof > 2) return lineas;
    const celdas = lineas.flatMap(l => l.celdas);
    const minX = Math.min(...celdas.map(c => c.x)), maxX = Math.max(...celdas.map(c => c.fin)), W = maxX - minX;
    let mejor = null;
    for (let f = 0.25; f <= 0.75; f += 0.01) {
      const x = minX + W * f;
      let cruzan = 0, ambos = 0, unaPorLado = 0;
      const cruza = lineas.map(l => l.celdas.some(c => c.x < x - 2 && c.fin > x + 2));
      const primera = cruza.indexOf(false), ultima = cruza.lastIndexOf(false);
      for (let k = 0; k < lineas.length; k++) {
        const l = lineas[k];
        if (cruza[k]) { if (k > primera && k < ultima) cruzan++; continue; }
        const iz = l.celdas.filter(c => c.fin <= x), de = l.celdas.filter(c => c.x >= x);
        if (iz.length && de.length) { ambos++; if (iz.length === 1 && de.length === 1) unaPorLado++; }
      }
      const puntos = ambos - cruzan * 3;
      if (cruzan <= lineas.length * 0.12 && ambos >= lineas.length * 0.35 && unaPorLado >= ambos * 0.6 && (!mejor || puntos > mejor.puntos || (puntos === mejor.puntos && Math.abs(f - 0.5) < Math.abs(mejor.f - 0.5)))) mejor = { x, f, puntos };
    }
    if (!mejor) return lineas;
    const largo = cs => cs.reduce((s, c) => s + c.txt.length, 0) / Math.max(1, cs.length);
    const iz = [], de = [], cabecera = [];
    let empezo = false;
    for (const l of lineas) {
      const cruza = l.celdas.some(c => c.x < mejor.x - 2 && c.fin > mejor.x + 2);
      if (cruza) { (empezo ? iz : cabecera).push(l); continue; }
      empezo = true;
      const ci = l.celdas.filter(c => c.fin <= mejor.x), cd = l.celdas.filter(c => c.x >= mejor.x);
      if (ci.length) iz.push({ ...l, celdas: ci });
      if (cd.length) de.push({ ...l, celdas: cd });
    }
    // Solo si ambos lados son texto corrido (celdas largas), no una tabla
    if (largo(iz.flatMap(l => l.celdas)) < 18 || largo(de.flatMap(l => l.celdas)) < 18) return lineas;
    return [...cabecera, ...porColumnas(iz, prof + 1), ...porColumnas(de, prof + 1)];
  }

  // =====================================================================
  // Valores: números, dinero, monedas y fechas en varios idiomas y formatos
  // =====================================================================
  const RE_MONEDA = /(US\$|R\$|C\$|A\$|\$|€|£|₹|¥|R[sS]\.?(?=\s*-?\d)|\b(?:INR|EUR|USD|GBP|COP|CHF|MXN|ARS|BRL|CLP|PEN|CAD|AUD|JPY)\b)/;
  function monedaDe(s) {
    const m = String(s).match(RE_MONEDA);
    if (!m) return null;
    const t = m[1].toUpperCase().replace(/\.$/, '');
    return { '€': 'EUR', '£': 'GBP', '₹': 'INR', 'RS': 'INR', '¥': 'JPY', 'US$': 'USD', 'R$': 'BRL', 'C$': 'CAD', 'A$': 'AUD', '$': '$' }[t] || t;
  }
  function convertir(v) {
    if (typeof v !== 'string') return v;
    const t = v.trim();
    const f = fechaDe(t, true);
    if (f) return f;
    let s = t.replace(new RegExp('^' + RE_MONEDA.source + '\\s*'), '').replace(new RegExp('\\s*' + RE_MONEDA.source + '$'), '').replace(/[\s']/g, '');
    const neg = /^\(.*\)$/.test(s) || /^-/.test(s) || /-$/.test(s);
    s = s.replace(/^[(-]|[)-]$/g, '');
    if (/^0\d/.test(s) || s.replace(/\D/g, '').length > 15) return v;
    let n = null;
    if (/^\d+$/.test(s)) n = +s;
    else if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) n = +s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) n = +s.replace(/,/g, '');
    else if (/^\d{1,2}(,\d{2})+,\d{3}(\.\d+)?$/.test(s)) n = +s.replace(/,/g, '');          // 1,23,456.00 (India)
    else if (/^\d+,\d+$/.test(s)) n = +s.replace(',', '.');
    else if (/^\d+\.\d+$/.test(s)) n = +s;
    return n === null || isNaN(n) ? v : (neg ? -n : n);
  }
  const esNumerico = t => typeof convertir(t) === 'number';
  // Tapa las fechas de un texto (para que "August 3, 2014" no se lea como monto)
  function sinFechas(txt) {
    const bajo = txt.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const tapar = [];
    const mes = '(' + Object.keys(MESES).join('|') + ')';
    for (const re of [/\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}/g, /\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/g,
      new RegExp('\\d{1,2}\\.?\\s*(de\\s+)?' + mes + '\\.?,?\\s*(de\\s+)?\\d{4}', 'g'), new RegExp(mes + '\\.?\\s+\\d{1,2}(st|nd|rd|th)?\\s*,?\\s*\\d{4}', 'g')])
      for (const m of bajo.matchAll(re)) tapar.push([m.index, m.index + m[0].length]);
    let r = txt;
    for (const [i, j] of tapar) r = r.slice(0, i) + ' '.repeat(j - i) + r.slice(j);
    return r;
  }
  // Monto de un texto: si hay varios, el último (en "Total 1 278.61 40.39 319.00" el total es 319.00), priorizando los que llevan moneda
  function dineroDe(s) {
    const txt = sinFechas(String(s)).replace(/\d+([.,]\d+)?\s*%/g, ' ');
    const re = new RegExp('(?:' + RE_MONEDA.source + ')?\\s*(?<![\\w\\-\\/])-?\\(?(?<![A-Za-z0-9_])(?:\\d{1,3}(?:[ \\u00a0\\u202f]\\d{3})+(?:[.,]\\d+)?|\\d[\\d.,\']*\\d|\\d)(?![A-Za-z0-9_]|-\\d)\\)?-?(?:\\s?(?:' + RE_MONEDA.source + ')(?!\\s*-?\\d))?', 'g');
    const cands = [];
    for (const m of txt.matchAll(re)) {
      const tok = m[0].trim();
      const conMoneda = RE_MONEDA.test(tok);
      const num = tok.replace(new RegExp(RE_MONEDA.source, 'g'), '').replace(/[\s  ]/g, '');
      if (!conMoneda && /^(19|20)\d{2}$/.test(num)) continue;          // un año suelto no es un monto
      const n = convertir(num);
      if (typeof n !== 'number') continue;
      cands.push({ n, conMoneda, corto: /^\d{1,2}$/.test(num) });
    }
    const utiles = cands.filter(c => !c.corto || cands.length === 1);
    const conM = utiles.filter(c => c.conMoneda);
    return (conM.length ? conM : utiles).at(-1)?.n ?? null;
  }
  const MESES = {
    ene: 1, enero: 1, feb: 2, febrero: 2, mar: 3, marzo: 3, abr: 4, abril: 4, may: 5, mayo: 5, jun: 6, junio: 6, jul: 7, julio: 7, ago: 8, agosto: 8, sep: 9, sept: 9, septiembre: 9, setiembre: 9, set: 9, oct: 10, octubre: 10, nov: 11, noviembre: 11, dic: 12, diciembre: 12,
    jan: 1, january: 1, february: 2, march: 3, apr: 4, april: 4, june: 6, july: 7, aug: 8, august: 8, september: 9, october: 10, november: 11, dec: 12, december: 12,
    janvier: 1, fevrier: 2, fev: 2, mars: 3, avril: 4, avr: 4, mai: 5, juin: 6, juillet: 7, juil: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
    januar: 1, februar: 2, marz: 3, maerz: 3, juni: 6, juli: 7, oktober: 10, okt: 10, dezember: 12, dez: 12,
    januari: 1, februari: 2, maart: 3, mei: 5, augustus: 8,
    janeiro: 1, fevereiro: 2, marco: 3, maio: 5, junho: 6, julho: 7, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
    gennaio: 1, febbraio: 2, aprile: 4, maggio: 5, giugno: 6, luglio: 7, settembre: 9, ottobre: 10, dicembre: 12,
  };
  function fechaDe(s, exacta = false, mesAno = false) {
    const t = norm(s);
    const iso = (a, m, d) => (a >= 1900 && a <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) ? `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
    const pats = [
      [/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/, m => iso(+m[1], +m[2], +m[3])],
      [/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/, m => mesPrimero ? (iso(+m[3], +m[1], +m[2]) || iso(+m[3], +m[2], +m[1])) : (iso(+m[3], +m[2], +m[1]) || iso(+m[3], +m[1], +m[2]))],
      [/(\d{1,2})\.?\s*(?:de\s+)?([a-z]{3,10})\.?\s*,?\s*(?:de\s+|del\s+)?(\d{4})/, m => MESES[m[2]] && iso(+m[3], MESES[m[2]], +m[1])],
      [/([a-z]{3,10})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\s*,?\s*(?:de\s+)?(\d{4})/, m => MESES[m[1]] && iso(+m[3], MESES[m[1]], +m[2])],
    ];
    pats.push([/(?<![\d\/.-])(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2})(?![\d\/.-])/, m => { const a = +m[3] + (+m[3] < 70 ? 2000 : 1900); return mesPrimero ? (iso(a, +m[1], +m[2]) || iso(a, +m[2], +m[1])) : (iso(a, +m[2], +m[1]) || iso(a, +m[1], +m[2])); }]);
    if (mesAno) pats.push([/\b([a-z]{3,10})\.?,?\s+(?:de\s+)?(\d{4})\b/, m => MESES[m[1]] && +m[2] >= 1900 && +m[2] <= 2100 ? `${m[2]}-${String(MESES[m[1]]).padStart(2, '0')}` : null]);
    for (const [re, fn] of pats) {
      const m = t.match(exacta ? new RegExp('^' + re.source + '$') : re);
      if (m) { const r = fn(m); if (r) return r; }
    }
    return null;
  }
  function detectarIdioma(texto) {
    const t = ' ' + norm(texto).replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ') + ' ';
    const letras = (texto.match(/\p{L}/gu) || []).length || 1;
    for (const [nombre, re] of [['Árabe', /[\u0600-\u06FF\uFE70-\uFEFF]/g], ['Hebreo', /[\u0590-\u05FF]/g], ['Coreano', /[\uAC00-\uD7AF\u1100-\u11FF]/g], ['Japonés', /[\u3040-\u30FF]/g], ['Chino', /[\u4E00-\u9FFF]/g], ['Ruso', /[\u0400-\u04FF]/g], ['Griego', /[\u0370-\u03FF]/g]])
      if ((texto.match(re) || []).length > letras * 0.3) return nombre;
    const puntos = Object.entries(IDIOMAS).map(([id, palabras]) => [id, palabras.reduce((n, p) => n + (t.match(new RegExp(' ' + p + ' ', 'g')) || []).length, 0)]).sort((a, b) => b[1] - a[1]);
    const [[mejor, max], [, segundo]] = puntos;
    // En documentos cortos basta con pocas palabras si ningún otro idioma compite
    return max >= 4 && max >= segundo * 1.5 || max >= 2 && segundo === 0 ? mejor : '';
  }

  // =====================================================================
  // Análisis de un documento: líneas, pares clave-valor y tablas
  // =====================================================================
  const RE_KV = /^([^:]{2,45}?)\s*:\s*(.+)$/;
  function clavesValor(celdas) {
    const pares = [];
    for (let i = 0; i < celdas.length; i++) {
      const t = celdas[i].txt;
      if (/:$/.test(t) && t.length <= 46 && celdas[i + 1] && !/:$/.test(celdas[i + 1].txt)) { pares.push([t.slice(0, -1).trim(), celdas[++i].txt]); continue; }
      if (/:$/.test(t) && t.length <= 46 && !celdas[i + 1]) continue;
      const m = t.match(RE_KV);
      if (m && !/^\d{1,2}$/.test(m[1]) && !/https?$/i.test(m[1])) pares.push([m[1].trim(), m[2].trim()]);
      else return null;
    }
    return pares.length ? pares : null;
  }
  function columnasDeBloque(filas) {
    const cuenta = {};
    filas.forEach(f => cuenta[f.celdas.length] = (cuenta[f.celdas.length] || 0) + 1);
    const moda = +Object.entries(cuenta).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
    let cols = [];
    for (const f of filas.filter(f => f.celdas.length === moda))
      for (const c of f.celdas) {
        const k = cols.find(k => c.x < k.fin && c.fin > k.x);
        if (k) { k.x = Math.min(k.x, c.x); k.fin = Math.max(k.fin, c.fin); } else cols.push({ x: c.x, fin: c.fin });
      }
    cols.sort((a, b) => a.x - b.x);
    return cols.reduce((acc, k) => { const u = acc[acc.length - 1]; if (u && k.x < u.fin) u.fin = Math.max(u.fin, k.fin); else acc.push({ ...k }); return acc; }, []);
  }
  function ubicar(filas, cols) {
    return filas.map(f => {
      const r = Array(cols.length).fill('');
      for (const c of f.celdas) {
        const centro = (c.x + c.fin) / 2;
        let mejor = 0, dist = Infinity;
        cols.forEach((k, i) => {
          const solape = Math.min(c.fin, k.fin) - Math.max(c.x, k.x);
          const d = solape > 0 ? -solape : Math.min(Math.abs(centro - k.x), Math.abs(centro - k.fin));
          if (d < dist) { dist = d; mejor = i; }
        });
        r[mejor] = r[mejor] ? r[mejor] + ' ' + c.txt : c.txt;
      }
      return r;
    });
  }

  function analizar(paginas) {
    const kv = [], lineas = [], tablas = [];
    let enTablas = 0;
    paginas.forEach((ls, ip) => {
      const pagina = ip + 1;
      let bloque = [];
      const cerrar = () => {
        if (bloque.length >= 2) {
          const cols = columnasDeBloque(bloque);
          const filas = ubicar(bloque, cols);
          const cab = filas[0].every(v => !v || !esNumerico(v)) && filas[0].filter(Boolean).length >= 2;
          const columnas = cab ? filas.shift().map((v, i) => v || `Columna ${i + 1}`) : cols.map((_, i) => `Columna ${i + 1}`);
          // Encabezado + una sola fila = etiquetas arriba y valores abajo (ej.: Fecha | NIT | Total)
          if (cab && filas.length === 1) columnas.forEach((c, i) => filas[0][i] && kv.push({ label: c, labelN: norm(c).replace(/[:.#]+$/, ''), valor: filas[0][i], pagina, pos: lineas.length }));
          // Filas "etiqueta | valor" sin encabezado (ej.: Subtotal / IVA / TOTAL) son datos, no una tabla
          if (!cab && cols.length <= 3 && filas.every(f => esEtiqueta(f[0]) && f.slice(1).some(Boolean))) {
            filas.forEach(f => kv.push({ label: f[0], labelN: norm(f[0]).replace(/[:.#]+$/, ''), valor: f.slice(1).filter(Boolean).join(' '), pagina, pos: lineas.length }));
            bloque = []; return;
          }
          enTablas += bloque.length;
          const previa = tablas[tablas.length - 1];
          if (previa && previa.columnas.length === columnas.length &&
              (previa.columnas.join('|') === columnas.join('|') || (!cab && previa.pagina < pagina)))
            previa.filas.push(...filas);
          else if (filas.length) tablas.push({ columnas, filas, pagina });
        }
        bloque = [];
      };
      for (const l of ls) {
        const texto = l.celdas.map(c => c.txt).join('   ');
        lineas.push({ pagina, texto, textoN: norm(texto), celdas: l.celdas.map(c => c.txt), cx: l.celdas, alto: l.alto, y: l.y });
        const pares = clavesValor(l.celdas);
        if (pares) { cerrar(); pares.forEach(([k, v]) => kv.push({ label: k, labelN: norm(k).replace(/[:.#]+$/, ''), valor: v, pagina, pos: lineas.length - 1 })); continue; }
        if (l.celdas.length >= 2) {
          const u = bloque[bloque.length - 1], u2 = bloque[bloque.length - 2];
          const hueco = u ? l.y - u.y : 0;
          // Corta la tabla si hay un espacio grande, o si cambia el número de columnas tras un espacio mayor al habitual
          if (u && (hueco > 60 || (u2 && l.celdas.length !== u.celdas.length && hueco > (u.y - u2.y) * 1.3))) cerrar();
          bloque.push(l);
        } else cerrar();
      }
      cerrar();
    });
    const utiles = tablas.filter(t => t.filas.length >= 1 && !(t.filas.length === 1 && t.columnas.every(c => !/^Columna/.test(c))));
    return { kv, lineas, tablas: utiles, ratioTabla: lineas.length ? enTablas / lineas.length : 0 };
  }

  // Metadatos del PDF (título, autor, fecha de creación): se usan solo si parecen reales
  function metadatos(info, doc) {
    const r = {};
    const texto1 = ' ' + doc.lineas.filter(l => l.pagina <= 2).map(l => l.textoN).join(' ') + ' ';
    const t = String(info.Title || '').trim();
    if (t.length >= 6 && t.length <= 250 && !/^(microsoft (word|powerpoint|excel)|untitled|sin t[ií]tulo|document\d*$|documento\d*$|presentation|slide|\S+\.(docx?|pdf|tex|indd|qxd|dvi|pptx?|xlsx?))/i.test(t)) {
      const palabras = norm(t).split(/[^a-z0-9]+/).filter(w => w.length >= 4);
      // Solo si el título aparece en el propio documento (evita títulos de plantillas viejas)
      if (palabras.length && palabras.filter(w => texto1.includes(w)).length >= palabras.length * 0.6) r.tituloMeta = t.replace(/\s+/g, ' ');
    }
    const a = String(info.Author || '').trim();
    if (a.length >= 4 && a.length <= 150 && /\p{L}{2}/u.test(a) && !/^(user|usuario|admin|administrator|owner|unknown|microsoft|adobe|pdf|root|default|author|autor|hp|dell|lenovo|windows)\b/i.test(a) && !/@|\.com\b|ARRAY\(|HASH\(|^[\W\d]+$|:/.test(a)) r.autorMeta = a.replace(/\s+/g, ' ');
    const d = String(info.CreationDate || '').match(/(?:D:)?(\d{4})(\d{2})(\d{2})/);
    if (d && +d[1] >= 1990 && +d[1] <= 2100) r.fechaMeta = `${d[1]}-${d[2]}-${d[3]}`;
    return r;
  }

  // =====================================================================
  // Clasificación
  // =====================================================================
  const cuenta = (txt, k) => (txt.match(new RegExp('(^|[^a-z])' + escRe(k) + '([^a-z]|$)', 'g')) || []).length;
  // =====================================================================
  // Planos: el rótulo (cajetín) con número de plano, título, proyecto, escala, firmas y observaciones
  // =====================================================================
  const ROTULO = [
    ['dibujo', /^(drawn( by)?|dibujo|dibujado( por)?|dibujante|dib)$/],
    ['diseno', /^(designed( by)?|design|diseno|disenado( por)?|disenador|disen[oó])$/],
    ['reviso', /^(checked( by)?|reviewed( by)?|reviso|revisado( por)?|revisor)$/],
    ['aprobo', /^(approved( by)?|aprobed( by)?|aprobo|aprobado( por)?|vo ?bo)$/],
    ['escala', /^(scale|escala|esc|echelle|massstab)$/],
    ['fecha', /^(date|fecha|fecha de emision|issue date|datum)$/],
    ['numproyecto', /^(project (number|no|n[o°º])|job (no|number)|proyecto (no|n[o°º])|no (de )?proyecto|numero de proyecto|codigo (del )?proyecto)$/],
    ['plano', /^(plano|plano (no|n[o°º]|numero)|no (de )?plano|numero de plano|codigo (del )?plano|lamina( no| n[o°º])?|hoja( no| n[o°º])?|sheet( no| number)?|drawing (no|number)|dwg( no)?)$/],
    ['revision', /^(rev|revision|version)$/],
    ['proyecto', /^(proyecto|project|obra|project name|nombre del proyecto)$/],
    ['titulo', /^(contiene|contenido|titulo( del plano)?|drawing title|title|nombre del plano|descripcion del plano)$/],
    ['cliente', /^(cliente|client|owner|propietario|contratante)$/],
    ['observaciones', /^(observaciones|observations|notas( generales)?|notes|general notes|nota)$/],
  ];
  const RE_ESCALA = /\b1\s?:\s?\d{1,5}\b|\b(indicada|as shown|n\.?t\.?s|sin escala|varias)\b/i;
  const etiquetaRotulo = t => { const n = norm(t).replace(/[:.\-]+$/, '').replace(/[.]/g, '').trim(); return ROTULO.find(([, re]) => re.test(n))?.[0] || null; };
  function rotuloDoc(doc) {
    if (doc._rotulo !== undefined) return doc._rotulo;
    // Piezas sueltas de la primera página (x, fin, y, alto, txt)
    let P = doc.piezas1;
    if (!P) P = doc.lineas.filter(l => l.pagina === 1).flatMap(l => (l.cx || []).map(c => ({ x: c.x, fin: c.fin, y: l.y, alto: l.alto, txt: c.txt })));
    P = P.filter(p => p.txt.trim());
    if (P.length < 5) return (doc._rotulo = null);
    // "ESCALA: 1:75" en una sola pieza → etiqueta y valor
    const piezas = [];
    for (const p of P) {
      const m = p.txt.match(/^\s*([^:]{2,30}?)\s*:\s*(.+)$/);
      if (m && etiquetaRotulo(m[1]) && !/^\d/.test(m[1])) { const k = (p.fin - p.x) / Math.max(1, p.txt.length); piezas.push({ ...p, txt: m[1], fin: p.x + m[1].length * k }, { ...p, txt: m[2].trim(), x: p.x + (p.txt.length - m[2].length) * k }); }
      else piezas.push(p);
    }
    const etiquetas = piezas.map(p => ({ p, k: etiquetaRotulo(p.txt) })).filter(e => e.k);
    const fuertes = etiquetas.filter(e => ['dibujo', 'diseno', 'reviso', 'aprobo', 'escala', 'numproyecto', 'plano'].includes(e.k));
    if (new Set(fuertes.map(e => e.k)).size < 2) return (doc._rotulo = null);
    const W = Math.max(...P.map(p => p.fin)), H = Math.max(...P.map(p => p.y));
    const bx0 = Math.min(...fuertes.map(e => e.p.x)), by0 = Math.min(...fuertes.map(e => e.p.y));
    const altoEtq = fuertes.map(e => e.p.alto).sort((a, b) => a - b)[Math.floor(fuertes.length / 2)] || 10;
    const esEtq = new Set(etiquetas.map(e => e.p));
    const validos = {
      escala: v => RE_ESCALA.test(v), fecha: v => !!(fechaDe(v) || fechaDe(v, false, true)), revision: v => /^[A-Z0-9]{1,4}$/i.test(v.trim()),
      numproyecto: v => /\d/.test(v) && v.length <= 30, plano: v => /[A-Z]/i.test(v) || /\d/.test(v),
      nombre: v => /\p{L}{2}/u.test(v) && !RE_ESCALA.test(v) && !fechaDe(v) && !etiquetaRotulo(v),
    };
    const ok = (k, v) => (validos[k] || validos.nombre)(v);
    // Valor: la pieza más cercana a la derecha en la misma línea, o la de abajo
    const valor = e => {
      const { p, k } = e;
      const der = piezas.filter(q => q !== p && !esEtq.has(q) && q.x >= p.fin - 2 && Math.abs(q.y - p.y) < Math.max(p.alto, 6) * 0.7 && q.x - p.fin < W * 0.2 && ok(k, q.txt)).sort((a, b) => a.x - b.x)[0];
      // Etiqueta pequeña arriba y valor debajo (rótulos en franja)
      const abajo = piezas.filter(q => q !== p && !esEtq.has(q) && q.y > p.y + 1 && q.alto <= Math.max(p.alto, 6) * 2.5 && q.y - p.y < Math.max(p.alto, q.alto, 8) * 3.5 && q.x < p.fin + 40 && q.fin > p.x - 40 && ok(k, q.txt)).sort((a, b) => a.y - b.y || Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
      const dDer = der ? der.x - p.fin : Infinity, dAbajo = abajo ? (abajo.y - p.y) * 1.5 : Infinity;
      const q = dDer <= dAbajo ? der : abajo;
      return q ? q.txt.trim() : null;
    };
    const r = { etiquetas: new Set(fuertes.map(e => e.k)).size, presentes: new Set(etiquetas.map(e => e.k)) };
    for (const e of etiquetas) if (e.k !== 'observaciones' && r[e.k] == null) { const v = valor(e); if (v) r[e.k] = v; }
    // Zona del rótulo: alrededor de las etiquetas
    const enZona = q => q.x >= bx0 - W * 0.03 && q.y >= by0 - H * 0.2;
    const zona = piezas.filter(enZona);
    // Número de plano: el código más grande del rótulo (MEC-31, A-101, E-02…)
    const RE_COD = /^[A-Z]{1,6}[\s\-_.]?\d{1,4}([\-.]\d{1,3})?[A-Z]?$/i;
    if (!r.plano) {
      const cod = zona.filter(q => RE_COD.test(q.txt.trim()) && !RE_ESCALA.test(q.txt) && q.alto >= altoEtq * 1.3).sort((a, b) => b.alto - a.alto)[0];
      if (cod) r.plano = cod.txt.trim();
    }
    // Título y proyecto: los textos grandes del rótulo, agrupados en bloques
    const usados = new Set(Object.values(r).map(v => norm(v)));
    const grandes = zona.filter(q => !esEtq.has(q) && q.alto >= altoEtq * 1.5 && /\p{L}{2}/u.test(q.txt) && !RE_ESCALA.test(q.txt) && !fechaDe(q.txt) && !usados.has(norm(q.txt)) && !RE_COD.test(q.txt.trim()))
      .sort((a, b) => a.y - b.y || a.x - b.x);
    const bloques = [];
    for (const q of grandes) {
      const b = bloques.at(-1);
      if (b && Math.abs(b.alto - q.alto) < q.alto * 0.2 && q.y - b.ultY < q.alto * 1.6 && q.y - b.ultY >= -2) { if (Math.abs(q.y - b.ultY) < q.alto * 0.4) b.partes[b.partes.length - 1] += ' ' + q.txt.trim(); else b.partes.push(q.txt.trim()); b.ultY = q.y; }
      else bloques.push({ alto: q.alto, ultY: q.y, partes: [q.txt.trim()] });
    }
    const textos = bloques.map(b => b.partes.join(' ').replace(/\s+/g, ' '));
    if (!r.titulo && !r.proyecto && textos.length >= 2) { r.proyecto = textos[0]; r.titulo = textos.slice(1).sort((a, b) => b.length - a.length)[0]; }
    else if (!r.titulo && textos.length) r.titulo = textos.find(t => norm(t) !== norm(r.proyecto || '')) || null;
    else if (!r.proyecto && textos.length) r.proyecto = textos.find(t => norm(t) !== norm(r.titulo || '')) || null;
    // Observaciones: lo que está debajo de la etiqueta (en su recuadro)
    const obs = etiquetas.filter(e => e.k === 'observaciones').sort((a, b) => (enZona(b.p) - enZona(a.p)));
    for (const { p } of obs) {
      const lineas = [];
      for (const q of piezas.filter(q => q.y > p.y + 1 && q.y - p.y < H * 0.2 && q.x >= p.x - 15 && q.x < p.x + W * 0.22).sort((a, b) => a.y - b.y || a.x - b.x)) {
        if (esEtq.has(q) || q.alto >= altoEtq * 1.5 || grandes.includes(q)) break;
        const ult = lineas.at(-1);
        if (ult && q.y - ult.y > Math.max(q.alto, 8) * 2.6) break;
        if (ult && Math.abs(q.y - ult.y) < q.alto * 0.5) ult.t += ' ' + q.txt.trim(); else lineas.push({ y: q.y, t: q.txt.trim() });
      }
      const texto = lineas.map(l => l.t).join(' ').replace(/\s+/g, ' ').trim();
      if (texto) { r.observaciones = texto.length > 600 ? texto.slice(0, 597) + '…' : texto; break; }
      r.observaciones ??= 'Sin observaciones';
    }
    return (doc._rotulo = r);
  }

  function clasificar(doc, nombreArchivo, meta) {
    const inicio = doc.lineas.filter(l => l.pagina === 1).slice(0, 16);
    const altoMax = Math.max(...inicio.map(l => l.alto), 1);
    const cuerpo = ' ' + doc.lineas.filter(l => l.pagina <= 4).map(l => l.textoN).join(' \n ') + ' ';
    const archivoN = norm(nombreArchivo).replace(/[_\-.]+/g, ' ');
    const puntajes = [];
    for (const t of TIPOS) {
      let p = 0;
      for (const k of t.titulo) {
        for (const l of inicio) if (cuenta(' ' + l.textoN + ' ', k)) { p += 6 + (l.alto >= altoMax * 0.9 ? 4 : 0) + k.split(' ').length; break; }
        if (cuenta(' ' + archivoN + ' ', k)) p += 4;
        p += Math.min(3, cuenta(cuerpo, k));
      }
      for (const k of t.claves) p += Math.min(2, cuenta(cuerpo, k)) * 1.5;
      if (t.id === 'formulario' && meta.camposFormulario) p += 8 + Math.min(6, meta.camposFormulario);
      if (t.id === 'norma') p -= t.claves.reduce((s, k) => s + Math.min(2, cuenta(cuerpo, k)), 0) * 0.5;   // sus palabras del cuerpo son muy comunes
      if (t.id === 'norma' && (cuerpo.match(/\b(shall|are to be|is to be|must be|deberan?|doit|doivent|muss|mussen)\b/g) || []).length >= 6) p += 6;   // lenguaje de obligación, propio de reglamentos
      if (t.id === 'articulo' || t.id === 'tesis') {
        if (doc.lineas.filter(l => l.pagina <= 2).some(l => /^(abstract|resumen|resume|zusammenfassung)\b/.test(l.textoN))) p += 6;
        if (doc.lineas.some(l => /^(\d+\.?\s*)?(references|bibliography|referencias|bibliografia|literatur|literaturverzeichnis|bibliographie)\s*$/.test(l.textoN))) p += 4;
        if (doc.lineas.some(l => l.pagina === 1 && /@/.test(l.texto))) p += 3;
      }
      if (t.id === 'plano') {
        const rot = rotuloDoc(doc);
        if (rot) p += 8 + rot.etiquetas * 3;
        if (meta.ladoMayor >= 1600) p += 8; else if (meta.ladoMayor >= 1150) p += 3;
        // Un plano lleva escala (1:100…) o se llama así; "drawing" suelto no basta
        if (doc.lineas.some(l => /\b1\s?:\s?(20|25|50|75|100|125|150|200|250|500|1000|2000|5000)\b/.test(l.texto))) p += 6;
        else if (!inicio.some(l => /\b(plano|planos|blueprint|floor plan|site plan)\b/.test(l.textoN))) p *= 0.3;
      }
      if (t.id === 'presentacion' && meta.horizontales >= meta.leidas * 0.7 && meta.leidas >= 3 && doc.lineas.length / meta.leidas < 30) p += 12;
      if (t.id === 'carta' && doc.lineas.slice(0, 12).some(l => /^(dear|estimad|apreciad|to whom|a quien|senor|madame|monsieur|sehr geehrte)/.test(l.textoN))) p += 6 + (doc.lineas.some(l => RE_DESPEDIDA.test(l.textoN)) ? 8 : 0);
      if (t.id === 'libro' && meta.paginas >= 40) p += doc.lineas.filter(l => l.pagina <= 20).some(l => /^(table of contents|contents|indice|inhaltsverzeichnis|sommaire|chapter 1|capitulo 1)\b/.test(l.textoN)) ? 8 : 4;
      puntajes.push([t, p]);
    }
    puntajes.sort((a, b) => b[1] - a[1]);
    doc._puntajes = puntajes.slice(0, 5).map(([t, p]) => t.id + ':' + p.toFixed(1)).join(' ');
    let [mejor, pMejor] = puntajes[0];
    const segundo = puntajes[1][1];
    // Documentos donde casi todo son tablas: son listados/tablas de datos (salvo documentos comerciales claros)
    if (doc.ratioTabla >= 0.6 && !mejor.comercial && pMejor < 16 && doc.lineas.length >= 12)
      return { tipo: TIPOS.find(t => t.id === 'datos'), confianza: 'media' };
    const datos = TIPOS.find(t => t.id === 'datos');
    if (pMejor < 6) {
      if (doc.ratioTabla >= 0.45 && doc.lineas.length >= 12 || doc.ratioTabla >= 0.8 && doc.lineas.length >= 4) return { tipo: datos, confianza: 'media' };
      if (meta.paginas >= 40) return { tipo: TIPOS.find(t => t.id === 'libro'), confianza: 'media' };
      return { tipo: OTRO, confianza: 'baja' };
    }
    return { tipo: mejor, confianza: pMejor - segundo >= 6 ? 'alta' : 'media' };
  }

  // =====================================================================
  // Extracción de campos
  // =====================================================================
  const PALABRAS_ETIQUETA = /^(pag|page|seite|pagina|date|datum|fecha|data|dated|due|total|amount|of|de|van|du)\b/i;
  function validar(valor, tipo) {
    const v = String(valor ?? '').trim();
    if (!v) return null;
    switch (tipo) {
      case 'dinero': return dineroDe(v);
      case 'fecha': return fechaDe(v) || fechaDe(v, false, true);
      case 'nit': {
        const m = v.match(/\b[A-Z]{0,4}[\dA-Z][\dA-Z.,\-\s]{4,20}[\dA-Z]\b/i);
        return m && (m[0].match(/\d/g) || []).length >= 5 ? m[0].replace(/\s/g, '') : null;
      }
      case 'correo': { const m = v.match(/[\w.+-]+@[\w-]+\.[\w.]+/); return m ? m[0] : null; }
      case 'codigo': {
        const t = v.replace(/^(n[°ºo]\.?|no\.?|nr\.?|nro\.?|numero|number|#|:)\s*[:.]?\s*/i, '').replace(/^#\s*/, '');
        let m = t.match(/^([A-Za-z]{1,5})\s(\d[\w\-\/.]*)/);
        let c = m ? m[1] + ' ' + m[2] : (t.match(/^[\w\-\/.]*\d[\w\-\/.]*/) || [])[0];
        if (!c) return null;
        c = c.replace(/[.,;]$/, '');
        return c.length <= 30 && !fechaDe(c) && !PALABRAS_ETIQUETA.test(c) ? c : null;
      }
      case 'nombre': { const n = limpiarAutores(v); return pareceNombre(n) ? n : null; }
      case 'largo': return v.length > 2 && v.length <= 400 ? v.replace(/\s+/g, ' ') : null;
      default: {
        if (v.length < 2 || v.length > 140 || !/\p{L}{2}/u.test(v) || /www\.|https?:|@/.test(v)) return null;
        if (/^[A-Z0-9\-_\/.#]+$/.test(v) && /\d/.test(v)) return null;          // parece un código, no un nombre
        if ((v.match(/\d/g) || []).length > v.length * 0.4) return null;
        return esEtiqueta(v) ? null : v.replace(/\s+/g, ' ');
      }
    }
  }
  const ETIQUETAS = new Set(Object.values(CAMPOS).flatMap(c => c.syn).filter(s => s.length > 2).concat(['forma de pago', 'cantidad', 'descripcion', 'description', 'codigo', 'valor unitario', 'unit price', 'quantity', 'qty', 'amount', 'order', 'ordernummer', 'order id', 'artikel', 'omschrijving', 'prijs', 'bedrag', 'aantal', 'product', 'item', 'items', 'price', 'reference', 'referencia', 'ship to', 'shipping address', 'payment terms', 'po number', 'klantnummer', 'kundennr', 'customer id', 'account number', 'afleveradres', 'besteldatum', 'vervaldatum', 'cant', 'detalle', 'unid', 'v. unit', 'vendedor', 'tarifa', 'base', 'impuesto', 'valor']));
  const esEtiqueta = t => /:\s*$/.test(t) || ETIQUETAS.has(norm(t).replace(/[:.#]+$/, '').replace(/\s*\d+([.,]\d+)?\s*%$/, '').replace(/\s*\(.*\)$/, ''));
  const excluye = (l, campo) => campo.excluir?.some(x => /^[a-z ]+$/.test(x) ? new RegExp('(^|\\s)' + x + '($|\\s)').test(l) : l.includes(x));
  function puntajeEtiqueta(labelN, campo) {
    const l = labelN.replace(/[()]/g, '');
    if (excluye(l, campo)) return 0;
    let mejor = 0;
    campo.syn.forEach((s, i) => {
      const peso = 1 + (campo.syn.length - i) / campo.syn.length;   // los primeros sinónimos son más específicos
      if (l === s) mejor = Math.max(mejor, 4 * peso);
      else if (s.length > 2 && l.startsWith(s + ' ')) mejor = Math.max(mejor, 2.5 * peso);
      else if (s.length > 3 && new RegExp('(^|\\s)' + escRe(s) + '($|\\s)').test(l)) mejor = Math.max(mejor, 1.5 * peso);
    });
    return mejor;
  }

  // OCR: si el comienzo de la celda está a una o dos letras de una etiqueta conocida ("subtota" → "subtotal"), se corrige
  const distancia = (a, b) => {
    if (Math.abs(a.length - b.length) > 2) return 9;
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  };
  function corregirEtiqueta(cn, syns) {
    // Si ya empieza por una etiqueta conocida, no se toca
    if (syns.some(s => cn === s || cn.startsWith(s + ' ') || new RegExp('^' + escRe(s) + '[:.;,]').test(cn))) return cn;
    for (const s of syns) {
      if (s.length < 6 || cn.startsWith(s)) continue;
      const n = s.split(' ').length;
      const partes = cn.split(' ');
      const cab = partes.slice(0, n).join(' ').replace(/[:.;,]+$/, '');
      if (cab.length >= 5 && distancia(cab, s) <= (s.length >= 10 ? 2 : 1)) return s + (cn.slice(partes.slice(0, n).join(' ').length).match(/^[:.;,]*/)[0] || '') + cn.slice(partes.slice(0, n).join(' ').length).replace(/^[:.;,]*/, '');
    }
    return cn;
  }

  // Devuelve {v, raw} con el mejor candidato para un campo
  function buscarCon(doc, campo, filtro) {
    const cand = [];
    const dinero = campo.tipo === 'dinero';
    const bono = raw => dinero && (RE_MONEDA.test(raw) || /\d[.,]\d{2}\b/.test(raw)) ? 0.6 : 0;
    for (const kv of doc.kv) {
      const p = puntajeEtiqueta(kv.labelN, campo);
      if (!p) continue;
      const v = validar(kv.valor, campo.tipo);
      if (v !== null) cand.push({ v, raw: kv.valor, p: p + 1 + bono(kv.valor), pos: kv.pos });
    }
    // Etiqueta al inicio de una celda; el valor va en el resto de la celda, en las celdas
    // de la derecha o justo debajo (formatos con etiquetas arriba y valores abajo)
    doc.lineas.forEach((l, pos) => l.cx.forEach((c0, i0) => {
      // El OCR a veces parte la etiqueta en dos celdas ("Total" | "a Pagar"): se prueba también unida
      const sig0 = l.cx[i0 + 1];
      const variantes = [[c0, i0]];
      if (sig0 && !/\d/.test(c0.txt) && /^\p{Ll}/u.test(sig0.txt) && !/\d/.test(sig0.txt) && sig0.txt.length <= 20 && sig0.txt.split(/\s+/).length <= 3) variantes.push([{ x: c0.x, fin: sig0.fin, txt: c0.txt + ' ' + sig0.txt }, i0 + 1]);
      for (const [c, i] of variantes.reverse()) {
      let cn = norm(c.txt);
      if (doc.ocr) cn = corregirEtiqueta(cn, campo.syn);
      for (const s of campo.syn) {
        if (s.length < 3 && !/^(no|nro|nr|n)$/.test(s)) continue;
        const m = cn.match(new RegExp('^' + escRe(s) + '(?![a-z0-9])(?:\\s*\\([a-z$€£₹.]{1,4}\\)|\\s*[$€£₹])?(?:\\s*\\d+(?:[.,]\\d+)?\\s*%)?\\s*([:#°º.]*)\\s*(.*)$'));
        if (!m) continue;
        if (excluye(cn, campo)) return;
        let v = null, raw = '';
        const resto = m[2] ? c.txt.slice(c.txt.length - m[2].length) : '';
        if (dinero) {
          const sigs = [];
          for (const o of l.cx.slice(i + 1)) { if (esEtiqueta(o.txt) || /^\p{L}{3,}/u.test(o.txt) && !RE_MONEDA.test(o.txt)) break; sigs.push(o.txt); }
          raw = [resto, ...sigs].join('   ');
          v = validar(raw, 'dinero');
        } else if (resto && (campo.tipo !== 'texto' || /[:#]/.test(m[1]))) {
          // En texto libre exige separador ("Cliente: X"); así "Laboratorio Dental" no se corta en "Dental"
          raw = resto; v = validar(raw, campo.tipo);
        }
        if (v === null && !(resto && campo.tipo === 'texto')) {
          const sig = l.cx[i + 1];
          if (!dinero && sig && !esEtiqueta(sig.txt)) { raw = sig.txt; v = validar(raw, campo.tipo); }
          for (let k = 1; v === null && k <= 2; k++) {
            const abajo = doc.lineas[pos + k];
            if (!abajo || abajo.pagina !== l.pagina) break;
            const d = abajo.cx.find(o => Math.min(o.fin, c.fin) - Math.max(o.x, c.x) > 2) || abajo.cx.find(o => o.x < c.fin + 4 && o.fin > c.x - 4);
            if (d && !esEtiqueta(d.txt)) { raw = d.txt; v = validar(raw, campo.tipo); }
          }
        }
        if (v !== null) { cand.push({ v, raw, p: puntajeEtiqueta(s, campo) * 0.8 + bono(raw), pos }); return; }
      }
      }
    }));
    if (filtro) cand.splice(0, cand.length, ...cand.filter(c => filtro(c.pos)));
    if (!cand.length) return null;
    // Un total en cero ("Te betalen € 0,00" tras pagar) cede ante uno real
    const lista = dinero && cand.some(c => c.v !== 0) ? cand.filter(c => c.v !== 0) : cand;
    lista.sort((a, b) => b.p - a.p || (campo.ultimo ? b.pos - a.pos : a.pos - b.pos));
    return lista[0];
  }
  const buscar = (doc, campo) => buscarCon(doc, campo)?.v ?? null;

  const RE_NUMDOC = /(factura(?:\s+electr[oó]nica)?(?:\s+de\s+venta)?|tax\s+invoice|invoice|facture|rechnung|factuur|fattura|fatura|receipt|recibo|remisi[oó]n|delivery\s+note|cotizaci[oó]n|quotation|quote|devis|angebot|orden\s+de\s+(?:compra|servicio)|purchase\s+order|nota\s+(?:cr[eé]dito|d[eé]bito)|credit\s+note|cuenta\s+de\s+cobro|booking\s+id|docket)\s*(?:n\.?\s?[°ºo]\.?|no\.?|nr\.?|nro\.?|n[uú]mero|number|num[eé]ro|nummer|#|id)?\s*[:.]?\s*([A-Z]{0,8}[\s\-\/#.]?\d[\w\-\/.]*)/i;
  function numeroDoc(doc, tipo) {
    for (const l of doc.lineas.slice(0, 80)) {
      const m = l.texto.match(RE_NUMDOC);
      if (m) { const v = validar(m[2], 'codigo'); if (v) return v; }
    }
    if (!tipo?.comercial) return null;
    for (const l of doc.lineas.slice(0, 15)) { const m = l.texto.match(/\b(\d{4,5})\s*-\s*(\d{8})\b/); if (m) return `${m[1]}-${m[2]}`; }
    const iTit = doc.lineas.slice(0, 40).findIndex(l => /^(factura|invoice|recibo|remision|cotizacion)\b/.test(l.textoN) && l.texto.length < 60);
    if (iTit >= 0) for (const l of doc.lineas.slice(iTit + 1, iTit + 3)) { const m = l.texto.trim().match(/^(?:no\.?\s*|n[°º]\s*)?([A-Z]{1,6}[\s-]?\d{3,}[\w-]*)$/i); if (m && validar(m[1], 'codigo')) return validar(m[1], 'codigo'); }
    for (const l of doc.lineas.slice(0, 15)) { const m = l.texto.match(/^#\s*(\S+)$/); if (m && validar(m[1], 'codigo')) return validar(m[1], 'codigo'); }
    return buscar(doc, CAMPOS.numero);
  }
  // Texto de la línea sin el número de renglón que traen transcripciones y escritos judiciales
  const sinRenglon = l => l.texto.replace(/^\d{1,3}\s{2,}/, '');
  // Una línea "de nombre": no es fecha, saludo, encabezado numerado, correo ni "Campo: valor"
  const lineaNombre = l => {
    const x = sinRenglon(l), t = norm(x);
    return /\p{L}{3}/u.test(t) && !fechaDe(t) && !RE_KV.test(x) && !/^\d+(\.\d+)*\.?\s/.test(t) && !/,\s*$/.test(t) && !/@|www\.|https?:/.test(t) &&
      !/^(estimad|senor|apreciad|cordial|atentamente|dear|pagina|page|seite|original|copia|copy|\*)/.test(t) && t.replace(/[^0-9]/g, '').length < t.length * 0.3 && x.length <= 110;
  };
  // Título: la línea de letra más grande de la primera página (y las que la continúan)
  function tituloInfo(doc) {
    if (doc._titulo !== undefined) return doc._titulo;
    const p1 = doc.lineas.filter(l => l.pagina === 1);
    const altos = doc.lineas.slice(0, 400).map(l => l.alto).sort((a, b) => a - b);
    const normal = altos[Math.floor(altos.length / 2)] || 1;
    const lineaTitulo = l => lineaNombre(l) || (RE_KV.test(sinRenglon(l)) && l.alto > normal * 1.2 && !/@|www\.|https?:/.test(l.textoN));
    const ys = p1.map(l => l.y).filter(y => y != null);
    const arriba = ys.length ? Math.min(...ys) + (Math.max(...ys) - Math.min(...ys)) * 0.45 : Infinity;
    const candidatas = p1.slice(0, 18).filter(l => (l.y == null || l.y <= arriba) && lineaTitulo(l) && !/(\.{4,}|…)\s*\d*\s*$/.test(l.texto) && (l.textoN.match(/\p{L}{3,}/gu) || []).length >= 2 && (l.texto.match(/\p{L}/gu) || []).length >= 6 && !/^(table of contents|contents|indice|inhaltsverzeichnis|sommaire|spacer text|please wait)/.test(l.textoN) && !/\b[a-z0-9-]+\.(com|org|net|edu|gov|co)\b/.test(l.textoN));
    if (!candidatas.length) return doc._titulo = null;
    const max = Math.max(...candidatas.map(l => l.alto));
    let i = p1.indexOf(candidatas.find(l => l.alto >= max * 0.95));
    if (max <= normal * 1.1) {
      const mayus = candidatas.find(l => { const x = sinRenglon(l); return x === x.toUpperCase() && x.length > 8; });
      return doc._titulo = mayus ? { texto: sinRenglon(mayus).replace(/\s{2,}/g, ' '), i: p1.indexOf(mayus), alto: mayus.alto } : null;
    }
    while (i > 0 && p1[i - 1].alto >= max * 0.9 && p1[i - 1].alto <= max * 1.05 && lineaTitulo(p1[i - 1])) i--;
    const partes = [sinRenglon(p1[i])];
    while (partes.length < 3 && p1[i + 1] && p1[i + 1].alto >= max * 0.9 && lineaTitulo(p1[i + 1])) partes.push(sinRenglon(p1[++i]));
    return doc._titulo = { texto: partes.join(' ').replace(/\s+/g, ' ').trim(), i, alto: max };
  }
  const RE_INSTITUCION = /\b(universidad|university|universite|universitat|universiteit|universita|college|institut[eo]?|instituto|facultad|faculty|fakultat|school of|escuela|department of|departamento de|departement|ministry|ministerio|secretaria|bureau|agency|agencia|administration|commission|comision|council|consejo|comite|committee|municipalite|municipalidad|municipio|alcaldia|gobierno|government|city of|ville de|office of|office|research|laboratory|laboratorio|corporation|foundation|fundacion)\b/;
  function institucionDoc(doc) {
    const v = buscar(doc, CAMPOS.institucion);
    if (v) return v;
    const celdas = doc.lineas.filter(l => l.pagina <= 2).slice(0, 80).flatMap(l => l.celdas.length <= 3 ? l.celdas : l.celdas.filter(c => /^(bureau|department|ministry|ministerio|university|universidad|universite|office|agency|agencia|secretar[ií]a|institut[eo]?)\s+(of|de|du|der|for)\s/i.test(c)))
      .filter(c => RE_INSTITUCION.test(norm(c)) && c.length <= 80 && c.split(/\s+/).length <= 10 && /^\p{Lu}/u.test(c) && !/[,;:]$/.test(c) && !/\d{3,}/.test(c));
    const propio = c => { const w = c.split(/\s+/).filter(x => !/^(of|de|del|la|le|les|du|des|the|and|y|et|und|der|die|für|for|van|von|di|da)$/i.test(x)); return w.filter(x => /^[\p{Lu}\d]/u.test(x)).length >= w.length * 0.6; };
    celdas.splice(0, celdas.length, ...celdas.filter(propio));
    const uni = celdas.find(c => /universi|college|school of|escuela|facultad|faculty/.test(norm(c)));
    return uni || celdas[0] || null;
  }
  const NO_NOMBRE = new Set('report year fiscal date total page table summary section chapter department annual final contents introduction abstract figure notice program plan board meeting agenda university school college city county state national federal public service services company invoice order number name address street road avenue calle carrera rue the of for in on with using a an to by and data analysis results result study guide manual document example version edition general instructions instruction introduction part chapter section appendix net profit revenue income sales growth capital market markets goods overview highlights review working papers paper model models system systems learning deep analysis dataset'.split(' '));
  const limpiarAutores = t => t.replace(/[∗*†‡§¶⋆#$+]|\([^\p{L}\p{N}]*\)|(?<=\p{L})\s?\d{1,2}(?:,\d{1,2})*(?=\s|,|$)/gu, ' ').replace(/\s+,/g, ',').replace(/\s+/g, ' ').replace(/[,\s]+$/, '').trim();
  const pareceNombre = t0 => {
    const t = limpiarAutores(t0);
    const limpio = t.replace(/[,;]|\band\b|\by\b|\bet\b|\bund\b/g, ' ');
    const palabras = limpio.split(/\s+/).filter(Boolean);
    if (palabras.length < 2 || palabras.length > 16 || /\d|:|@/.test(t) || t.length > 140) return false;
    if (palabras.some(p => NO_NOMBRE.has(norm(p)))) return false;
    const mayus = palabras.filter(p => /^\p{Lu}/u.test(p) || /^(de|del|van|von|da|di|le|la)$/i.test(p)).length;
    return mayus === palabras.length && !RE_INSTITUCION.test(norm(t));
  };
  function autorDoc(doc, tipo) {
    const v = buscar(doc, CAMPOS.autor);
    if (v || tipo?.comercial) return v;
    if (doc.meta?.autorMeta) return doc.meta.autorMeta;
    for (const l of doc.lineas.filter(l => l.pagina <= 2).slice(0, 60)) {
      const m = l.texto.match(/^(?:by|por|par|von|door|di|autor(?:es)?|author(?:s)?)\s*:?\s+(.{3,90})$/i);
      if (m && pareceNombre(m[1])) return m[1].trim();
    }
    const t = tituloInfo(doc);
    if (!t) return null;
    const p1 = doc.lineas.filter(l => l.pagina === 1);
    for (const l of p1.slice(t.i + 1, t.i + 8)) {
      if (l.alto >= t.alto * 0.95) continue;
      if (pareceNombre(l.texto)) {
        // Los autores pueden seguir en las líneas siguientes
        let r = l.texto.replace(/\s{2,}/g, ', '), k = p1.indexOf(l);
        while (p1[k + 1] && Math.abs(p1[k + 1].alto - l.alto) < 0.5 && pareceNombre(p1[k + 1].texto.replace(/^(and|y|et|und)\s+/i, 'X Y ')) && r.length < 300) r += ', ' + p1[++k].texto.replace(/\s{2,}/g, ', ');
        return limpiarAutores(r).replace(/,\s*,/g, ',');
      }
      const c = l.celdas.length <= 3 && l.celdas.find(c => pareceNombre(c) && !/[\/]/.test(c));
      if (c) return limpiarAutores(c);
    }
    return null;
  }
  // Emisor: etiqueta explícita, la razón social (S.A.S., Ltd, GmbH, B.V.…) que más se repite,
  // el nombre junto a los datos legales (NIT, SIRET, KvK, "au capital"…) o el nombre de la primera línea
  const RE_SUFIJO = /\b(s\.?\s?a\.?\s?s\.?|s\.a\.|ltda\.?|ltd\.?|limited|inc\.?|llc|l\.l\.c\.|corp\.?|corporation|gmbh|sarl|s\.?r\.?l\.?|s\.l\.|s\.p\.a\.|pvt\.? ltd\.?|private limited|plc|e\.i\.r\.l\.)(?![a-z])/i;
  const RE_SUFIJO_MAY = /\b(SA|AG|KG|BV|NV|AB|OY|SAS|SPA|SARL)\b|\b(B\.V\.|N\.V\.)(?!\w)/;
  const RE_LEGAL = /\b(siret|siren|rcs|kvk|iban|au capital|handelsregister|hrb|amtsgericht|registered office|company (reg|number)|nit|gstin|cin|vat reg|cif|nif|rfc)\b/i;
  function emisorDoc(doc, tipo) {
    if (!tipo.comercial && tipo.id !== 'carta') { const inst = institucionDoc(doc); if (inst || !['plano', 'informe', 'certificado', 'acta', 'contrato', 'laboratorio'].includes(tipo.id)) return inst; }
    const v = buscar(doc, CAMPOS.emisor);
    if (v) return v;
    const palabrasTipo = [...(tipo.titulo || []), 'invoice', 'factura', 'receipt', 'copy', 'copia', 'kopie'];
    const quitarTipo = n => { for (const k of palabrasTipo) n = n.replace(new RegExp('^\\s*' + escRe(k) + '\\b[\\s.:\\-]*', 'i'), '').replace(new RegExp('\\s*' + escRe(k) + '$', 'i'), ''); return n.trim(); };
    const todo = ' ' + doc.lineas.map(l => l.textoN).join(' ') + ' ';
    const cands = [];
    doc.lineas.filter(l => l.pagina <= 2 || l.pagina === doc.lineas.at(-1).pagina).slice(0, 200).forEach((l, i) => l.celdas.forEach(c => {
      const m = c.match(RE_SUFIJO) || c.match(RE_SUFIJO_MAY);
      if (!m) return;
      let nombre = quitarTipo(c.slice(0, m.index + m[0].length).replace(/^.*?:\s*/, '').replace(/^.*\s[-–|·•]\s/, '').replace(/^.*[.!?]\s+(?=\p{Lu})/u, ''));
      if (!/\p{L}{3}/u.test(nombre.replace(m[0], '')) || nombre.length > 70 || /@|www\./.test(nombre)) return;
      const nucleo = norm(nombre).split(' ').slice(0, 2).join(' ');
      cands.push({ nombre: nombre.replace(/[,;]$/, ''), veces: cuenta(todo, nucleo), i });
    }));
    const cliN = norm(clienteDoc(doc)?.v || '');
    if (cliN) cands.splice(0, cands.length, ...cands.filter(c => norm(c.nombre) !== cliN && !cliN.includes(norm(c.nombre)) && !norm(c.nombre).includes(cliN)));
    if (cands.length) { cands.sort((a, b) => b.veces - a.veces || a.i - b.i); return cands[0].nombre; }
    if (!tipo.comercial && tipo.id !== 'carta') return null;
    // Nombre junto a los datos legales: en la misma línea o justo encima
    const junto = {};
    doc.lineas.forEach((l, i) => {
      if (!RE_LEGAL.test(l.textoN)) return;
      for (const o of [doc.lineas[i - 1], doc.lineas[i - 2]]) {
        const c = o && o.celdas.length === 1 && quitarTipo(o.celdas[0]);
        if (c && lineaNombre(o) && c.length <= 40 && !/\d/.test(c) && !/[.!?¡¿]/.test(c) && !/\b(gracias|thank|merci|danke|bedankt)\b/i.test(c) && c.split(/\s+/).length <= 5 && !esEtiqueta(c)) { const veces = cuenta(todo, norm(c)); if (veces >= 2 || c === c.toUpperCase()) junto[c] = (junto[c] || 0) + 1 + veces; }
      }
    });
    const mejorJunto = Object.entries(junto).sort((a, b) => b[1] - a[1])[0];
    if (mejorJunto) return mejorJunto[0];
    if (!tipo.comercial) return institucionDoc(doc);
    for (const l of doc.lineas.slice(0, 6)) {
      // Nombre de empresa: dos palabras o más (o una sola en mayúsculas), sin rótulos como "Fecha", "Hora" o "No responsables de IVA"
      const celda = l.celdas.filter(c => !palabrasTipo.some(k => norm(c).startsWith(k))).map(quitarTipo).find(c => c && !/[|]/.test(c) && lineaNombre({ texto: c, textoN: norm(c) }) && !esEtiqueta(c) &&
        (c.split(/\s+/).length >= 2 || (c === c.toUpperCase() && c.length >= 4)) && !/^(fecha|hora|date|nit|nif|tel|no responsable|responsable|regimen|r[eé]gimen|original|copia|p[aá]gina)/i.test(c));
      if (celda) return celda;
    }
    return null;
  }
  // Cartas y memorandos: firma (después de la despedida), destinatario (saludo o "Para:") y asunto
  const RE_DESPEDIDA = /^(atentamente|cordialmente|saludos|un saludo|best regards|kind regards|regards|sincerely|yours (truly|faithfully|sincerely)|cordialement|bien a vous|mit freundlichen|met vriendelijke|distinti saluti)\b/;
  function firmaCarta(doc) {
    const i = doc.lineas.findIndex(l => RE_DESPEDIDA.test(l.textoN));
    if (i < 0) return null;
    const resto = doc.lineas[i].texto.replace(/^[^,]*,\s*/, '');
    if (resto !== doc.lineas[i].texto && pareceNombre(resto)) return limpiarAutores(resto);
    for (const l of doc.lineas.slice(i + 1, i + 5)) { const t = l.texto.replace(/\s{2,}/g, ' '); if (pareceNombre(t) || /^\p{Lu}\p{Ll}+(\s\p{Lu}\p{Ll}+){0,3}$/u.test(t)) return t; }
    return null;
  }
  function destinatarioCarta(doc) {
    const v = buscar(doc, { tipo: 'texto', syn: ['para', 'to', 'destinatario', 'a', 'an', 'aan', 'dirigido a'] });
    if (v) return v;
    for (const l of doc.lineas.slice(0, 20)) {
      const m = l.texto.match(/^(?:dear|estimad[oa]s?|apreciad[oa]s?|señor(?:es|a)?|madame|monsieur|sehr geehrte[rs]?|beste)\s+(.{2,60}?)[,:]?$/i);
      if (m) return m[1];
      if (/^(to whom it may concern|a quien corresponda|a quien pueda interesar)/i.test(l.texto)) return l.texto.replace(/[,:]$/, '');
    }
    return null;
  }

  // Cliente: etiqueta larga ("Facturar a", "Cliente") o corta ("A:", "Para:", "To:") con el valor al lado o debajo
  function clienteDoc(doc) {
    if (doc._cliente !== undefined) return doc._cliente;
    let r = buscarCon(doc, CAMPOS.cliente);
    if (!r) {
      doc.lineas.slice(0, 60).some((l, pos) => l.cx.some((c, i) => {
        const m = c.txt.match(/^(a|para|to|attn|señores|sres\.?)\s*:\s*(.*)$/i);
        if (!m) return false;
        let v = validar(m[2], 'texto');
        if (!v && l.cx[i + 1]) v = validar(l.cx[i + 1].txt, 'texto');
        const abajo = doc.lineas[pos + 1];
        if (!v && abajo) { const d = abajo.cx.find(o => Math.min(o.fin, c.fin + 40) - Math.max(o.x, c.x) > 2); if (d) v = validar(d.txt, 'texto'); }
        if (v) r = { v, pos };
        return !!v;
      }));
    }
    return doc._cliente = r || null;
  }

  function monedaDoc(doc, rawTotal) {
    const m = rawTotal && monedaDe(rawTotal);
    if (m && m !== '$') return m;
    const lineas = doc.lineas.slice(0, 300).map(l => l.texto);
    // El total dice "$": solo un código explícito (USD, COP, MXN…) precisa cuál
    if (m === '$') {
      for (const t of lineas) { const c = t.match(/\b(USD|COP|MXN|ARS|CLP|CAD|AUD|BRL)\b/); if (c) return c[1]; }
      return '$';
    }
    // Sin moneda en el total: la más frecuente, contando solo símbolos o códigos pegados a un número
    const conteo = {};
    for (const t of lineas) for (const x of t.matchAll(new RegExp('(?:' + RE_MONEDA.source + ')\\s?-?\\d|\\d\\s?(?:' + RE_MONEDA.source + ')', 'g'))) { const k = monedaDe(x[0]); if (k) conteo[k] = (conteo[k] || 0) + 1; }
    const orden = Object.entries(conteo).sort((a, b) => b[1] - a[1]);
    return orden[0]?.[0] || lineas.map(t => t.match(/\b(EUR|USD|COP|INR|GBP|MXN|ARS|CLP)\b/)?.[1]).find(Boolean) || null;
  }

  const SECCIONES = ['resumen ejecutivo', 'executive summary', 'resumen', 'abstract', 'summary', 'resumo', 'resume', 'zusammenfassung', 'kurzfassung', 'samenvatting', 'sommario', 'riassunto', 'sintesis', 'conclusiones', 'conclusions', 'conclusion', 'highlights', 'objeto', 'objetivo', 'purpose', 'introduccion', 'introduction', 'einleitung', 'inleiding', 'introduzione', 'introducao', 'preface', 'prefacio', 'vorwort', 'prologo', 'avant-propos'];
  function resumenLibre(doc) {
    let i = -1, sec = '';
    const cand = doc.lineas.filter(l => l.pagina <= 15);
    for (const s of SECCIONES) {
      const re = new RegExp('^(\\d+(\\.\\d+)*\\.?\\s*)?' + escRe(s) + '\\b');
      i = cand.findIndex(l => re.test(l.textoN) && l.texto.length < 200 && !/\.{3,}|\s(\d+|[ivxlc]+)$/i.test(l.texto));
      if (i >= 0) { sec = s; break; }
    }
    let texto = '';
    if (i >= 0) {
      const primera = cand[i].texto.slice((norm(cand[i].texto).match(new RegExp('^(\\d+(\\.\\d+)*\\.?\\s*)?' + escRe(sec) + '[a-z]*\\s*[:.\\-—]?\\s*'))?.[0].length) || 0);
      const cuerpoAlto = cand[i + 1]?.alto || cand[i].alto;
      const sig = [];
      for (const l of cand.slice(i + 1, i + 16)) {
        if (sig.length && (l.alto > cuerpoAlto * 1.15 || /^(table of contents|contents|indice|inhaltsverzeichnis|sommaire|chapter|cap[ií]tulo|kapitel|keywords|palabras clave)\b/i.test(norm(l.texto)))) break;
        if (!/^\s*\d+\s*$/.test(l.texto)) sig.push(l.texto);
      }
      texto = [primera, ...sig].join(' ');
    } else {
      let k = doc.lineas.findIndex(l => sinRenglon(l).length >= 60 && /\p{Ll}{3}/u.test(l.texto) && !/(\.{3,}|…)\s*\d/.test(l.texto));
      if (k < 0) k = 0;
      texto = doc.lineas.slice(k, k + 10).map(sinRenglon).join(' ');
    }
    texto = texto.replace(/-\s+(\p{Ll})/gu, '$1').replace(/\s*\.{2,}/g, '…').replace(/\s+/g, ' ').trim();
    const frases = texto.match(/[^.!?…]{20,}?[.!?…](\s|$)/g) || [texto.slice(0, 300)];
    let r = '';
    for (const f of frases) { if ((r + f).length > 380) break; r += f; }
    return (r || frases[0].slice(0, 380)).trim();
  }
  function resumenDoc(doc, tipo, d) {
    const f = d.fecha ? ` del ${d.fecha}` : '';
    const items = doc.tablas.reduce((n, t) => n + t.filas.length, 0);
    if (COMERCIALES.has(tipo.id)) {
      const partes = [`${tipo.nombre}${d.numero ? ' ' + d.numero : ''}${f}`];
      if (d.emisor) partes.push(`de ${d.emisor}`);
      if (d.cliente) partes.push(`para ${d.cliente}`);
      if (typeof d.total === 'number') partes.push(`por ${fmtMonto(d.total, d.moneda)}`);
      return partes.join(' ') + (d.concepto ? `: ${d.concepto}.` : items ? `; ${items} ítem${items === 1 ? '' : 's'}.` : '.');
    }
    if (tipo.id === 'plano') {
      const r = rotuloDoc(doc) || {};
      const partes = [`Plano${r.plano ? ' ' + r.plano : ''}${d.titulo ? ` «${d.titulo}»` : ''}${r.proyecto ? ' del proyecto ' + r.proyecto : ''}`];
      if (r.escala) partes.push(`escala ${r.escala}`);
      if (d.fecha) partes.push(`fecha ${d.fecha}`);
      if (r.revision) partes.push(`revisión ${r.revision}`);
      const firmas = [r.diseno && `diseñó ${r.diseno}`, r.dibujo && `dibujó ${r.dibujo}`, r.reviso && `revisó ${r.reviso}`, r.aprobo && `aprobó ${r.aprobo}`].filter(Boolean);
      return partes.join(', ') + (firmas.length ? '; ' + firmas.join(', ') : '') + '.' + (r.observaciones && r.observaciones !== 'Sin observaciones' ? ` Observaciones: ${r.observaciones}` : '');
    }
    if (tipo.id === 'datos') {
      const t = doc.tablas.slice().sort((a, b) => b.filas.length - a.filas.length)[0];
      const cols = t ? t.columnas.filter(c => !/^Columna/.test(c)).slice(0, 6) : [];
      return `${d.titulo ? d.titulo + '. ' : ''}Tabla de datos con ${items} fila${items === 1 ? '' : 's'}${cols.length ? '; columnas: ' + cols.join(', ') : ''}.`;
    }
    const cuerpo = resumenLibre(doc);
    return [d.titulo && !norm(cuerpo).startsWith(norm(d.titulo)) ? d.titulo + '.' : '', cuerpo].filter(Boolean).join(' ');
  }

  // ---------- ¿De qué es? Ítems, concepto y categoría de gasto ----------
  const RE_COL_DESC = /(descrip|detalle|concepto|articulo|producto|item|servicio|omschrijving|designation|beschreibung|description|artikel|particular|product)/;
  const RE_NO_ITEM = /^(sub ?total|total|iva|base|impuesto|retencion|irpf|descuento|saldo|tarifa|valor|cantidad items|precio unitario|taxes?|vat|tva|btw|mwst)\b/;
  // Celdas de encabezado o de condiciones que se cuelan en la columna de descripción
  const noEsItem = t => { const n = norm(t); if (/@|https?:|www\.|:\s*$|[,;]$|--|\b\d{4} ?[A-Z]{2}\b/.test(t) || /^[A-Z0-9\-_/]{8,}$/.test(t.trim()) || /\b(invoice date|due date|kvk|iban|bic|swift|aufsichtsrat|vorstand|vorsitz|geschaftsfuhrer|t\.?a\.?v|payment|paid|betaald|ideal|nequi|daviplata|autorizacion|resolucion|order (no|number|date)|tax \d)/.test(n)) return true; return /\b(vencimiento|condiciones de pago|forma de pago|medio de pago|id\.? del cliente|de factura|n\.? ?o? ?º|fecha|nit|cliente|telefono|direccion|email|correo)\b/.test(n) && (/:/.test(t) || t === t.toUpperCase() || n.split(' ').length <= 4); };
  function itemsDoc(doc) {
    if (doc._items) return doc._items;
    const items = [];
    const limpiar = t => String(t).replace(/^\s*(\d+([.,]\d+)?\s*(x|und|un|uds?)?\s+)?(\[?[A-Z]{0,4}[-_]?\d{2,}[\w-]*\]?\s*[-–:]?\s*)?/i, '').replace(/\s*\((x\d+|\d+([.,]\d+)?\s*x\s*[^)]*)\)$/i, '').replace(/\s+/g, ' ').trim();
    for (let t of doc.tablas) {
      // encabezado metido dentro de las filas ("Artikel Omschrijving | … | Bedrag")
      if (!t.columnas.some(c => RE_COL_DESC.test(norm(c)))) {
        const h = t.filas.findIndex(f => f.some(c => RE_COL_DESC.test(norm(c || ''))) && !f.some(c => /\d/.test(c || '')));
        if (h >= 0 && h < t.filas.length - 1) t = { columnas: t.filas[h].map(c => c || ''), filas: t.filas.slice(h + 1) };
      }
      const cols = t.columnas.map(norm);
      let di = cols.findIndex(c => RE_COL_DESC.test(c));
      const porEncabezado = di >= 0;
      if (di < 0) {
        // la columna con más letras
        let mejor = -1;
        t.columnas.forEach((_, j) => { const letras = t.filas.reduce((s, f) => s + (String(f[j] || '').match(/\p{L}/gu) || []).length, 0) / Math.max(1, t.filas.length); if (letras > mejor) { mejor = letras; di = j; } });
        if (mejor < 6) continue;
      }
      let mi = -1;
      for (let j = t.columnas.length - 1; j >= 0; j--) if (j !== di && t.filas.filter(f => typeof dineroDe(f[j] || '') === 'number').length >= t.filas.length * 0.6) { mi = j; break; }
      for (const f of t.filas) {
        const desc = limpiar(f[di] || '');
        if ((desc.match(/\p{L}/gu) || []).length < 3 || RE_NO_ITEM.test(norm(desc)) || esEtiqueta(desc) || noEsItem(desc)) continue;
        const monto = mi >= 0 ? dineroDe(f[mi] || '') : null;
        if ((!porEncabezado || mi >= 0) && typeof monto !== 'number') continue;
        items.push({ desc, monto });
      }
    }
    // Sin tablas (tiquetes POS, OCR): líneas entre el encabezado de ítems y el subtotal/total
    if (!items.length) {
      const i0 = doc.lineas.findIndex(l => /\b(cant|cantidad|qty)\b/.test(l.textoN) && /\b(detalle|descrip|articulo|producto|item|concepto)/.test(l.textoN));
      if (i0 >= 0) for (const l of doc.lineas.slice(i0 + 1, i0 + 30)) {
        if (RE_NO_ITEM.test(l.textoN) || /^(cantidad items|total items|precio unitario)/.test(l.textoN)) { if (/total/.test(l.textoN)) break; continue; }
        const celda = l.celdas.slice().sort((a, b) => (b.match(/\p{L}/gu) || []).length - (a.match(/\p{L}/gu) || []).length)[0] || '';
        const desc = limpiar(celda.replace(/\s+[\d.,$€]+(\s+[\d.,$€]+)*$/, ''));
        if ((desc.match(/\p{L}/gu) || []).length >= 4 && !esEtiqueta(desc) && !noEsItem(desc)) items.push({ desc, monto: dineroDe(l.celdas.at(-1)) });
      }
    }
    return doc._items = items;
  }
  function conceptoDoc(doc) {
    const v = buscar(doc, CAMPOS.concepto);
    if (v) return v;
    const items = itemsDoc(doc);
    if (!items.length) return null;
    const unicos = [];
    for (const it of items) if (!unicos.some(u => norm(u.desc) === norm(it.desc))) unicos.push(it);
    const orden = unicos.some(u => typeof u.monto === 'number') ? unicos.slice().sort((a, b) => (b.monto || 0) - (a.monto || 0)) : unicos;
    const top = orden.slice(0, 3).map(u => u.desc.length > 60 ? u.desc.slice(0, 57) + '…' : u.desc);
    return top.join('; ') + (unicos.length > 3 ? ` (y ${unicos.length - 3} más)` : '');
  }
  // Categorías de gasto: palabras (sin tildes) que las delatan
  const CATEGORIAS = [
    ['Salud e insumos médicos', 'guante tapaboca jeringa medic clinic hospital odontolog dental corona radiograf farmac laboratorio vacuna veterinar esteriliz desparasit gasa lidocaina antiseptic zirconio paciente ips eps quirurg biomedic'],
    ['Ferretería y construcción', 'pintura rodillo brocha cemento ladrillo tuberia conduit cable breaker tablero electric lija cinta herramienta tornillo fachada bajante reforma obra construc ferreter concreto varilla plomeria'],
    ['Tecnología y software', 'software saas apple ipad iphone macbook mouse teclado impresora nintendo samsung celular smartphone notebook electronica licencia computador laptop portatil monitor tablet nube cloud hosting servidor aws amazon web dominio internet fibra telecom microsd sandisk memoria plan datos glacier compute elastic informatica'],
    ['Transporte y logística', 'flete transporte envio cargue descargue mensajeria despacho shipping delivery courier encomienda'],
    ['Servicios profesionales', 'asesor consultor estudio de impacto auditor contab declaracion honorario diseno identidad corporativa legal abogad monitoreo capacitacion formacion curso'],
    ['Mantenimiento y reparación', 'mantenimiento reparacion revision mano de obra taller freno repuesto onderhoud'],
    ['Alimentos y bebidas', 'agua pool cafe alimento comida restaurante bebida food snack almuerzo'],
    ['Papelería e impresión', 'folleto cartel tarjeton impresion papel cuaderno imprenta papeleria toner'],
    ['Hospedaje y viajes', 'hotel hospedaje habitacion check in oyo tiquete vuelo booking alojamiento'],
    ['Ropa y calzado', 'remera camisa vestido pantalon zapato calzado talle uniforme'],
    ['Publicidad y medios', 'anuncio publicidad annonce justificatif marketing pauta'],
    ['Muebles y oficina', 'office chair silla escritorio mueble furniture archivador'],
    ['Servicios públicos y telecomunicaciones', 'energia electricidad acueducto alcantarillado gas natural telefonia celular abonne abonnement freebox'],
  ].map(([n, pal]) => [n, pal.split(' ').filter(Boolean)]);
  function categoriaDoc(doc, datos) {
    const texto = ' ' + norm([...itemsDoc(doc).map(i => i.desc), datos.concepto ?? datos._concepto ?? '', datos.emisor ?? datos._emisor ?? ''].join(' ')) + ' ';
    let mejor = null, max = 0;
    for (const [n, pal] of CATEGORIAS) {
      const p = pal.reduce((s, k) => s + (texto.includes(' ' + k) ? 1 : 0), 0);
      if (p > max) { max = p; mejor = n; }
    }
    if (mejor) return mejor;
    // sin pistas en los ítems: la primera página, exigiendo dos palabras de la misma categoría
    const pag = ' ' + norm(doc.lineas.filter(l => l.pagina === 1).slice(0, 80).map(l => l.texto).join(' ')) + ' ';
    for (const [n, pal] of CATEGORIAS) {
      const p = pal.reduce((s, k) => s + (pag.includes(' ' + k) ? 1 : 0), 0);
      if (p >= 2 && p > max) { max = p; mejor = n; }
    }
    return mejor || 'Otros';
  }

  // ---------- Temas principales (tesis, artículos, informes…) ----------
  const VACIAS = new Set(('de la que el en y a los del se las por un para con no una su al lo como mas pero sus le ya o este si porque esta entre cuando muy sin sobre tambien me hasta hay donde quien desde todo nos durante todos uno les ni contra otros ese eso ante ellos e esto mi antes algunos que unos yo otro otras otra el tanto esa estos mucho quienes nada muchos cual poco ella estar estas algunas algo nosotros cada puede pueden ser son fue han sido tiene tienen hace hacer asi segun dos tres parte forma caso tipo manera vez veces bien sobre cuales mediante traves ademas debe deben cual donde siendo sera seran estos estas cuyo cuya '
    + 'the of and to in a is that for it as was with be by on not he this are or his from at which but have an they you were her she there been one all we their its has had more when will would who so can no if out so said what up about into than them could only other time some these two may then do first any my now such like our over also new most just made after even many must before through back years where much your well should very because does each how those both being same under while last might great since against right three still own however another between few without here well used using use based show shows shown within upon thus therefore although among whether either figure table section chapter page pages et al ie eg '
    + 'le les des et est une du pour dans au sur aux par ce qui ne pas plus sont ou avec cette ces son sa ses leur leurs elle il ils nous vous mais comme tout tous etre fait faire '
    + 'der die und das ist mit von den fur nicht ein eine wird dem im auf zu sich auch als wie bei oder aus nach werden sind wenn noch nur kann dass einer eines einem diese dieser '
    + 'het een van voor met niet op zijn wij uw bij naar ook deze te '
    + 'os do da dos das em nao ao pelo pela sao um uma na no com para '
    + 'il di che della per non sono gli nel alla dei delle '
    + 'lorem ipsum dolor sit amet consectetur adipiscing elit sed eiusmod tempor incididunt labore dolore magna aliqua enim minim veniam quis nostrud exercitation ullamco laboris nisi aliquip commodo consequat duis aute irure reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat proident sunt culpa officia deserunt mollit anim laborum '
    + 'please came away little form line attach exit report page aqui '
    + 'information informacion summary abstract introduction introduccion conclusion conclusiones resumen results resultados second third fourth following example examples number include includes including provide provided public general attendu considerant abbildung bemerkung definition satz beweis lemma beispiel heisst dann gilt also sowie gibt jede jeder alle wurde wurden haben durch uber unter zwischen dont aussi ainsi ete avoir peut selon '
    + 'tabla figura capitulo pagina seccion ejemplo anexo usted ustedes tabla cuadro grafico numero total valor fecha anos ano mismo misma cada gran mayor menor nuevo nueva primer primera segundo segunda http https www com org pdf').split(' '));
  function temasDoc(doc, n = 5) {
    const clave = buscar(doc, CAMPOS.palabrasclave);
    if (clave) return clave.split(/[,;·•|]|\s{2,}/).map(t => t.trim().replace(/\.$/, '')).filter(t => t.length > 2).slice(0, n).join(', ');
    const frec = {}, forma = {}, bi = {};
    let total = 0;
    for (const l of doc.lineas.filter(l => l.pagina <= 60).slice(0, 6000)) {
      const palabras = l.texto.split(/[^\p{L}\-']+/u).filter(Boolean);
      let prev = null;
      for (const w of palabras) {
        const k = norm(w).replace(/^-+|-+$/g, '');
        if (k.length < 4 || VACIAS.has(k) || /\d/.test(k)) { prev = null; continue; }
        frec[k] = (frec[k] || 0) + 1; total++;
        (forma[k] ??= {})[w] = (forma[k][w] || 0) + 1;
        if (prev) bi[prev + ' ' + k] = (bi[prev + ' ' + k] || 0) + 1;
        prev = k;
      }
    }
    if (total < 30) return null;
    const bonito = k => { const f = Object.entries(forma[k] || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || k; return f === f.toUpperCase() && f.length > 4 ? f[0] + f.slice(1).toLowerCase() : f; };
    const cand = [];
    for (const [k, c] of Object.entries(bi)) if (c >= 3) cand.push([k, c * 2.2]);
    for (const [k, c] of Object.entries(frec)) if (c >= 3) cand.push([k, c * (k.length >= 7 ? 1.15 : 1)]);
    cand.sort((a, b) => b[1] - a[1]);
    const elegidos = [];
    for (const [k] of cand) {
      if (elegidos.some(e => e.includes(k) || k.includes(e))) continue;
      elegidos.push(k);
      if (elegidos.length >= n) break;
    }
    return elegidos.map(k => k.split(' ').map(bonito).join(' ')).join(', ') || null;
  }

  function extraerCampo(doc, clave, tipo, datos, meta) {
    if (doc.xml && clave in doc.xml.valores) return doc.xml.valores[clave];
    if (tipo.id === 'plano' && (clave === 'proyecto' || clave === 'cliente' || clave === 'fecha') && rotuloDoc(doc)?.[clave]) return clave === 'fecha' ? (fechaDe(rotuloDoc(doc).fecha) || rotuloDoc(doc).fecha) : rotuloDoc(doc)[clave];
    switch (clave) {
      case 'plano': case 'escala': case 'numproyecto': case 'revision': case 'dibujo': case 'diseno': case 'reviso': case 'aprobo': case 'observaciones': {
        const r = tipo.id === 'plano' ? rotuloDoc(doc) : null;
        if (r?.[clave]) return r[clave];
        if (clave === 'plano') return tipo.id === 'plano' ? (norm(meta.archivo || '').match(/^[a-z]{1,6}[\-_ ]?\d{1,4}/)?.[0].toUpperCase() ?? null) : null;
        if (clave === 'escala') { const l = doc.lineas.find(l => RE_ESCALA.test(l.texto) && /escala|scale/.test(l.textoN)); return l ? l.texto.match(RE_ESCALA)[0] : null; }
        return CAMPOS[clave].syn.length ? buscar(doc, CAMPOS[clave]) : null;
      }
      case 'cufe': {
        // 96 caracteres hexadecimales, a veces partidos en varias líneas
        const i = doc.lineas.findIndex(l => /\b(cufe|cude)\b/.test(l.textoN));
        if (i < 0) return null;
        const hex = doc.lineas.slice(i, i + 4).map(l => l.texto.replace(/^.*?\b(CUFE|CUDE)\b\s*:?/i, '')).join('').replace(/\s+/g, '').match(/[0-9a-f]{96}/i);
        return hex ? hex[0].toLowerCase() : null;
      }
      case 'concepto': return COMERCIALES.has(tipo.id) ? conceptoDoc(doc) : null;
      case 'categoria': return COMERCIALES.has(tipo.id) ? categoriaDoc(doc, datos) : null;
      case 'temas': return COMERCIALES.has(tipo.id) ? null : temasDoc(doc);
      case 'numero': return numeroDoc(doc, tipo);
      case 'cliente': return tipo.id === 'carta' ? destinatarioCarta(doc) : clienteDoc(doc)?.v ?? null;
      case 'titulo': if (tipo.id === 'plano' && rotuloDoc(doc)?.titulo) return rotuloDoc(doc).titulo;
        return (v => v && v.split(/\s+/).length >= 2 ? v : null)(buscar(doc, CAMPOS.titulo)) || (tipo.id === 'carta' ? buscar(doc, { tipo: 'texto', syn: ['asunto', 'subject', 're', 'ref', 'referencia', 'objet', 'betreff', 'onderwerp'] }) : null) || (!tipo.comercial && meta.tituloMeta) || tituloInfo(doc)?.texto || meta.tituloMeta || null;
      case 'emisor': return tipo.id === 'carta' ? (firmaCarta(doc) || buscar(doc, CAMPOS.emisor)) : emisorDoc(doc, tipo);
      case 'proveedor': return buscar(doc, CAMPOS.proveedor) || emisorDoc(doc, tipo);
      case 'autor': return autorDoc(doc, tipo);
      case 'institucion': return institucionDoc(doc);
      case 'idioma': return meta.idioma || null;
      case 'paginas': return meta.paginas;
      case 'fecha': {
        const v = buscar(doc, CAMPOS.fecha);
        if (v) return v;
        const sinExcluir = l => !CAMPOS.fecha.excluir.some(x => l.textoN.includes(x));
        for (const l of doc.lineas.filter(l => l.pagina === 1 && sinExcluir(l))) { const f = fechaDe(l.texto); if (f) return f; }
        for (const l of doc.lineas.filter(l => l.pagina <= 2)) { const f = fechaDe(l.texto, false, true); if (f) return f; }
        if (!tipo.comercial && meta.fechaMeta) return meta.fechaMeta;
        for (const l of doc.lineas.slice(0, 400).filter(sinExcluir)) { const f = fechaDe(l.texto); if (f) return f; }
        return meta.fechaMeta || null;
      }
      case 'nit': {
        const cli = clienteDoc(doc);
        const fueraCliente = cli ? pos => pos < cli.pos || pos > cli.pos + 5 : null;
        const v = buscarCon(doc, CAMPOS.nit, fueraCliente)?.v ?? (fueraCliente ? null : buscar(doc, CAMPOS.nit));
        if (v) return v;
        for (const l of doc.lineas.filter((l, pos) => !fueraCliente || fueraCliente(pos))) { const m = l.texto.match(/\b(?:NIT|NIF|CIF|RUT|RFC|GSTIN|VAT|BTW|TVA|USt-IdNr\.?)\b\.?\s*(?:no\.?|nr\.?|number)?\s*[:.]?\s*([A-Z]{0,4}\d[\dA-Z.\-\s]{4,18}[\dA-Z])/i); if (m && validar(m[1], 'nit')) return validar(m[1], 'nit'); }
        return null;
      }
      case 'total': {
        const r = buscarCon(doc, CAMPOS.total);
        datos._rawTotal = r?.raw;
        return r?.v ?? null;
      }
      case 'moneda': {
        if (!tipo.comercial && tipo.id !== 'contrato') return null;
        if (!('_rawTotal' in datos)) extraerCampo(doc, 'total', tipo, datos, meta);
        return buscar(doc, CAMPOS.moneda) && monedaDe(buscar(doc, CAMPOS.moneda)) || monedaDoc(doc, datos._rawTotal) || (typeof datos.total === 'number' || typeof datos._total === 'number' ? '(sin moneda)' : null);
      }
      case 'resumen': return resumenDoc(doc, tipo, datos);
      case 'cantidaditems': return doc.tablas.reduce((n, t) => n + t.filas.length, 0);
      default: return CAMPOS[clave] ? buscar(doc, CAMPOS[clave]) : null;
    }
  }
  // Campo que la persona escribió y no está en el diccionario: se busca por su propia etiqueta
  function campoLibre(texto) {
    const n = norm(texto);
    return { etiqueta: texto.trim().replace(/^./, c => c.toUpperCase()), tipo: /valor|total|precio|monto|costo|saldo|pago|iva|impuesto|price|cost|amount/.test(n) ? 'dinero' : /fecha|date/.test(n) ? 'fecha' : 'texto', syn: [n] };
  }
  function interpretarPedido(txt) {
    // Preguntas en lenguaje natural sobre el contenido se convierten en columnas
    const extra = [];
    txt = txt.split(/[\n;,]|(?<=\?)/).map(p => {
      const n = norm(p).replace(/[¿?¡!]/g, '').trim();
      if (!/\?|^(de )?que |^cual|^sobre que|^de que/.test(norm(p).replace(/^¿/, '')) && !/^(de|sobre) que/.test(n) && !/^(el |los |la |las )?temas? (de|del)\b/.test(n)) return p;
      if (/(de|sobre) que (son|es|era|eran|fueron|se trata|trata|tratan)|que (se )?(compr|vend|pag|factur)|que productos|que servicios|en que (se )?gast|concepto/.test(n)) {
        if (/tesis|articulo|informe|libro|documento|trabajo|trata/.test(n) && !/factura|compra|gasto|recibo|cotizacion/.test(n)) extra.push('temas');
        else extra.push('concepto', 'categoria');
        if ((/documento/.test(n) || !/tesis|articulo|informe|libro|trabajo/.test(n)) && !/factura|compra|gasto|recibo|cotizacion/.test(n)) extra.push('concepto', 'categoria');
        return '';
      }
      if (/tema|trata|asunto|sobre que/.test(n)) { extra.push('temas'); if (/documento|archivo/.test(n)) extra.push('concepto', 'categoria'); return ''; }
      return p;
    }).join(',');
    txt = [txt, ...new Set(extra)].filter(Boolean).join(',');
    const partes = txt.split(/[,;\n]|\s+y\s+|\s+and\s+/).map(s => s.trim()).filter(Boolean);
    const campos = [], vistos = new Set();
    for (const p of partes) {
      const n = norm(p).replace(/^(el|la|los|las|su|sus|the)\s+/, '').replace(/[.:]$/, '');
      if (n in ALIAS && ALIAS[n] === null) continue;
      const clave = ALIAS[n] ?? ALIAS[n.replace(/s$/, '')] ?? ALIAS[n.replace(/es$/, '')] ?? null;
      const id = clave || 'libre:' + n;
      if (vistos.has(id)) continue;
      vistos.add(id);
      const libre = clave ? null : campoLibre(p);
      campos.push(clave ? { clave, etiqueta: CAMPOS[clave].etiqueta, tipo: CAMPOS[clave].tipo } : { clave: id, libre, etiqueta: libre.etiqueta, tipo: libre.tipo });
    }
    return campos;
  }

  // =====================================================================
  // Proceso de todos los archivos
  // =====================================================================
  const RE_HOJA = /\.(xlsx|xlsm|xls|ods|csv)$/i;
  const RE_IMAGEN = /\.(png|jpe?g|webp|bmp|gif)$/i;
  const RE_WORD = /\.docx$/i;
  const RE_XML = /\.xml$/i, RE_ZIP = /\.zip$/i;
  const RE_NO_SOPORTADO = /\.(doc|tiff?|heic|heif|odt|rtf|pptx?)$/i;

  // Imágenes (fotos o capturas de facturas): se amplían, se pasan a grises y se leen con OCR
  async function leerImagen(a) {
    let img;
    try { img = await createImageBitmap(a.file); } catch { throw { msg: 'No se pudo abrir la imagen' }; }
    const lado = Math.max(img.width, img.height);
    const escala = Math.min(Math.max(1, Math.min(4, (EQUIPO_LIVIANO ? 1500 : 1800) / img.width)), (EQUIPO_LIVIANO ? 2600 : 3600) / lado);
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * escala); c.height = Math.round(img.height * escala);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.filter = 'grayscale(1) contrast(1.25)';
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, c.width, c.height);
    img.close?.();
    const t0 = performance.now();
    const { data } = await (await obtenerOcr()).recognize(c);
    tiemposOcr.push(performance.now() - t0);
    c.width = c.height = 0;
    const piezas = (data.words || []).filter(p => p.text.trim() && p.confidence > 30).map(p => ({
      x: p.bbox.x0 / escala, fin: p.bbox.x1 / escala, y: p.bbox.y1 / escala, alto: Math.max(4, (p.bbox.y1 - p.bbox.y0) / escala), txt: p.text
    }));
    return { paginas: [porColumnas(armarLineas(piezas))], numPaginas: 1, leidas: 1, conOcr: 1, sinLeer: 0, camposFormulario: 0, horizontales: img.width > img.height * 1.1 ? 1 : 0, info: {} };
  }

  // ZIP (como llegan las facturas electrónicas al correo): se abre y se toman sus archivos.
  // Si un PDF viene con su XML, se usa el XML (datos exactos) y el PDF se omite.
  let fflateListo = null;
  const cargarFflate = () => fflateListo ??= new Promise((ok, mal) => { const sc = document.createElement('script'); sc.src = base + 'fflate.min.js'; sc.onload = ok; sc.onerror = () => mal({ msg: 'No se pudo cargar el lector de ZIP' }); document.head.append(sc); });
  async function expandirZip(f, nivel = 0) {
    await cargarFflate();
    const ent = fflate.unzipSync(new Uint8Array(await f.arrayBuffer()));
    const nombres = Object.keys(ent).filter(n => !/\/$/.test(n) && !/(^|\/)(__MACOSX|\.)/.test(n));
    const baseN = n => n.split('/').pop().replace(/\.[^.]+$/, '').toLowerCase();
    const xmls = nombres.filter(n => RE_XML.test(n));
    const pdfs = nombres.filter(n => /\.pdf$/i.test(n));
    const conXml = n => xmls.some(x => baseN(x) === baseN(n)) || (xmls.length === 1 && pdfs.length === 1);
    const files = []; let pdfOmitidos = 0;
    for (const n of nombres) {
      const corto = n.split('/').pop();
      if (/\.pdf$/i.test(n) && conXml(n)) { pdfOmitidos++; continue; }
      if (RE_ZIP.test(n) && nivel < 2) { const r = await expandirZip(new File([ent[n]], corto), nivel + 1); files.push(...r.files); pdfOmitidos += r.pdfOmitidos; continue; }
      files.push(new File([ent[n]], corto));
    }
    return { files, pdfOmitidos };
  }

  // Facturas electrónicas DIAN (UBL 2.1): AttachedDocument con la factura adentro, o Invoice/CreditNote/DebitNote sueltos
  const hijosX = (el, n) => el ? [...el.children].filter(c => c.localName === n) : [];
  const nodoX = (el, ruta) => { for (const n of ruta.split('/')) { el = hijosX(el, n)[0]; if (!el) return null; } return el; };
  const txtX = (el, ruta) => nodoX(el, ruta)?.textContent.trim() || '';
  const numX = (el, ruta) => { const t = txtX(el, ruta); return t === '' || isNaN(+t) ? null : +t; };
  const RE_UBL = /<(\w+:)?(Invoice|CreditNote|DebitNote)[\s>]/;
  function raizUbl(texto, nivel = 0) {
    const x = new DOMParser().parseFromString(texto.replace(/^\uFEFF/, '').trim(), 'application/xml');
    if (x.getElementsByTagName('parsererror').length) return null;
    const r = x.documentElement;
    if (r.localName === 'AttachedDocument' && nivel < 2) {
      const desc = txtX(r, 'Attachment/ExternalReference/Description');
      const interno = RE_UBL.test(desc) ? desc : [...r.getElementsByTagNameNS('*', 'Description')].map(e => e.textContent).find(t => RE_UBL.test(t));
      return interno ? raizUbl(interno, nivel + 1) : r;
    }
    return r;
  }
  const IMP_DIAN = { '01': 'IVA', '02': 'IC', '03': 'ICA', '04': 'INC', '05': 'ReteIVA', '06': 'ReteFuente', '07': 'ReteICA', '08': 'IC porcentual', '20': 'FtoHorticultura', '21': 'Timbre', '22': 'INC bolsas', '23': 'INCarbono', '24': 'INCombustibles', '25': 'Sobretasa combustibles', '26': 'Sordicom', 'ZZ': 'Otro', 'ZA': 'IVA e INC' };
  const RETENCIONES = new Set(['ReteIVA', 'ReteFuente', 'ReteICA']);
  function impuestosX(el) {
    const out = [];
    for (const tag of ['TaxTotal', 'WithholdingTaxTotal']) for (const tt of hijosX(el, tag)) {
      const subs = hijosX(tt, 'TaxSubtotal');
      const nombre = s => { const c = txtX(s, 'TaxCategory/TaxScheme/ID'); let n = IMP_DIAN[c] || txtX(s, 'TaxCategory/TaxScheme/Name') || (tag === 'WithholdingTaxTotal' ? 'Retención' : 'Impuesto'); if (/^rete ?renta|^retefuente|^retencion en la fuente/i.test(norm(n))) n = 'ReteFuente'; return n; };
      if (!subs.length) { out.push({ nombre: tag === 'WithholdingTaxTotal' ? 'Retención' : 'Impuesto', base: null, pct: null, valor: numX(tt, 'TaxAmount') ?? 0, ret: tag === 'WithholdingTaxTotal' }); continue; }
      for (const s of subs) { const n = nombre(s); out.push({ nombre: n, base: numX(s, 'TaxableAmount'), pct: numX(s, 'TaxCategory/Percent') ?? numX(s, 'Percent'), valor: numX(s, 'TaxAmount') ?? 0, ret: tag === 'WithholdingTaxTotal' || RETENCIONES.has(n) }); }
    }
    return out;
  }
  function parteX(el) {
    const party = nodoX(el, 'Party');
    if (!party) return {};
    const nombre = txtX(party, 'PartyTaxScheme/RegistrationName') || txtX(party, 'PartyLegalEntity/RegistrationName') || txtX(party, 'PartyName/Name') || [txtX(party, 'Person/FirstName'), txtX(party, 'Person/MiddleName'), txtX(party, 'Person/FamilyName')].filter(Boolean).join(' ');
    const idEl = nodoX(party, 'PartyTaxScheme/CompanyID') || nodoX(party, 'PartyLegalEntity/CompanyID') || nodoX(party, 'PartyIdentification/ID');
    const id = idEl?.textContent.trim() || '', dv = idEl?.getAttribute('schemeID') || '';
    return { nombre, nit: id && (idEl.getAttribute('schemeName') === '31' && /^\d$/.test(dv) ? `${id}-${dv}` : id), ciudad: txtX(party, 'PhysicalLocation/Address/CityName') };
  }
  const TIPO_FACTURA = { '01': 'Factura electrónica de venta', '02': 'Factura de exportación', '03': 'Factura de contingencia', '04': 'Factura de contingencia DIAN', '05': 'Documento soporte' };
  const FORMA_PAGO = { '1': 'Contado', '2': 'Crédito' };
  const MEDIO_PAGO = { '1': 'No definido', '10': 'Efectivo', '20': 'Cheque', '42': 'Consignación', '47': 'Transferencia', '48': 'Tarjeta crédito', '49': 'Tarjeta débito', 'ZZZ': 'Otro' };
  async function leerXml(a) {
    const r = raizUbl(await a.file.text());
    if (!r) throw { msg: 'XML dañado o incompleto' };
    const tipo = r.localName;
    if (tipo === 'ApplicationResponse') throw { omitir: 'Respuesta de validación de la DIAN (no es una factura)' };
    if (/^Nomina/.test(tipo)) throw { msg: 'Nómina electrónica: todavía no se admite' };
    if (!['Invoice', 'CreditNote', 'DebitNote'].includes(tipo)) throw { msg: tipo === 'AttachedDocument' ? 'El contenedor no trae la factura adentro' : 'XML que no es una factura electrónica' };
    const em = parteX(nodoX(r, 'AccountingSupplierParty')), cl = parteX(nodoX(r, 'AccountingCustomerParty'));
    const mt = nodoX(r, 'LegalMonetaryTotal') || nodoX(r, 'RequestedMonetaryTotal');
    const imps = impuestosX(r);
    const suma = f => { const xs = imps.filter(f); return xs.length ? Math.round(xs.reduce((t, x) => t + x.valor, 0) * 100) / 100 : 0; };
    const lineaTag = { Invoice: 'InvoiceLine', CreditNote: 'CreditNoteLine', DebitNote: 'DebitNoteLine' }[tipo];
    const cantTag = { Invoice: 'InvoicedQuantity', CreditNote: 'CreditedQuantity', DebitNote: 'DebitedQuantity' }[tipo];
    const items = hijosX(r, lineaTag).map(l => {
      const ti = impuestosX(l), iva = ti.filter(x => x.nombre === 'IVA');
      return { cod: txtX(l, 'Item/StandardItemIdentification/ID') || txtX(l, 'Item/SellersItemIdentification/ID'), desc: txtX(l, 'Item/Description') || txtX(l, 'Item/Name'), cant: numX(l, cantTag), precio: numX(l, 'Price/PriceAmount'), monto: numX(l, 'LineExtensionAmount'), pctIva: iva[0]?.pct ?? null, iva: iva.reduce((t, x) => t + x.valor, 0), inc: ti.filter(x => /^INC/.test(x.nombre)).reduce((t, x) => t + x.valor, 0) };
    });
    const pago = nodoX(r, 'PaymentMeans');
    const tipoDian = tipo === 'Invoice' ? (TIPO_FACTURA[txtX(r, 'InvoiceTypeCode')] || 'Factura electrónica') : tipo === 'CreditNote' ? 'Nota crédito' : 'Nota débito';
    const numero = txtX(r, 'ID'), fecha = txtX(r, 'IssueDate');
    const valores = {
      numero, fecha, vencimiento: txtX(r, 'DueDate') || txtX(pago, 'PaymentDueDate') || null,
      emisor: em.nombre || null, proveedor: em.nombre || null, nit: em.nit || null, cliente: cl.nombre || null, nitcliente: cl.nit || null, ciudad: em.ciudad || null,
      subtotal: numX(mt, 'LineExtensionAmount'), basegravable: numX(mt, 'TaxExclusiveAmount'), descuento: numX(mt, 'AllowanceTotalAmount') ?? 0,
      iva: suma(x => x.nombre === 'IVA'), inc: suma(x => /^INC/.test(x.nombre)),
      retefuente: suma(x => x.nombre === 'ReteFuente'), reteiva: suma(x => x.nombre === 'ReteIVA'), reteica: suma(x => x.nombre === 'ReteICA'), retencion: suma(x => x.ret),
      total: numX(mt, 'PayableAmount'), moneda: txtX(r, 'DocumentCurrencyCode') || 'COP',
      formapago: [FORMA_PAGO[txtX(pago, 'ID')], MEDIO_PAGO[txtX(pago, 'PaymentMeansCode')]].filter(Boolean).join(' · ') || null,
      cufe: txtX(r, 'UUID') || null, tipodian: tipoDian,
      referencia: txtX(r, 'BillingReference/InvoiceDocumentReference/ID') || txtX(r, 'DiscrepancyResponse/ReferenceID') || null,
      cantidaditems: items.length,
    };
    // Texto equivalente, para la hoja de texto y los resúmenes
    const lineas = [];
    const poner = (...celdas) => { let x = 0; lineas.push({ y: (lineas.length + 1) * 16, alto: 10, celdas: celdas.filter(c => c !== '' && c != null).map(c => { const t = String(c); const cel = { x, fin: x + t.length * 6, txt: t }; x += t.length * 6 + 40; return cel; }) }); };
    poner(`${tipoDian} No. ${numero}`);
    poner(`Fecha de emisión: ${fecha}`);
    poner(`Emisor: ${em.nombre || ''}`); poner(`NIT: ${em.nit || ''}`);
    poner(`Adquiriente: ${cl.nombre || ''}`); poner(`NIT adquiriente: ${cl.nit || ''}`);
    if (valores.referencia) poner(`Factura afectada: ${valores.referencia}. Motivo: ${txtX(r, 'DiscrepancyResponse/Description')}`);
    for (const it of items) poner(it.cod, it.desc, it.cant, it.precio, it.monto);
    poner(`Subtotal: ${valores.subtotal}`); for (const x of imps) poner(`${x.nombre}${x.pct != null ? ' ' + x.pct + '%' : ''}: ${x.valor}`);
    poner(`Total a pagar: ${valores.total} ${valores.moneda}`); poner(`CUFE: ${valores.cufe || ''}`);
    const tablas = items.length ? [{ pagina: 1, columnas: ['Código', 'Descripción', 'Cantidad', 'Valor unitario', 'Subtotal línea', '% IVA', 'IVA', 'INC'], filas: items.map(it => [it.cod, it.desc, it.cant, it.precio, it.monto, it.pctIva, it.iva, it.inc]) }] : [];
    return { paginas: [lineas], numPaginas: 1, leidas: 1, conOcr: 0, sinLeer: 0, camposFormulario: 0, horizontales: 0, info: {},
      xml: { valores, tipoId: tipo === 'Invoice' ? 'factura' : 'nota', signo: tipo === 'CreditNote' ? -1 : 1, impuestos: imps, items: items.map(it => ({ desc: it.desc, monto: it.monto })), tablas } };
  }

  // Word (.docx): párrafos como líneas y tablas como filas con celdas en columnas
  let mammothListo = null;
  const cargarMammoth = () => mammothListo ??= new Promise((ok, mal) => { const sc = document.createElement('script'); sc.src = base + 'mammoth.browser.min.js'; sc.onload = ok; sc.onerror = () => mal({ msg: 'No se pudo cargar el lector de Word' }); document.head.append(sc); });
  async function leerWord(a) {
    await cargarMammoth();
    const { value: html } = await mammoth.convertToHtml({ arrayBuffer: await a.file.arrayBuffer() }, { styleMap: ["p[style-name='Title'] => h1:fresh", "p[style-name='Título'] => h1:fresh", "p[style-name='Titre'] => h1:fresh", "p[style-name='Subtitle'] => h2:fresh", "p[style-name='Subtítulo'] => h2:fresh"] });
    const dom = new DOMParser().parseFromString(html, 'text/html');
    const lineas = [];
    let y = 0;
    const tam = { H1: 20, H2: 16, H3: 14, H4: 12 };
    const linea = (celdas, alto = 10) => { y += alto * 1.6; if (celdas.length) lineas.push({ y, alto, celdas }); };
    const recorrer = nodo => {
      for (const el of nodo.children) {
        if (el.tagName === 'TABLE') {
          for (const tr of el.querySelectorAll('tr')) {
            let x = 0;
            const celdas = [];
            for (const td of tr.children) {
              const span = +td.getAttribute('colspan') || 1;
              const txt = td.textContent.replace(/\s+/g, ' ').trim();
              if (txt) celdas.push({ x, fin: x + span * 160 - 10, txt });
              x += span * 160;
            }
            linea(celdas);
          }
        } else if (/^(P|H[1-6]|LI)$/.test(el.tagName)) {
          // Un párrafo con saltos de línea (<br>) son varias líneas
          const alto = tam[el.tagName] || (el.querySelector('strong') && el.textContent.trim() === el.querySelector('strong').textContent.trim() && el.textContent.length < 80 ? 12 : 10);
          for (const parte of el.innerHTML.split(/<br\s*\/?>/i)) {
            const txt = new DOMParser().parseFromString(parte, 'text/html').body.textContent.replace(/\s+/g, ' ').trim();
            if (txt) linea([{ x: 0, fin: Math.max(40, txt.length * 6), txt }], alto);
          }
        } else if (el.children.length) recorrer(el);
      }
    };
    recorrer(dom.body);
    // Páginas de ~60 líneas para que "página 1" sea el comienzo del documento
    const paginas = [];
    for (let i = 0; i < lineas.length; i += 60) paginas.push(lineas.slice(i, i + 60));
    return { paginas: paginas.length ? paginas : [[]], numPaginas: Math.max(1, paginas.length), leidas: paginas.length, conOcr: 0, sinLeer: 0, camposFormulario: 0, horizontales: 0, info: {} };
  }

  // Hojas de cálculo: cada hoja visible es una "página"; cada fila, una línea; cada celda, una celda con su posición
  async function leerHojaCalculo(a) {
    const wb = XLSX.read(new Uint8Array(await a.file.arrayBuffer()), { cellDates: false, cellStyles: true });
    const ocultas = new Set((wb.Workbook?.Sheets || []).filter(h => h.Hidden).map(h => h.name));
    const paginas = [];
    for (const nombre of wb.SheetNames) {
      const ws = wb.Sheets[nombre];
      if (ocultas.has(nombre) || !ws['!ref']) continue;
      const r = XLSX.utils.decode_range(ws['!ref']);
      const cols = ws['!cols'] || [], filas = ws['!rows'] || [];
      const ancho = c => cols[c]?.hidden ? 0 : ((cols[c]?.wch ?? (cols[c]?.width ? cols[c].width : 9)) * 6);
      const xs = [0];
      for (let c = r.s.c; c <= r.e.c + 1; c++) xs.push(xs[xs.length - 1] + ancho(c));
      const fin = {};   // ancho de celdas combinadas
      for (const m of ws['!merges'] || []) fin[XLSX.utils.encode_cell(m.s)] = xs[m.e.c - r.s.c + 1];
      const lineas = [];
      let y = 0;
      for (let f = r.s.r; f <= r.e.r; f++) {
        if (filas[f]?.hidden) continue;
        y += (filas[f]?.hpx || 16);
        const celdas = [];
        for (let c = r.s.c; c <= r.e.c; c++) {
          if (cols[c]?.hidden) continue;
          const dir = XLSX.utils.encode_cell({ r: f, c });
          const cel = ws[dir];
          if (!cel || cel.v === undefined || cel.v === null) continue;
          const txt = String(cel.w ?? cel.v).replace(/\s+/g, ' ').trim();
          if (!txt) continue;
          const x = xs[c - r.s.c];
          celdas.push({ x, fin: Math.max(fin[dir] ?? xs[c - r.s.c + 1], x + 1), txt });
        }
        if (celdas.length) lineas.push({ y, alto: 10, celdas });
      }
      if (lineas.length) paginas.push(porColumnas(lineas));
    }
    const p = wb.Props || {};
    const info = { Title: p.Title, Author: p.Author, CreationDate: p.CreatedDate ? new Date(p.CreatedDate).toISOString().replace(/-/g, '').slice(0, 8) : '', Producer: 'hoja de cálculo' };
    return { paginas, numPaginas: paginas.length, leidas: paginas.length, conOcr: 0, sinLeer: 0, camposFormulario: 0, horizontales: 0, info, hojaCalculo: true };
  }

  async function leerArchivo(a, i, total) {
    if (RE_HOJA.test(a.nombre)) return leerHojaCalculo(a);
    if (RE_IMAGEN.test(a.nombre) || /^image\//.test(a.file.type) && !RE_NO_SOPORTADO.test(a.nombre)) { estado(`Documento ${i + 1} de ${total}: leyendo la imagen (OCR)…`); return leerImagen(a); }
    if (RE_WORD.test(a.nombre)) return leerWord(a);
    if (RE_XML.test(a.nombre)) return leerXml(a);
    if (RE_ZIP.test(a.nombre)) throw { msg: 'ZIP dañado o protegido con contraseña' };
    if (RE_NO_SOPORTADO.test(a.nombre)) throw { msg: /\.doc$/i.test(a.nombre) ? 'Word antiguo (.doc): guárdalo como .docx' : 'Formato no soportado: conviértelo a PDF' };
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await a.file.arrayBuffer()) }).promise;
    const n = Math.min(pdf.numPages, MAX_PAGINAS);
    const paginas = [], crudas = []; let conOcr = 0, sinLeer = 0, camposFormulario = 0, horizontales = 0, info = {}, ladoMayor = 0;
    try {
      try { const f = await pdf.getFieldObjects(); camposFormulario = f ? Object.keys(f).length : 0; } catch { }
      try { info = (await pdf.getMetadata())?.info || {}; } catch { }
      const vacias = [];
      for (let p = 1; p <= n; p++) {
        if (cancelado) throw { cancel: true };
        if (p % 20 === 0) estado(`Documento ${i + 1} de ${total}: página ${p} de ${n}…`);
        const pag = await pdf.getPage(p);
        const vp = pag.getViewport({ scale: 1 });
        if (vp.width > vp.height * 1.1) horizontales++;
        if (p === 1) ladoMayor = Math.max(vp.width, vp.height);
        const piezas = $('#forzarOcr').checked ? [] : await piezasTexto(pag);
        if (piezas.map(x => x.txt).join('').replace(/\s/g, '').length < 20) vacias.push(p - 1);
        crudas.push(piezas);
        pag.cleanup();
      }
      // OCR (lento) solo si el documento es escaneado: en un PDF con texto, las páginas
      // sin texto suelen ser portadas, hojas en blanco o figuras
      const escaneado = $('#forzarOcr').checked || n <= 3 || vacias.length >= n * 0.5;
      if (escaneado) for (const k of vacias) {
        if (cancelado) throw { cancel: true };
        if (conOcr >= MAX_OCR) { sinLeer++; continue; }
        const faltan = Math.min(vacias.length, MAX_OCR) - conOcr;
        estado(`Documento ${i + 1} de ${total}: leyendo página escaneada ${k + 1} de ${n}…` + restante(faltan));
        const t0 = performance.now();
        const pag = await pdf.getPage(k + 1);
        crudas[k] = await piezasOcr(pag); conOcr++;
        pag.cleanup();
        tiemposOcr.push(performance.now() - t0);
      }
      // Descarta el texto diminuto (rótulos dentro de figuras): se compara con el tamaño típico del documento
      const pesos = [];
      for (const ps of crudas.slice(0, 40)) for (const x of ps) pesos.push([x.alto, x.txt.length]);
      pesos.sort((a, b) => a[0] - b[0]);
      const totalCar = pesos.reduce((s, x) => s + x[1], 0);
      let acum = 0, tipico = 10;
      for (const [a, c] of pesos) { acum += c; if (acum >= totalCar / 2) { tipico = a; break; } }
      const hoja = /calc|excel|spreadsheet|numbers/i.test(`${info.Producer || ''} ${info.Creator || ''}`);
      for (const ps of crudas) {
        const ls = armarLineas(ps.filter(x => x.alto >= tipico * 0.45));
        const prev = paginas[paginas.length - 1];
        // Excel o Calc imprimen las columnas que no caben en otra página, a la misma altura: se vuelven a unir
        if (hoja && prev && ls.length && ls.length <= prev.length) {
          const pareja = l => prev.find(o => Math.abs(o.y - l.y) < Math.max(2, l.alto * 0.4));
          if (ls.filter(pareja).length >= ls.length * 0.7) {
            const dx = Math.max(...prev.flatMap(o => o.celdas.map(c => c.fin))) + 30;
            for (const l of ls) {
              const o = pareja(l), celdas = l.celdas.map(c => ({ ...c, x: c.x + dx, fin: c.fin + dx }));
              if (o) o.celdas.push(...celdas); else prev.push({ ...l, celdas });
            }
            prev.sort((a, b) => a.y - b.y);
            continue;
          }
        }
        paginas.push(ls);
      }
      paginas.forEach((ls, k) => paginas[k] = porColumnas(ls));
    } finally { pdf.destroy(); }
    return { paginas, numPaginas: pdf.numPages ?? n, leidas: n, conOcr, sinLeer, camposFormulario, horizontales, info, ladoMayor, piezas1: crudas[0] };
  }

  $('#convertir').onclick = async () => {
    cancelado = false;
    archivos.forEach(a => { a.estado = 'Pendiente'; a.clase = ''; });
    ocupado(true);
    const pedido = interpretarPedido($('#pedido').value);
    let docs = [];
    const omitidos = [], inicio = performance.now();
    for (let i = 0; i < archivos.length; i++) {
      if (cancelado) break;
      const a = archivos[i];
      a.estado = 'Leyendo…'; pintarArchivos();
      const porDoc = i ? (performance.now() - inicio) / i / 1000 : 0, faltan = porDoc * (archivos.length - i);
      estado(`Leyendo documento ${i + 1} de ${archivos.length}: ${a.nombre}` + (i >= 2 && faltan > 20 ? (faltan < 90 ? ` (faltan unos ${Math.ceil(faltan / 10) * 10} s)` : ` (faltan unos ${Math.round(faltan / 60)} min)`) : '')); progreso(i / archivos.length);
      try {
        const leido = await leerArchivo(a, i, archivos.length);
        const { paginas, numPaginas, leidas, conOcr, sinLeer, camposFormulario, horizontales, info } = leido;
        const doc = analizar(paginas);
        if (leido.piezas1) doc.piezas1 = leido.piezas1;
        if (leido.xml) { doc.xml = leido.xml; doc.tablas = leido.xml.tablas; doc._items = leido.xml.items; }
        doc.ocr = conOcr > 0;
        if (!doc.lineas.length) throw { msg: 'Sin texto' };
        const meta = { archivo: a.nombre, paginas: numPaginas, leidas, camposFormulario, horizontales, ladoMayor: leido.ladoMayor || 0, ...metadatos(info, doc), idioma: doc.xml ? 'Español' : detectarIdioma(doc.lineas.slice(0, 400).map(l => l.texto).join(' ')) };
        doc.meta = meta;
        idiomaActual = meta.idioma;
        // ¿Día/mes o mes/día? Lo decide una fecha inequívoca del propio documento; si no hay, mes/día solo en inglés con dólares
        let dm = 0, md = 0;
        for (const l of doc.lineas.slice(0, 500)) for (const m of l.texto.matchAll(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/g)) { if (+m[1] > 12) dm++; else if (+m[2] > 12) md++; }
        mesPrimero = md > dm || (md === dm && meta.idioma === 'Inglés' && doc.lineas.slice(0, 200).some(l => /\$|USD/.test(l.texto)));
        const { tipo, confianza } = doc.xml ? { tipo: TIPOS.find(t => t.id === doc.xml.tipoId), confianza: 'alta' } : clasificar(doc, a.nombre, meta);
        const claves = pedido.length ? pedido.map(c => c.clave) : tipo.campos;
        const datos = {};
        for (const k of claves.filter(k => k !== 'resumen')) {
          const c = pedido.find(c => c.clave === k);
          datos[k] = c?.libre ? buscar(doc, c.libre) : extraerCampo(doc, k, tipo, datos, meta);
        }
        // Datos base para el resumen, los totales y los duplicados, aunque no se hayan pedido
        const baseCampos = COMERCIALES.has(tipo.id) ? ['numero', 'fecha', 'emisor', 'cliente', 'total', 'moneda', 'concepto', 'categoria'] : tipo.id === 'contrato' ? ['numero', 'fecha', 'emisor', 'cliente', 'total', 'moneda', 'temas'] : ['titulo', 'fecha', 'temas'];
        for (const k of baseCampos) if (!(k in datos)) datos['_' + k] = extraerCampo(doc, k, tipo, datos, meta);
        const b = k => datos[k] ?? datos['_' + k];
        datos.resumen = resumenDoc(doc, tipo, { numero: b('numero'), fecha: b('fecha'), emisor: b('emisor'), cliente: b('cliente'), total: b('total'), moneda: b('moneda'), titulo: b('titulo'), concepto: b('concepto') });
        // En la página de contadores, "$" en una factura colombiana (con NIT) es COP
        if (MODO === 'contadores' && !doc.xml && meta.idioma !== 'Inglés') for (const k of ['moneda', '_moneda']) if (datos[k] === '$' && (meta.idioma === 'Español' || doc.lineas.slice(0, 80).some(l => /\b(nit|cufe|dian)\b/.test(l.textoN)))) datos[k] = 'COP';
        docs.push({ archivo: a.nombre, paginas: numPaginas, conOcr, sinLeer, tipo, confianza, datos, doc, idioma: meta.idioma });
        a.estado = (doc.xml ? doc.xml.valores.tipodian.replace(/ electrónica de venta$/, '') + ' · XML' : tipo.nombre) + (conOcr ? ' · OCR' : '') + (leidas < numPaginas ? ` · ${leidas} de ${numPaginas} págs.` : '');
        a.clase = 'ok';
      } catch (e) {
        if (e?.cancel) { a.estado = 'Detenido'; break; }
        if (e?.omitir) { a.estado = 'Omitido'; a.clase = ''; omitidos.push([a.nombre, e.omitir]); pintarArchivos(); continue; }
        console.error(a.nombre, e);
        a.estado = e?.name === 'PasswordException' ? 'Protegido con contraseña' : e?.name === 'InvalidPDFException' ? 'Archivo vacío o dañado' : e?.msg || 'No se pudo leer';
        a.clase = 'error';
        docs.push({ archivo: a.nombre, error: a.estado });
      }
      pintarArchivos();
    }
    idiomaActual = '';
    progreso(null);
    // En equipos con poca memoria se libera el lector OCR (unos 150 MB) al terminar
    if (EQUIPO_LIVIANO && ocrWorker) { ocrWorker.terminate(); ocrWorker = null; }
    // Un PDF cuya factura también llegó en XML sobra: el XML trae los datos exactos
    const numDoc = d => String(d.datos.numero ?? d.datos._numero ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const conXml = new Set(docs.filter(d => d.doc?.xml).map(numDoc).filter(Boolean));
    if (conXml.size) docs = docs.filter(d => {
      if (d.error || d.doc.xml || !COMERCIALES.has(d.tipo.id) || !conXml.has(numDoc(d))) return true;
      omitidos.push([d.archivo, 'Representación en PDF de una factura cuyo XML también se subió']);
      const a = archivos.find(x => x.nombre === d.archivo); if (a) { a.estado = 'Omitido (ya está su XML)'; a.clase = ''; }
      return false;
    });
    pintarArchivos();
    if (!docs.some(d => !d.error)) { estado(cancelado ? 'Proceso detenido.' : omitidos.length ? 'Ninguno de los archivos es una factura o documento para procesar.' : 'No se pudo leer ningún documento.', 'error'); ocupado(false); return; }
    mostrar(construirLibro(docs, pedido, omitidos));
    estado(cancelado ? `Proceso detenido: se incluyen los ${docs.length} documentos leídos.` : 'Listo. Revisa las hojas y descarga el Excel.', cancelado ? '' : 'ok');
    ocupado(false);
  };
  $('#detener').onclick = () => { cancelado = true; estado('Deteniendo…'); };

  // =====================================================================
  // Libro de Excel
  // =====================================================================
  const colLetra = i => { let s = ''; for (i++; i; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
  // Filas de TOTAL: una por moneda si hay varias (con SUMIF), o una sola con SUM
  function filasTotal(columnas, filas, tipos, etiquetaCol, colMoneda) {
    const din = tipos.map((t, j) => t === 'dinero' && filas.some(f => typeof f[j] === 'number') ? j : -1).filter(j => j >= 0);
    if (!din.length) return [];
    const monedas = colMoneda >= 0 ? [...new Set(filas.map(f => f[colMoneda]).filter(Boolean))] : [];
    const ult = filas.length + 1;
    const fila = (etq, fn) => { const r = columnas.map(() => ''); r[etiquetaCol] = etq; din.forEach(j => r[j] = fn(j)); return r; };
    if (monedas.length) return monedas.map(m => fila(`TOTAL ${m}`, j => ({
      t: 'n', v: Math.round(filas.reduce((s, f) => s + (f[colMoneda] === m && typeof f[j] === 'number' ? f[j] : 0), 0) * 100) / 100,
      f: `SUMIF(${colLetra(colMoneda)}2:${colLetra(colMoneda)}${ult},"${m}",${colLetra(j)}2:${colLetra(j)}${ult})` })));
    return [fila(monedas[0] ? `TOTAL ${monedas[0]}` : 'TOTAL', j => ({ t: 'n', v: Math.round(filas.reduce((s, f) => s + (typeof f[j] === 'number' ? f[j] : 0), 0) * 100) / 100, f: `SUM(${colLetra(j)}2:${colLetra(j)}${ult})` }))];
  }
  function hojaDocs(nombre, lista, claves, etiquetas, tipos) {
    const columnas = ['Archivo', 'Tipo', 'Idioma', ...etiquetas, 'Resumen', 'Por revisar'];
    const tiposCol = ['texto', 'texto', 'texto', ...tipos, 'texto', 'texto'];
    let faltantes = 0;
    const filas = lista.map(d => {
      const vals = claves.map(k => d.datos[k] ?? '');
      const noAplica = k => (['concepto', 'categoria'].includes(k) && !COMERCIALES.has(d.tipo.id)) || (k === 'temas' && COMERCIALES.has(d.tipo.id)) ||
        (d.tipo.id === 'plano' && d.doc._rotulo && (k === 'emisor' || ['numproyecto', 'revision', 'dibujo', 'diseno', 'reviso', 'aprobo', 'observaciones', 'escala'].includes(k) && !d.doc._rotulo.presentes.has(k)));   // el rótulo no tiene ese recuadro; la empresa suele ir como logo   // el rótulo no tiene ese recuadro
      const f = etiquetas.filter((_, j) => (vals[j] === '' || vals[j] === null) && !noAplica(claves[j]));
      if (d.confianza === 'baja') f.unshift('tipo de documento');
      if (d.sinLeer) f.push(`${d.sinLeer} páginas escaneadas sin leer`);
      if (f.length) faltantes++;
      return [d.archivo, d.tipo.nombre, d.idioma || '', ...vals, d.datos.resumen || '', f.join(', ')];
    });
    const totales = filasTotal(columnas, filas, tiposCol, 1, columnas.indexOf('Moneda'));
    return { nombre, columnas, filas: [...filas, ...totales], tipos: tiposCol, nTotales: totales.length, faltantes };
  }

  // Libro de compras/ventas, resumen por tercero e impuestos: para contadores (y siempre que haya XML de la DIAN)
  function hojasContables(ok) {
    const lista = ok.filter(d => ['factura', 'nota', 'cobro', 'recibo'].includes(d.tipo.id));
    if (!lista.length) return null;
    const val = (d, k) => { if (k in d.datos) return d.datos[k]; if ('_' + k in d.datos) return d.datos['_' + k]; return (d.datos['_' + k] = extraerCampo(d.doc, k, d.tipo, d.datos, d.doc.meta || {})); };
    const signo = d => d.doc.xml ? d.doc.xml.signo : d.tipo.id === 'nota' && d.doc.lineas.slice(0, 40).some(l => /nota credito|credit note/.test(l.textoN)) ? -1 : 1;
    const din = (d, k) => { const v = val(d, k); return typeof v === 'number' ? Math.round(v * signo(d) * 100) / 100 : ''; };
    const fuente = d => d.doc.xml ? 'XML DIAN (exacto)' : d.conOcr ? 'Imagen o escaneado (OCR, revisar)' : RE_HOJA.test(d.archivo) ? 'Hoja de cálculo' : RE_WORD.test(d.archivo) ? 'Word' : 'PDF (revisar)';
    const tipoDoc = d => d.doc.xml ? d.doc.xml.valores.tipodian : d.tipo.id === 'nota' ? (signo(d) < 0 ? 'Nota crédito' : 'Nota crédito/débito') : d.tipo.nombre;
    const nitClave = n => String(n || '').split('-')[0].replace(/\D/g, '');

    // ¿Compras o ventas? Si casi todos los documentos tienen el mismo adquiriente, son compras de esa empresa
    const moda = xs => { const c = {}; xs.filter(Boolean).forEach(x => c[x] = (c[x] || 0) + 1); return Object.entries(c).sort((a, b) => b[1] - a[1])[0] || [null, 0]; };
    const [nitCli, nCli] = moda(lista.map(d => nitClave(val(d, 'nitcliente'))));
    const [nitEm, nEm] = moda(lista.map(d => nitClave(val(d, 'nit'))));
    const ventas = nEm >= lista.length * 0.6 && nEm > nCli;
    const compras = !ventas && nCli >= lista.length * 0.6;
    const nombreLibro = compras ? 'Libro de compras' : ventas ? 'Libro de ventas' : 'Libro de facturas';

    const cols = ['Fecha', 'Tipo', 'Número', 'NIT emisor', 'Emisor', 'NIT adquiriente', 'Adquiriente', 'Concepto', 'Subtotal', 'Descuento', 'IVA', 'INC', 'ReteFuente', 'ReteIVA', 'ReteICA', 'Total retenciones', 'Total a pagar', 'Moneda', 'Forma de pago', 'Vence', 'Factura afectada', 'CUFE / CUDE', 'Fuente', 'Archivo'];
    const tipos = ['fecha', 'texto', 'codigo', 'nit', 'texto', 'nit', 'texto', 'largo', 'dinero', 'dinero', 'dinero', 'dinero', 'dinero', 'dinero', 'dinero', 'dinero', 'dinero', 'texto', 'texto', 'fecha', 'codigo', 'codigo', 'texto', 'texto'];
    const filas = lista.map(d => [val(d, 'fecha') || '', tipoDoc(d), val(d, 'numero') || '', val(d, 'nit') || '', val(d, 'emisor') || '', val(d, 'nitcliente') || '', val(d, 'cliente') || '', val(d, 'concepto') || '',
      din(d, 'subtotal'), din(d, 'descuento'), din(d, 'iva'), din(d, 'inc'), d.doc.xml ? din(d, 'retefuente') : '', d.doc.xml ? din(d, 'reteiva') : '', d.doc.xml ? din(d, 'reteica') : '', din(d, 'retencion'), din(d, 'total'),
      val(d, 'moneda') || '', val(d, 'formapago') || '', val(d, 'vencimiento') || '', val(d, 'referencia') || '', val(d, 'cufe') || '', fuente(d), d.archivo])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    const totales = filasTotal(cols, filas, tipos, 1, cols.indexOf('Moneda'));
    const libroH = { nombre: nombreLibro, columnas: cols, tipos, filas: [...filas, ...totales], nTotales: totales.length,
      pie: [[], ['Las notas crédito van en negativo, así los totales ya quedan netos. Los valores de los XML de la DIAN son exactos; los leídos de PDF, fotos o escaneados conviene revisarlos.']] };

    // Resumen por tercero (proveedor en compras, cliente en ventas)
    const porCliente = ventas;
    const grupos = {};
    for (const d of lista) {
      const nit = val(d, porCliente ? 'nitcliente' : 'nit') || '', nombre = val(d, porCliente ? 'cliente' : 'emisor') || '(sin identificar)';
      const k = nitClave(nit) || norm(nombre);
      const g = (grupos[k + '|' + (val(d, 'moneda') || '')] ??= { nit, nombre, moneda: val(d, 'moneda') || '', n: 0, subtotal: 0, iva: 0, inc: 0, ret: 0, total: 0 });
      g.n++; for (const [c, k2] of [['subtotal', 'subtotal'], ['iva', 'iva'], ['inc', 'inc'], ['ret', 'retencion'], ['total', 'total']]) { const v = din(d, k2); if (typeof v === 'number') g[c] += v; }
    }
    const colsT = ['NIT', porCliente ? 'Cliente' : compras ? 'Proveedor' : 'Emisor', 'Documentos', 'Subtotal', 'IVA', 'INC', 'Retenciones', 'Total', 'Moneda'];
    const tiposT = ['nit', 'texto', 'numero', 'dinero', 'dinero', 'dinero', 'dinero', 'dinero', 'texto'];
    const r2 = x => Math.round(x * 100) / 100;
    const filasT = Object.values(grupos).sort((a, b) => b.total - a.total).map(g => [g.nit, g.nombre, g.n, r2(g.subtotal), r2(g.iva), r2(g.inc), r2(g.ret), r2(g.total), g.moneda]);
    const totT = filasTotal(colsT, filasT, tiposT, 1, colsT.indexOf('Moneda'));
    const terceroH = { nombre: porCliente ? 'Por cliente' : compras ? 'Por proveedor' : 'Por emisor', columnas: colsT, tipos: tiposT, filas: [...filasT, ...totT], nTotales: totT.length };

    // Impuestos por tarifa y retenciones
    const imp = {};
    const sumar = (nombre, pct, base, valor, s, doc) => { const k = nombre + '|' + (pct ?? ''); const x = (imp[k] ??= { nombre, pct, base: 0, valor: 0, docs: new Set() }); x.base += (base || 0) * s; x.valor += (valor || 0) * s; x.docs.add(doc); };
    for (const d of lista) {
      const s = signo(d);
      if (d.doc.xml) for (const x of d.doc.xml.impuestos) sumar(x.nombre, x.pct, x.base, x.valor, s, d.archivo);
      else {
        const iva = val(d, 'iva'), ret = val(d, 'retencion');
        if (typeof iva === 'number' && iva) sumar('IVA', null, typeof val(d, 'subtotal') === 'number' ? val(d, 'subtotal') : 0, iva, s, d.archivo);
        if (typeof ret === 'number' && ret) sumar('Retenciones', null, null, ret, s, d.archivo);
      }
    }
    const orden = ['IVA', 'INC', 'ICA', 'ReteFuente', 'ReteIVA', 'ReteICA', 'Retenciones'];
    const filasI = Object.values(imp).sort((a, b) => ((orden.indexOf(a.nombre) + 1 || 99) - (orden.indexOf(b.nombre) + 1 || 99)) || (b.pct ?? -1) - (a.pct ?? -1))
      .map(x => [RETENCIONES.has(x.nombre) || x.nombre === 'Retenciones' ? 'Retención' : 'Impuesto', x.nombre, x.pct == null ? 'Sin detalle (leído de PDF)' : `${x.pct}%`, x.base ? r2(x.base) : '', r2(x.valor), x.docs.size]);
    const impH = { nombre: 'Impuestos', columnas: ['Clase', 'Impuesto', 'Tarifa', 'Base', 'Valor', 'Documentos'], tipos: ['texto', 'texto', 'texto', 'dinero', 'dinero', 'numero'], filas: filasI, nTotales: 0,
      pie: [[], ['Base y valor netos de notas crédito. Útil como apoyo para las declaraciones de IVA y retención en la fuente: verifica siempre contra tu contabilidad.']] };

    const neto = {};
    for (const d of lista) { const v = din(d, 'total'); if (typeof v === 'number') { const m = val(d, 'moneda') || 'sin moneda'; neto[m] = (neto[m] || 0) + v; } }
    const ivaTot = filasI.filter(f => f[1] === 'IVA').reduce((t, f) => t + f[4], 0), retTot = filasI.filter(f => f[0] === 'Retención').reduce((t, f) => t + f[4], 0);
    const nXml = lista.filter(d => d.doc.xml).length;
    const frase = `${nombreLibro}: ${lista.length} documento${lista.length === 1 ? '' : 's'}${nXml ? ` (${nXml} desde XML de la DIAN, con datos exactos)` : ''}; total neto ${Object.entries(neto).map(([m, v]) => fmtMonto(v, m === 'sin moneda' ? '' : m)).join(' + ')}` + (ivaTot ? `, IVA ${fmtMonto(ivaTot, '')}` : '') + (retTot ? `, retenciones ${fmtMonto(retTot, '')}` : '') + '.';
    return { hojas: [libroH, terceroH, ...(filasI.length ? [impH] : [])], frase };
  }

  function construirLibro(docs, pedido, omitidos = []) {
    const ok = docs.filter(d => !d.error), errores = docs.filter(d => d.error);
    const hojas = [];
    const grupos = [...TIPOS, OTRO].map(t => ({ t, docs: ok.filter(d => d.tipo === t) })).filter(g => g.docs.length);
    const tot = d => { const v = d.datos.total ?? d.datos._total; return typeof v === 'number' ? v * (d.doc?.xml?.signo ?? 1) : null; };   // notas crédito del XML restan
    const mon = d => d.datos.moneda ?? d.datos._moneda ?? '';

    // --- Hojas de datos ---
    const hojasDatos = [];
    if (pedido.length) {
      const cs = pedido.filter(c => c.clave !== 'resumen' && c.clave !== 'idioma');
      const iDin = cs.findIndex(c => c.tipo === 'dinero');
      if (iDin >= 0 && !cs.some(c => c.clave === 'moneda')) {
        cs.splice(iDin + 1, 0, { clave: 'moneda', etiqueta: CAMPOS.moneda.etiqueta, tipo: 'texto' });
        for (const d of ok) if (!('moneda' in d.datos)) d.datos.moneda = d.datos._moneda ?? null;
      }
      hojasDatos.push(hojaDocs('Datos solicitados', ok, cs.map(c => c.clave), cs.map(c => c.etiqueta), cs.map(c => c.tipo)));
    } else {
      for (const g of grupos) {
        const claves = g.t.campos.filter(k => k !== 'resumen');
        hojasDatos.push(hojaDocs(g.t.plural.slice(0, 31), g.docs, claves, claves.map(k => CAMPOS[k].etiqueta), claves.map(k => CAMPOS[k].tipo)));
      }
    }

    // --- Totales por tipo y moneda (nunca se suman monedas distintas) ---
    const sumas = {};   // tipo -> moneda -> {n, suma}
    for (const d of ok) { const v = tot(d); if (v === null) continue; const m = mon(d) || 'sin moneda'; ((sumas[d.tipo.id] ??= {})[m] ??= { n: 0, suma: 0 }); sumas[d.tipo.id][m].n++; sumas[d.tipo.id][m].suma += v; }
    const textoSumas = id => Object.entries(sumas[id] || {}).map(([m, x]) => fmtMonto(x.suma, m === 'sin moneda' ? '' : m)).join(' + ');

    // --- Resumen ---
    const partesTipo = grupos.map(g => `${g.docs.length} ${(g.docs.length === 1 ? g.t.nombre : g.t.plural).toLowerCase()}`);
    const lista = partesTipo.length > 1 ? partesTipo.slice(0, -1).join(', ') + ' y ' + partesTipo.at(-1) : partesTipo[0];
    const frasesDinero = grupos.filter(g => COMERCIALES.has(g.t.id) && sumas[g.t.id]).map(g => `${g.t.plural.toLowerCase()}, ${textoSumas(g.t.id)}`);
    const idiomas = {};
    ok.forEach(d => d.idioma && (idiomas[d.idioma] = (idiomas[d.idioma] || 0) + 1));
    const textoIdiomas = Object.entries(idiomas).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k.toLowerCase()} (${n})`).join(', ');
    const clave = d => d.tipo.id + '|' + norm(d.datos.numero ?? d.datos._numero ?? '') + '|' + norm(d.datos.nit ?? d.datos.emisor ?? d.datos._emisor ?? '');
    const vistos = {}, duplicados = [];
    for (const d of ok) { if (!COMERCIALES.has(d.tipo.id)) continue; const n = d.datos.numero ?? d.datos._numero; if (!n) continue; const k = clave(d); if (vistos[k]) duplicados.push([d.tipo.nombre, n, vistos[k], d.archivo]); else vistos[k] = d.archivo; }
    const porRevisar = hojasDatos.reduce((s, h) => s + h.faltantes, 0);
    const paginasTot = ok.reduce((s, d) => s + d.paginas, 0);
    const largos = ok.filter(d => d.paginas >= 30).sort((a, b) => b.paginas - a.paginas);
    // ¿De qué tratan? Gasto por categoría y temas en común
    const porCategoria = {};
    for (const d of ok) {
      if (!COMERCIALES.has(d.tipo.id)) continue;
      const c = d.datos.categoria ?? d.datos._categoria ?? 'Sin identificar';
      const x = (porCategoria[c] ??= { n: 0, montos: {} });
      x.n++;
      const v = tot(d); if (v !== null) { const m = mon(d) || 'sin moneda'; x.montos[m] = (x.montos[m] || 0) + v; }
    }
    const catOrden = Object.entries(porCategoria).sort((a, b) => b[1].n - a[1].n);
    const temasLote = {};
    for (const d of ok) {
      if (COMERCIALES.has(d.tipo.id) || d.tipo.id === 'plano') continue;
      const t = d.datos.temas ?? d.datos._temas;
      if (t) for (const x of String(t).split(', ')) { const k = norm(x); (temasLote[k] ??= { forma: x, n: 0 }).n++; }
    }
    const nNoCom = ok.filter(d => !COMERCIALES.has(d.tipo.id) && d.tipo.id !== 'plano').length;
    const planos = ok.filter(d => d.tipo.id === 'plano').map(d => { const r = d.doc._rotulo || {}; const t = d.datos.titulo ?? d.datos._titulo ?? r.titulo; return (r.plano || d.archivo.replace(/\.[^.]+$/, '')) + (t ? ` (${t})` : ''); });
    const temasPorDoc = ok.filter(d => !COMERCIALES.has(d.tipo.id) && d.tipo.id !== 'plano' && (d.datos.temas ?? d.datos._temas)).map(d => [d.archivo, d.tipo.nombre, d.datos.temas ?? d.datos._temas]);
    const repetidos = Object.values(temasLote).filter(x => x.n >= 2).sort((a, b) => b.n - a.n);
    const temasComunes = Object.values(temasLote).filter(x => x.n >= 2 || nNoCom === 1).sort((a, b) => b.n - a.n).slice(0, 8);
    let texto = [
      `Se procesaron ${docs.length} documento${docs.length === 1 ? '' : 's'} (${paginasTot.toLocaleString('es-CO')} páginas): ${lista || 'ninguno legible'}.`,
      errores.length ? `${errores.length === 1 ? 'Uno no se pudo leer' : errores.length + ' no se pudieron leer'} (${errores.map(d => d.error.toLowerCase()).filter((v, i, a) => a.indexOf(v) === i).join(', ')}).` : '',
      textoIdiomas && Object.keys(idiomas).length > 1 ? `Idiomas: ${textoIdiomas}.` : '',
      frasesDinero.length ? `Sumas por tipo: ${frasesDinero.join('; ')}.` : '',
      planos.length ? `Plano${planos.length === 1 ? '' : 's'}: ${planos.slice(0, 8).join('; ')}${planos.length > 8 ? '; …' : ''}.` : '',
      catOrden.length ? `Los documentos comerciales son principalmente de ${catOrden.slice(0, 4).map(([c, x]) => `${c.toLowerCase()} (${x.n})`).join(', ')}.` : '',
      temasComunes.length ? `Temas ${nNoCom === 1 ? 'del documento' : 'en común'}: ${temasComunes.map(x => x.forma + (x.n > 1 ? ` (${x.n})` : '')).join(', ')}.` : (temasPorDoc.length ? `Temas por documento: ${temasPorDoc.slice(0, 5).map(([a, , t]) => `${a.replace(/\.[^.]+$/, '')} (${t.split(', ').slice(0, 3).join(', ')})`).join('; ')}${temasPorDoc.length > 5 ? '; …' : ''}.` : ''),
      largos.length ? `El más extenso es «${largos[0].datos.titulo ?? largos[0].datos._titulo ?? largos[0].archivo}» (${largos[0].paginas} páginas).` : '',
      duplicados.length ? `Hay ${duplicados.length} posible${duplicados.length === 1 ? '' : 's'} duplicado${duplicados.length === 1 ? '' : 's'} (mismo número y emisor).` : '',
      porRevisar ? `${porRevisar} documento${porRevisar === 1 ? ' tiene' : 's tienen'} datos que no se encontraron: revisa la columna «Por revisar».` : 'Se encontraron todos los datos buscados.',
    ].filter(Boolean).join(' ');

    const filasRes = grupos.map(g => [g.t.nombre, g.docs.length, g.docs.reduce((s, d) => s + d.paginas, 0), textoSumas(g.t.id)]);
    if (errores.length) filasRes.push(['No se pudo leer', errores.length, '', '']);
    const resumen = { nombre: 'Resumen', columnas: ['Tipo de documento', 'Cantidad', 'Páginas', 'Suma de totales'], tipos: ['texto', 'numero', 'numero', 'texto'], filas: filasRes };
    resumen.filas.push(['TOTAL', { t: 'n', v: ok.length + errores.length, f: `SUM(B2:B${filasRes.length + 1})` }, { t: 'n', v: paginasTot, f: `SUM(C2:C${filasRes.length + 1})` }, '']);
    resumen.nTotales = 1;
    const porMoneda = {};
    for (const d of ok) if (COMERCIALES.has(d.tipo.id) && tot(d) !== null) { const m = mon(d) || 'sin moneda'; (porMoneda[m] ??= { n: 0, suma: 0 }); porMoneda[m].n++; porMoneda[m].suma += tot(d); }
    resumen.pie = [[], ['Resumen', texto],
      ...(catOrden.length ? [[], ['¿De qué son? Documentos comerciales por categoría'], ['Categoría', 'Documentos', 'Suma'], ...catOrden.map(([c, x]) => [c, x.n, Object.entries(x.montos).map(([m, v]) => fmtMonto(v, m === 'sin moneda' ? '' : m)).join(' + ')])] : []),
      ...(temasPorDoc.length ? [[], ['¿De qué tratan? Temas de tesis, artículos, informes y otros documentos'], ['Archivo', 'Tipo', 'Temas principales'], ...temasPorDoc.slice(0, 60)] : []),
      ...(repetidos.length ? [[], ['Temas que se repiten en varios documentos'], ['Tema', 'Documentos'], ...repetidos.slice(0, 15).map(x => [x.forma, x.n])] : []),
      ...(Object.keys(porMoneda).length ? [[], ['Totales por moneda (documentos comerciales)'], ['Moneda', 'Documentos', 'Suma'], ...Object.entries(porMoneda).map(([m, x]) => [m, x.n, x.suma])] : []),
      ...(duplicados.length ? [[], ['Posibles duplicados'], ['Tipo', 'Número', 'Archivo', 'Repetido en'], ...duplicados] : []),
      ...(errores.length ? [[], ['Archivos no leídos'], ...errores.map(d => [d.archivo, d.error])] : []),
      ...(omitidos.length ? [[], ['Archivos omitidos'], ...omitidos] : [])];
    const contables = (MODO === 'contadores' || ok.some(d => d.doc.xml)) ? hojasContables(ok) : null;
    if (contables) { resumen.pie.splice(2, 0, ['Contabilidad', contables.frase]); texto = contables.frase + ' ' + texto; }
    hojas.push(resumen, ...(contables ? contables.hojas : []), ...hojasDatos);

    // --- Tablas: ítems de documentos comerciales (columnas unificadas) y tablas de los demás (una debajo de otra) ---
    if ($('#conItems').checked) {
      const cols = [], filas = [];
      for (const d of ok.filter(d => COMERCIALES.has(d.tipo.id))) for (const t of d.doc.tablas) {
        const idx = t.columnas.map(c => { const n = norm(c); let j = cols.findIndex(x => norm(x) === n); if (j < 0) { cols.push(c); j = cols.length - 1; } return j; });
        for (const f of t.filas) { const r = []; f.forEach((v, j) => r[idx[j]] = convertir(v)); filas.push([d.archivo, d.tipo.nombre, d.datos.numero ?? d.datos._numero ?? '', t.pagina, ...r]); }
      }
      if (filas.length) {
        const ancho = 4 + cols.length;
        hojas.push({ nombre: 'Ítems', columnas: ['Archivo', 'Tipo', 'Número doc.', 'Página', ...cols], filas: filas.map(f => Array.from({ length: ancho }, (_, j) => f[j] ?? '')) });
      }
      const apiladas = [];
      for (const d of ok.filter(d => !COMERCIALES.has(d.tipo.id) && d.tipo.id !== 'plano')) for (const t of d.doc.tablas) {
        if (apiladas.length > 20000) break;
        apiladas.push([`${d.archivo} · página ${t.pagina}`], t.columnas, ...t.filas.map(f => f.map(convertir)), []);
      }
      if (apiladas.length) hojas.push({ nombre: 'Tablas', columnas: ['Tablas encontradas en informes, listados y otros documentos'], filas: apiladas });
    }
    if ($('#conTexto').checked)
      hojas.push({ nombre: 'Texto', columnas: ['Archivo', 'Página', 'Texto'], filas: ok.flatMap(d => d.doc.lineas.map(l => [d.archivo, l.pagina, l.texto])) });

    const cifras = [[docs.length, 'documentos'], [paginasTot, 'páginas'], ...grupos.slice().sort((a, b) => b.docs.length - a.docs.length).slice(0, 4).map(g => [g.docs.length, g.t.plural.toLowerCase()])];
    for (const [m, x] of Object.entries(sumas.factura || {}).slice(0, 2)) cifras.push([fmtMonto(x.suma, m === 'sin moneda' ? '' : m), 'total facturas']);
    return { titulo: docs.length === 1 ? docs[0].archivo.replace(/\.pdf$/i, '') : `${docs.length} documentos`, resumen: texto, cifras, hojas };
  }

  // =====================================================================
  // Vista previa
  // =====================================================================
  const EJEMPLO = {
    titulo: 'Ejemplo: 4 documentos', cifras: [[4, 'documentos'], [2, 'facturas'], [1, 'remisión'], [1, 'tesis'], ['COP 2.128.000', 'total facturas']],
    resumen: 'Así se ve un resultado: los documentos se clasifican, cada uno queda en una fila con los datos pedidos y al final va el TOTAL. Sube tus PDF para reemplazarlo.',
    hojas: [{ nombre: 'Datos solicitados', columnas: ['Archivo', 'Tipo', 'Idioma', 'Número', 'Fecha', 'Emisor', 'Total', 'Moneda', 'Por revisar'], tipos: ['texto', 'texto', 'texto', 'codigo', 'fecha', 'texto', 'dinero', 'texto', 'texto'], nTotales: 1, filas: [
      ['factura-2031.pdf', 'Factura', 'Español', 'FE-2031', '2026-08-14', 'Suministros Médicos Andinos S.A.S.', 1428000, 'COP', ''],
      ['factura-0457.pdf', 'Factura', 'Español', 'FV-0457', '2026-08-20', 'Ferretería El Tornillo Ltda.', 700000, 'COP', ''],
      ['remision-88.pdf', 'Remisión', 'Español', 'R-88', '2026-08-21', 'Suministros Médicos Andinos S.A.S.', '', '', 'Total, Moneda'],
      ['tesis-maestria.pdf', 'Tesis', 'Español', '', '2025-11', 'Universidad Nacional de Colombia', '', '', 'Número, Total, Moneda'],
      ['', 'TOTAL COP', '', '', '', '', { t: 'n', v: 2128000 }, '', '']] }]
  };
  const EJEMPLO_CONTADORES = {
    titulo: 'Ejemplo: 4 facturas electrónicas', cifras: [[4, 'documentos'], [3, 'facturas'], [1, 'nota crédito'], ['COP 11.418.220', 'total neto']],
    resumen: 'Así se ve un resultado: el libro de compras con cada factura en una fila, las notas crédito en negativo y los totales al final. También salen las hojas «Por proveedor» e «Impuestos». Sube tus ZIP o XML para reemplazarlo.',
    hojas: [{ nombre: 'Libro de compras', columnas: ['Fecha', 'Tipo', 'Número', 'NIT emisor', 'Emisor', 'Subtotal', 'IVA', 'ReteFuente', 'Total a pagar', 'Moneda', 'Fuente'], tipos: ['fecha', 'texto', 'codigo', 'nit', 'texto', 'dinero', 'dinero', 'dinero', 'dinero', 'texto', 'texto'], nTotales: 1, filas: [
      ['2026-08-09', 'Factura electrónica de venta', 'FC55410', '811045678-9', 'Ferretería La Campana S.A.S.', 1467000, 189130, 36675, 1656130, 'COP', 'XML DIAN (exacto)'],
      ['2026-08-16', 'Nota crédito', 'NC120', '811045678-9', 'Ferretería La Campana S.A.S.', -49000, -9310, 0, -58310, 'COP', 'XML DIAN (exacto)'],
      ['2026-08-25', 'Factura electrónica de venta', 'SETA3310', '901111222-3', 'Soluciones Tecnológicas Andinas S.A.S.', 3160000, 600400, 126400, 3610400, 'COP', 'XML DIAN (exacto)'],
      ['2026-09-02', 'Factura electrónica de venta', 'TA877', '800222333-5', 'Transportes Andinos Ltda.', 6210000, 0, 62100, 6210000, 'COP', 'PDF (revisar)'],
      ['', 'TOTAL COP', '', '', '', { t: 'n', v: 10788000 }, { t: 'n', v: 780220 }, { t: 'n', v: 225175 }, { t: 'n', v: 11418220 }, '', '']] }]
  };
  function mostrar(datos) {
    libro = datos; esEjemplo = false; hojaActiva = Math.min(1, datos.hojas.length - 1); pintar();
    if (matchMedia('(max-width: 960px)').matches) $('.libro').scrollIntoView({ behavior: 'smooth', block: 'start' });   // en celular el resultado queda debajo
  }
  const valorCelda = v => (v && typeof v === 'object') ? v.v : v;
  function pintar() {
    $('#titulo').innerHTML = esc(libro.titulo) + (esEjemplo ? '<span class="chip">Ejemplo</span>' : '');
    $('#cifras').innerHTML = libro.cifras.map(([n, t]) => `<span class="cifra"><b>${esc(typeof n === 'number' ? n.toLocaleString('es-CO') : n)}</b>${esc(t)}</span>`).join('');
    $('#resumen').textContent = libro.resumen;
    const h = libro.hojas[hojaActiva];
    const ancho = Math.max(h.columnas.length, ...h.filas.slice(0, 1000).map(f => f.length));
    const cols = Array.from({ length: ancho }, (_, i) => h.columnas[i] ?? '');
    const iRev = h.columnas.indexOf('Por revisar');
    const n = h.filas.length, nt = h.nTotales || 0;
    const celda = (v, i, j) => {
      v = valorCelda(v);
      const falta = iRev >= 0 && (v === '' || v == null) && j > 2 && j < iRev - 1 && i < n - nt;
      return `<td class="${typeof v === 'number' ? 'num' : ''}${falta ? ' falta' : ''}" title="${esc(v ?? '')}">${esc(typeof v === 'number' ? fmtNum(v) : v ?? '')}</td>`;
    };
    // Como en Excel: letras de columna arriba y los encabezados en la fila 1 (los números coinciden con el archivo descargado)
    $('#tablaCaja').innerHTML = `<table><thead><tr><th class="fila"></th>${cols.map((_, j) => `<th>${colLetra(j)}</th>`).join('')}</tr></thead><tbody><tr class="cab"><th class="fila">1</th>${cols.map(c => `<td title="${esc(c)}">${esc(c)}</td>`).join('')}</tr>${
      h.filas.slice(0, 1000).map((f, i) => `<tr class="${i >= n - nt ? 'total' : ''}"><th class="fila">${i + 2}</th>${cols.map((_, j) => celda(f[j] ?? '', i, j)).join('')}</tr>`).join('')
    }</tbody></table>${n > 1000 ? `<p class="vacio">Vista previa de 1.000 de ${n.toLocaleString('es-CO')} filas. El Excel las incluye todas.</p>` : ''}`;
    $('#pestanas').innerHTML = libro.hojas.map((x, i) =>
      `<button role="tab" aria-selected="${i === hojaActiva}" data-i="${i}">${esc(x.nombre)} · ${x.nombre === 'Tablas' ? x.filas.filter(f => f.length === 1).length : x.filas.length - (x.nTotales || 0)}</button>`).join('');
  }
  $('#pestanas').onclick = e => { const b = e.target.closest('button'); if (b) { hojaActiva = +b.dataset.i; pintar(); } };

  // =====================================================================
  // Exportar
  // =====================================================================
  $('#descargar').onclick = () => {
    const wb = XLSX.utils.book_new();
    for (const h of libro.hojas) {
      const filas = [h.columnas, ...h.filas, ...(h.pie || [])];
      const hoja = XLSX.utils.aoa_to_sheet(filas);
      const ancho = Math.max(...filas.slice(0, 2000).map(f => f.length));
      hoja['!cols'] = Array.from({ length: ancho }, (_, j) => ({
        wch: Math.min(j === h.columnas.indexOf('Resumen') ? 90 : 50, Math.max(8, ...[h.columnas[j], ...h.filas.slice(0, 300).map(f => valorCelda(f[j]))].map(v => String(v ?? '').length + 2)))
      }));
      // Formato numérico para las columnas de dinero
      (h.tipos || []).forEach((t, j) => {
        if (t !== 'dinero') return;
        for (let r = 1; r <= h.filas.length; r++) { const c = hoja[colLetra(j) + (r + 1)]; if (c && c.t === 'n') c.z = '#,##0.00'; }
      });
      if (h.nombre !== 'Tablas' && h.filas.length) hoja['!autofilter'] = { ref: `A1:${colLetra(h.columnas.length - 1)}${h.filas.length + 1 - (h.nTotales || 0)}` };
      XLSX.utils.book_append_sheet(wb, hoja, h.nombre.replace(/[\[\]:*?/\\]/g, ' ').slice(0, 31));
    }
    const nombre = archivos.length === 1 ? archivos[0].nombre.replace(/\.pdf$/i, '') : `documentos-${new Date().toISOString().slice(0, 10)}`;
    XLSX.writeFile(wb, nombre.replace(/[\\/:*?"<>|]/g, '').trim() + '.xlsx');
  };
  $('#copiar').onclick = async () => {
    const h = libro.hojas[hojaActiva];
    const tsv = [h.columnas, ...h.filas].map(f => f.map(v => String(valorCelda(v) ?? '').replace(/[\t\n]/g, ' ')).join('\t')).join('\n');
    try { await navigator.clipboard.writeText(tsv); estado(`Hoja «${h.nombre}» copiada. Pégala en Excel o Google Sheets.`, 'ok'); }
    catch { estado('El navegador no permitió copiar. Descarga el Excel en su lugar.', 'error'); }
  };

  if (/[?&]debug\b/.test(location.search)) window.__motor = { leerImagen, leerWord, analizar, armarLineas, porColumnas, piezasTexto, tituloInfo, autorDoc, emisorDoc, institucionDoc, clasificar, buscarCon, CAMPOS, TIPOS, dineroDe, fechaDe };
  libro = MODO === 'contadores' ? EJEMPLO_CONTADORES : EJEMPLO; hojaActiva = 0; pintar(); ocupado(false);
})();
