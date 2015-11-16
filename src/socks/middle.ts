/// <reference path='../../../third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../../../third_party/typings/freedom/freedom-module-env.d.ts' />

export interface RemotePeer {
  // Invoked when a new connection has been made to the remote peer.
  onRemoteConnect(clientId: string): void;

  // Invoked when the remote peer has received data.
  onRemoteData(
      clientId:string,
      buffer:ArrayBuffer) : void;

  // Invoked when the remote peer has been disconnected from the client.
  onRemoteDisconnect(clientId:string): void;
}
