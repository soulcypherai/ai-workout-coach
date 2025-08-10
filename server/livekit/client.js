import { AccessToken } from 'livekit-server-sdk';

export async function generateLiveKitToken(roomName, participantName) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error('LiveKit API key and secret must be provided');
  }

  const token = new AccessToken(apiKey, apiSecret, {
    identity: participantName,
    name: participantName,
  });

  // Grant permissions for the participant
  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return await token.toJwt();
}

export function createRoomName(userId, avatarId) {
  return `room_${userId}_${avatarId}_${Date.now()}`;
}