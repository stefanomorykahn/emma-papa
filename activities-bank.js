/* ============================================================
   activities-bank.js  ·  Banco de actividades personalizado de Emma
   ------------------------------------------------------------
   Actividades reales pensadas para Emma (videollamada, casa,
   post-colegio, natación, fe) + reglas de recomendación.
   EmmaBank.recommend(context, profile) elige 3 según lugar,
   tiempo, estado y objetivo. Lo usa "¿Qué hacemos hoy?" sin IA.
   ============================================================ */
const EmmaBank = (function () {
  const BANK = [
    // --- Videollamada ---
    { id:'video_cancion_abejita', title:'Cantar La abejita por videollamada', context:['videollamada'], category:'música', duration_minutes:5,
      objective:'conexión', why_for_emma:'Le gusta que le canten y La abejita es de sus favoritas.', materials:['celular'],
      steps:['Saludarla por su nombre.','Cantar La abejita con gestos de la mano.','Hacer pausas para que reaccione.','Repetir si sonríe o pide más.'],
      safety_note:'Videollamada breve, no pantalla prolongada.', tags:['videollamada','canción','vínculo','la abejita'],
      save_as_entry:{activity:'cantar La abejita por videollamada', category:'música'} },
    { id:'video_caras_escondidas', title:'Caras y escondidas en cámara', context:['videollamada'], category:'juego', duration_minutes:5,
      objective:'conexión', why_for_emma:'Le gustan las escondidas y es muy sonriente.', materials:['celular'],
      steps:['Taparse la cara con la mano.','Decir: ¿dónde está papá?','Aparecer sonriendo.','Hacer una cara graciosa.','Dejar que Emma imite o se ría.'],
      safety_note:'No alargar si se distrae o se cansa.', tags:['videollamada','escondidas','juego'],
      save_as_entry:{activity:'escondidas por videollamada', category:'juego'} },
    { id:'video_cuento_animales', title:'Cuento corto de animales', context:['videollamada'], category:'lenguaje', duration_minutes:7,
      objective:'lenguaje', why_for_emma:'Le gustan los animales y que le lean. Evitar perros por ahora.', materials:['cuento','imágenes de animales'],
      steps:['Elegir 3 animales que no sean perros.','Mostrar o nombrar cada animal.','Hacer su sonido.','Preguntar: ¿dónde está el gato?','Celebrar si señala o repite.'],
      safety_note:'Evitar insistir con perros si se incomoda.', tags:['videollamada','lenguaje','animales','lectura'],
      save_as_entry:{activity:'cuento de animales por videollamada', category:'lenguaje'} },
    { id:'video_baile_onibus', title:'Baile de As Rodas do Ônibus', context:['videollamada'], category:'música', duration_minutes:5,
      objective:'movimiento', why_for_emma:'Le gusta bailar y esta canción.', materials:['voz','celular'],
      steps:['Cantar la canción.','Hacer ruedas con las manos.','Mover hombros o palmas.','Dejar que Emma copie el gesto.'],
      safety_note:'Mantenerlo corto y observar interés.', tags:['videollamada','baile','música','portugués'],
      save_as_entry:{activity:'baile As Rodas do Ônibus', category:'música'} },
    // --- Casa / departamento ---
    { id:'depa_cocinilla_frejol', title:'Cocinilla con frejol imaginario', context:['casa','departamento'], category:'juego simbólico', duration_minutes:15,
      objective:'creatividad', why_for_emma:'Le gusta jugar a la cocinilla y le gusta el frejol.', materials:['ollita','cuchara','platito'],
      steps:['Decir: vamos a cocinar frejol.','Mezclar con una cucharita.','Servir en un platito.','Preguntar: ¿está rico?'],
      safety_note:'Si usas frejoles reales, supervisar por atragantamiento.', tags:['cocinilla','frejol','juego'],
      save_as_entry:{activity:'cocinilla con frejol', category:'juego simbólico'} },
    { id:'depa_colorear_frutas', title:'Colorear granadilla y guayaba', context:['casa','departamento'], category:'creatividad', duration_minutes:10,
      objective:'creatividad', why_for_emma:'Le gusta colorear y le gustan la granadilla y la guayaba.', materials:['hoja','crayones gruesos'],
      steps:['Dibujar una granadilla o guayaba simple.','Decir el nombre de la fruta.','Dejar que Emma escoja el color.','No corregir si se sale de la línea.'],
      safety_note:'Crayones adecuados para su edad.', tags:['colorear','frutas','granadilla','guayaba'],
      save_as_entry:{activity:'colorear frutas', category:'creatividad'} },
    { id:'depa_escondidas', title:'Escondidas suaves', context:['casa','departamento'], category:'juego', duration_minutes:10,
      objective:'conexión', why_for_emma:'Le gusta jugar a las escondidas y es activa.', materials:['manta','sillón'],
      steps:['Esconderse parcialmente.','Decir: ¿dónde está papá?','Aparecer rápido para no asustarla.','Luego esconder un juguete y que lo busque.'],
      safety_note:'Evitar escaleras, puertas o bordes duros.', tags:['escondidas','juego activo'],
      save_as_entry:{activity:'escondidas suaves', category:'juego'} },
    { id:'depa_hacer_el_4', title:'Practicar el 4', context:['casa','departamento'], category:'motricidad', duration_minutes:5,
      objective:'movimiento', why_for_emma:'Le gusta hacer el 4 con su piernita y sostenerse.', materials:['espacio seguro'],
      steps:['Pararse frente a Emma.','Mostrar el movimiento.','Contar 1, 2, 3 mientras se sostiene.','Celebrar el intento.'],
      safety_note:'Lejos de esquinas, escaleras u objetos duros.', tags:['motricidad','equilibrio','el 4'],
      save_as_entry:{activity:'hacer el 4', category:'motricidad'} },
    { id:'depa_baile_libre', title:'Baile libre con palmas', context:['casa','departamento'], category:'movimiento', duration_minutes:7,
      objective:'movimiento', why_for_emma:'Es activa, sonriente y le gusta bailar.', materials:['voz o música'],
      steps:['Poner una canción que le guste.','Aplaudir el ritmo.','Hacer pasos simples.','Copiar uno de sus movimientos.'],
      safety_note:'Evitar pisos resbalosos.', tags:['baile','movimiento'],
      save_as_entry:{activity:'baile libre', category:'movimiento'} },
    // --- Después del colegio ---
    { id:'post_cole_merienda', title:'Merienda y observar qué acepta', context:['después del colegio'], category:'alimentación', duration_minutes:15,
      objective:'comida', why_for_emma:'Sirve para aprender qué acepta cuando está cansada.', materials:['fruta o merienda segura'],
      steps:['Ofrecer algo conocido: granadilla, guayaba, plátano o yogur.','Observar si acepta, rechaza o pide más.','No presionar.','Registrar comida y reacción.'],
      safety_note:'Trozos seguros para su edad.', tags:['colegio','merienda','alimentación','rutina'],
      save_as_entry:{activity:'merienda después del colegio', category:'alimentación'} },
    { id:'post_cole_transicion', title:'Transición suave después del colegio', context:['después del colegio'], category:'calma', duration_minutes:10,
      objective:'calma', why_for_emma:'Después del colegio puede estar cansada o sobreestimulada.', materials:['voz','cuento corto'],
      steps:['Saludarla con calma.','Preguntar: ¿quieres canción o cuento?','Cantar La abejita o leer algo corto.','Observar su energía antes de algo activo.'],
      safety_note:'No sobrecargarla si está muy cansada.', tags:['colegio','calma','rutina'],
      save_as_entry:{activity:'transición después del colegio', category:'calma'} },
    // --- Natación / agua ---
    { id:'natacion_vasitos', title:'Juego de vasitos con agua', context:['casa','baño','pre natación','natación'], category:'agua', duration_minutes:10,
      objective:'movimiento', why_for_emma:'La acerca al agua sin presión (quieres meterla a natación).', materials:['vasitos','recipiente con poca agua','toalla'],
      steps:['Poner poca agua en un recipiente.','Pasar agua de un vaso a otro.','Decir: agua, lleno, vacío.','Parar si se incomoda.'],
      safety_note:'Supervisión total. Nunca dejarla sola cerca del agua.', tags:['agua','natación','sensorial'],
      save_as_entry:{activity:'vasitos con agua', category:'agua'} },
    // --- Fe / gratitud ---
    { id:'fe_gracias', title:'Gracias Dios por Emma', context:['casa','noche','videollamada'], category:'fe', duration_minutes:2,
      objective:'fe', why_for_emma:'Acercarla a Dios de forma sencilla y amorosa.', materials:[],
      steps:['Tomar un momento tranquilo.','Decir: Gracias Dios por Emma y por este día.','Mantenerlo corto.','No obligarla a repetir.'],
      safety_note:'La fe desde el amor, no desde el miedo.', tags:['fe','gratitud','noche'],
      save_as_entry:{activity:'oración corta de gratitud', category:'fe'} },
    { id:'fe_cancion', title:'Canción suave de fe', context:['casa','noche'], category:'fe', duration_minutes:5,
      objective:'calma', why_for_emma:'Le gusta que le canten y conoce Cuando hundido estás.', materials:['voz'],
      steps:['Cantar en voz baja.','Contacto visual suave.','Abrazo si ella quiere.'],
      safety_note:'No forzar contacto físico si no quiere.', tags:['fe','música','calma'],
      save_as_entry:{activity:'cantar canción de fe', category:'fe'} }
  ];

  function norm(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');}

  // Traduce el chip de lugar a etiquetas de contexto del banco
  function lugarTags(l){
    const n=norm(l);
    if(n.includes('video')) return ['videollamada'];
    if(n.includes('colegio')) return ['después del colegio','casa'];
    if(n.includes('natacion')||n.includes('agua')) return ['natación','pre natación','baño'];
    if(n.includes('carro')||n.includes('restaurante')) return ['casa','noche'];
    if(n.includes('casa')||n.includes('depa')) return ['casa','departamento'];
    return [];
  }
  function objetivoTags(o){
    const n=norm(o);
    if(n.includes('lenguaje')) return ['lenguaje'];
    if(n.includes('movim')) return ['movimiento','baile','motricidad','agua'];
    if(n.includes('creativ')) return ['creatividad','colorear','juego simbólico'];
    if(n.includes('comida')||n.includes('rutina')) return ['alimentación','merienda','rutina'];
    if(n.includes('calma')) return ['calma','fe'];
    if(n.includes('fe')||n.includes('oracion')) return ['fe'];
    if(n.includes('conexion')||n.includes('jugar')) return ['juego','vínculo','conexión','música'];
    return [];
  }
  function estadoTags(e){
    const n=norm(e);
    if(n.includes('cansada')||n.includes('irritable')||n.includes('sensible')) return ['calma','fe','lenguaje'];
    if(n.includes('activa')||n.includes('juguetona')||n.includes('feliz')||n.includes('curiosa')) return ['movimiento','baile','juego','motricidad'];
    return [];
  }

  function recommend(context, profile){
    context=context||{};
    const cTags=lugarTags(context.lugar);
    const oTags=objetivoTags(context.objetivo);
    const eTags=estadoTags(context.estado);
    const tiempo=parseInt(context.tiempo)||99;

    const scored=BANK.map(a=>{
      const texto=norm([a.category,a.objective,a.title].join(' ')+' '+(a.tags||[]).join(' '));
      let score=0;
      if(cTags.length && a.context.some(x=>cTags.includes(x))) score+=3;
      else if(cTags.length) score-=1; // no encaja con el lugar
      if(oTags.some(t=>texto.includes(norm(t)))) score+=2;
      if(eTags.some(t=>texto.includes(norm(t)))) score+=1;
      if(a.duration_minutes<=tiempo) score+=1; else score-=1;
      score+=0.1; // base
      return {a,score};
    }).sort((x,y)=>y.score-x.score);

    return scored.slice(0,3).map(({a})=>({
      title:a.title, reason:a.why_for_emma, duration_minutes:a.duration_minutes, goal:a.objective,
      materials:a.materials, steps:a.steps, why_for_emma:a.why_for_emma, safety_note:a.safety_note,
      save_as_entry:a.save_as_entry
    }));
  }

  // Salidas / paseos en Lima para Emma (checklist "To Do").
  // NOTA: confirmar horarios/precios antes de ir (pueden variar).
  const LIMA_TODO = [
    {id:'leyendas', title:'Parque de las Leyendas', zona:'San Miguel', dir:'Av. Parque de las Leyendas 580, San Miguel', horario:'Lun–Dom 9:00–17:00', precio:'General S/18 · Niños 3–12 S/10 · menores de 3 gratis', hacer:'Ver animales (lobos marinos, pingüinos, aves), acuario, zonas arqueológicas y jardines. Caminar.', tip:'Ir temprano; agua, gorro y coche.', tags:['animales','zoológico','acuario']},
    {id:'huachipa', title:'Zoológico de Huachipa', zona:'Ate', dir:'Av. Las Torres s/n, Ate', horario:'Lun–Dom 9:00–17:30 (365 días)', precio:'Ver zoohuachipa.com.pe', hacer:'Gran variedad de animales, aves y mariposario.', tip:'Mucha caminata; usa coche y protector solar.', tags:['animales','zoológico']},
    {id:'nautilus', title:'Acuario Nautilus', zona:'Comas', dir:'Av. Universitaria cdra. 99 (ex fundo Chacra Cerro), Comas', horario:'Lun–Dom 10:00–17:00', precio:'S/24 · menores de 5 gratis', hacer:'Peces tropicales, tiburones y corales de cerca. Techado (bueno con garúa).', tip:'Queda en Lima Norte; considera la distancia.', tags:['acuario','animales','techado']},
    {id:'granjavilla', title:'Granja Villa', zona:'Chorrillos', dir:'Av. Alameda del Premio Real 397, Chorrillos', horario:'Todos los días 10:00–18:00', precio:'S/85 (juegos, granja, aves, dinosaurios, zona acuática)', hacer:'Interactuar con animales de granja, juegos mecánicos, dinos y agua.', tip:'No forzar contacto con animales; lleva muda.', tags:['granja','animales','juegos']},
    {id:'circuitoagua', title:'Circuito Mágico del Agua', zona:'Cercado de Lima', dir:'Jr. Madre de Dios s/n, Parque de la Reserva, Cercado de Lima', horario:'Lun–Dom 15:00–22:00 (shows 19:15/20:15/21:10)', precio:'S/5 · menores de 5 gratis', hacer:'Fuentes interactivas para correr y mojarse; le gusta el agua.', tip:'Ir temprano; muda/toalla; supervisión total con el agua.', tags:['agua','parque']},
    {id:'openangamos', title:'Zona de juegos Open Plaza Angamos (Coney Park / City Toys)', zona:'Surquillo', dir:'Av. Angamos Este 1803 / Av. Tomás Marsano, Surquillo', horario:'Lun–Dom 9:00–22:00 (mall)', precio:'Por juego / tarjeta', hacer:'Juegos techados para niños; motricidad y energía. (Lo que llaman "Mundo Kids").', tip:'Vigilancia cercana; medias antideslizantes.', tags:['juego','techado','motricidad']},
    {id:'muralla', title:'Mini granja · Parque de la Muralla', zona:'Cercado de Lima', dir:'Jr. Ancash cdra. 3, junto al río Rímac, Cercado de Lima', horario:'Mar–Dom (de día) · confirmar', precio:'Ingreso libre / bajo', hacer:'Mini granja (conejos, patos) y espacio para caminar.', tip:'Corta y céntrica; buena primera salida a animales.', tags:['granja','animales','parque']},
    {id:'olivar', title:'Parque El Olivar', zona:'San Isidro', dir:'Calle La República / Av. Prescott, San Isidro', horario:'Abierto de día · ingreso libre', precio:'Gratis', hacer:'Sombra, patos y ardillas; caminar tranquilo.', tip:'Tranquilo y verde; salida corta.', tags:['parque','naturaleza']},
    {id:'kennedy', title:'Parque Kennedy', zona:'Miraflores', dir:'Av. Larco / Diagonal, Miraflores', horario:'Abierto de día · ingreso libre', precio:'Gratis', hacer:'Gatitos, palomas y espacio para correr; heladerías cerca.', tip:'Cuidado con el tráfico alrededor.', tags:['parque']},
    {id:'malecon', title:'Malecón de Miraflores', zona:'Miraflores', dir:'Malecón de la Reserva, Miraflores', horario:'Abierto · ingreso libre', precio:'Gratis', hacer:'Caminar viendo el mar, áreas verdes y juegos.', tip:'Lleva abrigo (viento del mar).', tags:['paseo','mar']},
    {id:'museoninos', title:'Museo de los Niños (interactivo)', zona:'Lima · confirmar sede', dir:'Confirmar en web', horario:'Confirmar horario', precio:'Confirmar', hacer:'Zonas sensoriales de ciencia y arte para explorar; techado.', tip:'Bueno para invierno/garúa. Busca zonas para pequeños.', tags:['museo','sensorial','techado']},
    {id:'playa', title:'Playa (Costa Verde)', zona:'Lima', dir:'Circuito de Playas Costa Verde', horario:'De día · temporada de verano', precio:'Gratis', hacer:'Arena y agua para explorar (sensorial).', tip:'Supervisión total; sombra y protector solar.', tags:['agua','playa']}
  ];

  return { BANK, LIMA_TODO, recommend };
})();
if (typeof window !== 'undefined') window.EmmaBank = EmmaBank;
