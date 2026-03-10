document.addEventListener('DOMContentLoaded', () => {
    const accountList = document.getElementById('accountList');

    function renderUsers(response) {
        if (chrome.runtime.lastError) {
            accountList.innerHTML = '<li>Error loading accounts.</li>';
            return;
        }
        if (response && response.success && response.users) {
            const emails = Object.keys(response.users);
            accountList.innerHTML = '';
            if (emails.length === 0) {
                accountList.innerHTML = '<li>No accounts registered yet.</li>';
            } else {
                emails.forEach(email => {
                    const li = document.createElement('li');
                    li.textContent = email;
                    accountList.appendChild(li);
                });
            }
        } else {
            accountList.innerHTML = '<li>Error loading accounts.</li>';
        }
    }

    chrome.runtime.sendMessage({ action: "getAllUsers" }, renderUsers);
});