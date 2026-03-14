// script.js - Lunar AI dengan Groq API
const GROQ_API_KEY = 'YOUR_GROQ_API_KEY_HERE'; // Ganti dengan API key Anda
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Storage keys
const STORAGE_KEYS = {
    USERS: 'lunar_users',
    CURRENT_USER: 'lunar_current_user',
    CHAT_HISTORY: 'lunar_chat_history_',
    USER_MEMORY: 'lunar_memory_'
};

// Initialize storage
function initStorage() {
    if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
        localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify([]));
    }
}

// User Management
class UserManager {
    static register(username, email, password) {
        initStorage();
        const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS));
        
        // Check if user exists
        if (users.find(u => u.email === email)) {
            return { success: false, message: 'Email already registered' };
        }
        
        const newUser = {
            id: Date.now().toString(),
            username,
            email,
            password: btoa(password), // Simple encoding (use proper hashing in production)
            createdAt: new Date().toISOString()
        };
        
        users.push(newUser);
        localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
        
        // Initialize user memory
        localStorage.setItem(STORAGE_KEYS.USER_MEMORY + newUser.id, JSON.stringify([]));
        localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY + newUser.id, JSON.stringify([]));
        
        return { success: true, user: newUser };
    }
    
    static login(email, password) {
        initStorage();
        const users = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS));
        const user = users.find(u => u.email === email && u.password === btoa(password));
        
        if (user) {
            localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
            return { success: true, user };
        }
        
        return { success: false, message: 'Invalid email or password' };
    }
    
    static logout() {
        localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
        window.location.href = 'login.html';
    }
    
    static getCurrentUser() {
        const user = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
        return user ? JSON.parse(user) : null;
    }
}

// Memory Management
class MemoryManager {
    static saveMemory(userId, type, content) {
        const memories = JSON.parse(localStorage.getItem(STORAGE_KEYS.USER_MEMORY + userId) || '[]');
        memories.push({
            id: Date.now(),
            type,
            content,
            timestamp: new Date().toISOString()
        });
        localStorage.setItem(STORAGE_KEYS.USER_MEMORY + userId, JSON.stringify(memories));
    }
    
    static getMemories(userId) {
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.USER_MEMORY + userId) || '[]');
    }
    
    static getRelevantMemories(userId, query) {
        const memories = this.getMemories(userId);
        // Simple keyword matching (implement better search in production)
        return memories.filter(m => 
            m.content.toLowerCase().includes(query.toLowerCase())
        ).slice(-5); // Last 5 relevant memories
    }
}

// Chat History Management
class ChatManager {
    static saveMessage(userId, message, isUser = true) {
        const history = JSON.parse(localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY + userId) || '[]');
        history.push({
            id: Date.now(),
            message,
            isUser,
            timestamp: new Date().toISOString()
        });
        localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY + userId, JSON.stringify(history));
        return history;
    }
    
    static getHistory(userId) {
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY + userId) || '[]');
    }
    
    static clearHistory(userId) {
        localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY + userId, JSON.stringify([]));
    }
}

// File Upload Handler
class FileUploader {
    static async uploadFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                const fileData = {
                    name: file.name,
                    type: file.type,
                    size: file.size,
                    data: e.target.result,
                    timestamp: new Date().toISOString()
                };
                resolve(fileData);
            };
            
            reader.onerror = reject;
            
            if (file.type.startsWith('image/')) {
                reader.readAsDataURL(file);
            } else {
                reader.readAsText(file);
            }
        });
    }
    
    static getFileIcon(type) {
        if (type.startsWith('image/')) return '🖼️';
        if (type.includes('pdf')) return '📄';
        if (type.includes('word')) return '📝';
        if (type.includes('excel')) return '📊';
        return '📁';
    }
}

// Groq AI Integration
class GroqAI {
    static async sendMessage(message, files = [], userId) {
        try {
            // Get relevant memories
            const memories = MemoryManager.getRelevantMemories(userId, message);
            
            // Build context from memories
            let context = '';
            if (memories.length > 0) {
                context = 'Previous context:\n' + memories.map(m => 
                    `- ${m.type}: ${m.content}`
                ).join('\n') + '\n\n';
            }
            
            // Handle files
            let fileContent = '';
            if (files.length > 0) {
                fileContent = 'Files uploaded:\n' + files.map(f => 
                    `- ${f.name} (${f.type})`
                ).join('\n') + '\n\n';
            }
            
            const fullMessage = context + fileContent + message;
            
            const response = await fetch(GROQ_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${GROQ_API_KEY}`
                },
                body: JSON.stringify({
                    model: 'mixtral-8x7b-32768',
                    messages: [
                        {
                            role: 'system',
                            content: `You are Lunar AI, a helpful and friendly AI assistant. 
                            You have a warm, professional tone and remember previous conversations.
                            Current date: ${new Date().toLocaleDateString()}`
                        },
                        {
                            role: 'user',
                            content: fullMessage
                        }
                    ],
                    temperature: 0.7,
                    max_tokens: 2048
                })
            });
            
            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error.message);
            }
            
            const aiResponse = data.choices[0].message.content;
            
            // Save important information to memory
            if (aiResponse.toLowerCase().includes('remember') || 
                message.toLowerCase().includes('remember')) {
                MemoryManager.saveMemory(userId, 'conversation', 
                    `Q: ${message}\nA: ${aiResponse.substring(0, 200)}`);
            }
            
            return { success: true, response: aiResponse };
            
        } catch (error) {
            console.error('Groq API Error:', error);
            return { 
                success: false, 
                error: 'Failed to get response from AI. Please try again.' 
            };
        }
    }
}

// UI Components
class LunarUI {
    static createMessageElement(message, isUser = true, timestamp = new Date()) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isUser ? 'user' : 'ai'}`;
        
        const timeString = timestamp.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        messageDiv.innerHTML = `
            <div class="message-avatar">
                ${isUser ? '👤' : '🌙'}
            </div>
            <div class="message-content">
                <div class="message-text">${this.escapeHtml(message)}</div>
                <div class="message-time">${timeString}</div>
            </div>
        `;
        
        return messageDiv;
    }
    
    static createFileElement(file) {
        const fileDiv = document.createElement('div');
        fileDiv.className = 'file-attachment';
        
        if (file.type.startsWith('image/')) {
            fileDiv.innerHTML = `
                <img src="${file.data}" alt="${file.name}">
                <span class="file-name">${file.name}</span>
            `;
        } else {
            fileDiv.innerHTML = `
                <span class="file-icon">${FileUploader.getFileIcon(file.type)}</span>
                <span class="file-name">${file.name}</span>
                <span class="file-size">(${(file.size / 1024).toFixed(2)} KB)</span>
            `;
        }
        
        return fileDiv;
    }
    
    static escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    static showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 24px;
            background: var(--glass-bg);
            backdrop-filter: blur(10px);
            border: 1px solid var(--glass-border);
            border-radius: 10px;
            color: white;
            z-index: 2000;
            animation: slideIn 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
}

// Initialize Dashboard
function initDashboard() {
    const user = UserManager.getCurrentUser();
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    
    // Display user info
    document.getElementById('userName').textContent = user.username;
    document.getElementById('userEmail').textContent = user.email;
    document.getElementById('userAvatar').textContent = user.username[0].toUpperCase();
    
    // Load chat history
    loadChatHistory();
    
    // Setup event listeners
    setupEventListeners(user);
}

// Load chat history
function loadChatHistory() {
    const user = UserManager.getCurrentUser();
    if (!user) return;
    
    const history = ChatManager.getHistory(user.id);
    const chatMessages = document.getElementById('chatMessages');
    
    chatMessages.innerHTML = '';
    history.forEach(msg => {
        const messageEl = LunarUI.createMessageElement(
            msg.message, 
            msg.isUser, 
            new Date(msg.timestamp)
        );
        chatMessages.appendChild(messageEl);
    });
    
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Setup event listeners
function setupEventListeners(user) {
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');
    const uploadBtn = document.getElementById('uploadBtn');
    const fileModal = document.getElementById('fileModal');
    const closeModal = document.querySelector('.close-modal');
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const newChatBtn = document.getElementById('newChatBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    
    let currentFiles = [];
    
    // Auto-resize textarea
    messageInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });
    
    // Send message on Enter (but Shift+Enter for new line)
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // Send message
    sendButton.addEventListener('click', sendMessage);
    
    async function sendMessage() {
        const message = messageInput.value.trim();
        if (!message && currentFiles.length === 0) return;
        
        // Display user message
        const userMessageEl = LunarUI.createMessageElement(message, true);
        document.getElementById('chatMessages').appendChild(userMessageEl);
        
        // Save to history
        ChatManager.saveMessage(user.id, message, true);
        
        // Clear input
        messageInput.value = '';
        messageInput.style.height = 'auto';
        
        // Show typing indicator
        const typingIndicator = showTypingIndicator();
        
        try {
            // Send to Groq AI
            const result = await GroqAI.sendMessage(message, currentFiles, user.id);
            
            // Remove typing indicator
            typingIndicator.remove();
            
            if (result.success) {
                // Display AI response
                const aiMessageEl = LunarUI.createMessageElement(result.response, false);
                document.getElementById('chatMessages').appendChild(aiMessageEl);
                
                // Save to history
                ChatManager.saveMessage(user.id, result.response, false);
            } else {
                LunarUI.showNotification(result.error, 'error');
            }
            
            // Clear files
            currentFiles = [];
            
        } catch (error) {
            typingIndicator.remove();
            LunarUI.showNotification('Error sending message', 'error');
        }
        
        // Scroll to bottom
        document.getElementById('chatMessages').scrollTop = 
            document.getElementById('chatMessages').scrollHeight;
    }
    
    // File upload handling
    uploadBtn.addEventListener('click', () => {
        fileModal.classList.add('active');
    });
    
    closeModal.addEventListener('click', () => {
        fileModal.classList.remove('active');
    });
    
    uploadArea.addEventListener('click', () => {
        fileInput.click();
    });
    
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--primary)';
        uploadArea.style.background = 'rgba(255,255,255,0.1)';
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.style.borderColor = 'var(--glass-border)';
        uploadArea.style.background = 'none';
    });
    
    uploadArea.addEventListener('drop', async (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--glass-border)';
        uploadArea.style.background = 'none';
        
        const files = Array.from(e.dataTransfer.files);
        await handleFiles(files);
    });
    
    fileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        await handleFiles(files);
    });
    
    async function handleFiles(files) {
        for (const file of files) {
            if (file.size > 10 * 1024 * 1024) { // 10MB limit
                LunarUI.showNotification('File too large (max 10MB)', 'error');
                continue;
            }
            
            const fileData = await FileUploader.uploadFile(file);
            currentFiles.push(fileData);
            
            // Display file preview
            const fileElement = LunarUI.createFileElement(fileData);
            document.getElementById('chatMessages').appendChild(fileElement);
        }
        
        fileModal.classList.remove('active');
        fileInput.value = '';
        
        LunarUI.showNotification(`${files.length} file(s) uploaded`, 'success');
    }
    
    // New chat
    newChatBtn.addEventListener('click', () => {
        ChatManager.clearHistory(user.id);
        document.getElementById('chatMessages').innerHTML = '';
        LunarUI.showNotification('New chat started', 'success');
    });
    
    // Logout
    logoutBtn.addEventListener('click', () => {
        UserManager.logout();
    });
    
    // Load chat history items
    loadHistoryItems();
}

// Show typing indicator
function showTypingIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'message ai typing-indicator';
    indicator.innerHTML = `
        <div class="message-avatar">🌙</div>
        <div class="message-content">
            <div class="typing-dots">
                <span>.</span><span>.</span><span>.</span>
            </div>
        </div>
    `;
    
    document.getElementById('chatMessages').appendChild(indicator);
    document.getElementById('chatMessages').scrollTop = 
        document.getElementById('chatMessages').scrollHeight;
    
    return indicator;
}

// Load history items in sidebar
function loadHistoryItems() {
    const user = UserManager.getCurrentUser();
    if (!user) return;
    
    const history = ChatManager.getHistory(user.id);
    const historyContainer = document.getElementById('chatHistory');
    
    // Group by date
    const groups = {};
    history.forEach(msg => {
        if (!msg.isUser) return; // Only user messages as conversation starters
        const date = new Date(msg.timestamp).toLocaleDateString();
        if (!groups[date]) groups[date] = [];
        groups[date].push(msg);
    });
    
    historyContainer.innerHTML = '';
    
    Object.keys(groups).forEach(date => {
        const dateHeader = document.createElement('div');
        dateHeader.className = 'history-date';
        dateHeader.textContent = date;
        dateHeader.style.cssText = `
            padding: 10px;
            color: var(--text-secondary);
            font-size: 0.85rem;
            font-weight: 600;
        `;
        historyContainer.appendChild(dateHeader);
        
        groups[date].slice(-3).forEach(msg => {
            const item = document.createElement('div');
            item.className = 'history-item';
            item.textContent = msg.message.substring(0, 30) + 
                (msg.message.length > 30 ? '...' : '');
            historyContainer.appendChild(item);
        });
    });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initStorage();
    
    // Check current page
    const path = window.location.pathname;
    
    if (path.includes('dashboard.html')) {
        initDashboard();
    }
    
    // Login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            const result = UserManager.login(email, password);
            
            if (result.success) {
                window.location.href = 'dashboard.html';
            } else {
                alert(result.message);
            }
        });
    }
    
    // Register form
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const username = document.getElementById('username').value;
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            
            if (password !== confirmPassword) {
                alert('Passwords do not match');
                return;
            }
            
            const result = UserManager.register(username, email, password);
            
            if (result.success) {
                alert('Registration successful! Please login.');
                window.location.href = 'login.html';
            } else {
                alert(result.message);
            }
        });
    }
});
