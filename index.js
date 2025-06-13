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
  limit,
  addDoc
} = require('firebase/firestore');

const app = express();
const PORT = process.env.PORT || 5000;

// Caché con TTL de 5 minutos (300 segundos)
const cache = new NodeCache({ stdTTL: 300 });

// --- Middleware ---
app.use(cors());
app.use(compression({ level: 6 }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// Middleware Cache-Control para navegador
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  next();
});

// --- Rutas ---

// Documentación raíz
app.get('/', (req, res) => {
  res.send(
    `<h1>API Express & Firebase Monitoreo ESP32</h1><ul>
      <li><b>GET /ver</b> - Ver últimos 50 valores (sin filtros)</li>
      <li><b>GET /valor</b> - Todos los valores (limitados)</li>
      <li><b>GET /valor/min</b> - Valores con respuesta mínima</li>
      <li><b>GET /estado</b> - Estados de conexión (limit)</li>
      <li><b>POST /insertar</b> - {distancia, nombre, fecha}</li>
      <li><b>POST /estado</b> - {conectado, nombre}</li>
      <li><b>POST /notificar</b> - {titulo, mensaje, token}</li>
    </ul>`
  );
});

// GET /ver SIN FILTROS, últimos 50 datos
app.get('/ver', async (req, res) => {
  try {
    const lim = 50;
    const cacheKey = `ver_${lim}`;
    const cachedData = cache.get(cacheKey);
    if (cachedData) return res.send(cachedData);

    const valoresCollection = collection(db, 'Valores');
    const q = query(valoresCollection, orderBy('fecha', 'desc'), limit(lim));
    const snapshot = await getDocs(q);

    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    cache.set(cacheKey, data);
    res.send(data);
  } catch (error) {
    console.error('Error en /ver:', error);
    res.status(500).send({ error: 'Error al obtener registros', message: error.message });
  }
});

// GET /valor con límite configurable (máximo 1000)
app.get('/valor', async (req, res) => {
  try {
    let lim = parseInt(req.query.limit, 10) || 100;
    if (lim > 1000) lim = 1000;

    const cacheKey = `valor_${lim}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.send(cached);

    const q = query(collection(db, 'Valores'), orderBy('fecha', 'desc'), limit(lim));
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

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

    const data = snapshot.docs.map(doc => ({
      d: doc.data().distancia,
      f: doc.data().fecha
    }));

    res.send(data);
  } catch (error) {
    res.status(500).send({ error: 'Error en /valor/min', message: error.message });
  }
});

// GET /estado con límite configurable (máximo 1000)
app.get('/estado', async (req, res) => {
  try {
    let lim = parseInt(req.query.limit, 10) || 100;
    if (lim > 1000) lim = 1000;

    const cacheKey = `estado_${lim}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.send(cached);

    const q = query(collection(db, 'Estado'), orderBy('fecha', 'desc'), limit(lim));
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    cache.set(cacheKey, data);
    res.send(data);
  } catch (error) {
    res.status(500).send({ error: 'Error al obtener estados', message: error.message });
  }
});

// POST /insertar valor
app.post('/insertar', async (req, res) => {
  try {
    const { distancia, nombre, fecha } = req.body;
    if (!distancia || !nombre) {
      return res.status(400).send({ error: 'Faltan parámetros', message: 'distancia y nombre son requeridos' });
    }

    // Validar formato de fecha ISO 8601 con 'Z'
    let fechaFinal;
    const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
    if (fecha && isoDateRegex.test(fecha)) {
      fechaFinal = fecha;
    } else {
      console.warn(`Fecha inválida o ausente: ${fecha}. Usando fecha actual.`);
      fechaFinal = new Date().toISOString();
    }

    const docData = {
      distancia,
      nombre,
      fecha: fechaFinal
    };

    const docRef = await addDoc(collection(db, 'Valores'), docData);

    cache.flushAll();
    console.log('Caché de valores invalidada por nueva inserción.');

    res.status(201).send({ ...docData, status: 'Valores insertados' });
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
      conectado: String(conectado).toLowerCase() === 'true',
      nombre,
      fecha: new Date().toISOString()
    };

    const docRef = await addDoc(collection(db, 'Estado'), docData);

    cache.flushAll();
    console.log('Caché de estado invalidada por nueva inserción.');

    res.status(201).send({ id: docRef.id, ...docData, status: 'Estado actualizado' });
  } catch (error) {
    res.status(500).send({ error: 'Error en /estado', message: error.message });
  }
});

// POST /notificar (estructura base)
app.post('/notificar', (req, res) => {
  const { titulo, mensaje, token } = req.body;
  if (!titulo || !mensaje || !token) {
    return res.status(400).send({ error: 'Faltan parámetros', message: 'titulo, mensaje y token son requeridos' });
  }
  // Aquí iría la lógica para enviar la notificación vía FCM
  console.log(`Simulando envío de notificación a ${token}: ${titulo}`);
  res.status(200).send({ status: 'Notificación enviada (simulada)' });
});

// --- Iniciar servidor ---
app.listen(PORT, () => {
  console.log(`🚀 API lista en http://localhost:${PORT}`);
});