from flask import (
    Flask, render_template, request, redirect, url_for, session, abort,
    send_from_directory, flash, get_flashed_messages, jsonify,
)
from datetime import datetime, timedelta
import sqlite3
import os
import sys
import math
import secrets
import time
import smtplib
import socket
import threading
import webbrowser
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from werkzeug.security import generate_password_hash, check_password_hash


def _get_base_dir():
    # If running as a PyInstaller bundle, use the executable's folder path
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


BASE_DIR = _get_base_dir()
RESOURCE_DIR = getattr(sys, '_MEIPASS', BASE_DIR)
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'static', 'uploads')
ALLOWED_IMAGE_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
OTP_TTL_SECONDS = 300
OTP_MAX_ATTEMPTS = 5
LOW_STOCK_THRESHOLD = 50
APP_HOST = '127.0.0.1'
APP_BIND_HOST = os.environ.get('CHEMSTORE_HOST', '0.0.0.0').strip() or '0.0.0.0'
APP_PORT = int(os.environ.get('CHEMSTORE_PORT', '5000'))
DEV_EMAIL = os.environ.get('CHEMSTORE_DEV_EMAIL', '').strip()
DEV_USERNAME = os.environ.get('CHEMSTORE_DEV_USERNAME', 'developer').strip() or 'developer'
DEV_PASSWORD = os.environ.get('CHEMSTORE_DEV_PASSWORD', '')


def _load_secret_key():
    env_key = os.environ.get('CHEMSTORE_SECRET_KEY')
    if env_key:
        return env_key

    key_path = os.path.join(BASE_DIR, '.secret_key')
    try:
        if os.path.exists(key_path):
            with open(key_path, 'r', encoding='utf-8') as key_file:
                existing = key_file.read().strip()
            if existing:
                return existing
        key = secrets.token_hex(32)
        with open(key_path, 'w', encoding='utf-8') as key_file:
            key_file.write(key)
        return key
    except OSError:
        return secrets.token_hex(32)


app = Flask(
    __name__,
    template_folder=os.path.join(RESOURCE_DIR, 'templates'),
    static_folder=os.path.join(RESOURCE_DIR, 'static'),
)
app.secret_key = _load_secret_key()
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 5 * 1024 * 1024
os.makedirs(UPLOAD_FOLDER, exist_ok=True)


def csrf_token():
    token = session.get('_csrf_token')
    if not token:
        token = secrets.token_hex(16)
        session['_csrf_token'] = token
    return token


@app.context_processor
def inject_csrf_token():
    return {'csrf_token': csrf_token()}


def _is_ajax():
    requested_with = request.headers.get('X-Requested-With', '')
    return (
        requested_with in ('XMLHttpRequest', 'fetch')
        or request.accept_mimetypes.best == 'application/json'
    )


def _json_response(ok, message='', status=200, **extra):
    payload = {'ok': ok, 'message': message}
    payload.update(extra)
    return jsonify(payload), status


@app.after_request
def add_app_header(response):
    response.headers['X-ChemStore'] = '1'
    return response


@app.before_request
def protect_from_csrf():
    if request.method == 'POST' and not app.config.get('TESTING'):
        expected = session.get('_csrf_token')
        provided = request.form.get('_csrf_token') or request.headers.get('X-CSRF-Token')
        if not expected or not provided or not secrets.compare_digest(expected, provided):
            abort(400, description='Invalid or missing CSRF token.')


@app.before_request
def refresh_session_from_db():
    if request.endpoint in ('static', 'uploaded_file'):
        return
    user_id = session.get('user_id')
    if user_id is None:
        return

    conn = get_db_connection()
    user = conn.execute(
        'SELECT id, username, role, approved FROM users WHERE id = ?', (user_id,)
    ).fetchone()
    conn.close()

    if not user or user['approved'] == 0:
        session.clear()
        if _is_ajax():
            return _json_response(False, 'Your session has expired. Please sign in again.', 401)
        return redirect(url_for('login'))

    session['username'] = user['username']
    session['role'] = user['role']


def _allowed_image(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_IMAGE_EXTENSIONS


LOGIN_FAILURES = {}
LOGIN_WINDOW_SECONDS = 300
LOGIN_MAX_FAILURES = 8


def _is_login_blocked(key):
    count, first_attempt = LOGIN_FAILURES.get(key, (0, 0.0))
    if time.time() - first_attempt > LOGIN_WINDOW_SECONDS:
        LOGIN_FAILURES.pop(key, None)
        return False
    return count >= LOGIN_MAX_FAILURES


def _record_login_failure(key):
    count, first_attempt = LOGIN_FAILURES.get(key, (0, 0.0))
    if time.time() - first_attempt > LOGIN_WINDOW_SECONDS:
        count, first_attempt = 0, time.time()
    LOGIN_FAILURES[key] = (count + 1, first_attempt)


def _remove_upload(filename):
    if not filename or filename == 'default.png':
        return
    path = os.path.join(app.config['UPLOAD_FOLDER'], os.path.basename(filename))
    try:
        if os.path.isfile(path):
            os.remove(path)
    except OSError:
        pass


@app.route('/uploads/<path:filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)


def get_db_connection():
    db_path = os.path.join(BASE_DIR, 'warehouse.db')
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    conn.execute('''
        CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT,
            name TEXT NOT NULL,
            category TEXT,
            quantity INTEGER NOT NULL,
            price REAL
        )
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL,
            profile_pic TEXT DEFAULT 'default.png',
            approved INTEGER DEFAULT 1
        )
    ''')
    
    try:
        conn.execute('ALTER TABLE users ADD COLUMN profile_pic TEXT DEFAULT "default.png"')
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute('ALTER TABLE users ADD COLUMN approved INTEGER DEFAULT 1')
        conn.commit()
    except sqlite3.OperationalError:
        pass
    
    conn.execute('''
        CREATE TABLE IF NOT EXISTS usage_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chemical_name TEXT,
            amount_used REAL,
            purpose TEXT,
            username TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    dev_check = conn.execute('SELECT * FROM users WHERE role = ?', ('Developer',)).fetchone()
    if not dev_check:
        if DEV_EMAIL and DEV_PASSWORD:
            hashed_pw = generate_password_hash(DEV_PASSWORD)
            conn.execute('INSERT INTO users (email, username, password, role, profile_pic, approved) VALUES (?, ?, ?, ?, ?, ?)', 
                         (DEV_EMAIL, DEV_USERNAME, hashed_pw, 'Developer', 'default.png', 1))
            conn.commit()
        else:
            print('No Developer account exists. Set CHEMSTORE_DEV_EMAIL and CHEMSTORE_DEV_PASSWORD, then restart to create one.')

    count = conn.execute('SELECT COUNT(*) FROM items').fetchone()[0]
    if count == 0:
        conn.execute('''
            INSERT INTO items (code, name, category, quantity, price)
            VALUES (?, ?, ?, ?, ?)
        ''', ('CHEM-004', 'Acetone Technical Grade', 'Solvent', 318, 0.0))
        conn.commit()
    conn.close()

def send_otp_email(to_email, otp_code):
    smtp_host = os.environ.get('SMTP_HOST')
    smtp_port = int(os.environ.get('SMTP_PORT', '587'))
    smtp_user = os.environ.get('SMTP_USER')
    smtp_password = os.environ.get('SMTP_PASSWORD')
    from_email = os.environ.get('SMTP_FROM', smtp_user or 'no-reply@chemstore.local')

    if not smtp_host:
        print(f"\n==============================\n[OTP CODE FOR {to_email}]: {otp_code}\n==============================\n")
        return False

    msg = MIMEMultipart()
    msg['Subject'] = 'ChemStore Pro - Password Reset OTP'
    msg['From'] = from_email
    msg['To'] = to_email
    msg.attach(MIMEText(
        f'Your One-Time Password (OTP) for resetting your password is: {otp_code}\n'
        f'It expires in {OTP_TTL_SECONDS // 60} minutes.',
        'plain',
    ))

    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
            server.starttls()
            if smtp_user and smtp_password:
                server.login(smtp_user, smtp_password)
            server.send_message(msg)
        return True
    except Exception as exc:
        print(f"SMTP Error: {exc}")
        print(f"\n==============================\n[OTP CODE FOR {to_email}]: {otp_code}\n==============================\n")
        return False

def _build_activity(logs):
    today = datetime.now().date()
    days = [today - timedelta(days=offset) for offset in range(6, -1, -1)]
    counts = {day: 0 for day in days}
    for log in logs:
        raw_timestamp = log['timestamp']
        if not raw_timestamp:
            continue
        try:
            log_day = datetime.fromisoformat(str(raw_timestamp).replace('Z', '')).date()
        except ValueError:
            continue
        if log_day in counts:
            counts[log_day] += 1
    return [
        {'label': day.strftime('%a'), 'date': day.isoformat(), 'count': counts[day]}
        for day in days
    ]


def _dashboard_context(search_query=''):
    conn = get_db_connection()
    if search_query:
        items = conn.execute(
            'SELECT * FROM items WHERE name LIKE ? OR code LIKE ? OR category LIKE ?',
            (f'%{search_query}%', f'%{search_query}%', f'%{search_query}%'),
        ).fetchall()
    else:
        items = conn.execute('SELECT * FROM items').fetchall()

    logs = conn.execute('SELECT * FROM usage_logs ORDER BY id DESC').fetchall()

    role = session.get('role')
    if role in ['Developer', 'Admin']:
        users = conn.execute(
            'SELECT id, email, username, role, profile_pic, approved FROM users ORDER BY id'
        ).fetchall()
    else:
        users = conn.execute(
            "SELECT id, email, username, role, profile_pic, approved FROM users WHERE role = 'Admin' AND approved = 1 ORDER BY id"
        ).fetchall()

    pending_admins = []
    pending_users = []
    if role == 'Developer':
        pending_admins = conn.execute(
            "SELECT * FROM users WHERE role = 'Admin' AND approved = 0 ORDER BY id"
        ).fetchall()
    if role in ['Developer', 'Admin']:
        pending_users = conn.execute(
            "SELECT * FROM users WHERE role = 'User' AND approved = 0 ORDER BY id"
        ).fetchall()

    current_user = conn.execute(
        'SELECT * FROM users WHERE id = ?', (session['user_id'],)
    ).fetchone()

    total_chemicals = conn.execute('SELECT COUNT(*) FROM items').fetchone()[0]
    total_logs = conn.execute('SELECT COUNT(*) FROM usage_logs').fetchone()[0]
    low_stock = conn.execute(
        'SELECT COUNT(*) FROM items WHERE quantity <= ?', (LOW_STOCK_THRESHOLD,)
    ).fetchone()[0]
    conn.close()

    stats = {
        'chemicals': total_chemicals,
        'low_stock': low_stock,
        'logs': total_logs,
        'members': len(users),
    }

    return {
        'items': items,
        'logs': logs,
        'users': users,
        'search_query': search_query,
        'current_user': current_user,
        'pending_admins': pending_admins,
        'pending_users': pending_users,
        'stats': stats,
        'activity': _build_activity(logs),
    }


@app.route('/')
def index():
    if 'user_id' not in session:
        return redirect(url_for('login'))
    return render_template('index.html', **_dashboard_context(request.args.get('q', '')))


@app.route('/api/dashboard')
def dashboard_data():
    if 'user_id' not in session:
        return _json_response(False, 'Your session has expired. Please sign in again.', 401)

    context = _dashboard_context()
    return _json_response(
        True,
        'Dashboard updated.',
        stats=context['stats'],
        activity=context['activity'],
        counts={
            'pending_admins': len(context['pending_admins']),
            'pending_users': len(context['pending_users']),
        },
        updated_at=datetime.now().strftime('%H:%M:%S'),
        inventory_html=render_template('partials/inventory_rows.html', **context),
        logs_html=render_template('partials/logs_rows.html', **context),
        users_html=render_template('partials/users_rows.html', **context),
        pending_admins_html=render_template('partials/pending_admins_rows.html', **context),
        pending_users_html=render_template('partials/pending_users_rows.html', **context),
    )

@app.route('/profile', methods=('GET', 'POST'))
def profile():
    if 'user_id' not in session:
        return redirect(url_for('login'))
        
    conn = get_db_connection()
    user = conn.execute('SELECT * FROM users WHERE id = ?', (session['user_id'],)).fetchone()
    
    error = None
    success = None
    
    if request.method == 'POST':
        new_username = request.form.get('username', '').strip()
        new_email = request.form.get('email', '').strip()
        current_password = request.form.get('current_password', '')
        new_password = request.form.get('new_password', '')

        old_profile_pic = user['profile_pic']
        profile_pic_filename = old_profile_pic
        saved_pic = None

        if not new_username or not new_email:
            error = "Username and email are required."
        elif new_password:
            if not current_password or not check_password_hash(user['password'], current_password):
                error = "Incorrect current password provided."
            elif len(new_password) < 6:
                error = "New password must be at least 6 characters long."

        file = request.files.get('profile_pic')
        if error is None and file and file.filename:
            if not _allowed_image(file.filename):
                error = "Profile picture must be a PNG, JPG, JPEG, GIF, or WEBP image."
            else:
                extension = file.filename.rsplit('.', 1)[1].lower()
                filename = f"user_{session['user_id']}_{secrets.token_hex(4)}.{extension}"
                file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
                profile_pic_filename = filename
                saved_pic = filename

        if error is None:
            try:
                if new_password:
                    hashed_pw = generate_password_hash(new_password)
                    conn.execute('''
                        UPDATE users SET username = ?, email = ?, password = ?, profile_pic = ? WHERE id = ?
                    ''', (new_username, new_email, hashed_pw, profile_pic_filename, session['user_id']))
                    success = "Profile and password updated successfully!"
                else:
                    conn.execute('''
                        UPDATE users SET username = ?, email = ?, profile_pic = ? WHERE id = ?
                    ''', (new_username, new_email, profile_pic_filename, session['user_id']))
                    success = "Profile updated successfully!"

                conn.commit()
                session['username'] = new_username
                user = conn.execute('SELECT * FROM users WHERE id = ?', (session['user_id'],)).fetchone()
                if saved_pic:
                    _remove_upload(old_profile_pic)
            except sqlite3.IntegrityError:
                conn.rollback()
                _remove_upload(saved_pic)
                error = "Username or Email is already taken by another account."

    conn.close()

    if _is_ajax() and request.method == 'POST':
        if error:
            return _json_response(False, error, 400)
        profile_pic_url = None
        if user['profile_pic'] and user['profile_pic'] != 'default.png':
            profile_pic_url = url_for('uploaded_file', filename=user['profile_pic'])
        return _json_response(
            True,
            success,
            username=user['username'],
            email=user['email'],
            profile_pic_url=profile_pic_url,
        )

    return render_template('profile.html', user=user, error=error, success=success)

@app.route('/approve/<int:user_id>', methods=('POST',))
def approve_user(user_id):
    if 'user_id' not in session:
        if _is_ajax():
            return _json_response(False, 'Please sign in again.', 401)
        return redirect(url_for('login'))

    conn = get_db_connection()
    target_user = conn.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone()
    role = session.get('role')

    if not target_user:
        conn.close()
        if _is_ajax():
            return _json_response(False, 'That account no longer exists.', 404)
        return redirect(url_for('index'))

    allowed = (
        (target_user['role'] == 'Admin' and role == 'Developer')
        or (target_user['role'] == 'User' and role in ['Developer', 'Admin'])
    )
    if not allowed:
        conn.close()
        if _is_ajax():
            return _json_response(False, 'You do not have permission to approve that account.', 403)
        return redirect(url_for('index'))

    conn.execute('UPDATE users SET approved = 1 WHERE id = ?', (user_id,))
    conn.commit()
    conn.close()

    if _is_ajax():
        return _json_response(True, f'{target_user["username"]} approved successfully.')
    return redirect(url_for('index'))


@app.route('/reject/<int:user_id>', methods=('POST',))
def reject_user(user_id):
    if 'user_id' not in session:
        if _is_ajax():
            return _json_response(False, 'Please sign in again.', 401)
        return redirect(url_for('login'))

    conn = get_db_connection()
    target_user = conn.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone()
    role = session.get('role')

    if not target_user:
        conn.close()
        if _is_ajax():
            return _json_response(False, 'That account no longer exists.', 404)
        return redirect(url_for('index'))

    allowed = (
        (target_user['role'] == 'Admin' and role == 'Developer')
        or (target_user['role'] == 'User' and role in ['Developer', 'Admin'])
    )
    if not allowed:
        conn.close()
        if _is_ajax():
            return _json_response(False, 'You do not have permission to reject that account.', 403)
        return redirect(url_for('index'))

    conn.execute('DELETE FROM users WHERE id = ?', (user_id,))
    conn.commit()
    conn.close()

    if _is_ajax():
        return _json_response(True, f'{target_user["username"]} rejected and removed.')
    return redirect(url_for('index'))

def _clear_reset_session():
    for key in ('reset_email', 'reset_otp', 'reset_otp_expires', 'reset_otp_attempts'):
        session.pop(key, None)


@app.route('/forgot-password', methods=('GET', 'POST'))
def forgot_password():
    error = None
    if request.method == 'POST':
        identifier = request.form.get('identifier', '').strip()
        conn = get_db_connection()
        user = conn.execute(
            'SELECT * FROM users WHERE (email = ? OR username = ?) AND approved = 1',
            (identifier, identifier),
        ).fetchone()
        conn.close()

        if user:
            otp = str(secrets.randbelow(900000) + 100000)
            session['reset_email'] = user['email']
            session['reset_otp'] = otp
            session['reset_otp_expires'] = time.time() + OTP_TTL_SECONDS
            session['reset_otp_attempts'] = 0
            send_otp_email(user['email'], otp)
            return redirect(url_for('verify_otp'))
        else:
            error = "No approved account found with that email or username."
            
    return render_template('forgot_password.html', error=error)


@app.route('/verify-otp', methods=('GET', 'POST'))
def verify_otp():
    if 'reset_email' not in session:
        return redirect(url_for('forgot_password'))
        
    error = None
    if request.method == 'POST':
        entered_otp = request.form.get('otp', '').strip()
        new_password = request.form.get('new_password', '')
        expected_otp = session.get('reset_otp')
        expires = session.get('reset_otp_expires', 0)
        attempts = session.get('reset_otp_attempts', 0)

        if time.time() > expires:
            _clear_reset_session()
            error = "OTP has expired. Please request a new one."
        elif attempts >= OTP_MAX_ATTEMPTS:
            _clear_reset_session()
            error = "Too many invalid OTP attempts. Please request a new one."
        elif len(new_password) < 6:
            error = "New password must be at least 6 characters long."
        elif expected_otp and secrets.compare_digest(entered_otp, expected_otp):
            hashed_pw = generate_password_hash(new_password)
            conn = get_db_connection()
            conn.execute('UPDATE users SET password = ? WHERE email = ?', (hashed_pw, session['reset_email']))
            conn.commit()
            conn.close()
            _clear_reset_session()
            flash('Password reset successful. Please sign in.', 'success')
            return redirect(url_for('login'))
        else:
            session['reset_otp_attempts'] = attempts + 1
            error = "Invalid OTP code. Please try again."
            
    return render_template('verify_otp.html', error=error)

@app.route('/login', methods=('GET', 'POST'))
def login():
    error = None
    if request.method == 'POST':
        identifier = request.form.get('identifier', '').strip()
        password = request.form.get('password', '')
        selected_role = request.form.get('role', 'Admin')

        failure_key = f"{request.remote_addr}:{identifier.lower()}"
        if _is_login_blocked(failure_key):
            error = 'Too many failed login attempts. Please wait a few minutes and try again.'
            if _is_ajax():
                return _json_response(False, error, 429)
            return render_template('login.html', error=error)

        conn = get_db_connection()
        user = conn.execute('SELECT * FROM users WHERE email = ? OR username = ?', (identifier, identifier)).fetchone()
        conn.close()
        
        if user:
            if check_password_hash(user['password'], password):
                if user['approved'] == 0:
                    error = 'Your account is pending approval by an administrator.'
                else:
                    db_role = user['role']
                    if selected_role == 'Admin' and db_role not in ['Developer', 'Admin']:
                        error = 'Access denied: This account is not registered as an Admin.'
                    elif selected_role == 'User' and db_role != 'User':
                        error = 'Access denied: This account is registered as an Admin/Developer, not a User.'
                    else:
                        LOGIN_FAILURES.pop(failure_key, None)
                        session['user_id'] = user['id']
                        session['username'] = user['username']
                        session['role'] = db_role
                        if _is_ajax():
                            return _json_response(
                                True,
                                f'Welcome back, {user["username"]}!',
                                redirect=url_for('index'),
                            )
                        return redirect(url_for('index'))
            else:
                _record_login_failure(failure_key)
                error = 'Incorrect password.'
        else:
            _record_login_failure(failure_key)
            register_url = url_for('register', email=identifier, role=selected_role)
            if _is_ajax():
                return _json_response(
                    True,
                    'No account found with those details. Opening registration...',
                    redirect=register_url,
                )
            return redirect(register_url)

    if _is_ajax() and error:
        return _json_response(False, error, 400)
    return render_template('login.html', error=error)

@app.route('/register', methods=('GET', 'POST'))
def register():
    prefill_email = request.args.get('email', '')
    prefill_role = request.args.get('role', 'User')
    if prefill_role not in ('Admin', 'User'):
        prefill_role = 'User'
    error = None
    success = None
    
    if request.method == 'POST':
        email = request.form.get('email', '').strip()
        password = request.form.get('password', '')
        username = request.form.get('username', '').strip()
        role = request.form.get('role', 'User')
        
        if role not in ('Admin', 'User'):
            error = 'Invalid role selected. Choose Admin or User.'
        elif len(password) < 6:
            error = 'Password must be at least 6 characters long.'
        elif not email or not username:
            error = 'Email and username are required.'
        else:
            hashed_pw = generate_password_hash(password)
            conn = get_db_connection()
            try:
                conn.execute('INSERT INTO users (email, username, password, role, profile_pic, approved) VALUES (?, ?, ?, ?, ?, ?)',
                             (email, username, hashed_pw, role, 'default.png', 0))
                conn.commit()
                success = f'Registration submitted successfully! Your {role} account is pending approval.'
            except sqlite3.IntegrityError:
                error = 'Email or Username is already taken.'
            finally:
                conn.close()

    if _is_ajax() and request.method == 'POST':
        if error:
            return _json_response(False, error, 400)
        flash(success, 'success')
        return _json_response(True, success, redirect=url_for('login'))

    return render_template('register.html', prefill_email=prefill_email, prefill_role=prefill_role, error=error, success=success)

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

@app.route('/add', methods=('POST',))
def add_chemical():
    if session.get('role') not in ['Developer', 'Admin']:
        if _is_ajax():
            return _json_response(False, 'You do not have permission to add chemicals.', 403)
        return redirect(url_for('index'))

    code = request.form.get('code', '').strip()
    name = request.form.get('name', '').strip()
    category = request.form.get('category', '').strip()
    quantity_raw = request.form.get('quantity', '').strip()

    try:
        quantity = int(quantity_raw)
        if quantity < 0:
            raise ValueError
    except ValueError:
        message = 'Quantity must be a non-negative whole number.'
        if _is_ajax():
            return _json_response(False, message, 400)
        flash(message, 'error')
        return redirect(url_for('index'))

    if not code or not name or not category:
        message = 'Code, name, and category are required.'
        if _is_ajax():
            return _json_response(False, message, 400)
        flash(message, 'error')
        return redirect(url_for('index'))

    conn = get_db_connection()
    conn.execute('''
        INSERT INTO items (code, name, category, quantity, price)
        VALUES (?, ?, ?, ?, ?)
    ''', (code, name, category, quantity, 0.0))
    conn.commit()
    conn.close()

    message = f'Chemical "{name}" added successfully.'
    if _is_ajax():
        return _json_response(True, message)
    flash(message, 'success')
    return redirect(url_for('index'))


@app.route('/delete/<int:id>', methods=('POST',))
def delete_chemical(id):
    if session.get('role') not in ['Developer', 'Admin']:
        if _is_ajax():
            return _json_response(False, 'You do not have permission to delete chemicals.', 403)
        return redirect(url_for('index'))

    conn = get_db_connection()
    item = conn.execute('SELECT name FROM items WHERE id = ?', (id,)).fetchone()
    if not item:
        conn.close()
        if _is_ajax():
            return _json_response(False, 'That chemical no longer exists.', 404)
        return redirect(url_for('index'))

    conn.execute('DELETE FROM items WHERE id = ?', (id,))
    conn.commit()
    conn.close()

    message = f'Chemical "{item["name"]}" deleted.'
    if _is_ajax():
        return _json_response(True, message)
    return redirect(url_for('index'))

@app.route('/remove-user/<int:user_id>', methods=('POST',))
def remove_user(user_id):
    role = session.get('role')
    if role not in ['Developer', 'Admin']:
        if _is_ajax():
            return _json_response(False, 'You do not have permission to remove members.', 403)
        return redirect(url_for('index'))

    conn = get_db_connection()
    target_user = conn.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone()

    if not target_user:
        conn.close()
        if _is_ajax():
            return _json_response(False, 'That member no longer exists.', 404)
        return redirect(url_for('index'))

    # Developers cannot be removed; only a Developer may remove an Admin.
    if target_user['role'] == 'Developer' or (
        target_user['role'] == 'Admin' and role != 'Developer'
    ):
        conn.close()
        if _is_ajax():
            return _json_response(False, 'You do not have permission to remove that member.', 403)
        return redirect(url_for('index'))

    conn.execute('DELETE FROM users WHERE id = ?', (user_id,))
    conn.commit()
    conn.close()

    message = f'{target_user["username"]} removed.'
    if _is_ajax():
        return _json_response(True, message)
    return redirect(url_for('index'))


@app.route('/use/<int:id>', methods=('POST',))
def use_stock(id):
    if 'user_id' not in session:
        if _is_ajax():
            return _json_response(False, 'Please sign in again.', 401)
        return redirect(url_for('login'))

    try:
        amount_used = float(request.form.get('amount_used', ''))
    except ValueError:
        message = 'Amount used must be a valid number.'
        if _is_ajax():
            return _json_response(False, message, 400)
        flash(message, 'error')
        return redirect(url_for('index'))

    purpose = request.form.get('purpose', '').strip()

    if not math.isfinite(amount_used) or amount_used <= 0 or not purpose:
        message = 'Enter a positive amount and a purpose.'
        if _is_ajax():
            return _json_response(False, message, 400)
        flash(message, 'error')
        return redirect(url_for('index'))

    conn = get_db_connection()
    item = conn.execute('SELECT * FROM items WHERE id = ?', (id,)).fetchone()

    if not item:
        conn.close()
        message = 'Chemical not found.'
        if _is_ajax():
            return _json_response(False, message, 404)
        flash(message, 'error')
        return redirect(url_for('index'))

    if amount_used > item['quantity']:
        conn.close()
        message = f'Cannot use {amount_used} L; only {item["quantity"]} L in stock.'
        if _is_ajax():
            return _json_response(False, message, 400)
        flash(message, 'error')
        return redirect(url_for('index'))

    new_qty = item['quantity'] - amount_used
    conn.execute('UPDATE items SET quantity = ? WHERE id = ?', (new_qty, id))
    conn.execute('''
        INSERT INTO usage_logs (chemical_name, amount_used, purpose, username)
        VALUES (?, ?, ?, ?)
    ''', (item['name'], amount_used, purpose, session['username']))
    conn.commit()
    conn.close()

    message = f'Logged {amount_used} L of {item["name"]}.'
    if _is_ajax():
        return _json_response(True, message, quantity=new_qty, item_name=item['name'])
    flash(message, 'success')
    return redirect(url_for('index'))


init_db()


def _find_available_port(host, preferred, attempts=20):
    for offset in range(attempts):
        port = preferred + offset
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            try:
                sock.bind((host, port))
            except OSError:
                continue
            return port
    return preferred


def _find_running_instance(host, preferred, attempts=20):
    for offset in range(attempts):
        port = preferred + offset
        try:
            with socket.create_connection((host, port), timeout=0.4) as sock:
                request = (
                    f'GET /login HTTP/1.0\r\nHost: {host}:{port}\r\n'
                    'Connection: close\r\n\r\n'
                )
                sock.sendall(request.encode('ascii'))
                chunks = []
                received = 0
                while received < 65536:
                    chunk = sock.recv(4096)
                    if not chunk:
                        break
                    chunks.append(chunk)
                    received += len(chunk)
            response = b''.join(chunks).decode('latin-1', 'ignore')
            if 'x-chemstore: 1' in response.lower():
                return port
        except OSError:
            continue
    return None


def _get_lan_addresses():
    addresses = set()
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET, socket.SOCK_STREAM):
            ip = info[4][0]
            if not ip.startswith('127.') and not ip.startswith('169.254.'):
                addresses.add(ip)
    except OSError:
        pass

    if not addresses:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
                sock.connect(('8.8.8.8', 80))
                addresses.add(sock.getsockname()[0])
        except OSError:
            pass

    return sorted(addresses)


def _print_access_urls(port):
    local_url = f'http://{APP_HOST}:{port}'
    print(f'\nLocal access:  {local_url}')

    if APP_BIND_HOST in ('0.0.0.0', '::'):
        lan_addresses = _get_lan_addresses()
        if lan_addresses:
            print('Mobile access (same Wi-Fi network):')
            for ip in lan_addresses:
                print(f'  http://{ip}:{port}')
        else:
            print('Mobile access: connect this computer to Wi-Fi/Ethernet to get a network address.')
        print('If your phone cannot connect, allow this app through Windows Firewall for private networks.')
    else:
        print(f'LAN/mobile access is disabled (CHEMSTORE_HOST={APP_BIND_HOST}).')
    print()


def _open_browser_when_ready(url, host, port, timeout=20):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection((host, port), timeout=0.5):
                break
        except OSError:
            time.sleep(0.2)
    print(f"Opening {url} in your browser...")
    if not webbrowser.open(url):
        print(f"Could not open a browser automatically. Please open {url} manually.")


if __name__ == '__main__':
    debug = os.environ.get('FLASK_DEBUG', '0') == '1'
    open_browser = os.environ.get('CHEMSTORE_NO_BROWSER', '0') != '1'

    if open_browser:
        running_port = _find_running_instance(APP_HOST, APP_PORT)
        if running_port is not None:
            webbrowser.open(f'http://{APP_HOST}:{running_port}')
            sys.exit(0)

    port = _find_available_port(APP_BIND_HOST, APP_PORT)
    url = f'http://{APP_HOST}:{port}'
    if open_browser:
        threading.Thread(
            target=_open_browser_when_ready,
            args=(url, APP_HOST, port),
            daemon=True,
        ).start()
    _print_access_urls(port)
    app.run(host=APP_BIND_HOST, port=port, debug=debug)