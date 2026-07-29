// webrtc.js
// Handles Signaling (WebSocket) and P2P (WebRTC DataChannel)
// Hybrid approach: critical game messages sent via BOTH P2P and WS relay for reliability

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
  ],
};

// Max number of recent message IDs to remember for deduplication
const DEDUP_CACHE_SIZE = 200;

export class WebRTCManager {
  constructor(serverUrl, clientName, onMessageCallback, onRoomInfo, onPlayerJoined, onPlayerLeft, onRoomFull, onRoomNotFound, onConnectionError, onPeerConnected) {
    this.serverUrl = serverUrl;
    this.clientName = clientName;
    this.ws = null;
    this.peers = {}; // peerId -> RTCPeerConnection
    this.dataChannels = {}; // peerId -> RTCDataChannel
    this.clientId = Math.random().toString(36).substr(2, 9);
    this.roomId = null;
    
    this.onMessageCallback = onMessageCallback;
    this.onRoomInfo = onRoomInfo;
    this.onPlayerJoined = onPlayerJoined;
    this.onPlayerLeft = onPlayerLeft;
    this.onRoomFull = onRoomFull;
    this.onRoomNotFound = onRoomNotFound;
    this.onConnectionError = onConnectionError;
    this.onPeerConnected = onPeerConnected;
    this.messageQueue = {}; // Queue for messages before channel opens
    this.connectionTimeout = null;

    // Deduplication: track recently seen message IDs
    this._seenMsgIds = new Set();
    this._seenMsgIdsList = []; // ordered list for eviction
    this._msgCounter = 0;
  }

  // Generate a unique message ID for deduplication
  _generateMsgId() {
    return `${this.clientId}_${Date.now()}_${this._msgCounter++}`;
  }

  // Check if we've already processed this message; if not, mark it as seen
  _isDuplicate(msgId) {
    if (!msgId) return false; // No msgId means not a reliable message, always process
    if (this._seenMsgIds.has(msgId)) return true;
    
    this._seenMsgIds.add(msgId);
    this._seenMsgIdsList.push(msgId);
    
    // Evict old entries to prevent memory leak
    while (this._seenMsgIdsList.length > DEDUP_CACHE_SIZE) {
      const old = this._seenMsgIdsList.shift();
      this._seenMsgIds.delete(old);
    }
    return false;
  }

  connect(roomId, isHost = false) {
    this.roomId = roomId;
    this.ws = new WebSocket(`${this.serverUrl}/ws/${roomId}/${this.clientId}?name=${encodeURIComponent(this.clientName)}&isHost=${isHost}`);

    this.connectionTimeout = setTimeout(() => {
      if (this.ws.readyState !== WebSocket.OPEN) {
        console.error('WebSocket connection timeout');
        if (this.onConnectionError) this.onConnectionError();
        this.ws.close();
      }
    }, 15000);

    this.ws.onopen = () => {
      console.log('Connected to signaling server');
      if (this.connectionTimeout) clearTimeout(this.connectionTimeout);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket Error:', error);
      if (this.onConnectionError) this.onConnectionError();
    };

    this.ws.onmessage = async (event) => {
      const message = JSON.parse(event.data);
      await this.handleSignalingMessage(message);
    };

    this.ws.onclose = () => {
      console.log('Disconnected from signaling server');
      if (this.connectionTimeout) clearTimeout(this.connectionTimeout);
    };
  }

  async handleSignalingMessage(message) {
    const { type, sender, clientId, players, sdp, candidate, hostId, newHostId } = message;

    switch (type) {
      case 'room-not-found':
        if (this.onRoomNotFound) this.onRoomNotFound();
        if (this.ws) this.ws.close();
        break;

      case 'room-full':
        if (this.onRoomFull) this.onRoomFull();
        if (this.ws) this.ws.close();
        break;

      case 'room-info':
        if (this.onRoomInfo) this.onRoomInfo(players, hostId);
        players.forEach(p => {
          this.createPeerConnection(p.id, true);
        });
        break;

      case 'player-joined':
        if (this.onPlayerJoined) this.onPlayerJoined(clientId, message.clientName);
        break;

      case 'player-left':
        if (this.peers[clientId]) {
          this.peers[clientId].close();
          delete this.peers[clientId];
          delete this.dataChannels[clientId];
        }
        if (this.onPlayerLeft) this.onPlayerLeft(clientId, newHostId);
        break;

      case 'offer':
        await this.handleOffer(sender, sdp);
        break;

      case 'answer':
        await this.handleAnswer(sender, sdp);
        break;

      case 'ice-candidate':
        await this.handleCandidate(sender, candidate);
        break;

      case 'player-ready':
        if (this.onMessageCallback) {
          this.onMessageCallback(message.clientId, { type: 'PLAYER_READY', isReady: message.isReady });
        }
        break;

      case 'room-chat':
        if (this.onMessageCallback) {
          this.onMessageCallback(message.clientId, { type: 'ROOM_CHAT', senderName: message.senderName, text: message.text });
        }
        break;

      default:
        // Messages relayed via WS server (from broadcastReliable's WS path)
        // Check for deduplication
        if (message._msgId && this._isDuplicate(message._msgId)) {
          // Already received this message via P2P DataChannel, skip
          return;
        }
        if (this.onMessageCallback) {
          this.onMessageCallback(sender || message.clientId, message);
        }
        break;
    }
  }

  sendViaWS(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  createPeerConnection(peerId, isInitiator) {
    const peer = new RTCPeerConnection(ICE_SERVERS);
    this.peers[peerId] = peer;

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        this.ws.send(JSON.stringify({
          type: 'ice-candidate',
          target: peerId,
          candidate: event.candidate
        }));
      }
    };

    // Monitor ICE connection state for debugging
    peer.oniceconnectionstatechange = () => {
      const state = peer.iceConnectionState;
      console.log(`[ICE] Peer ${peerId}: ${state}`);
      if (state === 'failed') {
        console.warn(`[ICE] P2P connection FAILED with ${peerId}. Messages will be relayed via WS server.`);
      }
    };

    if (isInitiator) {
      const dataChannel = peer.createDataChannel('gameData');
      this.setupDataChannel(peerId, dataChannel);
      
      peer.createOffer()
        .then(offer => peer.setLocalDescription(offer))
        .then(() => {
          this.ws.send(JSON.stringify({
            type: 'offer',
            target: peerId,
            sdp: peer.localDescription
          }));
        });
    } else {
      peer.ondatachannel = (event) => {
        this.setupDataChannel(peerId, event.channel);
      };
    }
  }

  setupDataChannel(peerId, dataChannel) {
    this.dataChannels[peerId] = dataChannel;
    if (!this.messageQueue[peerId]) {
      this.messageQueue[peerId] = [];
    }
    
    const flushQueue = () => {
      if (this.messageQueue[peerId] && this.messageQueue[peerId].length > 0) {
        this.messageQueue[peerId].forEach(msg => dataChannel.send(msg));
        this.messageQueue[peerId] = [];
      }
      if (this.onPeerConnected) {
        this.onPeerConnected(peerId);
      }
    };

    if (dataChannel.readyState === 'open') {
      console.log(`DataChannel already open with ${peerId}`);
      flushQueue();
    } else {
      dataChannel.onopen = () => {
        console.log(`DataChannel opened with ${peerId}`);
        flushQueue();
      };
    }

    dataChannel.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      // Check for deduplication (reliable messages have _msgId)
      if (data._msgId && this._isDuplicate(data._msgId)) {
        // Already received this message via WS relay, skip
        return;
      }
      
      if (this.onMessageCallback) {
        this.onMessageCallback(peerId, data);
      }
    };
    
    dataChannel.onclose = () => {
      console.log(`DataChannel closed with ${peerId}`);
    };
  }

  async handleOffer(peerId, sdp) {
    if (!this.peers[peerId]) {
      this.createPeerConnection(peerId, false);
    }
    const peer = this.peers[peerId];
    await peer.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    
    this.ws.send(JSON.stringify({
      type: 'answer',
      target: peerId,
      sdp: peer.localDescription
    }));
  }

  async handleAnswer(peerId, sdp) {
    const peer = this.peers[peerId];
    if (peer) {
      await peer.setRemoteDescription(new RTCSessionDescription(sdp));
    }
  }

  async handleCandidate(peerId, candidate) {
    const peer = this.peers[peerId];
    if (peer) {
      await peer.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }

  sendTo(peerId, message) {
    const data = JSON.stringify(message);
    const channel = this.dataChannels[peerId];
    if (channel && channel.readyState === 'open') {
      channel.send(data);
    } else {
      if (!this.messageQueue[peerId]) this.messageQueue[peerId] = [];
      this.messageQueue[peerId].push(data);
    }
  }

  // Send via P2P DataChannel only (for high-frequency, loss-tolerant messages like cursors)
  broadcast(message) {
    if (message && message.type === 'PLAYER_READY') {
      this.sendViaWS({ type: 'player-ready', isReady: message.isReady });
      return;
    } else if (message && message.type === 'ROOM_CHAT') {
      this.sendViaWS({ type: 'room-chat', text: message.text });
      return;
    }
    const data = JSON.stringify(message);
    Object.keys(this.peers).forEach(peerId => {
      const channel = this.dataChannels[peerId];
      if (channel && channel.readyState === 'open') {
        channel.send(data);
      } else {
        if (!this.messageQueue[peerId]) this.messageQueue[peerId] = [];
        this.messageQueue[peerId].push(data);
      }
    });
  }

  // Send via BOTH P2P DataChannel AND WS server relay (for critical game messages)
  // Includes _msgId for deduplication on the receiving end
  broadcastReliable(message) {
    const msgId = this._generateMsgId();
    const messageWithId = { ...message, _msgId: msgId };
    
    // Mark our own msgId as seen so we don't process the WS echo
    this._isDuplicate(msgId);

    // Path 1: P2P DataChannel (fast, but may fail for some peers)
    const data = JSON.stringify(messageWithId);
    Object.keys(this.peers).forEach(peerId => {
      const channel = this.dataChannels[peerId];
      if (channel && channel.readyState === 'open') {
        try {
          channel.send(data);
        } catch (e) {
          console.warn(`[RELIABLE] P2P send failed to ${peerId}:`, e);
        }
      }
      // Don't queue for reliable messages - WS relay is the fallback
    });

    // Path 2: WS server relay (reliable fallback, works even if P2P fails)
    this.sendViaWS(messageWithId);
  }
}
