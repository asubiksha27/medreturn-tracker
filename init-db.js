const mysql = require('mysql2/promise');

async function initDB() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: ''
  });

  // Create database if not exists
  await connection.execute('CREATE DATABASE IF NOT EXISTS medtracker');
  await connection.execute('USE medtracker');

  // Create medicines table
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS medicines (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      batch_number VARCHAR(100) NOT NULL,
      expiry_date DATE NOT NULL,
      return_date DATE NOT NULL,
      quantity INT NOT NULL,
      price DECIMAL(10,2) NOT NULL,
      sold_qty INT DEFAULT 0,
      status ENUM('Pending', 'Returned', 'Missed') DEFAULT 'Pending',
      returned TINYINT DEFAULT 0,
      returned_qty INT DEFAULT 0,
      missed_qty INT DEFAULT 0
    )
  `);

  console.log('✅ Database and table created successfully!');
  
  // Sample data
  await connection.execute(`
    INSERT IGNORE INTO medicines (name, batch_number, expiry_date, return_date, quantity, price)
    VALUES 
    ('Paracetamol 500mg', 'PAR001', '2025-12-31', '2025-06-30', 100, 2.50),
    ('Crocin 650mg', 'CRO001', '2025-11-15', '2025-05-20', 75, 3.00),
    ('Azithromycin 500mg', 'AZI001', '2026-01-20', '2025-07-10', 50, 15.00)
  `);
  
  console.log('✅ Sample data added!');
  await connection.end();
}

initDB().catch(console.error);
