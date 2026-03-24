document.addEventListener('DOMContentLoaded', () => {
    const accountList = document.getElementById('accountList');

    function renderUsers(response) {
        if (chrome.runtime.lastError) {
            accountList.innerHTML = '<div class="empty-state">Error loading accounts.</div>';
            return;
        }
        if (response && response.success && response.users) {
            const emails = Object.keys(response.users);
            accountList.innerHTML = '';
            if (emails.length === 0) {
                accountList.innerHTML = '<div class="empty-state">No accounts registered yet.</div>';
            } else {
                emails.forEach(email => {
                    const li = document.createElement('li');
                    li.textContent = email;
                    accountList.appendChild(li);
                });
            }
        } else {
            accountList.innerHTML = '<div class="empty-state">Error loading accounts.</div>';
        }
    }

    chrome.runtime.sendMessage({ action: "getAllUsers" }, renderUsers);
});
