(function () {
    'use strict';

    const root = document.documentElement;
    const csrfMeta = document.querySelector('meta[name="csrf-token"]');
    const csrfToken = csrfMeta ? csrfMeta.content : '';
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let refreshTimer = null;
    let searchQuery = '';

    function setTheme(theme, persist) {
        const nextTheme = theme === 'light' ? 'light' : 'dark';
        root.dataset.theme = nextTheme;
        if (persist !== false) {
            try {
                localStorage.setItem('chemstore-theme', nextTheme);
            } catch (error) {
                /* storage may be unavailable */
            }
        }
        const themeMeta = document.querySelector('meta[name="theme-color"]');
        if (themeMeta) {
            themeMeta.content = nextTheme === 'light' ? '#eef2f8' : '#070b14';
        }
        document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
            button.setAttribute('aria-label', nextTheme === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
            button.setAttribute('aria-pressed', nextTheme === 'light' ? 'true' : 'false');
        });
        document.dispatchEvent(new CustomEvent('chemstore:theme', { detail: { theme: nextTheme } }));
    }

    function toggleTheme() {
        setTheme(root.dataset.theme === 'light' ? 'dark' : 'light');
    }

    document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
        button.addEventListener('click', toggleTheme);
    });

    setTheme(root.dataset.theme, false);

    document.querySelectorAll('[data-role-switch]').forEach(function (switchElement) {
        const target = document.getElementById(switchElement.dataset.target);
        if (!target) {
            return;
        }
        const buttons = switchElement.querySelectorAll('[data-role-value]');
        function syncRole(value) {
            target.value = value;
            buttons.forEach(function (button) {
                const active = button.dataset.roleValue === value;
                button.classList.toggle('is-active', active);
                button.setAttribute('aria-pressed', active ? 'true' : 'false');
            });
        }
        buttons.forEach(function (button) {
            button.addEventListener('click', function () {
                syncRole(button.dataset.roleValue);
            });
        });
        syncRole(target.value || 'User');
    });

    function showToast(message, type) {
        if (!message) {
            return;
        }
        const rootElement = document.getElementById('toastRoot');
        if (!rootElement) {
            return;
        }
        const toast = document.createElement('div');
        toast.className = 'toast toast-' + (type === 'error' ? 'error' : 'success');
        const dot = document.createElement('span');
        dot.className = 'toast-dot';
        const text = document.createElement('span');
        text.textContent = message;
        toast.appendChild(dot);
        toast.appendChild(text);
        rootElement.appendChild(toast);

        while (rootElement.children.length > 4) {
            rootElement.removeChild(rootElement.firstElementChild);
        }

        window.setTimeout(function () {
            toast.classList.add('is-leaving');
            window.setTimeout(function () {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 260);
        }, 4200);
    }

    document.querySelectorAll('.flash').forEach(function (message, index) {
        window.setTimeout(function () {
            message.style.transition = 'opacity .25s ease, transform .25s ease';
            message.style.opacity = '0';
            message.style.transform = 'translateY(-4px)';
            window.setTimeout(function () {
                if (message.parentNode) {
                    message.parentNode.removeChild(message);
                }
            }, 280);
        }, 4500 + index * 250);
    });

    function openModal(id) {
        const modal = document.getElementById(id);
        if (!modal) {
            return;
        }
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        const firstInput = modal.querySelector('input:not([type="hidden"]), select, textarea');
        if (firstInput) {
            window.setTimeout(function () {
                firstInput.focus();
            }, 120);
        }
    }

    function closeModal(id) {
        const modal = document.getElementById(id);
        if (!modal) {
            return;
        }
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
        if (!document.querySelector('.modal.is-open')) {
            document.body.style.overflow = '';
        }
    }

    document.querySelectorAll('[data-open-modal]').forEach(function (button) {
        button.addEventListener('click', function () {
            openModal(button.dataset.openModal);
        });
    });

    document.querySelectorAll('[data-close-modal]').forEach(function (button) {
        button.addEventListener('click', function () {
            closeModal(button.dataset.closeModal);
        });
    });

    document.querySelectorAll('.modal').forEach(function (modal) {
        modal.addEventListener('click', function (event) {
            if (event.target === modal) {
                closeModal(modal.id);
            }
        });
    });

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
            document.querySelectorAll('.modal.is-open').forEach(function (modal) {
                closeModal(modal.id);
            });
        }
    });

    function activateTab(name, persist) {
        const buttons = document.querySelectorAll('[data-tab]');
        const sections = document.querySelectorAll('.tab-content');
        let matched = false;
        buttons.forEach(function (button) {
            const active = button.dataset.tab === name;
            button.classList.toggle('active', active);
            button.setAttribute('aria-selected', active ? 'true' : 'false');
            if (active) {
                matched = true;
            }
        });
        if (!matched) {
            return;
        }
        sections.forEach(function (section) {
            section.classList.add('hidden');
        });
        const section = document.getElementById('section-' + name);
        if (section) {
            section.classList.remove('hidden');
            section.classList.remove('reveal');
            void section.offsetWidth;
            section.classList.add('reveal');
        }
        if (persist !== false) {
            try {
                localStorage.setItem('chemstore-tab', name);
            } catch (error) {
                /* ignore */
            }
        }
    }

    function scrollToTabDetails(name) {
        const section = document.getElementById('section-' + name);
        if (!section) {
            return;
        }
        const tabBar = document.querySelector('.tab-bar');
        const anchor = tabBar || section;
        const header = document.querySelector('.app-header');
        const headerHeight = header ? header.getBoundingClientRect().height : 0;
        const top = anchor.getBoundingClientRect().top + window.scrollY - headerHeight - 12;
        window.scrollTo({
            top: Math.max(0, top),
            behavior: reduceMotion ? 'auto' : 'smooth'
        });
    }

    document.querySelectorAll('[data-tab]').forEach(function (button) {
        button.addEventListener('click', function () {
            activateTab(button.dataset.tab);
            scrollToTabDetails(button.dataset.tab);
        });
    });

    const savedTab = (function () {
        try {
            return localStorage.getItem('chemstore-tab');
        } catch (error) {
            return null;
        }
    })();
    if (savedTab && document.getElementById('section-' + savedTab) && savedTab !== 'dev-approvals' && savedTab !== 'admin-approvals') {
        activateTab(savedTab, false);
    }

    function formatCount(value) {
        const number = Number(value) || 0;
        return number.toLocaleString();
    }

    function animateNumber(element, target) {
        if (!element) {
            return;
        }
        const finalValue = Number(target) || 0;
        if (reduceMotion) {
            element.textContent = formatCount(finalValue);
            return;
        }
        const startValue = Number(element.textContent.replace(/[^\d.-]/g, '')) || 0;
        if (startValue === finalValue) {
            element.textContent = formatCount(finalValue);
            return;
        }
        const duration = 450;
        const started = performance.now();
        function frame(now) {
            const progress = Math.min((now - started) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            element.textContent = formatCount(Math.round(startValue + (finalValue - startValue) * eased));
            if (progress < 1) {
                window.requestAnimationFrame(frame);
            }
        }
        window.requestAnimationFrame(frame);
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function renderActivity(activity) {
        const chart = document.getElementById('activityChart');
        const total = document.getElementById('activityTotal');
        if (!chart || !Array.isArray(activity)) {
            return;
        }
        const max = Math.max.apply(null, activity.map(function (day) { return Number(day.count) || 0; }).concat([1]));
        let totalCount = 0;
        chart.innerHTML = activity.map(function (day) {
            const count = Number(day.count) || 0;
            totalCount += count;
            const height = Math.max(5, Math.round((count / max) * 100));
            return '<div class="chart-col">' +
                '<span class="chart-count">' + formatCount(count) + '</span>' +
                '<div class="chart-track"><div class="chart-bar" style="height:' + height + '%"></div></div>' +
                '<span class="chart-label">' + escapeHtml(day.label) + '</span>' +
                '</div>';
        }).join('');
        if (total) {
            total.textContent = formatCount(totalCount);
        }
    }

    function setLiveState(isLive) {
        const badge = document.getElementById('liveStatus');
        if (!badge) {
            return;
        }
        badge.classList.toggle('is-paused', !isLive);
        const label = badge.querySelector('[data-live-label]');
        if (label) {
            label.textContent = isLive ? 'Live' : 'Paused';
        }
    }

    function applyInventoryFilter() {
        const rows = Array.prototype.slice.call(document.querySelectorAll('#inventoryBody tr[data-search]'));
        if (!rows.length) {
            return;
        }
        const query = searchQuery.trim().toLowerCase();
        let visible = 0;
        rows.forEach(function (row) {
            const matches = !query || String(row.dataset.search || '').toLowerCase().indexOf(query) !== -1;
            row.style.display = matches ? '' : 'none';
            if (matches) {
                visible += 1;
            }
        });
        const empty = document.getElementById('inventoryNoResults');
        if (empty) {
            empty.style.display = visible || !query ? 'none' : '';
        }
    }

    function setDashboardHtml(data) {
        const targets = {
            inventoryBody: data.inventory_html,
            logsBody: data.logs_html,
            usersBody: data.users_html,
            pendingAdminsBody: data.pending_admins_html,
            pendingUsersBody: data.pending_users_html
        };
        Object.keys(targets).forEach(function (id) {
            const element = document.getElementById(id);
            if (element && typeof targets[id] === 'string') {
                element.innerHTML = targets[id];
            }
        });
        applyInventoryFilter();
    }

    async function refreshDashboard(options) {
        const settings = options || {};
        const statValues = document.querySelectorAll('[data-stat]');
        if (!statValues.length) {
            return;
        }
        if (!settings.silent) {
            setLiveState(false);
        }
        try {
            const response = await fetch('/api/dashboard', {
                headers: { 'X-Requested-With': 'fetch' },
                cache: 'no-store'
            });
            if (response.status === 401) {
                window.location.assign('/login');
                return;
            }
            if (!response.ok) {
                throw new Error('Dashboard request failed');
            }
            const data = await response.json();
            if (!data.ok) {
                throw new Error(data.message || 'Dashboard request failed');
            }
            document.querySelectorAll('[data-stat]').forEach(function (element) {
                const key = element.dataset.stat;
                if (data.stats && Object.prototype.hasOwnProperty.call(data.stats, key)) {
                    animateNumber(element, data.stats[key]);
                }
            });
            const counts = data.counts || {};
            document.querySelectorAll('[data-tab-count]').forEach(function (element) {
                const key = element.dataset.tabCount;
                if (Object.prototype.hasOwnProperty.call(counts, key)) {
                    element.textContent = formatCount(counts[key]);
                }
            });
            document.querySelectorAll('[data-pending-count]').forEach(function (element) {
                const key = element.dataset.pendingCount;
                if (Object.prototype.hasOwnProperty.call(counts, key)) {
                    element.textContent = formatCount(counts[key]) + ' waiting';
                }
            });
            renderActivity(data.activity);
            setDashboardHtml(data);
            const updated = document.getElementById('dashboardUpdated');
            if (updated) {
                updated.textContent = 'Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            }
            setLiveState(true);
        } catch (error) {
            setLiveState(false);
            if (!settings.silent) {
                showToast('Live updates are temporarily unavailable.', 'error');
            }
        }
    }

    function scheduleRefresh() {
        if (refreshTimer) {
            window.clearInterval(refreshTimer);
        }
        refreshTimer = window.setInterval(function () {
            if (!document.hidden) {
                refreshDashboard({ silent: true });
            }
        }, 15000);
    }

    document.addEventListener('visibilitychange', function () {
        setLiveState(!document.hidden);
        if (!document.hidden) {
            refreshDashboard({ silent: true });
        }
    });

    const searchInput = document.querySelector('[data-search-input]');
    if (searchInput) {
        searchQuery = searchInput.value || '';
        let debounce = null;
        searchInput.addEventListener('input', function () {
            searchQuery = searchInput.value || '';
            window.clearTimeout(debounce);
            debounce = window.setTimeout(applyInventoryFilter, 120);
        });
        const searchForm = searchInput.closest('form');
        if (searchForm) {
            searchForm.addEventListener('submit', function (event) {
                event.preventDefault();
                searchQuery = searchInput.value || '';
                applyInventoryFilter();
            });
        }
        applyInventoryFilter();
    }

    function setLoading(form, loading) {
        form.classList.toggle('is-loading', loading);
        form.querySelectorAll('button, input, select, textarea').forEach(function (control) {
            if (control.dataset.originalDisabled === undefined) {
                control.dataset.originalDisabled = control.disabled ? '1' : '0';
            }
            control.disabled = loading ? true : control.dataset.originalDisabled === '1';
        });
    }

    function updateProfileView(data) {
        if (data.username) {
            document.querySelectorAll('[data-profile-username]').forEach(function (element) {
                element.textContent = data.username;
            });
        }
        if (data.email) {
            document.querySelectorAll('[data-profile-email]').forEach(function (element) {
                element.textContent = data.email;
            });
        }
        if (data.profile_pic_url) {
            document.querySelectorAll('[data-profile-avatar]').forEach(function (element) {
                element.innerHTML = '<img src="' + escapeHtml(data.profile_pic_url) + '" alt="Profile picture">';
            });
        }
    }

    document.addEventListener('submit', async function (event) {
        const form = event.target.closest('form[data-ajax]');
        if (!form) {
            return;
        }
        event.preventDefault();
        if (form.dataset.submitting === '1') {
            return;
        }
        form.dataset.submitting = '1';
        const payload = new FormData(form);
        setLoading(form, true);
        try {
            const response = await fetch(form.action, {
                method: (form.method || 'POST').toUpperCase(),
                body: payload,
                headers: {
                    'X-Requested-With': 'fetch',
                    'X-CSRF-Token': csrfToken
                },
                credentials: 'same-origin'
            });
            if (response.status === 401) {
                window.location.assign('/login');
                return;
            }
            const data = await response.json().catch(function () {
                return { ok: false, message: 'Unexpected response from the server.' };
            });
            if (!response.ok || !data.ok) {
                showToast(data.message || 'The request could not be completed.', 'error');
                return;
            }
            if (data.message) {
                showToast(data.message, 'success');
            }
            if (form.id === 'profileForm') {
                updateProfileView(data);
                ['current_password', 'new_password', 'profile_pic'].forEach(function (name) {
                    const field = form.querySelector('[name="' + name + '"]');
                    if (field) {
                        field.value = '';
                    }
                });
            }
            if (data.redirect) {
                document.body.style.transition = 'opacity .22s ease';
                document.body.style.opacity = '0';
                window.setTimeout(function () {
                    window.location.assign(data.redirect);
                }, 220);
                return;
            }
            if (form.closest('#addModal')) {
                closeModal('addModal');
                form.reset();
            }
            if (form.id === 'useForm') {
                closeModal('useModal');
                form.reset();
            }
            await refreshDashboard({ silent: true });
        } catch (error) {
            showToast('Network error. Please try again.', 'error');
        } finally {
            form.dataset.submitting = '0';
            setLoading(form, false);
        }
    });

    document.addEventListener('click', function (event) {
        const useButton = event.target.closest('.use-stock-btn');
        if (useButton) {
            const name = document.getElementById('useItemName');
            const form = document.getElementById('useForm');
            if (name) {
                name.textContent = useButton.dataset.name + ' · ' + useButton.dataset.quantity + ' L available';
            }
            if (form) {
                form.action = '/use/' + useButton.dataset.id;
            }
            openModal('useModal');
        }
    });

    window.chemstore = {
        setTheme: setTheme,
        toggleTheme: toggleTheme,
        showToast: showToast,
        openModal: openModal,
        closeModal: closeModal,
        refreshDashboard: refreshDashboard,
        activateTab: activateTab
    };

    scheduleRefresh();
    refreshDashboard({ silent: true });
})();
