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
        
        this.clientInfo = {
            hostname: os.hostname(),
            cpus: os.cpus().length,
            platform: os.platform(),
            arch: os.arch(),
            totalMemory: os.totalmem(),
            freeMemory: os.freemem(),
            networkInterfaces: this.getNetworkInfo()
        };
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
                processingTime: workTime
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
}

// Main function
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