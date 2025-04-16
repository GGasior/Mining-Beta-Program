const { io } = require('socket.io-client');
const os = require('os');
const fs = require('fs');
const path = require('path');

/**
 * Lightweight Client for Lotto Neural Network
 * This client doesn't require TensorFlow and just reports progress
 * while the server handles the actual training.
 */
class LightweightClient {
    constructor(serverUrl = 'http://localhost:3000') {
        this.serverUrl = serverUrl;
        this.socket = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.walletData = null;
        
        this.clientInfo = {
            hostname: os.hostname(),
            cpus: os.cpus().length,
            platform: os.platform(),
            arch: os.arch(),
            totalMemory: os.totalmem(),
            freeMemory: os.freemem(),
            networkInterfaces: this.getNetworkInfo()
        };
        
        // Store the client IP for verification purposes
        this.clientIP = this.getClientIP();
        
        // Verification codes storage
        this.verificationCodes = new Map();
    }

    getNetworkInfo() {
        const interfaces = os.networkInterfaces();
        const validInterfaces = {};
        
        // Filter out internal interfaces and format the output
        Object.keys(interfaces).forEach((name) => {
            const addrs = interfaces[name].filter(addr => 
                !addr.internal && addr.family === 'IPv4'
            );
            if (addrs.length > 0) {
                validInterfaces[name] = addrs;
            }
        });
        
        return validInterfaces;
    }
    
    // Get the client IP address from network interfaces
    getClientIP() {
        try {
            const interfaces = os.networkInterfaces();
            let clientIP = null;
            
            // Find the first non-internal IPv4 address
            Object.keys(interfaces).forEach((ifname) => {
                interfaces[ifname].forEach((iface) => {
                    if (iface.family === 'IPv4' && !iface.internal) {
                        clientIP = iface.address;
                    }
                });
            });
            
            return clientIP || '127.0.0.1';
        } catch (err) {
            console.error('Error getting client IP:', err);
            return '127.0.0.1';
        }
    }
    
    // Register wallet data
    registerWallet(walletData) {
        this.walletData = walletData;
        console.log(`Wallet registered: ${walletData.walletAddress} (${walletData.username})`);
        console.log(`Wallet IP address: ${walletData.ipAddress}`);
        
        // Check if IPs match and print verification code to terminal
        this.logIPMatchStatus(walletData.ipAddress);
        
        // If connected to server, send wallet registration
        if (this.socket && this.isConnected) {
            return new Promise((resolve, reject) => {
                this.socket.emit('register_wallet', walletData, (response) => {
                    if (response && response.success) {
                        resolve(response);
                    } else {
                        reject(new Error('Failed to register wallet with server'));
                    }
                });
            });
        }
        
        return Promise.resolve({ success: true, local: true });
    }
    
    // Verify IP address match and generate verification code
    verifyIP(ipAddress) {
        const isMatch = ipAddress === this.clientIP;
        
        // Generate verification code
        const verificationCode = this.generateVerificationCode(ipAddress);
        
        // Log the verification code to console
        this.logVerificationCode(ipAddress, verificationCode, isMatch);
        
        return Promise.resolve({ match: isMatch, verificationCode });
    }
    
    // Log IP match status and verification code to console
    logIPMatchStatus(ipAddress) {
        const isMatch = ipAddress === this.clientIP;
        const matchStatus = isMatch ? 'MATCH' : 'MISMATCH';
        const verificationCode = this.generateVerificationCode(ipAddress);
        
        console.log('\n=======================================');
        console.log(`IP ${matchStatus} DETECTED: ${isMatch ? 'Browser and Light Client have same IP' : 'Browser and Light Client have different IPs'}`);
        console.log(`Browser IP: ${ipAddress}`);
        console.log(`Light Client IP: ${this.clientIP}`);
        console.log('=======================================');
        
        this.logVerificationCode(ipAddress, verificationCode, isMatch);
        
        return { match: isMatch, verificationCode };
    }
    
    // Generate verification code based on IP
    generateVerificationCode(ipAddress) {
        // Generate a verification code based on IP and current timestamp
        const timestamp = Date.now();
        const ipSegments = ipAddress.split('.').map(Number);
        const baseCode = ipSegments.reduce((sum, octet) => sum + octet, 0) % 1000 + 1000;
        const timeCode = Math.floor((timestamp / 1000) % 100);
        const verificationCode = `${baseCode}${timeCode}`;
        
        // Store the verification code for later validation
        this.verificationCodes.set(ipAddress, verificationCode);
        
        return verificationCode;
    }
    
    // Log verification code to console
    logVerificationCode(ipAddress, code, isMatch) {
        console.log('\n▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶');
        console.log(`VERIFICATION CODE: ${code}`);
        console.log('Use this code to verify your wallet in the browser');
        console.log('▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶▶\n');
        
        if (isMatch) {
            console.log('✅ IP addresses match. You can proceed with wallet verification.');
        } else {
            console.log('⚠️ IP addresses do not match. This might affect wallet functionality.');
        }
        
        return code;
    }

    async connect() {
        try {
            console.log(`Connecting to server at ${this.serverUrl}...`);
            console.log('Client Network Information:');
            Object.entries(this.getNetworkInfo()).forEach(([name, addrs]) => {
                addrs.forEach(addr => {
                    console.log(`Interface ${name}: ${addr.address}`);
                });
            });

            this.socket = io(this.serverUrl, {
                reconnection: true,
                reconnectionAttempts: this.maxReconnectAttempts,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                timeout: 20000,
                transports: ['websocket', 'polling'],
                forceNew: true,
                path: '/socket.io',
                agent: null,
                rejectUnauthorized: false,
                extraHeaders: {
                    'User-Agent': 'LightweightClient/Termux'
                },
                pingTimeout: 60000,
                pingInterval: 25000,
                upgrade: true,
                rememberUpgrade: true
            });

            // Set up socket event handlers
            this.socket.on('connect', () => {
                console.log(`Connected to server. Client ID: ${this.socket.id}`);
                this.isConnected = true;
                this.reconnectAttempts = 0;
                
                // Send client info
                this.socket.emit('client_info', {
                    ...this.clientInfo,
                    clientType: 'lightweight',
                    capabilities: {
                        cpuCores: this.clientInfo.cpus,
                        memoryGB: Math.round(this.clientInfo.totalMemory / (1024 * 1024 * 1024))
                    }
                });
                
                console.log('Waiting for lightweight work assignment...');
                this.requestWork();
            });

            this.socket.on('disconnect', () => {
                console.log('Disconnected from server');
                this.isConnected = false;
            });

            this.socket.on('status', (data) => {
                console.log('\nServer status:');
                if (data.isTraining) {
                    console.log(`✓ Training in progress: ${data.currentEpoch}/${data.totalEpochs} epochs completed`);
                    console.log(`✓ Client count: ${data.clientCount}`);
                } else {
                    console.log(`ⓘ No training in progress. This client is ready and waiting for work.`);
                    console.log(`ⓘ Client count: ${data.clientCount}`);
                    console.log('\nTo start training, you need to:');
                    console.log('1. Run "npm run train" on the server machine and select distributed mode');
                    console.log('   OR');
                    console.log('2. Open the web interface at http://server-ip:3000 and click "Start Training"');
                }
            });

            // Handle lightweight work assignment
            this.socket.on('lightweight_work', async (data) => {
                console.log(`Received lightweight work: ${data.workType}`);
                await this.processLightweightWork(data);
            });
            
            // Handle wallet verification request
            this.socket.on('verify_wallet', (data, callback) => {
                console.log(`Received wallet verification request for ${data.walletAddress}`);
                
                // Generate and log verification code
                const verificationCode = this.generateVerificationCode(data.ipAddress);
                this.logVerificationCode(data.ipAddress, verificationCode, data.ipAddress === this.clientIP);
                
                // Send back verification result
                if (callback && typeof callback === 'function') {
                    callback({
                        success: true,
                        message: 'Verification code generated and logged to console',
                        verificationCode: verificationCode
                    });
                }
            });
            
            // Handle wallet reward
            this.socket.on('wallet_reward', (data) => {
                console.log(`Received reward for wallet ${data.walletAddress}: ${data.amount} coins`);
                
                // If we have a matching wallet, process the reward
                if (this.walletData && this.walletData.walletAddress === data.walletAddress) {
                    console.log(`Processed reward of ${data.amount} coins for local wallet`);
                    
                    // Emit a reward event to any listeners
                    if (typeof this.onReward === 'function') {
                        this.onReward({
                            amount: data.amount,
                            timestamp: Date.now(),
                            walletAddress: data.walletAddress
                        });
                    }
                }
            });

            this.socket.on('no_work_available', (data) => {
                console.log(`No work available: ${data.message}`);
                setTimeout(() => this.requestWork(), 5000);
            });

            this.socket.on('connect_error', (error) => {
                this.reconnectAttempts++;
                console.error('Connection error details:', {
                    message: error.message,
                    type: error.type,
                    description: error.description,
                    serverUrl: this.serverUrl,
                    attempt: `${this.reconnectAttempts}/${this.maxReconnectAttempts}`
                });
                
                this.testServerConnection();
                
                if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                    console.log('\nMax reconnection attempts reached. Please check:');
                    console.log('1. Server URL is correct:', this.serverUrl);
                    console.log('2. Server is running and accessible');
                    console.log('3. No firewall blocking connection');
                    console.log('4. Network connectivity is stable');
                    console.log('\nTry running with explicit protocol:');
                    console.log(`node light-client.js http://46.205.192.114:3000`);
                    process.exit(1);
                }
                
                console.log(`\nRetrying in 5 seconds... (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            });

            return true;
        } catch (error) {
            console.error('Error connecting to server:', error);
            return false;
        }
    }
    
    // Set reward callback
    onReward(callback) {
        this.onReward = callback;
    }

    requestWork() {
        if (this.socket && this.isConnected) {
            console.log('Requesting lightweight work from server...');
            this.socket.emit('request_lightweight_work');
        }
    }

    async processLightweightWork(data) {
        try {
            const { workId, workType } = data;
            
            console.log(`Processing ${workType} (ID: ${workId})...`);
            let result = null;

            // Simulate work by waiting
            const workTime = Math.floor(Math.random() * 3000) + 2000; // 2-5 seconds
            await new Promise(resolve => setTimeout(resolve, workTime));
            
            switch (workType) {
                case 'data_validation':
                    result = {
                        valid: true,
                        recordsProcessed: Math.floor(Math.random() * 1000) + 500
                    };
                    break;
                    
                case 'result_verification':
                    result = {
                        verified: true,
                        confidence: Math.random() * 0.5 + 0.5 // 0.5-1.0
                    };
                    break;
                    
                case 'pattern_analysis':
                    result = {
                        patternsFound: Math.floor(Math.random() * 5) + 1,
                        strongestPattern: Math.floor(Math.random() * 80) + 1
                    };
                    break;
                    
                case 'wallet_mining':
                    // If we have a registered wallet, include it in the result
                    if (this.walletData) {
                        result = {
                            completed: true,
                            walletAddress: this.walletData.walletAddress,
                            username: this.walletData.username,
                            minedTime: workTime
                        };
                    } else {
                        result = { completed: true };
                    }
                    break;
                    
                default:
                    result = { completed: true };
            }

            console.log(`Work completed in ${workTime/1000} seconds. Result:`, result);
            
            // Send result back to server
            this.socket.emit('lightweight_work_completed', {
                workId,
                workType,
                clientId: this.socket.id,
                result,
                processingTime: workTime,
                walletAddress: this.walletData ? this.walletData.walletAddress : null
            });
            
            // Request more work
            setTimeout(() => this.requestWork(), 1000);
            
        } catch (error) {
            console.error('Error processing work:', error);
            setTimeout(() => this.requestWork(), 5000);
        }
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            console.log('Disconnected from server');
        }
    }

    async testServerConnection() {
        try {
            const http = require('http');
            const url = new URL(this.serverUrl);
            
            return new Promise((resolve) => {
                const req = http.get({
                    hostname: url.hostname,
                    port: url.port,
                    path: '/socket.io/socket.io.js',
                    timeout: 5000
                }, (res) => {
                    if (res.statusCode === 200) {
                        console.log('Server is reachable and Socket.IO is available');
                    } else {
                        console.log(`Server responded with status code: ${res.statusCode}`);
                    }
                    resolve(true);
                });
                
                req.on('error', (err) => {
                    console.log(`Server connection test failed: ${err.message}`);
                    resolve(false);
                });
                
                req.end();
            });
        } catch (error) {
            console.log('Failed to test server connection:', error.message);
            return false;
        }
    }
    
    // Start mining with a wallet
    start() {
        if (this.socket && this.isConnected && this.walletData) {
            console.log(`Starting mining process for wallet: ${this.walletData.walletAddress}`);
            this.socket.emit('start_wallet_mining', this.walletData);
            return true;
        } else if (!this.socket || !this.isConnected) {
            console.log('Cannot start mining: not connected to server');
            return false;
        } else if (!this.walletData) {
            console.log('Cannot start mining: no wallet registered');
            return false;
        }
    }
}

/**
 * Browser-compatible version of LightClient
 * This is used when the script is loaded in a browser context
 */
class LightClient {
    constructor(options = {}) {
        this.walletAddress = options.walletAddress || null;
        this.username = options.username || null;
        this.ipAddress = options.ipAddress || null;
        this.connected = false;
        this.socket = null;
        this.serverUrl = options.serverUrl || 'http://localhost:3000';
        
        // Callbacks
        this.onMessage = options.onMessage || function() {};
        this.onError = options.onError || function() {};
        this.onReward = options.onReward || function() {};
        this.onVerificationRequest = options.onVerificationRequest || function() {};
        
        // Initialize if we're in a browser
        if (typeof window !== 'undefined') {
            this.isBrowser = true;
            this.initBrowser();
        } else {
            this.isBrowser = false;
        }
    }
    
    // Initialize in browser context
    initBrowser() {
        console.log('Initializing LightClient in browser');
        
        // Create a stub for Socket.IO
        if (typeof io === 'undefined') {
            console.warn('Socket.IO not available in browser context');
        } else {
            // Connect to server if Socket.IO is available
            try {
                this.socket = io(this.serverUrl);
                this.socket.on('connect', () => {
                    this.connected = true;
                    this.onMessage({ type: 'status_update', text: 'Connected to server' });
                });
                
                this.socket.on('disconnect', () => {
                    this.connected = false;
                    this.onMessage({ type: 'status_update', text: 'Disconnected from server' });
                });
                
                this.socket.on('wallet_reward', (data) => {
                    if (data.walletAddress === this.walletAddress) {
                        this.onReward({
                            amount: data.amount,
                            timestamp: Date.now(),
                            walletAddress: data.walletAddress
                        });
                    }
                });
                
                this.socket.on('verify_wallet', (data) => {
                    if (data.walletAddress === this.walletAddress) {
                        // Generate a verification code and pass it to the callback
                        const verificationCode = this.generateVerificationCode(data.ipAddress);
                        this.onVerificationRequest({
                            walletAddress: data.walletAddress,
                            ipAddress: data.ipAddress,
                            verificationCode: verificationCode
                        });
                    }
                });
            } catch (err) {
                console.error('Error initializing Socket.IO in browser:', err);
                this.onError(err);
            }
        }
    }
    
    // Register wallet with server
    registerWallet(walletData) {
        return new Promise((resolve, reject) => {
            this.walletAddress = walletData.walletAddress;
            this.username = walletData.username;
            this.ipAddress = walletData.ipAddress;
            
            if (this.socket && this.connected) {
                this.socket.emit('register_wallet', walletData, (response) => {
                    if (response && response.success) {
                        this.onMessage({ 
                            type: 'status_update', 
                            text: 'Wallet registered with server' 
                        });
                        resolve(response);
                    } else {
                        const error = new Error('Failed to register wallet with server');
                        this.onError(error);
                        reject(error);
                    }
                });
            } else {
                // In browser mode with no server connection, we'll simulate success
                console.log('No server connection, simulating wallet registration');
                this.onMessage({ 
                    type: 'status_update', 
                    text: 'Wallet registered (local mode)' 
                });
                resolve({ success: true, local: true });
            }
        });
    }
    
    // Start mining process
    start() {
        if (this.socket && this.connected && this.walletAddress) {
            this.socket.emit('start_wallet_mining', {
                walletAddress: this.walletAddress,
                username: this.username,
                ipAddress: this.ipAddress
            });
            this.onMessage({ 
                type: 'status_update', 
                text: 'Mining process started' 
            });
            return true;
        } else if (this.isBrowser) {
            // Simulate mining in browser without server connection
            console.log('Starting simulated mining in browser');
            this.onMessage({ 
                type: 'status_update', 
                text: 'Mining process started (simulated)' 
            });
            
            // Simulate rewards every 5 minutes
            this.rewardInterval = setInterval(() => {
                this.onReward({
                    amount: 1,
                    timestamp: Date.now(),
                    walletAddress: this.walletAddress
                });
            }, 300000); // 5 minutes
            
            return true;
        }
        
        this.onError(new Error('Cannot start mining: not connected to server'));
        return false;
    }
    
    // Verify IP address
    verifyIP(ipAddress) {
        return new Promise((resolve) => {
            // In browser context, we can't know the client machine's IP
            // so we'll just generate a verification code and hope the server can match
            const verificationCode = this.generateVerificationCode(ipAddress);
            
            if (this.socket && this.connected) {
                this.socket.emit('verify_ip', { ipAddress, walletAddress: this.walletAddress }, (response) => {
                    if (response && response.verificationCode) {
                        resolve({
                            match: response.match,
                            verificationCode: response.verificationCode
                        });
                    } else {
                        resolve({
                            match: false,
                            verificationCode: verificationCode
                        });
                    }
                });
            } else {
                // If no connection, just return the generated code
                resolve({
                    match: true, // Assume match in local mode
                    verificationCode: verificationCode
                });
            }
        });
    }
    
    // Log IP match status for browser-server communication
    logIPMatchStatus(ipAddress) {
        if (this.socket && this.connected) {
            this.socket.emit('log_ip_match', {
                browserIP: ipAddress,
                walletAddress: this.walletAddress
            });
        }
        
        // Return a simulated verification code
        return this.generateVerificationCode(ipAddress);
    }
    
    // Generate verification code based on IP
    generateVerificationCode(ipAddress) {
        // Generate a verification code based on IP and current timestamp
        const timestamp = Date.now();
        const ipSegments = ipAddress.split('.').map(Number);
        const baseCode = ipSegments.reduce((sum, octet) => sum + octet, 0) % 1000 + 1000;
        const timeCode = Math.floor((timestamp / 1000) % 100);
        return `${baseCode}${timeCode}`;
    }
    
    // Stop mining process
    stop() {
        if (this.rewardInterval) {
            clearInterval(this.rewardInterval);
        }
        
        if (this.socket && this.connected) {
            this.socket.emit('stop_wallet_mining', { walletAddress: this.walletAddress });
        }
        
        this.onMessage({ 
            type: 'status_update', 
            text: 'Mining process stopped' 
        });
    }
    
    // Disconnect from server
    disconnect() {
        this.stop();
        
        if (this.socket) {
            this.socket.disconnect();
        }
    }
}

// Get client IP - Browser compatible function
function getClientIP() {
    return new Promise((resolve) => {
        if (typeof window !== 'undefined') {
            // In browser context, we'll use a service to get the IP
            fetch('https://api.ipify.org?format=json')
                .then(response => response.json())
                .then(data => resolve(data.ip))
                .catch(() => {
                    // Fallback if the service fails
                    resolve('127.0.0.1');
                });
        } else {
            // In Node.js context, use os module
            try {
                const os = require('os');
                const interfaces = os.networkInterfaces();
                let ip = '127.0.0.1';
                
                // Find first non-internal IPv4 address
                Object.keys(interfaces).forEach((ifname) => {
                    interfaces[ifname].forEach((iface) => {
                        if (iface.family === 'IPv4' && !iface.internal) {
                            ip = iface.address;
                        }
                    });
                });
                
                resolve(ip);
            } catch (err) {
                resolve('127.0.0.1');
            }
        }
    });
}

// Request IP verification - Browser compatible function
function requestIPVerification(ipAddress) {
    return new Promise((resolve) => {
        if (typeof window !== 'undefined') {
            // Check if we have a global socket instance
            if (window.io) {
                const socket = io();
                socket.emit('verify_ip', { ipAddress }, (response) => {
                    resolve(response || { success: false });
                });
            } else {
                // Fallback to simulating verification
                const verificationCode = (ipAddress.split('.').reduce((sum, octet) => sum + parseInt(octet), 0) % 1000 + 1000).toString();
                console.log(`%c[VERIFICATION CODE: ${verificationCode}]`, 'color: lime; background: black; font-size: 16px; padding: 5px;');
                resolve({
                    success: true,
                    verificationCode: verificationCode
                });
            }
        } else {
            // In Node.js context, return a simulated response
            const verificationCode = (ipAddress.split('.').reduce((sum, octet) => sum + parseInt(octet), 0) % 1000 + 1000).toString();
            console.log(`\nVERIFICATION CODE: ${verificationCode}\n`);
            resolve({
                success: true,
                verificationCode: verificationCode
            });
        }
    });
}

// Export functions and classes for different environments
if (typeof window !== 'undefined') {
    // Browser environment
    window.LightClient = LightClient;
    window.getClientIP = getClientIP;
    window.requestIPVerification = requestIPVerification;
} else {
    // Node.js environment
    module.exports = {
        LightweightClient,
        LightClient,
        getClientIP,
        requestIPVerification
    };
}

// Main function for Node.js
if (typeof window === 'undefined') {
    async function main() {
        try {
            // Improved server URL handling
            let serverUrl = process.argv[2] || 'http://localhost:3000';
            
            // Remove any extra colons from the URL
            serverUrl = serverUrl.replace(/:{2,}/g, ':');
            
            // Ensure proper URL format
            if (!serverUrl.match(/^https?:\/\//)) {
                serverUrl = `http://${serverUrl}`;
            }

            // Parse URL to ensure it's valid
            try {
                new URL(serverUrl);
            } catch (e) {
                console.error('Invalid server URL format. Please use: http://IP:PORT');
                process.exit(1);
            }
            
            const client = new LightweightClient(serverUrl);
            
            console.log('==============================================');
            console.log('   Lightweight Lotto Training Client');
            console.log('==============================================');
            console.log(`Connecting to server: ${serverUrl}`);
            console.log('----------------------------------------------');
            console.log('System Info:');
            console.log(`Hostname: ${client.clientInfo.hostname}`);
            console.log(`CPU Cores: ${client.clientInfo.cpus}`);
            console.log(`Platform: ${client.clientInfo.platform} (${client.clientInfo.arch})`);
            console.log(`Total Memory: ${Math.round(client.clientInfo.totalMemory / (1024 * 1024 * 1024))} GB`);
            console.log(`Free Memory: ${Math.round(client.clientInfo.freeMemory / (1024 * 1024 * 1024))} GB`);
            console.log(`Client IP: ${client.clientIP}`);
            console.log('----------------------------------------------');
            
            // Handle SIGINT (Ctrl+C)
            process.on('SIGINT', () => {
                console.log('\nShutting down client...');
                client.disconnect();
                process.exit(0);
            });
            
            // Connect to server
            console.log(`Attempting to connect to server at ${serverUrl}...`);
            const connected = await client.connect();
            if (!connected) {
                console.error('Failed to connect to server. Exiting...');
                process.exit(1);
            }
            
        } catch (error) {
            console.error('Error in main function:', error);
            process.exit(1);
        }
    }

    // Run the client
    main();
} 