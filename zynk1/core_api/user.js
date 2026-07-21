// This is a placeholder for user management.
// In a real application, you would use a database to store user information.

const users = []; // In-memory user store for demonstration

/**
 * Finds a user by their public key.
 * @param {string} pub_key_hex The user's public key as a hex string.
 * @returns {object|undefined} The user object if found, otherwise undefined.
 */
function find_user_by_pub_key(pub_key_hex) {
    return users.find(user => user.pub_key === pub_key_hex);
}

/**
 * Finds a user by their email.
 * @param {string} email The user's email.
 * @returns {object|undefined} The user object if found, otherwise undefined.
 */
function find_user_by_email(email) {
    return users.find(user => user.email === email);
}

/**
 * Registers a new user with their public key, email, name, and role.
 * @param {string} pub_key_hex The user's public key as a hex string.
 * @param {string} email The user's email.
 * @param {string} name The user's full name (optional).
 * @param {string} role The user's role - 'student' or 'professor' (optional).
 * @returns {object} The registered user object.
 */
function register_user(pub_key_hex, email, name = null, role = 'student') {
    if (find_user_by_email(email)) {
        throw new Error(`User with email ${email} already exists.`);
    }
    if (find_user_by_pub_key(pub_key_hex)) {
        throw new Error('User with this public key already exists.');
    }
    const user = {
        id: users.length + 1,
        email: email,
        name: name || email.split('@')[0],
        role: role || 'student',
        pub_key: pub_key_hex,
        registered_at: new Date().toISOString()
    };
    users.push(user);
    console.log(`User registered: ${user.name} (${email}) as ${user.role}`);
    return user;
}

export { register_user, find_user_by_pub_key, find_user_by_email };