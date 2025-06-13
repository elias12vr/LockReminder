const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const compression = require('compression');
const NodeCache = require('node-cache');
const db = require('./fire'); // Your Firestore initialization

const {
  collection,
  getDocs,
  query,
  orderBy,
  where,
  addDoc,
  limit,
  Timestamp
} = require('firebase/firestore');

const app = express();
const PORT = process.env.PORT || 5000;

const cache = new NodeCache({ stdTTL: 300 });

app.use(cors());
app.use(compression({ level: 6 }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  next();
});

// --- Rutas ---

// Documentación en la raíz (removing filter mention for /ver)
app.get('/', (req, res) => {
  res.send(
    `<h1>API Express & Firebase Monitoreo ESP32</h1><ul>
      <li><b>GET /ver</b> - Ver todos los valores</li>
      <li><b>GET /valor</b> - Todos los valores (limitados)</li>
      <li><b>GET /valor/min</b> - Valores con respuesta mínima</li>
      <li><b>GET /estado</b> - Estados de conexión (limit)</li>
      <li><b>POST /insertar</b> - {distancia, nombre, fecha}</li>
      <li><b>POST /estado</b> - {conectado, nombre}</li>
      <li><b>POST /notificar</b> - {titulo, mensaje, token}</li>
    </ul>`
  );
});

// GET /ver with fixed date handling and retained filters
app.get('/ver', async (req, res) => {
  try {
    const { distancia, desde, limit: limStr = '100' } = req.query;
    const lim = parseInt(limStr, 10) || 100;

    const cacheKey = `ver_${distancia || 'all'}_${desde || 'none'}_${lim}`;
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.send(cachedData);
    }

    const valoresCollection = collection(db, 'Valores');
    const queryConstraints = [orderBy('fecha', 'desc'), limit(lim)];

    if (distancia && distancia !== 'Todos') {
      queryConstraints.push(where('distancia', '==', distancia));
    }

    if (desde) {
      try {
        const date = new Date(desde);
        if (isNaN(date.getTime())) {
          throw new Error('Fecha inválida');
        }
        queryConstraints.push(where('fecha', '>=', Timestamp.fromDate(date)));
      } catch (error) {
        return res.status(400).send({ error: 'Fecha inválida', message: 'El formato de fecha proporcionado no es válido' });
      }
    }

    const finalQuery = query(valoresCollection, ...queryConstraints);
    const snapshot = await getDocs(finalQuery);
    const data = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      fecha: doc.data().fecha.toDate().toISOString() // Convert Timestamp to ISO string
    }));

    cache.set(cacheKey, data);
    res.send(data);
  } catch (error) {
    console.error('Error en /ver:', error);
    res.status(500).send({ error: 'Error al obtener los registros', message: error.message });
  }
});

// GET /valor
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
      ...doc.data(),
      fecha: doc.data().fecha.toDate().toISOString()
    }));

    cache.set(cacheKey, data);
    res.send(data);
  } catch (error) {
    console.error('Error en /valor:', error);
    res.status(500).send({ error: 'Error al obtener valores', message: error.message });
  }
});

// GET /valor/min
app.get('/valor/min', async (req, res) => {
  try {
    const lim = parseInt(req.query.limit, 10) || 50;
    const q = query(collection(db, 'Valores'), orderBy('fecha', 'desc'), limit(lim));
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => ({
      d: doc.data().distancia,
      f: doc.data().fecha.toDate().toISOString()
    }));
    res.send(data);
  } catch (error) {
    console.error('Error en /valor/min:', error);
    res.status(500).send({ error: 'Error en /valor/min', message: error.message });
  }
});

// GET /estado
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
      fecha: doc.data().fecha.toDate().toISOString()
    }));

    cache.set(cacheKey, data);
    res.send(data);
  } catch (error) {
    console.error('Error en /estado:', error);
    res.status(500).send({ error: 'Error al obtener estados', message: error.message });
  }
});

// POST /insertar
app.post('/insertar', async (req, res) => {
  try {
    const { distancia, nombre, fecha } = req.body;
    if (!distancia || !nombre) {
      return res.status(400).send({ error: 'Faltan parámetros', message: 'distancia y nombre son requeridos' });
    }

    let timestamp;
    if (fecha) {
      try {
        const date = new Date(fecha);
        if (isNaN(date.getTime())) {
          throw new Error('Fecha inválida');
        }
        timestamp = Timestamp.fromDate(date);
      } catch (error) {
        return res.status(400).send({ error: 'Fecha inválida', message: 'El formato de fecha proporcionado no es válido' });
      }
    } else {
      timestamp = Timestamp.now();
    }

    const docData = {
      distancia,
      nombre,
      fecha: timestamp
    };

    const docRef = await addDoc(collection(db, 'Valores'), docData);

    cache.flushAll();
    console.log('Caché de valores invalidada por nueva inserción.');

    res.status(201).send({
      id: docRef.id,
      distancia,
      nombre,
      fecha: timestamp.toDate().toISOString(),
      status: 'Valores insertados'
    });
  } catch (error) {
    console.error('Error en /insertar:', error);
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
      fecha: Timestamp.now()
    };

    const docRef = await addDoc(collection(db, 'Estado'), docData);

    cache.flushAll();
    console.log('Caché de estado invalidada por nueva inserción.');

    res.status(201).send({
      id: docRef.id,
      conectado: docData.conectado,
      nombre,
      fecha: docData.fecha.toDate().toISOString(),
      status: 'Estado actualizado'
    });
  } catch (error) {
    console.error('Error en /estado:', error);
    res.status(500).send({ error: 'Error en /estado', message: error.message });
  }
});

// POST /notificar
app.post('/notificar', (req, res) => {
  const { titulo, mensaje, token } = req.body;
  if (!titulo || !mensaje || !token) {
    return res.status(400).send({ error: 'Faltan parámetros', message: 'titulo, mensaje y token son requeridos' });
  }
  console.log(`Simulando envío de notificación a ${token}: ${titulo}`);
  res.status(200).send({ status: 'Notificación enviada (simulada)' });
});

app.listen(PORT, () => {
  console.log(`🚀 API lista en http://localhost:${PORT}`);
});