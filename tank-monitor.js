// Smart Tank Monitor - Vanilla JavaScript Application
class TankMonitorApp {
    constructor() {
        this.currentUser = null;
        this.currentPage = 'dashboard';
        this.sensorData = {
            waterLevel: 15,
            petrolLevel: 85,
            temperature: 22.5,
            pH: 7.1,
            sensorHealth: 98,
            lastUpdated: new Date()
        };
        this.tankData = [
            { name: 'Tank 1', waterLevel: 12, petrolLevel: 88, status: 'OK' }
            // { name: 'Tank 2', waterLevel: 25, petrolLevel: 75, status: 'WARNING' }
        ];
        this.historyData = [];

        this.sameDataCount = 0;       // How many times same timestamp was seen
        this.maxSameDataLimit = 10;   // e.g. 2.5 minutes (10 * 15s = 150s = 2.5 min)


        this.allTankRecords = [];  // store all 1000 entries
        this.currentRecordIndex = 0; // keep track of which one you're on

        this.init();

        document.querySelectorAll('#toggle-sidebar, #topbar-toggle').forEach(btn => {
            btn.addEventListener('click', () => this.toggleSidebar());
        });
        document.getElementById('sidebar-overlay')?.addEventListener('click', () => this.closeSidebar());

    }

    saveToHistory(newEntry) {
        // Add the new entry to the history
        this.historyData.push(newEntry);

        // Calculate the timestamp 2 hours ago
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

        // Filter history to keep only the last 2 hours
        this.historyData = this.historyData.filter(entry => new Date(entry.timestamp) >= twoHoursAgo);
    }

    async fetchAndStreamThingSpeakData() {
        try {
            const response = await fetch('https://api.thingspeak.com/channels/3024727/feeds.json?results=1');
            const data = await response.json();

            const latestFeed = data.feeds?.[0];
            if (!latestFeed) return;

            const timestamp = latestFeed.created_at;
            if (this.lastTimestamp === timestamp) {
                this.sameDataCount++;
                if (this.sameDataCount >= this.maxSameDataLimit) {
                    console.warn("Data hasn't changed for 5 intervals. Stopping fetch.");
                    clearInterval(this.fetchInterval);
                }
                return;
            }

            // Reset change tracker
            this.sameDataCount = 0;
            this.lastTimestamp = timestamp;

            const rawWater = parseFloat(latestFeed.field1);
            const waterLevel = isNaN(rawWater) ? null : rawWater;
            const petrolLevel = waterLevel !== null ? (100 - waterLevel) : null;

            const transformed = {
                tankName: 'Tank 1',
                timestamp,
                waterLevel,
                petrolLevel,
                pumpState: latestFeed.field3 === '1' ? 'ON' : 'OFF',
                floatSensor: latestFeed.field2 === '1' ? 'ON' : 'OFF',
                status: waterLevel > 16 ? 'WARNING' : 'OK', // ✅ Added status logic
                source: 'ThingSpeak' // ✅ mark as API data
            };

            console.log("Transformed Record:", transformed);

            // Update sensor data + UI only if values actually changed
            this.sensorData = transformed;
            this.updateSensorDisplay(); // ✅ Avoid full re-render

            this.tankData[0] = {
                name: transformed.tankName,
                waterLevel: transformed.waterLevel,
                petrolLevel: transformed.petrolLevel,
                PumpState: transformed.pumpState,
                floatSensor: transformed.floatSensor,
                status: transformed.waterLevel > 16 ? 'WARNING' : 'OK'
            };

            this.updateTank1Visual();

            // Only render the dashboard once if needed
            if (!this.dashboardRendered && typeof this.renderDashboard === 'function') {
                this.renderDashboard(transformed);
                this.dashboardRendered = true;
            }

            // Save to history if not duplicate
            if (typeof this.saveToHistory === 'function') {
                this.saveToHistory(transformed);
            }

            // Fetch contamination alert from ML API
            await this.fetchContaminationAlert();

        } catch (err) {
            console.error('Error fetching ThingSpeak data:', err);
        }
    }

    async fetchContaminationAlert() {
        try {
            const response = await fetch('http://10.70.52.94:5000/api/threat');  // GET method by default
            const data = await response.json();

            document.getElementById('threatLevel').innerText = data.threat_level || 'Unknown';
            document.getElementById('reason').innerText = data.reason || 'Unknown';
            document.getElementById('waterLevel').innerText = data.readings?.water_level_percent?.toFixed(2) + '%' || 'N/A';

        } catch (error) {
            console.error("Error fetching contamination alert:", error);
        }
    }

    renderDashboard(data) {
        this.sensorData = data;

        // Only inject full HTML ONCE, if not already rendered
        const pageContent = document.getElementById('page-content');
        if (!pageContent.innerHTML.includes('Tank Monitoring Dashboard')) {
            pageContent.innerHTML = this.getDashboardHTML();
        }

        // Update only live values now
        this.updateSensorDisplay();
        this.fetchContaminationAlert();
    }

    saveToHistory(record) {
        if (!this.historyData) {
            this.historyData = [];
        }

        // ✅ Sirf ThingSpeak ka data save karo
        if (record.source !== 'ThingSpeak') {
            console.warn("Skipping non-ThingSpeak data:", record);
            return;
        }

        this.historyData.push(record);

        // ✅ Sirf last 2 hours ka data rakho
        const twoHoursAgo = new Date(Date.now() - (2 * 60 * 60 * 1000));
        this.historyData = this.historyData.filter(d => new Date(d.timestamp) > twoHoursAgo);
    }

    startAutoRefresh() {
        this.fetchAndStreamThingSpeakData(); // initial load
        this.refreshInterval = setInterval(() => {
            this.fetchAndStreamThingSpeakData();
        }, 15000); // every 15 seconds
    }

    startPlayback() {
        if (!this.allTankRecords || this.allTankRecords.length === 0) return;

        setInterval(() => {
            const entry = this.allTankRecords[this.currentRecordIndex];
            if (!entry) return; // safety check

            const dynamicTank = this.tankData[0];
            dynamicTank.tankName = entry.tankName || 'Tank 1';
            dynamicTank.waterLevel = Number(entry.waterLevel) || 0;
            dynamicTank.petrolLevel = Number(entry.petrolLevel) || (100 - dynamicTank.waterLevel);
            dynamicTank.status = entry.status || 'UNKNOWN';
            dynamicTank.timestamp = entry.timestamp || new Date();

            console.log(`Tank 1: ${dynamicTank.waterLevel}% water, ${dynamicTank.petrolLevel}% petrol`);

            this.sensorData = {
                ...dynamicTank,
                lastUpdated: new Date()
            };

            this.addHistoryEntry(dynamicTank);
            this.updateTank1Visual(); // ✅ updates Tank 1 visuals without reloading full HTML

            if (this.currentPage === 'dashboard') {
                this.updateDashboardData();
            }

            this.currentRecordIndex = (this.currentRecordIndex + 1) % this.allTankRecords.length;

        }, 5000); // update every 5 seconds
    }

    async init() {
        this.checkAuth();
        this.bindEvents();
        this.generateHistoryData();

        // this.loadAllTankData();  // fetch 1000 records
        // this.fetchAndStreamThingSpeakData();
        this.startPlayback();          // loop through them one by one
        this.startAutoRefresh()
        this.fetchInterval = setInterval(() => {
            this.fetchAndStreamThingSpeakData();
        }, 15000);
        // 15 seconds

    }

    checkAuth() {
        const user = localStorage.getItem('tankMonitor_user');
        if (user) {
            try {
                this.currentUser = JSON.parse(user);
                this.showApp();
                this.loadPage(this.currentPage);
            } catch (e) {
                console.error("Invalid JSON in tankMonitor_user:", e);
                localStorage.removeItem('tankMonitor_user'); // clear corrupted data
                this.showAuth();
            }
        } else {
            this.showAuth();
        }
    }


    bindEvents() {
        const loginForm = document.getElementById('login-form');
        if (loginForm) loginForm.addEventListener('submit', (e) => this.handleLogin(e));

        const signupForm = document.getElementById('signup-form');
        if (signupForm) signupForm.addEventListener('submit', (e) => this.handleSignup(e));

        const showSignup = document.getElementById('show-signup');
        if (showSignup) showSignup.addEventListener('click', () => this.showSignupPage());

        const showLogin = document.getElementById('show-login');
        if (showLogin) showLogin.addEventListener('click', () => this.showLoginPage());

        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) logoutBtn.addEventListener('click', () => this.handleLogout());

        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = e.currentTarget.dataset.page;
                this.loadPage(page);
            });
        });

        const toggleSidebar = document.getElementById('toggle-sidebar');
        if (toggleSidebar) toggleSidebar.addEventListener('click', () => this.toggleSidebar());

        const closeSidebar = document.getElementById('close-sidebar');
        if (closeSidebar) closeSidebar.addEventListener('click', () => this.closeSidebar());

        const sidebarOverlay = document.getElementById('sidebar-overlay');
        if (sidebarOverlay) sidebarOverlay.addEventListener('click', () => this.closeSidebar());

        const profileDropdown = document.getElementById('profile-dropdown');
        if (profileDropdown) profileDropdown.addEventListener('click', () => this.toggleDropdown());

        document.addEventListener('click', (e) => {
            if (!e.target.closest('#profile-dropdown')) {
                this.closeDropdown();
            }
        });

        const toggleLoginPassword = document.getElementById('toggle-login-password');
        if (toggleLoginPassword) toggleLoginPassword.addEventListener('click', () => this.togglePassword('login-password', 'toggle-login-password'));

        const toggleSignupPassword = document.getElementById('toggle-signup-password');
        if (toggleSignupPassword) toggleSignupPassword.addEventListener('click', () => this.togglePassword('signup-password', 'toggle-signup-password'));
    }

    async handleLogin(e) {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        this.setLoading('login', true);
        this.hideError('login');

        await this.delay(1000);

        if (email === 'admin@tankmonitor.com' && password === 'admin123') {
            const userData = {
                id: '1',
                email: 'admin@tankmonitor.com',
                name: 'Tank Monitor Admin',
                pumpName: 'Shell Station #001',
                location: 'Main Street, Downtown'
            };

            this.currentUser = userData;
            localStorage.setItem('tankMonitor_user', JSON.stringify(this.currentUser));
            this.showApp();
            this.loadPage('dashboard');
        } else {
            this.showError('login', 'Invalid email or password');
        }

        this.setLoading('login', false);
    }

    async handleSignup(e) {
        e.preventDefault();
        const name = document.getElementById('signup-name').value;
        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;
        const confirmPassword = document.getElementById('signup-confirm-password').value;

        this.hideError('signup');

        if (password !== confirmPassword) {
            this.showError('signup', 'Passwords do not match');
            return;
        }

        if (password.length < 6) {
            this.showError('signup', 'Password must be at least 6 characters');
            return;
        }

        this.setLoading('signup', true);


        await this.delay(1500);

        const userData = {
            id: Date.now().toString(),
            email,
            name,
            pumpName: 'New Petrol Station',
            location: 'Not specified'
        };

        this.currentUser = userData;
        localStorage.setItem('tankMonitor_user', JSON.stringify(this.currentUser));
        this.showApp();
        this.loadPage('dashboard');

        this.setLoading('signup', false);
    }

    handleLogout() {
        this.currentUser = null;
        localStorage.removeItem('tankMonitor_user');
        this.showAuth();
        this.closeDropdown();
    }

    showAuth() {
        document.getElementById('auth-container').classList.remove('hidden');
        document.getElementById('app-container').classList.add('hidden');
    }

    showApp() {
        document.getElementById('auth-container').classList.add('hidden');
        document.getElementById('app-container').classList.remove('hidden');
        this.updateUserInfo();
    }

    showLoginPage() {
        document.getElementById('login-page').classList.remove('hidden');
        document.getElementById('signup-page').classList.add('hidden');
    }

    showSignupPage() {
        document.getElementById('login-page').classList.add('hidden');
        document.getElementById('signup-page').classList.remove('hidden');
    }

    updateUserInfo() {
        if (this.currentUser) {
            const initials = this.currentUser.name.split(' ').map(n => n[0]).join('');
            document.getElementById('user-initials').textContent = initials;
            document.getElementById('user-name').textContent = this.currentUser.name;
            document.getElementById('dropdown-user-name').textContent = this.currentUser.name;
            document.getElementById('dropdown-user-email').textContent = this.currentUser.email;
        }
    }

    loadPage(page) {
        this.currentPage = page;
        this.updateActiveNav(page);
        this.closeSidebar();

        const content = document.getElementById('page-content');

        switch (page) {
            case 'dashboard':
                content.innerHTML = this.getDashboardHTML();
                this.initDashboard();
                break;
            case 'history':
                content.innerHTML = this.getHistoryHTML();
                this.initHistoryPage();
                break;
            case 'about':
                content.innerHTML = this.getAboutHTML();
                break;
            case 'contact':
                content.innerHTML = this.getContactHTML();
                this.initContact();
                break;
            case 'profile':
                content.innerHTML = this.getProfileHTML();
                this.initProfile();
                break;
        }
    }

    updateActiveNav(page) {
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('bg-blue-50', 'text-blue-700', 'border-r-4', 'border-blue-600');
            link.classList.add('text-gray-600', 'hover:bg-gray-50', 'hover:text-gray-900');
        });

        const activeLink = document.querySelector(`[data-page="${page}"]`);
        if (activeLink) {
            activeLink.classList.add('bg-blue-50', 'text-blue-700', 'border-r-4', 'border-blue-600');
            activeLink.classList.remove('text-gray-600', 'hover:bg-gray-50', 'hover:text-gray-900');
        }
    }

    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');

        sidebar.classList.toggle('-translate-x-full');
        overlay.classList.toggle('hidden');
    }

    closeSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');

        sidebar.classList.add('-translate-x-full');
        overlay.classList.add('hidden');
    }

    toggleDropdown() {
        const dropdown = document.getElementById('dropdown-menu');
        dropdown.classList.toggle('hidden');
    }

    closeDropdown() {
        document.getElementById('dropdown-menu').classList.add('hidden');
    }

    setLoading(type, loading) {
        const btn = document.getElementById(`${type}-btn`);
        const text = document.getElementById(`${type}-btn-text`);
        const spinner = document.getElementById(`${type}-loading`);

        if (loading) {
            btn.disabled = true;
            text.textContent = type === 'login' ? 'Signing In...' : 'Creating Account...';
            spinner.classList.remove('hidden');
        } else {
            btn.disabled = false;
            text.textContent = type === 'login' ? 'Sign In' : 'Create Account';
            spinner.classList.add('hidden');
        }
    }

    showError(type, message) {
        const errorDiv = document.getElementById(`${type}-error`);
        const errorText = document.getElementById(`${type}-error-text`);
        errorText.textContent = message;
        errorDiv.classList.remove('hidden');
    }

    hideError(type) {
        document.getElementById(`${type}-error`).classList.add('hidden');
    }

    togglePassword(inputId, buttonId) {
        const input = document.getElementById(inputId);
        const button = document.getElementById(buttonId);
        const icon = button.querySelector('i');

        if (input.type === 'password') {
            input.type = 'text';
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        } else {
            input.type = 'password';
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    formatDateTime(date) {
        if (!date) return '--';

        const d = new Date(date);
        if (isNaN(d.getTime())) return '--';

        return d.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    }

    initHistoryPage = function () {
        const startInput = document.getElementById('filter-start-date');
        const endInput = document.getElementById('filter-end-date');
        const statusInput = document.getElementById('filter-status');
        const applyBtn = document.getElementById('apply-filter-btn');
        const clearBtn = document.getElementById('clear-filter-btn');
        const exportBtn = document.getElementById('export-btn');

        if (!startInput || !endInput || !statusInput || !applyBtn || !clearBtn || !exportBtn) {
            console.warn("Filter or export elements not found.");
            return;
        }

        const renderFilteredTable = (filteredData) => {
            const tbody = document.getElementById('history-table-body');
            tbody.innerHTML = filteredData.map(entry => `
            <tr class="hover:bg-gray-50">
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${app.formatDate(entry.timestamp)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${entry.waterLevel}%</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${entry.petrolLevel}%</td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full ${entry.status === 'WARNING' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}">
                        ${entry.status}
                    </span>
                </td>
            </tr>
        `).join('');
        };

        applyBtn.addEventListener('click', () => {
            const fromDate = startInput.value ? new Date(startInput.value) : null;
            const toDate = endInput.value ? new Date(endInput.value) : null;
            const status = statusInput.value;

            const filtered = app.historyData.filter(entry => {
                const entryDate = new Date(entry.timestamp);
                const matchesDate =
                    (!fromDate || entryDate >= fromDate) &&
                    (!toDate || entryDate <= toDate);
                const matchesStatus =
                    status ? entry.status.toUpperCase() === status.toUpperCase() : true;
                return matchesDate && matchesStatus;
            });

            renderFilteredTable(filtered);
        });


        clearBtn.addEventListener('click', () => {
            startInput.value = '';
            endInput.value = '';
            statusInput.value = '';
            renderFilteredTable(app.historyData);
        });

        exportBtn.addEventListener('click', () => {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();

            // Set title
            doc.setFontSize(16);
            doc.text("Tank 1 - Contamination History", 14, 16);

            // Build table data
            const headers = [["Timestamp", "Water Level", "Petrol Level", "Status", "Source"]];
            const rows = app.historyData
                .filter(entry => entry.tankName === 'Tank 1') // only dynamic tank
                .map(entry => [
                    app.formatDate(entry.timestamp),
                    `${entry.waterLevel}%`,
                    `${entry.petrolLevel}%`,
                    entry.status
                ]);

            // Draw table
            doc.autoTable({
                head: headers,
                body: rows,
                startY: 22,
                styles: { fontSize: 10 },
                theme: 'grid'
            });

            // Save as PDF
            doc.save('tank1_history.pdf');
        });

    };

    renderHistoryTable(data) {
        const tbody = document.querySelector('tbody');
        if (!tbody) return;

        tbody.innerHTML = data
            .filter(entry =>
                entry.tankName === 'Tank 1' &&
                (this.currentStatusFilter === 'ALL' || entry.status === this.currentStatusFilter)
            )

            .slice(0, 50)
            .map(entry => `
        <tr class="hover:bg-gray-50">
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center">
                    <i class="fas fa-calendar text-gray-400 mr-2"></i>
                    <span class="text-sm font-medium text-gray-900">
                        ${this.formatDate(entry.timestamp)}
                    </span>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center">
                    <span class="text-sm font-medium">${entry.waterLevel}%</span>
                    <i class="fas fa-tint text-blue-500 ml-2"></i>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                ${entry.petrolLevel}%
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full ${entry.status === 'WARNING'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-green-100 text-green-800'
                }">
                    ${entry.status}
                </span>
            </td>
        </tr>
    `).join('');

    }

    startDataSimulation() {
        setInterval(() => {
            this.updateSensorData();       // Simulated for Tank 2, 3, etc.
            // this.updateDynamicTank();      // Live from API for Tank 1
            // this.updateTank1Visual(); // ✅ updates Tank 1 visuals without reloading full HTML


            if (this.currentPage === 'dashboard') {
                this.updateDashboardData();
            }
        }, 10000); // 5 seconds polling (adjust as needed)
    }

    updateSensorData() {

        this.sensorData.waterLevel = Math.max(5, Math.min(35, this.sensorData.waterLevel + (Math.random() - 0.5) * 3));
        this.sensorData.petrolLevel = 100 - this.sensorData.waterLevel;
        this.sensorData.temperature = Math.max(18, Math.min(35, this.sensorData.temperature + (Math.random() - 0.5) * 1));
        this.sensorData.pH = Math.max(6, Math.min(8, this.sensorData.pH + (Math.random() - 0.5) * 0.3));
        this.sensorData.sensorHealth = Math.max(90, Math.min(100, this.sensorData.sensorHealth + (Math.random() - 0.5) * 2));
        this.sensorData.lastUpdated = new Date();


        this.tankData.forEach((tank, index) => {
            if (index === 0) return; // Skip dynamic Tank 1

            tank.waterLevel = Math.max(5, Math.min(40, tank.waterLevel + (Math.random() - 0.5) * 2));
            tank.petrolLevel = 100 - tank.waterLevel;
            tank.status = tank.waterLevel > 20 ? 'WARNING' : 'OK';
        });



        // if (Math.random() < 0.1) {
        //     // Store simulated tanks only (skip Tank 1)
        //     this.tankData.slice(1).forEach(tank => {
        //         this.addHistoryEntry(tank);
        //     });
        // }

    }

    generateHistoryData() {
        for (let i = 0; i < 20; i++) {
            const date = new Date();
            date.setHours(date.getHours() - i * 2);

            const waterLevel = 10 + Math.random() * 25;
            this.historyData.push({
                id: Date.now() + i,
                timestamp: date,
                waterLevel: waterLevel.toFixed(1),
                petrolLevel: (100 - waterLevel).toFixed(1),
                // temperature: (20 + Math.random() * 10).toFixed(1),
                // pH: (6.5 + Math.random() * 1.5).toFixed(1),
                status: waterLevel > 20 ? 'WARNING' : 'OK'
            });
        }
    }

    addHistoryEntry(entry) {
        this.historyData.unshift({
            timestamp: entry?.timestamp || new Date(),
            waterLevel: entry?.waterLevel?.toFixed?.(1) || 0,
            petrolLevel: entry?.petrolLevel?.toFixed?.(1) || 0,  // lowercase
            status: entry?.status || 'UNKNOWN',
            tankName: entry?.tankName || 'Unknown Tank'
        });

        if (this.historyData.length > 50) {
            this.historyData = this.historyData.slice(0, 50);
        }
    }

    getDashboardHTML() {
        return `
            <div class="space-y-6 fade-in">
                <!-- Header -->
                <div class="flex justify-between items-center">
                    <div class="flex justify-between space-evenly">
                        <h1 class="text-3xl font-bold text-gray-900" style="margin-top: -4px;">Tank Monitoring Dashboard</h1>
                        <p class="text-gray-600 mt-1">
                            Last updated: <span id="last-updated">${this.formatDateTime(this.sensorData.lastUpdated)}</span>
                            <span class="ml-2 inline-flex items-center ">
                                <div class="w-2 h-2 bg-green-500 rounded-full pulse-slow mr-1"></div>
                                Live
                            </span>
                        </p>
                    </div>
                </div>

                <!-- Main Dashboard Grid -->
                <div class="grid lg:grid-cols-2 gap-6 min-h-[calc(100vh-200px)]">
                    <!-- Left Section -->
                    <div class="space-y-6">
                        <!-- Tank Chart - 65% -->
                        <div class="h-[400px] bg-white rounded-xl shadow-lg border-0 bg-gradient-to-br from-white to-gray-50">
                            <div class="p-6 pb-4">
                                <h3 class="flex items-center gap-2 text-xl font-semibold">
                                    <i class="fas fa-gas-pump text-blue-600"></i>
                                    <span style="margin-top: -3px;">Tank Contamination Monitor</span>
                                </h3>
                            </div>
                            <div class="px-6 pb-6" style="margin-top: -5px;">
                                <div class="grid grid-cols-2 gap-6 h-80">
                                    ${this.tankData.map((tank, index) => `
                                        <div class="flex flex-col items-center space-y-3">
                             <div class="w-full max-w-[140px] h-60 bg-gray-200 rounded-lg relative overflow-hidden shadow-inner">

                             <!-- petrol Level -->
                             <div id="petrol-fill" class="absolute bottom-0 w-full oil-gradient tank-fill transition-all duration-1000" style="height: ${tank.petrolLevel}%;">
                             </div>

                             <!-- Water Level -->
                             <div id="water-fill" class="absolute bottom-0 w-full ${tank.waterLevel > 16 ? 'contamination-high' : 'water-gradient'} tank-fill transition-all duration-1000" style="height: ${tank.waterLevel}%;">
                             </div>

                             <!-- Status Indicator -->
                             <div id="water-status" class="absolute top-2 left-1/2 transform -translate-x-1/2 text-white text-xs font-bold px-2 py-1 rounded ${tank.status === 'WARNING' ? 'bg-red-600' : 'bg-green-600'}">
                               ${tank.waterLevel.toFixed(0)}% H₂O
                             </div>
                           </div>

                    <!-- Text Info -->
                    <div class="text-center">
                                        <p id="tank-name" class="font-semibold text-gray-900">${tank.name}</p>
                      <p id="petrol-text" class="text-sm text-gray-600">petrol: ${tank.petrolLevel.toFixed(0)}%</p>
                      <span id="tank-status" class="inline-block px-2 py-1 rounded text-xs font-medium ${tank.status === 'WARNING' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}">
                        ${tank.status}
                      </span>
                    </div>
                  </div>

                                    `).join('')}
                                </div>
                            </div>
                        </div>
                        
                        <!-- ML Contamination Alert - Preserving Original Styling -->
                        <div class="h-48 bg-white rounded-xl shadow-lg border-0 bg-gradient-to-br from-white to-gray-50">
                          <div class="p-6 pb-3">
                             <h3 class="flex items-center gap-2 text-lg font-semibold">
                              <i class="fas fa-exclamation-triangle text-yellow-600"></i>
                              Contamination Alerts 
                            </h3>
                          </div>
                          <div class="px-6 pb-6 space-y-3" id="contamination-alert">
                            <p><strong>Threat Level:</strong> <span id="threatLevel">Loading...</span></p>
                            <p><strong>Reason:</strong> <span id="reason">Loading...</span></p>
                            <p><strong>Water Level:</strong> <span id="waterLevel">Loading...</span></p>
                          </div>
                        </div>
                    </div>

                    <!-- Right Section - Real-time Status -->
                    <div class="bg-white rounded-xl shadow-lg border-0 bg-gradient-to-br from-white to-gray-50">
                        <div class="p-6 pb-4">
                            <h3 class="flex items-center gap-2 text-xl font-semibold">
                                <i class="fas fa-chart-line text-teal-600"></i>
                                Real-time Monitoring
                            </h3>
                        </div>
                        <div class="px-6 pb-6 space-y-6" id="sensor-data">
                            <!-- Dynamic sensor data will be inserted here -->
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    updateTank1Visual() {
        const tank = this.tankData[0];

        const petrolFill = document.getElementById('petrol-fill');
        const waterFill = document.getElementById('water-fill');
        const waterStatus = document.getElementById('water-status');
        const petrolText = document.getElementById('petrol-text');
        const tankStatus = document.getElementById('tank-status');
        const tankName = document.getElementById('tank-name');

        if (petrolFill) petrolFill.style.height = `${tank.petrolLevel}%`;
        if (waterFill) {
            waterFill.style.height = `${tank.waterLevel}%`;
            waterFill.className = `absolute bottom-0 w-full ${tank.waterLevel > 16 ? 'contamination-high' : 'water-gradient'} tank-fill transition-all duration-1000`;
        }

        if (waterStatus) {
            waterStatus.textContent = `${tank.waterLevel}% H₂O`;
            waterStatus.className = `absolute top-2 left-1/2 transform -translate-x-1/2 text-white text-xs font-bold px-2 py-1 rounded ${tank.status === 'WARNING' ? 'bg-red-600' : 'bg-green-600'}`;
        }

        if (petrolText) petrolText.textContent = `petrol: ${tank.petrolLevel}%`;
        if (tankStatus) {
            tankStatus.textContent = tank.status;
            tankStatus.className = `inline-block px-2 py-1 rounded text-xs font-medium ${tank.status === 'WARNING' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`;
        }

        if (tankName) tankName.textContent = tank.name;
    }

    initDashboard() {
        this.updateDashboardData();
    }

    updateDashboardData() {
        const content = document.getElementById('page-content');

        const timestampEl = document.getElementById('last-updated');
        if (timestampEl) {
            timestampEl.textContent = this.formatDateTime(this.sensorData.lastUpdated);
        }

        this.updateAlerts();
        this.updateSensorDisplay();
    }

    updateAlerts() {
        const container = document.getElementById('alerts-container');
        if (!container) return;

        const highContaminationTanks = this.tankData.filter(tank => tank.waterLevel > 20);

        // Play alert sound if at least one tank is in critical condition
        if (highContaminationTanks.length > 0) {
            // 🔊 Play audio
            const alertSound = new Audio("alert.mp3");
            alertSound.play().catch(e => console.warn("Audio playback failed:", e));

            // Render alerts
            container.innerHTML = highContaminationTanks.map(tank => `
            <div class="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                <i class="fas fa-exclamation-triangle text-red-600"></i>
                <div class="flex-1">
                    <p class="font-medium text-red-800">${tank.name} - High Water Contamination</p>
                    <p class="text-sm text-red-600">Water level: ${tank.waterLevel.toFixed(1)}% (Critical threshold exceeded)</p>
                </div>
            </div>
        `).join('');
        } else {
            // All tanks normal – no sound needed
            container.innerHTML = `
            <div class="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                <i class="fas fa-check-circle text-green-600"></i>
                <div>
                    <p class="font-medium text-green-800">All Tanks Normal</p>
                    <p class="text-sm text-green-600">Water contamination levels within acceptable range</p>
                </div>
            </div>
        `;
        }
    }

    updateSensorDisplay() {
        const container = document.getElementById('sensor-data');
        if (!container) return;

        const sensor = this.sensorData || {};
        // const waterLevel = Number(sensor.waterLevel);
        // const petrolLevel = Number(sensor.petrolLevel);

        // Extract pump and float values from sensorData
        const pumpState = this.sensorData?.pumpState || '--';
        const floatSensor = this.sensorData?.floatSensor || '--';

        const getStateColor = (state) => state === 'ON' ? 'text-green-600' : 'text-red-600';

        const waterLevel = Number(this.sensorData?.waterLevel);
        const petrolLevel = Number(this.sensorData?.petrolLevel);


        const isValid = (val) => typeof val === 'number' && !isNaN(val);

        if (!isValid(waterLevel) || !isValid(petrolLevel)) {
            console.warn("Waiting for valid sensor data:", this.sensorData);
            container.innerHTML = `
            <div class="text-gray-500 text-sm italic">Loading sensor data...</div>
        `;
            return;
        }

        const getStatusColor = (level) => {
            if (level > 20) return 'text-red-600';
            if (level > 15) return 'text-yellow-600';
            return 'text-green-600';
        };

        container.innerHTML = `
        <!-- Water Contamination Level -->
        <div class="space-y-3">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <i class="fas fa-tint text-blue-600"></i>
                    <span class="font-medium">Water Contamination</span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-lg font-bold ${getStatusColor(waterLevel)}">
                        ${waterLevel.toFixed(1)}%
                    </span>
                    <i class="fas ${waterLevel > 15 ? 'fa-arrow-up text-red-500' : 'fa-arrow-down text-green-500'}"></i>
                </div>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-3">
                <div class="progress-bar h-3 rounded-full ${waterLevel > 20 ? 'bg-red-500' : waterLevel > 15 ? 'bg-yellow-500' : 'bg-green-500'}" 
                     style="width: ${Math.min(100, waterLevel * 3)}%"></div>
            </div>
        </div>

        <!-- Petrol Purity -->
        <div class="space-y-3">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <i class="fa-solid fa-gas-pump"></i>
                    <span class="font-medium">Petrol Purity</span>
                </div>
                <span class="text-lg font-bold text-gray-900">
                    ${petrolLevel.toFixed(1)}%
                </span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-3">
                <div class="progress-bar bg-gray-600 h-3 rounded-full" style="width: ${petrolLevel}%"></div>
            </div>
        </div>

        <!-- Pump State -->
        <div class="space-y-3">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <i class="fas fa-power-off text-purple-600"></i>
                    <span class="font-medium">Pump State</span>
                </div>
                <span class="text-lg font-bold  ${getStateColor(pumpState)}">
                   ${pumpState}
                </span>
            </div>
        </div>

        <!-- Float Sensor -->
        <div class="space-y-3">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <i class="fas fa-circle-notch text-indigo-600"></i>
                    <span class="font-medium">Emergency Switch</span>
                </div>
                <span class="text-lg font-bold ${getStateColor(floatSensor)}">
                    ${floatSensor}
                </span>
            </div>
        </div>

        <!-- Status Summary -->
        <div class="mt-6 p-4 bg-gradient-to-r from-teal-50 to-blue-50 rounded-lg border border-teal-200">
            <div class="flex items-center gap-2 mb-2">
                <i class="fas fa-info-circle text-teal-600"></i>
                <span class="font-semibold text-teal-800">System Status</span>
            </div>
            <p class="text-sm text-teal-700">
                ${waterLevel > 8 ?
                'High water contamination detected. Immediate attention required.' :
                'All sensors operational. Contamination levels within normal range.'}
            </p>
        </div>
        
        <div class="thingSpeak-chart" style="max-width: 500px; margin: auto;">
          <iframe style="width: 100%; height: 300px; border: 1px solid #ccc; border-radius: 8px;" src="https://thingspeak.com/channels/3024727/charts/1?bgcolor=%23ffffff&color=%23d62020&dynamic=true&results=60&type=line&update=15"></iframe>
        </div>
    `;
    }

    getHistoryHTML() {
        return `
        <div class="space-y-6 fade-in">
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 class="text-3xl font-bold text-gray-900">Tank History</h1>
                    <p class="text-gray-600 mt-1">Historical contamination data and readings</p>
                </div>
            </div>

            <!-- Summary Stats -->
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div class="bg-white rounded-lg shadow p-6 text-center">
                    <p class="text-2xl font-bold text-green-600">${this.historyData.filter(d => d.source === 'ThingSpeak' && d.status === 'OK').length}</p>
                    <p class="text-sm text-gray-600">Normal Readings</p>
                </div>
                <div class="bg-white rounded-lg shadow p-6 text-center">
                    <p class="text-2xl font-bold text-red-600">${this.historyData.filter(d => d.status === 'WARNING').length}</p>
                    <p class="text-sm text-gray-600">Warning Alerts</p>
                </div>
                <div class="bg-white rounded-lg shadow p-6 text-center">
                    <p class="text-2xl font-bold text-blue-600">
                        ${(this.historyData.reduce((acc, d) => acc + parseFloat(d.waterLevel), 0) / this.historyData.length || 0).toFixed(1)}%
                    </p>
                    <p class="text-sm text-gray-600">Avg Water Level</p>
                </div>
                <div class="bg-white rounded-lg shadow p-6 text-center">
                    <p class="text-2xl font-bold text-gray-800">${this.historyData.filter(d => d.source === 'ThingSpeak').length}</p>
                    <p class="text-sm text-gray-600">Total Records</p>
                </div>
            </div>

            <!-- Filter Bar -->
            <div class="bg-white rounded-lg shadow p-6 flex flex-col sm:flex-row flex-wrap gap-4 justify-between items-center">
                <div class="flex flex-wrap gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">From</label>
                        <input type="date" id="filter-start-date" class="border border-gray-300 rounded px-3 py-2 text-sm w-40">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">To</label>
                        <input type="date" id="filter-end-date" class="border border-gray-300 rounded px-3 py-2 text-sm w-40">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
                        <select id="filter-status" class="border border-gray-300 rounded px-3 py-2 text-sm w-40">
                            <option value="">All</option>
                            <option value="OK">OK</option>
                            <option value="WARNING">WARNING</option>
                        </select>
                    </div>
                </div>
                <div class="flex gap-3 flex-wrap">
                    <button id="apply-filter-btn" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg">
                        Apply Filters
                    </button>
                    <button id="clear-filter-btn" class="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg">
                        Clear Filters
                    </button>
                    <button id="export-btn" class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2">
                        <i class="fas fa-download"></i> Export pdf
                    </button>
                </div>
            </div>

            <!-- History Table -->
            <div class="bg-white rounded-lg shadow">
                <div class="p-6 border-b border-gray-200">
                    <h3 class="text-lg font-semibold flex items-center gap-2">
                        <i class="fas fa-history text-blue-600"></i>
                        Recent Tank Readings
                    </h3>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Timestamp</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Water Level</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Petrol Level</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pump State</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Emergency Button</th>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-200" id="history-table-body">
                            ${this.historyData.filter(entry => entry.source === 'ThingSpeak').slice(0, 15).map(entry => `
                                <tr class="hover:bg-gray-50">
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${this.formatDateTime(entry.timestamp)}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${entry.waterLevel}%</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${entry.petrolLevel}%</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${entry.pumpState}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${entry.floatSensor}</td>
                                    <td class="px-6 py-4 whitespace-nowrap">
                                        <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full ${entry.status === 'WARNING' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}">
                                            ${entry.status}
                                        </span>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
    }

    getAboutHTML() {
        return `
            <div class="space-y-8 fade-in max-w-6xl mx-auto">
                <div class="text-center">
                    <h1 class="text-4xl font-bold text-gray-900 mb-4">About Smart Tank Monitor</h1>
                    <p class="text-xl text-gray-600 max-w-3xl mx-auto">
                        Advanced IoT-based tank monitoring system designed to detect water contamination 
                        in petrol pump fuel tanks in real-time.
                    </p>
                </div>

                <!-- Mission -->
                <div class="bg-white rounded-xl shadow-lg p-8 bg-gradient-to-br from-blue-50 to-teal-50">
                    <div class="flex items-start gap-4">
                        <div class="bg-blue-600 p-3 rounded-lg">
                            <i class="fas fa-bullseye text-white text-2xl"></i>
                        </div>
                        <div>
                            <h2 class="text-2xl font-bold text-gray-900 mb-3">Our Mission</h2>
                            <p class="text-gray-700 text-lg leading-relaxed">
                                To protect fuel quality and prevent engine damage by providing real-time monitoring 
                                of water contamination levels in petrol pump storage tanks. Our system helps ensure 
                                clean fuel delivery and compliance with quality standards.
                            </p>
                        </div>
                    </div>
                </div>

                <!-- Key Features -->
                <div>
                    <h2 class="text-3xl font-bold text-gray-900 mb-6 text-center">System Features</h2>
                    <div class="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div class="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow duration-300">
                            <div class="text-center space-y-4">
                                <div class="bg-gradient-to-br from-blue-100 to-teal-100 p-4 rounded-full w-16 h-16 mx-auto flex items-center justify-center">
                                    <i class="fas fa-chart-line text-blue-600 text-2xl"></i>
                                </div>
                                <h3 class="text-lg font-semibold text-gray-900">Real-time Monitoring</h3>
                                <p class="text-gray-600 text-sm leading-relaxed">
                                    Continuous monitoring of water contamination levels with instant alerts and notifications.
                                </p>
                            </div>
                        </div>

                        <div class="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow duration-300">
                            <div class="text-center space-y-4">
                                <div class="bg-gradient-to-br from-red-100 to-orange-100 p-4 rounded-full w-16 h-16 mx-auto flex items-center justify-center">
                                    <i class="fas fa-exclamation-triangle text-red-600 text-2xl"></i>
                                </div>
                                <h3 class="text-lg font-semibold text-gray-900">Smart Alerts</h3>
                                <p class="text-gray-600 text-sm leading-relaxed">
                                    Intelligent warning system that triggers alerts when contamination exceeds safe thresholds.
                                </p>
                            </div>
                        </div>

                        <div class="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow duration-300">
                            <div class="text-center space-y-4">
                                <div class="bg-gradient-to-br from-green-100 to-teal-100 p-4 rounded-full w-16 h-16 mx-auto flex items-center justify-center">
                                    <i class="fas fa-database text-green-600 text-2xl"></i>
                                </div>
                                <h3 class="text-lg font-semibold text-gray-900">Data Analytics</h3>
                                <p class="text-gray-600 text-sm leading-relaxed">
                                    Historical data tracking and trend analysis to optimize tank maintenance schedules.
                                </p>
                            </div>
                        </div>

                        <div class="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow duration-300">
                            <div class="text-center space-y-4">
                                <div class="bg-gradient-to-br from-purple-100 to-blue-100 p-4 rounded-full w-16 h-16 mx-auto flex items-center justify-center">
                                    <i class="fas fa-wifi text-purple-600 text-2xl"></i>
                                </div>
                                <h3 class="text-lg font-semibold text-gray-900">IoT Connectivity</h3>
                                <p class="text-gray-600 text-sm leading-relaxed">
                                    Wireless sensor integration for automated data collection and remote monitoring.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- How It Works -->
                <div class="bg-white rounded-xl shadow-lg p-8">
                    <h2 class="text-2xl font-bold text-center mb-8 flex items-center justify-center gap-2">
                        <i class="fas fa-cogs text-blue-600"></i>
                        How Water Detection Works
                    </h2>
                    <div class="grid md:grid-cols-3 gap-8">
                        <div class="text-center space-y-4">
                            <div class="bg-gradient-to-br from-blue-100 to-blue-200 p-6 rounded-full w-20 h-20 mx-auto flex items-center justify-center">
                                <span class="text-2xl font-bold text-blue-600">1</span>
                            </div>
                            <h3 class="text-lg font-semibold">Sensor Detection</h3>
                            <p class="text-gray-600">
                                Specialized sensors measure water content in petrol tank storage.
                            </p>
                        </div>
                        
                        <div class="text-center space-y-4">
                            <div class="bg-gradient-to-br from-green-100 to-green-200 p-6 rounded-full w-20 h-20 mx-auto flex items-center justify-center">
                                <span class="text-2xl font-bold text-green-600">2</span>
                            </div>
                            <h3 class="text-lg font-semibold">Data Analysis</h3>
                            <p class="text-gray-600">
                                Advanced algorithms analyze contamination patterns and predict potential fuel quality issues.
                            </p>
                        </div>
                        
                        <div class="text-center space-y-4">
                            <div class="bg-gradient-to-br from-purple-100 to-purple-200 p-6 rounded-full w-20 h-20 mx-auto flex items-center justify-center">
                                <span class="text-2xl font-bold text-purple-600">3</span>
                            </div>
                            <h3 class="text-lg font-semibold">Alert & Action</h3>
                            <p class="text-gray-600">
                                Instant notifications enable quick response to prevent fuel contamination and engine damage.
                            </p>
                        </div>
                    </div>
                </div>

                <!-- Technical Benefits -->
                <div class="grid lg:grid-cols-2 gap-8">
                    <div class="bg-white rounded-xl shadow-lg p-6">
                        <h3 class="text-xl font-semibold mb-4">System Benefits</h3>
                        <div class="space-y-4">
                            ${[
                'Prevent engine damage from contaminated fuel',
                'Reduce fuel quality complaints by 90%',
                'Early detection saves costly tank cleaning',
                'Compliance with fuel quality regulations',
                'Remote monitoring reduces manual checks',
                '24/7 automated surveillance'
            ].map(benefit => `
                                <div class="flex items-center gap-3">
                                    <i class="fas fa-check-circle text-green-600"></i>
                                    <span class="text-gray-700">${benefit}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <div class="bg-white rounded-xl shadow-lg p-6">
                        <h3 class="text-xl font-semibold mb-4">Technical Specifications</h3>
                        <div class="space-y-4">
                            ${[
                ['Detection Range', '0-50% water content'],
                ['Accuracy', '±0.5% water level'],
                ['Response Time', '< 30 seconds'],
                ['Operating Temp', '-20°C to +60°C'],
                ['Connectivity', 'WiFi'],
                ['Data Storage', '1 years historical data']
            ].map(([label, value]) => `
                                <div class="flex justify-between items-center py-2 border-b border-gray-100 last:border-b-0">
                                    <span class="font-medium text-gray-700">${label}</span>
                                    <span class="text-gray-900 font-semibold">${value}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    getContactHTML() {
        return `
            <div class="space-y-8 fade-in max-w-6xl mx-auto">
                <div class="text-center">
                    <h1 class="text-4xl font-bold text-gray-900 mb-4">Contact Support</h1>
                    <p class="text-xl text-gray-600 max-w-2xl mx-auto">
                        Get in touch with our technical support team for assistance with your tank monitoring system.
                    </p>
                </div>

                <!-- Contact Information Cards -->
                <div class="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                    ${[
                {
                    icon: 'fas fa-phone',
                    title: 'Phone Support',
                    details: '+91 0123456789',
                    description: 'Available 24/7 for emergencies'
                },
                {
                    icon: 'fas fa-envelope',
                    title: 'Email Support',
                    details: 'support@tankguard.com',
                    description: 'Response within 2 hours'
                },
                {
                    icon: 'fas fa-map-marker-alt',
                    title: 'Office Location',
                    details: 'thakral jii ke saamne',
                    description: 'bhopu road ke pass'
                },
                {
                    icon: 'fas fa-clock',
                    title: 'Business Hours',
                    details: 'Mon - Fri: 8:00 AM - 6:00 PM',
                    description: 'Central Standard Time'
                }
            ].map(info => `
                        <div class="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow duration-300">
                            <div class="text-center space-y-4">
                                <div class="bg-gradient-to-br from-blue-100 to-teal-100 p-4 rounded-full w-16 h-16 mx-auto flex items-center justify-center">
                                    <i class="${info.icon} text-blue-600 text-2xl"></i>
                                </div>
                                <div>
                                    <h3 class="text-lg font-semibold text-gray-900 mb-1">${info.title}</h3>
                                    <p class="text-blue-600 font-medium mb-1">${info.details}</p>
                                    <p class="text-gray-500 text-sm">${info.description}</p>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>

                <!-- Contact Form and Info -->
                <div class="grid lg:grid-cols-3 gap-8">
                    <!-- Contact Form -->
                    <div class="lg:col-span-2">
                        <div class="bg-white rounded-xl shadow-lg p-6">
                            <h2 class="text-2xl font-semibold mb-6 flex items-center gap-2">
                                <i class="fas fa-comments text-blue-600"></i>
                                Send us a Message
                            </h2>
                            
                            <form id="contact-form" class="space-y-6">
                                <div id="contact-success" class="hidden flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
                                    <i class="fas fa-check-circle"></i>
                                    <span>Message sent successfully! We'll get back to you within 2 hours.</span>
                                </div>
                                
                                <div class="grid md:grid-cols-2 gap-4">
                                    <div class="space-y-2">
                                        <label class="block text-sm font-medium text-gray-700">Full Name *</label>
                                        <input type="text" id="contact-name" required 
                                               class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                               placeholder="Enter your name">
                                    </div>
                                    <div class="space-y-2">
                                        <label class="block text-sm font-medium text-gray-700">Email Address *</label>
                                        <input type="email" id="contact-email" required 
                                               class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                               placeholder="your@email.com">
                                    </div>
                                </div>

                                <div class="space-y-2">
                                    <label class="block text-sm font-medium text-gray-700">Subject *</label>
                                    <select id="contact-subject" required 
                                            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                                        <option value="">Select a topic</option>
                                        <option value="technical-support">Technical Support</option>
                                        <option value="installation">Installation Help</option>
                                        <option value="sensor-issue">Sensor Issues</option>
                                        <option value="alert-system">Alert System</option>
                                        <option value="data-analysis">Data Analysis</option>
                                        <option value="general">General Question</option>
                                    </select>
                                </div>

                                <div class="space-y-2">
                                    <label class="block text-sm font-medium text-gray-700">Priority Level</label>
                                    <select id="contact-priority" 
                                            class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                                        <option value="low">Low - General inquiry</option>
                                        <option value="medium" selected>Medium - Standard support</option>
                                        <option value="high">High - Urgent issue</option>
                                        <option value="critical">Critical - System down</option>
                                    </select>
                                </div>

                                <div class="space-y-2">
                                    <label class="block text-sm font-medium text-gray-700">Message *</label>
                                    <textarea id="contact-message" required rows="6"
                                              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                              placeholder="Describe your question or issue in detail..."></textarea>
                                </div>

                                <button type="submit" id="contact-submit"
                                        class="w-full bg-gradient-to-r from-blue-600 to-teal-600 hover:from-blue-700 hover:to-teal-700 text-white font-medium py-2 px-4 rounded-lg transition-all duration-200">
                                    <span id="contact-submit-text">Send Message</span>
                                    <i id="contact-loading" class="fas fa-spinner fa-spin ml-2 hidden"></i>
                                </button>
                            </form>
                        </div>
                    </div>

                    <!-- Support Info -->
                    <div class="space-y-6">
                        <!-- Emergency Contact -->
                        <div class="bg-white rounded-xl shadow-lg p-6 bg-gradient-to-br from-red-50 to-orange-50 border-red-200">
                            <div class="flex items-start gap-3">
                                <i class="fas fa-exclamation-triangle text-red-600 text-xl mt-1"></i>
                                <div>
                                    <h3 class="font-semibold text-red-800 mb-2">Emergency Support</h3>
                                    <p class="text-sm text-red-700 mb-3">
                                        For critical tank contamination alerts or system failures:
                                    </p>
                                    <p class="font-bold text-red-800 text-lg">
                                        +1 (555) 911-TANK
                                    </p>
                                </div>
                            </div>
                        </div>

                        <!-- Response Times -->
                        <div class="bg-white rounded-xl shadow-lg p-6">
                            <h3 class="text-lg font-semibold mb-4">Response Times</h3>
                            <div class="space-y-3">
                                <div class="flex items-center gap-3">
                                    <div class="w-3 h-3 bg-red-500 rounded-full"></div>
                                    <div>
                                        <p class="text-sm font-medium">Critical Issues</p>
                                        <p class="text-xs text-gray-600">Within 15 minutes</p>
                                    </div>
                                </div>
                                <div class="flex items-center gap-3">
                                    <div class="w-3 h-3 bg-yellow-500 rounded-full"></div>
                                    <div>
                                        <p class="text-sm font-medium">High Priority</p>
                                        <p class="text-xs text-gray-600">Within 1 hour</p>
                                    </div>
                                </div>
                                <div class="flex items-center gap-3">
                                    <div class="w-3 h-3 bg-blue-500 rounded-full"></div>
                                    <div>
                                        <p class="text-sm font-medium">Standard Support</p>
                                        <p class="text-xs text-gray-600">Within 2 hours</p>
                                    </div>
                                </div>
                                <div class="flex items-center gap-3">
                                    <div class="w-3 h-3 bg-green-500 rounded-full"></div>
                                    <div>
                                        <p class="text-sm font-medium">General Inquiries</p>
                                        <p class="text-xs text-gray-600">Within 24 hours</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Support Hours -->
                        <div class="bg-white rounded-xl shadow-lg p-6">
                            <h3 class="text-lg font-semibold mb-4">Support Hours</h3>
                            <div class="space-y-3">
                                <div class="flex justify-between">
                                    <span class="text-gray-600">Monday - Friday</span>
                                    <span class="font-medium">8:00 AM - 6:00 PM</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-600">Saturday</span>
                                    <span class="font-medium">9:00 AM - 3:00 PM</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="text-gray-600">Sunday</span>
                                    <span class="font-medium">Emergency only</span>
                                </div>
                                <div class="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                                    <div class="flex items-start gap-2">
                                        <i class="fas fa-check-circle text-green-600 text-sm mt-0.5"></i>
                                        <div>
                                            <p class="text-sm font-medium text-green-800">24/7 Critical Support</p>
                                            <p class="text-xs text-green-600">Emergency line for tank contamination alerts</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }



    initContact() {
        document.getElementById('contact-form').addEventListener('submit', async (e) => {
            e.preventDefault();

            const name = document.getElementById('contact-name');
            const email = document.getElementById('contact-email');
            const subject = document.getElementById('contact-subject');
            const message = document.getElementById('contact-message');

            if (!name.value || !email.value || !subject.value || !message.value) {
                alert('Please fill in all required fields.');
                return;
            }
            const submitBtn = document.getElementById('contact-submit');
            const submitText = document.getElementById('contact-submit-text');
            const loading = document.getElementById('contact-loading');

            submitBtn.disabled = true;
            submitText.textContent = 'Sending...';
            loading.classList.remove('hidden');

            await this.delay(2000);

            document.getElementById('contact-success').classList.remove('hidden');
            document.getElementById('contact-form').reset();

            submitBtn.disabled = false;
            submitText.textContent = 'Send Message';
            loading.classList.add('hidden');

            setTimeout(() => {
                document.getElementById('contact-success').classList.add('hidden');
            }, 5000);
        });
    }

    getProfileHTML() {
        const user = this.currentUser || {};
        return `
            <div class="space-y-6 fade-in max-w-4xl mx-auto">
                <div class="flex justify-between items-start">
                    <div>
                        <h1 class="text-3xl font-bold text-gray-900">Profile Settings</h1>
                        <p class="text-gray-600 mt-1">Manage your petrol pump and account information</p>
                    </div>
                    <button id="edit-profile-btn" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2">
                        <i class="fas fa-edit"></i>
                        Edit Profile
                    </button>
                </div>

                <div id="profile-success" class="hidden flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
                    <i class="fas fa-check-circle"></i>
                    Profile updated successfully!
                </div>

                <div class="grid lg:grid-cols-3 gap-6">
                    <!-- Profile Overview -->
                    <div class="lg:col-span-1 bg-white rounded-xl shadow-lg p-6">
                        <div class="text-center space-y-4">
                            <div class="relative">
                                <div class="w-24 h-24 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold text-2xl mx-auto">
                                    ${user.name ? user.name.split(' ').map(n => n[0]).join('') : 'TM'}
                                </div>
                            </div>
                            
                            <div>
                                <h2 class="text-xl font-bold text-gray-900">${user.name || 'Tank Monitor Admin'}</h2>
                                <p class="text-gray-600">Station Owner</p>
                                <span class="inline-block px-3 py-1 bg-blue-100 text-blue-700 text-sm rounded-full mt-2">
                                    Active Station
                                </span>
                            </div>

                            <div class="space-y-2 text-sm text-gray-600">
                                <div class="flex items-center gap-2 justify-center">
                                    <i class="fas fa-envelope"></i>
                                    ${user.email || 'admin@tankmonitor.com'}
                                </div>
                                <div class="flex items-center gap-2 justify-center">
                                    <i class="fas fa-phone"></i>
                                    ${user.phone || '+1 (555) 123-4567'}
                                </div>
                                <div class="flex items-center gap-2 justify-center">
                                    <i class="fas fa-map-marker-alt"></i>
                                    ${user.location || 'Main Street, Downtown'}
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Profile Details -->
                    <div class="lg:col-span-2 space-y-6">
                        <!-- Personal Information -->
                        <div class="bg-white rounded-xl shadow-lg p-6">
                            <h3 class="text-lg font-semibold mb-4 flex items-center gap-2">
                                <i class="fas fa-user text-blue-600"></i>
                                Personal Information
                            </h3>
                            <form id="profile-form" class="space-y-4">
                                <div class="grid md:grid-cols-2 gap-4">
                                    <div class="space-y-2">
                                        <label class="block text-sm font-medium text-gray-700">Full Name</label>
                                        <input type="text" id="profile-name" value="${user.name || 'Tank Monitor Admin'}" disabled
                                               class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50">
                                    </div>
                                    <div class="space-y-2">
                                        <label class="block text-sm font-medium text-gray-700">Email Address</label>
                                        <input type="email" id="profile-email" value="${user.email || 'admin@tankmonitor.com'}" disabled
                                               class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50">
                                    </div>
                                </div>

                                <div class="grid md:grid-cols-2 gap-4">
                                    <div class="space-y-2">
                                        <label class="block text-sm font-medium text-gray-700">Phone Number</label>
                                        <input type="tel" id="profile-phone" value="${user.phone || ''}" disabled
                                               class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50">
                                    </div>
                                    <div class="space-y-2">
                                        <label class="block text-sm font-medium text-gray-700">Location</label>
                                        <input type="text" id="profile-location" value="${user.location || 'Main Street, Downtown'}" disabled
                                               class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50">
                                    </div>
                                </div>
                            </form>
                        </div>

                        <!-- Station Information -->
                        <div class="bg-white rounded-xl shadow-lg p-6">
                            <h3 class="text-lg font-semibold mb-4 flex items-center gap-2">
                                <i class="fas fa-gas-pump text-blue-600"></i>
                                Station Information
                            </h3>
                            <div class="space-y-4">
                                <div class="grid md:grid-cols-2 gap-4">
                                    <div class="space-y-2">
                                        <label class="block text-sm font-medium text-gray-700">Station Name</label>
                                        <input type="text" id="station-name" value="${user.pumpName || 'Shell Station #001'}" disabled
                                               class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50">
                                    </div>
                                    <div class="space-y-2">
                                        <label class="block text-sm font-medium text-gray-700">Station Type</label>
                                        <input type="text" id="station-type" value="${user.stationType || ''}" disabled
                                               class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50">
                                    </div>
                                </div>

                                <div class="grid md:grid-cols-2 gap-4">
                                    <div class="space-y-2">
                                        <label class="block text-sm font-medium text-gray-700">Number of Tanks</label>
                                        <input type="number" id="tank-count" value="${user.tankCount || ''}" disabled
                                               class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50">
                                    </div>
                                    <div class="space-y-2">
                                        <label class="block text-sm font-medium text-gray-700">Established</label>
                                        <input type="text" id="established" value="2015" disabled
                                               class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50">
                                    </div>
                                </div>

                                <div class="space-y-2">
                                    <label class="block text-sm font-medium text-gray-700">Address</label>
                                    <input type="text" id="station-address" value="${user.address || ''}" disabled
                                           class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50">
                                </div>

                                <div class="space-y-2">
                                    <label class="block text-sm font-medium text-gray-700">License Number</label>
                                    <input type="text" id="license-number" value="TX-PS-2015-001234" disabled
                                           class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50">
                                </div>

                                <div id="profile-actions" class="hidden pt-4">
                                    <div class="flex gap-3">
                                        <button type="button" id="save-profile-btn"
                                                class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2">
                                            <i class="fas fa-save"></i>
                                            <span id="save-text">Save Changes</span>
                                            <i id="save-loading" class="fas fa-spinner fa-spin hidden"></i>
                                        </button>
                                        <button type="button" id="cancel-edit-btn"
                                                class="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg">
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    initProfile() {
        const editBtn = document.getElementById('edit-profile-btn');
        const saveBtn = document.getElementById('save-profile-btn');
        const cancelBtn = document.getElementById('cancel-edit-btn');
        const actions = document.getElementById('profile-actions');

        const inputIds = [
            'profile-name', 'profile-location', 'profile-pump-name',
            'profile-phone', 'station-address', 'tank-count',
            'station-type', 'license-number', 'established'
        ];

        editBtn.addEventListener('click', () => {
            inputIds.forEach(id => {
                const input = document.getElementById(id);
                if (input) {
                    input.disabled = false;
                    input.classList.remove('disabled:bg-gray-50');
                    input.classList.add('bg-white');
                }
            });

            editBtn.classList.add('hidden');
            actions.classList.remove('hidden');
        });

        cancelBtn.addEventListener('click', () => {
            // Re-disable inputs
            inputIds.forEach(id => {
                const input = document.getElementById(id);
                if (input) {
                    input.disabled = true;
                    input.classList.add('disabled:bg-gray-50');
                    input.classList.remove('bg-white');
                }
            });

            editBtn.classList.remove('hidden');
            actions.classList.add('hidden');
        });

        saveBtn.addEventListener('click', () => {
            const getValue = id => document.getElementById(id)?.value || '';

            // Update all fields in currentUser
            this.currentUser.name = getValue('profile-name');
            this.currentUser.location = getValue('profile-location');
            this.currentUser.pumpName = getValue('profile-pump-name');
            this.currentUser.phone = getValue('profile-phone');
            this.currentUser.address = getValue('station-address');
            this.currentUser.tankCount = getValue('tank-count');
            this.currentUser.stationType = getValue('station-type');
            this.currentUser.license = getValue('license-number');
            this.currentUser.established = getValue('established');

            // Save updated user
            localStorage.setItem('tankMonitor_user', JSON.stringify(this.currentUser));
            this.updateUserInfo(); // update navbar info too

            // Show success message
            document.getElementById('profile-success')?.classList.remove('hidden');
            setTimeout(() => {
                document.getElementById('profile-success')?.classList.add('hidden');
            }, 3000);

            // Disable inputs again
            inputIds.forEach(id => {
                const input = document.getElementById(id);
                if (input) {
                    input.disabled = true;
                    input.classList.remove('bg-white');
                    input.classList.add('disabled:bg-gray-50');
                }
            });

            editBtn.classList.remove('hidden');
            actions.classList.add('hidden');
        });
    }
}

// Listen for export PDF button click
document.addEventListener("click", function (e) {
    if (e.target && e.target.id === "export-btn") {
        exportHistoryToPDF();
    }
});

function exportHistoryToPDF() {
    const filteredData = app.historyData.filter(d => d.source === 'ThingSpeak');

    if (filteredData.length === 0) {
        alert("No ThingSpeak history data available to export.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.text("ThingSpeak Tank History", 14, 15);

    // Table headers (tankName & source skipped)
    const headers = [["Timestamp", "Water Level (%)", "Petrol Level (%)", "Pump State", "Float Sensor", "Status"]];

    // Table rows
    const rows = filteredData.map(d => [
        app.formatDateTime(d.timestamp),
        `${d.waterLevel ?? 0}%`,
        `${d.petrolLevel ?? 0}%`,
        d.pumpState,
        d.floatSensor,
        d.status
    ]);

    // Add table to PDF
    doc.autoTable({
        head: headers,
        body: rows,
        startY: 25
    });

    // Save the file
    doc.save(`Tank_History_${new Date().toISOString().split("T")[0]}.pdf`);
}


// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new TankMonitorApp();
});
