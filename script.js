// script.js
// Web Audio APIのコンテキストを保持する変数 (ユーザー操作で初期化するためnullで開始)
let audioCtx = null;
let masterGainNode = null;
const DEFAULT_VOLUME = 0.3; 

// 音を生成して再生する汎用関数 (変更なし)
function playSound(type) {
    if (!audioCtx || !masterGainNode) {
        return;
    }

    const oscillator = audioCtx.createOscillator();
    const soundGainNode = audioCtx.createGain(); 

    oscillator.connect(soundGainNode);
    soundGainNode.connect(masterGainNode); 

    let freq, duration, initialVolume;

    switch (type) {
        case 'move':
            freq = 440; 
            duration = 0.05;
            initialVolume = 0.3; 
            break;
        case 'hit':
            freq = 120; 
            duration = 0.1;
            initialVolume = 0.5;
            break;
        case 'clear':
            freq = 660; 
            duration = 0.5;
            initialVolume = 0.4;
            oscillator.frequency.linearRampToValueAtTime(880, audioCtx.currentTime + 0.2);
            break;
        default:
            return;
    }

    oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime);
    soundGainNode.gain.setValueAtTime(initialVolume, audioCtx.currentTime); 

    oscillator.start();
    soundGainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    oscillator.stop(audioCtx.currentTime + duration);
}

// 迷路解析のためのカラーコード定数 (RGB形式)
const COLOR_MAP = {
    WALL: '#333333',     // 壁
    PATH: '#FFFFFF',     // 通路 (通常描画はしない)
    START: '#0000FF',    // 青 (スタート地点)
    GOAL: '#FF0000'      // 赤 (ゴール地点)
};


// 💡 MazeGenerator クラスは変更なし
class MazeGenerator {
    static generate(width, height, startCoords, goalCoords) {
        const GRID_WIDTH = width;
        const GRID_HEIGHT = height;

        const grid = Array(GRID_HEIGHT).fill(0).map(() => Array(GRID_WIDTH).fill(0));

        let currentCell = { x: 1, y: 1 }; 
        grid[currentCell.y][currentCell.x] = 1;
        
        const walls = [];

        const addWalls = (x, y) => {
            [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([dx, dy]) => {
                const wallX = x + dx;
                const wallY = y + dy;
                if (wallX > 0 && wallX < GRID_WIDTH - 1 && wallY > 0 && wallY < GRID_HEIGHT - 1 && grid[wallY][wallX] === 0) {
                    if (!walls.some(w => w.x === wallX && w.y === wallY)) {
                        walls.push({ x: wallX, y: wallY });
                    }
                }
            });
        };
        addWalls(currentCell.x, currentCell.y);


        while (walls.length > 0) {
            const wallIndex = Math.floor(Math.random() * walls.length);
            const wall = walls[wallIndex];
            walls.splice(wallIndex, 1); 

            const x = wall.x;
            const y = wall.y;
            
            let cell1 = null; 
            let cell2 = null; 

            if (x % 2 === 1 && y % 2 === 0) {
                cell1 = { x: x, y: y - 1 };
                cell2 = { x: x, y: y + 1 };
            } 
            else if (x % 2 === 0 && y % 2 === 1) {
                cell1 = { x: x - 1, y: y };
                cell2 = { x: x + 1, y: y };
            } else {
                continue; 
            }

            const isCell1Path = grid[cell1.y][cell1.x] === 1;
            const isCell2Path = grid[cell2.y][cell2.x] === 1;

            if (isCell1Path !== isCell2Path) {
                grid[y][x] = 1;

                const newCell = isCell1Path ? cell2 : cell1;
                grid[newCell.y][newCell.x] = 1;

                addWalls(newCell.x, newCell.y);
            }
        }

        const mazeData = {
            width: GRID_WIDTH,
            height: GRID_HEIGHT,
            start: startCoords,
            goal: goalCoords,
            walls: []
        };

        for (let y = 0; y < GRID_HEIGHT; y++) {
            for (let x = 0; x < GRID_WIDTH; x++) {
                if (grid[y][x] === 0) {
                    mazeData.walls.push({ x: x, y: y });
                }
            }
        }

        return mazeData;
    }
}


// 💡 Player クラスは変更なし
class Player {
    constructor(data) {
        this.id = data.id; 
        this.x = data.x;
        this.y = data.y;
        this.color = data.color;
        this.isGoal = data.isGoal;
        this.visitedCells = new Set(data.visitedCells || []); 
    }
    
    update(data) {
        this.x = data.x;
        this.y = data.y;
        this.isGoal = data.isGoal;
        this.visitedCells = new Set(data.visitedCells || []); 
    }
}

// 💡 Maze クラスは変更なし
class Maze {
    constructor(data) {
        this.width = data.width;
        this.height = data.height;
        this.start = data.start;
        this.goal = data.goal;
        this.walls = new Set();

        if (data.walls && Array.isArray(data.walls)) {
            data.walls.forEach(wall => {
                if (typeof wall === 'object' && wall !== null) {
                    this.walls.add(`${wall.x},${wall.y}`);
                } else {
                    this.walls.add(wall);
                }
            });
        }
    }

    isWall(x, y) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
            return true;
        }
        return this.walls.has(`${x},${y}`);
    }
}

// ゲームクラス 
class MazeGame {
    constructor() {
        this.currentScreen = 'title';
        this.maze = null;
        this.players = {}; // 全プレイヤー情報 (サーバーからの更新)
        this.playerId = null; // 自身のプレイヤーID (サーバーから割り当て)
        this.socket = null; // WebSocket接続

        this.myCanvas = null;
        this.myCtx = null;
        this.minimapCanvas = null;
        this.minimapCtx = null;
        
        this.mazeSize = 65; 
        this.pViewSize = 5; 
        this.pCellSize = 450 / this.pViewSize; 
        this.mCellSize = 450 / this.mazeSize; 
        
        this.gamepadInterval = null;
        this.moveDelay = 150; 
        this.lastMoveTime = 0; 
        this.moveThreshold = 0.5; 

        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.initAudio();
        this.showScreen('title');
        this.startGamepadPolling();
    }
    
    initAudio() {
        const audioInitHandler = () => {
            if (!audioCtx) {
                try {
                    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                    masterGainNode = audioCtx.createGain();
                    masterGainNode.connect(audioCtx.destination);
                    masterGainNode.gain.setValueAtTime(DEFAULT_VOLUME, audioCtx.currentTime);
                } catch (e) {
                    console.warn('Web Audio APIはサポートされていません:', e);
                    return;
                }
            }

            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }

            document.removeEventListener('click', audioInitHandler);
            document.removeEventListener('keydown', audioInitHandler);
        };

        document.addEventListener('click', audioInitHandler);
        document.addEventListener('keydown', audioInitHandler);
    }

    setupEventListeners() {
        // 💡 アロー関数でthisを固定
        document.getElementById('create-room-button').addEventListener('click', () => {
            this.showConnectionModal('host');
        });
        document.getElementById('join-room-button').addEventListener('click', () => {
            this.showConnectionModal('guest');
        });
        document.getElementById('connect-submit').addEventListener('click', () => {
            this.connectToServer();
        });
        document.getElementById('connection-cancel').addEventListener('click', () => {
            this.hideConnectionModal();
        });
        document.getElementById('back-to-title').addEventListener('click', () => {
            this.disconnectServer();
        });
        document.getElementById('back-to-select-clear').addEventListener('click', () => {
            this.disconnectServer();
        });
        
        document.getElementById('lobby-disconnect-button').addEventListener('click', () => {
            this.disconnectServer();
        });

        document.getElementById('start-game-button').addEventListener('click', () => {
            this.sendStartGameRequest();
        });
        
        window.addEventListener("gamepadconnected", (e) => this.updateGamepadStatus());
        window.addEventListener("gamepaddisconnected", (e) => this.updateGamepadStatus());
        window.addEventListener('keydown', (e) => this.handleKeyboardInput(e));
    }
    
    // 💡 修正なし
    showConnectionModal(type) {
        const modal = document.getElementById('connection-modal');
        const title = document.getElementById('connection-title');
        const addressInput = document.getElementById('server-address');
        const submitButton = document.getElementById('connect-submit');

        this.isHost = (type === 'host');
        title.textContent = this.isHost ? '部屋を作成 (ホスト)' : '部屋に参加 (ゲスト)';
        submitButton.textContent = this.isHost ? '部屋を作成' : '接続して参加';

        // ホストの場合はデフォルトで localhost:8080 を設定
        if (this.isHost) {
             addressInput.value = addressInput.value || 'localhost:8080';
        } else if (!addressInput.value) {
             // ゲストの場合は ngrokの例をデフォルトで表示 (ただし実際のngrokアドレスはユーザーが入力)
             addressInput.value = ''; // 空にするか、ngrokの例を記載
        }
        
        document.getElementById('title-screen').classList.remove('active');
        modal.classList.add('active');
        addressInput.focus();
    }
    
    hideConnectionModal() {
        document.getElementById('connection-modal').classList.remove('active');
        document.getElementById('title-screen').classList.add('active');
    }
    
    sendStartGameRequest() {
        if (this.socket && this.socket.readyState === WebSocket.OPEN && this.isHost) {
            this.socket.send(JSON.stringify({
                type: 'START_GAME' 
            }));
            document.getElementById('start-game-button').disabled = true;
            document.getElementById('lobby-message').textContent = "ゲーム開始要求を送信しました。";
        }
    }

    handleKeyboardInput(event) {
        if (this.currentScreen === 'lobby' && this.isHost && event.code === 'Enter') {
            const startButton = document.getElementById('start-game-button');
            if (startButton && startButton.style.display !== 'none' && !startButton.disabled) {
                this.sendStartGameRequest();
            }
            event.preventDefault();
            return;
        }

        if (this.currentScreen !== 'game' || !this.playerId || !this.players[this.playerId] || this.players[this.playerId].isGoal) return;

        let dx = 0, dy = 0;
        switch (event.code) {
            case 'KeyW':
            case 'ArrowUp':
                dy = -1;
                break;
            case 'KeyS':
            case 'ArrowDown':
                dy = 1;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                dx = -1;
                break;
            case 'KeyD':
            case 'ArrowRight':
                dx = 1;
                break;
            default:
                return;
        }
        event.preventDefault(); 
        
        const now = Date.now();
        if (now - this.lastMoveTime < this.moveDelay) return;
        this.lastMoveTime = now;

        this.requestMove(dx, dy);
    }
    
    // 💡 修正: ngrokのHTTPトンネルに対応するため、ポートなしの形式を許容し、URL構築ロジックを調整
    connectToServer() {
        const address = document.getElementById('server-address').value.trim();
        
        const parts = address.split(':');
        let ip = '';
        let port = '';

        if (parts.length === 2 && parts[1].length > 0 && !isNaN(parseInt(parts[1]))) {
            // 例: localhost:8080 や 0.tcp.jp.ngrok.io:19535 の形式
            ip = parts[0];
            port = parts[1];
        } else if (parts.length === 1) {
            // 例: massive-yak-4422.ngrok-free.app の形式 (ngrokのhttpトンネル)
            ip = parts[0];
            // HTTPS/WSSの標準ポートである443と見なすが、URLには含めない
            port = '443'; 
        } else {
            alert('接続アドレスは「ホスト名:ポート番号」または「ホスト名」の形式で入力してください。');
            return;
        }

        if (this.socket) this.socket.close();

        // プロトコルの決定: localhost以外はwss
        const isSecureHost = ip !== 'localhost' && ip !== '127.0.0.1';
        const protocol = isSecureHost ? 'wss' : 'ws'; 
        
        let url;
        
        // WSSの標準ポート443 (またはポート指定なし) の場合、URLにポート番号を含めない
        if (isSecureHost && (port === '443' || parts.length === 1)) {
            url = `${protocol}://${ip}`;
        } 
        // WSの標準ポート80 (またはポート指定なし) の場合、URLにポート番号を含めない
        else if (!isSecureHost && (port === '80' || parts.length === 1)) {
             url = `${protocol}://${ip}`;
        }
        // ポート番号が指定されている、または標準ポート以外の場合
        else {
            url = `${protocol}://${ip}:${port}`;
        }

        this.socket = new WebSocket(url);
        
        this.socket.onopen = () => {
            console.log('サーバーに接続しました。');
            this.hideConnectionModal();
            document.getElementById('connection-status').textContent = '接続中...';
            document.getElementById('connection-status').style.color = '#FF9800';

            if (this.isHost) {
                this.socket.send(JSON.stringify({ type: 'CREATE_ROOM' }));
            } else {
                this.socket.send(JSON.stringify({ type: 'JOIN_ROOM' }));
            }
        };

        this.socket.onmessage = (event) => {
            this.handleServerMessage(JSON.parse(event.data));
        };

        this.socket.onerror = (e) => {
            console.error('WebSocketエラー:', e);
            document.getElementById('connection-status').textContent = '接続失敗';
            document.getElementById('connection-status').style.color = '#F44336';
            this.socket = null;
            alert('サーバーへの接続に失敗しました。ホスト名とポート番号を確認してください。\nまた、ngrokを使用する場合は「ngrok http 8080」で起動し、「<ランダムID>.ngrok-free.app」を入力してください。');
            this.showScreen('title');
        };

        this.socket.onclose = () => {
            console.log('サーバーとの接続が切れました。');
            this.socket = null;
            if (this.currentScreen === 'game' || this.currentScreen === 'lobby') {
                 alert('サーバーとの接続が切れました。タイトルに戻ります。');
            }
            this.showScreen('title');
        };
    }
    
    disconnectServer() {
        if (this.socket) {
            this.socket.close();
        }
        this.showScreen('title');
    }
    
    initGameCanvases() {
        if (this.myCanvas && this.minimapCanvas) return true; 

        this.myCanvas = document.getElementById('my-canvas');
        this.minimapCanvas = document.getElementById('minimap-canvas');

        if (!this.myCanvas || !this.minimapCanvas) {
            console.error("致命的なエラー: キャンバス要素 (my-canvas, minimap-canvas) がDOMに見つかりませんでした。HTMLを確認してください。");
            return false;
        }

        this.myCtx = this.myCanvas.getContext('2d');
        this.minimapCtx = this.minimapCanvas.getContext('2d');

        return true;
    }


    handleServerMessage(data) {
        switch (data.type) {
            case 'ROOM_READY':
                this.playerId = data.yourId;
                this.players[this.playerId] = new Player(data.players); 

                this.showScreen('lobby');
                this.updateLobbyStatus(data.players);
                break;
            
            case 'LOBBY_UPDATE':
                this.updateLobbyStatus(data.players);
                break;

            case 'GAME_START':
                this.maze = new Maze(data.mazeData); 

                if (!this.initGameCanvases()) {
                    alert("ゲーム画面の準備に失敗しました。HTML要素を確認してください。");
                    this.disconnectServer();
                    return;
                }
                
                document.getElementById('my-view-title').textContent = `${this.playerId} (YOUR VIEW: 5x5)`;

                this.showScreen('game');
                this.render();
                break;

            case 'GAME_STATE_UPDATE':
                for (const id in data.players) {
                    if (this.players[id]) {
                        this.players[id].update(data.players[id]);
                    } else {
                        this.players[id] = new Player(data.players[id]);
                    }
                }
                for (const id in this.players) {
                    if (!data.players[id]) {
                        delete this.players[id];
                    }
                }
                
                this.render();
                this.updatePlayerStatus();
                break;
            case 'WINNER':
                // WINNERメッセージはGAME_STATE_UPDATEとほぼ同時に来るため、二重処理を防ぐ
                if (this.players[data.winnerId] && !this.players[data.winnerId].isGoal) {
                    this.players[data.winnerId].isGoal = true; 
                    this.completeLevel(data.winnerId);
                }
                break;
            case 'ERROR':
                alert(`エラー: ${data.message}`);
                this.disconnectServer();
                break;
        }
    }

    updateLobbyStatus(playersData) {
        const playerList = document.getElementById('lobby-player-list');
        const startButton = document.getElementById('start-game-button');
        const lobbyMessage = document.getElementById('lobby-message');
        
        playerList.innerHTML = `<h4>参加プレイヤー (${Object.keys(playersData).length}人):</h4>`;

        const playerIds = Object.keys(playersData).sort();

        playerIds.forEach(id => {
            const isMe = id === this.playerId;
            const playerDiv = document.createElement('p');
            // プレイヤーデータには、自身の初期データ（カラーなど）が含まれている
            const playerColor = this.players[id]?.color || '#FFFFFF'; 

            playerDiv.style.color = playerColor;
            playerDiv.style.fontWeight = 'bold';
            playerDiv.textContent = `▶︎ ${id} ${isMe ? '(あなた)' : ''}`;
            playerList.appendChild(playerDiv);
        });

        const playerCount = playerIds.length;

        if (this.isHost) {
            if (playerCount >= 2) {
                startButton.style.display = 'block';
                startButton.disabled = false;
                lobbyMessage.textContent = "準備完了！[ゲーム開始] または [Enter] キーを押してください。";
            } else {
                startButton.style.display = 'none';
                lobbyMessage.textContent = "他のプレイヤー (2人目) の参加を待っています...";
            }
        } 
        else {
            startButton.style.display = 'none';
            lobbyMessage.textContent = "ホストの操作を待っています...";
        }
    }
    
    showScreen(screenName) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(`${screenName}-screen`).classList.add('active');
        this.currentScreen = screenName;
        
        if (screenName === 'title') {
            document.getElementById('create-room-button').focus();
        } else if (screenName === 'clear') {
            document.getElementById('back-to-select-clear').focus();
        } else if (screenName === 'lobby' && this.isHost) {
            const startButton = document.getElementById('start-game-button');
            if (startButton.style.display !== 'none') {
                 startButton.focus();
            }
        }
    }
    
    requestMove(dx, dy) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN && this.playerId) {
            this.socket.send(JSON.stringify({
                type: 'MOVE',
                dx: dx,
                dy: dy
            }));
            const myPlayer = this.players[this.playerId];
            if (this.maze.isWall(myPlayer.x + dx, myPlayer.y + dy)) {
                 playSound('hit');
            } else {
                 playSound('move');
            }
        }
    }


    startGamepadPolling() {
        if (this.gamepadInterval) return;
        this.gamepadInterval = setInterval(() => {
            this.pollGamepads();
        }, 1000 / 60); 
    }

    updateGamepadStatus() {
        const gamepads = navigator.getGamepads();
        let connectedCount = 0;
        
        if (gamepads[0]) connectedCount++;
        if (gamepads[1]) connectedCount++; 

        let statusText = `${connectedCount}台のコントローラーが接続されています。`;
        document.getElementById('gamepad-status').textContent = statusText;
        document.getElementById('gamepad-status').style.color = connectedCount > 0 ? '#4CAF50' : '#F44336';
    }

    pollGamepads() {
        if (this.currentScreen !== 'game' || !this.playerId || this.players[this.playerId].isGoal) return;

        const gamepads = navigator.getGamepads();
        const now = Date.now();

        this.handleGamepadInput(gamepads[0], now);
    }

    handleGamepadInput(gamepad, now) {
        if (!gamepad) return;

        if (now - this.lastMoveTime < this.moveDelay) return;

        let dx = 0, dy = 0;

        if (gamepad.buttons[12]?.pressed) dy = -1;
        else if (gamepad.buttons[13]?.pressed) dy = 1;
        else if (gamepad.buttons[14]?.pressed) dx = -1;
        else if (gamepad.buttons[15]?.pressed) dx = 1;
        
        const axisX = gamepad.axes[0] || 0;
        const axisY = gamepad.axes[1] || 0;

        if (dx === 0 && dy === 0) {
            if (axisY < -this.moveThreshold) dy = -1; 
            else if (axisY > this.moveThreshold) dy = 1; 
            else if (axisX < -this.moveThreshold) dx = -1; 
            else if (axisX > this.moveThreshold) dx = 1; 
        }

        if (dx !== 0 || dy !== 0) {
            this.lastMoveTime = now;
            this.requestMove(dx, dy);
        }
    }
    
    updatePlayerStatus() {
        const statusContainer = document.getElementById('all-player-statuses');
        if (!statusContainer) return; 
        statusContainer.innerHTML = '';
        
        const sortedPlayerIds = Object.keys(this.players).sort();
        
        sortedPlayerIds.forEach(playerId => {
            const player = this.players[playerId];
            if (!player) return;
            
            const isMe = playerId === this.playerId;
            const statusDiv = document.createElement('div');
            statusDiv.className = `player-status ${playerId.toLowerCase()}`;
            statusDiv.style.backgroundColor = player.color;
            statusDiv.style.border = isMe ? '4px solid gold' : 'none';
            
            let statusText = player.isGoal ? "ゴール！" : "走行中";

            statusDiv.innerHTML = `
                <h2>${playerId} ${isMe ? '(YOU)' : ''}</h2>
                <p>ステータス: ${statusText}</p>
            `;
            statusContainer.appendChild(statusDiv);
        });
    }

    completeLevel(winnerId) {
        playSound('clear');
        
        document.getElementById('winner-title').textContent = 'レース終了！';
        document.getElementById('clear-message').textContent = `${winnerId} の勝利です！`;

        const winnerColor = this.players[winnerId].color;
        document.getElementById('clear-screen').style.backgroundColor = winnerColor + '30';
        document.getElementById('winner-title').style.color = winnerColor;

        this.showScreen('clear');
    }

    render() {
        if (!this.maze || !this.minimapCtx) return; 
        
        this.renderMinimap(); 
        
        if (this.playerId && this.myCtx) { 
            this.renderPlayerView(this.playerId, this.myCtx, this.myCanvas);
        }
        this.updatePlayerStatus();
    }

    renderMinimap() {
        const ctx = this.minimapCtx;
        if (!ctx) return;

        const canvas = this.minimapCanvas;
        const CELL_SIZE = this.mCellSize; 

        ctx.clearRect(0, 0, canvas.width, canvas.height); 
        
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const allVisited = new Set();
        Object.values(this.players).forEach(p => {
            p.visitedCells.forEach(cell => allVisited.add(cell));
        });

        for (let y = 0; y < this.maze.height; y++) {
            for (let x = 0; x < this.maze.width; x++) {
                const drawX = x * CELL_SIZE;
                const drawY = y * CELL_SIZE;
                const coord = `${x},${y}`;
                const isWall = this.maze.isWall(x, y);

                if (allVisited.has(coord) && !isWall) {
                    ctx.fillStyle = '#D3D3D3'; 
                    ctx.fillRect(drawX, drawY, CELL_SIZE, CELL_SIZE);
                } else if (x === this.maze.start.x && y === this.maze.start.y) {
                    ctx.fillStyle = COLOR_MAP.START;
                    ctx.fillRect(drawX, drawY, CELL_SIZE, CELL_SIZE);
                } else if (x === this.maze.goal.x && y === this.maze.goal.y) {
                    ctx.fillStyle = COLOR_MAP.GOAL;
                    ctx.fillRect(drawX, drawY, CELL_SIZE, CELL_SIZE);
                }
            }
        }
        
        Object.values(this.players).forEach(player => {
            const playerX = player.x * CELL_SIZE;
            const playerY = player.y * CELL_SIZE;
            
            ctx.fillStyle = player.color;
            ctx.fillRect(playerX, playerY, CELL_SIZE, CELL_SIZE);
            
            if (player.id === this.playerId) {
                ctx.strokeStyle = 'gold';
                ctx.lineWidth = 1;
                ctx.strokeRect(playerX, playerY, CELL_SIZE, CELL_SIZE);
            }
        });
    }

    renderPlayerView(playerId, ctx, canvas) {
        const player = this.players[playerId];
        if (!player) return;

        const VIEW_SIZE = this.pViewSize; 
        const HALF_VIEW = Math.floor(VIEW_SIZE / 2); 
        const CELL_SIZE = this.pCellSize; 

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const centerX = player.x;
        const centerY = player.y;

        for (let viewY = 0; viewY < VIEW_SIZE; viewY++) {
            for (let viewX = 0; viewX < VIEW_SIZE; viewX++) {
                const mazeX = centerX + (viewX - HALF_VIEW);
                const mazeY = centerY + (viewY - HALF_VIEW);
                
                const drawX = viewX * CELL_SIZE;
                const drawY = viewY * CELL_SIZE;
                
                const isWall = this.maze.isWall(mazeX, mazeY);
                
                if (isWall) {
                    ctx.fillStyle = COLOR_MAP.WALL;
                    ctx.fillRect(drawX, drawY, CELL_SIZE, CELL_SIZE);
                } else {
                    ctx.fillStyle = COLOR_MAP.PATH;
                    ctx.fillRect(drawX, drawY, CELL_SIZE, CELL_SIZE);
                }
                
                if (mazeX === this.maze.start.x && mazeY === this.maze.start.y) {
                    ctx.fillStyle = COLOR_MAP.START;
                    ctx.fillRect(drawX, drawY, CELL_SIZE, CELL_SIZE);
                } 
                if (mazeX === this.maze.goal.x && mazeY === this.maze.goal.y) {
                    ctx.fillStyle = COLOR_MAP.GOAL;
                    ctx.fillRect(drawX, drawY, CELL_SIZE, CELL_SIZE);
                }
                
                Object.values(this.players).forEach(p => {
                    if (mazeX === p.x && mazeY === p.y) {
                        ctx.fillStyle = p.color; 
                        ctx.beginPath();
                        ctx.arc(drawX + CELL_SIZE / 2, drawY + CELL_SIZE / 2, CELL_SIZE * 0.4, 0, Math.PI * 2);
                        ctx.fill();

                        if (p.id === playerId || p.isGoal) {
                            ctx.strokeStyle = p.id === playerId ? 'white' : 'gold';
                            ctx.lineWidth = 4;
                            ctx.stroke();
                        }
                    }
                });
            }
        }
    }
}

// ゲーム開始
document.addEventListener('DOMContentLoaded', () => {
    window.game = new MazeGame();
});