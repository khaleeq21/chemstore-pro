import React, { useState, useEffect } from 'react';
import {
    Shield,
    FlaskConical,
    AlertTriangle,
    Plus,
    Trash2,
    Search,
    LogOut,
    Download,
    X,
    Lock,
    User,
    CheckCircle2,
    Mail,
    Clock,
    UserCheck,
    UserX,
    ShieldCheck,
    Settings,
    UserPlus,
    Key,
    Save
} from 'lucide-react';

// Returns current Pakistan Standard Time (UTC+5) formatted for datetime-local inputs
const getPKTNow = () => {
    const now = new Date();
    // PKT is UTC+5 (no DST)
    const pktOffset = 5 * 60; // minutes
    const localOffset = now.getTimezoneOffset(); // minutes behind UTC (negative for ahead)
    const pktTime = new Date(now.getTime() + (pktOffset + localOffset) * 60000);
    return pktTime.toISOString().slice(0, 16);
};

export default function App() {
    // Auth states
    const [token, setToken] = useState(localStorage.getItem('token') || null);
    const [userId, setUserId] = useState(localStorage.getItem('userId') || null);
    const [role, setRole] = useState(localStorage.getItem('role') || 'Viewer');
    const [username, setUsername] = useState(localStorage.getItem('username') || '');
    const [email, setEmail] = useState(localStorage.getItem('email') || '');
    const [userStatus, setUserStatus] = useState(localStorage.getItem('userStatus') || 'approved');
    const [requestedRole, setRequestedRole] = useState(localStorage.getItem('requestedRole') || 'Viewer');
    const [authMode, setAuthMode] = useState('login'); // 'login' or 'register'

    // Form states for Auth
    const [authForm, setAuthForm] = useState({ username: '', email: '', password: '', requestedRole: 'Viewer', devKey: '' });
    const [authError, setAuthError] = useState('');
    const [authSuccess, setAuthSuccess] = useState('');

    // Profile Settings States (Developer / User account credentials update)
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [profileForm, setProfileForm] = useState({ username: '', email: '', newPassword: '' });
    const [profileError, setProfileError] = useState('');
    const [profileSuccess, setProfileSuccess] = useState('');

    // Add User Modal States (Developer / Admin direct user creation)
    const [showAddUserModal, setShowAddUserModal] = useState(false);
    const [newUserForm, setNewUserForm] = useState({ username: '', email: '', password: '', role: 'Viewer' });
    const [addUserError, setAddUserError] = useState('');

    // Data states
    const [chemicals, setChemicals] = useState([]);
    const [usageLogs, setUsageLogs] = useState([]);
    const [usersList, setUsersList] = useState([]);
    const [userSearchQuery, setUserSearchQuery] = useState('');

    // Filters & Search
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedHazard, setSelectedHazard] = useState('All');

    // Modals
    const [showAddModal, setShowAddModal] = useState(false);
    const [showUseModal, setShowUseModal] = useState(false);
    const [activeChemForUse, setActiveChemForUse] = useState(null);
    const [viewingSdsItem, setViewingSdsItem] = useState(null);
    const [activeTab, setActiveTab] = useState('inventory');

    // Form States for Add Chemical
    const [newChem, setNewChem] = useState({
        code: '', name: '', formula: '', cas: '', category: 'Solvent',
        quantity: 100, unit: 'L', minThreshold: 20, hazard: 'Moderate',
        zone: 'Zone A - General', expiryDate: '2027-12-31', supplier: '', precautions: ''
    });

    // Form States for Use Stock
    const [useForm, setUseForm] = useState({
        used_amount: '',
        operator: '',
        department: 'Laboratory A',
        purpose: '',
        timestamp: getPKTNow()
    });

    useEffect(() => {
        if (token) {
            fetchChemicals();
            fetchUsageLogs();
            if (role === 'Admin' || role === 'Developer') {
                fetchUsers();
            }
        }
    }, [token, role]);

    const fetchChemicals = async () => {
        try {
            const res = await fetch('/api/chemicals');
            const data = await res.json();
            setChemicals(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Failed to fetch chemicals', err);
        }
    };

    const fetchUsageLogs = async () => {
        try {
            const res = await fetch('/api/usage');
            const data = await res.json();
            setUsageLogs(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Failed to fetch usage logs', err);
        }
    };

    const fetchUsers = async () => {
        try {
            const res = await fetch('/api/users');
            if (res.ok) {
                const data = await res.json();
                setUsersList(Array.isArray(data) ? data : []);
            }
        } catch (err) {
            console.error('Failed to fetch users', err);
        }
    };

    const handleUpdateUserRole = async (userId, targetUsername, newRole, newStatus) => {
        try {
            const res = await fetch(`/api/users/${userId}/role`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: newRole, status: newStatus, approverRole: role })
            });
            const data = await res.json();
            if (res.ok) {
                fetchUsers();
            } else {
                alert(data.error || 'Failed to update user role');
            }
        } catch (err) {
            console.error('Error updating user role', err);
            alert('Server error updating user role.');
        }
    };

    const handleDeleteUser = async (userId, targetUsername) => {
        if (!window.confirm(`Are you sure you want to delete user "${targetUsername}"?`)) return;
        try {
            const res = await fetch(`/api/users/${userId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-role': role
                }
            });
            const data = await res.json();
            if (res.ok) {
                fetchUsers();
            } else {
                alert(data.error || 'Failed to delete user');
            }
        } catch (err) {
            console.error('Error deleting user', err);
            alert('Server error deleting user.');
        }
    };

    const handlePurgeAllUsers = async () => {
        if (!window.confirm('⚠️ WARNING: This will permanently delete ALL users from the database except the Developer master account. Are you sure you want to proceed?')) return;
        try {
            const res = await fetch('/api/users/purge-all', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ approverRole: role })
            });
            const data = await res.json();
            if (res.ok) {
                alert(data.message || 'Users purged successfully.');
                fetchUsers();
            } else {
                alert(data.error || 'Failed to purge users.');
            }
        } catch (err) {
            console.error('Error purging users', err);
            alert('Server error purging users.');
        }
    };

    // Handle Login & Registration Submission
    const handleAuthSubmit = async (e) => {
        e.preventDefault();
        setAuthError('');
        setAuthSuccess('');

        const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';

        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(authForm)
            });
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Authentication failed');
            }

            if (authMode === 'register') {
                setAuthSuccess(data.message || 'Registration successful! Please log in.');
                setAuthMode('login');
                setAuthForm({ username: '', email: '', password: '', requestedRole: 'Viewer' });
            } else {
                setToken(data.token);
                setRole(data.role);
                setUsername(data.username);
                setEmail(data.email || '');
                setUserStatus(data.status || 'approved');
                setRequestedRole(data.requestedRole || data.role);
                localStorage.setItem('token', data.token);
                localStorage.setItem('role', data.role);
                localStorage.setItem('username', data.username);
                localStorage.setItem('email', data.email || '');
                localStorage.setItem('userStatus', data.status || 'approved');
                localStorage.setItem('requestedRole', data.requestedRole || data.role);
            }
        } catch (err) {
            setAuthError(err.message);
        }
    };

    const handleLogout = () => {
        setToken(null);
        setRole('Viewer');
        setUsername('');
        setEmail('');
        setUserStatus('approved');
        setRequestedRole('Viewer');
        localStorage.clear();
    };

    // Add Chemical Submission
    const handleAddChemical = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch('/api/chemicals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newChem)
            });
            if (res.ok) {
                setShowAddModal(false);
                fetchChemicals();
            }
        } catch (err) {
            console.error('Error adding chemical', err);
        }
    };

    // Use Stock Submission
    const handleUseSubmit = async (e) => {
        e.preventDefault();
        if (!activeChemForUse) return;

        try {
            const res = await fetch('/api/usage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chemical_id: activeChemForUse.id,
                    used_amount: parseFloat(useForm.used_amount),
                    operator: useForm.operator || username,
                    department: useForm.department,
                    purpose: useForm.purpose,
                    timestamp: useForm.timestamp
                })
            });
            const data = await res.json();

            if (res.ok) {
                setShowUseModal(false);
                setActiveChemForUse(null);
                setUseForm({ used_amount: '', operator: '', department: 'Laboratory A', purpose: '', timestamp: getPKTNow() });
                fetchChemicals();
                fetchUsageLogs();
            } else {
                alert(data.error || 'Failed to log stock usage');
            }
        } catch (err) {
            console.error('Error logging usage', err);
            alert('Server error while recording chemical usage.');
        }
    };

    const handleDeleteChemical = async (id) => {
        if (!window.confirm('Are you sure you want to delete this chemical record?')) return;
        try {
            const res = await fetch(`/api/chemicals/${id}`, { method: 'DELETE' });
            if (res.ok) fetchChemicals();
        } catch (err) {
            console.error('Error deleting chemical', err);
        }
    };

    // Filtered inventory
    const filteredChemicals = chemicals.filter(chem => {
        const matchesSearch = chem.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            chem.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
            chem.cas.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesHazard = selectedHazard === 'All' || chem.hazard === selectedHazard;
        return matchesSearch && matchesHazard;
    });

    // IF NOT LOGGED IN, SHOW LOGIN / REGISTER PAGE
    if (!token) {
        return (
            <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
                <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl w-full max-w-md shadow-2xl space-y-6">
                    <div className="flex flex-col items-center text-center space-y-2">
                        <div className="bg-blue-600/20 p-3 rounded-xl border border-blue-500/30">
                            <FlaskConical className="w-8 h-8 text-blue-400" />
                        </div>
                        <h1 className="text-2xl font-bold tracking-tight text-white">ChemStore Pro</h1>
                        <p className="text-xs text-slate-400">Chemical Warehouse Management & Stock Tracking</p>
                    </div>

                    {/* Mode Switch Tabs */}
                    <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
                        <button
                            onClick={() => { setAuthMode('login'); setAuthError(''); setAuthSuccess(''); }}
                            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${authMode === 'login' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                        >
                            Sign In
                        </button>
                        <button
                            onClick={() => { setAuthMode('register'); setAuthError(''); setAuthSuccess(''); }}
                            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${authMode === 'register' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                        >
                            Register
                        </button>
                    </div>

                    {authError && (
                        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-3 rounded-xl text-xs">
                            {authError}
                        </div>
                    )}

                    {authSuccess && (
                        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3 rounded-xl text-xs flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4" /> {authSuccess}
                        </div>
                    )}

                    <form onSubmit={handleAuthSubmit} className="space-y-4 text-sm">
                        {authMode === 'register' ? (
                            <>
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1">Username</label>
                                    <div className="relative">
                                        <User className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                                        <input
                                            type="text"
                                            required
                                            placeholder="Choose a username"
                                            value={authForm.username}
                                            onChange={(e) => setAuthForm({ ...authForm, username: e.target.value })}
                                            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1">Email Address</label>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                                        <input
                                            type="email"
                                            required
                                            placeholder="your.email@company.com"
                                            value={authForm.email}
                                            onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                                            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1">Password</label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                                        <input
                                            type="password"
                                            required
                                            placeholder="Minimum 6 characters"
                                            value={authForm.password}
                                            onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                                            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2 pt-1">
                                    <label className="block text-xs font-medium text-slate-400">Account Access Level</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setAuthForm({ ...authForm, requestedRole: 'Viewer' })}
                                            className={`p-2.5 rounded-xl border text-left transition-all ${authForm.requestedRole === 'Viewer' ? 'bg-blue-600/15 border-blue-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'}`}
                                        >
                                            <div className="text-xs font-semibold text-white">Viewer</div>
                                            <div className="text-[10px] text-slate-400">Approved by Admin</div>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setAuthForm({ ...authForm, requestedRole: 'Admin' })}
                                            className={`p-2.5 rounded-xl border text-left transition-all ${authForm.requestedRole === 'Admin' ? 'bg-amber-500/15 border-amber-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'}`}
                                        >
                                            <div className="text-xs font-semibold text-amber-400 flex items-center gap-1">
                                                Admin <Shield className="w-3 h-3" />
                                            </div>
                                            <div className="text-[10px] text-slate-400">Approved by Developer</div>
                                        </button>
                                    </div>
                                    {authForm.requestedRole === 'Admin' ? (
                                        <p className="text-[11px] text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5 flex items-start gap-1.5">
                                            <Clock className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                                            <span><strong>Developer Approval Required:</strong> Administrator registrations must be approved by the Developer before administrative powers are unlocked.</span>
                                        </p>
                                    ) : (
                                        <p className="text-[11px] text-blue-400/90 bg-blue-500/10 border border-blue-500/20 rounded-lg p-2.5 flex items-start gap-1.5">
                                            <Clock className="w-3.5 h-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
                                            <span><strong>Admin Approval Required:</strong> Viewer registrations must be approved by an Administrator or Developer before warehouse access is permitted.</span>
                                        </p>
                                    )}
                                </div>
                            </>
                        ) : (
                            <>
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1">Username or Email</label>
                                    <div className="relative">
                                        <User className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                                        <input
                                            type="text"
                                            required
                                            placeholder="Enter your username or email"
                                            value={authForm.username}
                                            onChange={(e) => setAuthForm({ ...authForm, username: e.target.value })}
                                            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1">Password</label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                                        <input
                                            type="password"
                                            required
                                            placeholder="••••••••"
                                            value={authForm.password}
                                            onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                                            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
                                        />
                                    </div>
                                </div>
                            </>
                        )}

                        <button
                            type="submit"
                            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2.5 rounded-xl text-sm shadow-lg transition-all"
                        >
                            {authMode === 'login' ? 'Sign In to Dashboard' : 'Submit Registration'}
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    // LOGGED IN DASHBOARD
    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
            {/* Top Navbar */}
            <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between shadow-md">
                <div className="flex items-center space-x-3">
                    <div className="bg-blue-600/20 p-2 rounded-lg border border-blue-500/30">
                        <FlaskConical className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight text-white">ChemStore Pro</h1>
                        <p className="text-xs text-slate-400">Chemical Warehouse Stock & Usage Management System</p>
                    </div>
                </div>

                <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2 bg-slate-800 px-3 py-1.5 rounded-full border border-slate-700">
                        <Shield className={`w-4 h-4 ${role === 'Developer' ? 'text-purple-400' : role === 'Admin' ? 'text-amber-400' : 'text-blue-400'}`} />
                        <span className="text-xs font-medium text-slate-300">
                            {username} (<strong className={`${role === 'Developer' ? 'text-purple-300' : role === 'Admin' ? 'text-amber-300' : 'text-white'}`}>{role}</strong>)
                        </span>
                    </div>

                    <button
                        onClick={handleLogout}
                        className="flex items-center space-x-1.5 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg text-xs font-semibold transition-all"
                    >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Logout</span>
                    </button>
                </div>
            </header>

            {/* Main Content Area */}
            <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">

                {/* Pending Approval Notice for Viewers who requested Admin privileges */}
                {requestedRole === 'Admin' && role !== 'Admin' && role !== 'Developer' && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-200 shadow-lg">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-amber-500/20 rounded-xl">
                                <Clock className="w-5 h-5 text-amber-400 flex-shrink-0" />
                            </div>
                            <div>
                                <h4 className="font-semibold text-sm text-white">Administrator Access Request Pending Developer Approval</h4>
                                <p className="text-xs text-amber-300/80">You registered requesting Administrator privileges. Your account must be approved by the Developer before Admin permissions are granted. You are currently in read-only Viewer mode.</p>
                            </div>
                        </div>
                        <span className="text-xs font-semibold px-3 py-1 bg-amber-500/20 text-amber-300 rounded-full border border-amber-500/30 whitespace-nowrap">
                            Awaiting Developer Approval
                        </span>
                    </div>
                )}

                {/* Quick KPI Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
                        <p className="text-xs text-slate-400 font-medium">Total Chemicals</p>
                        <h3 className="text-2xl font-bold text-white mt-1">{chemicals.length}</h3>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
                        <p className="text-xs text-slate-400 font-medium">Low Stock Alerts</p>
                        <h3 className="text-2xl font-bold text-amber-400 mt-1">
                            {chemicals.filter(c => c.quantity <= c.minThreshold).length}
                        </h3>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
                        <p className="text-xs text-slate-400 font-medium">Total Usage Logs</p>
                        <h3 className="text-2xl font-bold text-blue-400 mt-1">{usageLogs.length}</h3>
                    </div>
                    {(role === 'Admin' || role === 'Developer') ? (
                        <div 
                            onClick={() => setActiveTab('users')}
                            className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm cursor-pointer hover:border-slate-700 transition-all"
                        >
                            <p className="text-xs text-slate-400 font-medium flex items-center justify-between">
                                <span>{role === 'Developer' ? 'Pending Dev Approvals' : 'Pending Registrations'}</span>
                                {usersList.filter(u => u.status?.startsWith('pending') || (u.requestedRole === 'Admin' && u.role !== 'Admin')).length > 0 && (
                                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
                                )}
                            </p>
                            <h3 className={`text-2xl font-bold mt-1 ${usersList.filter(u => u.status?.startsWith('pending') || (u.requestedRole === 'Admin' && u.role !== 'Admin')).length > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                                {role === 'Developer' 
                                    ? usersList.filter(u => (u.requestedRole === 'Admin' && u.role !== 'Admin') || u.status === 'pending_dev' || u.status === 'pending_admin').length
                                    : usersList.filter(u => u.status === 'pending_admin' || (u.requestedRole === 'Viewer' && u.status !== 'approved')).length
                                }
                            </h3>
                        </div>
                    ) : (
                        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
                            <p className="text-xs text-slate-400 font-medium">High / Extreme Hazards</p>
                            <h3 className="text-2xl font-bold text-rose-400 mt-1">
                                {chemicals.filter(c => c.hazard === 'High' || c.hazard === 'Extreme').length}
                            </h3>
                        </div>
                    )}
                </div>

                {/* Navigation Tabs */}
                <div className="flex border-b border-slate-800 space-x-6">
                    <button
                        onClick={() => setActiveTab('inventory')}
                        className={`pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'inventory' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
                    >
                        Chemical Inventory Matrix
                    </button>
                    <button
                        onClick={() => setActiveTab('usage')}
                        className={`pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'usage' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
                    >
                        Usage & Consumption Logs
                    </button>
                    {(role === 'Admin' || role === 'Developer') && (
                        <button
                            onClick={() => setActiveTab('users')}
                            className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'users' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
                        >
                            <span>User Access & Approvals</span>
                            {usersList.filter(u => u.status?.startsWith('pending') || (u.requestedRole === 'Admin' && u.role !== 'Admin')).length > 0 && (
                                <span className="bg-amber-500 text-slate-950 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                    {usersList.filter(u => u.status?.startsWith('pending') || (u.requestedRole === 'Admin' && u.role !== 'Admin')).length}
                                </span>
                            )}
                        </button>
                    )}
                </div>

                {/* TAB 1: INVENTORY */}
                {activeTab === 'inventory' && (
                    <div className="space-y-4">
                        <div className="flex flex-col md:flex-row justify-between gap-4 items-center bg-slate-900 p-4 rounded-xl border border-slate-800">
                            <div className="relative w-full md:w-72">
                                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Search name, code, CAS..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                                />
                            </div>

                            <div className="flex items-center gap-3 w-full md:w-auto">
                                <select
                                    value={selectedHazard}
                                    onChange={(e) => setSelectedHazard(e.target.value)}
                                    className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none"
                                >
                                    <option value="All">All Hazards</option>
                                    <option value="Low">Low</option>
                                    <option value="Moderate">Moderate</option>
                                    <option value="High">High</option>
                                    <option value="Extreme">Extreme</option>
                                </select>

                                {(role === 'Admin' || role === 'Developer') && (
                                    <button
                                        onClick={() => setShowAddModal(true)}
                                        className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg transition-all"
                                    >
                                        <Plus className="w-4 h-4" />
                                        <span>Add Chemical</span>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Inventory Table */}
                        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-slate-950/60 border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                                            <th className="p-4">Code / CAS</th>
                                            <th className="p-4">Chemical Name</th>
                                            <th className="p-4">Category</th>
                                            <th className="p-4">Current Stock</th>
                                            <th className="p-4">Hazard Level</th>
                                            <th className="p-4">Storage Zone</th>
                                            <th className="p-4 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800 text-sm">
                                        {filteredChemicals.map((chem) => {
                                            const isLow = chem.quantity <= chem.minThreshold;
                                            return (
                                                <tr key={chem.id} className="hover:bg-slate-850/50 transition-colors">
                                                    <td className="p-4 font-mono text-slate-300">
                                                        <div>{chem.code}</div>
                                                        <div className="text-xs text-slate-500">{chem.cas}</div>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="font-semibold text-white">{chem.name}</div>
                                                        <div className="text-xs text-slate-400">{chem.formula}</div>
                                                    </td>
                                                    <td className="p-4 text-slate-300">{chem.category}</td>
                                                    <td className="p-4">
                                                        <div className={`font-bold ${isLow ? 'text-amber-400 flex items-center gap-1.5' : 'text-white'}`}>
                                                            {chem.quantity} {chem.unit}
                                                            {isLow && <span title="Below minimum safety threshold"><AlertTriangle className="w-4 h-4 text-amber-400" /></span>}
                                                        </div>
                                                        <div className="text-xs text-slate-500">Min: {chem.minThreshold} {chem.unit}</div>
                                                    </td>
                                                    <td className="p-4">
                                                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${chem.hazard === 'Extreme' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                                                            chem.hazard === 'High' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' :
                                                                chem.hazard === 'Moderate' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                                                                    'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                                            }`}>
                                                            {chem.hazard}
                                                        </span>
                                                    </td>
                                                    <td className="p-4 text-slate-300 text-xs">{chem.zone}</td>
                                                    <td className="p-4 text-right space-x-2">
                                                        <button
                                                            onClick={() => setViewingSdsItem(chem)}
                                                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium"
                                                        >
                                                            SDS
                                                        </button>
                                                        {(role === 'Admin' || role === 'Developer') && (
                                                            <>
                                                                <button
                                                                    onClick={() => { setActiveChemForUse(chem); setShowUseModal(true); }}
                                                                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium"
                                                                >
                                                                    Use Stock
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDeleteChemical(chem.id)}
                                                                    className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            </>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB 2: USAGE LOGS */}
                {activeTab === 'usage' && (
                    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
                        <div className="p-4 border-b border-slate-800 flex justify-between items-center">
                            <h3 className="font-semibold text-white">Chemical Consumption & Usage Ledger</h3>
                            <button
                                onClick={() => window.print()}
                                className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-medium"
                            >
                                <Download className="w-4 h-4" />
                                <span>Export Report</span>
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-950/60 border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                                        <th className="p-4">Timestamp</th>
                                        <th className="p-4">Chemical</th>
                                        <th className="p-4">Amount Used</th>
                                        <th className="p-4">Previous Stock</th>
                                        <th className="p-4">Remaining Stock</th>
                                        <th className="p-4">Operator</th>
                                        <th className="p-4">Department / Purpose</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800 text-sm">
                                    {usageLogs.map((log) => (
                                        <tr key={log.id} className="hover:bg-slate-850/50">
                                            <td className="p-4 text-xs font-mono text-slate-400">{log.timestamp}</td>
                                            <td className="p-4 font-semibold text-white">
                                                {log.chemical_name} <span className="text-xs font-mono text-slate-500">({log.chemical_code})</span>
                                            </td>
                                            <td className="p-4 text-rose-400 font-bold">-{log.used_amount} {log.unit}</td>
                                            <td className="p-4 text-slate-300">{log.prev_quantity} {log.unit}</td>
                                            <td className="p-4 text-emerald-400 font-semibold">{log.remaining_quantity} {log.unit}</td>
                                            <td className="p-4 text-slate-300">{log.operator}</td>
                                            <td className="p-4 text-xs text-slate-400">
                                                <span className="font-medium text-slate-300">{log.department}</span>: {log.purpose}
                                            </td>
                                        </tr>
                                    ))}
                                    {usageLogs.length === 0 && (
                                        <tr>
                                            <td colSpan="7" className="p-8 text-center text-slate-500">No usage logs recorded yet.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* TAB 3: USER PERMISSIONS & APPROVALS (ADMIN & DEVELOPER) */}
                {activeTab === 'users' && (role === 'Admin' || role === 'Developer') && (
                    <div className="space-y-6">
                        {/* Summary & Search Header */}
                        <div className="flex flex-col md:flex-row justify-between gap-4 items-center bg-slate-900 p-4 rounded-xl border border-slate-800">
                            <div>
                                <h3 className="font-semibold text-white text-base flex items-center gap-2">
                                    <span>User Access & Approvals</span>
                                    {role === 'Developer' && (
                                        <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-full font-bold">
                                            Developer Master Control
                                        </span>
                                    )}
                                    {role === 'Admin' && (
                                        <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">
                                            Administrator Console
                                        </span>
                                    )}
                                </h3>
                                <p className="text-xs text-slate-400">
                                    {role === 'Developer'
                                        ? 'Master Developer authority: Approve Administrator registrations, approve Viewer registrations, remove users, or purge legacy accounts.'
                                        : 'Administrator panel: Approve new user registrations, remove Viewers, and manage warehouse access. (Admin elevation requires Developer approval).'
                                    }
                                </p>
                            </div>

                            <div className="flex items-center gap-3 w-full md:w-auto">
                                <div className="relative w-full md:w-64">
                                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="Search username or email..."
                                        value={userSearchQuery}
                                        onChange={(e) => setUserSearchQuery(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                                    />
                                </div>

                                {role === 'Developer' && (
                                    <button
                                        onClick={handlePurgeAllUsers}
                                        title="Delete all users except the Developer master account"
                                        className="flex items-center space-x-1.5 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 px-3 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap shadow-sm"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        <span>Purge All Users</span>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Pending Requests Alert Banners */}
                        {usersList.filter(u => (u.requestedRole === 'Admin' && u.role !== 'Admin') || u.status === 'pending_dev').length > 0 && (
                            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center justify-between text-amber-200">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-amber-500/20 rounded-lg">
                                        <Clock className="w-5 h-5 text-amber-400" />
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-sm text-white">
                                            {usersList.filter(u => (u.requestedRole === 'Admin' && u.role !== 'Admin') || u.status === 'pending_dev').length} Administrator Registration(s) Awaiting Developer Approval
                                        </h4>
                                        <p className="text-xs text-amber-300/80">
                                            {role === 'Developer'
                                                ? 'These users registered requesting Administrator privileges. As Developer, your review and authorization is required.'
                                                : 'These users requested Administrator privileges. Only the Developer has the authority to grant Admin rights.'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {usersList.filter(u => u.status === 'pending_admin' || (u.requestedRole === 'Viewer' && u.status !== 'approved')).length > 0 && (
                            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 flex items-center justify-between text-blue-200">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-blue-500/20 rounded-lg">
                                        <Clock className="w-5 h-5 text-blue-400" />
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-sm text-white">
                                            {usersList.filter(u => u.status === 'pending_admin' || (u.requestedRole === 'Viewer' && u.status !== 'approved')).length} New User Registration(s) Awaiting Approval
                                        </h4>
                                        <p className="text-xs text-blue-300/80">
                                            New users have registered and require approval from an Administrator or Developer to access the warehouse system.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Users Table */}
                        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-slate-950/60 border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                                            <th className="p-4">User / Email</th>
                                            <th className="p-4">Registered Date</th>
                                            <th className="p-4">Requested Role</th>
                                            <th className="p-4">Current Access</th>
                                            <th className="p-4">Approval Status</th>
                                            <th className="p-4 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800 text-sm">
                                        {usersList
                                            .filter(u => 
                                                u.username?.toLowerCase().includes(userSearchQuery.toLowerCase()) || 
                                                (u.email && u.email.toLowerCase().includes(userSearchQuery.toLowerCase()))
                                            )
                                            .map((u) => {
                                                const isSelf = u.username === username;
                                                const isMasterDev = u.id === 1 || u.role === 'Developer';
                                                const isPendingAdminElev = (u.requestedRole === 'Admin' && u.role !== 'Admin') || u.status === 'pending_dev';
                                                const isPendingViewerReg = u.status === 'pending_admin' || (u.requestedRole === 'Viewer' && u.status !== 'approved');

                                                // Deletion permission:
                                                // - Developer can delete anyone except Master Dev (id: 1)
                                                // - Admin can delete Viewers (cannot delete Developer or another Admin)
                                                const canDelete = !isMasterDev && !isSelf && (
                                                    role === 'Developer' || (role === 'Admin' && u.role !== 'Admin' && u.role !== 'Developer')
                                                );

                                                return (
                                                    <tr key={u.id} className="hover:bg-slate-850/50 transition-colors">
                                                        <td className="p-4">
                                                             <div className="font-semibold text-white flex items-center gap-2">
                                                                <User className="w-4 h-4 text-slate-400" />
                                                                <span>{u.username}</span>
                                                                {isMasterDev && (
                                                                    <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-full font-mono font-bold">
                                                                        Developer Master
                                                                    </span>
                                                                )}
                                                                {isSelf && !isMasterDev && (
                                                                    <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full font-mono">
                                                                        You
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                                                                <Mail className="w-3.5 h-3.5 text-slate-500" />
                                                                <span>{u.email || 'No email provided'}</span>
                                                            </div>
                                                        </td>
                                                        <td className="p-4 text-xs font-mono text-slate-400">
                                                            {u.createdAt || 'N/A'}
                                                        </td>
                                                        <td className="p-4">
                                                            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                                                                u.requestedRole === 'Admin' 
                                                                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' 
                                                                    : 'bg-slate-800 text-slate-300'
                                                            }`}>
                                                                {u.requestedRole || 'Viewer'}
                                                            </span>
                                                        </td>
                                                        <td className="p-4">
                                                            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full inline-flex items-center gap-1 ${
                                                                u.role === 'Developer'
                                                                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                                                    : u.role === 'Admin' 
                                                                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                                                                        : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                                            }`}>
                                                                <Shield className="w-3.5 h-3.5" />
                                                                {u.role}
                                                            </span>
                                                        </td>
                                                        <td className="p-4">
                                                            {isPendingAdminElev ? (
                                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                                                    <Clock className="w-3.5 h-3.5" />
                                                                    Pending Dev Approval
                                                                </span>
                                                            ) : isPendingViewerReg ? (
                                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30">
                                                                    <Clock className="w-3.5 h-3.5" />
                                                                    Pending Approval
                                                                </span>
                                                            ) : u.status === 'rejected' ? (
                                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/20 text-rose-400 border border-rose-500/30">
                                                                    <X className="w-3.5 h-3.5" />
                                                                    Denied
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                                                    Approved
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="p-4 text-right space-x-2">
                                                            {/* 1. Standard Viewer Registration Approval (Admin & Developer can approve) */}
                                                            {isPendingViewerReg && (
                                                                <>
                                                                    <button
                                                                        onClick={() => handleUpdateUserRole(u.id, u.username, 'Viewer', 'approved')}
                                                                        title="Approve user registration"
                                                                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition-all shadow inline-flex items-center gap-1"
                                                                    >
                                                                        <UserCheck className="w-3.5 h-3.5" />
                                                                        <span>Approve Registration</span>
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleUpdateUserRole(u.id, u.username, 'Viewer', 'rejected')}
                                                                        title="Deny registration"
                                                                        className="px-2.5 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 rounded-lg text-xs font-medium transition-all"
                                                                    >
                                                                        Deny
                                                                    </button>
                                                                </>
                                                            )}

                                                            {/* 2. Admin Elevation: ONLY Developer can grant Admin role */}
                                                            {isPendingAdminElev && (
                                                                role === 'Developer' ? (
                                                                    <>
                                                                        <button
                                                                            onClick={() => handleUpdateUserRole(u.id, u.username, 'Admin', 'approved')}
                                                                            title="Approve Administrator privileges"
                                                                            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-medium transition-all shadow inline-flex items-center gap-1"
                                                                        >
                                                                            <ShieldCheck className="w-3.5 h-3.5" />
                                                                            <span>Allow Admin</span>
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleUpdateUserRole(u.id, u.username, 'Viewer', 'approved')}
                                                                            title="Keep as Viewer instead of Admin"
                                                                            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-all"
                                                                        >
                                                                            Keep Viewer
                                                                        </button>
                                                                    </>
                                                                ) : (
                                                                    <span className="text-[11px] font-medium text-amber-400/90 bg-amber-500/10 px-2 py-1 rounded-md border border-amber-500/20">
                                                                        Requires Developer Approval
                                                                    </span>
                                                                )
                                                            )}

                                                            {/* 3. Demote Admin to Viewer (Developer only) */}
                                                            {u.role === 'Admin' && !isMasterDev && role === 'Developer' && (
                                                                <button
                                                                    onClick={() => handleUpdateUserRole(u.id, u.username, 'Viewer', 'approved')}
                                                                    title="Demote to Viewer"
                                                                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-all inline-flex items-center gap-1"
                                                                >
                                                                    <UserX className="w-3.5 h-3.5" />
                                                                    <span>Demote to Viewer</span>
                                                                </button>
                                                            )}

                                                            {/* 4. Delete User Account: Admin can delete Viewers, Developer can delete anyone except Master Dev */}
                                                            {canDelete && (
                                                                <button
                                                                    onClick={() => handleDeleteUser(u.id, u.username)}
                                                                    title={`Remove user account "${u.username}"`}
                                                                    className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg transition-all inline-flex items-center"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}

                                        {usersList.length === 0 && (
                                            <tr>
                                                <td colSpan="6" className="p-8 text-center text-slate-500">
                                                    No users registered in the system yet.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </main>

            {/* USE STOCK MODAL */}
            {showUseModal && activeChemForUse && (
                <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
                        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                            <h3 className="font-bold text-lg text-white">Log Chemical Usage</h3>
                            <button onClick={() => setShowUseModal(false)} className="text-slate-400 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
                            <div className="text-sm font-semibold text-white">{activeChemForUse.name}</div>
                            <div className="text-xs text-slate-400">Current Stock: <strong className="text-emerald-400">{activeChemForUse.quantity} {activeChemForUse.unit}</strong></div>
                        </div>

                        <form onSubmit={handleUseSubmit} className="space-y-4 text-sm">
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1">Quantity Used ({activeChemForUse.unit})</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    required
                                    max={activeChemForUse.quantity}
                                    placeholder="Enter amount to deduct"
                                    value={useForm.used_amount}
                                    onChange={(e) => setUseForm({ ...useForm, used_amount: e.target.value })}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-blue-500"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1">Operator Name</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="Technician name"
                                        value={useForm.operator}
                                        onChange={(e) => setUseForm({ ...useForm, operator: e.target.value })}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1">Department</label>
                                    <input
                                        type="text"
                                        required
                                        value={useForm.department}
                                        onChange={(e) => setUseForm({ ...useForm, department: e.target.value })}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-blue-500"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1">Date & Time Used</label>
                                <input
                                    type="datetime-local"
                                    required
                                    value={useForm.timestamp}
                                    onChange={(e) => setUseForm({ ...useForm, timestamp: e.target.value })}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-blue-500"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1">Purpose / Experiment Name</label>
                                <textarea
                                    required
                                    rows="2"
                                    placeholder="Reason for usage..."
                                    value={useForm.purpose}
                                    onChange={(e) => setUseForm({ ...useForm, purpose: e.target.value })}
                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-blue-500"
                                ></textarea>
                            </div>

                            <div className="flex justify-end space-x-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowUseModal(false)}
                                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium shadow-lg"
                                >
                                    Confirm & Deduct Stock
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ADD CHEMICAL MODAL */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                            <h3 className="font-bold text-lg text-white">Add New Chemical Stock</h3>
                            <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleAddChemical} className="space-y-4 text-sm">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1">Stock Code</label>
                                    <input type="text" required placeholder="CHEM-005" value={newChem.code} onChange={e => setNewChem({ ...newChem, code: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1">CAS Number</label>
                                    <input type="text" required placeholder="0000-00-0" value={newChem.cas} onChange={e => setNewChem({ ...newChem, cas: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white" />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1">Chemical Name</label>
                                <input type="text" required placeholder="Sulfuric Acid 98%" value={newChem.name} onChange={e => setNewChem({ ...newChem, name: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white" />
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1">Formula</label>
                                    <input type="text" required placeholder="H2SO4" value={newChem.formula} onChange={e => setNewChem({ ...newChem, formula: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1">Category</label>
                                    <select value={newChem.category} onChange={e => setNewChem({ ...newChem, category: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white">
                                        <option value="Acid">Acid</option>
                                        <option value="Base">Base</option>
                                        <option value="Solvent">Solvent</option>
                                        <option value="Reagent">Reagent</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1">Hazard Level</label>
                                    <select value={newChem.hazard} onChange={e => setNewChem({ ...newChem, hazard: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white">
                                        <option value="Low">Low</option>
                                        <option value="Moderate">Moderate</option>
                                        <option value="High">High</option>
                                        <option value="Extreme">Extreme</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1">Quantity</label>
                                    <input type="number" required value={newChem.quantity} onChange={e => setNewChem({ ...newChem, quantity: parseFloat(e.target.value) })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1">Unit</label>
                                    <input type="text" required value={newChem.unit} onChange={e => setNewChem({ ...newChem, unit: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1">Min Threshold</label>
                                    <input type="number" required value={newChem.minThreshold} onChange={e => setNewChem({ ...newChem, minThreshold: parseFloat(e.target.value) })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white" />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1">Storage Zone</label>
                                    <input type="text" required placeholder="Zone A - Acids" value={newChem.zone} onChange={e => setNewChem({ ...newChem, zone: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white" />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-400 mb-1">Supplier</label>
                                    <input type="text" required placeholder="Supplier Name" value={newChem.supplier} onChange={e => setNewChem({ ...newChem, supplier: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white" />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1">Safety Precautions</label>
                                <textarea rows="2" required placeholder="Handling guidelines..." value={newChem.precautions} onChange={e => setNewChem({ ...newChem, precautions: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white"></textarea>
                            </div>

                            <div className="flex justify-end space-x-3 pt-2">
                                <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium">Cancel new stock</button>
                                <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium shadow-lg">Save Chemical</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* SDS MODAL */}
            {viewingSdsItem && (
                <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
                        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                            <div>
                                <h3 className="font-bold text-lg text-white">Safety Data Sheet (SDS)</h3>
                                <p className="text-xs text-slate-400">{viewingSdsItem.name} ({viewingSdsItem.code})</p>
                            </div>
                            <button onClick={() => setViewingSdsItem(null)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="space-y-3 text-sm">
                            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                                <span className="text-xs text-slate-400 block">CAS Number & Formula:</span>
                                <span className="font-mono text-white">{viewingSdsItem.cas} | {viewingSdsItem.formula}</span>
                            </div>
                            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                                <span className="text-xs text-slate-400 block">Supplier:</span>
                                <span className="text-white">{viewingSdsItem.supplier}</span>
                            </div>
                            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                                <span className="text-xs text-slate-400 block">Handling Precautions:</span>
                                <p className="text-slate-200 mt-1">{viewingSdsItem.precautions}</p>
                            </div>
                        </div>
                        <div className="flex justify-end pt-2">
                            <button onClick={() => setViewingSdsItem(null)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs">Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}