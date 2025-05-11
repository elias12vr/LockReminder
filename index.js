const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const db = require('./fire'); // Ya es instancia de Firestore

const {
  collection,
  getDocs,
  getFirestore,
  query,
  orderBy,
  limit,
  addDoc
} = require('firebase/firestore');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.get('/', (req, res) => {
  res.send(
    '<h1>API Express & Firebase Monitoreo ESP32</h1><ul>' +
    '<li><p><b>GET /ver</b> - Ver todos los valores</p></li>' +
    '<li><p><b>GET /valor</b> - Último valor</p></li>' +
    '<li><p><b>GET /estado</b> - Último estado de conexión</p></li>' +
    '<li><p><b>POST /insertar</b> - {distancia, nombre, fecha}</p></li>' +
    '<li><p><b>POST /notificar</b> - {titulo, mensaje, token}</p></li>' +
    '</ul>'
  );
});

app.get('/ver', async (req, res) => {
  try {
    const q = query(collection(db, 'Valores'), orderBy('fecha', 'asc'));
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => doc.data());
    res.send(data);
  } catch (error) {
    console.error('Error al obtener valores:', error);
    res.status(500).send('Error al obtener valores');
  }
});

app.get('/valor', async (req, res) => {
  try {
    const q = query(collection(db, 'Valores'), orderBy('fecha', 'desc'), limit(1));
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => doc.data());
    res.send(data);
  } catch (error) {
    console.error('Error al obtener último valor:', error);
    res.status(500).send('Error al obtener último valor');
  }
});

app.get('/estado', async (req, res) => {
  try {
    const q = query(collection(db, 'Estado'), orderBy('fecha', 'desc'), limit(1));
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => doc.data());
    res.send(data);
  } catch (error) {
    console.error('Error al obtener estado:', error);
    res.status(500).send('Error al obtener estado');
  }
});

app.post('/insertar', async (req, res) => {
  try {
    const { distancia, nombre } = req.body;

    await addDoc(collection(db, 'Valores'), {
      distancia,
      nombre,
      fecha: new Date().toISOString()
    });

    res.send({
      distancia,
      nombre,
      fecha: new Date(),
      status: 'Valores insertados!'
    });
  } catch (error) {
    console.error('Error al insertar valores:', error);
    res.status(500).send('Error al insertar valores');
  }
});

app.post('/estado', async (req, res) => {
  try {
    const { conectado, nombre } = req.body;

    await addDoc(collection(db, 'Estado'), {
      conectado: conectado === 'true',
      nombre,
      fecha: new Date().toISOString()
    });

    res.send({
      conectado,
      nombre,
      fecha: new Date(),
      status: 'Estado actualizado!'
    });
  } catch (error) {
    console.error('Error al insertar estado:', error);
    res.status(500).send('Error al insertar estado');
  }
});

app.listen(PORT, () => {
  console.log(`Escuchando en puerto ${PORT}`);
});
