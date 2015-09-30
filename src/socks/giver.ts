/// <reference path='../../../third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../../../third_party/typings/freedom/freedom-module-env.d.ts' />

import getter = require('./getter');
import logging = require('../logging/logging');
import net = require('../net/net.types');

const log :logging.Log = new logging.Log('giver');

// The giver, i.e. SOCKS proxy itself.
// TODO: extract an interface common to this and a WebRTC intermediary
export class Giver {
  // Number of instances created, for logging purposes.
  private static id_ = 0;

  // Number of connections made so far, for logging purposes.
  private numConnections_ = 0;

  private getter_: getter.Getter;

  // Do not call this directly.
  // Use the static constructors.
  constructor(
      private name_ :string = 'unnamed-giver-' + Giver.id_) {
    Giver.id_++;
  }

  // Call this when data has been received from a SOCKS client.
  public handle = (
      client:net.Endpoint,
      buffer:ArrayBuffer) => {
    log.info('%1: received %2 bytes from %3', this.name_, buffer.byteLength, client);
  }

  // Call this when the SOCKS client has disconnected, for any reason.
  public disconnected = (client:net.Endpoint) => {
    log.debug('%1: disconnected from %2', this.name_, client);
  }

  // TODO: figure out a way to remove this (it destroys immutability)
  public setGetter = (newGetter:getter.Getter) : void => {
    this.getter_ = newGetter;
  }
}
