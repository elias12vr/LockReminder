const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const compression = require('compression');
const NodeCache = require('node-cache');
const db = require('./fire'); // Firestore ya inicializado

const {
  collection,
  getDocs,
  query,
  orderBy,
  where,
  addDoc,
  limit
} = require('firebase/firestore');

const app = express();
const PORT = process.env.PORT || 5000;
const cache = new NodeCache({ stdTTL: 300 }); // 5 minutos

// Middleware
app.use(cors());
app.use(compression({ level: 6 }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// Middleware de cache control
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  next();
});

// Documentación raíz
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

// GET /ver con filtros
app.get('/ver', async (req, res) => {
  try {
    const { distancia, desde, limit: lim = 100 } = req.query;
    const cacheKey = `ver_${distancia || 'all'}_${desde || 'none'}_${lim}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.send(cached);

    let q = query(collection(db, 'Valores'), orderBy('fecha', 'asc'), limit(Number(lim)));

    if (distancia && distancia !== 'Todos') {
      q = query(q, where('distancia', '==', distancia), orderBy('fecha', 'asc'), limit(Number(lim)));
    }

    if (desde) {
      q = query(q, where('fecha', '>=', desde), orderBy('fecha', 'asc'), limit(Number(lim)));
    }

    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      fecha: doc.data().fecha
    }));

    cache.set(cacheKey, data);
    res.send(data);
  } catch (error) {
    console.error('Error en /ver:', error);
    res.status(500).send({ error: 'Error en /ver', message: error.message });
  }
});

// GET /valor con paginación
app.get('/valor', async (req, res) => {
  try {
    const lim = parseInt(req.query.limit) || 100;
    const cacheKey = `valor_${lim}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.send(cached);

    const q = query(collection(db, 'Valores'), orderBy('fecha', 'desc'), limit(lim));
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      fecha: doc.data().fecha
    }));

    cache.set(cacheKey, data);
    res.send(data);
  } catch (error) {
    console.error('Error en /valor:', error);
    res.status(500).send({ error: 'Error en /valor', message: error.message });
  }
});

// GET /valor/min (respuesta mínima)
app.get('/valor/min', async (req, res) => {
  try {
    const lim = parseInt(req.query.limit) || 50;
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
      ...doc.data(),
      fecha: doc.data().fecha
    }));

    cache.set(cacheKey, data);
    res.send(data);
  } catch (error) {
    res.status(500).send({ error: 'Error en /estado', message: error.message });
  }
});

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
      fecha: fecha || new Date().toISOString()
    };

    const docRef = await addDoc(collection(db, 'Valores'), docData);

    cache.del(['ver_all_all', 'valor_100']);
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
      conectado: conectado === 'true' || conectado === true,
      nombre,
      fecha: new Date().toISOString()
    };

    const docRef = await addDoc(collection(db, 'Estado'), docData);

    cache.del(['estado_100']);
    res.status(201).send({ id: docRef.id, ...docData, status: 'Estado actualizado' });
  } catch (error) {
    res.status(500).send({ error: 'Error en /estado', message: error.message });
  }
});

// POST /notificar (solo estructura)
app.post('/notificar', async (req, res) => {
  try {
    const { titulo, mensaje, token } = req.body;
    if (!titulo || !mensaje || !token) {
      return res.status(400).send({ error: 'Faltan parámetros', message: 'titulo, mensaje y token son requeridos' });
    }

    // Aquí deberías integrar Firebase Cloud Messaging
    res.status(201).send({ titulo, mensaje, token, status: 'Notificación enviada (simulada)' });
  } catch (error) {
    res.status(500).send({ error: 'Error en /notificar', message: error.message });
  }
});

// Servidor
app.listen(PORT, () => {
  console.log(`🚀 API lista en puerto ${PORT}`);
});
