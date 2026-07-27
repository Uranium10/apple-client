// webrtc.js
// Handles Signaling (WebSocket) and P2P (WebRTC DataChannel)

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
  ],
};

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

  broadcast(message) {
    if (message && message.type === 'PLAYER_READY') {
      this.sendViaWS({ type: 'player-ready', isReady: message.isReady });
    } else if (message && message.type === 'ROOM_CHAT') {
      this.sendViaWS({ type: 'room-chat', text: message.text });
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
}
