const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcrypt');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// -------------------- MySQL Connection --------------------

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'medtracker'
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


// -------------------- Get Medicines for Daily Sales --------------------

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


// -------------------- Record Daily Sales --------------------

app.post('/sell-medicine', (req, res) => {

  const { medicineId, soldQty } = req.body;

  if (!medicineId || !soldQty) {
    return res.status(400).json({ error: 'Medicine ID and quantity required' });
  }

  const sql = `
    UPDATE medicines
    SET sold_qty = sold_qty + ?
    WHERE id = ? AND (quantity - sold_qty) >= ?
  `;

  db.query(sql, [soldQty, medicineId, soldQty], (err, result) => {

    if (err) return res.status(500).json(err);

    if (result.affectedRows === 0) {
      return res.status(400).json({
        error: 'Not enough stock or invalid medicine'
      });
    }

    res.json({ message: 'Sales updated successfully' });

  });

});


// -------------------- Mark Returned / Missed --------------------

app.post('/mark-status', (req, res) => {

  const { id, status } = req.body;

  if (!id || !status) {
    return res.status(400).json({ error: 'ID and status required' });
  }

  const returnedVal = status === 'Returned' ? 1 : 0;

  const sql = `
  UPDATE medicines
  SET status = ?,
      returned = ?,
      returned_qty = CASE WHEN ?='Returned' THEN sold_qty ELSE returned_qty END,
      missed_qty   = CASE WHEN ?='Missed' THEN quantity - sold_qty ELSE missed_qty END
  WHERE id = ?
  `;

  db.query(sql, [status, returnedVal, status, status, id], (err) => {

    if (err) return res.status(500).json(err);

    res.json({ message: `Medicine marked as ${status}` });

  });

});


// -------------------- Reminder --------------------

app.get('/reminder', (req, res) => {

  const sql = `
    SELECT id, name, batch_number, return_date, expiry_date,
           quantity, sold_qty, price,
           (quantity - sold_qty) AS remainingQty,
           DATEDIFF(expiry_date, CURDATE()) AS daysLeft,
           status
    FROM medicines
    WHERE status='Pending'
  `;

  db.query(sql, (err, results) => {

    if (err) return res.status(500).json(err);

    const data = results.map(m => {

      let alert = 'low';

      if (m.daysLeft <= 10) alert = 'high';
      else if (m.daysLeft <= 30) alert = 'medium';

      return {
        id: m.id,
        name: m.name,
        batchNumber: m.batch_number,
        remainingQty: m.remainingQty,
        returnDate: m.return_date,
        expiryDate: m.expiry_date,
        daysLeft: m.daysLeft,
        alert,
        status: m.status,
        price: m.price
      };

    });

    res.json(data);

  });

});


// -------------------- Report Page --------------------

app.get('/report', (req, res) => {

  db.query('SELECT * FROM medicines', (err, results) => {

    if (err) return res.status(500).json(err);

    const totalMedicines = results.length;

    const totalSold = results.reduce((sum, m) => sum + m.sold_qty, 0);

    const expired = results.filter(
      m => new Date(m.expiry_date) < new Date()
    ).length;

    let totalGain = 0;
    let totalLoss = 0;

    results.forEach(m => {

      totalGain += m.returned_qty * m.price;
      totalLoss += m.missed_qty * m.price;

    });

    const salesReport = results.map(m => ({
      name: m.name,
      batchNumber: m.batch_number,
      status: m.status,
      soldQty: m.sold_qty,
      returnedQty: m.returned_qty,
      missedQty: m.missed_qty,
      price: m.price,
      quantity: m.quantity,
      salesAmount: m.sold_qty * m.price
    }));

    res.json({
      totalMedicines,
      totalSold,
      expired,
      totalGain: totalGain.toFixed(2),
      totalLoss: totalLoss.toFixed(2),
      salesReport
    });

  });

});


// -------------------- Sales Pie Chart API --------------------

app.get('/sales-data', (req, res) => {

  const sql = `
    SELECT name,
           SUM(sold_qty * price) AS total_sales
    FROM medicines
    GROUP BY name
  `;

  db.query(sql, (err, results) => {

    if (err) return res.status(500).json(err);

    res.json(results);

  });

});


// -------------------- Start Server --------------------

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});