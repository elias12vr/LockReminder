const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const compression = require('compression');
const NodeCache = require('node-cache');
const db = require('./fire'); // Instancia de Firestore

const {
  collection,
  getDocs,
  getFirestore,
  query,
  orderBy,
  limit,
  addDoc,
  where,
  startAfter
} = require('firebase/firestore');

const app = express();
const PORT = process.env.PORT || 5000;
const cache = new NodeCache({ stdTTL: 300 }); // Caché de 5 minutos

// Middleware
app.use(cors());
app.use(compression()); // Habilitar compresión GZIP
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// Endpoint raíz con documentación
app.get('/', (req, res) => {
  res.send(
    '<h1>API Express & Firebase Monitoreo ESP32</h1><ul>' +
    '<li><p><b>GET /ver</b> - Ver valores (parámetros: page, limit, distancia)</p></li>' +
    '<li><p><b>GET /valor</b> - Último valor</p></li>' +
    '<li><p><b>GET /estado</b> - Último estado de conexión</p></li>' +
    '<li><p><b>POST /insertar</b> - {distancia, nombre, fecha}</p></li>' +
    '<li><p><b>POST /estado</b> - {conectado, nombre}</p></li>' +
    '<li><p><b>POST /notificar</b> - {titulo, mensaje, token}</p></li>' +
    '</ul>'
  );
});

// Endpoint para ver valores con paginación y filtrado
app.get('/ver', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limitNum = parseInt(req.query.limit) || 50;
    const distancia = req.query.distancia;

    // Clave para el caché
    const cacheKey = `ver_${page}_${limitNum}_${distancia || 'all'}`;
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.send(cachedData); // Devolver datos del caché
    }

    let q = query(collection(db, 'Valores'), orderBy('fecha', 'asc'));
    
    // Aplicar filtro por distancia si se proporciona
    if (distancia && distancia !== 'Todos') {
      q = query(q, where('distancia', '==', distancia));
    }

    // Paginación: obtener el último documento de la página anterior
    if (page > 1) {
      const prevQuery = query(collection(db, 'Valores'), orderBy('fecha', 'asc'), limit((page - 1) * limitNum));
      const prevSnapshot = await getDocs(prevQuery);
      const lastDoc = prevSnapshot.docs[prevSnapshot.docs.length - 1];
      q = query(q, startAfter(lastDoc), limit(limitNum));
    } else {
      q = query(q, limit(limitNum));
    }

    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      fecha: doc.data().fecha // Asegurar formato consistente
    }));

    // Guardar en caché
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

// Endpoint para obtener el último valor
app.get('/valor', async (req, res) => {
  try {
    const cacheKey = 'ultimo_valor';
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.send(cachedData);
    }

    const q = query(collection(db, 'Valores'), orderBy('fecha', 'desc'), limit(1));
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      fecha: doc.data().fecha
    }));

    cache.set(cacheKey, data);
    res.send(data);
  } catch (error) {
    console.error('Error al obtener último valor:', error);
    res.status(500).send({
      error: 'Error al obtener último valor',
      message: error.message || 'Error desconocido',
      code: error.code || 'UNKNOWN'
    });
  }
});

// Endpoint para obtener el último estado
app.get('/estado', async (req, res) => {
  try {
    const cacheKey = 'ultimo_estado';
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.send(cachedData);
    }

    const q = query(collection(db, 'Estado'), orderBy('fecha', 'desc'), limit(1));
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      fecha: doc.data().fecha
    }));

    cache.set(cacheKey, data);
    res.send(data);
  } catch (error) {
    console.error('Error al obtener estado:', error);
    res.status(500).send({
      error: 'Error al obtener estado',
      message: error.message || 'Error desconocido',
      code: error.code || 'UNKNOWN'
    });
  }
});

// Endpoint para insertar valores
app.post('/insertar', async (req, res) => {
  try {
    const { distancia, nombre, fecha } = req.body;

    // Validación básica
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

    // Invalidar caché relacionado
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

    // Validación básica
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

    // Invalidar caché relacionado
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

// Endpoint para notificaciones (sin cambios, ajusta según necesidades)
app.post('/notificar', async (req, res) => {
  try {
    const { titulo, mensaje, token } = req.body;

    // Validación básica
    if (!titulo || !mensaje || !token) {
      return res.status(400).send({
        error: 'Faltan parámetros',
        message: 'Se requieren titulo, mensaje y token'
      });
    }

    // Aquí iría la lógica para enviar notificaciones (e.g., Firebase Cloud Messaging)
    // Por ahora, solo devolvemos una respuesta simulada
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

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Escuchando en puerto ${PORT}`);
});