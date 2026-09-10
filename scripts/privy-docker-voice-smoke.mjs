/** Run with docker exec in the API container. Synthetic identity, real DB/LiveKit/worker; no wallet calls. */
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { Room } from '@livekit/rtc-node';
import { RoomServiceClient } from 'livekit-server-sdk';
const key = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const appId = 'nana-docker-voice-smoke';
process.env.PRIVY_APP_ID = appId;
process.env.PRIVY_VERIFICATION_KEY = key.publicKey.export({ type:'spki', format:'pem' });
process.env.AGENT_RUNTIME = 'deterministic';
delete process.env.PRIVY_APP_SECRET;
const { buildServer } = await import('./dist/server.js');
const { createDatabaseClient } = await import('./dist/db/client.js');
const app = buildServer();
const room = new Room();
const database = createDatabaseClient(process.env.DATABASE_URL);
const did = 'did:privy:docker-smoke-' + randomUUID();
let conversationId, userId, roomName;
const assert = (ok, message) => { if(!ok) throw new Error(message); console.log('PASS: ' + message); };
try {
 const token = await new SignJWT({}).setProtectedHeader({alg:'ES256'}).setIssuer('privy.io').setAudience(appId).setSubject(did).setIssuedAt().setExpirationTime('5m').sign(key.privateKey);
 const headers={authorization:'Bearer '+token};
 const denied=await app.inject({method:'POST',url:'/v1/live-bindings',payload:{}});
 assert(denied.statusCode===401,'binding route configured; unauthenticated request is401, not503');
 const me=await app.inject({method:'GET',url:'/v1/me',headers});
 assert(me.statusCode===200,'synthetic Privy-authenticated identity resolves');
 userId=me.json().data.userId;
 const binding=await app.inject({method:'POST',url:'/v1/live-bindings',headers,payload:{}});
 assert(binding.statusCode===200,'authenticated binding request succeeds');
 conversationId=binding.json().conversationId;
 const grant=await app.inject({method:'POST',url:'/v1/voice/room-token',headers,payload:{conversationId}});
 assert(grant.statusCode===200,'owned conversation receives a room token');
 const credentials=grant.json();
 const data=credentials.data??credentials;
 roomName=data.roomName;
 await room.connect(process.env.LIVEKIT_URL,data.participantToken,{autoSubscribe:true});
 assert(true,'RTC client connected to container LiveKit');
 const deadline=Date.now()+60000;
 let agent;
 while(Date.now()<deadline) {
   agent=[...room.remoteParticipants.values()].find(p=>p.identity!==userId);
   if(agent) break;
   await new Promise(r=>setTimeout(r,500));
 }
 assert(Boolean(agent),'named worker dispatched and joined room');
 const result=await room.localParticipant.performRpc({destinationIdentity:agent.identity,method:'bind_conversation',payload:JSON.stringify({bindingToken:binding.json().bindingToken}),responseTimeout:30000});
 const accepted=JSON.parse(result);
 assert(accepted.ok===true,'worker accepted signed conversation binding');
 await new Promise(r=>setTimeout(r,3000));
 assert(room.remoteParticipants.has(agent.identity),'worker remains connected after session startup');
 console.log('VOICE_SMOKE_PASS (no microphone audio or transfers sent)');
} catch(error) {
 console.error('VOICE_SMOKE_FAIL: '+(error instanceof Error?error.message:'unknown error'));
 process.exitCode=1;
} finally {
 await room.disconnect().catch(()=>{});
 if(roomName) await new RoomServiceClient(process.env.LIVEKIT_URL.replace('ws:','http:'),process.env.LIVEKIT_API_KEY,process.env.LIVEKIT_API_SECRET).deleteRoom(roomName).catch(()=>{});
 // Keep scoped smoke records for diagnostics; no user data is deleted.
 await app.close(); await database.close();
}

process.exit(process.exitCode ?? 0);
