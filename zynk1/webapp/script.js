document.addEventListener('DOMContentLoaded', () => {
    // Tab switching
    const tabs = document.querySelectorAll('.auth-tab');
    const forms = document.querySelectorAll('.auth-form');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;

            // Update tab states
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Update form visibility
            forms.forEach(form => {
                form.classList.remove('active');
                if (form.id === `${targetTab}Form`) {
                    form.classList.add('active');
                }
            });

            // Clear messages
            document.querySelectorAll('.message').forEach(msg => {
                msg.classList.remove('show');
                msg.textContent = '';
            });
        });
    });

    // Form elements
    const registerForm = document.getElementById('registerForm');
    const loginForm = document.getElementById('loginForm');
    const registerEmailInput = document.getElementById('registerEmail');
    const registerNameInput = document.getElementById('registerName');
    const registerRoleSelect = document.getElementById('registerRole');
    const loginEmailInput = document.getElementById('loginEmail');
    const registerMessage = document.getElementById('registerMessage');
    const loginMessage = document.getElementById('loginMessage');

    const API_BASE_URL = 'http://localhost:3000';

    // Helper function to show messages
    function showMessage(element, message, isError = false) {
        element.textContent = message;
        element.className = `message show ${isError ? 'error' : 'success'}`;
    }

    // --- REGISTER ---
    registerForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const email = registerEmailInput.value.trim();
        const name = registerNameInput.value.trim();
        const role = registerRoleSelect.value;

        if (!email) {
            showMessage(registerMessage, 'Please enter an email address.', true);
            return;
        }
        if (!name) {
            showMessage(registerMessage, 'Please enter your full name.', true);
            return;
        }

        showMessage(registerMessage, 'Generating cryptographic keys...', false);

        // Store additional user info for later
        sessionStorage.setItem('pendingRegistration', JSON.stringify({ name, role }));

        window.postMessage({ type: "ZYNK1_REGISTER", email: email }, "*");
    });

    // --- LOGIN ---
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const email = loginEmailInput.value.trim();

        if (!email) {
            showMessage(loginMessage, 'Please enter an email address.', true);
            return;
        }

        showMessage(loginMessage, 'Generating zero-knowledge proof...', false);
        window.postMessage({ type: "ZYNK1_LOGIN", email: email }, "*");
    });

    // --- LISTEN FOR RESPONSES FROM EXTENSION ---
    window.addEventListener("message", (event) => {
        if (event.source !== window || !event.data.type) {
            return;
        }

        const { type, ...data } = event.data;

        // Handle response from registration
        if (type === "ZYNK1_REGISTER_RESPONSE") {
            if (!data.success) {
                showMessage(registerMessage, `Error: ${data.error}`, true);
                return;
            }

            const { pub_key, proof, email } = data;
            const pendingData = JSON.parse(sessionStorage.getItem('pendingRegistration') || '{}');

            showMessage(registerMessage, 'Registering with server...', false);

            fetch(`${API_BASE_URL}/register_zk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pub_key,
                    proof,
                    email,
                    name: pendingData.name,
                    role: pendingData.role
                })
            }).then(res => {
                if (!res.ok) {
                    return res.json().then(err => { throw new Error(err.message || 'Registration failed') });
                }
                return res.json();
            }).then(apiResponse => {
                sessionStorage.removeItem('pendingRegistration');
                showMessage(registerMessage, 'Registration successful! You can now sign in.', false);

                // Switch to login tab after successful registration
                setTimeout(() => {
                    document.querySelector('[data-tab="login"]').click();
                    loginEmailInput.value = email;
                }, 1500);
            }).catch(err => {
                showMessage(registerMessage, `Error: ${err.message}`, true);
            });
        }

        // Handle response from login
        if (type === "ZYNK1_LOGIN_RESPONSE") {
            if (!data.success) {
                showMessage(loginMessage, `Error: ${data.error}`, true);
                return;
            }

            const { proof, pub_key, email } = data;

            showMessage(loginMessage, 'Verifying proof...', false);

            fetch(`${API_BASE_URL}/login_zk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pub_key, proof })
            }).then(res => {
                if (!res.ok) {
                    return res.json().then(err => { throw new Error(err.message || 'Login failed') });
                }
                return res.json();
            }).then(apiResponse => {
                showMessage(loginMessage, 'Login successful! Redirecting...', false);

                // Store user data for the dashboard
                if (apiResponse.user) {
                    sessionStorage.setItem('loggedInUser', JSON.stringify(apiResponse.user));
                } else {
                    // Create basic user object if not provided
                    sessionStorage.setItem('loggedInUser', JSON.stringify({
                        email: email,
                        pub_key: pub_key,
                        registered_at: new Date().toISOString()
                    }));
                }

                setTimeout(() => {
                    window.location.href = 'dashboard.html';
                }, 1000);
            }).catch(err => {
                showMessage(loginMessage, `Error: ${err.message}`, true);
            });
        }
    });

    // Check if extension is available
    setTimeout(() => {
        // Simple check - try to detect if extension is responding
        // This is a basic heuristic; the extension will respond to messages
    }, 1000);
});
