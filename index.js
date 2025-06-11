const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const compression = require('compression');
const NodeCache = require('node-cache');
const db = require('./fire'); // Tu inicialización de Firestore

const {
  collection,
  getDocs,
  query,
  orderBy,
  where,
  addDoc,
  limit,
  Timestamp // Importante para consultas de fecha
} = require('firebase/firestore');

const app = express();
const PORT = process.env.PORT || 5000;

// Caché con TTL de 5 minutos (300 segundos)
const cache = new NodeCache({ stdTTL: 300 });

// --- Middleware ---
app.use(cors());
app.use(compression({ level: 6 })); // Comprime respuestas para mejor rendimiento
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// Middleware de Cache-Control para el navegador
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'public, max-age=300'); // El navegador puede cachear por 5 min
  next();
});

// --- Rutas ---

// Documentación en la raíz
app.get('/', (req, res) => {
  res.send(
    `<h1>API Express & Firebase Monitoreo ESP32</h1><ul>
      <li><b>GET /ver</b> - Ver todos los valores (filtros: distancia, desde, limit)</li>
      <li><b>GET /valor</b> - Todos los valores (limitados)</li>
      <li><b>GET /valor/min</b> - Valores con respuesta mínima</li>
      <li><b>GET /estado</b> - Estados de conexión (limit)</li>
      <li><b>POST /insertar</b> - {distancia, nombre, fecha}</li>
      <li><b>POST /estado</b> - {conectado, nombre}</li>
      <li><b>POST /notificar</b> - {titulo, mensaje, token}</li>
    </ul>`
  );
});

// === GET /ver CON LÓGICA DE FILTROS MEJORADA ===
app.get('/ver', async (req, res) => {
  try {
    const { distancia, desde, limit: limStr = '100' } = req.query;
    const lim = parseInt(limStr, 10) || 100; // Asegurarse de que sea un número

    // Clave de caché única para esta combinación de filtros
    const cacheKey = `ver_${distancia || 'all'}_${desde || 'none'}_${lim}`;
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.send(cachedData);
    }

    // --- Lógica de consulta a Firestore refactorizada ---
    const valoresCollection = collection(db, 'Valores');
    const queryConstraints = [orderBy('fecha', 'desc'), limit(lim)]; // Empezar con orden y límite

    // 1. Añadir filtro de 'distancia' si se proporciona y no es 'Todos'
    if (distancia && distancia !== 'Todos') {
      queryConstraints.push(where('distancia', '==', distancia));
    }

    // 2. Añadir filtro de 'fecha' si se proporciona
    if (desde) {
      // Asumimos que 'desde' es un string en formato ISO 8601
      queryConstraints.push(where('fecha', '>=', desde));
    }
    
    // NOTA: Para que una consulta con `where` en un campo y `orderBy` en otro funcione,
    // Firestore requiere un índice compuesto. Si no existe, Firebase te dará un error
    // en los logs con un enlace para crearlo con un solo clic.

    // 3. Construir la consulta final con todas las restricciones
    const finalQuery = query(valoresCollection, ...queryConstraints);

    const snapshot = await getDocs(finalQuery);
    const data = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data() // 'fecha' ya está incluida aquí
    }));

    cache.set(cacheKey, data);
    res.send(data);

  } catch (error) {
    console.error('Error en /ver:', error);
    res.status(500).send({ error: 'Error al obtener los registros', message: error.message });
  }
});


// GET /valor con paginación
app.get('/valor', async (req, res) => {
  try {
    const lim = parseInt(req.query.limit, 10) || 100;
    const cacheKey = `valor_${lim}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.send(cached);

    const q = query(collection(db, 'Valores'), orderBy('fecha', 'desc'), limit(lim));
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    cache.set(cacheKey, data);
    res.send(data);
  } catch (error) {
    console.error('Error en /valor:', error);
    res.status(500).send({ error: 'Error al obtener valores', message: error.message });
  }
});

// GET /valor/min (respuesta mínima)
app.get('/valor/min', async (req, res) => {
  try {
    const lim = parseInt(req.query.limit, 10) || 50;
    const q = query(collection(db, 'Valores'), orderBy('fecha', 'desc'), limit(lim));
    const snapshot = await getDocs(q);
    // Este endpoint no se cachea porque parece ser para un propósito específico y ligero
    const data = snapshot.docs.map(doc => ({
      d: doc.data().distancia,
      f: doc.data().fecha
    }));
    res.send(data);
  } catch (error) {
    res.status(500).send({ error: 'Error en /valor/min', message: error.message });
  }
});


// GET /estado con límite
app.get('/estado', async (req, res) => {
  try {
    const lim = parseInt(req.query.limit) || 100;
    const cacheKey = `estado_${lim}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.send(cached);

    const q = query(collection(db, 'Estado'), orderBy('fecha', 'desc'), limit(lim));
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    cache.set(cacheKey, data);
    res.send(data);
  } catch (error) {
    res.status(500).send({ error: 'Error al obtener estados', message: error.message });
  }
});


// --- Rutas POST ---

// POST /insertar valor
app.post('/insertar', async (req, res) => {
  try {
    const { distancia, nombre, fecha } = req.body;
    if (!distancia || !nombre) {
      return res.status(400).send({ error: 'Faltan parámetros', message: 'distancia y nombre son requeridos' });
    }

    const docData = {
      distancia,
      nombre,
      // Usar la fecha proporcionada o crear una nueva en formato ISO
      fecha: fecha || new Date().toISOString()
    };

    const docRef = await addDoc(collection(db, 'Valores'), docData);

    // === MEJORA DE CACHÉ ===
    // Invalida TODA la caché para asegurar que los nuevos datos se muestren en todas las consultas.
    // Es la estrategia más simple y segura.
    cache.flushAll();
    console.log('Caché de valores invalidada por nueva inserción.');

    res.status(201).send({ id: docRef.id, ...docData, status: 'Valores insertados' });
  } catch (error) {
    res.status(500).send({ error: 'Error en /insertar', message: error.message });
  }
});

// POST /estado
app.post('/estado', async (req, res) => {
  try {
    const { conectado, nombre } = req.body;
    if (conectado === undefined || !nombre) {
      return res.status(400).send({ error: 'Faltan parámetros', message: 'conectado y nombre son requeridos' });
    }

    const docData = {
      conectado: String(conectado).toLowerCase() === 'true', // Conversión robusta a booleano
      nombre,
      fecha: new Date().toISOString()
    };

    const docRef = await addDoc(collection(db, 'Estado'), docData);
    
    // Invalida la caché de estados
    cache.flushAll(); // O podrías tener prefijos para borrar solo la de 'estado'
    console.log('Caché de estado invalidada por nueva inserción.');

    res.status(201).send({ id: docRef.id, ...docData, status: 'Estado actualizado' });
  } catch (error) {
    res.status(500).send({ error: 'Error en /estado', message: error.message });
  }
});

// POST /notificar (solo estructura)
app.post('/notificar', (req, res) => {
  const { titulo, mensaje, token } = req.body;
  if (!titulo || !mensaje || !token) {
    return res.status(400).send({ error: 'Faltan parámetros', message: 'titulo, mensaje y token son requeridos' });
  }
  // Aquí iría la lógica para enviar notificaciones con Firebase Cloud Messaging (FCM)
  console.log(`Simulando envío de notificación a ${token}: ${titulo}`);
  res.status(200).send({ status: 'Notificación enviada (simulada)' });
});

// --- Iniciar Servidor ---
app.listen(PORT, () => {
  console.log(`🚀 API lista en http://localhost:${PORT}`);
});