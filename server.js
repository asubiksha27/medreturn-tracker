const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcrypt');

const app = express();

// IMPORTANT → Railway uses dynamic port
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// -------------------- Home Route (VERY IMPORTANT) --------------------

app.get("/", (req, res) => {
  res.send("MedReturn Tracker Backend is Running Successfully");
});

// -------------------- MySQL Connection --------------------

const db = mysql.createConnection({
  host: process.env.MYSQLHOST || 'localhost',
  user: process.env.MYSQLUSER || 'root',
  password: process.env.MYSQLPASSWORD || '',
  database: process.env.MYSQLDATABASE || 'medtracker',
  port: process.env.MYSQLPORT || 3306
});

db.connect(err => {
  if (err) {
    console.error('DB Connection Error:', err);
    return;
  }
  console.log('MySQL Connected Successfully');
});

// ==========================================================
//                      AUTHENTICATION
// ==========================================================

// -------------------- Signup --------------------

app.post('/signup', async (req, res) => {

  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'All fields required' });
  }

  try {

    const hashedPassword = await bcrypt.hash(password, 10);

    const sql = "INSERT INTO users (name, email, password) VALUES (?, ?, ?)";

    db.query(sql, [name, email, hashedPassword], (err, result) => {

      if (err) {
        return res.status(500).json({ error: 'User already exists' });
      }

      res.json({ message: 'Signup successful' });

    });

  } catch (err) {
    res.status(500).json(err);
  }

});

// -------------------- Login --------------------

app.post('/login', (req, res) => {

  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const sql = "SELECT * FROM users WHERE email = ?";

  db.query(sql, [email], async (err, results) => {

    if (err) return res.status(500).json(err);

    if (results.length === 0) {
      return res.status(400).json({ error: 'User not found' });
    }

    const user = results[0];

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(400).json({ error: 'Invalid password' });
    }

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });

  });

});

// ==========================================================
//                      MEDICINE MODULE
// ==========================================================

// -------------------- Add Medicine --------------------

app.post('/add-medicine', (req, res) => {

  const { medicineName, batchNumber, expiryDate, returnDate, quantity, price } = req.body;

  if (!medicineName || !batchNumber || !expiryDate || !returnDate || !quantity || !price) {
    return res.status(400).json({ error: 'All fields required' });
  }

  const sql = `
    INSERT INTO medicines
    (name, batch_number, expiry_date, return_date, quantity, price,
     sold_qty, status, returned, returned_qty, missed_qty)
    VALUES (?,?,?,?,?,?,0,'Pending',0,0,0)
  `;

  db.query(sql, [medicineName, batchNumber, expiryDate, returnDate, quantity, price],
    (err, result) => {

      if (err) return res.status(500).json(err);

      res.json({
        message: 'Medicine added successfully',
        id: result.insertId
      });

    }
  );

});

// -------------------- Get Medicines --------------------

app.get('/medicines', (req, res) => {

  const sql = `
    SELECT id, name, quantity, sold_qty
    FROM medicines
    WHERE quantity > sold_qty
  `;

  db.query(sql, (err, results) => {

    if (err) return res.status(500).json(err);

    res.json(results);

  });

});

// -------------------- Start Server --------------------

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
