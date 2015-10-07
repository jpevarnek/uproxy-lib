/// <reference path='../../../third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../../../third_party/typings/freedom/freedom-module-env.d.ts' />

import getter = require('./getter');
import headers = require('../socks-common/socks-headers');
import logging = require('../logging/logging');
import middle = require('./middle');
import net = require('../net/net.types');

const log :logging.Log = new logging.Log('giver');

// The giver, i.e. SOCKS proxy itself.
export class Giver implements middle.RemotePeer {
  // Number of instances created, for logging purposes.
  private static id_ = 0;

  private getter_: middle.RemotePeer;

  // Keyed by client ID.
  private sessions_:{[id:string]: Session} = {};

  // Do not call this directly.
  // Use the static constructors.
  constructor(
      private name_ :string = 'unnamed-giver-' + Giver.id_) {
    Giver.id_++;
  }

  public handle = (
      client:string,
      buffer:ArrayBuffer) => {
    log.debug('%1: received %2 bytes from %3', this.name_, buffer.byteLength, client);

    // TODO: could bytes arrive after disconnection?
    if (!(client in this.sessions_)) {
      log.info('%1: new client %2', this.name_, client);
      this.sessions_[client] = new Session(client, (buffer:ArrayBuffer) => {
        this.getter_.handle(client, buffer);
      }, () => {
        this.getter_.disconnected(client);
      });
    }
    var session = this.sessions_[client];
    session.handle(buffer);
  }

  public disconnected = (client:string) => {
    log.debug('%1: disconnected from %2', this.name_, client);
    delete this.sessions_[client];
  }

  // TODO: figure out a way to remove this (it destroys immutability)
  public setGetter = (newGetter:middle.RemotePeer) : void => {
    this.getter_ = newGetter;
  }
}

enum State {
  AWAITING_AUTHS,
  AWAITING_REQUEST
}

class Session {
  private state_ = State.AWAITING_AUTHS;

  constructor(
      private id_:string,
      private send_:(buffer:ArrayBuffer) => void,
      private disconnected_:() => void) {}

  public handle = (buffer:ArrayBuffer) => {
    switch (this.state_) {
      case State.AWAITING_AUTHS:
        try {
          headers.interpretAuthHandshakeBuffer(buffer);
          this.send_(headers.composeAuthResponse(headers.Auth.NOAUTH));
          this.state_ = State.AWAITING_REQUEST;
        } catch (e) {
          log.warn('could not accept auths: %1', e.message);
          this.disconnected_();
        }
        break;
      case State.AWAITING_REQUEST:
        log.error('processing request not implemented');
        this.disconnected_();
        break;
    }
  }
}
