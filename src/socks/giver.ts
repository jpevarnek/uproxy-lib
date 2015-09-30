/// <reference path='../../../third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../../../third_party/typings/freedom/freedom-module-env.d.ts' />

import getter = require('./getter');
import logging = require('../logging/logging');
import middle = require('./middle');
import net = require('../net/net.types');

const log :logging.Log = new logging.Log('giver');

// The giver, i.e. SOCKS proxy itself.
export class Giver implements middle.RemotePeer {
  // Number of instances created, for logging purposes.
  private static id_ = 0;

  // Number of connections made so far, for logging purposes.
  private numConnections_ = 0;

  private getter_: middle.RemotePeer;

  // Do not call this directly.
  // Use the static constructors.
  constructor(
      private name_ :string = 'unnamed-giver-' + Giver.id_) {
    Giver.id_++;
  }

  public handle = (
      client:string,
      buffer:ArrayBuffer) => {
    log.info('%1: received %2 bytes from %3', this.name_, buffer.byteLength, client);
  }

  public disconnected = (client:string) => {
    log.debug('%1: disconnected from %2', this.name_, client);
  }

  // TODO: figure out a way to remove this (it destroys immutability)
  public setGetter = (newGetter:middle.RemotePeer) : void => {
    this.getter_ = newGetter;
  }
}
