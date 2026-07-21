console.log("Zynk1 Authenticator background script loaded.");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getAllUsers") {
        chrome.storage.local.get('users', (data) => {
            sendResponse({ success: true, users: data.users || {} });
        });
        return true;
    }
});
