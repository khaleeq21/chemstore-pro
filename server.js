const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jwt-simple');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = 'warehouse_secret_key_2026';

app.use(cors());
app.use(express.json());

// Initialize SQLite Database
const db = new sqlite3.Database('./warehouse.db', (err) => {
    if (err) console.error('Database opening error:', err);
    else console.log('Connected to SQLite Database.');
});

// Create Database Schema
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    email TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'Viewer',
    requestedRole TEXT DEFAULT 'Viewer',
    status TEXT DEFAULT 'approved',
    createdAt TEXT
  )`);

    // Migrations for existing databases to add new columns safely
    db.run(`ALTER TABLE users ADD COLUMN email TEXT`, () => { });
    db.run(`ALTER TABLE users ADD COLUMN requestedRole TEXT DEFAULT 'Viewer'`, () => { });
    db.run(`ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'approved'`, () => { });
    db.run(`ALTER TABLE users ADD COLUMN createdAt TEXT`, () => { });

    db.run(`CREATE TABLE IF NOT EXISTS chemicals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE,
    name TEXT,
    formula TEXT,
    cas TEXT,
    category TEXT,
    quantity REAL,
    unit TEXT,
    minThreshold REAL,
    hazard TEXT,
    zone TEXT,
    expiryDate TEXT,
    supplier TEXT,
    precautions TEXT
  )`);

    db.run(`CREATE TABLE IF NOT EXISTS usage_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chemical_id INTEGER,
    chemical_name TEXT,
    chemical_code TEXT,
    used_amount REAL,
    prev_quantity REAL,
    remaining_quantity REAL,
    unit TEXT,
    operator TEXT,
    department TEXT,
    purpose TEXT,
    timestamp TEXT,
    FOREIGN KEY(chemical_id) REFERENCES chemicals(id)
  )`);

    // Remove legacy test users as requested: "remove all existing user till added"
    // and initialize the primary Developer account
    const devHash = bcrypt.hashSync('developer123', 10);
    db.run(`DELETE FROM users WHERE role != 'Developer'`, function (err) {
        if (!err && this.changes > 0) {
            console.log(`Cleaned up ${this.changes} legacy user(s).`);
        }
    });

    // Seed master Developer account
    db.run(`INSERT OR IGNORE INTO users (id, username, email, password, role, requestedRole, status, createdAt) 
            VALUES (1, 'developer', 'developer@cms.com', ?, 'Developer', 'Developer', 'approved', datetime('now'))`, [devHash]);
    db.run(`UPDATE users SET role = 'Developer', requestedRole = 'Developer', status = 'approved' WHERE id = 1`, () => { });

    // Seed initial chemical data if empty
    db.get('SELECT COUNT(*) as count FROM chemicals', [], (err, row) => {
        if (row && row.count === 0) {
            const stmt = db.prepare(`INSERT INTO chemicals (code, name, formula, cas, category, quantity, unit, minThreshold, hazard, zone, expiryDate, supplier, precautions) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
            stmt.run(['CHEM-001', 'Hydrochloric Acid 37%', 'HCl', '7647-01-0', 'Acid', 120, 'L', 50, 'Extreme', 'Zone A - Acids', '2027-06-15', 'ChemSource Corp', 'Fuming liquid. Avoid inhalation and contact. Use full PPE.']);
            stmt.run(['CHEM-002', 'Sodium Hydroxide 50%', 'NaOH', '1310-73-2', 'Base', 200, 'L', 80, 'High', 'Zone B - Bases', '2028-02-10', 'Global Pure Labs', 'Causes severe burns. Do not mix with acids.']);
            stmt.run(['CHEM-003', 'Ethanol 99.9% Absolute', 'C2H5OH', '64-17-5', 'Solvent', 45, 'L', 100, 'High', 'Zone C - Solvents', '2026-11-30', 'Apex Chemical Co', 'Highly flammable liquid and vapor. Keep away from heat and flames.']);
            stmt.run(['CHEM-004', 'Acetone Technical Grade', 'C3H6O', '67-64-1', 'Solvent', 320, 'L', 150, 'Moderate', 'Zone C - Solvents', '2027-12-01', 'Apex Chemical Co', 'Store in cool place. Extremely flammable.']);
            stmt.finalize();
        }
    });
});

// Middleware: Authenticate JWT Token (attaches user if token present)
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token) {
        try {
            const user = jwt.decode(token, JWT_SECRET);
            req.user = user;
        } catch (err) {
            // Invalid or expired token
        }
    }
    next();
};

// ==========================
// API ROUTES: AUTH & USERS
// ==========================

// API Route: Login (Supports Username or Email)
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username/Email and password are required' });
    }

    const identifier = username.trim();
    db.get('SELECT * FROM users WHERE username = ? OR email = ? COLLATE NOCASE', [identifier, identifier], (err, user) => {
        if (err || !user) return res.status(401).json({ error: 'Invalid username/email or password' });
        if (!bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Invalid username/email or password' });

        const token = jwt.encode({ id: user.id, username: user.username, email: user.email, role: user.role }, JWT_SECRET);
        res.json({
            token,
            userId: user.id,
            role: user.role,
            username: user.username,
            email: user.email,
            status: user.status || 'approved',
            requestedRole: user.requestedRole || user.role
        });
    });
});

// API Route: Register New User
// Rules:
// - Admin registration MUST be approved by Developer ('pending_dev')
// - Viewer registration MUST be approved by Admin or Developer ('pending_admin')
app.post('/api/auth/register', (req, res) => {
    const { username, email, password, requestedRole, devKey } = req.body;

    if (!username || !username.trim()) {
        return res.status(400).json({ error: 'Username is required' });
    }
    if (!email || !email.trim() || !email.includes('@')) {
        return res.status(400).json({ error: 'A valid email address is required' });
    }
    if (!password || password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();
    const createdAt = new Date().toISOString().replace('T', ' ').slice(0, 19);

    // Check if username or email already exists
    db.get('SELECT id, username, email FROM users WHERE username = ? OR email = ?', [cleanUsername, cleanEmail], (err, existing) => {
        if (err) return res.status(500).json({ error: err.message });
        if (existing) {
            if (existing.username.toLowerCase() === cleanUsername.toLowerCase()) {
                return res.status(400).json({ error: 'This username is already taken. Please choose another.' });
            }
            if (existing.email && existing.email.toLowerCase() === cleanEmail) {
                return res.status(400).json({ error: 'An account with this email already exists.' });
            }
        }

        const hash = bcrypt.hashSync(password, 10);
        let initialRole = 'Viewer';
        let reqRole = requestedRole === 'Admin' ? 'Admin' : (requestedRole === 'Developer' ? 'Developer' : 'Viewer');
        let initialStatus = 'pending_admin';

        if (requestedRole === 'Developer') {
            if (devKey === 'DEV2026') {
                initialRole = 'Developer';
                initialStatus = 'approved';
            } else {
                return res.status(403).json({ error: 'Invalid Developer Secret Passkey.' });
            }
        } else if (requestedRole === 'Admin') {
            // Admin registration MUST be approved by Developer
            initialRole = 'Viewer';
            reqRole = 'Admin';
            initialStatus = 'pending_dev';
        } else {
            // Viewer registration MUST be approved by Admin or Developer
            initialRole = 'Viewer';
            reqRole = 'Viewer';
            initialStatus = 'pending_admin';
        }

        const sql = `INSERT INTO users (username, email, password, role, requestedRole, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`;
        db.run(sql, [cleanUsername, cleanEmail, hash, initialRole, reqRole, initialStatus, createdAt], function (insertErr) {
            if (insertErr) {
                return res.status(400).json({ error: 'Registration failed: ' + insertErr.message });
            }

            if (reqRole === 'Developer') {
                res.status(201).json({
                    message: 'Developer account registered successfully! You can now log in.',
                    status: 'approved',
                    requestedRole: 'Developer'
                });
            } else if (reqRole === 'Admin') {
                res.status(201).json({
                    message: 'Admin registration submitted! You must be approved by the Developer before Admin privileges are granted.',
                    status: 'pending_dev',
                    requestedRole: 'Admin'
                });
            } else {
                res.status(201).json({
                    message: 'Registration submitted! Your account is pending approval by an Administrator.',
                    status: 'pending_admin',
                    requestedRole: 'Viewer'
                });
            }
        });
    });
});

// API Route: Get All Users (Admin and Developer view)
app.get('/api/users', (req, res) => {
    db.all('SELECT id, username, email, role, requestedRole, status, createdAt FROM users ORDER BY id ASC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// API Route: Approve / Update User Role & Status
// Rules:
// - ONLY Developer can approve Admin accounts ('role = Admin')
// - Both Admin and Developer can approve regular Viewers ('role = Viewer', 'status = approved')
app.put('/api/users/:id/role', (req, res) => {
    const userId = parseInt(req.params.id);
    const { role, status, approverRole } = req.body;

    if (!role || !['Admin', 'Viewer', 'Developer'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role specified.' });
    }

    // Permission Enforcement: ONLY Developer can grant Admin role
    if (role === 'Admin' && approverRole !== 'Developer') {
        return res.status(403).json({ error: 'Permission Denied: Administrator requests must be approved by the Developer.' });
    }

    const finalStatus = status || 'approved';
    db.run('UPDATE users SET role = ?, status = ? WHERE id = ?', [role, finalStatus, userId], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'User not found' });

        res.json({
            message: `User permissions updated: Role set to ${role} (${finalStatus})`,
            userId,
            role,
            status: finalStatus
        });
    });
});

// API Route: Update Profile (Username, Email, Password) - Available to all authenticated users, especially Developer
app.put('/api/auth/profile', authenticateToken, (req, res) => {
    const userId = (req.user && req.user.id) || req.body.userId;
    const { username, email, newPassword } = req.body;

    if (!userId) {
        return res.status(400).json({ error: 'User ID is required to update profile' });
    }

    db.get('SELECT * FROM users WHERE id = ?', [userId], (err, currentUser) => {
        if (err || !currentUser) {
            return res.status(404).json({ error: 'User account not found' });
        }

        const updatedUsername = (username && username.trim()) || currentUser.username;
        const updatedEmail = (email && email.trim().toLowerCase()) || currentUser.email;

        // Check if new username or email is already taken by another account
        db.get('SELECT id, username, email FROM users WHERE (username = ? OR email = ?) AND id != ?',
            [updatedUsername, updatedEmail, userId], (conflictErr, conflict) => {
                if (conflictErr) return res.status(500).json({ error: conflictErr.message });
                if (conflict) {
                    if (conflict.username.toLowerCase() === updatedUsername.toLowerCase()) {
                        return res.status(400).json({ error: 'This username is already taken by another user.' });
                    }
                    if (conflict.email && conflict.email.toLowerCase() === updatedEmail.toLowerCase()) {
                        return res.status(400).json({ error: 'This email is already taken by another user.' });
                    }
                }

                let passwordHash = currentUser.password;
                if (newPassword && newPassword.trim()) {
                    if (newPassword.trim().length < 6) {
                        return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
                    }
                    passwordHash = bcrypt.hashSync(newPassword.trim(), 10);
                }

                db.run('UPDATE users SET username = ?, email = ?, password = ? WHERE id = ?',
                    [updatedUsername, updatedEmail, passwordHash, userId],
                    function (updateErr) {
                        if (updateErr) return res.status(500).json({ error: updateErr.message });

                        const token = jwt.encode({
                            id: currentUser.id,
                            username: updatedUsername,
                            email: updatedEmail,
                            role: currentUser.role
                        }, JWT_SECRET);

                        res.json({
                            message: 'Profile updated successfully!',
                            token,
                            userId: currentUser.id,
                            username: updatedUsername,
                            email: updatedEmail,
                            role: currentUser.role
                        });
                    }
                );
            });
    });
});

// API Route: Add User Directly (Developer can add any role; Admin can add Viewers)
app.post('/api/users', authenticateToken, (req, res) => {
    const { username, email, password, role, approverRole } = req.body;
    const effectiveApprover = (req.user && req.user.role) || approverRole;

    if (effectiveApprover !== 'Developer' && effectiveApprover !== 'Admin') {
        return res.status(403).json({ error: 'Permission Denied: Only Developer or Admin can add users directly.' });
    }

    if ((role === 'Admin' || role === 'Developer') && effectiveApprover !== 'Developer') {
        return res.status(403).json({ error: 'Permission Denied: Only Developer can create Administrator or Developer accounts.' });
    }

    if (!username || !username.trim()) {
        return res.status(400).json({ error: 'Username is required' });
    }
    if (!email || !email.trim() || !email.includes('@')) {
        return res.status(400).json({ error: 'A valid email is required' });
    }
    if (!password || password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();
    const targetRole = role || 'Viewer';
    const createdAt = new Date().toISOString().replace('T', ' ').slice(0, 19);

    db.get('SELECT id, username, email FROM users WHERE username = ? OR email = ?', [cleanUsername, cleanEmail], (err, existing) => {
        if (err) return res.status(500).json({ error: err.message });
        if (existing) {
            if (existing.username.toLowerCase() === cleanUsername.toLowerCase()) {
                return res.status(400).json({ error: 'This username is already taken.' });
            }
            if (existing.email && existing.email.toLowerCase() === cleanEmail) {
                return res.status(400).json({ error: 'This email is already in use.' });
            }
        }

        const hash = bcrypt.hashSync(password, 10);
        const sql = `INSERT INTO users (username, email, password, role, requestedRole, status, createdAt) VALUES (?, ?, ?, ?, ?, 'approved', ?)`;
        db.run(sql, [cleanUsername, cleanEmail, hash, targetRole, targetRole, createdAt], function (insertErr) {
            if (insertErr) return res.status(500).json({ error: insertErr.message });
            res.status(201).json({
                message: `User "${cleanUsername}" created successfully with role "${targetRole}".`,
                userId: this.lastID,
                user: { id: this.lastID, username: cleanUsername, email: cleanEmail, role: targetRole, status: 'approved', createdAt }
            });
        });
    });
});

// API Route: Delete User (Admin can delete Viewers, Developer can delete anyone)
app.delete('/api/users/:id', authenticateToken, (req, res) => {
    const userId = parseInt(req.params.id);
    const approverRole = (req.user && req.user.role) || req.headers['x-user-role'] || req.query.approverRole;
    const currentUserId = (req.user && req.user.id) || parseInt(req.headers['x-user-id']);

    if (currentUserId && userId === currentUserId) {
        return res.status(400).json({ error: 'You cannot delete your own active account.' });
    }

    db.get('SELECT * FROM users WHERE id = ?', [userId], (err, targetUser) => {
        if (err || !targetUser) return res.status(404).json({ error: 'User not found' });

        // Admin cannot delete an Admin or Developer
        if ((targetUser.role === 'Admin' || targetUser.role === 'Developer') && approverRole !== 'Developer') {
            return res.status(403).json({ error: 'Permission Denied: Only Developer can remove an Administrator or Developer.' });
        }

        db.run('DELETE FROM users WHERE id = ?', [userId], function (delErr) {
            if (delErr) return res.status(500).json({ error: delErr.message });
            res.json({ message: `User "${targetUser.username}" removed successfully.` });
        });
    });
});

// API Route: Purge All Users (Developer only: resets user list to Developer only)
app.post('/api/users/purge-all', (req, res) => {
    const { approverRole } = req.body;
    if (approverRole !== 'Developer') {
        return res.status(403).json({ error: 'Permission Denied: Only the Developer can purge user accounts.' });
    }

    db.run(`DELETE FROM users WHERE role != 'Developer'`, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: `Purged ${this.changes} user(s). Database reset to Developer accounts only.` });
    });
});

// API Route: Get All Chemicals
app.get('/api/chemicals', authenticateToken, (req, res) => {
    db.all('SELECT * FROM chemicals', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// API Route: Add Chemical (Protected)
app.post('/api/chemicals', authenticateToken, (req, res) => {
    const { code, name, formula, cas, category, quantity, unit, minThreshold, hazard, zone, expiryDate, supplier, precautions } = req.body;
    const sql = `INSERT INTO chemicals (code, name, formula, cas, category, quantity, unit, minThreshold, hazard, zone, expiryDate, supplier, precautions) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    db.run(sql, [code, name, formula, cas, category, quantity, unit, minThreshold, hazard, zone, expiryDate, supplier, precautions], function (err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ id: this.lastID, message: 'Chemical added successfully' });
    });
});

// API Route: Record Chemical Usage
// Logs: At what time, Who used it, How much chemical, For what purpose, and Remaining stock
app.post('/api/usage', (req, res) => {
    const { chemical_id, used_amount, operator, department, purpose, timestamp } = req.body;

    const parsedAmount = parseFloat(used_amount);
    if (!chemical_id || isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ error: 'Valid chemical_id and a positive used_amount are required.' });
    }

    db.get('SELECT * FROM chemicals WHERE id = ?', [chemical_id], (err, chem) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!chem) return res.status(404).json({ error: 'Chemical not found in inventory.' });

        const prev_quantity = chem.quantity;

        // Prevent deducting more than available stock
        if (parsedAmount > prev_quantity) {
            return res.status(400).json({
                error: `Insufficient stock! Requested: ${parsedAmount} ${chem.unit}, Available: ${prev_quantity} ${chem.unit}`
            });
        }

        const remaining_quantity = parseFloat((prev_quantity - parsedAmount).toFixed(3));
        const logTime = timestamp || new Date().toISOString().replace('T', ' ').slice(0, 19);
        const logOperator = (operator && operator.trim()) || (req.user && req.user.username) || 'Lab Technician';
        const logDepartment = (department && department.trim()) || 'General Laboratory';
        const logPurpose = (purpose && purpose.trim()) || 'Standard Usage / Experiment';

        // 1. Deduct quantity from chemical inventory
        db.run('UPDATE chemicals SET quantity = ? WHERE id = ?', [remaining_quantity, chemical_id], function (updateErr) {
            if (updateErr) return res.status(500).json({ error: updateErr.message });

            // 2. Insert audit log record into usage_logs
            const logSql = `INSERT INTO usage_logs (
                chemical_id, chemical_name, chemical_code, 
                used_amount, prev_quantity, remaining_quantity, unit, 
                operator, department, purpose, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

            db.run(logSql, [
                chemical_id, chem.name, chem.code,
                parsedAmount, prev_quantity, remaining_quantity, chem.unit,
                logOperator, logDepartment, logPurpose, logTime
            ], function (logErr) {
                if (logErr) return res.status(500).json({ error: logErr.message });

                res.status(201).json({
                    message: 'Stock usage logged successfully',
                    log: {
                        id: this.lastID,
                        chemical_id,
                        chemical_name: chem.name,
                        chemical_code: chem.code,
                        used_amount: parsedAmount,
                        prev_quantity,
                        remaining_quantity,
                        unit: chem.unit,
                        operator: logOperator,
                        department: logDepartment,
                        purpose: logPurpose,
                        timestamp: logTime
                    }
                });
            });
        });
    });
});

// API Route: Get Consumption & Usage Logs (supports optional ?chemical_id=X filter)
app.get('/api/usage', (req, res) => {
    const { chemical_id } = req.query;
    let sql = 'SELECT * FROM usage_logs';
    const params = [];

    if (chemical_id) {
        sql += ' WHERE chemical_id = ?';
        params.push(chemical_id);
    }
    sql += ' ORDER BY id DESC';

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// API Route: Delete Chemical (Protected)
app.delete('/api/chemicals/:id', authenticateToken, (req, res) => {
    db.run('DELETE FROM chemicals WHERE id = ?', [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Chemical deleted successfully' });
    });
});

const path = require('path');

// Serve static files from the React frontend build
app.use(express.static(path.join(__dirname, 'dist')));

// Handle client-side routing, redirecting all unknown routes to index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});