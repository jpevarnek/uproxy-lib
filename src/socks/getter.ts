/// <reference path='../../../third_party/typings/es6-promise/es6-promise.d.ts' />
/// <reference path='../../../third_party/typings/freedom/freedom-module-env.d.ts' />

import logging = require('../logging/logging');
import middle = require('./middle');
import net = require('../net/net.types');

const log :logging.Log = new logging.Log('getter');

////////
// Static constructors.
////////

export function fromEndpoint(
    endpoint:net.Endpoint,
    name?:string)
    :Promise<Getter> {
  var getter = new Getter(freedom['core.tcpsocket'](), endpoint, name);
  return getter.listen().then(() => {
    return getter;
  });
}

////////
// The class itself.
////////

// The getter, i.e. TCP-speaking, side of the SOCKS proxy.
export class Getter implements middle.RemotePeer {
  // Number of instances created, for logging purposes.
  private static id_ = 0;

  private giver_: middle.RemotePeer;

  // Keyed by client ID.
  private connections_:{[id:string]:Session} = {};

  // Do not call this directly.
  // Use the static constructors instead.
  constructor(
      private socket_: freedom.TcpSocket.Socket,
      private requestedEndpoint_: net.Endpoint,
      private name_ :string = 'unnamed-getter-' + Getter.id_) {
    Getter.id_++;

    this.socket_.on('onConnection', this.onConnection_);
    this.socket_.on('onDisconnect', this.onDisconnect_);
  }

  // Do not call this directly.
  // Use the static constructors.
  public listen = () : Promise<void> => {
    return this.socket_.listen(
        this.requestedEndpoint_.address,
        this.requestedEndpoint_.port);
  }

  private onConnection_ = (
      connectInfo:freedom.TcpSocket.ConnectInfo) : void => {
    var clientId = connectInfo.host + ':' + connectInfo.port;
    log.info('%1: new socket from %2', this.name_, clientId);

    var connection :freedom.TcpSocket.Socket =
        freedom['core.tcpsocket'](connectInfo.socket);

    this.connections_[clientId] = new Session(this.name_, clientId, connection, (buffer: ArrayBuffer) => {
      this.giver_.handle(clientId, buffer);
    }, () => {
      this.giver_.disconnected(clientId);
    });

    this.giver_.connected(clientId);
  }

  public handle = (
      clientId:string,
      buffer:ArrayBuffer) => {
    if (clientId in this.connections_) {
      this.connections_[clientId].handle(buffer);
    } else {
      log.warn('%1: remote peer sent data for unknown client %2', this.name_, clientId);
    }
  }

  public disconnected = (clientId:string) => {
    if (clientId in this.connections_) {
      log.debug('%1: remote peer disconnected from %2', this.name_, clientId);
      this.connections_[clientId].disconnected();
    } else {
      log.warn('%1: remote peer disconnected from unknown client %2', this.name_, clientId);
    }
  }

  private onDisconnect_ = (info:freedom.TcpSocket.DisconnectInfo): void => {
    log.error('%1: server socket closed!', this.name_);
    // TODO: cleanup (this should almost never happen)
  }

  // TODO: figure out a way to remove this (it destroys immutability)
  public setGiver = (newGiver:middle.RemotePeer) : void => {
    this.giver_ = newGiver;
  }

  public connected = (client:string) => {
    throw new Error('unimplemented');
  }
}

class Session {
  constructor(
      private getterId_: string,
      private id_: string,
      private socket_: freedom.TcpSocket.Socket,
      private send_: (buffer: ArrayBuffer) => void,
      private disconnected_: () => void) {
    this.socket_.on('onData', this.onData_);

    this.socket_.on('onDisconnect', (info: freedom.TcpSocket.DisconnectInfo) => {
      log.info('%1/%2: disconnected', this.getterId_, this.id_);
      // TODO: use counter, to guard against early onDisconnect notifications
      freedom['core.tcpsocket'].close(this.socket_);
      this.disconnected_();
    });
  }

  private onData_ = (info: freedom.TcpSocket.ReadInfo) => {
    this.send_(info.data);
  }

  public handle = (buffer: ArrayBuffer) => {
    // TODO: be reckless
    this.socket_.write(buffer);
  }

  public disconnected = () => {
    this.socket_.off('onData', this.onData_);
    this.socket_.close();
  }
}
