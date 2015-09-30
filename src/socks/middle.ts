/// <reference path='../../../third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../../../third_party/typings/freedom/freedom-module-env.d.ts' />

export interface RemotePeer {
  // Call this when data has been received from the remote peer.
  handle(
      client:string,
      buffer:ArrayBuffer) : void;

  // Call this when we've been disconnected from the remote peer, for any reason.
  disconnected(client:string): void;
}
