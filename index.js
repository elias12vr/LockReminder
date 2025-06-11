const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const compression = require('compression');
const NodeCache = require('node-cache');
const db = require('./fire'); // Instancia de Firestore

const {
  collection,
  getDocs,
  query,
  orderBy,
  where,
  addDoc
} = require('firebase/firestore');

const app = express();
const PORT = process.env.PORT || 5000;
const cache = new NodeCache({ stdTTL: 300 }); // Caché de 5 minutos

// Middleware
app.use(cors());
app.use(compression());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// Endpoint raíz con documentación
app.get('/', (req, res) => {
  res.send(
    '<h1>API Express & Firebase Monitoreo ESP32</h1><ul>' +
    '<li><p><b>GET /ver</b> - Ver todos los valores (parámetro opcional: distancia)</p></li>' +
    '<li><p><b>GET /valor</b> - Todos los valores ordenados por fecha</p></li>' +
    '<li><p><b>GET /estado</b> - Todos los estados de conexión ordenados por fecha</p></li>' +
    '<li><p><b>POST /insertar</b> - {distancia, nombre, fecha}</p></li>' +
    '<li><p><b>POST /estado</b> - {conectado, nombre}</p></li>' +
    '<li><p><b>POST /notificar</b> - {titulo, mensaje, token}</p></li>' +
    '</ul>'
  );
});

// Endpoint para ver todos los valores sin límite ni paginación
app.get('/ver', async (req, res) => {
  try {
    const distancia = req.query.distancia;

    // Clave para caché (solo distancia)
    const cacheKey = `ver_all_${distancia || 'all'}`;
    const cachedData = cache.get(cacheKey);
    if (cachedData) return res.send(cachedData);

    let q = query(collection(db, 'Valores'), orderBy('fecha', 'asc'));

    if (distancia && distancia !== 'Todos') {
      q = query(q, where('distancia', '==', distancia));
    }

    // Traer todos sin límite ni paginación
    const snapshot = await getDocs(q);

    const data = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      fecha: doc.data().fecha
    }));

    cache.set(cacheKey, data);
    res.send(data);
  } catch (error) {
    console.error('Error al obtener valores:', error);
    res.status(500).send({
      error: 'Error al obtener valores',
      message: error.message || 'Error desconocido',
      code: error.code || 'UNKNOWN'
    });
  }
});

// Endpoint para obtener todos los valores (sin límite)
app.get('/valor', async (req, res) => {
  try {
    const cacheKey = 'todos_valores';
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.send(cachedData);
    }

    const q = query(collection(db, 'Valores'), orderBy('fecha', 'desc'));
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      fecha: doc.data().fecha
    }));

    cache.set(cacheKey, data);
    res.send(data);
  } catch (error) {
    console.error('Error al obtener valores:', error);
    res.status(500).send({
      error: 'Error al obtener valores',
      message: error.message || 'Error desconocido',
      code: error.code || 'UNKNOWN'
    });
  }
});

// Endpoint para obtener todos los estados (sin límite)
app.get('/estado', async (req, res) => {
  try {
    const cacheKey = 'todos_estados';
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.send(cachedData);
    }

    const q = query(collection(db, 'Estado'), orderBy('fecha', 'desc'));
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      fecha: doc.data().fecha
    }));

    cache.set(cacheKey, data);
    res.send(data);
  } catch (error) {
    console.error('Error al obtener estados:', error);
    res.status(500).send({
      error: 'Error al obtener estados',
      message: error.message || 'Error desconocido',
      code: error.code || 'UNKNOWN'
    });
  }
});

// Endpoint para insertar valores
app.post('/insertar', async (req, res) => {
  try {
    const { distancia, nombre, fecha } = req.body;

    if (!distancia || !nombre) {
      return res.status(400).send({
        error: 'Faltan parámetros',
        message: 'Se requieren distancia y nombre'
      });
    }

    const docData = {
      distancia,
      nombre,
      fecha: fecha || new Date().toISOString()
    };

    const docRef = await addDoc(collection(db, 'Valores'), docData);

    cache.flushAll();

    res.status(201).send({
      id: docRef.id,
      ...docData,
      status: 'Valores insertados!'
    });
  } catch (error) {
    console.error('Error al insertar valores:', error);
    res.status(500).send({
      error: 'Error al insertar valores',
      message: error.message || 'Error desconocido',
      code: error.code || 'UNKNOWN'
    });
  }
});

// Endpoint para actualizar estado
app.post('/estado', async (req, res) => {
  try {
    const { conectado, nombre } = req.body;

    if (conectado === undefined || !nombre) {
      return res.status(400).send({
        error: 'Faltan parámetros',
        message: 'Se requieren conectado y nombre'
      });
    }

    const docData = {
      conectado: conectado === 'true' || conectado === true,
      nombre,
      fecha: new Date().toISOString()
    };

    const docRef = await addDoc(collection(db, 'Estado'), docData);

    cache.flushAll();

    res.status(201).send({
      id: docRef.id,
      ...docData,
      status: 'Estado actualizado!'
    });
  } catch (error) {
    console.error('Error al insertar estado:', error);
    res.status(500).send({
      error: 'Error al insertar estado',
      message: error.message || 'Error desconocido',
      code: error.code || 'UNKNOWN'
    });
  }
});

// Endpoint para notificaciones
app.post('/notificar', async (req, res) => {
  try {
    const { titulo, mensaje, token } = req.body;

    if (!titulo || !mensaje || !token) {
      return res.status(400).send({
        error: 'Faltan parámetros',
        message: 'Se requieren titulo, mensaje y token'
      });
    }

    // Aquí va la lógica de notificación (Firebase Cloud Messaging u otra)

    res.status(201).send({
      titulo,
      mensaje,
      token,
      status: 'Notificación enviada!'
    });
  } catch (error) {
    console.error('Error al enviar notificación:', error);
    res.status(500).send({
      error: 'Error al enviar notificación',
      message: error.message || 'Error desconocido',
      code: error.code || 'UNKNOWN'
    });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Escuchando en puerto ${PORT}`);
});