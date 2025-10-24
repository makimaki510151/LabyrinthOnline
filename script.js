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


// 💡 変更: サーバーとクライアント間で共通利用のため MazeGenerator は残す
class MazeGenerator {
    static generate(width, height, startCoords, goalCoords) {
        // 既存の MazeGenerator.generate の内容をそのまま残します。
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


// 💡 変更: Playerクラスはサーバーから送られてきたデータを受け取るコンテナとして簡素化
class Player {
    // サーバーから送られてきたデータ構造に合わせる
    constructor(data) {
        this.id = data.id; 
        this.x = data.x;
        this.y = data.y;
        this.color = data.color;
        this.isGoal = data.isGoal;
        // Setの復元が必要
        this.visitedCells = new Set(data.visitedCells || []); 
    }
    
    // クライアント側では移動判定を行わず、サーバーからの情報更新のみを行う
    update(data) {
        this.x = data.x;
        this.y = data.y;
        this.isGoal = data.isGoal;
        this.visitedCells = new Set(data.visitedCells || []); 
    }
    
    // 移動はサーバーに委譲するため、move, isAtGoal メソッドは削除または簡素化
    // ただし、移動後の通過セル記録はサーバーが担当するため、クライアント側の移動関連メソッドは不要
}

// 迷路クラス (変更なし)
class Maze {
    constructor(data) {
        this.width = data.width;
        this.height = data.height;
        this.start = data.start;
        this.goal = data.goal;
        this.walls = new Set();

        if (data.walls && Array.isArray(data.walls)) {
            data.walls.forEach(wall => {
                // 壁データをサーバーから受け取る際は、x, yがオブジェクトになっている
                if (typeof wall === 'object' && wall !== null) {
                    this.walls.add(`${wall.x},${wall.y}`);
                } else {
                    // サーバーから配列形式で受け取る場合も考慮
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

// ゲームクラス (大幅変更)
class MazeGame {
    constructor() {
        this.currentScreen = 'title';
        this.maze = null;
        this.players = {}; // 全プレイヤー情報 (サーバーからの更新)
        this.playerId = null; // 自身のプレイヤーID (サーバーから割り当て)
        this.socket = null; // WebSocket接続

        // 💡 変更: キャンバスを自分視点とミニマップの2つに集約
        this.myCanvas = null;
        this.myCtx = null;
        this.minimapCanvas = null;
        this.minimapCtx = null;
        
        this.mazeSize = 45; 
        this.pViewSize = 5; 
        this.pCellSize = 450 / this.pViewSize; // 90px
        this.mCellSize = 450 / this.mazeSize; // 10px (450/45=10)
        
        this.gamepadInterval = null;
        this.moveDelay = 150; 
        this.lastMoveTime = 0; // 自身の移動時間のみ管理
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
        // ... (既存の initAudio ロジックは変更なし) ...
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
        // 💡 タイトル画面のボタンを接続処理に変更
        document.getElementById('create-room-button').addEventListener('click', () => {
            this.showConnectionModal('host');
        });
        document.getElementById('join-room-button').addEventListener('click', () => {
            this.showConnectionModal('guest');
        });

        // 💡 接続モーダルのイベント
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
        
        window.addEventListener("gamepadconnected", (e) => this.updateGamepadStatus());
        window.addEventListener("gamepaddisconnected", (e) => this.updateGamepadStatus());
        
        // 💡 キーボードイベントを追加
        window.addEventListener('keydown', (e) => this.handleKeyboardInput(e));
    }
    
    // 💡 接続モーダルの表示/非表示ロジック
    showConnectionModal(type) {
        const modal = document.getElementById('connection-modal');
        const title = document.getElementById('connection-title');
        const ipInput = document.getElementById('server-ip');
        const submitButton = document.getElementById('connect-submit');

        this.isHost = (type === 'host');
        title.textContent = this.isHost ? '部屋を作成 (ホスト)' : '部屋に参加 (ゲスト)';
        submitButton.textContent = this.isHost ? '部屋を作成' : '接続して参加';
        ipInput.value = ipInput.value || (this.isHost ? 'localhost' : ''); // デフォルトIP

        document.getElementById('title-screen').classList.remove('active');
        modal.classList.add('active');
    }
    
    hideConnectionModal() {
        document.getElementById('connection-modal').classList.remove('active');
        document.getElementById('title-screen').classList.add('active');
    }

    // 💡 サーバーへの接続
    connectToServer() {
        const ip = document.getElementById('server-ip').value || 'localhost';
        const port = 8080; // 固定
        
        if (this.socket) this.socket.close();

        const url = `ws://${ip}:${port}`;
        this.socket = new WebSocket(url);
        
        this.socket.onopen = () => {
            console.log('サーバーに接続しました。');
            this.hideConnectionModal();
            document.getElementById('connection-status').textContent = '接続中...';
            document.getElementById('connection-status').style.color = '#FF9800';

            // サーバーに部屋の作成/参加を要求
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
            alert('サーバーへの接続に失敗しました。IPとポートを確認してください。');
            this.showScreen('title');
        };

        this.socket.onclose = () => {
            console.log('サーバーとの接続が切れました。');
            this.socket = null;
            if (this.currentScreen === 'game') {
                 alert('サーバーとの接続が切れました。タイトルに戻ります。');
            }
            this.showScreen('title');
        };
    }
    
    // 💡 サーバー切断処理
    disconnectServer() {
        if (this.socket) {
            this.socket.close();
        }
        this.showScreen('title');
    }

    // 💡 サーバーからのメッセージ処理
    handleServerMessage(data) {
        switch (data.type) {
            case 'ROOM_READY':
                this.playerId = data.yourId;
                this.maze = new Maze(data.mazeData); // サーバーから迷路データを受け取る
                // 自身の初期データを受け取り、playersに追加
                this.players[this.playerId] = new Player(data.players); 
                
                // キャンバスを取得
                this.myCanvas = document.getElementById('my-canvas');
                this.myCtx = this.myCanvas.getContext('2d');
                this.minimapCanvas = document.getElementById('minimap-canvas');
                this.minimapCtx = this.minimapCanvas.getContext('2d');
                
                // UIを更新
                document.getElementById('my-view-title').textContent = `${this.playerId} (YOUR VIEW: 5x5)`;
                document.getElementById('connection-status').textContent = `ゲーム中 (${this.playerId})`;
                document.getElementById('connection-status').style.color = this.players[this.playerId].color;

                this.showScreen('game');
                this.render();
                break;
            case 'GAME_STATE_UPDATE':
                // 全プレイヤーの状態を更新
                for (const id in data.players) {
                    if (this.players[id]) {
                        this.players[id].update(data.players[id]);
                    } else {
                        // 新しいプレイヤーが参加した
                        this.players[id] = new Player(data.players[id]);
                    }
                }
                // サーバーから送られてこなかったプレイヤーを削除 (切断したプレイヤー)
                for (const id in this.players) {
                    if (!data.players[id]) {
                        delete this.players[id];
                    }
                }
                
                this.render();
                this.updatePlayerStatus();
                break;
            case 'WINNER':
                if (!this.players[data.winnerId].isGoal) {
                    this.players[data.winnerId].isGoal = true; // 状態を確定させる
                    this.completeLevel(data.winnerId);
                }
                break;
            case 'ERROR':
                alert(`エラー: ${data.message}`);
                this.disconnectServer();
                break;
        }
    }
    
    showScreen(screenName) {
        // ... (既存の showScreen ロジックは変更なし) ...
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(`${screenName}-screen`).classList.add('active');
        this.currentScreen = screenName;
        
        if (screenName === 'title') {
            document.getElementById('create-room-button').focus();
        } else if (screenName === 'clear') {
            document.getElementById('back-to-select-clear').focus();
        } else {
            document.activeElement.blur();
        }
        
        this.updateGamepadStatus();
    }
    
    // 💡 サーバーへの移動要求
    requestMove(dx, dy) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN && this.playerId) {
            // サーバーに移動を要求
            this.socket.send(JSON.stringify({
                type: 'MOVE',
                dx: dx,
                dy: dy
            }));
            // サーバーが処理する間にクライアント側で音を鳴らしておく
            const myPlayer = this.players[this.playerId];
            if (this.maze.isWall(myPlayer.x + dx, myPlayer.y + dy)) {
                 playSound('hit');
            } else {
                 playSound('move');
            }
        }
    }

    // 💡 キーボード入力処理の追加
    handleKeyboardInput(event) {
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


    startGamepadPolling() {
        if (this.gamepadInterval) return;
        this.gamepadInterval = setInterval(() => {
            this.pollGamepads();
        }, 1000 / 60); 
    }

    updateGamepadStatus() {
        // ... (既存の updateGamepadStatus ロジックは変更なし) ...
        const gamepads = navigator.getGamepads();
        let connectedCount = 0;
        
        if (gamepads[0]) connectedCount++;
        if (gamepads[1]) connectedCount++; // 複数パッド対応を残す

        let statusText = `${connectedCount}台のコントローラーが接続されています。`;
        document.getElementById('gamepad-status').textContent = statusText;
        document.getElementById('gamepad-status').style.color = connectedCount > 0 ? '#4CAF50' : '#F44336';
    }

    pollGamepads() {
        if (this.currentScreen !== 'game' || !this.playerId || this.players[this.playerId].isGoal) return;

        const gamepads = navigator.getGamepads();
        const now = Date.now();

        // 💡 接続されている最初のパッドのみを使用
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
    
    // startGame は connectToServer に統合されたため削除

    // 💡 変更: プレイヤーのステータス更新 (動的なUI生成)
    updatePlayerStatus() {
        const statusContainer = document.getElementById('all-player-statuses');
        statusContainer.innerHTML = '';
        
        // プレイヤーIDでソートして表示
        const sortedPlayerIds = Object.keys(this.players).sort();
        
        sortedPlayerIds.forEach(playerId => {
            const player = this.players[playerId];
            if (!player) return;
            
            const isMe = playerId === this.playerId;
            const statusDiv = document.createElement('div');
            statusDiv.className = 'player-status';
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

    // 💡 変更: render関数 (自分のビューとミニマップの描画)
    render() {
        if (!this.maze) return;
        this.renderMinimap();
        if (this.playerId) {
            this.renderPlayerView(this.playerId, this.myCtx, this.myCanvas);
        }
        this.updatePlayerStatus();
    }

    // 💡 変更: ミニマップの描画 (全プレイヤーの探索済み通路と位置を表示)
    renderMinimap() {
        const ctx = this.minimapCtx;
        const canvas = this.minimapCanvas;
        const CELL_SIZE = this.mCellSize; 

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 全プレイヤーの探索済みセルを収集
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

                // 探索済みの通路、スタート、ゴールのみを描画
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
        
        // 全プレイヤーの描画 (ミニマップ上ではドットで)
        Object.values(this.players).forEach(player => {
            const playerX = player.x * CELL_SIZE;
            const playerY = player.y * CELL_SIZE;
            
            ctx.fillStyle = player.color;
            ctx.fillRect(playerX, playerY, CELL_SIZE, CELL_SIZE);
            
            if (player.id === this.playerId) {
                // 自身の場合は特別な枠
                ctx.strokeStyle = 'gold';
                ctx.lineWidth = 1;
                ctx.strokeRect(playerX, playerY, CELL_SIZE, CELL_SIZE);
            }
        });
    }

    // 💡 変更: プレイヤーの周囲5x5ビューの描画 (他のプレイヤーも表示)
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
                
                // 迷路の描画
                if (isWall) {
                    ctx.fillStyle = COLOR_MAP.WALL;
                    ctx.fillRect(drawX, drawY, CELL_SIZE, CELL_SIZE);
                } else {
                    ctx.fillStyle = COLOR_MAP.PATH;
                    ctx.fillRect(drawX, drawY, CELL_SIZE, CELL_SIZE);
                }
                
                // スタートとゴールの描画
                if (mazeX === this.maze.start.x && mazeY === this.maze.start.y) {
                    ctx.fillStyle = COLOR_MAP.START;
                    ctx.fillRect(drawX, drawY, CELL_SIZE, CELL_SIZE);
                } 
                if (mazeX === this.maze.goal.x && mazeY === this.maze.goal.y) {
                    ctx.fillStyle = COLOR_MAP.GOAL;
                    ctx.fillRect(drawX, drawY, CELL_SIZE, CELL_SIZE);
                }
                
                // 💡 他のプレイヤーも描画
                Object.values(this.players).forEach(p => {
                    if (mazeX === p.x && mazeY === p.y) {
                        ctx.fillStyle = p.color; 
                        ctx.beginPath();
                        ctx.arc(drawX + CELL_SIZE / 2, drawY + CELL_SIZE / 2, CELL_SIZE * 0.4, 0, Math.PI * 2);
                        ctx.fill();

                        // 自身またはゴールしているプレイヤー
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