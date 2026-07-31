import React, { useState, useEffect, useRef, useCallback } from 'react';
import { WebRTCManager } from '../network/webrtc';
import { generateBoard } from '../utils/appleGenerator';
import GameBoard from './GameBoard';
import RemoteCursor from './RemoteCursor';
import GameOverModal from './GameOverModal';
import OpponentsBoard from './OpponentsBoard';
import './Room.css';

const GAME_DURATION = 120;

const Room = ({ roomId, isHost: initialIsHost, clientName, serverUrl, apiServerUrl, gameMode, setGameMode, onLeave, onGameStateChange }) => {
  const [isHost, setIsHost] = useState(initialIsHost);
  const [hostId, setHostId] = useState(null);
  const [players, setPlayers] = useState([]); // [{id, name, isReady}]
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);

  const [gameStarted, setGameStarted] = useState(gameMode === 'solo');
  const [boardData, setBoardData] = useState(() => gameMode === 'solo' ? generateBoard() : null);
  const cursorDataRef = useRef({});
  const [score, setScore] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(GAME_DURATION);
  const [isGameOver, setIsGameOver] = useState(false);
  const [spectatingId, setSpectatingId] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('apple_dark_mode') === 'true';
  });
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [gameOverVotes, setGameOverVotes] = useState({});
  const [gameOverTimeLeft, setGameOverTimeLeft] = useState(10);
  const [isSpectator, setIsSpectator] = useState(false);
  const [startCountdown, setStartCountdown] = useState(null);
  const [isCopied, setIsCopied] = useState(false);
  const [playerScores, setPlayerScores] = useState({});
  const [opponentsState, setOpponentsState] = useState({});

  const chatEndRef = useRef(null);

  // Refs for WebRTC callbacks to avoid stale closures
  const isHostRef = useRef(isHost);
  const boardDataRef = useRef(boardData);
  const playersRef = useRef(players);
  const scoreRef = useRef(score);
  const playerScoresRef = useRef(playerScores);
  const opponentsStateRef = useRef(opponentsState);
  const gameStartedRef = useRef(gameStarted);
  const timeRemainingRef = useRef(timeRemaining);
  const gameModeRef = useRef(gameMode);

  useEffect(() => { isHostRef.current = isHost; }, [isHost]);
  useEffect(() => { boardDataRef.current = boardData; }, [boardData]);
  useEffect(() => { playersRef.current = players; }, [players]);
  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => { playerScoresRef.current = playerScores; }, [playerScores]);
  useEffect(() => { opponentsStateRef.current = opponentsState; }, [opponentsState]);
  useEffect(() => { gameStartedRef.current = gameStarted; }, [gameStarted]);
  useEffect(() => { timeRemainingRef.current = timeRemaining; }, [timeRemaining]);
  useEffect(() => { gameModeRef.current = gameMode; }, [gameMode]);
  useEffect(() => { if (onGameStateChange) onGameStateChange(gameStarted); }, [gameStarted, onGameStateChange]);

  const initializeOpponentsState = useCallback(() => {
    const initOpps = {};
    playersRef.current.forEach(p => { initOpps[p.id] = { score: 0, removedIds: [] }; });
    return initOpps;
  }, []);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Auto-switch spectator target if current target leaves or is unset
  useEffect(() => {
    if (isSpectator) {
      const isCurrentTargetValid = spectatingId && players.some(p => p.id === spectatingId);
      if (!isCurrentTargetValid) {
        const activeOpponents = players.filter(p => opponentsState[p.id] !== undefined);
        if (activeOpponents.length > 0) {
          const topPlayer = activeOpponents.reduce((prev, current) => {
            const scorePrev = opponentsState[prev.id]?.score || 0;
            const scoreCurrent = opponentsState[current.id]?.score || 0;
            return scoreCurrent > scorePrev ? current : prev;
          });
          setSpectatingId(topPlayer.id);
        } else {
          setSpectatingId(null);
        }
      }
    }
  }, [players, isSpectator, spectatingId, opponentsState]);

  const COLORS = ['#ff4757', '#1e90ff', '#2ed573', '#ffa502', '#3742fa', '#ff6b81'];

  const getPlayerColor = (playerId) => {
    const index = players.findIndex(p => p.id === playerId);
    return index !== -1 ? COLORS[index % COLORS.length] : 'red';
  };

  const webrtcRef = useRef(null);
  const timerRef = useRef(null);
  const gameOverTimerRef = useRef(null);

  // Timer logic that works in background tabs
  useEffect(() => {
    if (!gameStarted || isGameOver || isStarting) return;

    const startTimestamp = Date.now();
    const initialTime = timeRemaining;

    const workerCode = `
      let interval;
      self.onmessage = function(e) {
        if (e.data === 'start') {
          interval = setInterval(() => { self.postMessage('tick'); }, 1000);
        } else if (e.data === 'stop') {
          clearInterval(interval);
        }
      };
    `;
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(blob));

    worker.onmessage = () => {
      const elapsed = Math.floor((Date.now() - startTimestamp) / 1000);
      const newRemaining = Math.max(0, initialTime - elapsed);
      setTimeRemaining(newRemaining);

      if (isHostRef.current && webrtcRef.current) {
        webrtcRef.current.broadcastReliable({ type: 'TIME_UPDATE', timeRemaining: newRemaining });
      }

      if (newRemaining <= 0) {
        worker.postMessage('stop');
        // Host triggers game over for everyone
        if (isHostRef.current) {
          setIsGameOver(true);
          setGameOverVotes({});
          setGameOverTimeLeft(10);
          if (webrtcRef.current) {
            webrtcRef.current.broadcastReliable({ type: 'GAME_OVER', playerScores: playerScoresRef.current });
          }

          if (gameMode === 'comp') {
            playersRef.current.forEach(p => {
              const playerScore = playerScoresRef.current[p.id] || 0;
              fetch(`${apiServerUrl || serverUrl.replace('ws://', 'http://').replace('wss://', 'https://')}/api/leaderboard`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  playerCount: 1,
                  playerNames: [p.name],
                  score: playerScore
                })
              }).catch(console.error);
            });
          } else {
            const playerNames = playersRef.current.map(p => p.name);
            fetch(`${apiServerUrl || serverUrl.replace('ws://', 'http://').replace('wss://', 'https://')}/api/leaderboard`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                playerCount: playersRef.current.length,
                playerNames: playerNames,
                score: scoreRef.current
              })
            }).catch(console.error);
          }
        }
      }
    };

    worker.postMessage('start');

    return () => {
      worker.postMessage('stop');
      worker.terminate();
    };
  }, [gameStarted, isGameOver, isStarting]); // Do not add timeRemaining to deps

  // Local Game Over Timer
  useEffect(() => {
    if (isGameOver) {
      if (players.length > 1) {
        gameOverTimerRef.current = setInterval(() => {
          setGameOverTimeLeft(prev => Math.max(0, prev - 1));
        }, 1000);
      } else {
        setGameOverTimeLeft(10);
      }
    }
    return () => clearInterval(gameOverTimerRef.current);
  }, [isGameOver, players.length]);

  // Check Vote Results on Host
  useEffect(() => {
    if (isGameOver && isHost) {
      const currentPlayersMap = new Set(players.map(p => p.id));
      const activeVotes = Object.entries(gameOverVotes)
        .filter(([id, v]) => currentPlayersMap.has(id) && (v === 'PLAY_AGAIN' || v === 'TO_LOBBY' || v === 'LEAVE'))
        .map(([id, v]) => v);
      const totalVotes = activeVotes.length;
      // All remaining players voted OR time is up
      if ((totalVotes >= players.length && players.length > 0) || gameOverTimeLeft === 0) {
        clearInterval(gameOverTimerRef.current);

        webrtcRef.current.broadcastReliable({ type: 'CONCLUDE_VOTING', votes: gameOverVotes });

        if (gameOverVotes[hostId] === 'LEAVE') {
          onLeave();
          return;
        }

        let playAgain = 0;
        let toLobby = 0;
        Object.entries(gameOverVotes).forEach(([id, v]) => {
          if (!currentPlayersMap.has(id)) return;
          if (v === 'PLAY_AGAIN') playAgain++;
          if (v === 'TO_LOBBY') toLobby++;
        });

        if (playAgain > toLobby || (playAgain === toLobby && playAgain > 0)) {
          startGame();
        } else {
          setGameStarted(false);
          setIsGameOver(false);
          setPlayers(prev => prev.map(p => ({ ...p, isReady: p.id === hostId })));
          if (webrtcRef.current) {
            webrtcRef.current.broadcastReliable({ type: 'RETURN_TO_LOBBY' });
          }
        }
      }
    }
  }, [gameOverVotes, gameOverTimeLeft, players.length, isGameOver, isHost, hostId, players]);

  useEffect(() => {
    // Solo mode: immediately start, skip WebRTC
    if (gameMode === 'solo') {
      setIsHost(true);
      setHostId('solo-player');
      setPlayers([{ id: 'solo-player', name: clientName, isReady: true }]);
      setGameStarted(true);
      return;
    }

    // Initialize WebRTC for multiplayer
    const manager = new WebRTCManager(
      serverUrl,
      clientName,
      handleWebRTCMessage,
      handleRoomInfo,
      handlePlayerJoined,
      handlePlayerLeft,
      () => {
        // Room full
        onLeave();
      },
      () => {
        // Room not found
        alert("존재하지 않는 방이거나, 이미 닫힌 방입니다.");
        onLeave();
      },
      () => {
        // Connection error
        alert("서버와의 연결에 실패했습니다.");
        onLeave();
      },
      (peerId) => {
        if (isHostRef.current && gameStartedRef.current && boardDataRef.current) {
          if (webrtcRef.current) {
            webrtcRef.current.sendTo(peerId, {
              type: 'BOARD_SYNC',
              boardData: boardDataRef.current,
              timeRemaining: timeRemainingRef.current,
              score: scoreRef.current,
              gameStarted: true,
              playerScores: playerScoresRef.current
            });
          }
        }
      }
    );
      webrtcRef.current = manager;
      manager.connect(roomId, initialIsHost, gameMode);

      // If host, I am the only player initially
    if (initialIsHost) {
      setPlayers([{ id: manager.clientId, name: clientName, isReady: true }]);
      setHostId(manager.clientId);
    }

    return () => {
      // Cleanup WebRTC connection when component unmounts
      if (manager.ws) manager.ws.close();
      Object.values(manager.peers).forEach(peer => peer.close());
    };
  }, []);

  const handleRoomInfo = useCallback((roomPlayers, receivedHostId, receivedGameMode) => {
    setHostId(receivedHostId);
    if (receivedGameMode && receivedGameMode !== gameModeRef.current) {
      setGameMode(receivedGameMode);
    }
    if (!isHostRef.current) {
      setPlayers([
        ...roomPlayers.map(p => ({ id: p.id, name: p.name, isReady: false })),
        { id: webrtcRef.current?.clientId || 'me', name: clientName, isReady: false }
      ]);
    }
  }, [clientName, setGameMode]);

  const handlePlayerJoined = useCallback((peerId, peerName) => {
    setPlayers(prev => {
      if (prev.some(p => p.id === peerId)) return prev;
      const next = [...prev, { id: peerId, name: peerName, isReady: false }];
      // If I am ready, broadcast my ready state so the new player learns about it
      const me = next.find(p => p.id === webrtcRef.current?.clientId);
      if (me && me.isReady && webrtcRef.current) {
        setTimeout(() => {
          if (webrtcRef.current) {
            webrtcRef.current.broadcast({ type: 'PLAYER_READY', isReady: true });
          }
        }, 600);
      }
      return next;
    });
    setMessages(prev => [...prev, { type: 'system', text: `${peerName}님이 방에 입장했습니다.` }]);

    // Send ROOM_SETTINGS to new guest to sync gameMode
    if (isHostRef.current && webrtcRef.current) {
      setTimeout(() => {
        if (webrtcRef.current) {
          webrtcRef.current.sendTo(peerId, {
            type: 'ROOM_SETTINGS',
            gameMode: gameModeRef.current
          });
        }
      }, 500);
    }

    // If game has already started, host needs to sync state to the new player
    if (isHostRef.current && gameStartedRef.current && boardDataRef.current) {
      setTimeout(() => {
        if (webrtcRef.current) {
          webrtcRef.current.sendReliableTo(peerId, {
            type: 'BOARD_SYNC',
            boardData: boardDataRef.current,
            timeRemaining: timeRemainingRef.current,
            score: scoreRef.current,
            gameStarted: true,
            playerScores: playerScoresRef.current,
            opponentsState: opponentsStateRef.current
          });
        }
      }, 1000);
    }
  }, []);

  const handlePlayerLeft = useCallback((peerId, newHostId) => {
    if (cursorDataRef.current && cursorDataRef.current[peerId]) {
      delete cursorDataRef.current[peerId];
    }

    setPlayers(prev => {
      const leftPlayer = prev.find(p => p.id === peerId);
      if (leftPlayer) {
        setMessages(m => [...m, { type: 'system', text: `${leftPlayer.name}님이 퇴장했습니다.` }]);
      }
      return prev.filter(p => p.id !== peerId);
    });

    if (newHostId) {
      setHostId(prev => {
        if (prev && prev !== newHostId && gameStartedRef.current) {
          setIsReconnecting(true);
          setTimeout(() => setIsReconnecting(false), 3000);
        }
        return newHostId;
      });
      if (newHostId === webrtcRef.current?.clientId) {
        setIsHost(true);
        setPlayers(prev => prev.map(p => p.id === newHostId ? { ...p, isReady: true } : p));
        setMessages(m => [...m, { type: 'system', text: `당신이 새로운 방장이 되었습니다.` }]);

        setIsStarting(prev => {
          if (prev) {
            webrtcRef.current.broadcastReliable({ type: 'CANCEL_COUNTDOWN' });
            setStartCountdown(null);
            setMessages(m => [...m, { type: 'system', text: `방장 변경으로 게임 시작이 취소되었습니다.` }]);
            return false;
          }
          return prev;
        });
      }
    }

    setCursorData(prev => {
      const newData = { ...prev };
      delete newData[peerId];
      return newData;
    });

    setGameOverVotes(prev => {
      const newVotes = { ...prev };
      delete newVotes[peerId];
      return newVotes;
    });
  }, []);

  const handleKickPlayer = (targetId) => {
    if (!isHost) return;
    webrtcRef.current.broadcastReliable({ type: 'KICK_PLAYER', targetId });
    // Also force them out locally just in case
    handlePlayerLeft(targetId);
  };

  const handleWebRTCMessage = useCallback((peerId, data) => {
    switch (data.type) {
      case 'KICK_PLAYER':
        if (data.targetId === webrtcRef.current.clientId) {
          localStorage.setItem(`banned_${roomId}`, Date.now() + 5000);
          onLeave();
        } else {
          handlePlayerLeft(data.targetId);
        }
        break;
      case 'ROOM_CHAT':
        setMessages(prev => [...prev, { type: 'chat', senderName: data.senderName, text: data.text }]);
        break;
      case 'PLAYER_READY':
        setPlayers(prev => prev.map(p => p.id === peerId ? { ...p, isReady: data.isReady } : p));
        break;
      case 'SYSTEM_MSG':
        setMessages(prev => [...prev, { type: 'system', text: data.text }]);
        break;
      case 'PREPARE_GAME':
        setBoardData(data.boardData);
        setScore(0);
        setTimeRemaining(GAME_DURATION);
        setIsGameOver(false);
        setPlayerScores({});
        setOpponentsState(initializeOpponentsState());
        break;
      case 'START_COUNTDOWN':
        setIsStarting(true);
        setStartCountdown(data.count);
        break;
      case 'CANCEL_COUNTDOWN':
        setIsStarting(false);
        setStartCountdown(null);
        setMessages(prev => [...prev, { type: 'system', text: '방장 변경으로 게임 시작이 취소되었습니다.' }]);
        break;
      case 'GAME_START':
        setGameStarted(true);
        setBoardData(data.boardData);
        setScore(0);
        setTimeRemaining(GAME_DURATION);
        setIsGameOver(false);
        setIsStarting(false);
        setStartCountdown(null);
        setIsSpectator(false);
        setPlayerScores(data.playerScores || {});
        setOpponentsState(initializeOpponentsState());
        break;
      case 'BOARD_SYNC':
        if (!isHostRef.current) {
          setBoardData(data.boardData);
          if (data.timeRemaining !== undefined) setTimeRemaining(data.timeRemaining);
          if (data.score !== undefined) setScore(data.score);
          if (data.playerScores) setPlayerScores(data.playerScores);
          if (data.opponentsState) setOpponentsState(data.opponentsState);
          if (data.gameStarted) {
            setGameStarted(true);
            setIsSpectator(true); // Mid-game joiner is a spectator
          }
        }
        break;
      case 'CURSOR_MOVE':
        cursorDataRef.current[peerId] = data.cursor;
        break;
      case 'REQUEST_REMOVE':
        if (isHostRef.current && boardDataRef.current) {
          const scorerId = data.scorerId || peerId;
          // Force apply removal to prevent sync desyncs
          const removedSet = new Set(data.removedIds);
          const newBoard = boardDataRef.current.board.map(apple =>
            removedSet.has(apple.id) ? { ...apple, removed: true } : apple
          );
          setBoardData(prev => ({ ...prev, board: newBoard }));
          setScore(prev => prev + data.points);

          const newScores = {
            ...playerScoresRef.current,
            [scorerId]: (playerScoresRef.current[scorerId] || 0) + data.points
          };
          setPlayerScores(newScores);

          webrtcRef.current.broadcastReliable({
            type: 'APPLES_REMOVED',
            removedIds: data.removedIds,
            points: data.points,
            scorerId,
            playerScores: newScores
          });
        }
        break;
      case 'APPLES_REMOVED':
        if (gameModeRef.current === 'coop') {
          setBoardData(prev => {
            if (!prev) return prev;
            const removedSet = new Set(data.removedIds);
            const newBoard = prev.board.map(apple => {
              if (removedSet.has(apple.id)) {
                return { ...apple, removed: true };
              }
              return apple;
            });
            return { ...prev, board: newBoard };
          });
          if (!isHostRef.current) {
            setScore(prev => prev + data.points);
            if (data.playerScores) {
              setPlayerScores(data.playerScores);
            } else if (data.scorerId) {
              setPlayerScores(prev => ({
                ...prev,
                [data.scorerId]: (prev[data.scorerId] || 0) + data.points
              }));
            }
          }
        } else if (gameModeRef.current === 'comp') {
          setOpponentsState(prev => {
            const opponent = prev[data.scorerId] || { score: 0, removedIds: [] };
            return {
              ...prev,
              [data.scorerId]: {
                score: (opponent.score || 0) + data.points,
                removedIds: [...(opponent.removedIds || []), ...data.removedIds]
              }
            };
          });
          
          setPlayerScores(prev => ({
            ...prev,
            [data.scorerId]: (prev[data.scorerId] || 0) + data.points
          }));
        }
        break;
      case 'TIME_UPDATE':
        if (!isHostRef.current) setTimeRemaining(data.timeRemaining);
        break;
      case 'GAME_OVER':
        setIsGameOver(true);
        setTimeRemaining(0);
        setGameOverVotes({});
        setGameOverTimeLeft(10);
        setIsSpectator(false);
        if (data.playerScores) setPlayerScores(data.playerScores);
        break;
      case 'RESTART_GAME':
        setScore(0);
        setTimeRemaining(GAME_DURATION);
        setIsGameOver(false);
        setPlayerScores({});
        setOpponentsState(initializeOpponentsState());
        if (!isHostRef.current) setBoardData(data.boardData);
        break;
      case 'VOTE_CAST':
        if (data.vote === null) {
          setGameOverVotes(prev => {
            const next = { ...prev };
            delete next[peerId];
            return next;
          });
        } else {
          setGameOverVotes(prev => ({ ...prev, [peerId]: data.vote }));
        }
        break;
      case 'CONCLUDE_VOTING':
        if (data.votes && data.votes[webrtcRef.current?.clientId] === 'LEAVE') {
          onLeave();
        }
        break;
      case 'RETURN_TO_LOBBY':
        setGameStarted(false);
        setIsGameOver(false);
        setPlayers(prev => prev.map(p => ({ ...p, isReady: p.id === hostId })));
        break;
      case 'ROOM_SETTINGS':
        if (setGameMode) setGameMode(data.gameMode);
        break;
      default:
        break;
    }
  }, [gameMode, setGameMode]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !webrtcRef.current) return;

    webrtcRef.current.broadcast({ type: 'ROOM_CHAT', senderName: clientName, text: chatInput });
    setMessages(prev => [...prev, { type: 'chat', senderName: clientName, text: chatInput, isMe: true }]);
    setChatInput('');
  };

  const toggleReady = () => {
    const me = players.find(p => p.id === webrtcRef.current.clientId);
    const newReady = !me.isReady;
    setPlayers(prev => prev.map(p => p.id === webrtcRef.current.clientId ? { ...p, isReady: newReady } : p));
    webrtcRef.current.broadcast({ type: 'PLAYER_READY', isReady: newReady });
  };

  const startGame = () => {
    if (!isHost || isStarting) return;
    
    if (gameMode === 'comp' && players.length < 2) {
      alert("경쟁 모드는 최소 2명 이상이어야 시작할 수 있습니다.");
      return;
    }

    setIsStarting(true);
    setIsGameOver(false);

    // Skip countdown if playing alone
    if (players.length === 1) {
      const data = generateBoard(1);
      setBoardData(data);
      setScore(0);
      setPlayerScores({});
      setOpponentsState(initializeOpponentsState());
      setTimeRemaining(GAME_DURATION);
      setGameStarted(true);
      setIsStarting(false);
      setStartCountdown(null);
      return;
    }

    let count = 3;

    // Generate new board immediately for preview
    const data = generateBoard(gameMode === 'comp' ? 1 : players.length);
    setBoardData(data);
    setScore(0);
    setPlayerScores({});
    setOpponentsState(initializeOpponentsState());
    // Don't set timeRemaining to GAME_DURATION yet, so timer doesn't show 120s running.
    // Or we can set it to GAME_DURATION, since the timer worker won't run until isStarting is false!
    setTimeRemaining(GAME_DURATION);

    const initialMsg = '3초 뒤 게임이 시작됩니다!';
    setMessages(prev => [...prev, { type: 'system', text: initialMsg }]);
    if (webrtcRef.current) {
      webrtcRef.current.broadcastReliable({ type: 'PREPARE_GAME', boardData: data });
      webrtcRef.current.broadcastReliable({ type: 'SYSTEM_MSG', text: initialMsg });
    }

    const tick = () => {
      if (count > 0) {
        const msg = `${count}...`;
        setMessages(prev => [...prev, { type: 'system', text: msg }]);
        setStartCountdown(count);
        if (webrtcRef.current) {
          webrtcRef.current.broadcastReliable({ type: 'SYSTEM_MSG', text: msg });
          webrtcRef.current.broadcastReliable({ type: 'START_COUNTDOWN', count });
        }
        count--;
        setTimeout(tick, 1000);
      } else {
        setGameStarted(true);
        setIsGameOver(false);
        setIsStarting(false);
        setStartCountdown(null);
        setPlayerScores({});
        setOpponentsState(initializeOpponentsState());

        webrtcRef.current.broadcastReliable({ type: 'GAME_START', boardData: data, playerScores: {} });
      }
    };

    tick();
  };

  const handleApplesRemoved = (removedIds, points, customScorerId = null) => {
    const scorerId = customScorerId || (webrtcRef.current ? webrtcRef.current.clientId : 'solo-player');
    
    if (gameMode === 'coop') {
      if (isHost) {
        const removedSet = new Set(removedIds);
        const newBoard = boardData.board.map(apple =>
          removedSet.has(apple.id) ? { ...apple, removed: true } : apple
        );
        setBoardData(prev => ({ ...prev, board: newBoard }));
        setScore(prev => prev + points);

        const newScores = {
          ...playerScoresRef.current,
          [scorerId]: (playerScoresRef.current[scorerId] || 0) + points
        };
        setPlayerScores(newScores);

        if (webrtcRef.current) {
          webrtcRef.current.broadcastReliable({
            type: 'APPLES_REMOVED',
            removedIds,
            points,
            scorerId,
            playerScores: newScores
          });
        }
      } else {
        // Client sends request to host
        if (webrtcRef.current) {
          webrtcRef.current.broadcastReliable({
            type: 'REQUEST_REMOVE',
            removedIds,
            points,
            scorerId: webrtcRef.current.clientId
          });
        }
      }
    } else {
      // Comp or Solo mode
      const removedSet = new Set(removedIds);
      const newBoard = boardData.board.map(apple =>
        removedSet.has(apple.id) ? { ...apple, removed: true } : apple
      );
      setBoardData(prev => ({ ...prev, board: newBoard }));
      setScore(prev => prev + points);

      const newScores = {
        ...playerScoresRef.current,
        [scorerId]: (playerScoresRef.current[scorerId] || 0) + points
      };
      setPlayerScores(newScores);

      if (gameMode === 'comp') {
        setOpponentsState(prev => {
          const me = prev[scorerId] || { score: 0, removedIds: [] };
          return {
            ...prev,
            [scorerId]: {
              score: (me.score || 0) + points,
              removedIds: [...(me.removedIds || []), ...removedIds]
            }
          };
        });

        if (webrtcRef.current) {
          webrtcRef.current.broadcastReliable({
            type: 'APPLES_REMOVED',
            removedIds,
            points,
            scorerId,
            playerScores: newScores
          });
        }
      }
    }
  };

  const handleCursorData = (cursor) => {
    if (webrtcRef.current) {
      webrtcRef.current.broadcast({
        type: 'CURSOR_MOVE',
        cursor
      });
    }
  };

  const returnToWaitingRoom = () => {
    if (gameMode === 'solo') {
      onLeave();
      return;
    }
    setGameStarted(false);
    setIsGameOver(false);
    setIsSpectator(false);
    setSpectatingId(null);
    setPlayers(prev => prev.map(p => ({ ...p, isReady: p.id === hostId })));
  };

  const copyInviteLink = () => {
    const link = `${window.location.origin}/?room=${roomId}`;
    const triggerCopied = () => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    };

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(link).then(triggerCopied).catch(() => { });
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = link;
      textArea.style.position = "absolute";
      textArea.style.left = "-999999px";
      document.body.prepend(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        triggerCopied();
      } catch (error) {
        console.error(error);
      } finally {
        textArea.remove();
      }
    }
  };

  const allReady = players.every(p => p.isReady);

  if (gameStarted) {
    const coreGameScreen = (
      <div className={`game-screen ${isDarkMode ? 'dark-mode' : ''}`}>
        <button
          className="dark-mode-toggle-btn"
          onClick={() => {
            setIsDarkMode(prev => {
              const next = !prev;
              localStorage.setItem('apple_dark_mode', next);
              return next;
            });
          }}
          title="다크 모드"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5"></circle>
            <line x1="12" y1="1" x2="12" y2="3"></line>
            <line x1="12" y1="21" x2="12" y2="23"></line>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
            <line x1="1" y1="12" x2="3" y2="12"></line>
            <line x1="21" y1="12" x2="23" y2="12"></line>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
          </svg>
        </button>

        <header className="game-header">
          <div className="game-header-title">
            <span className="game-title-text">온라인 사과게임</span>
            <span className="game-room-code">방 코드: {roomId}</span>
          </div>
          <div className="game-header-info">
            <div className="game-status-badge">참가자: {players.length}명 | {isHost ? '방장' : '게스트'}</div>
            {gameMode === 'solo' && (
              <button 
                className="leave-btn" 
                style={{ backgroundColor: '#ff9f43', borderBottomColor: '#e67e22', display: 'inline-flex', alignItems: 'center', gap: '5px', marginRight: '10px' }}
                onClick={startGame}
              >
                <span>🔄</span> 리셋
              </button>
            )}
            {players.length === 1 && (
              <button
                className="leave-btn"
                onClick={returnToWaitingRoom}
              >
                방 나가기
              </button>
            )}
          </div>
        </header>

        {(() => {
          let activeBoardData = boardData;
          let activeScore = score;
          
          // Generate an active board for spectator dynamically based on opponentsState
          if (isSpectator && spectatingId && opponentsState[spectatingId] && boardData) {
            const targetState = opponentsState[spectatingId];
            const removedSet = new Set(targetState.removedIds);
            activeBoardData = {
              ...boardData,
              board: boardData.board.map(apple => 
                removedSet.has(apple.id) ? { ...apple, removed: true } : { ...apple, removed: false }
              )
            };
            activeScore = targetState.score;
          }

          if (!activeBoardData) return null;

          return (
            <GameBoard
              key={gameMode === 'comp' ? `comp-board-${isSpectator ? spectatingId : 'local'}` : 'coop-board'}
              board={activeBoardData.board}
              size={activeBoardData.size}
              onApplesRemoved={handleApplesRemoved}
              sendCursorData={gameMode === 'comp' ? null : handleCursorData}
              isGameOver={isGameOver || isStarting}
              score={activeScore}
              timeRemaining={timeRemaining}
              totalTime={GAME_DURATION}
              myColor={getPlayerColor(webrtcRef.current?.clientId)}
              isSpectator={isSpectator}
              cursorDataRef={gameMode === 'comp' ? { current: {} } : cursorDataRef}
              getPlayerColor={getPlayerColor}
              hideCursors={gameMode === 'comp'}
            />
          );
        })()}



        {isGameOver && (
          <GameOverModal
            score={score}
            gameMode={gameMode}
            isHost={isHost}
            timeLeft={gameOverTimeLeft}
            votes={gameOverVotes}
            playersCount={players.length}
            players={players}
            playerScores={playerScores}
            onVote={(vote) => {
              if (gameMode === 'solo') {
                if (vote === 'PLAY_AGAIN') startGame();
                return;
              }
              setGameOverVotes(prev => {
                const next = { ...prev };
                if (vote === null) {
                  delete next[webrtcRef.current?.clientId];
                } else {
                  next[webrtcRef.current?.clientId] = vote;
                }
                return next;
              });
              webrtcRef.current?.broadcastReliable({ type: 'VOTE_CAST', vote });
            }}
            onLeave={onLeave}
            myId={webrtcRef.current?.clientId || (gameMode === 'solo' ? 'solo-player' : null)}
          />
        )}

        {isReconnecting && (
          <div className="reconnect-overlay">
            <div className="reconnect-box">
              <h3>방장 연결이 끊어졌습니다.</h3>
              <p>새로운 방장에게 권한을 인계하는 중...</p>
            </div>
          </div>
        )}

        {startCountdown !== null && (
          <div className="giant-countdown-overlay">
            <div className="giant-countdown-text">{startCountdown}</div>
          </div>
        )}
      </div>
    );
    
    const gameScreenContent = gameMode === 'comp' ? (
      <>
        <div style={{ position: 'absolute', left: '20px', top: '50%', transform: 'translateY(-50%)', zIndex: 10 }}>
          <OpponentsBoard 
            players={players} 
            opponentsState={opponentsState} 
            initialBoard={boardData} 
            isSpectator={isSpectator}
            onSpectatePlayer={setSpectatingId}
            spectatingId={spectatingId}
          />
        </div>
        {coreGameScreen}
        {isSpectator && spectatingId && (
          <div style={{ position: 'absolute', top: '80px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.7)', color: '#00bfff', padding: '5px 15px', borderRadius: '20px', fontWeight: 'bold', zIndex: 100, pointerEvents: 'none' }}>
            현재 {players.find(p => p.id === spectatingId)?.name || '알 수 없음'}님을 관전 중입니다
          </div>
        )}
      </>
    ) : coreGameScreen;

    return gameScreenContent;
  }

  // Waiting Room UI
  return (
    <div className={`room-container ${gameMode === 'comp' ? 'room-comp' : 'room-coop'}`}>
      <div className="room-box">
        <div className="room-header">
          <h1>{gameMode === 'comp' ? '⚔️ 경쟁 게임 대기실' : '🍎 대기실'}</h1>
          <button className="leave-btn" onClick={onLeave}>방 나가기</button>
        </div>

        <div className="room-main">
          <div className="players-list-section">
            <h3>참가자 목록 ({players.length}명)</h3>
            <ul className="players-list">
              {players.map(p => (
                <li
                  key={p.id}
                  className={`player-item ${p.id === webrtcRef.current?.clientId ? 'me' : ''}`}
                  onClick={() => {
                    if (isHost && p.id !== webrtcRef.current?.clientId) {
                      setSelectedPlayerId(prev => prev === p.id ? null : p.id);
                    }
                  }}
                  style={{ cursor: isHost && p.id !== webrtcRef.current?.clientId ? 'pointer' : 'default' }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                      <div className="player-info">
                        <span className="player-name">{p.name}</span>
                      </div>
                      <div className={`ready-status ${p.id === hostId ? 'host-status' : (p.isReady ? 'ready' : 'not-ready')}`}>
                        {p.id === hostId ? '👑' : '준비 완료'}
                      </div>
                    </div>
                    {selectedPlayerId === p.id && (
                      <div style={{ marginTop: '10px', textAlign: 'right' }}>
                        <button
                          className="leave-btn"
                          style={{ padding: '4px 8px', fontSize: '12px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleKickPlayer(p.id);
                          }}
                        >
                          강퇴하기
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <div className="invite-section">
              <p style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '10px' }}>
                초대 링크: <span style={{ wordBreak: 'break-all' }}>{`${window.location.origin}/?room=${roomId}`}</span>
              </p>
              <button
                className={`copy-btn ${isCopied ? 'copied' : ''}`}
                onClick={copyInviteLink}
                title="복사"
              >
                <div className="copy-icon-container">
                  <svg className={`copy-icon ${isCopied ? 'hidden' : ''}`} viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                  <svg className={`check-icon ${isCopied ? 'visible' : ''}`} viewBox="0 0 24 24" width="20" height="20" stroke="#00aa00" strokeWidth="3" fill="none">
                    <path className="check-path" d="M20 6L9 17l-5-5"></path>
                  </svg>
                </div>
              </button>
            </div>
          </div>

          <div className="chat-section">
            <div className="chat-messages">
              {messages.map((msg, i) => (
                <div key={i} className={`chat-message ${msg.type === 'system' ? 'system-msg' : (msg.isMe ? 'my-msg' : 'other-msg')}`}>
                  {msg.type === 'system' ? (
                    <span>{msg.text}</span>
                  ) : (
                    <>
                      <span className="sender-name">{msg.senderName}</span>
                      <span className="message-text">{msg.text}</span>
                    </>
                  )}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <form className="chat-input-area" onSubmit={handleSendMessage}>
              <input
                type="text"
                placeholder="메시지를 입력하세요..."
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
              />
              <button type="submit">전송</button>
            </form>
          </div>
        </div>

        <div className="room-footer">
          {isHost ? (
            <button
              className={`action-btn start-btn ${allReady && !isStarting && !(gameMode === 'comp' && players.length < 2) ? 'ready' : 'disabled'}`}
              onClick={startGame}
              disabled={!allReady || isStarting || (gameMode === 'comp' && players.length < 2)}
            >
              {isStarting ? '시작 중...' : (
                gameMode === 'comp' && players.length < 2 
                  ? '경쟁 모드는 2인 이상' 
                  : (allReady ? '게임 시작' : '모두 준비해야 시작 가능')
              )}
            </button>
          ) : (
            <button
              className={`action-btn ready-btn ${players.find(p => p.id === webrtcRef.current?.clientId)?.isReady ? 'is-ready' : ''} ${isStarting ? 'disabled' : ''}`}
              onClick={toggleReady}
              disabled={isStarting}
            >
              {players.find(p => p.id === webrtcRef.current?.clientId)?.isReady ? '준비 취소' : '준비'}
            </button>
          )}
        </div>
      </div>

      {startCountdown !== null && (
        <div className="giant-countdown-overlay">
          <div className="giant-countdown-text">{startCountdown}</div>
        </div>
      )}
    </div>
  );
};

export default Room;
